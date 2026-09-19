import assert from 'node:assert/strict';
import { featureRow } from './vendor/features.js';
const HORIZON = 14400;
/** Cumulative observed factory-caller history, with strict block/log ordering. */
export class CausalState {
  launches = new Map<string, number>();
  graduations = new Map<string, number>();
  exemptions = new Set<string>();
  recent: number[] = [];
  last = [-1, -1];
  missing = 0;
  step(e: any): number[] | null {
    const block = Number(e.block_number),
      log = Number(e.log_index),
      ts = Date.parse(e.timestamp) / 1000;
    assert.ok(
      block > this.last[0] || (block === this.last[0] && log > this.last[1]),
      'Duplicate or unordered causal event',
    );
    this.last = [block, log];
    const caller = e.deployer;
    assert.ok(caller, 'Unknown factory caller');
    if (e.event_name === 'PoolGraduated') {
      this.graduations.set(caller, (this.graduations.get(caller) ?? 0) + 1);
      return null;
    }
    this.recent = this.recent.filter((t) => t >= ts - 3600);
    const h = {
      priorL: this.launches.get(caller) ?? 0,
      priorG: this.graduations.get(caller) ?? 0,
      overlap: (e.exemptions ?? []).filter((a: string) => this.exemptions.has(a)).length,
      recentCount: this.recent.length,
    };
    this.launches.set(caller, h.priorL + 1);
    if (!e.detail) this.missing++;
    for (const a of e.exemptions ?? []) this.exemptions.add(a);
    this.recent.push(ts);
    if (!e.detail || this.missing) return null;
    const x = [...featureRow(e.detail, h, HORIZON).x];
    assert.ok(x.every(Number.isFinite));
    return x;
  }
  save() {
    return {
      launches: [...this.launches],
      graduations: [...this.graduations],
      exemptions: [...this.exemptions],
      recent: this.recent,
      last: this.last,
      missing: this.missing,
    };
  }
  static restore(v: ReturnType<CausalState['save']>) {
    const s = new CausalState();
    s.launches = new Map(v.launches);
    s.graduations = new Map(v.graduations);
    s.exemptions = new Set(v.exemptions);
    s.recent = v.recent;
    s.last = v.last;
    s.missing = v.missing;
    return s;
  }
}

