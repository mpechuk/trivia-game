// Player side of the PeerJS network. Dials the host's room peer, sends the
// join, dispatches host messages as events, and auto-reconnects with backoff.
import { createEmitter } from '../util.js';
import { instrumentConnection, instrumentPeer, netlog } from './debug.js';
import { buildPeerOptions } from './ice.js';
import { MSG, ROOM_PREFIX, msg, validateMsg } from './protocol.js';

const BACKOFF_MS = [1000, 2000, 4000, 8000, 8000];

export class PlayerNetwork {
  /** profile: {playerId, name, avatar} */
  constructor({ roomCode, profile, peerConfig }) {
    this.roomCode = roomCode;
    this.profile = profile;
    this.peerConfig = buildPeerOptions(peerConfig);
    this.events = createEmitter();
    this.closed = false;
    this.attempt = 0;
    this._welcomed = false;
  }

  on(event, fn) {
    return this.events.on(event, fn);
  }

  connect() {
    if (this.closed) return;
    if (this.peer && !this.peer.destroyed) this.peer.destroy();
    netlog('player', `connecting to broker ${this.peerConfig.host || 'peerjs cloud'}…`);
    const peer = new Peer(this.peerConfig);
    this.peer = peer;
    instrumentPeer(peer, 'player');
    peer.on('open', () => this._dial());
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        // Room code doesn't exist (or host gone). Don't burn retries on it.
        this.events.emit('not_found', {});
        this._scheduleRetry();
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        this._scheduleRetry();
      } else {
        this.events.emit('fatal', { reason: err.type || 'error' });
      }
    });
    peer.on('disconnected', () => {
      if (!this.closed && !peer.destroyed) peer.reconnect();
    });
  }

  _dial() {
    // Retire the previous connection first. Its close event must NOT trigger
    // a retry — after a phone unlock the host closes superseded connections,
    // and reacting to those closes creates an endless reconnect/flicker loop.
    const old = this.conn;
    if (old) {
      this.conn = null;
      try { old.close(); } catch { /* already gone */ }
    }
    netlog('player', `dialing room ${this.roomCode}`);
    const conn = this.peer.connect(ROOM_PREFIX + this.roomCode, { reliable: true });
    this.conn = conn;
    instrumentConnection(conn, 'player');
    conn.on('open', () => {
      this.attempt = 0;
      conn.send(msg(MSG.JOIN, this.profile));
    });
    conn.on('data', (raw) => {
      const m = validateMsg(raw);
      if (!m) return;
      if (m.type === MSG.WELCOME) {
        this._welcomed = true;
        // An answer tapped while the transport was dying never reached the
        // host — replay it (the host ignores duplicates and stale rounds).
        if (this.pendingAnswer) conn.send(msg(MSG.ANSWER, this.pendingAnswer));
      }
      if (m.type === MSG.QUESTION || m.type === MSG.ANSWER_ACK) this.pendingAnswer = null;
      // The resync STATE can arrive while the UI is still navigating between
      // screens (no listener mounted yet) — keep it for late subscribers.
      if (m.type === MSG.STATE) this.lastState = m;
      this.events.emit(m.type, m);
    });
    conn.on('close', () => {
      if (this.conn === conn) this._scheduleRetry();
    });
    conn.on('error', () => {
      if (this.conn === conn) this._scheduleRetry();
    });
  }

  _scheduleRetry() {
    if (this.closed || this._retryTimer) return;
    if (this.attempt >= BACKOFF_MS.length) {
      netlog('player', 'gave up after all retries');
      this.events.emit('lost', {});
      return;
    }
    const wait = BACKOFF_MS[this.attempt++];
    netlog('player', `retry ${this.attempt}/${BACKOFF_MS.length} in ${wait}ms`);
    this.events.emit('reconnecting', { attempt: this.attempt, waitMs: wait });
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (this.closed) return;
      if (!this.peer || this.peer.destroyed) this.connect();
      else if (this.peer.disconnected) this.peer.reconnect();
      else this._dial();
    }, wait);
  }

  /** Manual "Rejoin" after retries ran out. */
  retryNow() {
    this.attempt = 0;
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    this.connect();
  }

  answer(questionIndex, choiceIndex) {
    // Remember the answer until it is acked (or the round moves on) so a
    // reconnect can replay it if the send raced a dying connection.
    this.pendingAnswer = { questionIndex, choiceIndex };
    if (this.conn?.open) this.conn.send(msg(MSG.ANSWER, { questionIndex, choiceIndex }));
  }

  leave() {
    this.closed = true;
    if (this._retryTimer) clearTimeout(this._retryTimer);
    try { this.conn?.close(); } catch { /* already gone */ }
    this.peer?.destroy();
    this.events.clear();
  }
}

/** Stable per-browser-tab player identity (survives reloads of the tab). */
export function getPlayerId() {
  let id = sessionStorage.getItem('trivia_player_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('trivia_player_id', id);
  }
  return id;
}

export function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem('trivia_profile')) || {};
  } catch {
    return {};
  }
}

export function saveProfile(name, avatar) {
  localStorage.setItem('trivia_profile', JSON.stringify({ name, avatar }));
}
