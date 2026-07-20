import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GAME, DEFAULT_THEME, loadConfig, loadPackManifest, loadTurnConfig, normalizeConfig } from '../../js/config.js';

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

test('normalizeConfig accepts a parsed dataset (used for uploaded packs)', () => {
  const { dataset, theme, gameDefaults } = normalizeConfig({
    title: 'Upload', questions: [QUESTION], theme: { emoji: '🎲' },
  }, 'my.json');
  assert.equal(dataset.title, 'Upload');
  assert.equal(theme.emoji, '🎲');
  assert.deepEqual(gameDefaults, DEFAULT_GAME);
});

test('normalizeConfig rejects datasets without questions', () => {
  assert.throws(() => normalizeConfig({ title: 'X' }, 'bad.json'), /no questions/);
  assert.throws(() => normalizeConfig(null, 'null.json'), /no questions/);
});

test('loadPackManifest returns the packs array', async () => {
  stubFetch({ packs: [{ file: 'a.json', name: 'A' }, { name: 'no file' }] });
  const packs = await loadPackManifest('packs.json');
  assert.equal(packs.length, 1); // entry without a file is dropped
  assert.equal(packs[0].file, 'a.json');
});

test('loadPackManifest returns [] on failure', async () => {
  stubFetch({}, false);
  assert.deepEqual(await loadPackManifest('missing.json'), []);
});

test('loadTurnConfig accepts both {iceServers: [...]} and a bare array', async () => {
  const server = { urls: 'turn:r.example:3478', username: 'u', credential: 'c' };
  stubFetch({ iceServers: [server, { no_urls: true }] });
  assert.deepEqual(await loadTurnConfig(), [server]);
  stubFetch([server]);
  assert.deepEqual(await loadTurnConfig(), [server]);
});

test('loadTurnConfig returns [] when the file is missing or malformed', async () => {
  stubFetch({}, false); // 404 — no local TURN config
  assert.deepEqual(await loadTurnConfig(), []);
  stubFetch({ iceServers: 'not-an-array' });
  assert.deepEqual(await loadTurnConfig(), []);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await loadTurnConfig(), []);
});
