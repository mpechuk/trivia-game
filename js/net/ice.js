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
