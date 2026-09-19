// Render real console cells for the README. Requires Chrome and ffmpeg on PATH.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadSession } from '../src/session.js';
import { scoreMarket } from '../src/models.js';
import { initialDesk } from '../src/tui/state.js';
import { render } from '../src/tui/render.js';
import { palette } from '../src/tui/canvas.js';
const session = await loadSession(), rows = session.markets.map(m => scoreMarket(m, session.asOf));
const work = '.local/console-frames', out = 'docs/github';
await mkdir(work, { recursive: true }); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 890 }, deviceScaleFactor: 1 });
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
try {
  for (let frame = 0; frame < 24; frame++) {
    const state = initialDesk(); state.tick = frame;
    if (frame < 9) { state.tab = 'wave'; state.sort = 1; state.selected = frame < 4 ? 0 : frame < 7 ? 1 : 3; }
    else if (frame < 17) { state.tab = 'early'; state.sort = 1; state.selected = frame < 13 ? 0 : 1; }
    else state.tab = 'models';
    const canvas = render(session, rows, state, 140, 42);
    const lines = canvas.cells.map(row => {
      let result = '', text = '', key = '', style = '';
      for (const cell of row) {
        const next = `${cell.fg}/${cell.bg}/${cell.bold}`;
        if (next !== key) { if (text) result += `<span style="${style}">${escape(text)}</span>`;
          key = next; text = ''; style = `color:${palette[cell.fg]};background:${palette[cell.bg]};font-weight:${cell.bold ? 700 : 400}`; }
        text += cell.c;
      }
      return result + (text ? `<span style="${style}">${escape(text)}</span>` : '');
    }).join('\n');
    await page.setContent(`<style>body{margin:0;padding:28px;background:#070b08;color:#e2eadb}main{border:1px solid #33432c;box-shadow:0 12px 90px #c1ff6010}header{height:34px;display:flex;align-items:center;gap:8px;background:#101b12;padding:0 14px;font:11px Consolas,monospace;color:#899480;border-bottom:1px solid #33432c}i{width:7px;height:7px;border-radius:100%;background:#33432c}i:first-child{background:#c1ff60}header span{margin-left:10px}pre{font:16px/18px Consolas,monospace;letter-spacing:0;margin:0;background:#090e0b;padding:8px 6px;white-space:pre;overflow:hidden}footer{font:10px Consolas,monospace;display:flex;justify-content:space-between;margin-top:12px;color:#74826a}</style><main><header><i></i><i></i><i></i><span>secondwave / npm start</span></header><pre>${lines}</pre></main><footer><span>ACTUAL CONSOLE RENDERER / LOCAL MODEL OUTPUT</span><span>RECORDED ${session.capturedAt.slice(0,10)} / ROBINHOOD CHAIN 4663</span></footer>`);
    await page.screenshot({ path: `${work}/${String(frame).padStart(3, '0')}.png` });
    if (frame === 0) await page.screenshot({ path: `${out}/console-wave.png` });
    if (frame === 9) await page.screenshot({ path: `${out}/console-early.png` });
    if (frame === 17) await page.screenshot({ path: `${out}/console-models.png` });
  }
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '2', '-i', `${work}/%03d.png`, '-filter_complex', 'split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer', '-loop', '0', `${out}/console-desk.gif`]);
  await writeFile(`${out}/console-capture.json`, JSON.stringify({ recordedAt: session.capturedAt, source: 'src/tui/render.ts; real recorded session evaluated locally', frames: 24, modes: ['Second Wave', 'Early Signal', 'Model desk'], browserUsedOnlyToRasterizeConsoleCells: true }, null, 2) + '\n');
  const record = execFileSync(process.execPath, ['scripts/model-record.mjs'], { encoding: 'utf8' }).trim().split('\n');
  const recordWork = '.local/model-record-frames'; await mkdir(recordWork, { recursive: true });
  await page.setViewportSize({ width: 1000, height: 560 });
  for (let i = 0; i < 24; i++) {
    const text = ['$ node scripts/model-record.mjs', '', ...record.slice(0, Math.min(record.length, i + 2))].join('\n');
    await page.setContent(`<style>body{margin:0;padding:30px;background:#090e0b;color:#c1ff60;font:15px/24px Consolas,monospace}header{color:#899480;font:11px Consolas,monospace;border-bottom:1px solid #33432c;padding-bottom:16px;margin-bottom:22px}pre{font:inherit;margin:0}b{animation:none;color:#c1ff60}</style><header>SECOND / WAVE_ &nbsp; / &nbsp; SAVED RESEARCH RECORD &nbsp; / &nbsp; LOCAL COMMAND OUTPUT</header><pre>${escape(text)}<b>_</b></pre>`);
    await page.screenshot({ path: `${recordWork}/${String(i).padStart(3, '0')}.png` });
  }
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '2', '-i', `${recordWork}/%03d.png`, '-filter_complex', 'split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer', '-loop', '0', `${out}/model-record.gif`]);
} finally { await browser.close(); }
