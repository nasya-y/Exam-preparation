import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 5390 + Math.floor(Math.random() * 100);
const URL0 = `http://127.0.0.1:${PORT}`;
let srv;

test.before(async () => {
  srv = spawn(process.execPath, ['server/index.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), MEDPANDA_DISABLE_CLAUDE: '1' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(URL0 + '/'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('сървърът не стартира');
});
test.after(() => srv && srv.kill());

const H = { 'X-MedPanda': '1', 'Content-Type': 'application/json' };
const body = { subject: 'chem', topic: 'Т', question: 'Въпрос?', rubric: ['окислител приема електрони'], requiredTerms: ['Окислител'], answer: 'Окислителят приема електрони и се редуцира.' };

test('сервира приложението, но не и други файлове', async () => {
  assert.equal((await fetch(URL0 + '/')).status, 200);
  assert.equal((await fetch(URL0 + '/js/app.js')).status, 200);
  for (const p of ['/package.json', '/server/index.mjs', '/.gitignore', '/js/../package.json', '/node_modules/']) {
    assert.equal((await fetch(URL0 + p)).status, 404, p);
  }
});

test('API изисква собствената заглавка и правилен origin/host', async () => {
  assert.equal((await fetch(URL0 + '/api/status')).status, 403);
  assert.equal((await fetch(URL0 + '/api/status', { headers: H })).status, 200);
  assert.equal((await fetch(URL0 + '/api/grade', { method: 'POST', headers: { ...H, Origin: 'https://evil.example' }, body: JSON.stringify(body) })).status, 403);
  /* fetch() не позволява смяна на Host, затова — http.request (симулира DNS rebinding) */
  const status = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: '/api/status', headers: { 'X-MedPanda': '1', Host: 'evil.example:' + PORT } }, (r) => { r.resume(); resolve(r.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
});

test('без Claude → локално оценяване с ясна причина', async () => {
  const r = await fetch(URL0 + '/api/grade', { method: 'POST', headers: { ...H, Origin: `http://127.0.0.1:${PORT}` }, body: JSON.stringify(body) });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.gradingMode, 'local');
  assert.ok(j.fallbackReason);
  assert.equal(typeof j.score, 'number');
  const s = await (await fetch(URL0 + '/api/status', { headers: H })).json();
  assert.equal(s.connected, false);
  assert.equal(JSON.stringify(s).match(/token|sk-ant|password/i), null);
});

test('невалидни заявки се отхвърлят', async () => {
  assert.equal((await fetch(URL0 + '/api/grade', { method: 'POST', headers: H, body: '{bad' })).status, 400);
  assert.equal((await fetch(URL0 + '/api/grade', { method: 'POST', headers: H, body: JSON.stringify({ ...body, answer: 'кратко' }) })).status, 400);
  assert.equal((await fetch(URL0 + '/api/grade', { method: 'POST', headers: H, body: 'x'.repeat(70000) })).status, 413);
  assert.equal((await fetch(URL0 + '/api/grade', { method: 'POST', headers: { 'X-MedPanda': '1', 'Content-Type': 'text/plain' }, body: '{}' })).status, 400);
});
