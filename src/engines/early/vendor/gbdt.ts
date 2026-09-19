// Adapted from kingwilliamAI/Augur@384232d598789124427b7ad4fbfb9614a3a69ec8.
// Copyright (c) 2026 Augur contributors. MIT; see THIRD_PARTY_NOTICES.md.
/**
 * Gradient-boosted decision trees, Newton style (gradient + hessian), for binary logistic loss.
 *
 * Written out rather than pulled in so the whole tool stays one runtime: a trader clones the repo,
 * runs npm install, and nightly retraining works with no Python and no native build. The scale this
 * needs to handle is tens of thousands of rows and a couple of dozen features, which histogram-based
 * boosting does comfortably in a second or two.
 *
 * Trees also give the product its explanation for free: walking a row down each tree and attributing
 * the change in prediction at every split to that split's feature yields per-feature contributions,
 * which is where the three reasons on a card come from.
 */

/**
 * Which loss the boosting minimises.
 *
 * `logistic` answers "will this happen" and its raw score is a log-odds, so it passes through a
 * sigmoid and Platt scaling. `squared` answers "how much", and its raw score is already the
 * prediction — running that through a sigmoid would squash a peak multiple into a probability.
 */
export type Objective = 'logistic' | 'squared';

export type GbdtParams = {
  objective: Objective;
  rounds: number;
  learningRate: number;
  maxDepth: number;
  minChildHessian: number;
  lambda: number;
  maxBins: number;
  subsample: number;
  colsample: number;
  seed: number;
};

export const DEFAULT_PARAMS: GbdtParams = {
  objective: 'logistic',
  rounds: 300,
  learningRate: 0.06,
  maxDepth: 4,
  minChildHessian: 12,
  lambda: 1,
  maxBins: 32,
  subsample: 0.85,
  colsample: 0.85,
  seed: 42,
};

/** `cover` is the training weight that reached the node; it makes explanations coverage-weighted. */
type TreeNode =
  | { leaf: true; value: number; cover: number }
  | {
      leaf: false;
      feature: number;
      threshold: number;
      cover: number;
      left: TreeNode;
      right: TreeNode;
    };

export type GbdtModel = {
  objective: Objective;
  base: number;
  learningRate: number;
  trees: TreeNode[];
  featureNames: string[];
  /** Platt scaling fitted on held-out rows so a reported 6% means roughly six in a hundred. */
  calibration: { a: number; b: number } | null;
};

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** Deterministic PRNG: nightly retraining on the same data must produce the same model. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quantile bin edges per feature; constant features get no edges and are never split on. */
function binEdges(X: Float64Array[], featureCount: number, maxBins: number): number[][] {
  const edges: number[][] = [];
  for (let f = 0; f < featureCount; f++) {
    const vals = X.map((r) => r[f]).sort((a, b) => a - b);
    const uniq: number[] = [];
    for (const v of vals) if (uniq.length === 0 || uniq[uniq.length - 1] !== v) uniq.push(v);
    if (uniq.length <= 1) {
      edges.push([]);
      continue;
    }
    if (uniq.length <= maxBins) {
      edges.push(uniq.slice(0, -1).map((v, i) => (v + uniq[i + 1]) / 2));
      continue;
    }
    const e: number[] = [];
    for (let k = 1; k < maxBins; k++) {
      const v = vals[Math.floor((k / maxBins) * (vals.length - 1))];
      if (e.length === 0 || e[e.length - 1] !== v) e.push(v);
    }
    edges.push(e);
  }
  return edges;
}

const leafValue = (g: number, h: number, lambda: number): number => -g / (h + lambda);
const gain = (g: number, h: number, lambda: number): number => (g * g) / (h + lambda);

function buildTree(
  X: Float64Array[],
  grad: Float64Array,
  hess: Float64Array,
  idx: number[],
  edges: number[][],
  cols: number[],
  depth: number,
  p: GbdtParams,
): TreeNode {
  let G = 0;
  let H = 0;
  for (const i of idx) {
    G += grad[i];
    H += hess[i];
  }

  if (depth >= p.maxDepth || idx.length < 2 || H < 2 * p.minChildHessian) {
    return { leaf: true, value: leafValue(G, H, p.lambda), cover: idx.length };
  }

  const parent = gain(G, H, p.lambda);
  let best: { f: number; thr: number; score: number } | null = null;

  for (const f of cols) {
    const e = edges[f];
    if (e.length === 0) continue;
    const gb = new Float64Array(e.length + 1);
    const hb = new Float64Array(e.length + 1);
    for (const i of idx) {
      const v = X[i][f];
      // Bin index by binary search over edges.
      let lo = 0;
      let hi = e.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (v <= e[m]) hi = m;
        else lo = m + 1;
      }
      gb[lo] += grad[i];
      hb[lo] += hess[i];
    }
    let gl = 0;
    let hl = 0;
    for (let b = 0; b < e.length; b++) {
      gl += gb[b];
      hl += hb[b];
      const gr = G - gl;
      const hr = H - hl;
      if (hl < p.minChildHessian || hr < p.minChildHessian) continue;
      const score = gain(gl, hl, p.lambda) + gain(gr, hr, p.lambda) - parent;
      if (score > 1e-9 && (best === null || score > best.score)) best = { f, thr: e[b], score };
    }
  }

  if (!best) return { leaf: true, value: leafValue(G, H, p.lambda), cover: idx.length };

  const left: number[] = [];
  const right: number[] = [];
  for (const i of idx) (X[i][best.f] <= best.thr ? left : right).push(i);
  if (left.length === 0 || right.length === 0) {
    return { leaf: true, value: leafValue(G, H, p.lambda), cover: idx.length };
  }

  return {
    leaf: false,
    feature: best.f,
    threshold: best.thr,
    cover: idx.length,
    left: buildTree(X, grad, hess, left, edges, cols, depth + 1, p),
    right: buildTree(X, grad, hess, right, edges, cols, depth + 1, p),
  };
}

