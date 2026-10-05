import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePayload, validateGrade, buildGradePrompt, LocalGrader } from '../grading.mjs';

const base = {
  subject: 'bio', topic: 'Метаболизъм', question: 'Обяснете анаболизъм и катаболизъм.',
  rubric: ['анаболизъм — синтеза, изразходва енергия', 'катаболизъм — разграждане, освобождава енергия', 'двете заедно = метаболизъм'],
  requiredTerms: ['Метаболизъм'], answer: 'Анаболизмът е синтеза на вещества с изразходване на енергия.', maxScore: 100
};

test('validatePayload приема валидни данни и отхвърля невалидни', () => {
  assert.ok(validatePayload(base).value);
  assert.match(validatePayload({ ...base, answer: 'кратко' }).error, /кратък/);
  assert.match(validatePayload({ ...base, answer: 'x'.repeat(8001) }).error, /дълъг/);
  assert.ok(validatePayload({ ...base, subject: 'math' }).error);
  assert.ok(validatePayload({ ...base, rubric: [] }).error);
  assert.ok(validatePayload({ ...base, rubric: [42] }).error);
  assert.ok(validatePayload(null).error);
});

test('validateGrade изчиства и валидира изхода от Claude', () => {
  const p = validatePayload(base).value;
  const g = validateGrade({ score: 82.4, feedback: ['Добре.', ' ', 'Добре.'], missedTerms: ['метаболизъм', 'окислително фосфорилиране'],
    correctConcepts: ['синтеза'], missedConcepts: [], incorrectConcepts: [] }, p);
  assert.equal(g.score, 82);
  assert.equal(g.xpPercent, 82);
  assert.equal(g.passed, true);
  assert.equal(g.gradingMode, 'claude');
  assert.deepEqual(g.feedback, ['Добре.']);
  assert.deepEqual(g.missedTerms, ['метаболизъм']);   // термин извън ключа се изхвърля
  assert.equal(g.droppedTerms, 1);
  assert.equal(validateGrade({ score: 150, feedback: [], missedTerms: [], correctConcepts: [], missedConcepts: [], incorrectConcepts: [] }, p).score, 100);
  assert.equal(validateGrade({ score: 'много', feedback: [] }, p), null);
  assert.equal(validateGrade({ score: 50, feedback: 'текст' }, p), null);
  assert.equal(validateGrade([1, 2], p), null);
  assert.equal(validateGrade(null, p), null);
});

test('промптът съдържа ключа и маркира отговора като данни', () => {
  const s = buildGradePrompt(validatePayload(base).value);
  assert.match(s, /ОФИЦИАЛЕН ОТГОВОР/);
  assert.match(s, /<otgovor>\nАнаболизмът/);
  assert.match(s, /МАКСИМАЛЕН РЕЗУЛТАТ: 100/);
});

test('локалното оценяване връща същата структура с gradingMode local', () => {
  const g = LocalGrader.grade({ ...base, answer: 'Анаболизмът е синтеза и изразходва енергия. Катаболизмът е разграждане и освобождава енергия. Заедно са метаболизъм.' });
  assert.equal(g.gradingMode, 'local');
  assert.ok(g.score >= 80, 'пълен отговор → висок резултат, получено ' + g.score);
  assert.deepEqual(g.incorrectConcepts, []);
  const bad = LocalGrader.grade({ ...base, answer: 'Не знам какво да напиша тук.' });
  assert.ok(bad.score <= 20);
  assert.deepEqual(bad.missedTerms, ['Метаболизъм']);
});
