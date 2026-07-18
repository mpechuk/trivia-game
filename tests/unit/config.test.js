import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GAME, DEFAULT_THEME, loadConfig } from '../../js/config.js';

const QUESTION = {
  id: 1, category: 'X', difficulty: 1, question: 'q?', answer: 'A', wrong_answers: ['B', 'C', 'D', 'E'],
};

function stubFetch(payload, ok = true) {
  globalThis.fetch = async () => ({
    ok,
    status: ok ? 200 : 404,
    json: async () => payload,
  });
}

test('loadConfig merges theme/game_defaults over built-in defaults', async () => {
  stubFetch({
    title: 'T',
    questions: [QUESTION],
    theme: { colors: { primary: '#123456' } },
    game_defaults: { question_count: 7, scoring: { base_points: 42 } },
  });
  const { dataset, theme, gameDefaults } = await loadConfig('x.json');
  assert.equal(dataset.title, 'T');
  // overridden values win…
  assert.equal(theme.colors.primary, '#123456');
  assert.equal(gameDefaults.question_count, 7);
  assert.equal(gameDefaults.scoring.base_points, 42);
  // …while unspecified values keep their defaults
  assert.equal(theme.colors.correct, DEFAULT_THEME.colors.correct);
  assert.equal(theme.answer_buttons.length, DEFAULT_THEME.answer_buttons.length);
  assert.equal(gameDefaults.time_per_question_seconds, DEFAULT_GAME.time_per_question_seconds);
  assert.equal(gameDefaults.scoring.wrong_penalty_max, DEFAULT_GAME.scoring.wrong_penalty_max);
});

test('loadConfig works with a bare dataset (no theme / game_defaults blocks)', async () => {
  stubFetch({ title: 'Bare', questions: [QUESTION] });
  const { theme, gameDefaults } = await loadConfig('bare.json');
  assert.deepEqual(theme, DEFAULT_THEME);
  assert.deepEqual(gameDefaults, DEFAULT_GAME);
});

test('loadConfig rejects configs without questions', async () => {
  stubFetch({ title: 'Empty', questions: [] });
  await assert.rejects(() => loadConfig('empty.json'), /no questions/);
  stubFetch({ title: 'None' });
  await assert.rejects(() => loadConfig('none.json'), /no questions/);
});

test('loadConfig rejects on HTTP errors', async () => {
  stubFetch({}, false);
  await assert.rejects(() => loadConfig('missing.json'), /HTTP 404/);
});
