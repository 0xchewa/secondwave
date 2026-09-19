// Adapted from kingwilliamAI/Augur@384232d598789124427b7ad4fbfb9614a3a69ec8.
// Copyright (c) 2026 Augur contributors. MIT; see THIRD_PARTY_NOTICES.md.
import type { FeatureName } from './features.js';
import { FEATURES } from './features.js';
import { contributions, type GbdtModel } from './gbdt.js';

/**
 * Turns the model's per-feature contributions into the three lines shown under a score.
 *
 * The phrasing states the observed fact and the direction, never a recommendation. A reason is only
 * shown if the model actually used it for this launch, so a card never explains a score with
 * something that did not move it.
 *
 * Each reason carries two phrasings of the same fact. The card has a column to itself and gets the
 * sentence; a row in the feed has about a fifth of one and gets the label. Truncating the sentence
 * with CSS produced "graduation needs 4.20 of the quo…" three times over — three chips that looked
 * different, said nothing, and were indistinguishable from one another at a glance.
 */
export type Reason = {
  text: string;
  short: string;
  direction: 'up' | 'down';
  weight: number;
  feature: FeatureName;
};

/** Full sentence, then the label. Returning null suppresses a reason that would read as noise. */
type Phrase = (v: number) => [text: string, short: string] | null;

const amountOf = (v: number): string => {
  const a = Math.expm1(v) / 1000;
  return a < 0.01 ? a.toFixed(4) : a < 1000 ? a.toFixed(3) : Math.round(a).toLocaleString();
};

const PHRASE: Record<FeatureName, Phrase> = {
  calldata_decoded: (v) =>
    v === 0
      ? [
          'supported launch declarations could not be decoded',
          'terms unreadable',
        ]
      : null,
  exempt_count: (v) =>
    v > 0
      ? [`creator waived the opening tax for ${v} wallet${v === 1 ? '' : 's'}`, `${v} tax-exempt`]
      : null,
  exempt_is_zero: (v) =>
    v === 1 ? ['no wallets were exempted from the opening tax', '0 tax-exempt'] : null,
  // The amount is in the launch's own quote asset, which is ETH for barely half of launches and a
  // tokenised stock or a stablecoin for the rest. Naming ETH here printed "0.0000 ETH" next to a
  // card that correctly read "1429.7496 USDG"; the unit is left to the card, which knows it.
  log_initial_buy: (v) => {
    if (Math.expm1(v) / 1000 <= 0) return null;
    return [
      `launch transaction declared a buy of ${amountOf(v)} in its quote asset; recipient can differ from sender`,
      `launch buy ${amountOf(v)}`,
    ];
  },
  initial_buy_is_zero: (v) =>
    v === 1 ? ['launch transaction declared zero initial buy', 'zero launch buy'] : null,
  creator_tax_bps: (v) =>
    v > 0
      ? [`creator set a ${(v / 100).toFixed(2)}% ongoing tax`, `tax ${(v / 100).toFixed(2)}%`]
      : ['creator set no ongoing tax', 'no tax'],
  buyback_enabled: (v) => (v === 1 ? ['buyback is enabled', 'buyback on'] : null),
  socials_count: (v) =>
    v === 0
      ? ['no social links declared', 'no socials']
      : [`${v} social link${v === 1 ? '' : 's'} declared`, `${v} social${v === 1 ? '' : 's'}`],
  has_twitter: (v) => (v === 1 ? ['an X account is linked', 'X linked'] : null),
  has_website: (v) => (v === 1 ? ['a website is linked', 'site linked'] : null),
  fee_redirected: (v) =>
    v === 1
      ? ['creator fees are routed to a different wallet than the launcher', 'fees redirected']
      : null,
  via_contract: (v) =>
    v === 1 ? ['transaction sender differs from factory caller', 'via intermediary'] : null,
  is_eth_quoted: (v) =>
    v === 1 ? ['quoted in ETH', 'ETH-quoted'] : ['quoted in a token, not ETH', 'token-quoted'],
  /**
   * Not shown, though the model still uses it. The graduation threshold is a property of the quote
   * asset, not of the launch: every ETH-quoted launch needs the same 4.20, so the chip read "needs
   * 4.20" on row after row and pushed out a reason that actually distinguished one launch from the
   * next. It separates quote assets, which `is_eth_quoted` already says in words.
   */
  log_threshold: () => null,
  desc_len: (v) => (v === 0 ? ['no description', 'no description'] : null),
  symbol_len: () => null,
  dev_prior_launches: (v) =>
    v > 0
      ? [`this transaction sender launched ${v} tokens in the preceding covered hour`, `sender: ${v}/h`]
      : null,
  dev_prior_graduations: (v) =>
    v > 0 ? [`${v} of this sender's preceding-hour launches already migrated at this block/log`, `sender: ${v} pooled`] : null,
  dev_prior_grad_rate: (v) =>
    v > 0
      ? [
          `${(100 * v).toFixed(0)}% of this sender's preceding-hour launches had migrated by this launch`,
          `prior-hour ${(100 * v).toFixed(0)}%`,
        ]
      : null,
  dev_is_first_launch: (v) => (v === 1 ? ['no earlier launch by this sender in the covered preceding hour', '0 prior-hour launches'] : null),
  exempt_seen_before: (v) =>
    v > 0
      ? [
          `${v} exempted wallet${v === 1 ? ' has' : 's have'} appeared in earlier launches`,
          `${v} exempt seen before`,
        ]
      : null,
  hour_utc: () => null,
  launches_prior_hour: (v) =>
    v > 400 ? [`busy hour: ${v} launches in the last 60 minutes`, `busy: ${v}/h`] : null,
};

export function explain(model: GbdtModel, x: Float64Array, limit = 3): Reason[] {
  const { contribs } = contributions(model, x);
  const out: Reason[] = [];
  for (let i = 0; i < FEATURES.length; i++) {
    // Missing declarations must not be phrased as observed absence of tax/socials.
    if(x[0]===0 && ((i>=1&&i<=10)||i===14||i===15))continue;
    const w = contribs[i];
    if (Math.abs(w) < 0.01) continue;
    const phrased = PHRASE[FEATURES[i]](x[i]);
    if (!phrased) continue;
    const [text, short] = phrased;
    out.push({ text, short, direction: w > 0 ? 'up' : 'down', weight: w, feature: FEATURES[i] });
  }
  return out.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, limit);
}
