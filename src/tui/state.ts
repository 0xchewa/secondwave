import type { DeskRow } from '../domain.js';
export type DeskState = { tab: 'early' | 'wave' | 'models'; selected: number; offset: number; query: string; editing: boolean; sort: number; filter: number; detail: boolean; help: boolean; notice: string; tick: number; sync: string; syncing: boolean; catalogue: boolean; window: number; chart: number; minimum: number; facts: boolean };
export const initialDesk = (): DeskState => ({ tab: 'wave', selected: 0, offset: 0, query: '', editing: false, sort: 0, filter: 0, detail: false, help: false, notice: '', tick: 0, sync: '', syncing: false, catalogue: false, window: 1, chart: 0, minimum: 0, facts: false });
export const sortNames = ['RECENT ACTIVITY', 'MODEL / STAGE', 'NEWEST', 'OLDEST', 'RECENT MIGRATION', 'LATEST SCENARIO', 'SELL PRESSURE'];
export const filterNames = ['ALL STAGES', 'ACTIVE', 'FORMING', 'RESOLVED'];
export const windowNames = ['5m', '1h', '24h'];
export const chartNames = ['ALL', '1H', '4H', '24H'];
const priority: Record<string, number> = { ACTIVE: 7, 'BASE FORMING': 6, PULLBACK: 5, IMPULSE: 4, OBSERVING: 3, INVALIDATED: 2, EXPIRED: 1, UNRESOLVED: 0 };
export function visibleRows(rows: DeskRow[], state: DeskState) {
  const q = state.query.trim().toLowerCase(), addressSearch = /^0x[0-9a-f]{4,40}$/.test(q);
  const list = rows.filter(r => addressSearch || (state.tab !== 'early' || r.market.phase === 'curve') && (state.tab !== 'wave' || r.market.phase === 'migrated'))
    .filter(r => !q || `${r.market.address} ${r.market.name} ${r.market.symbol}`.toLowerCase().includes(q))
    .filter(r => addressSearch || state.catalogue || !r.admission || (state.tab === 'early' ? r.admission.early : r.admission.wave))
    .filter(r => addressSearch || state.tab !== 'early' || !state.minimum || (r.early.estimate ?? -1) >= state.minimum / 100)
    .filter(r => addressSearch || !state.filter || (state.filter === 1 ? state.tab === 'early' ? r.early.displayState === 'experimental' : r.wave.stage === 'ACTIVE' :
      state.filter === 2 ? ['OBSERVING', 'PULLBACK', 'BASE FORMING'].includes(r.wave.stage) : ['IMPULSE', 'INVALIDATED', 'EXPIRED', 'UNRESOLVED'].includes(r.wave.stage)));
  return list.sort((a, b) => {
    let comparison = 0;
    switch (state.sort) {
      case 0: comparison = (b.market.priceAt ?? b.market.launchedAt) - (a.market.priceAt ?? a.market.launchedAt); break;
      case 1: comparison = state.tab === 'early' ? (b.early.estimate ?? -1) - (a.early.estimate ?? -1) : (priority[b.wave.stage] ?? -1) - (priority[a.wave.stage] ?? -1); break;
      case 2: comparison = b.market.launchedAt - a.market.launchedAt; break;
      case 3: comparison = a.market.launchedAt - b.market.launchedAt; break;
      case 4: comparison = (b.market.history?.migratedAt ?? -1) - (a.market.history?.migratedAt ?? -1); break;
      case 5: comparison = (b.wave.scenarioCreatedAt ?? -1) - (a.wave.scenarioCreatedAt ?? -1); break;
      case 6: comparison = (a.wave.pressure ?? 2) - (b.wave.pressure ?? 2); break;
    }
    return comparison || b.market.launchedAt - a.market.launchedAt || a.market.address.localeCompare(b.market.address);
  });
}
