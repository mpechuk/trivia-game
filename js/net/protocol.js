// Wire protocol between host and players (PeerJS data channels).
// Every message is a JSON object {v, type, ...}. Unknown versions/types are
// dropped. The host's clock is authoritative for all timing.
import { sanitizeAvatar } from '../avatars.js';

export const PROTOCOL_VERSION = 1;
export const ROOM_PREFIX = 'cc-trivia-';

export const MSG = {
  // player → host
  JOIN: 'join',
  ANSWER: 'answer',
  // host → player
  WELCOME: 'welcome',
  REJECT: 'reject',
  LOBBY: 'lobby',
  QUESTION: 'question',
  ANSWER_ACK: 'answer_ack',
  REVEAL: 'reveal',
  GAME_OVER: 'game_over',
  STATE: 'state',
  HOST_CLOSED: 'host_closed',
};

// No I/O/0/1 — codes get read out loud and typed on phones.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(length = 5) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function normalizeRoomCode(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
}

export function msg(type, fields = {}) {
  return { v: PROTOCOL_VERSION, type, ...fields };
}

function cleanString(x, maxLen) {
  return typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, maxLen) : '';
}

/**
 * Validate + sanitize an inbound message (either direction).
 * Returns a safe object or null if the message must be dropped.
 */
export function validateMsg(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.v !== PROTOCOL_VERSION || typeof raw.type !== 'string') return null;

  switch (raw.type) {
    case MSG.JOIN: {
      const playerId = cleanString(raw.playerId, 64);
      if (!/^[\w-]{8,64}$/.test(playerId)) return null;
      return msg(MSG.JOIN, {
        playerId,
        name: cleanString(raw.name, 24) || 'Player',
        avatar: sanitizeAvatar(raw.avatar),
      });
    }
    case MSG.ANSWER: {
      if (!Number.isInteger(raw.questionIndex) || raw.questionIndex < 0) return null;
      if (!Number.isInteger(raw.choiceIndex) || raw.choiceIndex < 0 || raw.choiceIndex > 7) return null;
      return msg(MSG.ANSWER, { questionIndex: raw.questionIndex, choiceIndex: raw.choiceIndex });
    }
    // Host → player messages: shape-checked loosely; players only render them.
    case MSG.WELCOME:
    case MSG.REJECT:
    case MSG.LOBBY:
    case MSG.QUESTION:
    case MSG.ANSWER_ACK:
    case MSG.REVEAL:
    case MSG.GAME_OVER:
    case MSG.STATE:
    case MSG.HOST_CLOSED:
      return raw;
    default:
      return null;
  }
}
