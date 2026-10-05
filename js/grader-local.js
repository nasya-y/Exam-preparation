/* =====================================================================
   Локално оценяване (резервен вариант, когато Claude не е достъпен).
   Работи и в браузъра (window.LocalGrader), и в локалния сървър (require).

   ВАЖНО: това НЕ е еквивалент на оценка от Claude. Проверява се само дали
   ключовите понятия от официалния ключ присъстват в текста (с толеранс за
   окончанията в българския). Смисълът и верността на твърденията не се
   проверяват.
   ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LocalGrader = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STOP = ('и в във на с със за от по до се е са съм си сме сте че не ни а но или към при като който която които ' +
    'което това тази този тези там тук една един едно две два три само също всеки всяка всяко без им ги го я да ще има ' +
    'няма както така когато след преди между чрез пример примери напр те то тя той ние вие какво колко кои кой коя кое ' +
    'защо как дали много малко повече по-малко ли бъде бъдат е/са всички свои своя своите негов нейн техен им').split(/\s+/);

  function clean(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').toLowerCase().replace(/ё/g, 'е')
      .replace(/[₀-₉]/g, function (c) { return String(c.charCodeAt(0) - 8320); });
  }
  function tokens(s) {
    return clean(s).split(/[^a-zа-я0-9⁺⁻+]+/i).filter(function (w) {
      return w && STOP.indexOf(w) < 0 && (w.length >= 3 || /\d/.test(w));
    });
  }
  /* грубо „стъбло“ — достатъчно за българските окончания (синтеза/синтезата/синтезира) */
  function stem(w) {
    if (/\d/.test(w) || w.length <= 4) return w;
    return w.slice(0, Math.max(4, Math.min(6, w.length - 2)));
  }
  function has(answerStems, word) {
    var s = stem(word);
    for (var i = 0; i < answerStems.length; i++) {
      var a = answerStems[i];
      if (a === s) return true;
      if (s.length >= 4 && a.length >= 4 && (a.indexOf(s) === 0 || s.indexOf(a) === 0)) return true;
    }
    return false;
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  /* Оценява отговор спрямо ключа. Връща същата структура като сървъра. */
  function grade(input) {
    var rubric = (input.rubric || []).map(String).filter(Boolean);
    var answer = String(input.answer || '');
    var reqTerms = uniq((input.requiredTerms || []).map(String).filter(Boolean));
    var maxScore = Number(input.maxScore) > 0 ? Number(input.maxScore) : 100;
    var ansStems = uniq(tokens(answer).map(stem));
    var words = answer.trim() ? answer.trim().split(/\s+/).length : 0;

    var correct = [], partial = [], missed = [], credit = 0;
    rubric.forEach(function (el) {
      var toks = uniq(tokens(el));
      if (!toks.length) { credit += 1; return; }
      var hit = toks.filter(function (w) { return has(ansStems, w); }).length;
      var cov = hit / toks.length;
      if (cov >= 0.67) { credit += 1; correct.push(el); }
      else if (cov >= 0.34) { credit += 0.5; partial.push(el); }
      else missed.push(el);
    });
    var score = rubric.length ? Math.round(100 * credit / rubric.length) : 0;
    if (words < 5) score = Math.min(score, 20);

    var missedTerms = reqTerms.filter(function (t) {
      var toks = tokens(t.replace(/\([^)]*\)/g, ' '));
      return toks.length && !toks.every(function (w) { return has(ansStems, w); });
    });

    var feedback = ['Локално оценяване: проверено е само дали ключовите понятия от официалния ключ присъстват в отговора. ' +
      'Верността на твърденията и свързаността на текста НЕ са проверени.'];
    missed.slice(0, 6).forEach(function (el) { feedback.push('Липсва: „' + el + '“.'); });
    partial.slice(0, 4).forEach(function (el) { feedback.push('Само частично: „' + el + '“.'); });
    if (!missed.length && !partial.length && rubric.length) feedback.push('Всички елементи от ключа са споменати. За истинска оценка на точността свържи Claude.');
    if (words < 5) feedback.push('Отговорът е твърде кратък за пълна оценка.');

    return {
      score: score,
      xpPercent: score,
      passed: score >= 60,
      maxScore: maxScore,
      points: Math.round(score * maxScore / 100),
      feedback: feedback,
      missedTerms: missedTerms.slice(0, 12),
      correctConcepts: correct.concat(partial.map(function (p) { return p + ' (частично)'; })).slice(0, 12),
      missedConcepts: missed.slice(0, 12),
      incorrectConcepts: [],
      gradingMode: 'local'
    };
  }

  /* Дали даден термин е „закотвен“ в ключа — за филтриране на измислени изисквания. */
  function anchored(term, rubricText) {
    var rStems = uniq(tokens(rubricText).map(stem));
    var toks = tokens(String(term).replace(/\([^)]*\)/g, ' '));
    return toks.length > 0 && toks.every(function (w) { return has(rStems, w); });
  }

  return { grade: grade, anchored: anchored, tokens: tokens };
});
