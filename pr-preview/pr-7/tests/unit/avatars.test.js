import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DICEBEAR_STYLES,
  EMOJI_CHOICES,
  dicebearUrl,
  randomAdventurerAvatar,
  randomEmojiAvatar,
  randomName,
  randomSeed,
  sanitizeAvatar,
} from '../../js/avatars.js';

test('emoji choices and styles are populated', () => {
  assert.ok(EMOJI_CHOICES.length >= 24);
  assert.ok(DICEBEAR_STYLES.length >= 2);
});

test('sanitizeAvatar accepts valid emoji avatars', () => {
  assert.deepEqual(sanitizeAvatar({ kind: 'emoji', value: '🦊' }), { kind: 'emoji', value: '🦊' });
  // multi-codepoint emoji survive
  const flag = sanitizeAvatar({ kind: 'emoji', value: '🏳️‍🌈' });
  assert.equal(flag.kind, 'emoji');
  assert.ok(flag.value.length > 0);
});

test('sanitizeAvatar caps emoji length', () => {
  const out = sanitizeAvatar({ kind: 'emoji', value: 'abcdefghijklmnop' });
  assert.ok(out.value.length <= 12);
});

test('sanitizeAvatar accepts valid dicebear avatars and rejects hostile ones', () => {
  assert.deepEqual(
    sanitizeAvatar({ kind: 'dicebear', style: 'bottts', seed: 'kai42' }),
    { kind: 'dicebear', style: 'bottts', seed: 'kai42' }
  );
  // path traversal / injection attempts fall back to the safe emoji
  for (const bad of [
    { kind: 'dicebear', style: '../x', seed: 'ok' },
    { kind: 'dicebear', style: 'bottts', seed: 'a/b' },
    { kind: 'dicebear', style: 'bottts', seed: 'x'.repeat(99) },
    { kind: 'wat', value: '🦊' },
    null,
    'emoji',
  ]) {
    assert.deepEqual(sanitizeAvatar(bad), { kind: 'emoji', value: '🙂' });
  }
});

test('dicebearUrl builds an encoded API url', () => {
  const url = dicebearUrl('fun-emoji', 'a b&c', 96);
  assert.ok(url.startsWith('https://api.dicebear.com/9.x/fun-emoji/svg?seed='));
  assert.ok(url.includes(encodeURIComponent('a b&c')));
  assert.ok(!url.includes('a b&c'));
});

test('random helpers produce valid values', () => {
  assert.match(randomSeed(), /^[a-z0-9]+$/);
  const a = randomEmojiAvatar();
  assert.equal(a.kind, 'emoji');
  assert.ok(EMOJI_CHOICES.includes(a.value));
});

test('randomAdventurerAvatar is a shuffled dicebear adventurer', () => {
  const a = randomAdventurerAvatar();
  assert.equal(a.kind, 'dicebear');
  assert.equal(a.style, 'adventurer');
  // survives sanitization unchanged (valid style + seed)
  assert.deepEqual(sanitizeAvatar(a), a);
  // shuffled: two draws almost never collide
  assert.notEqual(randomAdventurerAvatar().seed, randomAdventurerAvatar().seed);
});

test('randomName is a fun, non-empty name within the 24-char cap', () => {
  const n = randomName();
  assert.match(n, /^[A-Za-z]+\d{2}$/);
  assert.ok(n.length > 0 && n.length <= 24);
});
