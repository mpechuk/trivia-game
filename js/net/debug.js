// Network diagnostics. The broker/ICE/connection lifecycle is always
// recorded into an in-memory ring buffer; showing it costs a tap, not a
// page reload. The on-screen panel + console output turn on via ?debug=1
// (the lobby join link/QR carries the query string, so players' phones
// inherit it), localStorage.trivia_debug = '1', or at runtime through
// showNetLog() — the join screen offers that when connecting drags on.
// "Cannot connect" failures happen on phones, where there are no devtools.
import { el } from '../util.js';

// ---------- pure helpers (unit-tested) ----------

/** Parse the debug switch from a location.search string + stored flag. */
export function parseDebugFlag(search, stored) {
  if (stored === '1' || stored === 'true') return true;
  const m = /[?&]debug(?:=([^&]*))?/.exec(search || '');
  if (!m) return false;
  return !['0', 'false'].includes(m[1] ?? '1');
}

/** Extract the ICE candidate type (host | srflx | prflx | relay) from an SDP line. */
export function candidateType(candidate) {
  const m = / typ ([a-z]+)/.exec(candidate || '');
  return m ? m[1] : 'unknown';
}

/** Render {host: 2, srflx: 1} as "host×2 srflx×1". */
export function summarizeTypes(counts) {
  const parts = Object.entries(counts).map(([t, n]) => `${t}×${n}`);
  return parts.length ? parts.join(' ') : 'none';
}

/** Human hint for why ICE failed, given the local candidate type counts. */
export function iceFailureHint(counts) {
  if (!counts.srflx && !counts.relay) {
    return 'no STUN candidates — this network seems to block UDP entirely; a TURN server on tcp/443 is required (see README → Connectivity)';
  }
  if (!counts.relay) {
    return 'STUN worked but no relay available — this NAT combination (e.g. cellular carrier-grade NAT) needs a TURN server (see README → Connectivity)';
  }
  return 'relay candidates existed but the connection still failed — check the TURN credentials/host in peer_config';
}

// ---------- logging ----------

let enabled = null;

export function netDebugEnabled() {
  if (enabled === null) {
    let stored = null;
    try { stored = localStorage.getItem('trivia_debug'); } catch { /* storage blocked */ }
    enabled = parseDebugFlag(globalThis.location?.search, stored);
  }
  return enabled;
}

/** Turn the panel on at runtime and replay everything recorded so far. */
export function showNetLog() {
  if (netDebugEnabled()) return;
  enabled = true;
  for (const line of buffer) {
    try { panelLine(line); } catch { /* diagnostics must never break the game */ }
  }
}

const buffer = [];
let panel = null;

function panelLine(text) {
  if (!document.body) return;
  if (!panel || !panel.isConnected) {
    panel = el('div', { class: 'net-debug', id: 'net-debug' });
    document.body.append(panel);
  }
  panel.append(el('div', { class: 'net-debug-line' }, text));
  while (panel.children.length > 250) panel.firstChild.remove();
  panel.scrollTop = panel.scrollHeight;
}

/** Record one diagnostic line; echo to console/panel when debug is on. */
export function netlog(tag, ...parts) {
  const line = `${(performance.now() / 1000).toFixed(1)}s [${tag}] ${parts.join(' ')}`;
  buffer.push(line);
  if (buffer.length > 300) buffer.shift();
  if (!netDebugEnabled()) return;
  console.info(line);
  try { panelLine(line); } catch { /* diagnostics must never break the game */ }
}

// ---------- instrumentation ----------

/** Record the peer's broker lifecycle (registration, drops, errors). */
export function instrumentPeer(peer, tag) {
  peer.on('open', (id) => netlog(tag, `broker connected, registered as ${id}`));
  peer.on('disconnected', () => netlog(tag, 'broker connection lost'));
  peer.on('close', () => netlog(tag, 'peer destroyed'));
  peer.on('error', (err) => netlog(tag, `peer error: ${err.type || err.message || err}`));
}

/** Record a DataConnection's open/close plus the underlying WebRTC/ICE progress. */
export function instrumentConnection(conn, tag) {
  const counts = {};
  netlog(tag, `negotiating with ${conn.peer}`);
  conn.on('open', () => netlog(tag, 'data channel open'));
  conn.on('close', () => netlog(tag, 'data channel closed'));
  conn.on('error', (err) => netlog(tag, `connection error: ${err.type || err.message || err}`));
  // Outgoing connections have their RTCPeerConnection immediately; incoming
  // ones (host side) get it once the offer is processed — poll briefly.
  if (conn.peerConnection) {
    watchPeerConnection(conn.peerConnection, tag, counts);
    return;
  }
  let tries = 0;
  const poll = setInterval(() => {
    const pc = conn.peerConnection;
    if (pc) {
      clearInterval(poll);
      watchPeerConnection(pc, tag, counts);
    } else if (++tries > 50) {
      clearInterval(poll);
      netlog(tag, 'no RTCPeerConnection appeared within 5s — negotiation never started');
    }
  }, 100);
}

function watchPeerConnection(pc, tag, counts) {
  // Snapshot first: on fast networks ICE may already be past the events
  // we're subscribing to below.
  netlog(tag, `ice state: ${pc.iceConnectionState} (gathering: ${pc.iceGatheringState})`);
  if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
    logSelectedPair(pc, tag);
  }
  logExistingCandidates(pc, tag);
  pc.addEventListener('icecandidate', (e) => {
    if (!e.candidate || !e.candidate.candidate) {
      netlog(tag, `ice gathering finished: ${summarizeTypes(counts)}`);
      return;
    }
    const t = candidateType(e.candidate.candidate);
    counts[t] = (counts[t] || 0) + 1;
    netlog(tag, `local candidate: ${t} ${e.candidate.protocol || ''}`.trim());
  });
  pc.addEventListener('icecandidateerror', (e) => {
    netlog(tag, `ice server error ${e.errorCode} from ${e.url || '?'}: ${e.errorText || ''}`.trim());
  });
  pc.addEventListener('iceconnectionstatechange', () => {
    netlog(tag, `ice state: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === 'failed') netlog(tag, `hint: ${iceFailureHint(counts)}`);
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      logSelectedPair(pc, tag);
    }
  });
  pc.addEventListener('connectionstatechange', () => {
    netlog(tag, `connection state: ${pc.connectionState}`);
  });
}

/** Report local candidates gathered before instrumentation attached. */
async function logExistingCandidates(pc, tag) {
  try {
    const seen = {};
    const stats = await pc.getStats();
    stats.forEach((s) => {
      if (s.type === 'local-candidate') seen[s.candidateType] = (seen[s.candidateType] || 0) + 1;
    });
    if (Object.keys(seen).length) {
      netlog(tag, `local candidates so far: ${summarizeTypes(seen)}`);
    }
  } catch { /* stats are best-effort */ }
}

/** Report which candidate pair actually carried the connection. */
async function logSelectedPair(pc, tag) {
  try {
    const stats = await pc.getStats();
    let pair = null;
    stats.forEach((s) => {
      if (s.type === 'transport' && s.selectedCandidatePairId) {
        pair = stats.get(s.selectedCandidatePairId) || pair;
      }
      if (!pair && s.type === 'candidate-pair' && s.selected) pair = s; // Firefox
    });
    if (!pair) return;
    const local = stats.get(pair.localCandidateId);
    const remote = stats.get(pair.remoteCandidateId);
    const fmt = (c) => (c ? `${c.candidateType}/${c.protocol}` : '?');
    netlog(tag, `connected via: local ${fmt(local)} <-> remote ${fmt(remote)}`);
  } catch { /* stats are best-effort */ }
}
