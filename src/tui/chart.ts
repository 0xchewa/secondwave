import { Canvas } from './canvas.js';
import type { DeskRow } from '../domain.js';
import { fit, price, age } from './text.js';
import { chartNames } from './state.js';

/** Columns represent equal time spans. Empty minutes stay empty, never invented trades. */
export function chart(c: Canvas, x: number, y: number, width: number, height: number, row: DeskRow, to: number, window: number) {
  const all = row.market.bars ?? [], seconds = [Infinity, 3600, 14400, 86400][window];
  const from = Math.max(all[0]?.[0] ?? to, to - seconds);
  const bars = all.filter(b => b[0] >= from && b[0] <= to && b[2] != null && b[3] != null);
  if (!bars.length) {
    c.text(x, y + 1, 'PRICE HISTORY NOT PREPARED', 'muted');
    c.text(x, y + 2, fit('[h] fetch from launch / resumable', width), 'aqua'); return;
  }
  const high = bars.reduce((v,b) => Math.max(v,Number(b[2])), -Infinity), low = bars.reduce((v,b) => Math.min(v,Number(b[3])), Infinity), span = high - low || high * .01 || 1;
  const plotW = Math.max(4, width - 14), duration = Math.max(60, to - from);
  for (let line = 0; line < height; line += 3) c.text(x, y + line, '┄'.repeat(plotW), 'line');
  const columns = new Map<number, typeof bars>();
  for (const b of bars) { const col = Math.min(plotW - 1, Math.floor((b[0] - from) / duration * plotW)); const group = columns.get(col) ?? []; group.push(b); columns.set(col, group); }
  const pos = (p: number) => Math.max(0, Math.min(height - 1, height - 1 - Math.round((p - low) / span * (height - 1))));
  for (const [col, group] of columns) {
    const top = pos(group.reduce((v,b) => Math.max(v,Number(b[2])), -Infinity)), bottom = pos(group.reduce((v,b) => Math.min(v,Number(b[3])), Infinity));
    const up = Number(group.at(-1)![4]) >= Number(group[0][1]);
    for (let line = top; line <= bottom; line++) c.text(x + col, y + line, '│', up ? 'green' : 'red');
    c.text(x + col, y + pos(Number(group.at(-1)![4])), '▪', up ? 'green' : 'red');
  }
  c.text(x + plotW + 1, y, fit(price(high), 13), 'muted');
  c.text(x + plotW + 1, y + height - 1, fit(price(low), 13), 'muted');
  c.text(x, y + height, fit(`[c] ${chartNames[window]} / ${age(from, to)} / ${bars.length} minute bars`, width), 'muted');
}
