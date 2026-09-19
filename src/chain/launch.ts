import { decodeFunctionData, parseAbi, type Hex } from 'viem';
import type { LaunchRow } from '../engines/early/vendor/features.js';
// AUGUR MIT router signature; verified against the transaction and factory event separately.
export const routerAbi = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
  'function launchAndBuy(TokenParams params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)',
]);
export const PONS_ROUTER = '0xe33e9e479df8802cb0866d5d05258bec4cf62948';
export type LaunchInput = {
  declaration?: { name: string; symbol: string; logo?: string };
  row: LaunchRow;
  exemptions: string[];
  logIndex: number;
  sourceHash: string;
  tx: string;
  recipient: string | null;
  quoteDecimalsAtLaunch: boolean;
};
export function decodeLaunch(
  event: any,
  tx: { from: string; to: string | null; input: Hex },
  quoteDecimals: number | null,
): LaunchInput {
  const a = event.decoded;
  const row: LaunchRow = {
    token: String(a.token).toLowerCase(),
    deployer: String(a.deployer).toLowerCase(),
    launch_sender: tx.from.toLowerCase(),
    pair_token: String(a.pairToken).toLowerCase(),
    graduation_threshold_wei: String(a.graduationThreshold),
    block: Number(event.block_number),
    ts: Date.parse(event.timestamp) / 1000,
    creator_fee_recipient: null,
    creator_tax_bps: null,
    buyback_enabled: null,
    initial_buy_wei: null,
    quote_decimals: quoteDecimals,
    exempt_count: null,
    socials_json: null,
    grad_ts: null,
    desc_len: 0,
    symbol_len: 0,
  };
  const result: LaunchInput = {
    row,
    exemptions: [],
    logIndex: Number(event.log_index),
    sourceHash: event.block_hash,
    tx: event.tx_hash,
    recipient: null,
    quoteDecimalsAtLaunch: quoteDecimals !== null,
  };
  if (tx.to?.toLowerCase() !== PONS_ROUTER) return result;
  try {
    const decoded = decodeFunctionData({ abi: routerAbi, data: tx.input });
    if (decoded.functionName !== 'launchAndBuy') return result;
    const [p, configId, pair, quoteIn, , recipient, exemptions] = decoded.args;
    if (pair.toLowerCase() !== row.pair_token || String(configId) !== String(a.launchConfigId))
      return result;
    Object.assign(row, {
      creator_fee_recipient: p.creatorFeeRecipient.toLowerCase(),
      creator_tax_bps: p.creatorTaxBps,
      buyback_enabled: p.buybackEnabled ? 1 : 0,
      initial_buy_wei: String(quoteIn),
      exempt_count: exemptions.length,
      socials_json: JSON.stringify(p.socials),
      desc_len: [...p.description].length,
      symbol_len: [...p.symbol].length,
    });
    result.exemptions = exemptions.map((s) => s.toLowerCase());
    result.recipient = recipient.toLowerCase();
    result.declaration = { name: p.name.slice(0, 100), symbol: p.symbol.slice(0, 24), logo: p.logo.slice(0, 2048) };
  } catch {
    /* Unknown calldata remains explicitly undeclared, never inferred from later trades. */
  }
  return result;
}
