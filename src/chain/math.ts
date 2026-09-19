import { formatUnits } from 'viem';
/** Integer arithmetic throughout; decimal strings are rounded down to 36 places. */
export function ratio(numerator: bigint, denominator: bigint, places = 36): string | null {
  if (denominator <= 0n || numerator < 0n) return null;
  return formatUnits((numerator * 10n ** BigInt(places)) / denominator, places);
}
export function tradePrice(
  quote: bigint,
  tokens: bigint,
  quoteDecimals: number,
  tokenDecimals: number,
) {
  return ratio(quote * 10n ** BigInt(tokenDecimals), tokens * 10n ** BigInt(quoteDecimals));
}
export function poolPrice(
  sqrt: bigint,
  tokenIs0: boolean,
  tokenDecimals: number | null,
  quoteDecimals: number | null,
) {
  if (tokenDecimals == null || quoteDecimals == null) return null;
  if (sqrt <= 0n) return null;
  const square = sqrt * sqrt;
  const q192 = 1n << 192n;
  return ratio(
    (tokenIs0 ? square : q192) * 10n ** BigInt(tokenDecimals),
    (tokenIs0 ? q192 : square) * 10n ** BigInt(quoteDecimals),
  );
}
/** Uniswap v4 Swap emits caller deltas: a positive token amount is received (buy). */
export function poolSide(tokenDelta: bigint): 'buy' | 'sell' {
  return tokenDelta > 0n ? 'buy' : 'sell';
}
