import { setTimeout as pause } from 'node:timers/promises';

const READ_METHODS = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getLogs', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_call']);
export class RpcError extends Error {
  constructor(public code: string) { super(code); this.name = 'RpcError'; }
}
export interface RpcReader { call<T = any>(method: string, params?: unknown[]): Promise<T> }
export class Rpc implements RpcReader {
  requests = 0;
  private next = 0;
  private id = 0;
  constructor(private endpoint: string, private signal?: AbortSignal, private spacing = 250) {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) throw new RpcError('RPC_REQUIRES_HTTPS_OR_LOCALHOST');
    if (u.username || u.password) throw new RpcError('RPC_URL_MUST_NOT_CONTAIN_BASIC_AUTH');
  }
  async call<T = any>(method: string, params: unknown[] = []): Promise<T> {
    if (!READ_METHODS.has(method)) throw new RpcError('READ_ONLY_RPC_METHOD_REQUIRED');
    const id = ++this.id;
    for (let attempt = 0; attempt < 4; attempt++) {
      this.signal?.throwIfAborted();
      const delay = Math.max(0, this.next - Date.now());
      this.next = Date.now() + delay + this.spacing;
      if (delay) await pause(delay, undefined, { signal: this.signal });
      let response: Response;
      try {
        response = await fetch(this.endpoint, { method: 'POST', redirect: 'error',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
        this.requests++;
      } catch {
        if (this.signal?.aborted) throw new RpcError('SYNC_CANCELLED');
        if (attempt === 3) throw new RpcError('RPC_TIMEOUT_OR_NETWORK');
        await pause(1000 * 2 ** attempt, undefined, { signal: this.signal }); continue;
      }
      if ([401, 403].includes(response.status)) throw new RpcError(`RPC_ACCESS_DENIED_${response.status}`);
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 3) throw new RpcError(`RPC_HTTP_${response.status}`);
        const header = response.headers.get('retry-after');
        const seconds = header && /^\d+$/.test(header) ? Number(header) : 2 ** attempt;
        await pause(Math.min(60000, Math.max(1000, seconds * 1000)), undefined, { signal: this.signal }); continue;
      }
      if (!response.ok) throw new RpcError(`RPC_HTTP_${response.status}`);
      const length = Number(response.headers.get('content-length'));
      if (length > 16 * 1024 ** 2) throw new RpcError('RPC_RESPONSE_TOO_LARGE');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 16 * 1024 ** 2) throw new RpcError('RPC_RESPONSE_TOO_LARGE');
      let body: any;
      try { body = JSON.parse(Buffer.from(bytes).toString()); } catch { throw new RpcError('RPC_INVALID_JSON'); }
      if (body.id !== id || body.jsonrpc !== '2.0') throw new RpcError('RPC_INVALID_ENVELOPE');
      if (body.error) throw new RpcError(`RPC_RESPONSE_${Number.isSafeInteger(body.error.code) ? body.error.code : 'ERROR'}`);
      if (!('result' in body)) throw new RpcError('RPC_MISSING_RESULT');
      return body.result;
    }
    throw new RpcError('RPC_RETRY_EXHAUSTED');
  }
}
export const hex = (n: number | bigint) => '0x' + BigInt(n).toString(16);
export const num = (n: string) => { const v = Number(BigInt(n)); if (!Number.isSafeInteger(v)) throw new RpcError('CHAIN_INTEGER_OVERFLOW'); return v; };
