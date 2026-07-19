import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ICE_SERVERS, buildPeerOptions } from '../../js/net/ice.js';

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
