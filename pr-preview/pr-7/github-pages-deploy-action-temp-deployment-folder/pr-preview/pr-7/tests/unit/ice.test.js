import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ICE_SERVERS,
  buildPeerOptions,
  hasTurnServer,
  withExtraIceServers,
} from '../../js/net/ice.js';

const flatUrls = (servers) => servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));

test('default ICE set is multiple live STUN servers, no dead relays', () => {
  const urls = flatUrls(DEFAULT_ICE_SERVERS);
  assert.ok(urls.length >= 2);
  for (const u of urls) assert.match(u, /^stun:/);
  // These relay hosts no longer exist (dead DNS / closed ports); listing them
  // slows ICE gathering on every connection. Keep them out.
  for (const u of urls) {
    assert.ok(!u.includes('turn.peerjs.com'), `dead relay in defaults: ${u}`);
    assert.ok(!u.includes('openrelay.metered.ca'), `dead relay in defaults: ${u}`);
  }
});

test('buildPeerOptions injects default ICE servers when no config is given', () => {
  assert.deepEqual(buildPeerOptions(undefined).config.iceServers, DEFAULT_ICE_SERVERS);
  assert.deepEqual(buildPeerOptions(null).config.iceServers, DEFAULT_ICE_SERVERS);
});

test('buildPeerOptions preserves broker options and adds ICE servers', () => {
  const packConfig = { host: '127.0.0.1', port: 9100, path: '/', secure: false, key: 'peerjs' };
  const opts = buildPeerOptions(packConfig);
  assert.equal(opts.host, '127.0.0.1');
  assert.equal(opts.port, 9100);
  assert.equal(opts.path, '/');
  assert.equal(opts.secure, false);
  assert.equal(opts.key, 'peerjs');
  assert.deepEqual(opts.config.iceServers, DEFAULT_ICE_SERVERS);
});

test('buildPeerOptions keeps explicitly configured iceServers untouched', () => {
  const custom = [{ urls: 'turn:my.turn.example:443', username: 'u', credential: 'c' }];
  const opts = buildPeerOptions({ config: { iceServers: custom, iceTransportPolicy: 'relay' } });
  assert.deepEqual(opts.config.iceServers, custom);
  assert.equal(opts.config.iceTransportPolicy, 'relay');
});

test('buildPeerOptions treats an empty iceServers list as unset', () => {
  const opts = buildPeerOptions({ config: { iceServers: [] } });
  assert.deepEqual(opts.config.iceServers, DEFAULT_ICE_SERVERS);
});

test('buildPeerOptions does not mutate the pack config', () => {
  const packConfig = { host: 'example.com', config: {} };
  buildPeerOptions(packConfig);
  assert.deepEqual(packConfig, { host: 'example.com', config: {} });
});

const TURN = { urls: 'turn:relay.example:3478', username: 'u', credential: 'c' };

test('hasTurnServer detects relays in any urls shape', () => {
  assert.equal(hasTurnServer([TURN]), true);
  assert.equal(hasTurnServer([{ urls: ['stun:s.example', 'turns:r.example:443'] }]), true);
  assert.equal(hasTurnServer(DEFAULT_ICE_SERVERS), false);
  assert.equal(hasTurnServer([]), false);
  assert.equal(hasTurnServer(undefined), false);
});

test('withExtraIceServers appends TURN to the defaults when the pack has none', () => {
  const opts = withExtraIceServers(null, [TURN]);
  assert.deepEqual(opts.config.iceServers, [...DEFAULT_ICE_SERVERS, TURN]);
  // buildPeerOptions then keeps the merged list as-is.
  assert.deepEqual(buildPeerOptions(opts).config.iceServers, [...DEFAULT_ICE_SERVERS, TURN]);
});

test('withExtraIceServers appends to pack-provided iceServers, keeping broker options', () => {
  const pack = { host: '127.0.0.1', port: 9100, config: { iceServers: [{ urls: 'stun:mine.example' }] } };
  const opts = withExtraIceServers(pack, [TURN]);
  assert.equal(opts.host, '127.0.0.1');
  assert.equal(opts.port, 9100);
  assert.deepEqual(opts.config.iceServers, [{ urls: 'stun:mine.example' }, TURN]);
  assert.deepEqual(pack.config.iceServers, [{ urls: 'stun:mine.example' }]); // untouched
});

test('withExtraIceServers without extras passes the pack config through', () => {
  assert.equal(withExtraIceServers(null, []), undefined);
  assert.equal(withExtraIceServers(undefined, undefined), undefined);
  const pack = { config: { iceServers: [TURN] } };
  assert.deepEqual(withExtraIceServers(pack, []), pack); // pack TURN still works alone
});
