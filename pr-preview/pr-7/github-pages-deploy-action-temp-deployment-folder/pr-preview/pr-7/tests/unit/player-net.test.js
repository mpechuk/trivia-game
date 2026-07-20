import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerNetwork } from '../../js/net/player.js';

// PeerJS is a browser global; substitute a minimal fake so the stall
// watchdogs can be driven deterministically. Events that PeerJS would
// normally fire are emitted (or withheld) by hand.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Enough of an RTCPeerConnection for debug instrumentation to attach quietly.
const fakePc = () => ({
  addEventListener() {},
  iceConnectionState: 'new',
  iceGatheringState: 'new',
  getStats: async () => new Map(),
});

class FakeEmitter {
  constructor() { this.handlers = new Map(); }
  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
  }
  emit(event, arg) {
    for (const fn of this.handlers.get(event) || []) fn(arg);
  }
}

class FakeConn extends FakeEmitter {
  constructor(peerId) {
    super();
    this.peer = peerId;
    this.open = false;
    this.sent = [];
    this.peerConnection = fakePc();
  }
  send(m) { this.sent.push(m); }
  close() { this.emit('close'); }
}

class FakePeer extends FakeEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.disconnected = false;
    FakePeer.instances.push(this);
  }
  connect(peerId) {
    this.lastConn = new FakeConn(peerId);
    return this.lastConn;
  }
  destroy() { this.destroyed = true; }
  reconnect() {}
}
FakePeer.instances = [];

globalThis.Peer = FakePeer;

const makeNet = () => new PlayerNetwork({
  roomCode: 'ABCDE',
  profile: { playerId: 'p1234567', name: 'Anna', avatar: { kind: 'emoji', value: '🙂' } },
  stallTimeoutMs: 30,
});

test('a silent broker connection times out and schedules a retry', async () => {
  const net = makeNet();
  const retries = [];
  net.on('reconnecting', (m) => retries.push(m));
  net.connect();
  const peer = FakePeer.instances.at(-1);
  // Broker never fires 'open' and never errors.
  await sleep(80);
  assert.equal(retries.length, 1);
  assert.equal(peer.destroyed, true);
  net.leave();
});

test('a silent negotiation (no answer/ICE ever completes) times out and retries', async () => {
  const net = makeNet();
  const retries = [];
  net.on('reconnecting', (m) => retries.push(m));
  net.connect();
  const peer = FakePeer.instances.at(-1);
  peer.emit('open', 'player-id');
  assert.ok(peer.lastConn, 'dial should have started');
  // The data connection never opens, closes, or errors.
  await sleep(80);
  assert.equal(retries.length, 1);
  assert.equal(net.conn, null);
  net.leave();
});

test('a healthy connect sends the join and trips no watchdog', async () => {
  const net = makeNet();
  const retries = [];
  net.on('reconnecting', (m) => retries.push(m));
  net.connect();
  const peer = FakePeer.instances.at(-1);
  peer.emit('open', 'player-id');
  peer.lastConn.open = true;
  peer.lastConn.emit('open');
  assert.equal(peer.lastConn.sent.length, 1);
  assert.equal(peer.lastConn.sent[0].type, 'join');
  await sleep(80);
  assert.equal(retries.length, 0);
  assert.equal(peer.destroyed, false);
  net.leave();
});
