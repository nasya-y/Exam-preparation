/* =====================================================================
   Връзка с Claude чрез официалния Claude Agent SDK.

   Автентикацията се прави ИЗЦЯЛО от Claude Code (вграден в SDK-то):
   - вход с Claude абонамент чрез `npm run claude:login` (официалният
     вход на Anthropic в браузъра), или
   - ANTHROPIC_API_KEY в средата на сървъра (ако е зададен, има предимство).
   Този файл никога не чете, не записва, не логва и не връща токени.
   ===================================================================== */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runClaudeCli } from './claude-cli.mjs';
import { validateGrade, buildGradePrompt, GRADE_SCHEMA, SYSTEM_PROMPT } from './grading.mjs';

/* Празна работна папка: Claude няма инструменти и не вижда файловете на проекта. */
const WORKDIR = path.join(os.tmpdir(), 'medpanda-grader');
mkdirSync(WORKDIR, { recursive: true });

export const MODEL_ALIASES = ['', 'sonnet', 'opus', 'haiku'];
const GRADE_TIMEOUT_MS = 150_000;
const TEST_TIMEOUT_MS = 60_000;

let lastCheck = null;          // { ok, at, error } — резултат от последната реална заявка
let statusCache = null;        // { at, value }
let chain = Promise.resolve(); // заявките към Claude се изпълняват една по една

function serialize(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

function baseOptions(extra = {}) {
  return {
    tools: [],                 // без вградени инструменти (без файлове, без команди)
    allowedTools: [],
    settingSources: [],        // не зарежда ~/.claude/settings.json, CLAUDE.md, hooks
    persistSession: false,     // не записва сесии на диска
    cwd: WORKDIR,
    maxTurns: 3,
    env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'medpanda-local/1.0' },
    ...extra
  };
}

const ERR = {
  authentication_failed: 'Claude не е свързан или входът е изтекъл. Изпълни „npm run claude:login“ в терминала.',
  oauth_org_not_allowed: 'Тази организация не позволява вход с Claude акаунт.',
  account_on_hold: 'Claude акаунтът е временно ограничен.',
  verification_required: 'Claude акаунтът изисква потвърждение — влез в claude.ai.',
  billing_error: 'Проблем с плащането/абонамента на Claude акаунта.',
  rate_limit: 'Достигнат е лимитът на абонамента ти. Опитай отново по-късно.',
  overloaded: 'Claude е претоварен в момента. Опитай отново след малко.',
  server_error: 'Временна грешка при Claude. Опитай отново.',
  model_not_found: 'Избраният модел не е достъпен за акаунта ти. Избери „По подразбиране“ в Настройки.',
  invalid_request: 'Claude отхвърли заявката.',
  max_output_tokens: 'Отговорът на Claude беше прекъснат.',
  timeout: 'Claude не отговори навреме.',
  invalid_output: 'Claude върна оценка в неочакван формат.',
  unknown: 'Claude не е достъпен в момента.'
};
export class ClaudeError extends Error {
  constructor(code) { super(ERR[code] || ERR.unknown); this.code = ERR[code] ? code : 'unknown'; }
}

/* Изпълнява една заявка без инструменти и връща резултат или ClaudeError. */
async function run(prompt, options, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let apiError = null, result = null;
  try {
    const q = query({ prompt, options: baseOptions({ ...options, abortController: ac }) });
    for await (const m of q) {
      if (m.type === 'assistant' && m.error) apiError = m.error;
      if (m.type === 'result') result = m;
    }
  } catch (e) {
    if (ac.signal.aborted) throw new ClaudeError('timeout');
    throw new ClaudeError(apiError || 'unknown');
  } finally {
    clearTimeout(timer);
  }
  if (!result || result.subtype !== 'success' || result.is_error) {
    throw new ClaudeError(apiError || (result && result.subtype === 'error_max_structured_output_retries' ? 'invalid_output' : 'unknown'));
  }
  return result;
}

