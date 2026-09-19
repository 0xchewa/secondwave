import { Rpc, RpcError, type RpcReader } from './rpc.js';
import { HyperSyncReader } from './hypersync.js';
export type ReaderOptions = { rpc: string; transport?: string; token?: string; endpoint?: string };
export function readerOptions(transport?: string): ReaderOptions {
  return { rpc: process.env.SWAVE_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
    transport: transport ?? process.env.SWAVE_TRANSPORT ?? (process.env.ENVIO_API_TOKEN ? 'hypersync' : 'rpc'),
    token: process.env.ENVIO_API_TOKEN, endpoint: process.env.ENVIO_HYPERSYNC_URL };
}
export function createReader(options: ReaderOptions, signal?: AbortSignal): RpcReader {
  const rpc = new Rpc(options.rpc, signal);
  if (options.transport === 'rpc' || !options.transport) return rpc;
  if (options.transport !== 'hypersync') throw new RpcError('TRANSPORT_MUST_BE_RPC_OR_HYPERSYNC');
  return new HyperSyncReader(rpc, options.token ?? '', options.endpoint, signal);
}
