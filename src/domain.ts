import type { PoolHistory, Tick } from './engines/wave/detector.js';
import type { CoverageRange } from './engines/coverage.js';

export const CHAIN_ID = 4663;
export const ZERO = '0x0000000000000000000000000000000000000000';
export type Pool = { id: string; currency0: string; currency1: string; hooks: string; fee: number; tickSpacing: number };
// Minute OHLCV uses exact quote strings and canonical first/last event positions.
export type Bar = [number, string | null, string | null, string | null, string | null, string, number, number, number, number, number, number];
export type Market = {
  address: string; name: string | null; symbol: string | null;
  launchedAt: number; launchBlock: number; phase: 'curve' | 'migrated';
  quoteAddress: string; quoteSymbol: string | null; quoteDecimals: number | null;
  decimals: number | null; curve: string; thresholdRaw: string;
  featureSnapshot: number[] | null;
  priceQuote: string | null; priceAt: number | null; curveProgress: number | null;
  pool?: Pool; history?: PoolHistory; tape?: Tick[]; coverage: CoverageRange[];
  checkpoint?: any; terminalGate?: { state: string; reason: string } | null;
  bars?: Bar[]; barCoverage?: CoverageRange[]; reserveRaw?: string | null; pinned?: boolean; pressureHistoryFrom?: number;
  reserveAt?: number; launchTx?: string; launchFacts?: { creator: string; sender: string | null; initialBuyRaw: string | null; creatorTaxBps: number | null; priorLaunches: number | null; priorMigrations: number | null };
};
export type Session = {
  format: 'secondwave-session-v1'; chainId: 4663; source: 'recorded' | 'rpc';
  capturedAt: string; asOf: number; block: number; hash: string; markets: Market[];
  transport?: 'rpc' | 'hypersync'; reorg?: boolean;
};
export type Seed = {
  format: 'secondwave-seed-v1'; chainId: 4663; next: number; hash: string; asOf: number;
  missing: number; recent: number[]; launches: [string, number][];
  graduations: [string, number][]; exemptions: string[];
};
export type DeskRow = {
  market: Market; early: ReturnType<typeof import('./models.js').scoreEarly>;
  wave: { stage: string; reason: string; target: number | null; invalidation: number | null;
    deadline: number | null; pressure: number | null; pressureComplete: boolean;
    buys: number; sells: number; probability: number | null; scenarioId: string | null;
    scenarioCreatedAt?: number | null; previousPeak?: number | null; base?: { low: number; high: number; from: number; to: number } | null };
  activity?: import('./market.js').Activity;
  windows?: Record<string, import('./market.js').Activity>;
  admission?: { early: boolean; wave: boolean; reasons: string[] };
};
