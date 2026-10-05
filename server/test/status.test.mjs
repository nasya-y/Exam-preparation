/* Реалният Claude модул: статусът при зададен ANTHROPIC_API_KEY. Не прави заявки към модел. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let sdkInstalled = true;
try { createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk'); } catch { sdkInstalled = false; }

test('при ANTHROPIC_API_KEY статусът е „apiKey“, без стойността на ключа', { skip: !sdkInstalled && 'изпълни npm install' }, async () => {
  const PORT = 5500 + Math.floor(Math.random() * 100), SECRET = 'sk-ant-test-DO-NOT-LEAK-123';
  const env = { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: SECRET };
  delete env.MEDPANDA_DISABLE_CLAUDE;
  const srv = spawn(process.execPath, ['server/index.mjs'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; srv.stdout.on('data', (d) => { logs += d; }); srv.stderr.on('data', (d) => { logs += d; });
  try {
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); ok = true; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const r = await fetch(`http://127.0.0.1:${PORT}/api/status`, { headers: { 'X-MedPanda': '1' } });
    const text = await r.text(), j = JSON.parse(text);
    assert.equal(j.authKind, 'apiKey');
    assert.equal(j.apiKeyVar, 'ANTHROPIC_API_KEY');
    assert.ok(!text.includes(SECRET) && !text.includes('sk-ant'), 'ключът не се връща към браузъра');
    assert.ok(!/configDirectory|projectsDirectory|email/i.test(text), 'не се връщат пътища или лични данни');
    assert.ok(!logs.includes(SECRET), 'ключът не се логва');
  } finally { srv.kill(); }
});
