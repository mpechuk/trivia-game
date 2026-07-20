// Default WebRTC ICE configuration for host/player peers.
//
// PeerJS's built-in default lists TURN relays that no longer exist: DNS for
// eu-0/us-0.turn.peerjs.com is gone and openrelay.metered.ca rejects every
// port/transport (verified empirically, July 2026 — zero relay candidates,
// only 701 lookup errors that slow ICE gathering down). There is no reliable
// free public TURN service to hardcode, so the defaults here are live STUN
// servers only; they cover NAT combinations where a direct (srflx) path
// exists.
//
// Connections that need a relay (typically cellular carrier-grade NAT)
// require real TURN credentials via
// `game_defaults.network.peer_config.config.iceServers` — see README →
// "Multiplayer connectivity". Configuring the host alone is enough: a relay
// candidate on either side is publicly reachable by the other. Anything a
// pack provides replaces this list untouched.
export const DEFAULT_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/** True when the ICE server list contains a relay (turn:/turns: URL). */
export function hasTurnServer(iceServers) {
  return (iceServers || []).some((s) =>
    (Array.isArray(s?.urls) ? s.urls : [s?.urls]).some(
      (u) => typeof u === 'string' && u.startsWith('turn')
    )
  );
}

/**
 * Merge additional ICE servers (e.g. TURN credentials from the git-ignored
 * data/turn.local.json) into a pack's `network.peer_config`. The extras are
 * appended after whatever the base config resolves to — pack-provided
 * iceServers, or DEFAULT_ICE_SERVERS — so packs that ship their own TURN
 * keep working with or without a local credentials file. Never mutates
 * the inputs.
 */
export function withExtraIceServers(peerConfig, extraServers) {
  if (!Array.isArray(extraServers) || extraServers.length === 0) {
    return peerConfig ? structuredClone(peerConfig) : undefined;
  }
  const options = peerConfig ? structuredClone(peerConfig) : {};
  const rtcConfig = options.config || {};
  const base = Array.isArray(rtcConfig.iceServers) && rtcConfig.iceServers.length
    ? rtcConfig.iceServers
    : structuredClone(DEFAULT_ICE_SERVERS);
  rtcConfig.iceServers = [...base, ...structuredClone(extraServers)];
  options.config = rtcConfig;
  return options;
}

/**
 * Build the PeerJS options object from a pack's `network.peer_config`.
 * Injects DEFAULT_ICE_SERVERS unless the config brings its own iceServers;
 * every other option (host, port, path, key, other `config` fields) passes
 * through unchanged. Never mutates the input.
 */
export function buildPeerOptions(peerConfig) {
  const options = peerConfig ? structuredClone(peerConfig) : {};
  const rtcConfig = options.config || {};
  if (!Array.isArray(rtcConfig.iceServers) || rtcConfig.iceServers.length === 0) {
    rtcConfig.iceServers = structuredClone(DEFAULT_ICE_SERVERS);
  }
  options.config = rtcConfig;
  return options;
}
