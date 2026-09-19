export const palette = { bg: '#090e0b', panel: '#101b12', green: '#c1ff60', text: '#e2eadb', muted: '#899480', line: '#33432c', gold: '#efcf67', red: '#f2927e', aqua: '#7cd9c1' };
export type Color = keyof typeof palette;
export type Cell = { c: string; fg: Color; bg: Color; bold: boolean };
export class Canvas {
  cells: Cell[][];
  constructor(public width: number, public height: number) { this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ c: ' ', fg: 'text', bg: 'bg', bold: false }))); }
  text(x: number, y: number, text: string, fg: Color = 'text', bg: Color = 'bg', bold = false) {
    if (y < 0 || y >= this.height) return;
    [...text].forEach((c, i) => { if (x + i >= 0 && x + i < this.width) this.cells[y][x + i] = { c, fg, bg, bold }; });
  }
  fill(x: number, y: number, width: number, height: number, bg: Color = 'panel') {
    for (let row = y; row < y + height; row++) this.text(x, row, ' '.repeat(Math.max(0, width)), 'text', bg);
  }
  box(x: number, y: number, width: number, height: number, label: string) {
    if (width < 4 || height < 3) return;
    this.text(x, y, '┌' + '─'.repeat(width - 2) + '┐', 'line');
    this.text(x, y + height - 1, '└' + '─'.repeat(width - 2) + '┘', 'line');
    for (let row = y + 1; row < y + height - 1; row++) { this.text(x, row, '│', 'line'); this.text(x + width - 1, row, '│', 'line'); }
    this.text(x + 2, y, ` ${label} `, 'green');
  }
  plain() { return this.cells.map(row => row.map(c => c.c).join('')).join('\n'); }
  ansi(color = true) {
    if (!color) return this.plain().replaceAll('\n', '\r\n');
    const rgb = (key: Color) => palette[key].slice(1).match(/../g)!.map(h => parseInt(h, 16)).join(';');
    let previous = '', out = '';
    for (const row of this.cells) { for (const c of row) {
      const key = `${c.fg}/${c.bg}/${c.bold}`;
      if (key !== previous) { out += `\x1b[0;38;2;${rgb(c.fg)};48;2;${rgb(c.bg)}${c.bold ? ';1' : ''}m`; previous = key; }
      out += c.c;
    } out += '\x1b[0m\r\n'; previous = ''; }
    return out.trimEnd() + '\x1b[0m';
  }
}
