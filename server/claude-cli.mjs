/* =====================================================================
   Стартира непроменения Claude Code, който идва вграден в Claude Agent SDK,
   САМО за командите `auth login | status | logout`.

   `npm run claude:login`  → официалният вход на Anthropic (отваря браузър)
   `npm run claude:status` → дали има вход
   `npm run claude:logout` → изход

   Входът се извършва изцяло от Claude Code; токените се пазят от него
   (в системния keychain или ~/.claude/), никога в този проект.
   ===================================================================== */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ALLOWED = { login: ['--claudeai'], status: ['--json', '--text'], logout: [] };

/* Намира вградения бинарен файл на Claude Code; иначе `claude` от PATH. */
export function claudeBinary() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const base = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  for (const pkg of [base, base + '-musl']) {
    try {
      const dir = path.dirname(require.resolve(pkg + '/package.json'));
      const bin = path.join(dir, 'claude' + ext);
      if (existsSync(bin)) return bin;
    } catch { /* няма такъв пакет за тази платформа */ }
  }
  return 'claude' + ext;
}

export function runClaudeCli(args, { capture = false, timeoutMs = 0 } = {}) {
  const [cmd, sub, ...rest] = args;
  if (cmd !== 'auth' || !ALLOWED[sub] || rest.some((a) => !ALLOWED[sub].includes(a))) {
    return Promise.reject(new Error('Позволени са само: auth login | auth status | auth logout'));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(claudeBinary(), args, { stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'inherit', env: process.env });
    let out = '';
    let timer = null;
    if (timeoutMs) timer = setTimeout(() => child.kill(), timeoutMs);
    if (capture) child.stdout.on('data', (d) => { out += d; if (out.length > 65536) child.kill(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (capture) resolve(out); else code === 0 ? resolve('') : reject(new Error('exit ' + code));
    });
  });
}

/* Директно стартиране: node server/claude-cli.mjs auth login */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args[1] === 'login' && !args.includes('--claudeai')) args.push('--claudeai');
  runClaudeCli(args).then(() => {
    if (args[1] === 'login') console.log('\n✅ Готово. Върни се в приложението и натисни „Провери връзката“ в Настройки.');
  }).catch((e) => { console.error('❌', e.message); process.exit(1); });
}
