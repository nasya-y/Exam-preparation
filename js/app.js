/* =====================================================================
   МедПанда — Биология и Химия за МУ
   Локално приложение за един потребител. Всичко се пази в localStorage.
   ===================================================================== */
(function () {
'use strict';

/* ================= КОНСТАНТИ ================= */
var LS_STATE = 'mu-prep:state:v1';
var LS_OLD_KEY = 'mu-prep:anthropic-key';   // от старата версия: API ключ в браузъра — вече се изтрива
/* AI оценяването минава през локалния сървър (server/) и официалния Claude Agent SDK.
   Браузърът никога не вижда ключове или токени. */
var BACKEND = /^https?:$/.test(location.protocol);
var MODEL_CHOICES = [
  ['', 'По подразбиране за акаунта (препоръчано)'],
  ['sonnet', 'Claude Sonnet — бърз и точен'],
  ['opus', 'Claude Opus — най-задълбочен, изразходва лимита по-бързо'],
  ['haiku', 'Claude Haiku — най-бърз, по-повърхностен']
];
var OPEN_MAX_XP = 50;   // максимален XP за отворен въпрос; печелиш score% от него
/* ранг според нивото; нивото расте с XP */
var RANKS = [
  [1, 'Санитар', '🧹'],
  [3, 'Медицински кандидат', '📚'],
  [5, 'Студент', '🎓'],
  [7, 'Старши студент', '📖'],
  [9, 'Стажант', '🩺'],
  [11, 'Лекар', '💉'],
  [14, 'Доктор', '👨‍⚕️'],
  [17, 'Специализант', '🔬'],
  [20, 'Медицински експерт', '🏅']
];
var STREAK_MS = [3, 7, 14, 30, 50, 100];
var SRS_STEPS = [1, 3, 7];
var LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];
var XP = { practice: 10, challenge: 15, term: 15, termTypo: 8, hint: 5, retry: 5, review: 10, lessonBonus: 10, perfect: 10, exam: 6, bossFirst: 150, bossAgain: 40, block: 100 };
var RAPID_N = 20, BOSS_N = 20, BOSS_MIN = 25, TERMS_N = 12, REVIEW_N = 15, MASTER = 80;
var GOOD = ['Правилно!', 'Браво!', 'Точно така!', 'Отлично!', 'Като истински лекар!', 'Чудесно!'];
var BAD = ['Не се отказвай!', 'Почти! Ето защо:', 'Грешките са част от ученето 💪', 'Запомни това — ще го видиш пак.', 'Нищо страшно — сега ще го научиш.'];
var ICONS = {
  bio: { p1: '🔤', p2: '🪜', c1: '💧', c2: '🍞', c3: '🧶', c4: '🧬', c5: '🦠', c6: '🧫', c7: '🫧', c8: '📦', c9: '⚡', c10: '🎯',
         b1: '🔋', b2: '🍬', b3: '🔄', b4: '⚙️', b5: '🌿', b6: '📑', b7: '📝', b8: '🧩', b9: '➗', b10: '🔀' },
  chem: { s1: '🔤', s2: '🧮', g1: '⚛️', g2: '📊', g3: '🔗', g4: '📐', g5: '🧪', g6: '💧', g7: '🌫️', g8: '⚡', g9: '🍋',
          g10: '🧂', g11: '⏱️', g12: '⚖️', g13: '🔥', g14: '🔁' }
};

/* ================= ДАННИ ================= */
var RAW = window.SUBJECT_DATA || {};
var CUSTOM = window.CUSTOM_DATA || {};
var SUBJ = {
  bio: { id: 'bio', name: 'Биология за МУ', short: 'Биология', icon: '🧬', acc: 'dna',
    blocks: { '0': 'Основи — започни оттук', 'I': 'Клетката и молекулите', 'II': 'Процесите в клетката' },
    order: ['0', 'I', 'II'], topics: [] },
  chem: { id: 'chem', name: 'Химия', short: 'Химия', icon: '⚗️', acc: 'flask',
    blocks: { '0': 'Стартова площадка', 'I': 'Обща химия', 'II': 'Неорганична химия', 'III': 'Органична химия' },
    order: ['0', 'I', 'II', 'III'], topics: [] }
};
function blockLabel(b) { return b === '0' ? 'Блок 0' : 'Блок ' + b; }

function normQ(q) { return { s: q.s, o: q.o, a: q.a, why: q.why || q.e || '', trap: q.trap || '' }; }
function normTopic(raw) {
  var t = {
    id: raw.id, no: raw.no, block: String(raw.block || '0'), title: raw.title || 'Без заглавие',
    brief: raw.brief || '', anchor: raw.anchor || raw.image || '', diagram: null,
    facts: (raw.facts || []).slice(), terms: (raw.terms || []).map(function (x) { return [x[0], x[1]]; }),
    notes: (raw.traps || []).filter(function (x) { return typeof x === 'string'; }),
    twins: [], skeleton: raw.skeleton || null, q: [], open: []
  };
  (raw.q || []).forEach(function (q) { t.q.push(normQ(q)); });
  (raw.open || []).forEach(function (o) { t.open.push({ p: o.p, must: o.must || [], cues: o.cues || null }); });
  if (raw.svg) t.diagram = { html: raw.svg, cap: raw.cap || '', kind: 'chem' };
  return t;
}
(function buildData() {
  var B = RAW.bio || { topics: [], traps: [], cues: {}, dg: {} };
  (B.topics || []).forEach(function (raw) {
    var t = normTopic(raw);
    if (raw.dg && B.dg && B.dg[raw.dg]) t.diagram = { html: B.dg[raw.dg], cap: raw.dgcap || '', kind: 'bio' };
    t.open.forEach(function (o, i) { o.cues = (B.cues || {})[t.id + '-o' + i] || null; });
    t.twins = (B.traps || []).filter(function (x) { return x.t === t.id; }).map(function (x) { return { a: x.a, b: x.b, n: x.n }; });
    SUBJ.bio.topics.push(t);
  });
  var C = RAW.chem || { topics: [], extra: {} };
  (C.topics || []).forEach(function (raw) {
    var t = normTopic(raw), e = (C.extra || {})[t.id];
    if (e) {
      if (e.image) t.anchor = e.image;
      if (e.skeleton) t.skeleton = e.skeleton;
      (e.pairs || []).forEach(function (p) { t.twins.push({ a: p[0], b: p[1], n: p[2] }); });
      if (e.write) t.open.push({ p: e.write, must: e.skeleton || [], cues: null });
      if (e.q) t.q.push(normQ(e.q));
    }
    SUBJ.chem.topics.push(t);
  });
  ['bio', 'chem'].forEach(function (sid) {
    var X = CUSTOM[sid]; if (!X) return;
    var S0 = SUBJ[sid];
    (X.topics || []).forEach(function (raw) { S0.topics.push(normTopic(raw)); });
    function target(it) {
      var t = topicById(sid, it.topic); if (t) return t;
      var blk = String(it.block || S0.order[S0.order.length - 1]), id = 'extra-' + blk;
      t = topicById(sid, id);
      if (!t) { t = normTopic({ id: id, no: '+', block: blk, title: 'Допълнителни материали' }); S0.topics.push(t); }
      return t;
    }
    (X.terms || []).forEach(function (x) { if (x.term && x.def) target(x).terms.push([x.term, x.def]); });
    (X.open || []).forEach(function (x) { if (x.p) target(x).open.push({ p: x.p, must: x.must || [], cues: x.cues || null }); });
    (X.q || []).forEach(function (x) { if (x.s && x.o) target(x).q.push(normQ(x)); });
  });
  ['bio', 'chem'].forEach(function (sid) {
    var S0 = SUBJ[sid];
    S0.topics = S0.order.reduce(function (acc, b) { return acc.concat(S0.topics.filter(function (t) { return t.block === b; })); }, []);
  });
})();

function topicById(sid, id) { var a = SUBJ[sid].topics; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
function K(sid, tid, type, i) { return sid + '|' + tid + '|' + type + '|' + i; }
function item(key) {
  var p = String(key).split('|'); if (p.length !== 4 || !SUBJ[p[0]]) return null;
  var t = topicById(p[0], p[1]); if (!t) return null;
  var i = +p[3], d = p[2] === 'q' ? t.q[i] : p[2] === 't' ? t.terms[i] : p[2] === 'o' ? t.open[i] : null;
  if (!d) return null;
  return { key: key, sid: p[0], t: t, type: p[2], i: i, d: d };
}
function keysOf(sid, type, filter) {
  var out = [];
  SUBJ[sid].topics.forEach(function (t) {
    if (filter && !filter(t)) return;
    (type === 'q' ? t.q : type === 't' ? t.terms : t.open).forEach(function (_, i) { out.push(K(sid, t.id, type, i)); });
  });
  return out;
}
function topicIcon(sid, t) { return (ICONS[sid] || {})[t.id] || '📘'; }

/* ================= СЪСТОЯНИЕ ================= */
function freshState() {
  return {
    v: 2, subj: 'bio', xp: 0, xpDays: {}, days: {}, bestStreak: 0, mastered: 0,
    stats: { answered: 0, correct: 0 },
    cnt: { lessons: 0, lessonsBio: 0, lessonsChem: 0, perfect: 0, terms: 0, ai: 0, ai90: 0, bossWins: 0, mocks: 0, mock55: 0, comboMax: 0 },
    mcq: {}, terms: {}, opens: {}, srs: {}, boss: {}, mocks: [], rapidBest: {},
    lessons: {}, blocksMastered: {}, ach: {}, streakMs: {},
    settings: { model: '', goalXP: 30, freeNav: false, calm: false }
  };
}
var S = load();
function load() {
  var s = null;
  try { s = JSON.parse(localStorage.getItem(LS_STATE) || 'null'); } catch (e) { s = null; }
  var f = freshState();
  if (!s || typeof s !== 'object') return f;
  for (var k in f) if (s[k] === undefined) s[k] = f[k];
  s.settings = Object.assign({}, f.settings, s.settings || {});
  s.cnt = Object.assign({}, f.cnt, s.cnt || {});
  s.stats = Object.assign({}, f.stats, s.stats || {});
  if (!SUBJ[s.subj]) s.subj = 'bio';
  if (!MODEL_CHOICES.some(function (m) { return m[0] === s.settings.model; })) s.settings.model = '';
  s.v = 2;
  return s;
}
var saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 150); }
function saveNow() { try { localStorage.setItem(LS_STATE, JSON.stringify(S)); } catch (e) { } }
window.addEventListener('beforeunload', saveNow);
/* Стари версии пазеха API ключ в localStorage — изтриваме го. */
var oldKeyRemoved = false;
try { if (localStorage.getItem(LS_OLD_KEY) != null) { localStorage.removeItem(LS_OLD_KEY); oldKeyRemoved = true; } } catch (e) { }

/* UI състояние (не се пази) */
var U = { v: 'home', tid: null, oKey: null, L: null, rapid: null, exam: null, timer: null, celQ: [], celOn: false, newAch: [],
  grading: {}, showKey: {}, showCues: {}, model: {}, scope: 'all', mockN: 20, mockBoth: false, examAll: false,
  ai: { state: BACKEND ? 'checking' : 'offline' } };

/* ================= ПОМОЩНИ ================= */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function plain(s) { return String(s || '').replace(/<[^>]*>/g, ''); }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { return dstr(new Date()); }
function addDays(s, n) { var p = s.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return dstr(d); }
function fmtDate(s) { var p = s.split('-'); return +p[2] + '.' + p[1]; }
var WD = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
function wday(s) { var p = s.split('-'); return WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]; }
function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + pad(s % 60); }
function pl(n, one, many) { return n === 1 ? one : many; }
function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
function cur() { return SUBJ[S.subj]; }
function markOf(p) { return Math.round((2 + 4 * p) * 100) / 100; }
function markWord(n) { if (n >= 5.5) return 'Отличен'; if (n >= 4.5) return 'Много добър'; if (n >= 3.5) return 'Добър'; if (n >= 3) return 'Среден'; return 'Слаб'; }
function calm() { return S.settings.calm || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function P(mood, acc, size, cls) { return window.panda(mood, acc, { size: size, cls: cls, scrub: S.subj === 'chem' ? '#6D5DF6' : '#12B886' }); }
function ring(p, inner, size, color) { return '<div class="ring" style="--p:' + Math.max(0, Math.min(100, p)) + (size ? ';--s:' + size + 'px' : '') + (color ? ';--c:' + color : '') + '">' + inner + '</div>'; }
function bar(p, cls) { return '<div class="bar ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, p)) + '%"></i></div>'; }

function norm(x) {
  return String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[‐‑–—]/g, '-')
    .replace(/[.,;:!?"'`„“”«»()\[\]]/g, ' ').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  var prev = [], curr, i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    curr = [i];
    for (j = 1; j <= b.length; j++) curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = curr;
  }
  return prev[b.length];
}
/* „А / Б“ → А или Б; поясненията в скоби не са задължителни */
function termAnswers(term) {
  var out = [];
  String(term).split('/').forEach(function (part) {
    var p = part.trim(); if (!p) return;
    var stripped = norm(p.replace(/\s*\([^)]*\)/g, ''));
    if (stripped) out.push(stripped);
    out.push(norm(p));
    (p.match(/\(([^)]*)\)/g) || []).forEach(function (m) { var inner = norm(m.slice(1, -1)); if (inner.length >= 3) out.push(inner); });
  });
  return out.filter(function (x, i) { return x && out.indexOf(x) === i; });
}
function checkTerm(given, term) {
  var g = norm(given), alts = termAnswers(term);
  if (!g) return { ok: false, typo: false };
  if (alts.indexOf(g) >= 0) return { ok: true, typo: false };
  var best = 99, bestLen = 0;
  alts.forEach(function (a) { var d = lev(g, a); if (d < best) { best = d; bestLen = a.length; } });
  if ((bestLen >= 5 && best <= 1) || (bestLen >= 10 && best <= 2)) return { ok: true, typo: true };
  return { ok: false, typo: false };
}
function maskDef(def, term) {
  var out = def;
  String(term).split('/').forEach(function (part) {
    var w = part.replace(/\s*\([^)]*\)/g, '').trim();
    if (w.length < 4) return;
    out = out.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<span class="blank"></span>');
  });
  return out;
}

/* ================= ПРОГРЕСИЯ ================= */
function xpForLevel(L) { return 30 * L * (L - 1); }
function levelOf(xp) { return Math.max(1, Math.floor((1 + Math.sqrt(1 + 4 * xp / 30)) / 2)); }
function rankOf(L) { var r = RANKS[0]; RANKS.forEach(function (x) { if (L >= x[0]) r = x; }); return r; }
function nextRankOf(L) { for (var i = 0; i < RANKS.length; i++) if (RANKS[i][0] > L) return RANKS[i]; return null; }
function goal() { return S.settings.goalXP; }
function todayXP() { return S.xpDays[today()] || 0; }
function dayDone(d) { return (S.xpDays[d] || 0) >= goal(); }
function streak() {
  var d = today(), n = 0;
  if (!dayDone(d)) d = addDays(d, -1);
  while (dayDone(d)) { n++; d = addDays(d, -1); }
  return n;
}
/* единствената точка, през която влизат XP — тук се засичат цел, серия и нива */
function addXP(xp, units) {
  var t = today(), before = S.xpDays[t] || 0, oldL = levelOf(S.xp), oldR = rankOf(oldL);
  xp = Math.max(0, Math.round(xp || 0));
  S.xp += xp; S.xpDays[t] = before + xp;
  if (units) S.days[t] = (S.days[t] || 0) + units;
  if (before < goal() && before + xp >= goal()) {
    var st = streak();
    if (st > S.bestStreak) S.bestStreak = st;
    if (STREAK_MS.indexOf(st) >= 0 && !S.streakMs[st]) {
      S.streakMs[st] = t;
      celebrate({ mood: 'celebrate', acc: 'steth', title: '🔥 ' + st + ' дни серия!', sub: 'Д-р Панда е впечатлен. Ритъмът ти е като на здраво сърце — продължавай!', confetti: true });
    } else toast('🔥 Дневната цел е изпълнена! Серия: ' + st + ' ' + pl(st, 'ден', 'дни'), 'gold');
  }
  var nl = levelOf(S.xp);
  if (nl > oldL) {
    var nr = rankOf(nl);
    celebrate({ mood: 'celebrate', acc: 'cap', title: 'НОВО НИВО!', big: 'Ниво ' + nl,
      sub: nr[1] !== oldR[1] ? oldR[2] + ' ' + oldR[1] + ' → ' + nr[2] + ' ' + nr[1] : 'Още малко и ставаш ' + ((nextRankOf(nl) || nr)[1]) + '!', confetti: true });
  }
  checkAch(); save(); paintChrome();
}
function logAnswer(ok) { S.stats.answered++; if (ok) S.stats.correct++; }

