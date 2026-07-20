import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MSG,
  PROTOCOL_VERSION,
  makeRoomCode,
  msg,
  normalizeRoomCode,
  validateMsg,
} from '../../js/net/protocol.js';

test('makeRoomCode uses the unambiguous alphabet', () => {
  for (let i = 0; i < 50; i++) {
    const code = makeRoomCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
    assert.doesNotMatch(code, /[IO01]/);
  }
});

test('normalizeRoomCode uppercases and strips junk', () => {
  assert.equal(normalizeRoomCode(' ab-cd3 '), 'ABCD3');
  assert.equal(normalizeRoomCode('abcdefghijkl'), 'ABCDEFGH'); // capped at 8
  assert.equal(normalizeRoomCode(null), '');
});

test('msg stamps the protocol version', () => {
  assert.deepEqual(msg('x', { a: 1 }), { v: PROTOCOL_VERSION, type: 'x', a: 1 });
});

test('validateMsg drops garbage', () => {
  assert.equal(validateMsg(null), null);
  assert.equal(validateMsg('hi'), null);
  assert.equal(validateMsg([1, 2]), null);
  assert.equal(validateMsg({ v: 99, type: MSG.JOIN }), null); // wrong version
  assert.equal(validateMsg({ v: PROTOCOL_VERSION, type: 'hack' }), null); // unknown type
});

test('validateMsg sanitizes join messages', () => {
  const good = validateMsg(msg(MSG.JOIN, {
    playerId: 'abcd1234-ef56-7890-abcd-1234567890ab',
    name: '  Anna   Banana  ',
    avatar: { kind: 'emoji', value: '🦊' },
  }));
  assert.equal(good.name, 'Anna Banana');
  assert.deepEqual(good.avatar, { kind: 'emoji', value: '🦊' });

  // bad playerId → dropped entirely
  assert.equal(validateMsg(msg(MSG.JOIN, { playerId: 'x!', name: 'A' })), null);
  assert.equal(validateMsg(msg(MSG.JOIN, { playerId: 'short', name: 'A' })), null);

  // hostile name is trimmed to 24 chars, empty becomes "Player"
  const long = validateMsg(msg(MSG.JOIN, {
    playerId: 'abcdefgh12345678',
    name: 'x'.repeat(200),
  }));
  assert.equal(long.name.length, 24);
  const empty = validateMsg(msg(MSG.JOIN, { playerId: 'abcdefgh12345678', name: '   ' }));
  assert.equal(empty.name, 'Player');

  // bogus avatar falls back to a safe emoji
  const bad = validateMsg(msg(MSG.JOIN, {
    playerId: 'abcdefgh12345678',
    name: 'A',
    avatar: { kind: 'dicebear', style: '<script>', seed: '../../etc' },
  }));
  assert.equal(bad.avatar.kind, 'emoji');
});

test('validateMsg checks answer indexes', () => {
  const ok = validateMsg(msg(MSG.ANSWER, { questionIndex: 3, choiceIndex: 2 }));
  assert.deepEqual(ok, { v: PROTOCOL_VERSION, type: MSG.ANSWER, questionIndex: 3, choiceIndex: 2 });
  assert.equal(validateMsg(msg(MSG.ANSWER, { questionIndex: -1, choiceIndex: 0 })), null);
  assert.equal(validateMsg(msg(MSG.ANSWER, { questionIndex: 0, choiceIndex: 99 })), null);
  assert.equal(validateMsg(msg(MSG.ANSWER, { questionIndex: 1.5, choiceIndex: 0 })), null);
  assert.equal(validateMsg(msg(MSG.ANSWER, { questionIndex: 0, choiceIndex: '2' })), null);
});

test('validateMsg passes host→player message types through', () => {
  for (const type of [MSG.WELCOME, MSG.LOBBY, MSG.QUESTION, MSG.REVEAL, MSG.GAME_OVER, MSG.STATE]) {
    const m = validateMsg(msg(type, { any: 'payload' }));
    assert.equal(m.type, type);
  }
});
