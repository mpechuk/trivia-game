import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBreakdowns,
  makeBlankQuestion,
  nextQuestionId,
  normalizeQuestion,
  removeQuestion,
  upsertQuestion,
  validateQuestion,
} from '../../js/packEditor.js';

const sample = () => [
  { id: 1, category: 'A', difficulty: 1, question: 'q1', answer: 'a1', wrong_answers: ['x', 'y'] },
  { id: 2, category: 'B', difficulty: 3, question: 'q2', answer: 'a2', wrong_answers: ['z'] },
];

// ---- nextQuestionId ----

test('nextQuestionId: one past the max existing id', () => {
  assert.equal(nextQuestionId(sample()), 3);
});

test('nextQuestionId: empty pack starts at 1', () => {
  assert.equal(nextQuestionId([]), 1);
});

test('nextQuestionId: ignores non-numeric / gaps and never collides', () => {
  const qs = [{ id: 10 }, { id: 'abc' }, { id: 2 }];
  assert.equal(nextQuestionId(qs), 11);
});

// ---- makeBlankQuestion ----

test('makeBlankQuestion: fresh id, blank content, difficulty synced', () => {
  const q = makeBlankQuestion(sample());
  assert.equal(q.id, 3);
  assert.equal(q.question, '');
  assert.equal(q.answer, '');
  assert.equal(q.difficulty, 1);
  assert.equal(q.difficulty_label, 'Easy');
  assert.ok(Array.isArray(q.wrong_answers));
});

// ---- normalizeQuestion ----

test('normalizeQuestion: trims text and defaults an empty category', () => {
  const n = normalizeQuestion({ question: '  hi  ', answer: ' a ', category: '   ', difficulty: 2, wrong_answers: [] });
  assert.equal(n.question, 'hi');
  assert.equal(n.answer, 'a');
  assert.equal(n.category, 'General');
});

test('normalizeQuestion: drops blank, duplicate, and answer-colliding wrong answers', () => {
  const n = normalizeQuestion({
    question: 'q', answer: 'right', difficulty: 1,
    wrong_answers: ['  ', 'wrong', 'wrong', 'right', ' also '],
  });
  assert.deepEqual(n.wrong_answers, ['wrong', 'also']);
});

test('normalizeQuestion: clamps difficulty to 1..5 and syncs the label', () => {
  assert.equal(normalizeQuestion({ difficulty: 9, wrong_answers: [] }).difficulty, 5);
  assert.equal(normalizeQuestion({ difficulty: 9, wrong_answers: [] }).difficulty_label, 'Expert');
  assert.equal(normalizeQuestion({ difficulty: 0, wrong_answers: [] }).difficulty, 1);
});

test('normalizeQuestion: preserves unknown fields like photo links', () => {
  const n = normalizeQuestion({ question: 'q', answer: 'a', difficulty: 1, wrong_answers: ['b'], photo_link: 'p.png' });
  assert.equal(n.photo_link, 'p.png');
});

// ---- validateQuestion ----

test('validateQuestion: a well-formed question passes', () => {
  assert.deepEqual(validateQuestion({ question: 'q', answer: 'a', difficulty: 1, wrong_answers: ['b'] }), []);
});

test('validateQuestion: reports missing text, answer, and wrong answers', () => {
  const errs = validateQuestion({ question: '  ', answer: '', difficulty: 1, wrong_answers: [] });
  assert.equal(errs.length, 3);
});

test('validateQuestion: a wrong answer that only duplicates the correct one is not enough', () => {
  const errs = validateQuestion({ question: 'q', answer: 'a', difficulty: 1, wrong_answers: ['a'] });
  assert.deepEqual(errs, ['Add at least one wrong answer.']);
});

// ---- upsertQuestion / removeQuestion (pure, return new arrays) ----

test('upsertQuestion: appends when the id is new, without mutating the input', () => {
  const qs = sample();
  const next = upsertQuestion(qs, { id: 3, question: 'q3' });
  assert.equal(next.length, 3);
  assert.equal(qs.length, 2);
  assert.equal(next[2].question, 'q3');
});

test('upsertQuestion: replaces in place when the id exists', () => {
  const next = upsertQuestion(sample(), { id: 2, question: 'edited' });
  assert.equal(next.length, 2);
  assert.equal(next[1].question, 'edited');
});

test('removeQuestion: drops only the matching id, leaving the input untouched', () => {
  const qs = sample();
  const next = removeQuestion(qs, 1);
  assert.deepEqual(next.map((q) => q.id), [2]);
  assert.equal(qs.length, 2);
});

// ---- computeBreakdowns ----

test('computeBreakdowns: counts totals, categories, and difficulty labels', () => {
  const b = computeBreakdowns([
    { category: 'A', difficulty: 1 },
    { category: 'A', difficulty: 5 },
    { category: 'B', difficulty: 1 },
  ]);
  assert.equal(b.total_questions, 3);
  assert.deepEqual(b.category_breakdown, { A: 2, B: 1 });
  assert.deepEqual(b.difficulty_breakdown, { Easy: 2, Expert: 1 });
});

test('computeBreakdowns: blank categories fall under General', () => {
  const b = computeBreakdowns([{ category: '  ', difficulty: 2 }]);
  assert.deepEqual(b.category_breakdown, { General: 1 });
});
