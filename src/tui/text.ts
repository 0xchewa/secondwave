/** Strip terminal controls from all external text, including OSC clipboard/title sequences. */
export function clean(value: unknown): string {
  return String(value ?? '').replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[^\x20-\x7e]/g, '?');
}
export const fit = (value: unknown, width: number, right = false) => {
  const text = clean(value); const cut = text.length > width ? text.slice(0, Math.max(0, width - 1)) + '~' : text;
  return right ? cut.padStart(width) : cut.padEnd(width);
};
export function price(n: number | string | null, full = false) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '--';
  if (full && typeof n === 'string') return n;
  const v = Number(n); if (!v) return '0';
  const [mantissa, exponentText] = v.toExponential().split('e');
  const exponent = Number(exponentText), digits = mantissa.replace('.', '');
  const fixed = exponent < 0 ? '0.' + '0'.repeat(-exponent - 1) + digits : v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 36 });
  if (full) return fixed;
  const zeros = fixed.match(/^0\.(0{3,})([1-9]\d*)$/);
  if (zeros) return `0.0{${zeros[1].length}}${zeros[2].slice(0, 4)}`;
  if (v >= 1000000) return `${(v / 1000000).toFixed(2)}m`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
  return v >= 1 ? v.toFixed(3).replace(/\.?0+$/, '') : v.toFixed(Math.min(100, -exponent + 3)).replace(/0+$/, '').replace(/\.$/, '');
}
export const age = (from: number, now: number) => {
  const seconds = Math.max(0, now - from);
  return seconds < 60 ? `${Math.floor(seconds)}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${(seconds / 3600).toFixed(1)}h` : `${(seconds / 86400).toFixed(1)}d`;
};
export const percent = (v: number | null) => v === null ? '--' : `${v.toFixed(1)}%`;
export const top = (v: number | null) => v === null ? '--' : v < 0.1 ? 'TOP <0.1%' : `TOP ${v.toFixed(1)}%`;
export function wrap(text: string, width: number) {
  const words = clean(text).split(/\s+/), lines: string[] = []; let line = '';
  for (let word of words) {
    while (word.length > width) { if (line) lines.push(line); lines.push(word.slice(0, width)); word = word.slice(width); line = ''; }
    if ((line + ' ' + word).trim().length > width) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line); return lines;
}
