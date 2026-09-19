import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { atomicSave, readJson, loadSession, loadSeed, verifyBundledData, validateSession } from '../session.js';
import type { Seed, Session } from '../domain.js';

export type LocalState = { format: 'secondwave-state-v1'; seed: Seed; session: Session };
export async function readState(path: string): Promise<LocalState> {
  try {
    const state = await readJson(path);
    if (state.format !== 'secondwave-state-v1' || state.seed.next !== state.session.block + 1 || state.seed.hash !== state.session.hash) throw Error('LOCAL_CHECKPOINT_MISMATCH');
    state.session = validateSession(state.session);
    return state;
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
    await verifyBundledData();
    const seed = await loadSeed(), session = await loadSession();
    return { format: 'secondwave-state-v1', seed, session };
  }
}
export async function stateLock(path: string) {
  await mkdir(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  let file;
  try { file = await open(lock, 'wx', 0o600); }
  catch { throw Error('LOCAL_STATE_LOCKED: another sync may be running; inspect the .lock file before removing it'); }
  await file.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return async () => { await file.close(); await unlink(lock); };
}
export async function commitState(path: string, state: LocalState) { await atomicSave(path, state); }