function modelOpt(model) {
  return model && MODEL_ALIASES.includes(model) ? { model } : {};
}

/* Статус: дали има вход (по официалното `claude auth status`) + последната реална проверка. */
export async function getStatus({ fresh = false } = {}) {
  if (!fresh && statusCache && Date.now() - statusCache.at < 30_000) return statusCache.value;
  let login = { loggedIn: false, authMethod: 'none' };
  try {
    const out = await runClaudeCli(['auth', 'status', '--json'], { capture: true, timeoutMs: 20_000 });
    const j = JSON.parse(out);
    login = { loggedIn: !!j.loggedIn, authMethod: String(j.authMethod || 'none'), apiProvider: String(j.apiProvider || '') };
  } catch {
    login = { loggedIn: false, authMethod: 'unknown' };
  }
  const m = login.authMethod.toLowerCase();
  const authKind = !login.loggedIn ? 'none'
    : /api.?key/.test(m) ? 'apiKey'
    : login.apiProvider && login.apiProvider !== 'firstParty' ? 'cloud'
    : 'subscription';
  const value = {
    backend: true,
    loggedIn: login.loggedIn,
    authKind,                                  // subscription | apiKey | cloud | none
    connected: login.loggedIn && (!lastCheck || lastCheck.ok),
    lastCheck
  };
  statusCache = { at: Date.now(), value };
  return value;
}

/* Реална минимална заявка — „Провери връзката“. */
export function testConnection(model) {
  return serialize(async () => {
    try {
      const r = await run('Отговори само с думата: ОК', { ...modelOpt(model), maxTurns: 1 }, TEST_TIMEOUT_MS);
      lastCheck = { ok: true, at: new Date().toISOString(), error: null };
      void r;
    } catch (e) {
      lastCheck = { ok: false, at: new Date().toISOString(), error: e.message, code: e.code };
    }
    statusCache = null;
    return getStatus({ fresh: true });
  });
}

/* Оценяване на отворен въпрос — връща валидиран JSON. */
export function gradeWithClaude(payload, model) {
  return serialize(async () => {
    const r = await run(buildGradePrompt(payload), {
      ...modelOpt(model),
      systemPrompt: SYSTEM_PROMPT,
      outputFormat: { type: 'json_schema', schema: GRADE_SCHEMA }
    }, GRADE_TIMEOUT_MS).catch((e) => {
      lastCheck = { ok: false, at: new Date().toISOString(), error: e.message, code: e.code };
      statusCache = null;
      throw e;
    });
    let raw = r.structured_output;
    if (raw == null) { try { raw = JSON.parse(r.result); } catch { raw = null; } }
    const graded = validateGrade(raw, payload);
    if (!graded) throw new ClaudeError('invalid_output');
    lastCheck = { ok: true, at: new Date().toISOString(), error: null };
    statusCache = null;
    return graded;
  });
}

/* Образцов отговор за 6 — само по елементите от ключа. */
export function modelAnswerWithClaude(payload, model) {
  return serialize(async () => {
    const prompt =
      'Напиши образцов писмен отговор за отлична оценка (6) на въпрос от конкурсния изпит по ' + payload.subjectName +
      ' за медицински университет в България.\n\nТЕМА: ' + payload.topic + '\nВЪПРОС: ' + payload.question +
      '\n\nОтговорът трябва да покрива точно тези елементи от официалния ключ и да не добавя твърдения извън тях:\n- ' +
      payload.rubric.join('\n- ') +
      '\n\nИзисквания: на български; точни научни термини; свързан текст в кратки абзаци, без заглавия, списъци и markdown; около 200–250 думи. Върни само самия отговор.';
    const r = await run(prompt, { ...modelOpt(model), maxTurns: 1 }, GRADE_TIMEOUT_MS);
    return String(r.result || '').replace(/\*\*/g, '').trim().slice(0, 6000);
  });
}
