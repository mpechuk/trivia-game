import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateType,
  iceFailureHint,
  parseDebugFlag,
  summarizeTypes,
} from '../../js/net/debug.js';

test('parseDebugFlag reads the query string and the stored flag', () => {
  assert.equal(parseDebugFlag('?debug=1', null), true);
  assert.equal(parseDebugFlag('?debug', null), true);
  assert.equal(parseDebugFlag('?config=data/x.json&debug=1', null), true);
  assert.equal(parseDebugFlag('?debug=0', null), false);
  assert.equal(parseDebugFlag('?debug=false', null), false);
  assert.equal(parseDebugFlag('?config=data/x.json', null), false);
  assert.equal(parseDebugFlag('', null), false);
  assert.equal(parseDebugFlag(undefined, null), false);
  // localStorage flag wins regardless of the URL
  assert.equal(parseDebugFlag('', '1'), true);
  assert.equal(parseDebugFlag('', 'true'), true);
  assert.equal(parseDebugFlag('', '0'), false);
});

test('candidateType extracts the ICE candidate type', () => {
  assert.equal(
    candidateType('candidate:842163049 1 udp 1677729535 203.0.113.7 45623 typ srflx raddr 0.0.0.0'),
    'srflx'
  );
  assert.equal(candidateType('candidate:1 1 udp 2113937151 192.168.1.2 51321 typ host'), 'host');
  assert.equal(candidateType('candidate:2 1 udp 41885439 198.51.100.9 3478 typ relay raddr'), 'relay');
  assert.equal(candidateType('garbage'), 'unknown');
  assert.equal(candidateType(null), 'unknown');
});

test('summarizeTypes renders counts compactly', () => {
  assert.equal(summarizeTypes({ host: 2, srflx: 1 }), 'host×2 srflx×1');
  assert.equal(summarizeTypes({}), 'none');
});

test('iceFailureHint distinguishes the three failure shapes', () => {
  assert.match(iceFailureHint({ host: 1 }), /no STUN|block UDP/i);
  assert.match(iceFailureHint({ host: 1, srflx: 2 }), /TURN/);
  assert.match(iceFailureHint({ host: 1, srflx: 2, relay: 1 }), /credentials/i);
});
