// Boot: load the JSON config (content + theme), apply the theme, register
// screens, and start the hash router.
import { createAudio } from './audio.js';
import { DEFAULT_GAME, DEFAULT_THEME, applyTheme, loadConfig, loadTurnConfig } from './config.js';
import { createRouter } from './router.js';
import { createWakeLock } from './wakelock.js';
import { el } from './util.js';
import { homeScreen } from './ui/screens/home.js';
import { hostSetupScreen } from './ui/screens/hostSetup.js';
import { hostGameScreen } from './ui/screens/hostGame.js';
import { joinScreen } from './ui/screens/join.js';
import { lobbyScreen } from './ui/screens/lobby.js';
import { playerGameScreen } from './ui/screens/playerGame.js';
import { previewScreen } from './ui/screens/preview.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
// No pack is loaded by default — the player picks one (or uploads their own)
// on the home screen. A ?config= link still preloads a specific pack.
const configUrl = params.get('config');

function makeSession() {
  const session = {
    mode: null,
    solo: null,
    host: null,
    player: null,
    reset() {
      try { session.host?.engine?.destroy(); } catch { /* already dead */ }
      try { session.host?.net?.destroy(); } catch { /* already dead */ }
      try { session.solo?.engine?.destroy(); } catch { /* already dead */ }
      try { session.player?.net?.leave(); } catch { /* already dead */ }
      session.mode = null;
      session.solo = null;
      session.host = null;
      session.player = null;
    },
    active() {
      return !!(session.host?.net || session.player?.net);
    },
  };
  return session;
}

async function boot() {
  const audio = createAudio();
  const wakeLock = createWakeLock();
  // dataset stays null until a pack is chosen; theme/gameDefaults hold the
  // built-in defaults so the chooser screen is still themed.
  const ctx = {
    dataset: null,
    theme: DEFAULT_THEME,
    gameDefaults: DEFAULT_GAME,
    pack: null,
    // TURN relay credentials from the git-ignored data/turn.local.json;
    // [] means no relay (cross-network phones can't connect).
    turnServers: await loadTurnConfig(),
    audio,
    wakeLock,
    session: makeSession(),
  };

  // Make a loaded/normalized config the active pack: apply its theme + sounds
  // and record where it came from (for the home screen's "selected" indicator).
  ctx.setPack = (config, pack = {}) => {
    ctx.dataset = config.dataset;
    ctx.theme = config.theme;
    ctx.gameDefaults = config.gameDefaults;
    ctx.pack = {
      title: config.dataset.title || pack.name || 'Custom pack',
      ...pack,
    };
    applyTheme(config.theme, config.dataset);
    audio.reconfigure(config.theme.sounds);
  };

  applyTheme(DEFAULT_THEME, null);

  const router = createRouter(app, ctx);
  ctx.router = router;
  // Debug/testing handle (used by the e2e suite to simulate transport drops).
  window.__trivia = ctx;

  // A ?config=<url> deep link preloads that pack (backward compatible).
  if (configUrl) {
    try {
      ctx.setPack(await loadConfig(configUrl), { source: 'url', url: configUrl });
    } catch (err) {
      console.error(err);
    }
  }

  router.register('home', homeScreen);
  router.register('solo', hostSetupScreen(true));
  router.register('host', hostSetupScreen(false));
  router.register('lobby', lobbyScreen);
  router.register('game', hostGameScreen);
  router.register('join', joinScreen);
  router.register('play', playerGameScreen);
  router.register('preview', previewScreen);
  router.render();

  // Global mute toggle.
  const muteBtn = document.getElementById('mute-btn');
  const paintMute = () => {
    muteBtn.textContent = audio.muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sounds' : 'Mute sounds');
  };
  muteBtn.addEventListener('click', () => {
    audio.toggleMute();
    paintMute();
  });
  paintMute();

  // Leaving the page kills the WebRTC connections — warn mid-game.
  window.addEventListener('beforeunload', (e) => {
    if (ctx.session.active()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

boot();
