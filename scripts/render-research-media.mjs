// Original code-rendered diagrams. No invented live prices, evaluations or training logs.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const out = 'docs/github',
  work = '.local/research-media';
await mkdir(out, { recursive: true });
await mkdir(work, { recursive: true });
const evidence = JSON.parse(await readFile('data/evidence.json', 'utf8'));
const css = `*{box-sizing:border-box}body{margin:0;background:#090e0a;color:#eef4e8;font-family:Arial,sans-serif}main{height:560px;position:relative;overflow:hidden;background:radial-gradient(ellipse at 75% 30%,#b6ff5410,transparent 65%)}main:before{content:'';position:absolute;inset:0;background:linear-gradient(#b6ff5406 1px,transparent 1px),linear-gradient(90deg,#b6ff5406 1px,transparent 1px);background-size:32px 32px;pointer-events:none}header,footer{position:absolute;left:30px;right:30px;display:flex;justify-content:space-between;font:10px Consolas,monospace;letter-spacing:1.6px;color:#8c9e7c}header{top:24px;border-bottom:1px solid #b6ff5428;padding-bottom:17px}footer{bottom:20px;border-top:1px solid #b6ff5428;padding-top:14px;font-size:9px}.lime{color:#b6ff54}.violet{color:#ba9aee}.gold{color:#dfbd72}.mono{font-family:Consolas,monospace}.badge{padding:7px 10px;border:1px solid #b6ff5440;background:#b6ff5408;color:#b6ff54;font:9px Consolas,monospace;letter-spacing:1px}.caption{font:11px/1.6 Consolas,monospace;color:#9fb08f}.muted{color:#69805c}h1,h2,h3,p{margin:0}h2{font-size:40px;line-height:1;letter-spacing:-2px}.panel{border:1px solid #b6ff5430;background:#0b120bea}.label{font:9px Consolas,monospace;letter-spacing:1.4px;color:#93a880}svg text{font-family:Consolas,monospace}#signal{background:#0b130c}`;
const shell = (title, kind, body, script, foot = 'SECOND WAVE / RESEARCH DESK') =>
  `<style>${css}</style><main><header><span><b class="lime">&gt;_</b> SECOND/WAVE_ &nbsp; / &nbsp; ${title}</span><span>${kind}</span></header>${body}<footer><span>${foot}</span><span>4663 / PONS V2 / OBSERVE THE MARKET</span></footer></main><script>${script}</script>`;
