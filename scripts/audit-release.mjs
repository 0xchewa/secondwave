// Audit only committed release files. No network and no printing file contents.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const roots = new Set(['.github', 'src', 'models', 'data', 'test', 'scripts', 'docs']);
const rootFiles = new Set(['.env.example', '.gitattributes', '.gitignore', 'README.md', 'NOTICE.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json', 'tsconfig.json']);
const secrets = [/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\b\d{8,12}:AA[A-Za-z0-9_-]{30,}\b/];
let references = 0;
for (const file of files) {
  assert.ok(file.includes('/') ? roots.has(file.split('/')[0]) : rootFiles.has(file), `Unexpected release path: ${file}`);
  assert.ok(!/(^|\/)(node_modules|\.local|\.env|\.ssh)(\/|$)/.test(file), `Local state is tracked: ${file}`);
  const bytes = await readFile(file);
  if (/\.(png|gif)$/.test(file)) continue;
  const content = (file.endsWith('.gz') ? gunzipSync(bytes, { maxOutputLength: 128 * 1024 ** 2 }) : bytes).toString('utf8');
  assert.ok(secrets.every(re => !re.test(content)), `Credential-shaped value in: ${file}`);
  if (file.endsWith('.md')) {
    const targets = [...content.matchAll(/(?:\]\(([^)]+)\)|(?:src|href)="([^"]+)")/g)].map(m => m[1] ?? m[2]);
    for (const target of targets) {
      if (/^(?:https?:|#|mailto:)/.test(target)) continue;
      const path = target.split('#')[0];
      if (path) { await access(resolve(dirname(file), path)); references++; }
    }
  }
}
const manifest = JSON.parse(await readFile('models/manifest.json', 'utf8'));
for (const [file, expected] of Object.entries(manifest.sourceFiles)) {
  const actual = createHash('sha256').update(await readFile(file)).digest('hex');
  assert.equal(actual, expected, `Pure model source changed: ${file}`);
}
console.log(JSON.stringify({ ok: true, trackedFiles: files.length, localReferences: references, pureModelSources: Object.keys(manifest.sourceFiles).length }, null, 2));