/* ================= ПОСТИЖЕНИЯ ================= */
var ACH = [
  { id: 'first', b: '🩺', t: 'Първа визитация', d: 'Завърши първия си урок', f: function () { return S.cnt.lessons >= 1; } },
  { id: 'l10', b: '📚', t: 'Дежурство', d: 'Завърши 10 урока', f: function () { return S.cnt.lessons >= 10; } },
  { id: 'l30', b: '🏥', t: 'Главен лекар', d: 'Завърши 30 урока', f: function () { return S.cnt.lessons >= 30; } },
  { id: 'perfect', b: '🎯', t: 'Безупречна диагноза', d: 'Урок без нито една грешка', f: function () { return S.cnt.perfect >= 1; } },
  { id: 'both', b: '🧪', t: 'Двоен специалист', d: 'Урок и по биология, и по химия', f: function () { return S.cnt.lessonsBio >= 1 && S.cnt.lessonsChem >= 1; } },
  { id: 's3', b: '🔥', t: 'Пулсът се усеща', d: 'Серия от 3 дни', f: function () { return Math.max(S.bestStreak, streak()) >= 3; } },
  { id: 's7', b: '💓', t: 'Седмица в клиниката', d: 'Серия от 7 дни', f: function () { return Math.max(S.bestStreak, streak()) >= 7; } },
  { id: 's30', b: '❤️‍🔥', t: 'Желязно сърце', d: 'Серия от 30 дни', f: function () { return Math.max(S.bestStreak, streak()) >= 30; } },
  { id: 'xp1k', b: '⭐', t: 'Хиляда точки', d: 'Събери 1000 XP', f: function () { return S.xp >= 1000; } },
  { id: 'combo10', b: '⚡', t: 'Реанимация', d: 'Комбо 10 в Бърз огън', f: function () { return S.cnt.comboMax >= 10; } },
  { id: 'terms50', b: '🔤', t: 'Медицински речник', d: '50 верни термина', f: function () { return S.cnt.terms >= 50; } },
  { id: 'ai1', b: '🤖', t: 'Пред комисията', d: 'Първи AI-оценен отговор', f: function () { return S.cnt.ai >= 1; } },
  { id: 'ai90', b: '📝', t: 'Чиста шестица', d: '90%+ на отворен въпрос', f: function () { return S.cnt.ai90 >= 1; } },
  { id: 'boss', b: '👑', t: 'Победител', d: 'Победи шеф на блок', f: function () { return S.cnt.bossWins >= 1; } },
  { id: 'block', b: '🏆', t: 'Владетел на блока', d: 'Овладей цял блок (' + MASTER + '%+)', f: function () { return Object.keys(S.blocksMastered).length >= 1; } },
  { id: 'mock', b: '🎲', t: 'Пробен изпит', d: 'Завърши тест на случаен принцип', f: function () { return S.cnt.mocks >= 1; } },
  { id: 'mock55', b: '🎓', t: 'Отличник', d: 'Оценка 5.50+ на тест', f: function () { return S.cnt.mock55 >= 1; } },
  { id: 'fix10', b: '💪', t: 'Учи се от грешките', d: 'Овладей 10 грешки', f: function () { return S.mastered >= 10; } }
];
function checkAch() {
  ACH.forEach(function (a) {
    if (S.ach[a.id] || !a.f()) return;
    S.ach[a.id] = today(); U.newAch.push(a);
    toast(a.b + ' Ново постижение: „' + a.t + '“', 'ach');
  });
}

/* ================= ГРЕШКИ / ПОВТОРЕНИЕ ================= */
function record(key, ok) {
  var r = S.srs[key];
  if (!ok) {
    S.srs[key] = { step: 0, due: addDays(today(), SRS_STEPS[0]), miss: (r ? r.miss : 0) + 1, added: r ? r.added : today() };
  } else if (r && r.due <= today()) {
    r.step++;
    if (r.step >= SRS_STEPS.length) { delete S.srs[key]; S.mastered++; toast('✅ Овладяно — махнато от „Грешките ми“'); }
    else r.due = addDays(today(), SRS_STEPS[r.step]);
  }
  save();
}
function mistakes(sid) { return Object.keys(S.srs).filter(function (k) { return item(k) && (!sid || k.indexOf(sid + '|') === 0); }); }
function dueMistakes(sid) { var t = today(); return mistakes(sid).filter(function (k) { return S.srs[k].due <= t; }); }

/* ================= ОВЛАДЯВАНЕ ================= */
function topicMastery(sid, t) {
  var ok = 0, n = 0, qok = 0, tok = 0;
  t.q.forEach(function (_, i) { n++; if (S.mcq[K(sid, t.id, 'q', i)] === 1) { ok++; qok++; } });
  t.terms.forEach(function (_, i) { n++; var r = S.terms[K(sid, t.id, 't', i)]; if (r && r.ok) { ok++; tok++; } });
  t.open.forEach(function (_, i) { n++; var r = S.opens[K(sid, t.id, 'o', i)]; if (r && r.best) ok += r.best / 100; });
  return { pct: n ? Math.round(100 * ok / n) : 0, qok: qok, qn: t.q.length, tok: tok, tn: t.terms.length };
}
function blockMastery(sid, b) {
  var sum = 0, n = 0, nq = 0;
  SUBJ[sid].topics.forEach(function (t) { if (t.block !== b) return; sum += topicMastery(sid, t).pct; n++; nq += t.q.length; });
  return { pct: n ? Math.round(sum / n) : 0, n: n, nq: nq };
}
function subjMastery(sid) {
  var ts = SUBJ[sid].topics; if (!ts.length) return 0;
  return Math.round(ts.reduce(function (s, t) { return s + topicMastery(sid, t).pct; }, 0) / ts.length);
}
function lessonDone(sid, tid) { var l = S.lessons[sid + '|' + tid]; return !!(l && l.done); }
function topicStatus(sid, t, idx) {
  var m = topicMastery(sid, t), done = lessonDone(sid, t.id);
  if (m.pct >= MASTER) return 'done';
  if (done || m.pct > 0) return 'prog';
  var ts = SUBJ[sid].topics;
  if (S.settings.freeNav || idx === 0 || lessonDone(sid, ts[idx - 1].id) || topicMastery(sid, ts[idx - 1]).pct >= MASTER) return 'new';
  return 'locked';
}
function nextTopic(sid) {
  var ts = SUBJ[sid].topics;
  for (var i = 0; i < ts.length; i++) if (!lessonDone(sid, ts[i].id) && topicStatus(sid, ts[i], i) !== 'locked') return ts[i];
  for (i = 0; i < ts.length; i++) if (topicMastery(sid, ts[i]).pct < MASTER) return ts[i];
  return ts[0];
}
function checkBlocks(sid) {
  SUBJ[sid].order.forEach(function (b) {
    var m = blockMastery(sid, b), k = sid + '|' + b;
    if (!m.n || m.pct < MASTER || S.blocksMastered[k]) return;
    S.blocksMastered[k] = today();
    celebrate({ mood: 'hero', acc: 'steth', title: '🏆 БЛОКЪТ Е ОВЛАДЯН!', big: SUBJ[sid].icon + ' ' + blockLabel(b) + ' · ' + SUBJ[sid].blocks[b], sub: '+' + XP.block + ' XP бонус. Д-р Панда сваля шапка!', confetti: true });
    addXP(XP.block, 0);
  });
}
function lessonEstimate(t) {
  var np = Math.min(4, Math.ceil(t.q.length / 2)), nc = Math.min(3, t.q.length - np), nt = Math.min(3, t.terms.length);
  return XP.lessonBonus + np * XP.practice + nc * XP.challenge + nt * XP.term;
}

/* ================= ПРАЗНУВАНЕ / СЪОБЩЕНИЯ ================= */
function toast(msg, kind) {
  var box = document.getElementById('toasts'), el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : ''); el.textContent = msg; box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(function () { el.remove(); }, kind ? 3800 : 2400);
}
function celebrate(c) { U.celQ.push(c); setTimeout(flushCel, 0); }
function busyFlow() {
  return (U.v === 'lesson' && U.L && !U.L.done) || (U.v === 'rapid' && U.rapid && U.rapid.at < U.rapid.list.length) || (U.exam && !U.exam.done);
}
function flushCel() {
  var ov = document.getElementById('overlay');
  if (U.celOn || ov.innerHTML || busyFlow() || !U.celQ.length) return;
  var c = U.celQ.shift();
  U.celOn = true;
  ov.innerHTML = '<div class="ov"><div class="sheet celebrate">' + P(c.mood, c.acc, null) +
    '<h2>' + esc(c.title) + '</h2>' + (c.big ? '<div class="big">' + esc(c.big) + '</div>' : '') +
    (c.sub ? '<p class="muted" style="font-weight:700">' + esc(c.sub) + '</p>' : '') +
    '<button class="btn block big mt" id="primary" data-act="celClose">Продължи</button></div></div>';
  if (c.confetti) confetti();
  var b = document.getElementById('primary'); if (b) b.focus();
}
function confetti() {
  if (calm()) return;
  var box = document.createElement('div'), cols = ['#12B886', '#6D5DF6', '#FFC233', '#FF7A1A', '#FF5A6E', '#0EA5E9', '#9B5DE5'], h = '';
  box.className = 'confetti';
  for (var i = 0; i < 60; i++) h += '<i style="left:' + Math.random() * 100 + '%;background:' + pick(cols) + ';animation-duration:' + (1.6 + Math.random() * 1.6).toFixed(2) + 's;animation-delay:' + (Math.random() * 0.5).toFixed(2) + 's;transform:rotate(' + Math.round(Math.random() * 180) + 'deg)"></i>';
  box.innerHTML = h; document.body.appendChild(box);
  setTimeout(function () { box.remove(); }, 3800);
}
function sheet(html) { document.getElementById('overlay').innerHTML = '<div class="ov" data-act="ovBg"><div class="sheet">' + html + '</div></div>'; }
function closeOverlay() { document.getElementById('overlay').innerHTML = ''; U.celOn = false; setTimeout(flushCel, 50); }

/* ================= AI ОЦЕНЯВАНЕ (локален сървър) =================
   Браузър → локален сървър (server/) → Claude Agent SDK → Claude акаунт.
   Ако Claude не е достъпен, сървърът (или браузърът, ако сървър няма)
   оценява локално по ключа — и това се показва ясно.                    */
function apiCall(url, body, timeoutMs) {
  if (!BACKEND) return Promise.reject(new Error('offline'));
  var ac = window.AbortController ? new AbortController() : null, timer = ac ? setTimeout(function () { ac.abort(); }, timeoutMs || 20000) : null;
  var headers = { 'X-MedPanda': '1' };
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(url, { method: body ? 'POST' : 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined, signal: ac ? ac.signal : undefined, cache: 'no-store' })
    .then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    })
    .then(function (j) { if (timer) clearTimeout(timer); return j; }, function (e) { if (timer) clearTimeout(timer); throw e; });
}
function applyStatus(j) {
  U.ai = { state: j.connected ? 'connected' : 'disconnected', loggedIn: !!j.loggedIn, authKind: j.authKind || 'none',
    lastCheck: j.lastCheck || null, unavailable: j.unavailable || null };
}
function refreshAI(test) {
  if (!BACKEND) { U.ai = { state: 'offline' }; return Promise.resolve(); }
  U.ai.busy = true;
  if (['settings', 'open'].indexOf(U.v) >= 0) render();
  return apiCall(test ? '/api/claude/test' : '/api/status', test ? { model: S.settings.model } : null, test ? 75000 : 25000)
    .then(applyStatus, function () { U.ai = { state: 'offline' }; })
    .then(function () { U.ai.busy = false; if (['settings', 'open', 'home', 'lesson'].indexOf(U.v) >= 0) render(); });
}
function aiReady() { return U.ai.state === 'connected'; }
var AUTH_KIND = { subscription: 'Claude абонамент (Pro/Max)', apiKey: 'API ключ от средата на сървъра', cloud: 'облачен доставчик', none: '' };
function aiStatusHTML() {
  var a = U.ai, dot, txt;
  if (a.busy || a.state === 'checking') { dot = '<span class="spin"></span>'; txt = 'Проверявам…'; }
  else if (a.state === 'offline') { dot = '⚪'; txt = 'Локалният сървър не работи'; }
  else if (a.state === 'connected') { dot = '🟢'; txt = 'Свързан' + (AUTH_KIND[a.authKind] ? ' · ' + AUTH_KIND[a.authKind] : ''); }
  else if (a.loggedIn) { dot = '🟠'; txt = 'Има вход, но последната проверка е неуспешна'; }
  else { dot = '🔴'; txt = 'Не е свързан'; }
  return '<span class="aistatus">' + dot + ' <b>' + esc(txt) + '</b></span>';
}
/* Задължителни термини: само термините от темата, които присъстват в официалния ключ. */
function requiredTermsFor(it) {
  var src = it.d.must.map(plain).join(' ');
  return it.t.terms.map(function (x) { return x[0]; }).filter(function (name) { return window.LocalGrader.anchored(name, src); }).slice(0, 30);
}
function gradePayload(it, answer) {
  return { subject: it.sid, topic: plain(it.t.title), question: plain(it.d.p), rubric: it.d.must.map(plain),
    requiredTerms: requiredTermsFor(it), answer: answer, maxScore: 100, model: S.settings.model,
    preferLocal: U.ai.state === 'disconnected' && !U.ai.loggedIn };
}
function strList(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x.trim(); }).slice(0, 12) : []; }
/* Проверява структурата и превежда стари записи (от версията с API ключ) към новия формат. */
function normalizeGrade(g) {
  if (!g || typeof g !== 'object') return null;
  var score = Math.round(Number(g.score));
  if (!isFinite(score)) return null;
  score = Math.max(0, Math.min(100, score));
  var legacy = !Array.isArray(g.feedback) && (g.summary != null || g.missed_terms != null);
  var out = {
    score: score, xpPercent: score, passed: typeof g.passed === 'boolean' ? g.passed : score >= 60,
    feedback: legacy ? strList([g.summary].concat(g.advice || [])) : strList(g.feedback),
    missedTerms: strList(legacy ? g.missed_terms : g.missedTerms),
    correctConcepts: strList(legacy ? g.covered : g.correctConcepts),
    missedConcepts: strList(legacy ? g.missed : g.missedConcepts),
    incorrectConcepts: strList(legacy ? g.errors : g.incorrectConcepts),
    gradingMode: g.gradingMode === 'local' ? 'local' : 'claude',
    fallbackReason: typeof g.fallbackReason === 'string' ? g.fallbackReason.slice(0, 300) : null
  };
  ['xp', 'at', 'model', 'reviewAdded'].forEach(function (k) { if (g[k] != null) out[k] = g[k]; });
  return out;
}

/* ================= НАВИГАЦИЯ И РАМКА ================= */
var NAV = [
  ['home', '🏠', 'Начало'], ['bio', '🧬', 'Биология за МУ'], ['chem', '⚗️', 'Химия'], ['mistakes', '❤️', 'Грешките ми'], null,
  ['rapid', '🔥', 'Бърз огън'], ['terms', '🎯', 'Назови термина'], ['open', '🤖', 'AI отворени въпроси'], ['boss', '👑', 'Шефът на блока'], ['mock', '🎲', 'Тест на случаен принцип'], null,
  ['profile', '🏆', 'Профил / Прогрес'], ['settings', '⚙️', 'Настройки']
];
var TABS = [['home', '🏠', 'Начало'], ['bio', '🧬', 'Биология'], ['chem', '⚗️', 'Химия'], ['mistakes', '❤️', 'Грешки'], ['more', '☰', 'Още']];
var app = document.getElementById('app');
function navOn(v) {
  if (U.v === v) return true;
  if ((U.v === 'topic' || U.v === 'lesson') && v === S.subj) return true;
  return false;
}
function paintChrome() {
  document.body.setAttribute('data-subj', S.subj);
  document.body.classList.toggle('focus', U.v === 'lesson' || (U.v === 'rapid' && !!U.rapid && U.rapid.at < U.rapid.list.length) || (!!U.exam && !U.exam.done));
  document.body.classList.toggle('calm', !!S.settings.calm);
  var due = dueMistakes().length, st = streak(), L = levelOf(S.xp);
  var logo = '<button class="logo" data-act="go" data-v="home">' + window.panda('happy', 'steth', {}) + '<b>Мед<span>Панда</span></b></button>';
  document.getElementById('side').innerHTML = logo + NAV.map(function (n) {
    if (!n) return '<div class="navsep"></div>';
    return '<button class="navlink' + (navOn(n[0]) ? ' on' : '') + '" data-act="go" data-v="' + n[0] + '"><span class="i">' + n[1] + '</span>' + n[2] +
      (n[0] === 'mistakes' && due ? '<span class="dot">' + due + '</span>' : '') + '</button>';
  }).join('');
  document.getElementById('topbar').innerHTML = logo + '<div class="chips">' +
    '<span class="chip fire' + (dayDone(today()) ? '' : ' off') + '" title="Серия">🔥 ' + st + '</span>' +
    '<span class="chip xp" title="XP">⭐ ' + S.xp + '</span>' +
    '<span class="chip lvl" title="Ниво">' + rankOf(L)[2] + ' ' + L + '</span>' +
    '<button class="chip heart" data-act="go" data-v="mistakes" title="Грешки за повторение">❤️ ' + due + '</button></div>';
  document.getElementById('tabbar').innerHTML = TABS.map(function (n) {
    var on = n[0] === 'more' ? ['rapid', 'terms', 'open', 'boss', 'mock', 'profile', 'settings'].indexOf(U.v) >= 0 : navOn(n[0]);
    return '<button class="' + (on ? 'on' : '') + '" data-act="' + (n[0] === 'more' ? 'more' : 'go') + '" data-v="' + n[0] + '"><span class="i">' + n[1] + '</span>' + n[2] +
      (n[0] === 'mistakes' && due ? '<span class="dot">' + due + '</span>' : '') + '</button>';
  }).join('');
}
function stopTimer() { if (U.timer) { clearInterval(U.timer); U.timer = null; } }
function render() {
  paintChrome();
  var v = U.v, h = '';
  if (v === 'home') h = homeHTML();
  else if (v === 'bio' || v === 'chem') h = pathHTML(v);
  else if (v === 'topic') h = topicHTML();
  else if (v === 'lesson') h = lessonHTML();
  else if (v === 'terms') h = termsCfgHTML();
  else if (v === 'rapid') h = U.rapid ? rapidHTML() : rapidCfgHTML();
  else if (v === 'mock') h = U.exam && U.exam.kind === 'mock' ? examHTML() : mockCfgHTML();
  else if (v === 'boss') h = U.exam && U.exam.kind === 'boss' ? examHTML() : bossPickHTML();
  else if (v === 'open') h = U.oKey ? openPageHTML() : openListHTML();
  else if (v === 'mistakes') h = mistakesHTML();
  else if (v === 'profile') h = profileHTML();
  else if (v === 'settings') h = settingsHTML();
  app.innerHTML = h;
  var rail = railFor(v);
  document.body.classList.toggle('hasrail', !!rail);
  document.getElementById('rail').innerHTML = rail;
  var inp = document.getElementById('termInput');
  if (inp) inp.focus();
  else { var pb = document.getElementById('primary'); if (pb && !pb.disabled && !document.getElementById('overlay').innerHTML) pb.focus({ preventScroll: true }); }
  setTimeout(flushCel, 30);
}
function go(v, extra) {
  stopTimer();
  if (v === 'bio' || v === 'chem') S.subj = v;
  U.v = v;
  if (v !== 'lesson') U.L = null;
  if (v !== 'rapid') U.rapid = null;
  U.exam = null;
  if (extra) for (var k in extra) U[k] = extra[k];
  save(); render(); window.scrollTo(0, 0);
}
function subjToggle(act) {
  return '<div class="subjtoggle"><button class="bio' + (S.subj === 'bio' ? ' on' : '') + '" data-act="' + (act || 'subj') + '" data-s="bio">🧬 Биология</button>' +
    '<button class="chem' + (S.subj === 'chem' ? ' on' : '') + '" data-act="' + (act || 'subj') + '" data-s="chem">⚗️ Химия</button></div>';
}
function modeHead(cls, mood, acc, eyebrow, title, sub) {
  return '<div class="modehead ' + cls + '">' + P(mood, acc) + '<div><div class="eyebrow" style="color:rgba(255,255,255,.85)">' + eyebrow + '</div><h2>' + title + '</h2>' +
    (sub ? '<div style="font-weight:700;opacity:.95;font-size:15px;margin-top:4px">' + sub + '</div>' : '') + '</div></div>';
}