const walk = (node: TreeNode, x: Float64Array): number =>
  node.leaf ? node.value : walk(x[node.feature] <= node.threshold ? node.left : node.right, x);

export function rawScore(model: GbdtModel, x: Float64Array): number {
  let z = model.base;
  for (const t of model.trees) z += model.learningRate * walk(t, x);
  return z;
}

/**
 * The model's answer for one row: a calibrated probability under logistic loss, and the predicted
 * value itself under squared loss, where a sigmoid would be nonsense.
 */
export function predict(model: GbdtModel, x: Float64Array): number {
  const z = rawScore(model, x);
  if (model.objective === 'squared') return z;
  if (!model.calibration) return sigmoid(z);
  return sigmoid(model.calibration.a * z + model.calibration.b);
}

export function train(
  X: Float64Array[],
  y: ArrayLike<number>,
  featureNames: string[],
  params: Partial<GbdtParams> = {},
): GbdtModel {
  const p = { ...DEFAULT_PARAMS, ...params };
  const n = X.length;
  const nf = featureNames.length;
  const rand = mulberry32(p.seed);
  const squared = p.objective === 'squared';

  let sum = 0;
  for (let i = 0; i < n; i++) sum += y[i];
  // Logistic starts from the log-odds of the positive class; squared starts from the mean, so the
  // first tree corrects a residual rather than the whole magnitude.
  const rate = Math.min(1 - 1e-6, Math.max(1e-6, sum / n));
  const base = squared ? sum / n : Math.log(rate / (1 - rate));

  const edges = binEdges(X, nf, p.maxBins);
  const z = new Float64Array(n).fill(base);
  const grad = new Float64Array(n);
  const hess = new Float64Array(n);
  const trees: TreeNode[] = [];

  for (let r = 0; r < p.rounds; r++) {
    for (let i = 0; i < n; i++) {
      if (squared) {
        grad[i] = z[i] - y[i];
        hess[i] = 1;
        continue;
      }
      const pr = sigmoid(z[i]);
      grad[i] = pr - y[i];
      hess[i] = Math.max(1e-6, pr * (1 - pr));
    }
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (p.subsample >= 1 || rand() < p.subsample) idx.push(i);
    if (idx.length < 8) continue;

    const cols: number[] = [];
    for (let f = 0; f < nf; f++) if (p.colsample >= 1 || rand() < p.colsample) cols.push(f);
    if (cols.length === 0) cols.push(Math.floor(rand() * nf));

    const tree = buildTree(X, grad, hess, idx, edges, cols, 0, p);
    trees.push(tree);
    for (let i = 0; i < n; i++) z[i] += p.learningRate * walk(tree, X[i]);
  }

  return {
    objective: p.objective,
    base,
    learningRate: p.learningRate,
    trees,
    featureNames,
    calibration: null,
  };
}

/** Platt scaling on held-out rows. Fitted by Newton steps on the logistic likelihood. */
export function calibrate(model: GbdtModel, X: Float64Array[], y: Uint8Array): void {
  const zs = X.map((x) => rawScore(model, x));
  let a = 1;
  let b = 0;
  for (let it = 0; it < 60; it++) {
    let g0 = 0,
      g1 = 0,
      h00 = 0,
      h01 = 0,
      h11 = 0;
    for (let i = 0; i < zs.length; i++) {
      const pr = sigmoid(a * zs[i] + b);
      const d = pr - y[i];
      const w = Math.max(1e-9, pr * (1 - pr));
      g0 += d * zs[i];
      g1 += d;
      h00 += w * zs[i] * zs[i];
      h01 += w * zs[i];
      h11 += w;
    }
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-12) break;
    const da = (g0 * h11 - g1 * h01) / det;
    const db = (g1 * h00 - g0 * h01) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) < 1e-9 && Math.abs(db) < 1e-9) break;
  }
  model.calibration = { a, b };
}

/**
 * Per-feature contribution to this row's score, in logit units.
 *
 * At every split on the path, the difference between the chosen child's coverage-weighted mean and
 * the current node's is credited to the feature that was split on. The decomposition is exact:
 * `expected + sum(contributions) === rawScore(model, x)`, so a card can state what pushed a score up
 * or down without the numbers quietly failing to add up. `expected` is the score an average launch
 * would get, which is the honest reference point for "this one is unusual because...".
 */
export function contributions(
  model: GbdtModel,
  x: Float64Array,
): { expected: number; contribs: Float64Array } {
  const contribs = new Float64Array(model.featureNames.length);

  const mean = (node: TreeNode): number => {
    if (node.leaf) return node.value;
    const l = node.left;
    const r = node.right;
    const total = l.cover + r.cover;
    return total === 0 ? 0 : (mean(l) * l.cover + mean(r) * r.cover) / total;
  };

  let expected = model.base;
  for (const tree of model.trees) {
    let node = tree;
    let current = mean(node);
    expected += model.learningRate * current;
    while (!node.leaf) {
      const next = x[node.feature] <= node.threshold ? node.left : node.right;
      const nextMean = mean(next);
      contribs[node.feature] += model.learningRate * (nextMean - current);
      current = nextMean;
      node = next;
    }
  }
  return { expected, contribs };
}

export const serialize = (m: GbdtModel): string => JSON.stringify(m);
export const deserialize = (s: string): GbdtModel => JSON.parse(s) as GbdtModel;
