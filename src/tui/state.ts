import type { DeskRow } from '../domain.js';
export type DeskState = { tab: 'early' | 'wave' | 'models'; selected: number; offset: number; query: string; editing: boolean; sort: number; filter: number; detail: boolean; help: boolean; notice: string; tick: number; sync: string; syncing: boolean };
export const initialDesk = (): DeskState => ({ tab: 'wave', selected: 0, offset: 0, query: '', editing: false, sort: 0, filter: 0, detail: false, help: false, notice: '', tick: 0, sync: '', syncing: false });
export const sortNames = ['RECENT', 'SIGNAL', 'AGE', 'PRESSURE'];
export const filterNames = ['ALL', 'ACTIVE', 'OBSERVING', 'RESOLVED'];
export function visibleRows(rows: DeskRow[], state: DeskState) {
  const q = state.query.toLowerCase();
  const list = rows.filter(r => (state.tab !== 'early' || r.market.phase === 'curve') && (state.tab !== 'wave' || r.market.phase === 'migrated'))
    .filter(r => !q || `${r.market.address} ${r.market.name} ${r.market.symbol}`.toLowerCase().includes(q))
    .filter(r => !state.filter || (state.filter === 1 ? state.tab === 'early' ? r.early.state === 'rank_only' : r.wave.stage === 'ACTIVE' :
      state.filter === 2 ? ['OBSERVING', 'PULLBACK', 'BASE FORMING'].includes(r.wave.stage) : ['IMPULSE', 'INVALIDATED', 'EXPIRED'].includes(r.wave.stage)));
  return list.sort((a, b) => state.sort === 1 ? (state.tab === 'early' ? (a.early.topPercent ?? 101) - (b.early.topPercent ?? 101) : Number(b.wave.stage === 'ACTIVE') - Number(a.wave.stage === 'ACTIVE')) || b.market.launchedAt - a.market.launchedAt : state.sort === 2 ? a.market.launchedAt - b.market.launchedAt : state.sort === 3 ? (b.wave.pressure ?? -1) - (a.wave.pressure ?? -1) || b.market.launchedAt - a.market.launchedAt : (b.market.priceAt ?? b.market.launchedAt) - (a.market.priceAt ?? a.market.launchedAt));
}