/* ================= ДЕСЕН ПАНЕЛ (лаптоп) ================= */
var WIDE = window.matchMedia ? matchMedia('(min-width:1180px)') : { matches: false };
function wide() { return WIDE.matches; }
if (WIDE.addEventListener) WIDE.addEventListener('change', function () { render(); });
function railFor(v) {
  if (!wide()) return '';
  var runs = (v === 'rapid' && U.rapid) || ((v === 'mock' || v === 'boss') && U.exam);
  if (runs || ['home', 'bio', 'chem', 'topic', 'mistakes', 'terms', 'rapid', 'mock', 'boss', 'open'].indexOf(v) < 0) return '';
  var h = goalCardHTML() + rankCardHTML();
  if (v === 'bio' || v === 'chem' || v === 'topic') {
    var sub = cur();
    h += '<div class="card"><h4>' + sub.icon + ' Блокове</h4>' + sub.order.map(function (b) {
      var m = blockMastery(sub.id, b), bs = S.boss[sub.id + '|' + b];
      return '<div class="small" style="font-weight:800;margin-top:8px">' + blockLabel(b) + ' · ' + esc(sub.blocks[b]) + (S.blocksMastered[sub.id + '|' + b] ? ' 🏆' : '') + (bs && bs.beaten ? ' 👑' : '') +
        '</div><div class="between" style="flex-wrap:nowrap"><div style="flex:1">' + bar(m.pct, 'thin ' + sub.id) + '</div><b class="small">' + (m.n ? m.pct + '%' : '—') + '</b></div>';
    }).join('') + '</div>';
  } else {
    h += '<div class="card"><h4>📈 Последните 7 дни</h4>' + weekHTML(7) + '</div>';
  }
  var achN = Object.keys(S.ach).length;
  h += '<div class="card"><div class="between"><h4 style="margin:0">🏆 Постижения</h4><button class="linkbtn" data-act="go" data-v="profile">' + achN + '/' + ACH.length + '</button></div><div class="railach mt">' +
    ACH.slice(0, 12).map(function (a) { return '<span class="' + (S.ach[a.id] ? '' : 'off') + '" title="' + esc(a.t + ' — ' + a.d) + '">' + (S.ach[a.id] ? a.b : '🔒') + '</span>'; }).join('') + '</div></div>';
  h += '<div class="card"><h4>⌨️ Клавишни комбинации</h4><div class="kbdrow">' +
    '<span class="kbd">1–4</span><span>избор на отговор</span><span class="kbd">Enter</span><span>провери / продължи</span>' +
    '<span class="kbd">← →</span><span>навигация в тест</span><span class="kbd">Esc</span><span>изход / затвори</span></div></div>';
  return h;
}
function goalCardHTML() {
  var txp = todayXP(), g = goal(), st = streak();
  return '<div class="card"><div class="goal">' + ring(pct(Math.min(txp, g), g), '<div><b>' + pct(Math.min(txp, g), g) + '%</b><small>' + txp + '/' + g + ' XP</small></div>', 96, 'var(--fire)') +
    '<div style="flex:1;min-width:0"><div class="eyebrow">Днешната цел</div><h3>🔥 ' + st + ' ' + pl(st, 'ден', 'дни') + ' серия</h3>' +
    '<div class="goaltxt mt">' + (txp >= g ? '✓ Целта е изпълнена — серията продължава!' : 'Днешна цел: ' + g + ' XP') + '</div>' +
    '<div class="small muted" style="font-weight:700">Най-дълга серия: ' + Math.max(S.bestStreak, st) + ' ' + pl(Math.max(S.bestStreak, st), 'ден', 'дни') + '</div></div></div></div>';
}
function rankCardHTML() {
  var L = levelOf(S.xp), rk = rankOf(L), nr = nextRankOf(L), lp = pct(S.xp - xpForLevel(L), xpForLevel(L + 1) - xpForLevel(L));
  return '<div class="card"><div class="row" style="flex-wrap:nowrap">' + P('happy', 'cap', 76) + '<div style="flex:1;min-width:0"><div class="eyebrow">Твоят ранг</div><h3 style="font-size:20px">' + rk[2] + ' ' + esc(rk[1]) + '</h3>' +
    '<div class="between small" style="font-weight:800;margin:6px 0 4px"><span>Ниво ' + L + '</span><span class="muted">' + (S.xp - xpForLevel(L)) + '/' + (xpForLevel(L + 1) - xpForLevel(L)) + ' XP</span></div>' + bar(lp, 'xp') +
    (nr ? '<div class="small muted mt" style="font-weight:700">Следващ ранг: ' + nr[2] + ' ' + esc(nr[1]) + ' (още ' + (xpForLevel(nr[0]) - S.xp) + ' XP)</div>' : '<div class="small mt">Достигна най-високия ранг! 🏅</div>') + '</div></div></div>';
}

/* ================= НАЧАЛО ================= */
function recommendation() {
  var due = dueMistakes();
  if (due.length >= 5) return { act: 'reviewStart', attr: 'data-all="0"', k: 'Преговор', title: '❤️ ' + due.length + ' грешки чакат', sub: 'Повтори ги, докато са пресни', xp: Math.min(due.length, REVIEW_N) * XP.review };
  var t = nextTopic(S.subj);
  return { act: 'lessonStart', attr: 'data-tid="' + esc(t.id) + '"', k: lessonDone(S.subj, t.id) ? 'Упражнявай' : 'Продължи обучението',
    title: cur().icon + ' ' + cur().short + ' — ' + t.title, sub: blockLabel(t.block) + ' · ' + cur().blocks[t.block], xp: lessonEstimate(t) };
}
function homeHTML() {
  var txp = todayXP(), g = goal(), gp = pct(Math.min(txp, g), g), st = streak(), L = levelOf(S.xp), rk = rankOf(L), nr = nextRankOf(L);
  var mood = txp === 0 ? 'sleep' : txp >= g ? 'celebrate' : 'wave';
  var hr = new Date().getHours(), hello = hr < 11 ? 'Добро утро!' : hr < 18 ? 'Добър ден!' : 'Добър вечер!';
  var say = txp === 0 ? 'Д-р Панда още дреме… Събуди го с първия урок за деня! 😴' : txp >= g ? 'Целта за днес е изпълнена! Серията е спасена 🎉' : 'Още ' + (g - txp) + ' XP до днешната цел. Давай!';
  var h = '<div class="hero"><div class="in">' + P(mood, 'steth') + '<div><h2>' + hello + '</h2><div style="font-weight:700;opacity:.95">' + rk[2] + ' ' + esc(rk[1]) + ' · Ниво ' + L + '</div>' +
    '<div class="bubble">' + say + '</div></div></div></div>';
  if (!wide()) h += goalCardHTML();
  /* препоръка */
  var r = recommendation();
  h += '<div class="reco"><div class="between"><div style="min-width:0"><div class="k">' + r.k + '</div><h3>' + esc(r.title) + '</h3><div class="small muted" style="font-weight:700">' + esc(r.sub) + '</div></div>' +
    '<span class="tag xp">+' + r.xp + ' XP</span></div><button class="btn block big mt" data-act="' + r.act + '" ' + r.attr + '>▶ Продължи</button></div>';
  /* бързи действия */
  h += '<div class="qa">' +
    qa('go', 'data-v="rapid"', 'ic-fire', '🔥', 'Бърз огън', 'Комбо до ×3') +
    qa('go', 'data-v="terms"', 'ic-term', '🎯', 'Назови термина', 'Определение → термин') +
    qa('go', 'data-v="open"', 'ic-ai', '🤖', 'Отворен въпрос', aiReady() ? 'Оценява Claude' : 'Локално или с Claude') +
    qa('go', 'data-v="boss"', 'ic-boss', '👑', 'Шефът на блока', 'Победи блока') +
    qa('go', 'data-v="mock"', 'ic-dice', '🎲', 'Случаен тест', 'Пробен изпит') +
    qa('go', 'data-v="mistakes"', 'ic-go', '❤️', 'Грешките ми', dueMistakes().length + ' за днес') + '</div>';
  if (!wide()) h += rankCardHTML();
  /* предмети */
  h += '<div class="subjcards">' + ['bio', 'chem'].map(function (sid) {
    var m = subjMastery(sid), done = SUBJ[sid].topics.filter(function (t) { return lessonDone(sid, t.id); }).length;
    return '<button class="subjcard ' + sid + '" data-act="go" data-v="' + sid + '">' + ring(m, '<b>' + m + '%</b>', 62) + '<div><b class="t">' + SUBJ[sid].icon + ' ' + SUBJ[sid].short + '</b><small>' + done + '/' + SUBJ[sid].topics.length + ' урока</small></div></button>';
  }).join('') + '</div>';
  /* седмица */
  if (!wide()) h += '<div class="card"><div class="between"><h3 class="sec" style="margin:0">Последните 7 дни</h3><span class="tag xp">⭐ ' + S.xp + ' XP общо</span></div>' + weekHTML(7) + '</div>';
  return h;
  function qa(act, attr, ic, i, t, s) { return '<button data-act="' + act + '" ' + attr + '><span class="i ' + ic + '">' + i + '</span><span>' + t + '<small>' + s + '</small></span></button>'; }
}
function weekHTML(n) {
  var days = [], mx = goal();
  for (var i = n - 1; i >= 0; i--) { var d = addDays(today(), -i); days.push(d); mx = Math.max(mx, S.xpDays[d] || 0); }
  return '<div class="week">' + days.map(function (d) {
    var x = S.xpDays[d] || 0, hgt = Math.max(4, Math.round(80 * x / mx));
    return '<div title="' + fmtDate(d) + ': ' + x + ' XP"><span style="color:var(--ink2)">' + (x || '') + '</span><i class="' + (d === today() ? 'today' : '') + (x ? '' : ' zero') + '" style="height:' + hgt + 'px"></i><span>' + (n > 7 ? +d.slice(8) : wday(d)) + '</span></div>';
  }).join('') + '</div>';
}

