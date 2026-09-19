// Adapted from kingwilliamAI/Augur@384232d598789124427b7ad4fbfb9614a3a69ec8.
// Copyright (c) 2026 Augur contributors. MIT; see THIRD_PARTY_NOTICES.md.
export const FEATURES = [
  'calldata_decoded',
  'exempt_count',
  'exempt_is_zero',
  'log_initial_buy',
  'initial_buy_is_zero',
  'creator_tax_bps',
  'buyback_enabled',
  'socials_count',
  'has_twitter',
  'has_website',
  'fee_redirected',
  'via_contract',
  'is_eth_quoted',
  'log_threshold',
  'desc_len',
  'symbol_len',
  'dev_prior_launches',
  'dev_prior_graduations',
  'dev_prior_grad_rate',
  'dev_is_first_launch',
  'exempt_seen_before',
  'hour_utc',
  'launches_prior_hour',
] as const;

/**
 * Name-cluster counts are deliberately NOT features, despite looking like the strongest signal in
 * the data. Measured over a 9-hour window: a ticker already launched 30+ times graduates at 3.17x
 * the base rate, and one whose earlier copies already reached the pool at 3.35x.
 *
 * Adding them to the model made it worse. On the rows where a ticker is actually readable, held-out
 * ROC fell from 0.744 to 0.724 and top-decile lift from 4.19x to 3.87x across five folds. The
 * information is real but already carried by creator history and launch congestion, so five
 * correlated columns bought variance and nothing else.
 *
 * The counts stay in the product as facts on the card (see `clusterInfo` in card.ts), where a human
 * reading "this ticker has launched 30 times, two reached the pool" is genuinely better informed.
 */

export type FeatureName = (typeof FEATURES)[number];
export type Row = { token: string; ts: number; block: number; label: 0 | 1; x: Float64Array };

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const log1p = (v: number): number => Math.log1p(Math.max(0, v));

/**
 * Collapses a ticker or name to a comparison key: case, spacing, punctuation and emoji all vary
 * between a token and the copies that chase it, and none of that variation is meaningful.
 */
export const normaliseName = (s: string | null): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');

export type LaunchRow = {
  token: string;
  deployer: string;
  launch_sender: string | null;
  pair_token: string;
  graduation_threshold_wei: string;
  block: number;
  ts: number;
  creator_fee_recipient: string | null;
  creator_tax_bps: number | null;
  buyback_enabled: number | null;
  initial_buy_wei: string | null;
  quote_decimals: number | null;
  exempt_count: number | null;
  /** Only lengths are ever features, so the text itself never leaves SQLite. On 170,000 launches
   *  pulling full descriptions costs more than every other column put together. */
  symbol_len: number;
  desc_len: number;
  socials_json: string | null;
  grad_ts: number | null;
};

/** The columns needed to carry history forward, for launches that will not become rows themselves. */
export type History = { priorL: number; priorG: number; overlap: number; recentCount: number };

/**
 * One launch's feature vector.
 *
 * Pulled out so the full build and the incremental one cannot drift: they compute a row by calling
 * this, rather than by each carrying a copy of the same twenty-three assignments.
 */
export function featureRow(r: LaunchRow, h: History, horizon: number): Row {
  const socials = (() => {
    try {
      return JSON.parse(r.socials_json ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  })();
  const socialVals = Object.values(socials).filter((v) => typeof v === 'string' && v.length > 3);

  // Roughly half of launches do not go through the router, so their calldata cannot be decoded and
  // the creator's declared intent is simply unknown. Folding that into "bought nothing" and
  // "exempted nobody" would poison the two strongest signals, so absence is its own feature and
  // the derived flags only fire when the value was actually observed.
  // Amounts must be scaled by the quote asset's own decimals, not by 1e18. Nearly half of launches
  // are quoted in a token rather than ETH, and USDG uses six decimals where NVDA uses eighteen:
  // dividing both by 1e18 makes two economically identical self-buys differ by a factor of a
  // trillion, inside the feature the model leans on third-hardest.
  const dec = r.pair_token === ZERO_ADDR ? 18 : (r.quote_decimals ?? 18);
  const scale = 10 ** dec;
  const decoded = r.initial_buy_wei !== null;
  const buy = decoded ? Number(r.initial_buy_wei) / scale : 0;
  const threshold = Number(r.graduation_threshold_wei) / scale;

  const x = new Float64Array(FEATURES.length);
  let i = 0;
  x[i++] = decoded ? 1 : 0;
  x[i++] = r.exempt_count ?? 0;
  x[i++] = decoded && (r.exempt_count ?? 0) === 0 ? 1 : 0;
  x[i++] = decoded ? log1p(buy * 1000) : 0;
  x[i++] = decoded && buy === 0 ? 1 : 0;
  x[i++] = r.creator_tax_bps ?? 0;
  x[i++] = r.buyback_enabled ?? 0;
  x[i++] = socialVals.length;
  x[i++] = socials.twitter && socials.twitter.length > 3 ? 1 : 0;
  x[i++] = socials.website && socials.website.length > 3 ? 1 : 0;
  x[i++] =
    r.creator_fee_recipient && r.launch_sender && r.creator_fee_recipient !== r.launch_sender
      ? 1
      : 0;
  x[i++] = r.launch_sender && r.launch_sender !== r.deployer ? 1 : 0;
  x[i++] = r.pair_token === ZERO_ADDR ? 1 : 0;
  x[i++] = log1p(threshold);
  x[i++] = Math.min(500, r.desc_len);
  x[i++] = r.symbol_len;
  x[i++] = h.priorL;
  x[i++] = h.priorG;
  x[i++] = h.priorL > 0 ? h.priorG / h.priorL : 0;
  x[i++] = h.priorL === 0 ? 1 : 0;
  x[i++] = h.overlap;
  x[i++] = new Date(r.ts * 1000).getUTCHours();
  x[i++] = h.recentCount;

  // A launch only counts as a settled negative once the horizon has elapsed; unresolved recent
  // launches are dropped by the caller via `ts`, so no right-censored row is mislabelled here.
  const label: 0 | 1 = r.grad_ts !== null && r.grad_ts - r.ts <= horizon ? 1 : 0;
  return { token: r.token, ts: r.ts, block: r.block, label, x };
}
