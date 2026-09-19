// Print the dated, published evaluation. No network, database or training is started.
import { readFile } from 'node:fs/promises';
const { publishedAt, model } = JSON.parse(await readFile(new URL('../data/evidence.json', import.meta.url), 'utf8'));
const e = model.early;
const n = value => value.toLocaleString('en-US');
console.log(`SECOND/WAVE_  |  SAVED MODEL RECORD\nPublished ${publishedAt}\n`);
console.log(`Early Signal  /  ${e.version.split(' / ').at(-1)}`);
console.log(`Train ${n(e.counts.tr)}  >  Calibration ${n(e.counts.ca)}  >  Test ${n(e.counts.te)}`);
console.log(`Causal audit  ${n(e.audit.events)} events  /  ${e.audit.missing} missing`);
console.log(`Replay parity ${n(e.audit.restartParity)} / ${n(e.audit.restartParity)}`);
console.log(`ROC-AUC       ${e.candidate.rocAuc.toFixed(6)}`);
console.log(`Top 10% lift  ${e.candidate.topDecileLift.toFixed(2)}x`);
console.log(`Brier score   ${e.candidate.brier.toFixed(6)}`);
console.log(`Test role     ${e.testRole}`);
console.log(`\nRank enabled: ${e.rankEnabled}  /  Approved probability: ${e.probabilityEnabled}`);
console.log('Second Wave   /  observed stages + frozen scenario boundaries');
console.log('\nSource: data/evidence.json');