/* ================= ПЪТ НА ОБУЧЕНИЕ ================= */
var ZIG = [0, 46, 70, 46, 0, -46, -70, -46];
function pathHTML(sid) {
  var sub = SUBJ[sid], m = subjMastery(sid), done = sub.topics.filter(function (t) { return lessonDone(sid, t.id); }).length;
  var cur0 = nextTopic(sid);
  var h = '<div class="pathhead ' + sid + '">' + P('wave', sub.acc) + '<div style="flex:1"><div class="eyebrow" style="color:rgba(255,255,255,.85)">Път на обучение</div><h2>' + sub.icon + ' ' + esc(sub.name) + '</h2>' +
    '<div style="font-weight:800;margin-top:4px">' + done + '/' + sub.topics.length + ' урока · ' + m + '% овладяно</div></div>' +
    '<div class="ring" style="--p:' + m + ';--s:64px;background:radial-gradient(closest-side,rgba(0,0,0,.15) 72%,transparent 73% 100%),conic-gradient(#fff calc(var(--p)*1%),rgba(255,255,255,.25) 0)"><b style="color:#fff;font-size:15px">' + m + '%</b></div></div>';
  var idx = 0, z = 0;
  sub.order.forEach(function (b) {
    var ts = sub.topics.filter(function (t) { return t.block === b; }), bm = blockMastery(sid, b), mastered = S.blocksMastered[sid + '|' + b];
    h += '<div class="unit ' + sid + '"><div><div class="k">' + blockLabel(b) + '</div><b>' + esc(sub.blocks[b]) + '</b></div><div class="pc">' + (mastered ? '🏆 ' : '') + bm.pct + '%</div></div>';
    if (!ts.length) { h += '<div class="card tight center muted small"><div style="width:70px;margin:0 auto">' + P('sleep', 'none') + '</div>Още няма теми в този блок. Добави ги в <code>js/data-custom.js</code>.</div>'; return; }
    h += '<div class="path">';
    var allDone = true;
    ts.forEach(function (t, j) {
      var gi = sub.topics.indexOf(t), st = topicStatus(sid, t, gi), tm = topicMastery(sid, t), off = ZIG[z++ % ZIG.length];
      if (!lessonDone(sid, t.id)) allDone = false;
      if (j > 0) h += '<div class="trail' + (st !== 'locked' ? ' done' : '') + '" style="transform:translateX(' + Math.round(off * 0.6) + 'px)"><i></i><i></i></div>';
      var isCur = t === cur0 && st !== 'locked';
      var stIcon = st === 'locked' ? '🔒' : st === 'done' ? '✓' : st === 'prog' ? '🟡' : '⚪';
      var stText = st === 'locked' ? '🔒 Заключена' : st === 'done' ? '🟢 Овладяна' : st === 'prog' ? '🟡 В процес' : '⚪ Не е започната';
      h += '<div class="nodewrap' + (isCur ? ' hasbub' : '') + '" style="transform:translateX(' + off + 'px)">' + (isCur ? '<div class="startbub">' + (lessonDone(sid, t.id) ? 'ПРОДЪЛЖИ' : 'ЗАПОЧНИ') + '</div>' : '') +
        '<button class="node ' + st + (isCur ? ' cur' : '') + '" data-act="node" data-tid="' + esc(t.id) + '" aria-label="' + esc(t.title) + '" title="' + esc(t.title + ' — ' + stText.replace(/^\S+ /, '') + (st !== 'locked' ? ', ' + tm.pct + '%' : '')) + '">' + (st === 'locked' ? '🔒' : topicIcon(sid, t)) +
        (st !== 'locked' ? '<span class="st">' + stIcon + '</span>' : '') + '</button>' +
        '<div class="nlabel"><b>' + esc(t.title) + '</b>' + (st !== 'locked' ? bar(tm.pct, 'thin ' + (st === 'done' ? 'ok' : st === 'prog' ? 'xp' : '')) : '') +
        '<small>' + stText + (st !== 'locked' ? ' · ' + tm.pct + '% · ' + tm.qok + '/' + tm.qn + ' въпроса' : '') + '</small></div>' +
        (j === 2 ? '<div class="pathpanda" style="' + (off >= 0 ? 'left:-80px' : 'right:-80px') + '">' + P(j % 2 ? 'think' : 'happy', sub.acc) + '</div>' : '') +
        '</div>';
      idx++;
    });
    var bs = S.boss[sid + '|' + b] || {}, unlocked = S.settings.freeNav || allDone || bm.pct >= 50;
    var off2 = ZIG[z++ % ZIG.length];
    h += '<div class="trail' + (unlocked ? ' done' : '') + '" style="transform:translateX(' + Math.round(off2 * 0.6) + 'px)"><i></i><i></i></div>' +
      '<div class="nodewrap" style="transform:translateX(' + off2 + 'px)"><button class="node boss' + (unlocked ? '' : ' locked') + (bs.beaten ? ' won' : '') + '" data-act="bossNode" data-b="' + b + '" aria-label="Шефът на блока">' + (bs.beaten ? '🏆' : unlocked ? '👑' : '🔒') + '</button>' +
      '<div class="nlabel"><b>Шефът на блока</b><small>' + (bs.beaten ? '🏆 Победен · ' + bs.best.toFixed(2) : unlocked ? '👑 Готов за битка' : '🔒 Завърши уроците в блока') + '</small></div></div>';
    h += '</div>';
  });
  return h;
}
function nodeSheet(tid) {
  var sid = S.subj, t = topicById(sid, tid), gi = cur().topics.indexOf(t), st = topicStatus(sid, t, gi), tm = topicMastery(sid, t), done = lessonDone(sid, t.id);
  var h = '<div class="row" style="flex-wrap:nowrap;align-items:flex-start">' + P(st === 'locked' ? 'think' : st === 'done' ? 'celebrate' : 'happy', cur().acc, 84) +
    '<div style="flex:1;min-width:0"><div class="eyebrow">' + blockLabel(t.block) + ' · ' + esc(cur().blocks[t.block]) + '</div><h3 style="font-size:21px">' + topicIcon(sid, t) + ' ' + esc(t.title) + '</h3>' +
    '<div class="row mt" style="gap:6px">' + (st === 'done' ? '<span class="tag ok">🟢 Овладяна</span>' : st === 'prog' ? '<span class="tag xp">🟡 В процес</span>' : st === 'locked' ? '<span class="tag">🔒 Заключена</span>' : '<span class="tag">⚪ Не е започната</span>') +
    '<span class="tag xp">+~' + lessonEstimate(t) + ' XP</span>' + (t.open.length ? '<span class="tag ach">🤖 до +50 XP</span>' : '') + '</div></div></div>';
  h += '<div class="mt">' + bar(tm.pct, st === 'done' ? 'ok' : 'xp') + '<div class="between small mt" style="font-weight:800"><span>' + tm.pct + '% овладяно</span><span class="muted">' + tm.qok + '/' + tm.qn + ' въпроса · ' + tm.tok + '/' + tm.tn + ' термина</span></div></div>';
  if (st === 'locked') {
    var prev = cur().topics[gi - 1];
    h += '<div class="note mt">Завърши урока „' + esc(prev.title) + '“, за да отключиш тази тема. Ако вече я знаеш — можеш да опиташ направо.</div>' +
      '<button class="btn block big mt" data-act="lessonStart" data-tid="' + esc(t.id) + '">Опитай все пак</button>';
  } else {
    h += '<button class="btn block big mt" id="primary" data-act="lessonStart" data-tid="' + esc(t.id) + '">' + (done ? (st === 'done' ? '↻ Повтори урока' : '▶ Продължи урока') : '▶ Започни урока') + '</button>';
  }
  h += '<div class="grid2 mt"><button class="btn ghost" data-act="topic" data-tid="' + esc(t.id) + '">📖 Учебник</button>' +
    '<button class="btn ghost" data-act="termsTopic" data-tid="' + esc(t.id) + '"' + (t.terms.length ? '' : ' disabled') + '>🎯 Термини</button></div>' +
    (t.open.length ? '<button class="btn ghost block mt" data-act="openSel" data-k="' + esc(K(sid, t.id, 'o', 0)) + '">🤖 Отворен въпрос</button>' : '') +
    '<button class="linkbtn mt" style="display:block;margin:14px auto 0" data-act="closeOv">Затвори</button>';
  sheet(h);
}
function bossSheet(b) {
  var sid = S.subj, bm = blockMastery(sid, b), bs = S.boss[sid + '|' + b] || { best: 0, beaten: false, n: 0 };
  sheet('<div class="center"><div style="width:120px;margin:0 auto">' + P(bs.beaten ? 'hero' : 'surprised', 'clipboard') + '</div>' +
    '<div class="eyebrow mt">' + blockLabel(b) + '</div><h3 style="font-size:22px">👑 Шефът на „' + esc(cur().blocks[b]) + '“</h3>' +
    '<p class="muted" style="font-weight:700">' + Math.min(BOSS_N, bm.nq) + ' въпроса · ' + BOSS_MIN + ' минути · победа при оценка 5.50+ · +' + XP.bossFirst + ' XP</p>' +
    '<div class="row" style="justify-content:center"><span class="tag ach">Овладяване ' + bm.pct + '%</span><span class="tag">Опити: ' + bs.n + '</span>' + (bs.n ? '<span class="tag xp">Най-добра: ' + bs.best.toFixed(2) + '</span>' : '') + '</div>' +
    '<button class="btn block big mt fire" id="primary" data-act="bossStart" data-b="' + b + '"' + (bm.nq ? '' : ' disabled') + '>⚔️ Предизвикай шефа</button>' +
    '<button class="linkbtn mt" style="display:block;margin:14px auto 0" data-act="closeOv">Затвори</button></div>');
}

