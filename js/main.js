// Boot: load the JSON config (content + theme), apply the theme, register
// screens, and start the hash router.
import { createAudio } from './audio.js';
import { applyTheme, loadConfig } from './config.js';
import { createRouter } from './router.js';
import { el } from './util.js';
import { homeScreen } from './ui/screens/home.js';
import { hostSetupScreen } from './ui/screens/hostSetup.js';
import { hostGameScreen } from './ui/screens/hostGame.js';
import { joinScreen } from './ui/screens/join.js';
import { lobbyScreen } from './ui/screens/lobby.js';
import { playerGameScreen } from './ui/screens/playerGame.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const configUrl = params.get('config') || 'data/fifa_world_cup_2026_trivia.json';

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
  let config;
  try {
    config = await loadConfig(configUrl);
  } catch (err) {
    console.error(err);
    app.replaceChildren(
      el('div', { class: 'card home' },
        el('h1', {}, '😕 Could not load the game'),
        el('p', { class: 'muted' }, String(err.message || err)),
        el('p', { class: 'muted small' }, `Config file: ${configUrl}`)
      )
    );
    return;
  }

  const { dataset, theme, gameDefaults } = config;
  applyTheme(theme, dataset);
  const audio = createAudio(theme.sounds);
  const ctx = { dataset, theme, gameDefaults, audio, session: makeSession() };

  const router = createRouter(app, ctx);
  ctx.router = router;
  router.register('home', homeScreen);
  router.register('solo', hostSetupScreen(true));
  router.register('host', hostSetupScreen(false));
  router.register('lobby', lobbyScreen);
  router.register('game', hostGameScreen);
  router.register('join', joinScreen);
  router.register('play', playerGameScreen);
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
