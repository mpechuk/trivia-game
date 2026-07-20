import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MIX_PRESETS,
  buildChoices,
  buildPlan,
  categoriesOf,
  difficultyTargets,
  filterPool,
  selectQuestions,
} from '../../js/questions.js';

const dataset = JSON.parse(
  readFileSync(new URL('../../data/fifa_world_cup_2026_trivia.json', import.meta.url), 'utf8')
);
const questions = dataset.questions;

const distribution = (sel) => [1, 2, 3, 4, 5].map((d) => sel.filter((q) => q.difficulty === d).length);

test('difficultyTargets sums to count and skips zero-weight buckets', () => {
  const t = difficultyTargets(15, MIX_PRESETS.balanced);
  assert.equal(t.reduce((a, b) => a + b, 0), 15);
  const hc = difficultyTargets(10, MIX_PRESETS.hardcore);
  assert.equal(hc[0], 0); // hardcore has 0 weight on Easy
  assert.equal(hc.reduce((a, b) => a + b, 0), 10);
  assert.deepEqual(difficultyTargets(10, [0, 0, 0, 0, 0]), [0, 0, 0, 0, 0]);
});

test('categoriesOf counts every category', () => {
  const counts = categoriesOf(questions);
  assert.equal([...counts.values()].reduce((a, b) => a + b, 0), questions.length);
  assert.ok(counts.get('Venues') > 0);
});

test('filterPool: "all" passes everything, list filters', () => {
  assert.equal(filterPool(questions, 'all').length, questions.length);
  const venues = filterPool(questions, ['Venues']);
  assert.ok(venues.length > 0);
  assert.ok(venues.every((q) => q.category === 'Venues'));
});

test('selectQuestions honors count and balanced mix', () => {
  const sel = selectQuestions(questions, {
    count: 15, weights: MIX_PRESETS.balanced, categories: 'all', order: 'ramp',
  });
  assert.equal(sel.length, 15);
  assert.deepEqual(distribution(sel), difficultyTargets(15, MIX_PRESETS.balanced));
});

test('selectQuestions "ramp" orders ascending difficulty', () => {
  const sel = selectQuestions(questions, {
    count: 20, weights: MIX_PRESETS.balanced, categories: 'all', order: 'ramp',
  });
  const d = sel.map((q) => q.difficulty);
  assert.deepEqual(d, [...d].sort((a, b) => a - b));
});

test('selectQuestions falls back to nearest difficulty when a bucket runs short', () => {
  // Venues has ~24 questions; hardcore targets mostly 4s and 5s which the
  // category cannot fully supply — the deficit must be borrowed, never dropped.
  const sel = selectQuestions(questions, {
    count: 20, weights: MIX_PRESETS.hardcore, categories: ['Venues'], order: 'shuffled',
  });
  assert.equal(sel.length, 20);
  assert.ok(sel.every((q) => q.category === 'Venues'));
  // no duplicates
  assert.equal(new Set(sel.map((q) => q.id)).size, 20);
});

test('selectQuestions clamps count to the available pool', () => {
  const venuesTotal = filterPool(questions, ['Venues']).length;
  const sel = selectQuestions(questions, {
    count: 999, weights: MIX_PRESETS.balanced, categories: ['Venues'], order: 'shuffled',
  });
  assert.equal(sel.length, venuesTotal);
});

test('buildChoices includes the right answer at correctIndex', () => {
  const q = questions[0];
  for (const n of [2, 3, 4, 5]) {
    const { labels, correctIndex } = buildChoices(q, n);
    assert.equal(labels.length, n);
    assert.equal(labels[correctIndex], q.answer);
    labels.forEach((l) => assert.ok(l === q.answer || q.wrong_answers.includes(l)));
    assert.equal(new Set(labels).size, n);
  }
});

test('buildPlan produces a playable plan', () => {
  const plan = buildPlan(questions, {
    count: 8, weights: MIX_PRESETS.balanced, categories: 'all', order: 'ramp', choicesPerQuestion: 4,
  });
  assert.equal(plan.length, 8);
  for (const item of plan) {
    assert.equal(item.labels.length, 4);
    assert.equal(item.labels[item.correctIndex], item.question.answer);
  }
});
