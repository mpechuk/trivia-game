// Host side of the PeerJS network: owns the room peer and the per-player
// connections. Screens assign the onJoin/onAnswer/onDisconnect callbacks;
// higher-level game logic lives in the screens, not here.
import { instrumentConnection, instrumentPeer, netlog } from './debug.js';
import { buildPeerOptions } from './ice.js';
import { MSG, ROOM_PREFIX, makeRoomCode, msg, validateMsg } from './protocol.js';

export class HostNetwork {
  constructor({ roomCode, peerConfig }) {
    this.roomCode = roomCode;
    this.peerConfig = buildPeerOptions(peerConfig);
    this.connections = new Map(); // playerId -> DataConnection
    this.onJoin = null; // ({playerId, name, avatar, conn}) => void
    this.onAnswer = null; // ({playerId, questionIndex, choiceIndex}) => void
    this.onDisconnect = null; // (playerId) => void
    this.destroyed = false;
  }

  /** Resolves once the room is registered with the broker. */
  open() {
    return new Promise((resolve, reject) => {
      netlog('host', `creating room ${this.roomCode} on broker ${this.peerConfig.host || 'peerjs cloud'}…`);
      const peer = new Peer(ROOM_PREFIX + this.roomCode, this.peerConfig);
      this.peer = peer;
      instrumentPeer(peer, 'host');
      // A stalled broker websocket emits nothing — fail instead of hanging.
      const timer = setTimeout(() => {
        netlog('host', 'broker connection stalled — giving up');
        onError(Object.assign(new Error('Timed out reaching the PeerJS broker'), { type: 'broker-timeout' }));
      }, 15000);
      const onOpen = () => {
        cleanup();
        peer.on('error', (err) => this._runtimeError(err));
        resolve(this);
      };
      const onError = (err) => {
        cleanup();
        peer.destroy();
        reject(err);
      };
      const cleanup = () => {
        clearTimeout(timer);
        peer.off('open', onOpen);
        peer.off('error', onError);
      };
      peer.on('open', onOpen);
      peer.on('error', onError);
      peer.on('connection', (conn) => this._wire(conn));
      peer.on('disconnected', () => {
        // Lost the broker (not the players). Reconnect so new joins still work.
        if (!this.destroyed && !peer.destroyed) peer.reconnect();
      });
    });
  }

  _runtimeError(err) {
    // Per-connection errors are handled on the connections themselves.
    console.warn('host peer error:', err.type || err);
  }

  _wire(conn) {
    instrumentConnection(conn, 'host');
    conn.on('data', (raw) => {
      const m = validateMsg(raw);
      if (!m) return;
      if (m.type === MSG.JOIN) {
        this.onJoin?.({ ...m, conn });
      } else if (m.type === MSG.ANSWER && conn._playerId) {
        this.onAnswer?.({
          playerId: conn._playerId,
          questionIndex: m.questionIndex,
          choiceIndex: m.choiceIndex,
        });
      }
    });
    const drop = () => {
      const pid = conn._playerId;
      if (pid && this.connections.get(pid) === conn) {
        this.connections.delete(pid);
        this.onDisconnect?.(pid);
      }
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  /** Bind an accepted join's connection to its playerId. */
  attach(playerId, conn) {
    const existing = this.connections.get(playerId);
    if (existing && existing !== conn) {
      existing._playerId = null;
      try { existing.close(); } catch { /* already gone */ }
    }
    conn._playerId = playerId;
    this.connections.set(playerId, conn);
  }

  reject(conn, reason) {
    try {
      conn.send(msg(MSG.REJECT, { reason }));
      setTimeout(() => conn.close(), 300);
    } catch { /* connection already gone */ }
  }

  sendTo(playerId, message) {
    const conn = this.connections.get(playerId);
    if (conn?.open) conn.send(message);
  }

  broadcast(message) {
    for (const conn of this.connections.values()) {
      if (conn.open) conn.send(message);
    }
  }

  destroy() {
    this.destroyed = true;
    try { this.broadcast(msg(MSG.HOST_CLOSED, {})); } catch { /* best effort */ }
    setTimeout(() => this.peer?.destroy(), 200);
    this.connections.clear();
  }
}

/**
 * Create a room, retrying with fresh codes if the ID is taken.
 * Throws the last PeerJS error if the broker is unreachable.
 */
export async function createRoom(peerConfig, attempts = 4) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    const net = new HostNetwork({ roomCode: makeRoomCode(), peerConfig });
    try {
      return await net.open();
    } catch (err) {
      lastErr = err;
      if (err?.type !== 'unavailable-id') break;
    }
  }
  throw lastErr || new Error('could not create room');
}
