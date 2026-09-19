/** One regularized sigmoid fit. Sum logistic loss + lambda*a²/2; no class weights. */
export const sigmoid = (z: number) =>
  z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
export function fitSigmoid(rows: { z: number; y: number }[], lambda = 1) {
  if (!rows.length || !rows.every((r) => Number.isFinite(r.z) && (r.y === 0 || r.y === 1)))
    throw new Error('Invalid calibration rows');
  const positives = rows.reduce((n, r) => n + r.y, 0);
  if (!positives || positives === rows.length)
    throw new Error('Calibration requires both outcomes');
  let a = 1,
    b = 0;
  const loss = (aa: number, bb: number) =>
    rows.reduce(
      (s, r) => {
        const z = aa * r.z + bb;
        return s + Math.max(z, 0) + Math.log1p(Math.exp(-Math.abs(z))) - r.y * z;
      },
      (lambda * aa * aa) / 2,
    );
  for (let i = 0; i < 80; i++) {
    let ga = lambda * a,
      gb = 0,
      haa = lambda + 1e-9,
      hab = 0,
      hbb = 1e-9;
    for (const r of rows) {
      const p = sigmoid(a * r.z + b),
        d = p - r.y,
        h = p * (1 - p);
      ga += d * r.z;
      gb += d;
      haa += h * r.z * r.z;
      hab += h * r.z;
      hbb += h;
    }
    const det = haa * hbb - hab * hab;
    if (!(det > 0)) throw new Error('Singular calibration Hessian');
    const da = (hbb * ga - hab * gb) / det,
      db = (haa * gb - hab * ga) / det;
    if (Math.max(Math.abs(da), Math.abs(db)) < 1e-9) break;
    const before = loss(a, b);
    let step = 1;
    while (step > 1e-8 && loss(a - step * da, b - step * db) > before) step /= 2;
    if (step <= 1e-8) break;
    a -= step * da;
    b -= step * db;
  }
  if (![a, b].every(Number.isFinite)) throw new Error('Nonfinite calibration');
  return { a, b };
}
export function properScores(rows: { p: number; y: number }[], baseline: number) {
  const mean = (f: (r: { p: number; y: number }) => number) =>
    rows.length ? rows.reduce((s, r) => s + f(r), 0) / rows.length : null;
  const logloss = (p: number, y: number) =>
    -y * Math.log(Math.max(1e-15, p)) - (1 - y) * Math.log(Math.max(1e-15, 1 - p));
  return {
    brier: mean((r) => (r.p - r.y) ** 2),
    logLoss: mean((r) => logloss(r.p, r.y)),
    trainBaselineProbability: baseline,
    trainBaselineBrier: mean((r) => (baseline - r.y) ** 2),
    trainBaselineLogLoss: mean((r) => logloss(baseline, r.y)),
    meanPrediction: mean((r) => r.p),
    observedRate: mean((r) => r.y),
  };
}
