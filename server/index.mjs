/* =====================================================================
   МедПанда — локален сървър
   - сервира приложението (index.html, css/, js/)
   - /api/* → оценяване чрез Claude Agent SDK, с локален резервен вариант
   Слуша САМО на 127.0.0.1 по подразбиране.
   ===================================================================== */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePayload, LocalGrader } from './grading.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5178;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 64 * 1024;
const LOCAL_NAMES = ['localhost', '127.0.0.1', '[::1]'];

/* Claude модулът се зарежда отделно — ако SDK-то липсва, приложението пак работи с локалното оценяване. */
let claude = null, claudeLoadError = null;
if (process.env.MEDPANDA_DISABLE_CLAUDE === '1') claudeLoadError = 'изключен с MEDPANDA_DISABLE_CLAUDE=1';
else {
  try { claude = await import('./claude.mjs'); }
  catch (e) { claudeLoadError = 'Claude Agent SDK не е инсталиран (изпълни „npm install“).'; }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(data);
}

/* Само заявки от самото приложение на localhost (защита от чужди сайтове и DNS rebinding). */
function allowedApi(req) {
  const host = String(req.headers.host || '');
  const hostName = host.replace(/:\d+$/, '');
  if (!LOCAL_NAMES.includes(hostName) && hostName !== HOST) return false;
  const origin = req.headers.origin;
  if (origin) {
    let u; try { u = new URL(origin); } catch { return false; }
    if (u.protocol !== 'http:' || u.host !== host) return false;
  }
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return req.headers['x-medpanda'] === '1';   // собствена заглавка → чужд сайт не може да я прати без CORS разрешение
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/.test(String(req.headers['content-type'] || ''))) return reject(new Error('type'));
    if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); return reject(new Error('size')); }
    let size = 0, tooBig = false; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) tooBig = true; else chunks.push(c); });
    req.on('end', () => {
      if (tooBig) return reject(new Error('size'));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('json')); }
    });
    req.on('error', reject);
  });
}

const modelOf = (b) => (claude && typeof b.model === 'string' && claude.MODEL_ALIASES.includes(b.model) ? b.model : '');

async function api(req, res, route) {
  if (!allowedApi(req)) return send(res, 403, { error: 'Забранено.' });

  if (route === '/api/status' && req.method === 'GET') {
    if (!claude) return send(res, 200, { backend: true, loggedIn: false, authKind: 'none', connected: false, unavailable: claudeLoadError });
    return send(res, 200, await claude.getStatus());
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Методът не е позволен.' });

  let body;
  try { body = await readJson(req); }
  catch (e) { return e.message === 'size' ? send(res, 413, { error: 'Заявката е твърде голяма.' }) : send(res, 400, { error: 'Невалидно JSON тяло.' }); }

  if (route === '/api/claude/test') {
    if (!claude) return send(res, 200, { backend: true, loggedIn: false, authKind: 'none', connected: false, unavailable: claudeLoadError });
    return send(res, 200, await claude.testConnection(modelOf(body)));
  }

  if (route === '/api/grade') {
    const v = validatePayload(body);
    if (v.error) return send(res, 400, { error: v.error });
    const p = v.value;
    if (claude && body.preferLocal !== true) {
      try {
        const g = await claude.gradeWithClaude(p, modelOf(body));
        console.log(`[оценка] Claude · ${p.subject} · ${g.score}%`);
        return send(res, 200, g);
      } catch (e) {
        console.log(`[оценка] Claude недостъпен (${e.code || 'error'}) → локално оценяване`);
        return send(res, 200, { ...LocalGrader.grade(p), fallbackReason: e.message || 'Claude не е достъпен.' });
      }
    }
    return send(res, 200, { ...LocalGrader.grade(p), fallbackReason: claudeLoadError || 'Избрано е локално оценяване.' });
  }

  if (route === '/api/model-answer') {
    const v = validatePayload({ ...body, answer: 'x'.repeat(20) });
    if (v.error) return send(res, 400, { error: v.error });
    if (!claude) return send(res, 503, { error: claudeLoadError });
    try { return send(res, 200, { text: await claude.modelAnswerWithClaude(v.value, modelOf(body)) }); }
    catch (e) { return send(res, 503, { error: e.message || 'Claude не е достъпен.' }); }
  }
  return send(res, 404, { error: 'Няма такъв адрес.' });
}

/* Статични файлове — само index.html, css/ и js/. */
async function serveStatic(req, res, urlPath) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(ROOT, '.' + rel);
  const relToRoot = path.relative(ROOT, file).split(path.sep).join('/');
  const ok = relToRoot === 'index.html' || /^(css|js)\/[\w.-]+$/.test(relToRoot);
  if (!ok || relToRoot.includes('..')) return send(res, 404, 'Not found', 'text/plain');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) await api(req, res, pathname);
    else await serveStatic(req, res, pathname);
  } catch (e) {
    console.error('[грешка]', e && e.message);
    if (!res.headersSent) send(res, 500, { error: 'Вътрешна грешка.' });
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`;
  console.log(`\n🐼 МедПанда работи на ${url}`);
  if (!LOCAL_NAMES.includes(HOST) && HOST !== 'localhost') console.log('⚠️  Внимание: сървърът слуша извън localhost (HOST=' + HOST + ').');
  console.log(claude ? '🤖 Claude Agent SDK е зареден. Статус: Настройки → Claude AI.' : '🧮 ' + claudeLoadError + ' Ще се използва локално оценяване.');
  console.log('   Вход с Claude абонамент: npm run claude:login\n');
});