const scenes = [];
scenes.push({
  name: 'signal-intro',
  seconds: 8,
  html: shell(
    'THE SECOND LOOK',
    'TWO WINDOWS / ONE STORY',
    `
<svg viewBox="0 0 1000 560" style="position:absolute;inset:0"><defs><filter id="glow"><feGaussianBlur stdDeviation="8"/></filter></defs><g id="waves"></g><line id="scan" x1="0" y1="70" x2="0" y2="470" stroke="#b6ff5430"/><circle id="beacon" r="5" fill="#dcffab"/></svg>
<div style="position:absolute;left:38px;top:113px"><span class="badge">MARKET INTELLIGENCE / ROBINHOOD CHAIN</span><h1 style="font-size:95px;line-height:.9;letter-spacing:-7px;margin-top:28px">SECOND<span class="lime">/</span><br/>WAVE<span id="caret" class="lime">_</span></h1><p style="font-size:22px;color:#c2ceb7;margin-top:22px">The first pump is a beginning.</p><p class="caption" style="margin-top:9px">Follow what happens after everyone looks away.</p></div>
<div style="position:absolute;left:614px;top:330px"><div class="badge" id="signal">SIGNAL / OBSERVING</div><div class="caption" style="margin-top:14px">EARLY SIGNAL → SECOND WAVE</div></div>
<div id="stages" style="position:absolute;left:38px;right:38px;bottom:77px;display:flex;gap:9px"></div>`,
    `
const labels=['LAUNCH','MIGRATION','PULLBACK','BASE','SCENARIO','NEXT MOVE'];
document.querySelector('#stages').innerHTML=labels.map(x=>'<span class="badge" style="flex:1;text-align:center">'+x+'</span>').join('');
window.render=t=>{let p=t/8;document.querySelector('#caret').style.opacity=Math.sin(t*5)>0?'1':'.12';let paths='';for(let j=0;j<10;j++){let d='';for(let i=0;i<95;i++){let x=526+i*5,y=247+Math.sin(i*.1-t*.8+j*.07)*42+Math.sin(i*.045+j*.2)*57+j*6;d+=(i?'L':'M')+x+' '+y;}paths+='<path d="'+d+'" fill="none" stroke="'+(j===0?'#b6ff54':'#b6ff5422')+'" stroke-width="'+(j===0?2:1)+'"/>';}document.querySelector('#waves').innerHTML=paths;let x=530+p*440,y=247+Math.sin(p*88*.1-t*.8)*42+Math.sin(p*88*.045)*57;document.querySelector('#beacon').setAttribute('cx',x);document.querySelector('#beacon').setAttribute('cy',y);document.querySelector('#scan').setAttribute('x1',x);document.querySelector('#scan').setAttribute('x2',x);let k=Math.min(5,Math.floor(p*6));document.querySelector('#signal').textContent='SIGNAL / '+labels[k];document.querySelectorAll('#stages span').forEach((s,i)=>{s.style.background=i===k?'#b6ff54':'#b6ff5408';s.style.color=i===k?'#0b1208':'#789464';});};`,
  ),
});
scenes.push({
  name: 'wave-machine',
  seconds: 24,
  html: shell(
    'SECOND WAVE / SCENARIO ENGINE',
    'ILLUSTRATED STATE TRANSITIONS',
    `
<div style="position:absolute;left:32px;top:87px"><span class="label">02 / STRUCTURE AFTER MIGRATION</span><h2 style="margin-top:10px">A setup has a life cycle</h2></div><div class="badge" id="state" style="position:absolute;right:33px;top:93px">OBSERVING</div>
<svg viewBox="0 0 1000 560" style="position:absolute;inset:0"><g stroke="#b6ff5414"><path d="M34 210H690M34 275H690M34 340H690M34 405H690"/><path d="M120 175V416M240 175V416M360 175V416M480 175V416M600 175V416"/></g><rect x="375" y="297" width="173" height="38" fill="#b6ff540c" stroke="#b6ff5430"/><text x="398" y="355" fill="#7f956b" font-size="9">FORMING BASE</text><path d="M438 235H690" stroke="#b6ff54" stroke-dasharray="5 5"/><text x="441" y="223" fill="#b6ff54" font-size="9">TARGET / UPPER BOUNDARY</text><path d="M438 376H690" stroke="#e5908b" stroke-dasharray="5 5"/><text x="441" y="394" fill="#e5908b" font-size="9">INVALIDATION / LOWER BOUNDARY</text><path id="price" fill="none" stroke="#b6ff54" stroke-width="3"/><circle id="head" r="5" fill="#dfffaf"/><line id="cursor" y1="175" y2="416" stroke="#b6ff5430"/></svg>
<div class="panel" style="position:absolute;right:32px;top:171px;width:250px;padding:22px;height:250px"><span class="label">THE SCENARIO RECORD</span><p class="mono lime" id="outcome" style="font-size:23px;margin:23px 0 16px">WAIT FOR STRUCTURE</p><p class="caption" id="reason">Observe the first move and its pullback.</p><div style="border-top:1px solid #b6ff5425;margin-top:20px;padding-top:15px" class="caption">Upper boundary<br/>Lower boundary<br/>As-of time + deadline</div></div>
<div id="steps" style="position:absolute;left:32px;right:32px;bottom:72px;display:flex;gap:8px"></div>`,
    `
const names=['OBSERVING','PULLBACK','BASE FORMING','ACTIVE','OUTCOME'];document.querySelector('#steps').innerHTML=names.map(x=>'<div class="badge" style="flex:1;text-align:center">'+x+'</div>').join('');
const base=[[36,386],[67,372],[96,389],[122,347],[157,307],[187,258],[224,193],[248,242],[280,254],[307,295],[343,311],[370,328],[399,306],[426,322],[458,310],[486,317],[519,307],[545,316]];
window.render=t=>{let scenario=Math.min(2,Math.floor(t/8)),p=Math.min(1,(t%8)/5.5),ends=[[[575,294],[605,267],[630,232],[660,210]],[[575,333],[602,350],[632,382],[660,406]],[[575,310],[600,319],[630,307],[660,315]]],pts=[...base,...ends[scenario]],n=Math.max(2,Math.ceil(p*pts.length)),shown=pts.slice(0,n),last=shown.at(-1),stage=n<8?0:n<12?1:n<17?2:n<21?3:4;document.querySelector('#price').setAttribute('d',shown.map((a,i)=>(i?'L':'M')+a.join(' ')).join(' '));document.querySelector('#price').setAttribute('stroke',stage===4&&scenario===1?'#e5908b':'#b6ff54');document.querySelector('#head').setAttribute('cx',last[0]);document.querySelector('#head').setAttribute('cy',last[1]);document.querySelector('#cursor').setAttribute('x1',last[0]);document.querySelector('#cursor').setAttribute('x2',last[0]);let outcome=['IMPULSE','INVALIDATED','UNRESOLVED'][scenario];document.querySelector('#state').textContent=stage===4?outcome:names[stage];document.querySelector('#outcome').textContent=stage===4?outcome:['WAIT FOR STRUCTURE','READ THE RETRACEMENT','TEST THE BASE','SCENARIO READY'][stage];document.querySelector('#reason').textContent=stage===4?['Upper move confirmed before a lower-boundary break.','The lower boundary breaks before a confirmed impulse.','The deadline arrives without either confirmed outcome.'][scenario]:['Migration starts observation, not a probability.','Track the pullback from the first move.','Use only observations available at this point.','Freeze the boundaries and watch what happens next.'][stage];document.querySelectorAll('#steps div').forEach((s,i)=>{s.style.background=i===stage?'#b6ff54':'#b6ff5408';s.style.color=i===stage?'#0b1208':'#849c70';});};`,
    'SCHEMATIC PRICE PATH / NO LIVE TOKEN OR RETURN',
  ),
});
const wave = evidence.model.wave24.latestDataset;
scenes.push({
  name: 'wave-research',
  seconds: 9,
  html: shell(
    'SECOND WAVE / RESEARCH LEDGER',
    'SAVED DATASET / 16 SEP 2026',
    `
<div style="position:absolute;left:34px;top:93px"><span class="label">COUNT INDEPENDENT TOKENS, NOT REPEATED SCORES</span><h2 style="margin-top:12px">${wave.independentTokens} independent stories</h2></div>
<div style="position:absolute;left:34px;top:188px;width:584px"><div id="tiles" style="display:grid;grid-template-columns:repeat(31,1fr);gap:5px"></div><div style="display:flex;justify-content:space-between;margin-top:24px" class="caption"><span class="lime">88 IMPULSE</span><span style="color:#a79ac1">211 BREAKDOWN</span><span class="gold">11 UNRESOLVED</span></div><p class="caption" style="margin-top:28px">One earliest mature assessment per token.<br/>Later assessments do not inflate the sample.</p></div>
<div class="panel" style="position:absolute;right:34px;top:188px;width:307px;padding:24px"><span class="label">UNVIEWED TEST PARTITION</span><div style="display:flex;gap:35px;margin:21px 0"><div><b style="font:43px Consolas" class="lime">41</b><p class="label">TOKENS</p></div><div><b style="font:43px Consolas" class="gold">9 / 10</b><p class="label">POSITIVE GATE</p></div></div><div style="height:7px;background:#b6ff5416"><div id="gate" style="height:100%;background:#dfbd72"></div></div><p class="caption" style="margin-top:20px">31 previously viewed test tokens excluded.<br/><br/><span class="gold">PROBABILITY / NOT APPROVED</span></p></div>`,
    `
document.querySelector('#tiles').innerHTML=Array.from({length:310},(_,i)=>'<i style="height:14px;background:'+(i<88?'#b6ff54':i<299?'#9581b2':'#dfbd72')+';opacity:.12"></i>').join('');window.render=t=>{let n=Math.min(310,Math.floor(t*100));document.querySelectorAll('#tiles i').forEach((x,i)=>x.style.opacity=i<n?'.9':'.12');document.querySelector('#gate').style.width=Math.min(.9,t/3)*100+'%';};`,
    'SOURCE / PUBLISHED-EVIDENCE.JSON · COUNTS ARE RECORDED, NOT LIVE',
  ),
});
const early = evidence.model.early;
scenes.push({
  name: 'ranking-lab',
  seconds: 9,
  html: shell(
    'EARLY SIGNAL / EVALUATION',
    'RECORDED DIAGNOSTIC / NOT RETURNS',
    `
<div style="position:absolute;left:34px;top:93px"><span class="label">HOW MUCH SIGNAL IS IN THE SHORTLIST?</span><h2 style="margin-top:12px">Read the lift. Keep the denominator.</h2></div>
<div style="position:absolute;left:34px;right:34px;top:186px" id="bars"></div><div style="position:absolute;left:34px;right:34px;bottom:78px;display:flex;gap:20px;justify-content:space-between" class="caption"><span>ROC-AUC <b class="lime">${early.candidate.rocAuc.toFixed(6)}</b></span><span>TOP-DECILE LIFT <b class="lime">${early.candidate.topDecileLift.toFixed(2)}×</b></span><span>TEST ROWS <b class="lime">76,827</b></span></div>`,
    `
const rows=[['ALL TEST LAUNCHES',${early.candidate.observedRate * 100},'857 / 76,827'],['TOP 10%',${early.candidate.topFractions[2].precision * 100},'353 / 7,683'],['TOP 5%',${early.candidate.topFractions[1].precision * 100},'249 / 3,842'],['TOP 1%',${early.candidate.topFractions[0].precision * 100},'76 / 769']];document.querySelector('#bars').innerHTML=rows.map((r,i)=>'<div style="display:grid;grid-template-columns:158px 1fr 90px 125px;gap:20px;align-items:center;margin-bottom:23px"><span class="label">'+r[0]+'</span><div style="height:25px;background:#b6ff5408"><div class="bar" style="height:100%;background:'+(i===0?'#607c46':'#b6ff54')+'"></div></div><b class="mono lime">'+r[1].toFixed(2)+'%</b><span class="caption">'+r[2]+'</span></div>').join('');window.render=t=>{document.querySelectorAll('.bar').forEach((b,i)=>b.style.width=rows[i][1]/10*Math.min(1,Math.max(0,t-i*.3)/2)*100+'%');};`,
    'OBSERVED MIGRATION RATE / SAVED TEMPORAL TEST · PREVIOUSLY VIEWED',
  ),
});
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
  for (const scene of scenes) {
    if (process.env.MEDIA_SCENE && process.env.MEDIA_SCENE !== scene.name) continue;
    const dir = `${work}/${scene.name}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/scene.html`, scene.html);
    await page.setContent(scene.html);
    const frames = scene.seconds * 4;
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.render(t), i / 4);
      await page.screenshot({ path: `${dir}/${String(i).padStart(3, '0')}.png` });
    }
    await page.screenshot({ path: `${out}/${scene.name}.png` });
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-framerate',
      '4',
      '-i',
      `${dir}/%03d.png`,
      '-frames:v',
      String(frames),
      '-filter_complex',
      'split[a][b];[a]palettegen=max_colors=80[p];[b][p]paletteuse=dither=bayer',
      '-loop',
      '0',
      `${out}/${scene.name}.gif`,
    ]);
    console.log('Rendered', scene.name);
  }
  await mkdir(`${out}/badges`, { recursive: true });
  for (const [name, left, right, color] of [
    ['tests', 'TESTS', '34 PASS / 19 SEP', '#b6ff54'],
    ['engines', 'ENGINES', 'EARLY + WAVE', '#b6ff54'],
    ['node', 'NODE', '22.x', '#b6ff54'],
    ['chain', 'CHAIN', '4663 MAINNET', '#ba9aee'],
    ['stack', 'STACK', 'TS / RPC / LOCAL', '#b6ff54'],
  ]) {
    const a = left.length * 7 + 20,
      b = right.length * 7 + 22;
    await writeFile(
      `${out}/badges/${name}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${a + b}" height="26" role="img" aria-label="${left}: ${right}"><rect width="${a + b}" height="26" fill="#10180e"/><rect x="${a}" width="${b}" height="26" fill="${color}"/><rect x=".5" y=".5" width="${a + b - 1}" height="25" fill="none" stroke="#537035"/><g font-family="monospace" font-size="10"><text x="10" y="17" fill="#adbe9b">${left}</text><text x="${a + 11}" y="17" fill="#10170b">${right}</text></g></svg>`,
    );
  }
  await writeFile(
    `${out}/research-media.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: 'data/evidence.json',
        scenes: scenes.map((s) => ({ name: s.name, seconds: s.seconds })),
        waveMachine: 'Illustrated state transitions. Prices are schematic, not a market recording.',
        tests: '34 public console tests, passed 19 September 2026',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