/* ---------- учебник (цялата тема) ---------- */
function topicHTML() {
  var sid = S.subj, t = topicById(sid, U.tid) || cur().topics[0];
  if (!t) return '';
  U.tid = t.id;
  var h = '<div class="row mb"><button class="btn ghost sm" data-act="go" data-v="' + sid + '">← Към пътя</button><button class="btn sm" data-act="lessonStart" data-tid="' + esc(t.id) + '">▶ Урок</button></div>';
  h += '<div class="learncard"><div class="eyebrow">' + blockLabel(t.block) + ' · ' + esc(cur().blocks[t.block]) + (t.no ? ' · тема ' + esc(t.no) : '') + '</div>' +
    '<h2 class="title">' + topicIcon(sid, t) + ' ' + esc(t.title) + '</h2>' + (t.brief ? '<div class="brief">' + t.brief + '</div>' : '') + (t.anchor ? '<div class="anchor"><div>' + t.anchor + '</div></div>' : '') + '</div>';
  if (t.diagram) h += '<div class="dgwrap ' + t.diagram.kind + ' mb">' + t.diagram.html + (t.diagram.cap ? '<div class="dgcap">' + t.diagram.cap + '</div>' : '') + '</div>';
  if (t.facts.length) h += '<div class="learncard"><h3 class="sec">Ключови факти</h3><ul class="facts">' + t.facts.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul></div>';
  if (t.skeleton) h += '<div class="learncard"><h3 class="sec">Скелет на отговора</h3><ol style="margin:0;padding-left:22px">' + t.skeleton.map(function (f) { return '<li style="padding:4px 0">' + f + '</li>'; }).join('') + '</ol></div>';
  if (t.terms.length) h += '<div class="learncard"><h3 class="sec">Термини</h3><dl class="terms" style="margin:0">' + t.terms.map(function (x) { return '<div class="term"><dt>' + esc(x[0]) + '</dt><dd>' + x[1] + '</dd></div>'; }).join('') + '</dl></div>';
  if (t.twins.length || t.notes.length) h += '<div class="learncard"><h3 class="sec">⚠️ Капани — не ги бъркай</h3>' + trapsHTML(t, 99) + '</div>';
  h += '<button class="btn block big" data-act="lessonStart" data-tid="' + esc(t.id) + '">▶ Започни урока</button>';
  return h;
}
function trapsHTML(t, max) {
  return t.twins.slice(0, max).map(function (x) { return '<div class="twin"><div class="ab">' + x.a + '<em>или</em>' + x.b + '</div><div class="nt">' + x.n + '</div></div>'; }).join('') +
    (t.notes.length ? '<ul class="facts' + (t.twins.length ? ' mt' : '') + '">' + t.notes.slice(0, max).map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' : '');
}

/* ================= УРОК (обща машина) =================
   mode: lesson · practice · terms · review                       */
function newLesson(o) {
  return { mode: o.mode, sid: o.sid, tid: o.tid || null, title: o.title, steps: o.steps, at: 0, xp: 0, firstOk: 0, firstN: 0, wrong: 0, fixed: 0,
    combo: 0, maxCombo: 0, st: freshSt(), startM: o.tid ? topicMastery(o.sid, topicById(o.sid, o.tid)).pct : null, done: false, res: null };
}
function freshSt() { return { sel: null, checked: false, ok: false, typo: false, given: '', hint: 0, xp: 0, msg: '' }; }
function buildLesson(sid, tid, mode) {
  var t = topicById(sid, tid), steps = [], repeat = lessonDone(sid, tid);
  if (mode === 'lesson') {
    steps.push({ kind: 'learn', title: t.title, html: (t.brief ? '<div class="brief">' + t.brief + '</div>' : '') + (t.anchor ? '<div class="anchor"><div>' + t.anchor + '</div></div>' : '') });
    if (t.diagram) steps.push({ kind: 'learn', title: 'Виж го на схема', html: '<div class="dgwrap ' + t.diagram.kind + '">' + t.diagram.html + (t.diagram.cap ? '<div class="dgcap">' + t.diagram.cap + '</div>' : '') + '</div>' });
    if (t.facts.length) steps.push({ kind: 'learn', title: 'Ключови факти', html: '<ul class="facts">' + t.facts.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' });
    if (t.twins.length || t.notes.length) steps.push({ kind: 'learn', title: '⚠️ Капани — не ги бъркай', html: trapsHTML(t, 4) });
  }
  var qi = t.q.map(function (_, i) { return i; });
  if (repeat || mode === 'practice') shuffle(qi);
  var np = mode === 'practice' ? Math.min(5, qi.length) : Math.min(4, Math.ceil(qi.length / 2));
  qi.slice(0, np).forEach(function (i) { steps.push({ kind: 'mcq', key: K(sid, tid, 'q', i), phase: 'practice' }); });
  var ti = t.terms.map(function (_, i) { return i; }).filter(function (i) { return t.terms[i][0].length < 60; });
  ti.sort(function (a, b) { var ra = S.terms[K(sid, tid, 't', a)], rb = S.terms[K(sid, tid, 't', b)]; return (ra && ra.ok ? 1 : 0) - (rb && rb.ok ? 1 : 0) || Math.random() - 0.5; });
  ti.slice(0, 3).forEach(function (i) { steps.push({ kind: 'term', key: K(sid, tid, 't', i), phase: 'recall' }); });
  if (mode === 'lesson') {
    qi.slice(np, np + 3).forEach(function (i) { steps.push({ kind: 'mcq', key: K(sid, tid, 'q', i), phase: 'challenge' }); });
    if (t.open.length) steps.push({ kind: 'open', key: K(sid, tid, 'o', Math.floor(Math.random() * t.open.length)), phase: 'ai' });
  }
  return steps;
}
function startLesson(sid, tid, mode) {
  closeOverlay();
  var t = topicById(sid, tid);
  S.subj = sid;
  U.L = newLesson({ mode: mode, sid: sid, tid: tid, title: t.title, steps: buildLesson(sid, tid, mode) });
  go('lesson', { L: U.L });
}
function startRun(mode, keys, title) {
  closeOverlay();
  var steps = keys.map(function (k) { var it = item(k); return { kind: it.type === 'q' ? 'mcq' : it.type === 't' ? 'term' : 'open', key: k, phase: mode === 'review' ? 'review' : it.type === 't' ? 'recall' : 'practice' }; });
  U.L = newLesson({ mode: mode, sid: S.subj, title: title, steps: steps });
  go('lesson', { L: U.L });
}
var PHASE = {
  learn: ['ph-learn', '📖 Научи'], practice: ['ph-practice', '✏️ Упражнение'], recall: ['ph-recall', '🎯 Назови термина'],
  challenge: ['ph-challenge', '🔥 Предизвикателство'], ai: ['ph-ai', '🤖 AI отворен въпрос'], retry: ['ph-retry', '💪 Опитай пак'], review: ['ph-retry', '❤️ Преговор']
};
function lessonHTML() {
  var L = U.L;
  if (!L) return '';
  if (L.done) return lessonResultHTML();
  var step = L.steps[L.at], st = L.st, sid = L.sid;
  var p = pct(L.at, L.steps.length);
  var h = '<div class="lhead"><button class="xbtn" data-act="lessonQuit" aria-label="Изход">✕</button>' + bar(p) +
    '<span class="combo">' + (L.combo >= 2 ? '🔥 ' + L.combo : '') + '</span><span class="hearts">⭐ ' + L.xp + '</span></div>';
  var ph = PHASE[step.kind === 'learn' ? 'learn' : step.phase] || PHASE.practice;
  h += '<span class="phase ' + ph[0] + '">' + ph[1] + '</span>';
  var it = step.key ? item(step.key) : null, bottom = '';
  if (step.kind === 'learn') {
    if (L.at === 0) h += '<div class="coach">' + P('wave', SUBJ[sid].acc) + '<div class="say">' + pick(['Нека започнем! Прочети внимателно — после ще те питам. 😉', 'Ново знание на хоризонта! Готов ли си?', 'Кратко обяснение, после практика. Да тръгваме!']) + '</div></div>';
    h += '<div class="learncard"><h3 class="lt">' + esc(step.title) + '</h3>' + step.html + '</div>';
    var hasLearnAfter = L.steps.slice(L.at + 1).some(function (s) { return s.kind === 'learn'; });
    bottom = '<div class="fbar"><div class="in"><button class="btn block big" id="primary" data-act="lNext">Разбрах — продължи<span class="kbd">Enter</span></button>' +
      (hasLearnAfter && L.mode === 'lesson' && lessonDone(sid, L.tid) ? '<button class="linkbtn" style="display:block;margin:10px auto 0" data-act="skipLearn">Пропусни теорията</button>' : '') + '</div></div>';
  } else if (step.kind === 'mcq') {
    if (step.phase === 'challenge' && !st.checked) h += '<div class="coach">' + P('think', SUBJ[sid].acc, 64) + '<div class="say">По-труден въпрос — помисли добре! (+' + XP.challenge + ' XP)</div></div>';
    if (step.phase === 'retry' && !st.checked) h += '<div class="coach">' + P('happy', SUBJ[sid].acc, 64) + '<div class="say">Да опитаме пак — този път ще стане!</div></div>';
    h += '<div class="small muted" style="font-weight:800">' + esc(it.t.title) + '</div><div class="lq">' + it.d.s + '</div><div class="opts">';
    it.d.o.forEach(function (o, j) {
      var cls = '';
      if (st.checked) { if (j === it.d.a) cls = ' right'; else if (j === st.sel) cls = ' wrong'; }
      else if (j === st.sel) cls = ' sel';
      h += '<button class="opt' + cls + '" data-act="lSel" data-j="' + j + '"' + (st.checked ? ' disabled' : '') + '><span class="k">' + (j + 1) + '</span><span>' + o + '</span></button>';
    });
    h += '</div>';
    bottom = st.checked ? fbarHTML(st.ok, st.msg, st.xp, (it.d.why ? '<div>' + it.d.why + '</div>' : '') + (it.d.trap ? '<div class="trap"><b>Капан:</b> ' + it.d.trap + '</div>' : ''))
      : '<div class="fbar"><div class="in"><button class="btn block big ok" id="primary" data-act="lCheck"' + (st.sel == null ? ' disabled' : '') + '>Провери<span class="kbd">Enter</span></button></div></div>';
  } else if (step.kind === 'term') {
    var term = it.d[0], def = it.d[1];
    h += '<div class="small muted" style="font-weight:800">Кой е терминът? · ' + esc(it.t.title) + '</div><div class="defcard">' + maskDef(def, term) + '</div>';
    if (!st.checked) {
      if (st.hint) { var w = termAnswers(term)[0] || '', show = st.hint === 1 ? 1 : Math.min(3, w.length); h += '<div class="hintline">' + esc(w.slice(0, show).toUpperCase()) + w.slice(show).replace(/[^\s-]/g, '_') + '</div>'; }
      h += '<form data-form="termCheck" autocomplete="off"><input id="termInput" class="tin" placeholder="Напиши термина…" value="' + esc(st.given) + '" spellcheck="false" autocapitalize="off"></form>' +
        '<div class="row mt"><button class="btn ghost sm" data-act="lHint"' + (st.hint >= 2 ? ' disabled' : '') + '>💡 Подсказка (−' + XP.hint + ' XP)</button><button class="btn ghost sm" data-act="lDunno">Не знам</button></div>';
      bottom = '<div class="fbar"><div class="in"><button class="btn block big ok" id="primary" data-act="lCheck">Провери<span class="kbd">Enter</span></button></div></div>';
    } else {
      bottom = fbarHTML(st.ok, st.msg, st.xp, (st.given ? '<div>Ти написа: <b>' + esc(st.given) + '</b></div>' : '') + '<div>Терминът е: <b>' + esc(term) + '</b></div>' + (st.typo ? '<div class="trap"><b>Внимавай с правописа</b> — на изпита се търси точният термин.</div>' : ''));
    }
  } else if (step.kind === 'open') {
    h += openPanelHTML(step.key, 'lesson');
    var r = S.opens[step.key] || {};
    bottom = '<div class="fbar"><div class="in">' + (st.checked ? '<button class="btn block big" id="primary" data-act="lNext">Продължи</button>'
      : '<button class="btn block big ghost" data-act="lNext">' + (r.last ? 'Продължи' : 'Пропусни') + '</button>') + '</div></div>';
  }
  return h + '<div class="spacer"></div>' + bottom;
}
function fbarHTML(ok, msg, xp, body) {
  return '<div class="fbar slide ' + (ok ? 'good' : 'bad') + '"><div class="in"><div class="head">' + P(ok ? 'celebrate' : 'sad', ok ? 'none' : 'steth', 62) +
    '<div><b>' + (ok ? '✓ ' : '') + esc(msg) + '</b>' + (ok && xp ? '<span class="tag xp">+' + xp + ' XP</span>' : !ok ? '<span class="small" style="font-weight:800">Ще се върнем към това след малко 💪</span>' : '') + '</div></div>' +
    (body ? '<div class="exp">' + body + '</div>' : '') +
    '<button class="btn block big ' + (ok ? 'ok' : 'bad') + '" id="primary" data-act="lNext">Продължи<span class="kbd">Enter</span></button></div></div>';
}
function lessonAnswer(ok, xp, key) {
  var L = U.L, step = L.steps[L.at];
  if (step.phase !== 'retry') { L.firstN++; if (ok) L.firstOk++; }
  if (ok) { L.combo++; L.maxCombo = Math.max(L.maxCombo, L.combo); if (step.phase === 'retry') L.fixed++; }
  else {
    L.combo = 0; L.wrong++;
    if (step.phase !== 'retry') {
      var openAt = -1; L.steps.forEach(function (s, i) { if (s.kind === 'open' && i > L.at) openAt = i; });
      var retry = { kind: step.kind, key: step.key, phase: 'retry' };
      if (openAt >= 0) L.steps.splice(openAt, 0, retry); else L.steps.push(retry);
    }
  }
  L.st.checked = true; L.st.ok = ok; L.st.xp = ok ? xp : 0;
  L.st.msg = ok ? (L.combo >= 3 && L.combo % 3 === 0 ? '🔥 ' + L.combo + ' поредни верни!' : pick(GOOD)) : pick(BAD);
  L.xp += L.st.xp;
  logAnswer(ok);
  if (step.phase !== 'retry') record(key, ok);
  addXP(L.st.xp, 1);
}
function finishLesson() {
  var L = U.L; if (L.done) return;
  L.done = true;
  U.newAch = [];
  var acc = L.firstN ? pct(L.firstOk, L.firstN) : 100, bonus = 0;
  if (L.mode === 'lesson' || L.mode === 'practice') {
    bonus += XP.lessonBonus;
    if (L.firstN && L.firstOk === L.firstN) { bonus += XP.perfect; S.cnt.perfect++; }
  }
  if (L.mode === 'lesson') {
    var k = L.sid + '|' + L.tid, l = S.lessons[k] || { n: 0, best: 0 };
    var firstTime = !l.done;
    l.done = true; l.n++; l.best = Math.max(l.best, acc); S.lessons[k] = l;
    S.cnt.lessons++; if (L.sid === 'bio') S.cnt.lessonsBio++; else S.cnt.lessonsChem++;
    if (firstTime) { var nt = nextTopic(L.sid); if (nt && nt.id !== L.tid) toast('🔓 Отключено: ' + nt.title); }
  }
  var goalBefore = dayDone(today());
  L.xp += bonus;
  addXP(bonus, 0);
  var endM = L.tid ? topicMastery(L.sid, topicById(L.sid, L.tid)).pct : null;
  L.res = { acc: acc, bonus: bonus, endM: endM, goalNow: dayDone(today()), goalBefore: goalBefore };
  checkBlocks(L.sid); checkAch();
  L.res.ach = U.newAch.slice(); U.newAch = [];
  save();
}
function lessonResultHTML() {
  var L = U.L, r = L.res, st = streak(), sub = SUBJ[L.sid];
  var mood = r.acc >= 90 ? 'celebrate' : r.acc >= 60 ? 'happy' : 'wave';
  var title = r.acc >= 90 ? '🎉 Отлична работа!' : r.acc >= 60 ? '👏 Браво, продължавай!' : '💪 Добро начало!';
  if (r.acc >= 90 && !r.conf) { r.conf = true; setTimeout(confetti, 80); }
  var h = '<div class="results">' + P(mood, L.mode === 'lesson' ? 'cap' : 'steth') + '<h2>' + title + '</h2>' +
    '<div class="rstats"><div class="rstat xp"><div class="h">Общо XP</div><div class="v">+' + L.xp + '</div></div>' +
    '<div class="rstat ok"><div class="h">Точност</div><div class="v">' + r.acc + '%</div></div>' +
    '<div class="rstat fire"><div class="h">Серия</div><div class="v">🔥 ' + st + '</div></div></div>';
  if (r.goalNow) h += '<div class="goaltxt" style="font-size:17px">' + (r.goalBefore ? '🔥 Серията продължава!' : '🔥 Дневната цел е изпълнена — серията продължава!') + '</div>';
  else h += '<div class="small muted" style="font-weight:800">Още ' + (goal() - todayXP()) + ' XP до днешната цел</div>';
  if (L.tid && r.endM != null) h += '<div class="mastery-delta">' + sub.icon + ' ' + esc(L.title) + ': ' + L.startM + '% <span class="arrow">→</span> ' + r.endM + '%</div>';
  if (r.bonus) h += '<div class="small muted" style="font-weight:800">Бонус за завършване: +' + r.bonus + ' XP' + (L.firstN && L.firstOk === L.firstN ? ' (включва бонус за безупречен урок 🎯)' : '') + '</div>';
  if (L.fixed) h += '<div class="small" style="font-weight:800;margin-top:6px">💪 Поправи ' + L.fixed + ' ' + pl(L.fixed, 'грешка', 'грешки') + ' още в урока!</div>';
  (r.ach || []).forEach(function (a) { h += '<div class="achrow"><span class="b">' + a.b + '</span><div>🏆 Ново постижение отключено!<div class="small muted">' + esc(a.t) + ' — ' + esc(a.d) + '</div></div></div>'; });
  h += '</div><div class="grid2">' +
    (L.wrong ? '<button class="btn ghost" data-act="reviewStart" data-all="0">❤️ Преговори грешките</button>' : '<button class="btn ghost" data-act="go" data-v="home">🏠 Начало</button>') +
    '<button class="btn" id="primary" data-act="lessonExit">Продължи</button></div>';
  return h;
}

/* ================= ОТВОРЕН ВЪПРОС (общ панел) ================= */
function openPanelHTML(key, ctx) {
  var it = item(key), r = S.opens[key] || {}, g = U.grading[key] || {}, o = it.d;
  var words = (r.draft || '').trim() ? (r.draft || '').trim().split(/\s+/).length : 0;
  var h = '<div class="learncard"><div class="between"><div class="small muted" style="font-weight:800">' + SUBJ[it.sid].icon + ' ' + esc(it.t.title) + '</div>' +
    '<button class="linkbtn small" data-act="go" data-v="settings" title="Статус на Claude">🤖 ' + aiStatusHTML() + '</button></div><div class="oprompt">' + o.p + '</div>';
  if (o.cues && U.showCues[key]) h += '<div class="note mb"><b>Подсказки:</b><ul style="margin:6px 0 0;padding-left:20px">' + o.cues.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>';
  h += '<textarea class="tin" id="openText" data-inp="draft" data-k="' + esc(key) + '" placeholder="Напиши пълен отговор със свързан текст и точни научни термини…">' + esc(r.draft || '') + '</textarea>' +
    '<div class="between small muted" style="margin-top:8px;font-weight:700"><span id="wc">' + words + ' ' + pl(words, 'дума', 'думи') + '</span><span>Черновата се пази автоматично</span></div>';
  if (g.busy) h += '<div class="loading">' + P('think', 'clipboard') + '<div><b>' + (g.mode === 'claude' ? 'Д-р Панда и комисията (Claude) четат отговора ти…' : 'Сравнявам отговора с официалния ключ…') + '</b>' +
    '<div class="small muted">' + (g.mode === 'claude' ? 'Обикновено отнема 10–60 секунди.' : 'Ако Claude не отговори, ще се използва локално оценяване.') + '</div></div></div>';
  else h += '<button class="btn block big ach mt" data-act="openGrade" data-k="' + esc(key) + '" data-ctx="' + ctx + '">' + (aiReady() ? '🎓 Оцени с Claude' : '🧮 Оцени (локално)') + '</button>';
  h += '<div class="row mt"><button class="btn ghost sm" data-act="openKey" data-k="' + esc(key) + '">' + (U.showKey[key] ? 'Скрий ключа' : '🔑 Покажи ключа') + '</button>' +
    (o.cues ? '<button class="btn ghost sm" data-act="openCues" data-k="' + esc(key) + '">' + (U.showCues[key] ? 'Скрий подсказките' : '💡 Подсказки') + '</button>' : '') +
    '<button class="btn ghost sm" data-act="openModel" data-k="' + esc(key) + '"' + (U.model[key] && U.model[key].busy ? ' disabled' : '') + '>✨ Образцов отговор</button></div>';
  if (!aiReady() && !g.busy) h += '<div class="note mt">Claude не е свързан — ще се използва <b>локално оценяване</b>, което само търси ключовите понятия от официалния ключ и не е равностойно на оценка от Claude. ' +
    '<button class="linkbtn" data-act="aiConnect">Свържи Claude</button></div>';
  if (g.err) h += '<div class="err mt">' + esc(g.err) + '</div>';
  h += '</div>';
  var last = normalizeGrade(r.last);
  if (last) h += gradeHTML(last, r.best);
  if (U.showKey[key]) h += '<div class="learncard"><h3 class="sec">🔑 Официален ключ</h3><ul class="rub">' + o.must.map(function (m) { return '<li>' + m + '</li>'; }).join('') + '</ul></div>';
  var md = U.model[key] || (r.model ? { text: r.model } : null);
  if (md) h += '<div class="learncard"><h3 class="sec">✨ Как звучи отговор за 6 <span class="tag ach">Claude AI</span></h3>' + (md.busy ? '<div class="loading">' + P('think', 'cap') + '<b>Пиша образеца…</b></div>' : md.err ? '<div class="err">' + esc(md.err) + '</div>' : '<div class="model">' + esc(md.text) + '</div>') + '</div>';
  return h;
}
function gradeHTML(g, best) {
  var mark = markOf(g.score / 100), mood = g.score >= 80 ? 'celebrate' : g.score >= 50 ? 'happy' : 'sad', claudeMode = g.gradingMode === 'claude';
  var col = g.score >= 80 ? 'var(--ok)' : g.score >= 50 ? 'var(--xp)' : 'var(--bad)';
  function list(title, arr) { return arr && arr.length ? '<h4>' + title + '</h4><ul>' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  return '<div class="grade"><div class="row mb" style="gap:6px">' +
    (claudeMode ? '<span class="tag ach">🤖 Оценено от Claude AI</span>' : '<span class="tag">🧮 Локално оценяване</span>') + '</div>' +
    (!claudeMode ? '<div class="note mb">Локалното оценяване само проверява дали ключовите понятия от официалния ключ присъстват в текста. ' +
      'То не разбира смисъла и не открива грешни твърдения — <b>не е равностойно на оценка от Claude</b>.' + (g.fallbackReason ? '<div class="small" style="margin-top:4px">Причина: ' + esc(g.fallbackReason) + '</div>' : '') + '</div>' : '') +
    '<div class="gscore">' + ring(g.score, '<b>' + g.score + '%</b>', 96, col) + '<div style="flex:1;min-width:0"><div class="row" style="gap:6px"><span class="tag ' + (g.score >= 80 ? 'ok' : g.score >= 50 ? 'xp' : 'bad') + '">' + markWord(mark) + ' ' + mark.toFixed(2) + '</span>' +
    (g.xp != null ? '<span class="tag xp">+' + g.xp + ' XP</span>' : '') + '<span class="tag ' + (g.passed ? 'ok' : 'bad') + '">' + (g.passed ? '✓ Издържан' : '✕ Под 60%') + '</span></div>' +
    (best != null ? '<div class="small muted" style="margin-top:4px;font-weight:700">Най-добър резултат: ' + best + '%</div>' : '') + '</div>' + P(mood, 'clipboard', 70) + '</div>' +
    list('💬 Обратна връзка', g.feedback) +
    (g.missedTerms.length ? '<h4>📌 Пропусната терминология</h4><div class="tchips">' + g.missedTerms.map(function (x) { return '<span class="tchip">' + esc(x) + '</span>'; }).join('') + '</div>' : '') +
    list('❌ Липсва от ключа', g.missedConcepts) + list('⚠️ Грешни твърдения', g.incorrectConcepts) + list('✅ Вярно покрито', g.correctConcepts) +
    (g.reviewAdded ? '<div class="small mt" style="font-weight:800">📌 ' + g.reviewAdded + ' ' + pl(g.reviewAdded, 'термин е добавен', 'термина са добавени') + ' в „Грешките ми“ за преговор.</div>' : '') +
    (g.at ? '<div class="small muted mt">Оценено на ' + esc(fmtDate(g.at)) + (claudeMode && g.model ? ' · модел: ' + esc(g.model) : '') + '</div>' : '') + '</div>';
}
/* Прилага резултата към XP, серия, овладяване, грешки, статистика и постижения. */
function applyGrade(it, g, ctx) {
  var key = it.key, r = S.opens[key] = S.opens[key] || {}, prev = r.best == null ? 0 : r.best;
  g.xp = Math.max(0, Math.round(OPEN_MAX_XP * (g.score - prev) / 100));   // score% от максималния XP; при повторен опит — само подобрението
  g.at = today(); g.model = g.gradingMode === 'claude' ? (S.settings.model || 'по подразбиране') : null;
  var added = 0;
  g.missedTerms.forEach(function (mt) {
    it.t.terms.forEach(function (tm, i) {
      var tk = K(it.sid, it.t.id, 't', i);
      if (S.srs[tk]) return;
      if (checkTerm(mt, tm[0]).ok || window.LocalGrader.anchored(mt, tm[0])) { record(tk, false); added++; }
    });
  });
  g.reviewAdded = added;
  r.last = g; r.n = (r.n || 0) + 1; r.best = Math.max(prev, g.score);
  if (g.gradingMode === 'claude') { S.cnt.ai++; if (g.score >= 90) S.cnt.ai90++; }
  logAnswer(g.passed);
  record(key, g.passed);
  if (ctx === 'lesson' && U.L && !U.L.done && U.L.steps[U.L.at] && U.L.steps[U.L.at].key === key) { U.L.xp += g.xp; U.L.st.checked = true; }
  addXP(g.xp, 1);
  checkBlocks(it.sid);
  if (added) toast('📌 ' + added + ' ' + pl(added, 'термин добавен', 'термина добавени') + ' в „Грешките ми“');
  if (g.score >= 80) confetti();
}
function gradeOpen(key, ctx) {
  var it = item(key); if (!it) return;
  var r = S.opens[key] = S.opens[key] || {}, txt = (r.draft || '').trim();
  if (txt.length < 20) { U.grading[key] = { err: 'Отговорът е твърде кратък — напиши поне едно-две изречения.' }; return render(); }
  if (txt.length > 8000) { U.grading[key] = { err: 'Отговорът е твърде дълъг (над 8000 знака).' }; return render(); }
  var payload = gradePayload(it, txt);
  U.grading[key] = { busy: true, mode: BACKEND && !payload.preferLocal ? 'claude' : 'local' }; render();
  function local(reason) { var g = window.LocalGrader.grade(payload); g.fallbackReason = reason; return g; }
  var p = BACKEND
    ? apiCall('/api/grade', payload, 180000).catch(function (e) {
        if (e.status === 400) throw e;
        U.ai = { state: 'offline' };
        return local('Локалният сървър не отговаря.');
      })
    : Promise.resolve(local('Приложението е отворено като файл — стартирай „npm run dev“, за да използваш Claude.'));
  p.then(function (res) {
    var g = normalizeGrade(res);
    if (!g) throw new Error('Оценяването върна невалиден резултат.');
    U.grading[key] = {};
    applyGrade(it, g, ctx);
    if (g.gradingMode === 'claude') { if (U.ai.state !== 'connected') refreshAI(false); }
    else if (BACKEND && U.ai.state === 'connected') refreshAI(false);
  }).catch(function (e) { U.grading[key] = { err: e && e.message ? e.message : 'Неочаквана грешка.' }; })
    .then(function () { if ((U.v === 'open' && U.oKey === key) || (U.v === 'lesson' && U.L)) render(); });
}
function modelAnswer(key) {
  var it = item(key); if (!it) return;
  if (!BACKEND || U.ai.state === 'offline') { U.model[key] = { err: 'Образцовият отговор се пише от Claude — стартирай локалния сървър („npm run dev“) и свържи Claude в Настройки.' }; return render(); }
  U.model[key] = { busy: true }; render();
  var body = gradePayload(it, ''); delete body.answer; delete body.preferLocal;
  apiCall('/api/model-answer', body, 180000)
    .then(function (j) { var txt = String(j.text || '').trim(); if (!txt) throw new Error('Празен отговор.'); U.model[key] = { text: txt }; S.opens[key] = S.opens[key] || {}; S.opens[key].model = txt; save(); })
    .catch(function (e) { U.model[key] = { err: (e.message || 'Claude не е достъпен.') + ' Ключът по-горе остава официалният образец.' }; })
    .then(function () { if (U.v === 'open' || U.v === 'lesson') render(); });
}
function openListHTML() {
  var sub = cur(), keys = keysOf(S.subj, 'o'), done = keys.filter(function (k) { return S.opens[k] && S.opens[k].best != null; }).length;
  var h = modeHead('mh-ai', 'think', 'clipboard', 'AI оценяване', '🤖 Отворени въпроси', 'Пишеш пълен отговор — Claude го проверява като строг изпитващ от МУ спрямо официалния ключ.') + subjToggle();
  h += '<div class="card tight"><div class="between"><b>Оценени: ' + done + '/' + keys.length + '</b><span class="tag xp">XP = % от ' + OPEN_MAX_XP + '</span></div>' +
    '<div class="between mt"><span class="small">🤖 Claude: ' + aiStatusHTML() + '</span>' + (aiReady() ? '' : '<button class="btn sm ach" data-act="aiConnect">Свържи Claude</button>') + '</div>' +
    (aiReady() ? '' : '<div class="note mt">Без Claude се използва локално оценяване — само проверка за ключови понятия от официалния ключ.</div>') + '</div>';
  sub.order.forEach(function (b) {
    var ts = sub.topics.filter(function (t) { return t.block === b && t.open.length; });
    if (!ts.length) return;
    h += '<div class="blockhead">' + blockLabel(b) + ' · ' + esc(sub.blocks[b]) + '</div>';
    ts.forEach(function (t) {
      t.open.forEach(function (o, i) {
        var k = K(S.subj, t.id, 'o', i), r = S.opens[k];
        h += '<button class="listrow" data-act="openSel" data-k="' + esc(k) + '"><span class="ic">' + topicIcon(S.subj, t) + '</span><span class="tx"><small>' + esc(t.title) + '</small><b class="clamp">' + plain(o.p) + '</b></span>' +
          (r && r.best != null ? '<span class="tag ' + (r.best >= 80 ? 'ok' : r.best >= 50 ? 'xp' : 'bad') + '">' + r.best + '%</span>' : r && r.draft ? '<span class="tag">чернова</span>' : '<span class="tag ach">+50</span>') + '</button>';
      });
    });
  });
  return h;
}
function openPageHTML() {
  var it = item(U.oKey); if (!it) { U.oKey = null; return openListHTML(); }
  return '<div class="row mb"><button class="btn ghost sm" data-act="openBack">← Всички въпроси</button><button class="btn ghost sm" data-act="topicFrom" data-sid="' + it.sid + '" data-tid="' + esc(it.t.id) + '">📖 Учебник</button></div>' + openPanelHTML(U.oKey, 'page');
}

/* ================= НАЗОВИ ТЕРМИНА ================= */
function scopeHTML(withTopics) {
  var sub = cur(), h = '<div class="choice"><button class="' + (U.scope === 'all' ? 'on' : '') + '" data-act="scope" data-s="all">Всички</button>';
  sub.order.forEach(function (b) { if (sub.topics.some(function (t) { return t.block === b; })) h += '<button class="' + (U.scope === 'b:' + b ? 'on' : '') + '" data-act="scope" data-s="b:' + b + '">' + blockLabel(b) + '</button>'; });
  h += '</div>';
  if (withTopics) h += '<select class="tin mt" data-chg="scopeTopic"><option value="">— или избери конкретна тема —</option>' +
    sub.topics.filter(function (t) { return t.terms.length; }).map(function (t) { return '<option value="t:' + esc(t.id) + '"' + (U.scope === 't:' + t.id ? ' selected' : '') + '>' + esc(t.title) + ' (' + t.terms.length + ')</option>'; }).join('') + '</select>';
  return h;
}
function scopeFilter() {
  var s = U.scope || 'all';
  if (s.indexOf('b:') === 0) { var b = s.slice(2); return function (t) { return t.block === b; }; }
  if (s.indexOf('t:') === 0) { var id = s.slice(2); return function (t) { return t.id === id; }; }
  return null;
}
function termsCfgHTML() {
  var pool = keysOf(S.subj, 't', scopeFilter()), all = keysOf(S.subj, 't');
  var known = all.filter(function (k) { var r = S.terms[k]; return r && r.ok; }).length;
  return modeHead('mh-term', 'think', cur().acc, 'Игра', '🎯 Назови термина', 'Виждаш определение — пишеш точния термин. Проверката е мигновена.') + subjToggle() +
    '<div class="card"><div class="row mb" style="gap:6px"><span class="tag xp">+' + XP.term + ' XP точен</span><span class="tag">+' + XP.termTypo + ' с правописна грешка</span><span class="tag fire">💡 −' + XP.hint + ' XP</span></div>' +
    '<label class="fl">Знаеш ' + known + ' от ' + all.length + ' термина</label>' + bar(pct(known, all.length), 'xp') +
    '<h3 class="sec mt">Откъде да са термините?</h3>' + scopeHTML(true) +
    '<button class="btn block big mt" data-act="termsStart"' + (pool.length ? '' : ' disabled') + '>▶ Започни (' + Math.min(TERMS_N, pool.length) + ' термина)</button></div>';
}

/* ================= БЪРЗ ОГЪН ================= */
function multOf(c) { return c >= 10 ? 3 : c >= 6 ? 2 : c >= 3 ? 1.5 : 1; }
function rapidSec(at) { return Math.max(7, 15 - Math.floor(at / 3)); }
function rapidCfgHTML() {
  var pool = keysOf(S.subj, 'q', scopeFilter()), best = S.rapidBest[S.subj] || 0;
  return modeHead('mh-fire', 'surprised', 'steth', 'Игра', '🔥 Бърз огън', RAPID_N + ' въпроса, времето намалява, а трудността расте.') + subjToggle() +
    '<div class="card"><div class="grid3" style="grid-template-columns:repeat(4,minmax(0,1fr))">' +
    [['3', '×1.5'], ['6', '×2'], ['10', '×3'], ['⏱️', 'бонус']].map(function (x) { return '<div class="center"><div class="ring" style="--p:100;--s:58px;--c:var(--fire);margin:0 auto"><b style="font-size:15px">' + x[1] + '</b></div><div class="small muted" style="font-weight:800;margin-top:4px">' + (x[0] === '⏱️' ? 'за скорост' : x[0] + ' поредни') + '</div></div>'; }).join('') + '</div>' +
    '<p class="small muted" style="font-weight:700">Грешка или изтекло време нулира комбото. Клавиши <b>1–4</b> за отговор, <b>Enter</b> за следващ.</p>' +
    '<h3 class="sec">Обхват</h3>' + scopeHTML(false) +
    '<div class="between mt"><span class="tag xp">🏆 Рекорд: ' + best + ' т.</span><span class="small muted">' + pool.length + ' въпроса</span></div>' +
    '<button class="btn block big fire mt" data-act="rapidStart"' + (pool.length ? '' : ' disabled') + '>🔥 Старт</button></div>';
}
function startRapid() {
  var filter = scopeFilter(), sub = cur();
  /* по-ранните блокове първо — трудността расте */
  var pool = shuffle(keysOf(S.subj, 'q', filter)).slice(0, RAPID_N);
  pool.sort(function (a, b) { return sub.order.indexOf(item(a).t.block) - sub.order.indexOf(item(b).t.block); });
  U.rapid = { list: pool, at: 0, combo: 0, maxCombo: 0, score: 0, right: 0, xp: 0, left: rapidSec(0), pick: null, pts: 0 };
  U.v = 'rapid'; rapidTimer(); render(); window.scrollTo(0, 0);
}
function rapidTimer() {
  stopTimer();
  U.timer = setInterval(function () {
    var R = U.rapid; if (!R || R.pick != null) return stopTimer();
    R.left--;
    var el = document.getElementById('clock');
    if (el) { el.textContent = R.left + 's'; el.classList.toggle('low', R.left <= 4); }
    if (R.left <= 0) rapidPick(-1);
  }, 1000);
}
function rapidPick(j) {
  var R = U.rapid; if (!R || R.pick != null) return;
  stopTimer();
  var it = item(R.list[R.at]), ok = j === it.d.a;
  R.pick = j; S.mcq[it.key] = ok ? 1 : 0; record(it.key, ok); logAnswer(ok);
  if (ok) {
    R.combo++; R.maxCombo = Math.max(R.maxCombo, R.combo); R.right++;
    if (R.combo > S.cnt.comboMax) S.cnt.comboMax = R.combo;
    R.pts = Math.round(10 * multOf(R.combo)) + Math.max(0, R.left);
    R.score += R.pts;
    var xp = Math.round(R.pts / 2); R.xp += xp; addXP(xp, 1);
  } else { R.combo = 0; R.pts = 0; addXP(0, 1); }
  render();
}
function rapidHTML() {
  var R = U.rapid;
  if (R.at >= R.list.length) {
    var best = S.rapidBest[S.subj] || 0, rec = R.score > best;
    if (rec && !R.saved) { S.rapidBest[S.subj] = R.score; save(); if (R.score) confetti(); }
    R.saved = true;
    return '<div class="results">' + P(rec ? 'celebrate' : 'happy', 'steth') + '<h2>' + (rec ? '🏆 Нов рекорд!' : '🔥 Край на огъня!') + '</h2>' +
      '<div class="rstats"><div class="rstat xp"><div class="h">Точки</div><div class="v">' + R.score + '</div></div><div class="rstat ok"><div class="h">Верни</div><div class="v">' + R.right + '/' + R.list.length + '</div></div>' +
      '<div class="rstat fire"><div class="h">Комбо</div><div class="v">' + R.maxCombo + '</div></div></div><div class="tag xp">+' + R.xp + ' XP</div></div>' +
      '<div class="grid2"><button class="btn ghost" data-act="rapidMenu">Назад</button><button class="btn fire" id="primary" data-act="rapidStart">Пак!</button></div>';
  }
  var it = item(R.list[R.at]), m = multOf(R.combo), ok = R.pick != null && R.pick === it.d.a;
  var h = '<div class="ghead"><button class="xbtn" data-act="rapidQuit">✕</button>' +
    '<div class="gstat"><small>въпрос</small><b>' + (R.at + 1) + '/' + R.list.length + '</b></div>' +
    '<div class="gstat"><small>време</small><b class="timer' + (R.left <= 4 ? ' low' : '') + '" id="clock">' + R.left + 's</b></div>' +
    '<div class="gstat fire"><small>комбо</small><b class="mult' + (ok ? ' pop' : '') + '">×' + m + '</b></div>' +
    '<div class="gstat xp"><small>точки</small><b>' + R.score + '</b></div></div>';
  h += bar(pct(R.at, R.list.length), 'fire thin') + '<div class="small muted mt" style="font-weight:800">' + esc(it.t.title) + (R.combo >= 2 ? ' · 🔥 ' + R.combo + ' поредни' : '') + '</div><div class="lq">' + it.d.s + '</div><div class="opts' + (R.pick != null && !ok ? ' shake' : '') + '">';
  it.d.o.forEach(function (o, j) {
    var cls = R.pick != null ? (j === it.d.a ? ' right' : j === R.pick ? ' wrong' : '') : '';
    h += '<button class="opt' + cls + '" data-act="rapidPick" data-j="' + j + '"' + (R.pick != null ? ' disabled' : '') + '><span class="k">' + (j + 1) + '</span><span>' + o + '</span></button>';
  });
  h += '</div><div class="spacer"></div>';
  if (R.pick != null) {
    h += '<div class="fbar slide ' + (ok ? 'good' : 'bad') + '"><div class="in"><div class="head">' + P(ok ? 'celebrate' : 'sad', 'none', 62) + '<div><b>' + (ok ? '✓ +' + R.pts + ' точки' : R.pick === -1 ? '⏰ Времето изтече' : pick(BAD)) + '</b>' +
      (ok ? '<span class="small" style="font-weight:800">Комбо ' + R.combo + ' · множител ×' + multOf(R.combo) + '</span>' : '<span class="small" style="font-weight:800">Комбото е нулирано — давай отначало!</span>') + '</div></div>' +
      (!ok && it.d.why ? '<div class="exp">' + it.d.why + '</div>' : '') +
      '<button class="btn block big ' + (ok ? 'ok' : 'bad') + '" id="primary" data-act="rapidNext">Следващ<span class="kbd">Enter</span></button></div></div>';
  }
  return h;
}

/* ================= ТЕСТ И ШЕФЪТ НА БЛОКА ================= */
function mockCfgHTML() {
  var poolN = keysOf('bio', 'q').length + keysOf('chem', 'q').length, subN = keysOf(S.subj, 'q').length;
  var h = modeHead('mh-dice', 'happy', 'clipboard', 'Пробен изпит', '🎲 Тест на случаен принцип', 'Отговорите се виждат чак след предаване — като на истинския изпит.') +
    '<div class="card"><label class="fl">Предмет</label><div class="choice"><button class="' + (!U.mockBoth ? 'on' : '') + '" data-act="mockBoth" data-b="0">' + cur().icon + ' Само ' + esc(cur().short) + ' (' + subN + ')</button>' +
    '<button class="' + (U.mockBoth ? 'on' : '') + '" data-act="mockBoth" data-b="1">🧬+⚗️ И двата (' + poolN + ')</button></div>' +
    (!U.mockBoth ? '<div class="mt">' + subjToggle() + '</div>' : '') +
    '<label class="fl mt">Брой въпроси</label><div class="choice">' + [10, 20, 30, 50].map(function (n) { return '<button class="' + (U.mockN === n ? 'on' : '') + '" data-act="mockN" data-n="' + n + '">' + n + '</button>'; }).join('') + '</div>' +
    '<div class="between mt"><span class="tag">⏱️ ' + Math.round(U.mockN * 1.25) + ' минути</span><span class="tag xp">+' + XP.exam + ' XP за верен</span></div>' +
    '<button class="btn block big mt" data-act="mockStart">🎲 Генерирай тест</button></div>';
  if (S.mocks.length) h += '<div class="card"><h3 class="sec">Последни тестове</h3>' + S.mocks.slice(-8).reverse().map(function (m) {
    return '<div class="mrow"><div>' + fmtDate(m.d) + ' · ' + (m.sid === 'both' ? '🧬+⚗️' : SUBJ[m.sid].icon) + ' ' + m.right + '/' + m.n + '</div>' + bar(pct(m.right, m.n), 'thin ' + (m.mark >= 5.5 ? 'ok' : m.mark >= 4 ? 'xp' : 'bad')) + '<div class="pct">' + m.mark.toFixed(2) + '</div></div>';
  }).join('') + '</div>';
  return h;
}
function bossPickHTML() {
  var sub = cur();
  var h = modeHead('mh-boss', 'hero', 'steth', 'Предизвикателство', '👑 Шефът на блока', BOSS_N + ' въпроса от блока, ' + BOSS_MIN + ' минути, без подсказки. Победа при 5.50+.') + subjToggle();
  sub.order.forEach(function (b) {
    var m = blockMastery(sub.id, b), bs = S.boss[sub.id + '|' + b] || { best: 0, beaten: false, n: 0 }, mastered = S.blocksMastered[sub.id + '|' + b];
    h += '<div class="card"><div class="row" style="flex-wrap:nowrap">' + ring(m.pct, '<b>' + m.pct + '%</b>', 74, 'var(--ach)') + '<div style="flex:1;min-width:0"><div class="eyebrow">' + blockLabel(b) + '</div><b style="font-size:17px">' + esc(sub.blocks[b]) + '</b>' +
      '<div class="row mt" style="gap:6px">' + (bs.beaten ? '<span class="tag ok">🏆 Победен</span>' : m.nq ? '<span class="tag bad">😈 Непобеден</span>' : '<span class="tag">💤 Скоро</span>') + (mastered ? '<span class="tag ach">Овладян</span>' : '') +
      (bs.n ? '<span class="tag xp">Най-добра ' + bs.best.toFixed(2) + '</span>' : '') + '</div></div></div>' +
      '<button class="btn block mt ' + (bs.beaten ? 'ach' : 'fire') + '" data-act="bossStart" data-b="' + b + '"' + (m.nq ? '' : ' disabled') + '>' + (m.nq ? (bs.beaten ? '↻ Реванш' : '⚔️ Предизвикай шефа') : 'Още няма въпроси') + '</button></div>';
  });
  return h;
}
function startExam(kind, list, minutes, block) {
  stopTimer(); closeOverlay();
  U.v = kind;
  U.exam = { kind: kind, sid: kind === 'mock' && U.mockBoth ? 'both' : S.subj, block: block, list: list, ans: {}, at: 0, endAt: Date.now() + minutes * 60000, done: false, res: null };
  U.examAll = false;
  U.timer = setInterval(function () {
    var E = U.exam; if (!E || E.done) return stopTimer();
    var left = (E.endAt - Date.now()) / 1000, el = document.getElementById('clock');
    if (el) { el.textContent = mmss(left); el.classList.toggle('low', left < 120); }
    if (left <= 0) { toast('⏰ Времето изтече — тестът е предаден.'); submitExam(); }
  }, 1000);
  render(); window.scrollTo(0, 0);
}
function examHTML() {
  var E = U.exam;
  if (E.done) return examResultHTML();
  var it = item(E.list[E.at]), nAns = Object.keys(E.ans).length;
  var h = '<div class="ghead"><button class="xbtn" data-act="examQuit">✕</button><div class="gstat"><small>' + (E.kind === 'boss' ? '👑 шеф' : '🎲 тест') + '</small><b>' + (E.at + 1) + '/' + E.list.length + '</b></div>' +
    '<div class="gstat"><small>остава</small><b class="timer" id="clock">' + mmss((E.endAt - Date.now()) / 1000) + '</b></div><div class="gstat"><small>отговорени</small><b>' + nAns + '</b></div></div>' +
    bar(pct(nAns, E.list.length), 'ach thin');
  h += '<div class="small muted mt" style="font-weight:800">' + SUBJ[it.sid].icon + ' ' + esc(it.t.title) + '</div><div class="lq">' + it.d.s + '</div><div class="opts">';
  it.d.o.forEach(function (o, j) { h += '<button class="opt' + (E.ans[E.at] === j ? ' sel' : '') + '" data-act="examPick" data-j="' + j + '"><span class="k">' + LETTERS[j] + '</span><span>' + o + '</span></button>'; });
  h += '</div><div class="grid2 mt"><button class="btn ghost" data-act="examNav" data-d="-1"' + (E.at ? '' : ' disabled') + '>← Назад</button>' +
    (E.at < E.list.length - 1 ? '<button class="btn" data-act="examNav" data-d="1">Напред →</button>' : '<button class="btn fire" data-act="examSubmit">Предай теста</button>') + '</div>';
  h += '<div class="card tight mt"><div class="navgrid">' + E.list.map(function (_, i) { return '<button class="' + (E.ans[i] != null ? 'ans' : '') + (i === E.at ? ' cur' : '') + '" data-act="examGo" data-i="' + i + '">' + (i + 1) + '</button>'; }).join('') + '</div>' +
    '<button class="btn block fire mt" data-act="examSubmit">Предай (' + nAns + '/' + E.list.length + ')</button></div>';
  return h;
}
function submitExam() {
  var E = U.exam; if (!E || E.done) return;
  stopTimer();
  var right = 0;
  E.list.forEach(function (k, i) { var it = item(k), ok = E.ans[i] === it.d.a; if (ok) right++; S.mcq[k] = ok ? 1 : 0; record(k, ok); logAnswer(ok); });
  var mark = markOf(right / E.list.length), xp = right * XP.exam, msg = '', win = false;
  E.done = true;
  if (E.kind === 'mock') {
    S.mocks.push({ d: today(), sid: E.sid, n: E.list.length, right: right, mark: mark });
    if (S.mocks.length > 40) S.mocks = S.mocks.slice(-40);
    S.cnt.mocks++; if (mark >= 5.5) S.cnt.mock55++;
  } else {
    var bk = S.subj + '|' + E.block, b = S.boss[bk] || { best: 0, beaten: false, n: 0 };
    b.n++; b.best = Math.max(b.best, mark);
    if (mark >= 5.5) {
      win = true; S.cnt.bossWins++;
      xp += b.beaten ? XP.bossAgain : XP.bossFirst;
      msg = b.beaten ? 'Шефът е победен отново! +' + XP.bossAgain + ' XP' : '+' + XP.bossFirst + ' XP бонус за победата';
      b.beaten = true;
    }
    S.boss[bk] = b;
  }
  E.res = { right: right, mark: mark, xp: xp, msg: msg, win: win };
  addXP(xp, E.list.length);
  if (E.sid === 'both') { checkBlocks('bio'); checkBlocks('chem'); } else checkBlocks(E.sid);
  if (win || mark >= 5.5) confetti();
  render(); window.scrollTo(0, 0);
}
function examResultHTML() {
  var E = U.exam, r = E.res, n = E.list.length, h;
  if (E.kind === 'boss') {
    var hp = Math.max(0, 100 - pct(r.right, n));
    h = '<div class="results">' + P(r.win ? 'hero' : 'sad', 'steth') + '<h2>' + (r.win ? '🏆 Шефът е победен!' : '😈 Шефът оцеля…') + '</h2>' +
      '<p class="muted" style="font-weight:700;margin-top:-8px">' + (r.win ? esc(r.msg) : 'Нужна е оценка 5.50+. Виж грешките по-долу и опитай пак — ще го събориш!') + '</p>' +
      '<div class="small" style="font-weight:800">Живот на шефа: ' + hp + '%</div>' + bar(hp, 'bad') + '<div class="mt"></div>';
  } else h = '<div class="results">' + P(r.mark >= 5.5 ? 'celebrate' : r.mark >= 4 ? 'happy' : 'wave', 'clipboard') + '<h2>' + (r.mark >= 5.5 ? '🎓 Отличен резултат!' : r.mark >= 4 ? '👏 Добра работа!' : '💪 Добро упражнение!') + '</h2>';
  h += '<div class="rstats"><div class="rstat ok"><div class="h">Оценка</div><div class="v">' + r.mark.toFixed(2) + '</div></div><div class="rstat fire"><div class="h">Верни</div><div class="v">' + r.right + '/' + n + '</div></div>' +
    '<div class="rstat xp"><div class="h">XP</div><div class="v">+' + r.xp + '</div></div></div><div class="tag ' + (r.mark >= 5.5 ? 'ok' : r.mark >= 4 ? 'xp' : 'bad') + '">' + markWord(r.mark) + '</div></div>' +
    '<div class="grid2 mb"><button class="btn ghost" data-act="examBack">Назад</button><button class="btn" data-act="' + (E.kind === 'boss' ? 'bossStart' : 'mockStart') + '" data-b="' + esc(E.block || '') + '">↻ Нов опит</button></div>';
  h += '<div class="card"><div class="between mb"><h3 class="sec" style="margin:0">Разбор</h3><button class="linkbtn" data-act="examAll">' + (U.examAll ? 'само грешните' : 'покажи всички') + '</button></div>';
  var shown = 0;
  E.list.forEach(function (k, i) {
    var it = item(k), p0 = E.ans[i], ok = p0 === it.d.a;
    if (ok && !U.examAll) return;
    shown++;
    h += '<div style="padding:12px 0;border-top:2px dashed var(--line)"><div style="font-weight:800;margin-bottom:8px">' + (i + 1) + '. ' + it.d.s + '</div><div class="opts">' +
      it.d.o.map(function (o, j) { return '<div class="opt' + (j === it.d.a ? ' right' : j === p0 ? ' wrong' : '') + '"><span class="k">' + LETTERS[j] + '</span><span>' + o + '</span></div>'; }).join('') + '</div>' +
      (it.d.why ? '<div class="small mt" style="color:var(--ink2)">' + (p0 == null ? '<b>Без отговор.</b> ' : '') + it.d.why + '</div>' : '') + '</div>';
  });
  if (!shown) h += '<div class="center"><div style="width:90px;margin:0 auto">' + P('celebrate', 'none') + '</div><b>Нито една грешка! 🎉</b></div>';
  return h + '</div>';
}

/* ================= ГРЕШКИТЕ МИ ================= */
function mistakesHTML() {
  var all = mistakes(S.subj), due = dueMistakes(S.subj), t0 = today(), by = { q: 0, t: 0, o: 0 };
  all.forEach(function (k) { by[item(k).type]++; });
  var h = modeHead('mh-heart', all.length ? 'happy' : 'celebrate', 'steth', 'Повторение с интервали', '❤️ Грешките ми', 'Всяка грешка се връща след 1, 3 и 7 дни. Три верни повторения — и е овладяна.') + subjToggle();
  h += '<div class="stats mb">' + st('⏰', due.length, 'за днес') + st('✏️', by.q, 'въпроса') + st('🎯', by.t, 'термина') + st('💪', S.mastered, 'овладени общо') + '</div>';
  h += '<div class="grid2 mb"><button class="btn big" data-act="reviewStart" data-all="0"' + (due.length ? '' : ' disabled') + '>▶ Днешните (' + due.length + ')</button>' +
    '<button class="btn big ghost" data-act="reviewStart" data-all="1"' + (all.length ? '' : ' disabled') + '>Всички (' + all.length + ')</button></div>';
  var weak = cur().topics.map(function (t) { var m = topicMastery(S.subj, t).pct; return { t: t, m: m, started: lessonDone(S.subj, t.id) || m > 0 }; })
    .filter(function (x) { return x.started && x.m < MASTER; }).sort(function (a, b) { return a.m - b.m; }).slice(0, 4);
  if (weak.length) h += '<div class="card"><h3 class="sec">🩹 Слаби места — упражнявай</h3>' + weak.map(function (x) {
    return '<div class="mrow"><div>' + topicIcon(S.subj, x.t) + ' ' + esc(x.t.title) + '</div>' + bar(x.m, 'thin xp') + '<button class="btn sm" data-act="practice" data-tid="' + esc(x.t.id) + '" aria-label="Упражнявай">▶</button></div>';
  }).join('') + '</div>';
  if (!all.length) return h + '<div class="card center"><div style="width:120px;margin:0 auto">' + P('celebrate', 'steth') + '</div><b>Нямаш грешки в ' + esc(cur().short) + '!</b><div class="muted small">Д-р Панда е горд с теб. 🎉</div></div>';
  all.sort(function (a, b) { return S.srs[a].due < S.srs[b].due ? -1 : S.srs[a].due > S.srs[b].due ? 1 : S.srs[b].miss - S.srs[a].miss; });
  h += '<div class="blockhead">Всички грешки</div>';
  all.forEach(function (k) {
    var it = item(k), r = S.srs[k], ic = it.type === 'q' ? '✏️' : it.type === 't' ? '🎯' : '🤖';
    var txt = it.type === 'q' ? plain(it.d.s) : it.type === 't' ? it.d[0] + ' — ' + plain(it.d[1]) : plain(it.d.p);
    h += '<div class="listrow"><span class="ic">' + ic + '</span><span class="tx"><b class="clamp">' + esc(txt) + '</b><small>' + esc(it.t.title) + ' · ✕' + r.miss + ' · ' + (r.due <= t0 ? '<span style="color:var(--fire-d)">за днес</span>' : 'на ' + fmtDate(r.due)) + '</small></span>' +
      '<span class="row" style="flex-wrap:nowrap;gap:6px"><button class="btn sm" data-act="retryOne" data-k="' + esc(k) + '" title="Опитай пак">↻</button><button class="xbtn" style="font-size:18px" data-act="mistakeDel" data-k="' + esc(k) + '" title="Махни">✕</button></span></div>';
  });
  return h;
  function st(i, n, l) { return '<div class="stat"><span class="i">' + i + '</span><div><b>' + n + '</b><small>' + l + '</small></div></div>'; }
}

/* ================= ПРОФИЛ ================= */
function profileHTML() {
  var L = levelOf(S.xp), rk = rankOf(L), nr = nextRankOf(L), st = streak();
  var acc = pct(S.stats.correct, S.stats.answered), achN = Object.keys(S.ach).length;
  var blocksTotal = 0; ['bio', 'chem'].forEach(function (sid) { SUBJ[sid].order.forEach(function (b) { if (blockMastery(sid, b).n) blocksTotal++; }); });
  var h = '<div class="modehead mh-prof">' + P('hero', 'cap') + '<div style="flex:1;min-width:0"><div class="eyebrow" style="color:rgba(255,255,255,.85)">Профил</div><h2>' + rk[2] + ' ' + esc(rk[1]) + '</h2>' +
    '<div style="font-weight:800">Ниво ' + L + ' · ' + S.xp + ' XP</div><div class="bar xp mt" style="background:rgba(255,255,255,.3)"><i style="width:' + pct(S.xp - xpForLevel(L), xpForLevel(L + 1) - xpForLevel(L)) + '%"></i></div>' +
    '<div class="small" style="font-weight:700;margin-top:4px">' + (S.xp - xpForLevel(L)) + '/' + (xpForLevel(L + 1) - xpForLevel(L)) + ' XP до ниво ' + (L + 1) + (nr ? ' · ' + esc(nr[1]) + ' от ниво ' + nr[0] : '') + '</div></div></div>';
  h += '<div class="card"><h3 class="sec">Медицинска кариера</h3><div class="rankline">' + RANKS.map(function (r) {
    return '<div class="rankstep' + (L >= r[0] ? ' on' : '') + (r === rk ? ' cur' : '') + '"><div class="b">' + r[2] + '</div>' + esc(r[1]) + '<br><span class="muted">ниво ' + r[0] + '</span></div>';
  }).join('') + '</div></div>';
  h += '<div class="stats mb">' +
    stt('⭐', S.xp, 'общо XP') + stt('🎯', todayXP() + '/' + goal(), 'днешна цел (XP)') + stt('🔥', st, 'текуща серия') + stt('🏅', Math.max(S.bestStreak, st), 'най-дълга серия') +
    stt('✏️', S.stats.answered, 'отговора общо') + stt('✅', acc + '%', 'точност') +
    stt('🧬', subjMastery('bio') + '%', 'биология') + stt('⚗️', subjMastery('chem') + '%', 'химия') +
    stt('🏆', Object.keys(S.blocksMastered).length + '/' + blocksTotal, 'овладени блока') + stt('🎖️', achN + '/' + ACH.length, 'постижения') + '</div>';
  h += '<div class="card"><div class="between mb"><h3 class="sec" style="margin:0">🏆 Постижения</h3><span class="tag ach">' + achN + '/' + ACH.length + '</span></div><div class="achgrid">' + ACH.map(function (a) {
    var on = S.ach[a.id];
    return '<div class="ach' + (on ? '' : ' off') + '"><div class="b">' + (on ? a.b : '🔒') + '</div><b>' + esc(a.t) + '</b><small>' + esc(a.d) + (on ? '<br>✓ ' + fmtDate(on) : '') + '</small></div>';
  }).join('') + '</div></div>';
  ['bio', 'chem'].forEach(function (sid) {
    var sub = SUBJ[sid];
    h += '<div class="card"><div class="between mb"><h3 class="sec" style="margin:0">' + sub.icon + ' ' + esc(sub.name) + '</h3><span class="tag acc">' + subjMastery(sid) + '%</span></div>' +
      sub.order.map(function (b) {
        var m = blockMastery(sid, b), bs = S.boss[sid + '|' + b];
        return '<div class="mrow"><div>' + blockLabel(b) + ' · ' + esc(sub.blocks[b]) + (S.blocksMastered[sid + '|' + b] ? ' 🏆' : '') + (bs && bs.beaten ? ' 👑' : '') + '</div>' + bar(m.pct, 'thin ' + sid) + '<div class="pct">' + (m.n ? m.pct + '%' : '—') + '</div></div>';
      }).join('') + '</div>';
  });
  h += '<div class="card"><h3 class="sec">📈 XP за последните 14 дни</h3>' + weekHTML(14) + '</div>';
  if (S.mocks.length) h += '<div class="card"><h3 class="sec">🎲 История на тестовете</h3>' + S.mocks.slice(-10).reverse().map(function (m) {
    return '<div class="mrow"><div>' + fmtDate(m.d) + ' · ' + (m.sid === 'both' ? '🧬+⚗️' : SUBJ[m.sid].icon) + ' ' + m.right + '/' + m.n + '</div>' + bar(pct(m.right, m.n), 'thin') + '<div class="pct">' + m.mark.toFixed(2) + '</div></div>';
  }).join('') + '</div>';
  return h;
  function stt(i, n, l) { return '<div class="stat"><span class="i">' + i + '</span><div><b>' + n + '</b><small>' + l + '</small></div></div>'; }
}

/* ================= НАСТРОЙКИ ================= */
function settingsHTML() {
  var a = U.ai;
  var h = modeHead('mh-set', 'happy', 'clipboard', 'Настройки', '⚙️ Настройки', 'Прогресът се пази само в този браузър. Няма акаунт и вход в приложението.');
  h += '<div class="card"><h3 class="sec">🤖 Claude AI</h3>' +
    '<div class="row mb">Статус: ' + aiStatusHTML() + '</div>' +
    '<div class="small muted mb" style="font-weight:600">Използва вашия Claude акаунт чрез локалния Claude Agent SDK. ' +
    'Входът се прави в терминала чрез официалната страница на Anthropic; браузърът и това приложение никога не виждат паролата, ключа или токена ви.</div>' +
    (a.state === 'offline' ? '<div class="note mb">' + (BACKEND ? 'Локалният сървър не отговаря. Стартирай го с „npm run dev“.' : 'Приложението е отворено като файл. За Claude стартирай „npm install“ и „npm run dev“, после отвори http://localhost:5178.') + '</div>' : '') +
    (a.unavailable ? '<div class="note mb">' + esc(a.unavailable) + '</div>' : '') +
    (a.lastCheck && !a.lastCheck.ok ? '<div class="err mb">Последна проверка: ' + esc(a.lastCheck.error || 'неуспешна') + '</div>' : '') +
    (a.lastCheck && a.lastCheck.ok ? '<div class="small mb" style="font-weight:700;color:var(--ok-d)">✓ Последната заявка към Claude е успешна.</div>' : '') +
    '<div class="row"><button class="btn ach" data-act="aiConnect">🔗 Свържи Claude</button>' +
    '<button class="btn ghost" data-act="aiTest"' + (a.busy || !BACKEND ? ' disabled' : '') + '>Провери връзката</button></div>' +
    '<label class="fl mt">Модел за оценяване</label><select class="tin" data-chg="model">' +
    MODEL_CHOICES.map(function (m) { return '<option value="' + m[0] + '"' + (S.settings.model === m[0] ? ' selected' : '') + '>' + esc(m[1]) + '</option>'; }).join('') + '</select>' +
    '<div class="small muted mt" style="font-weight:600">Без връзка с Claude отворените въпроси се оценяват локално по ключа (с ясен етикет „Локално оценяване“).</div></div>';
  h += '<div class="card"><h3 class="sec">🔥 Дневна цел</h3><div class="small muted mb" style="font-weight:600">Колко XP на ден поддържат серията жива.</div><div class="choice">' +
    [[10, 'Лека'], [20, 'Нормална'], [30, 'Сериозна'], [50, 'Интензивна'], [80, 'Изпитна сесия']].map(function (x) { return '<button class="' + (S.settings.goalXP === x[0] ? 'on' : '') + '" data-act="goal" data-n="' + x[0] + '">' + x[1] + ' · ' + x[0] + ' XP</button>'; }).join('') + '</div></div>';
  h += '<div class="card"><h3 class="sec">🎮 Обучение</h3>' +
    '<div class="toggle"><div><b>Свободна навигация</b><div class="small muted">Отключва всички теми и шефове в пътя</div></div><button class="sw' + (S.settings.freeNav ? ' on' : '') + '" data-act="toggle" data-k="freeNav" aria-label="Свободна навигация"></button></div>' +
    '<div class="toggle"><div><b>Без анимации</b><div class="small muted">Спокоен режим — без конфети и движение</div></div><button class="sw' + (S.settings.calm ? ' on' : '') + '" data-act="toggle" data-k="calm" aria-label="Без анимации"></button></div></div>';
  h += '<div class="card"><h3 class="sec">💾 Данни</h3><div class="small muted mb" style="font-weight:600">Експортът съдържа само прогреса — никакви ключове или данни за вход.</div><div class="row">' +
    '<button class="btn ghost" data-act="export">⬇️ Експорт</button>' +
    '<label class="btn ghost">⬆️ Импорт<input type="file" accept="application/json" data-chg="import" hidden></label>' +
    '<button class="btn bad" data-act="reset">Изчисти прогреса</button></div></div>';
  return h;
}
function connectSheet() {
  var h = '<div class="row" style="flex-wrap:nowrap">' + P('wave', 'steth', 76) + '<div><h3 style="font-size:21px">🔗 Свържи Claude</h3><div class="small muted" style="font-weight:700">Еднократна настройка, после само „Провери връзката“.</div></div></div>';
  if (!BACKEND) {
    h += '<ol class="mt" style="padding-left:22px;line-height:1.7"><li>Отвори терминал в папката на проекта.</li><li>Изпълни <code>npm install</code> (само първия път).</li>' +
      '<li>Изпълни <code>npm run claude:login</code> и влез със своя Claude Pro акаунт.</li><li>Изпълни <code>npm run dev</code> и отвори <b>http://localhost:5178</b>.</li></ol>';
  } else {
    h += '<ol class="mt" style="padding-left:22px;line-height:1.7"><li>Отвори <b>нов</b> терминал в папката на проекта (сървърът може да продължи да работи).</li>' +
      '<li>Изпълни: <code>npm run claude:login</code> <button class="linkbtn" data-act="copyCmd" data-c="npm run claude:login">копирай</button></li>' +
      '<li>Ще се отвори официалната страница за вход на Anthropic. Влез със своя Claude Pro акаунт.</li>' +
      '<li>Върни се тук и натисни „Провери връзката“.</li></ol>' +
      '<div class="note mt">Входът става изцяло на страницата на Anthropic и се пази от Claude Code на компютъра ти — не в браузъра и не в проекта. ' +
      'Ако в терминала на сървъра е зададен <code>ANTHROPIC_API_KEY</code>, ще се използва той (платено API), а не абонаментът.</div>' +
      '<button class="btn block big mt" id="primary" data-act="aiTest"' + (U.ai.busy ? ' disabled' : '') + '>Провери връзката</button>';
  }
  h += '<button class="linkbtn" style="display:block;margin:14px auto 0" data-act="closeOv">Затвори</button>';
  sheet(h);
}

/* ================= ДЕЙСТВИЯ ================= */
var ACT = {
  go: function (d) { if (d.v === 'open') U.oKey = null; closeOverlay(); go(d.v); },
  more: function () {
    sheet('<h3 class="sec">Още</h3><div class="qa" style="margin:0">' + NAV.filter(function (n) { return n && ['rapid', 'terms', 'open', 'boss', 'mock', 'profile', 'settings'].indexOf(n[0]) >= 0; }).map(function (n) {
      return '<button data-act="go" data-v="' + n[0] + '"><span class="i ic-go">' + n[1] + '</span><span>' + n[2] + '</span></button>';
    }).join('') + '</div><button class="linkbtn" style="display:block;margin:16px auto 0" data-act="closeOv">Затвори</button>');
  },
  closeOv: closeOverlay,
  ovBg: function (d, el, e) { if (e.target === el) closeOverlay(); },
  celClose: function () { closeOverlay(); },
  subj: function (d) { if (S.subj === d.s) return; S.subj = d.s; U.scope = 'all'; U.oKey = null; save(); render(); },
  node: function (d) { nodeSheet(d.tid); },
  bossNode: function (d) {
    var b = d.b, ts = cur().topics.filter(function (t) { return t.block === b; });
    var unlocked = S.settings.freeNav || ts.every(function (t) { return lessonDone(S.subj, t.id); }) || blockMastery(S.subj, b).pct >= 50;
    if (!unlocked) { toast('🔒 Завърши уроците в блока, за да предизвикаш шефа.'); return; }
    bossSheet(b);
  },
  topic: function (d) { closeOverlay(); go('topic', { tid: d.tid }); },
  topicFrom: function (d) { S.subj = d.sid; go('topic', { tid: d.tid }); },
  lessonStart: function (d) { startLesson(S.subj, d.tid, 'lesson'); },
  practice: function (d) { startLesson(S.subj, d.tid, 'practice'); },
  lNext: function () {
    var L = U.L; if (!L) return;
    L.at++; L.st = freshSt();
    if (L.at >= L.steps.length) finishLesson();
    render(); window.scrollTo(0, 0);
  },
  skipLearn: function () { var L = U.L; while (L.at < L.steps.length && L.steps[L.at].kind === 'learn') L.at++; L.st = freshSt(); render(); },
  lSel: function (d) { var L = U.L; if (L.st.checked) return; L.st.sel = +d.j; render(); },
  lCheck: function () {
    var L = U.L, step = L.steps[L.at];
    if (L.st.checked) return;
    if (step.kind === 'mcq') {
      if (L.st.sel == null) return;
      var it = item(step.key), ok = L.st.sel === it.d.a;
      S.mcq[it.key] = ok ? 1 : 0;
      lessonAnswer(ok, step.phase === 'challenge' ? XP.challenge : step.phase === 'retry' ? XP.retry : step.phase === 'review' ? XP.review : XP.practice, it.key);
      render();
    } else if (step.kind === 'term') termCheck();
  },
  lHint: function () { var st = U.L.st, inp = document.getElementById('termInput'); if (inp) st.given = inp.value; st.hint = Math.min(2, st.hint + 1); render(); },
  lDunno: function () {
    var L = U.L, it = item(L.steps[L.at].key), inp = document.getElementById('termInput');
    L.st.given = inp && inp.value.trim() ? inp.value.trim() : '';
    var prev = S.terms[it.key] || { n: 0, right: 0 };
    S.terms[it.key] = { ok: false, n: prev.n + 1, right: prev.right };
    lessonAnswer(false, 0, it.key); render();
  },
  lessonQuit: function () {
    var L = U.L;
    if (L && L.at > 0 && !confirm('Да излезеш ли от урока? Спечелените XP остават, но урокът няма да се брои за завършен.')) return;
    go(L && L.tid ? L.sid : L && L.mode === 'review' ? 'mistakes' : L && L.mode === 'terms' ? 'terms' : 'home');
  },
  lessonExit: function () { var L = U.L; go(L.mode === 'lesson' || L.mode === 'practice' ? L.sid : L.mode === 'review' ? 'mistakes' : L.mode === 'terms' ? 'terms' : 'home'); },
  scope: function (d) { U.scope = d.s; render(); },
  termsStart: function () { startRun('terms', shuffle(keysOf(S.subj, 't', scopeFilter())).slice(0, TERMS_N), 'Назови термина'); },
  termsTopic: function (d) { U.scope = 't:' + d.tid; startRun('terms', shuffle(keysOf(S.subj, 't', scopeFilter())).slice(0, TERMS_N), 'Назови термина'); },
  reviewStart: function (d) {
    var list = shuffle(d.all === '1' ? mistakes(S.subj) : dueMistakes(S.subj));
    if (!list.length) list = shuffle(d.all === '1' ? mistakes() : dueMistakes());
    if (!list.length) { toast('Няма грешки за преговор 🎉'); return; }
    S.subj = item(list[0]).sid;
    startRun('review', list.filter(function (k) { return item(k).sid === S.subj; }).slice(0, REVIEW_N), 'Преговор на грешките');
  },
  retryOne: function (d) { startRun('review', [d.k], 'Преговор'); },
  mistakeDel: function (d) { delete S.srs[d.k]; save(); render(); },
  rapidStart: function () { closeOverlay(); startRapid(); },
  rapidMenu: function () { U.rapid = null; render(); },
  rapidPick: function (d) { rapidPick(+d.j); },
  rapidNext: function () { var R = U.rapid; R.at++; R.pick = null; R.pts = 0; R.left = rapidSec(R.at); render(); window.scrollTo(0, 0); if (R.at < R.list.length) rapidTimer(); },
  rapidQuit: function () { stopTimer(); var R = U.rapid; R.list = R.list.slice(0, R.at + (R.pick != null ? 1 : 0)); R.at = R.list.length; render(); },
  mockBoth: function (d) { U.mockBoth = d.b === '1'; render(); },
  mockN: function (d) { U.mockN = +d.n; render(); },
  mockStart: function () {
    var pool = U.mockBoth ? keysOf('bio', 'q').concat(keysOf('chem', 'q')) : keysOf(S.subj, 'q'), list = shuffle(pool).slice(0, U.mockN);
    startExam('mock', list, Math.round(list.length * 1.25));
  },
  bossStart: function (d) {
    var b = d.b, pool = keysOf(S.subj, 'q', function (t) { return t.block === b; });
    if (!pool.length) return;
    startExam('boss', shuffle(pool).slice(0, BOSS_N), BOSS_MIN, b);
  },
  examPick: function (d) { var E = U.exam; E.ans[E.at] = +d.j; render(); },
  examNav: function (d) { var E = U.exam; E.at = Math.max(0, Math.min(E.list.length - 1, E.at + +d.d)); render(); window.scrollTo(0, 0); },
  examGo: function (d) { U.exam.at = +d.i; render(); },
  examSubmit: function () {
    var E = U.exam, left = E.list.length - Object.keys(E.ans).length;
    if (left && !confirm('Имаш ' + left + ' неотговорени ' + pl(left, 'въпрос', 'въпроса') + '. Да предам ли теста?')) return;
    submitExam();
  },
  examQuit: function () { if (!confirm('Да прекратиш ли теста? Резултатът няма да се запише.')) return; var k = U.exam.kind; stopTimer(); U.exam = null; go(k); },
  examBack: function () { go(U.exam.kind); },
  examAll: function () { U.examAll = !U.examAll; render(); },
  openSel: function (d) { closeOverlay(); var it = item(d.k); if (it) S.subj = it.sid; go('open', { oKey: d.k }); },
  openBack: function () { U.oKey = null; render(); },
  openGrade: function (d) { gradeOpen(d.k, d.ctx); },
  openKey: function (d) { U.showKey[d.k] = !U.showKey[d.k]; render(); },
  openCues: function (d) { U.showCues[d.k] = !U.showCues[d.k]; render(); },
  openModel: function (d) { modelAnswer(d.k); },
  aiConnect: function () { connectSheet(); },
  aiTest: function () { closeOverlay(); refreshAI(true); },
  copyCmd: function (d) {
    try { navigator.clipboard.writeText(d.c).then(function () { toast('📋 Копирано: ' + d.c); }, function () { toast(d.c); }); } catch (e) { toast(d.c); }
  },
  goal: function (d) { S.settings.goalXP = +d.n; save(); render(); },
  toggle: function (d) { S.settings[d.k] = !S.settings[d.k]; save(); render(); },
  export: function () {
    var blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'medpanda-progress-' + today() + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },
  reset: function () {
    if (!confirm('Да изчистя ли ЦЕЛИЯ прогрес — XP, серия, грешки, постижения? API ключът остава.')) return;
    S = freshState(); saveNow(); go('home'); toast('Прогресът е изчистен.');
  }
};
function termCheck() {
  var L = U.L, step = L.steps[L.at], it = item(step.key), inp = document.getElementById('termInput'), val = inp ? inp.value.trim() : '';
  if (!val || L.st.checked) { if (inp) { inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); } return; }
  var c = checkTerm(val, it.d[0]);
  L.st.given = val; L.st.typo = c.typo;
  var base = step.phase === 'retry' ? XP.retry : c.typo ? XP.termTypo : XP.term;
  var xp = c.ok ? Math.max(3, base - L.st.hint * XP.hint) : 0;
  var prev = S.terms[it.key] || { n: 0, right: 0 };
  S.terms[it.key] = { ok: c.ok, n: prev.n + 1, right: prev.right + (c.ok ? 1 : 0) };
  if (c.ok) S.cnt.terms++;
  lessonAnswer(c.ok, xp, it.key); render();
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  var fn = ACT[b.dataset.act]; if (!fn) return;
  if (b.tagName !== 'LABEL') e.preventDefault();
  fn(b.dataset, b, e);
});
document.addEventListener('submit', function (e) {
  var f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault();
  if (f.dataset.form === 'termCheck') termCheck();
});
document.addEventListener('input', function (e) {
  var el = e.target;
  if (el.dataset && el.dataset.inp === 'draft') {
    var k = el.dataset.k; S.opens[k] = S.opens[k] || {}; S.opens[k].draft = el.value; save();
    var w = el.value.trim() ? el.value.trim().split(/\s+/).length : 0, wc = document.getElementById('wc');
    if (wc) wc.textContent = w + ' ' + pl(w, 'дума', 'думи');
  }
});
document.addEventListener('change', function (e) {
  var el = e.target, c = el.dataset && el.dataset.chg; if (!c) return;
  if (c === 'model') { S.settings.model = MODEL_CHOICES.some(function (m) { return m[0] === el.value; }) ? el.value : ''; save(); toast('Модел: ' + (S.settings.model || 'по подразбиране')); }
  else if (c === 'scopeTopic') { U.scope = el.value || 'all'; render(); }
  else if (c === 'import') {
    var file = el.files && el.files[0]; if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var s = JSON.parse(rd.result);
        if (!s || typeof s !== 'object' || !(s.v >= 1)) throw new Error();
        if (!confirm('Да заменя ли текущия прогрес с този от файла?')) return;
        localStorage.setItem(LS_STATE, JSON.stringify(s)); S = load(); go('home'); toast('Прогресът е зареден.');
      } catch (err) { toast('Файлът не е валиден експорт.'); }
    };
    rd.readAsText(file);
  }
});
document.addEventListener('keydown', function (e) {
  var ovOpen = !!document.getElementById('overlay').innerHTML;
  if (e.key === 'Escape') {
    if (ovOpen) { closeOverlay(); return; }
    if (U.v === 'lesson' && U.L) { if (U.L.done) ACT.lessonExit(); else ACT.lessonQuit(); return; }
    if (U.v === 'rapid' && U.rapid && U.rapid.at < U.rapid.list.length) { ACT.rapidQuit(); return; }
    if (U.exam && !U.exam.done) { ACT.examQuit(); return; }
  }
  var inField = e.target.matches && e.target.matches('input, textarea, select');
  if (e.key === 'Enter' && !inField) {
    var pb = (ovOpen ? document.getElementById('overlay') : app).querySelector('#primary');
    if (pb && !pb.disabled && document.activeElement !== pb && (ovOpen || U.v === 'lesson' || U.v === 'rapid')) { e.preventDefault(); pb.click(); }
    return;
  }
  if (inField || ovOpen) return;
  var n = /^[1-6]$/.test(e.key) ? +e.key - 1 : -1;
  if (n < 0) {
    if (U.exam && !U.exam.done && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) ACT.examNav({ d: e.key === 'ArrowRight' ? 1 : -1 });
    return;
  }
  if (U.v === 'lesson' && U.L && !U.L.done) {
    var step = U.L.steps[U.L.at];
    if (step && step.kind === 'mcq' && !U.L.st.checked && n < item(step.key).d.o.length) { U.L.st.sel = n; render(); }
  } else if (U.v === 'rapid' && U.rapid && U.rapid.at < U.rapid.list.length && U.rapid.pick == null) {
    if (n < item(U.rapid.list[U.rapid.at]).d.o.length) rapidPick(n);
  } else if (U.exam && !U.exam.done && n < item(U.exam.list[U.exam.at]).d.o.length) { U.exam.ans[U.exam.at] = n; render(); }
});

render();
if (oldKeyRemoved) toast('🔒 Старият API ключ беше изтрит от браузъра. AI оценяването вече минава през локалния сървър.');
refreshAI(false);
})();
