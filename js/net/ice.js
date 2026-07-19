// Default WebRTC ICE configuration for host/player peers.
//
// PeerJS's built-in default is one Google STUN server plus the community TURN
// relays on UDP/TCP 3478. That works when host and players share a network,
// but a phone on cellular data sits behind carrier-grade NAT that usually
// requires a TURN relay — and many carrier/guest networks only let TURN
// through on port 443 (ideally TLS). This default set keeps the easy STUN
// path, keeps the PeerJS relays, and adds relays reachable on 80/443 with a
// TLS+TCP fallback so cross-network joins can complete.
//
// Packs can replace the whole list via
// `game_defaults.network.peer_config.config.iceServers` (e.g. to use their
// own TURN credentials); anything they provide wins untouched.
export const DEFAULT_ICE_SERVERS = [
  // STUN: cheap reflexive candidates; resolves the friendly-NAT cases.
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // PeerJS community TURN (the library's own default relays), plus explicit
  // TCP fallback for networks that drop UDP.
  {
    urls: [
      'turn:eu-0.turn.peerjs.com:3478',
      'turn:us-0.turn.peerjs.com:3478',
      'turn:eu-0.turn.peerjs.com:3478?transport=tcp',
      'turn:us-0.turn.peerjs.com:3478?transport=tcp',
    ],
    username: 'peerjs',
    credential: 'peerjsp',
  },
  // Open Relay Project public TURN (intentionally public credentials, see
  // metered.ca/tools/openrelay) — reachable on 80/443 including TLS, which is
  // what cellular and locked-down guest networks typically need.
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
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
