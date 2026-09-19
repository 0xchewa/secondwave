import assert from 'node:assert/strict';
import { decodeEventLog, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, keccak256, pad, toEventSelector, type Hex } from 'viem';
import { FACTORY, POOL_MANAGER, HOOK, logs } from './collect.js';
import { factoryAbi, poolAbi } from './abi.js';
import { decodeLaunch } from './launch.js';
import { hex, num, type RpcReader } from './rpc.js';
import { ZERO, type Market } from '../domain.js';
import type { LocalState } from './state.js';

/** A contract lookup never rewrites launch-time counters with information learned later. */
export async function lookupToken(input: LocalState, rpc: RpcReader, address: string, fromBlock?: number, progress: (text: string) => void = () => {}) {
  assert.ok(/^0x[0-9a-f]{40}$/.test(address), 'INVALID_CONTRACT');
  if (input.session.markets.some(m => m.address === address)) return input;
  assert.equal(num(await rpc.call('eth_chainId')), 4663, 'WRONG_CHAIN');
  assert.ok(rpc.readLogs || fromBlock != null, 'LOOKUP_NEEDS_HYPERSYNC_OR_FROM_BLOCK: use --transport hypersync, or --from-block near the launch');
  const end = input.session.block, start = fromBlock ?? 0;
  assert.ok(start >= 0 && start <= end && (rpc.readLogs || end - start <= 200000), 'LOOKUP_RPC_RANGE_TOO_LARGE: use HyperSync for older contracts');
  const boundary = await rpc.call('eth_getBlockByNumber', [hex(end), false]);
  assert.equal(boundary?.hash, input.session.hash, 'LOOKUP_REORG');
  const d = decodeFunctionResult({ abi: factoryAbi, functionName: 'getLaunchedToken', data: await rpc.call('eth_call', [{ to: FACTORY, data: encodeFunctionData({ abi: factoryAbi, functionName: 'getLaunchedToken', args: [address as Hex] }) }, hex(end)]) });
  assert.ok(d.exists && d.token.toLowerCase() === address, 'TOKEN_NOT_CREATED_BY_PONS_V2');
  const launch = toEventSelector('TokenLaunched(address,address,address,address,uint256,uint256)'), migration = toEventSelector('PoolGraduated(address,uint256,uint256,uint256)');
  const events: any[] = [];
  for (let from = start; from <= end; from += rpc.readLogs ? end - start + 1 : 2000) {
    const to = Math.min(end, from + (rpc.readLogs ? end - start : 1999)); progress(`LOOKUP / factory ${from}-${to}`);
    events.push(...await logs(rpc, { address: FACTORY, topics: [[launch, migration], pad(address as Hex)] }, from, to));
  }
  const born = events.find(l => l.topics[0] === launch); assert.ok(born, 'LAUNCH_NOT_IN_RANGE: use an earlier --from-block');
  const a: any = decodeEventLog({ abi: factoryAbi, topics: born.topics, data: born.data, strict: true }).args;
  const header = await rpc.call('eth_getBlockByNumber', [born.blockNumber, false]); assert.equal(header?.hash, born.blockHash, 'LOOKUP_REORG');
  const tx = await rpc.call('eth_getTransactionByHash', [born.transactionHash]); assert.equal(tx?.blockHash, born.blockHash, 'LOOKUP_TRANSACTION_MISMATCH');
  const receipt = await rpc.call('eth_getTransactionReceipt', [born.transactionHash]);
  assert.ok(receipt?.status === '0x1' && receipt.blockHash === born.blockHash && receipt.logs.some((l: any) => l.logIndex === born.logIndex && l.address.toLowerCase() === FACTORY && l.data === born.data && JSON.stringify(l.topics) === JSON.stringify(born.topics)), 'LOOKUP_RECEIPT_MISMATCH');
  const at = num(header.timestamp), quote = a.pairToken.toLowerCase();
  assert.equal(a.curve.toLowerCase(), d.curve.toLowerCase(), 'LOOKUP_CURVE_MISMATCH');
  const detail = decodeLaunch({ decoded: a, block_number: num(born.blockNumber), log_index: num(born.logIndex), timestamp: new Date(at * 1000).toISOString(), block_hash: born.blockHash, tx_hash: born.transactionHash }, tx, quote === ZERO ? 18 : null);
  const m: Market = { address, launchedAt: at, launchBlock: num(born.blockNumber), launchTx: born.transactionHash, pinned: true,
    symbol: detail.declaration?.symbol ?? null, name: detail.declaration?.name ?? null, curve: d.curve.toLowerCase(), thresholdRaw: String(a.graduationThreshold), phase: 'curve',
    quoteAddress: quote, quoteSymbol: quote === ZERO ? 'ETH' : null, quoteDecimals: quote === ZERO ? 18 : null, decimals: 18,
    featureSnapshot: null, priceQuote: null, priceAt: null, curveProgress: null, coverage: [], bars: [], barCoverage: [],
    launchFacts: { creator: a.deployer.toLowerCase(), sender: detail.row.launch_sender, initialBuyRaw: detail.row.initial_buy_wei, creatorTaxBps: detail.row.creator_tax_bps, priorLaunches: null, priorMigrations: null } };
  const graduated = events.find(l => l.topics[0] === migration);
  if (graduated) {
    m.phase = 'migrated'; const b = await rpc.call('eth_getBlockByNumber', [graduated.blockNumber, false]); assert.equal(b?.hash, graduated.blockHash, 'LOOKUP_REORG');
    const r = await rpc.call('eth_getTransactionReceipt', [graduated.transactionHash]);
    assert.ok(r?.status === '0x1' && r.blockHash === graduated.blockHash && r.logs.some((l: any) => l.logIndex === graduated.logIndex && l.address.toLowerCase() === FACTORY && l.data === graduated.data && JSON.stringify(l.topics) === JSON.stringify(graduated.topics)), 'LOOKUP_RECEIPT_MISMATCH');
    const init = toEventSelector('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');
    for (const l of r.logs.filter((l: any) => l.address.toLowerCase() === POOL_MANAGER && l.topics[0] === init)) {
      const p: any = decodeEventLog({ abi: poolAbi, topics: l.topics, data: l.data, strict: true }).args;
      if (p.hooks.toLowerCase() !== HOOK || ![p.currency0.toLowerCase(), p.currency1.toLowerCase()].includes(address)) continue;
      const other = p.currency0.toLowerCase() === address ? p.currency1.toLowerCase() : p.currency0.toLowerCase();
      assert.ok(other === quote && p.fee === d.poolFee && p.tickSpacing === d.tickSpacing && keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }], [p.currency0, p.currency1, p.fee, p.tickSpacing, p.hooks])) === p.id, 'LOOKUP_POOL_MISMATCH');
      m.pool = { id: p.id, currency0: p.currency0.toLowerCase(), currency1: p.currency1.toLowerCase(), hooks: HOOK, fee: p.fee, tickSpacing: p.tickSpacing };
      if (quote === ZERO) m.history = { token: address, quote: 'ETH', decimals: 18, migratedAt: num(b.timestamp), migrationBlock: num(graduated.blockNumber), migrationLog: num(graduated.logIndex), migrationHash: graduated.blockHash, verifiedPool: true, ticks: [] };
    }
  }
  const check = await rpc.call('eth_getBlockByNumber', [hex(end), false]); assert.equal(check?.hash, input.session.hash, 'LOOKUP_REORG');
  const result = structuredClone(input); result.session.markets.push(m); return result;
}
