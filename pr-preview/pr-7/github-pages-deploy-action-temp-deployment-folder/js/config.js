// Loads the game's JSON configuration file (content + theme + defaults) and
// applies the visual theme to the document via CSS custom properties.
import { deepMerge } from './util.js';

export const DEFAULT_THEME = {
  emoji: '🎯',
  logo_url: null,
  font_family: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
  colors: {
    background: '#0b1d3a',
    background_gradient: ['#0b1d3a', '#123c69'],
    surface: '#16294d',
    text: '#f5f7fb',
    text_muted: '#9fb0cc',
    primary: '#2dd4bf',
    accent: '#facc15',
    correct: '#22c55e',
    wrong: '#ef4444',
    timer: '#facc15',
  },
  answer_buttons: [
    { color: '#e21b3c', shape: '▲' },
    { color: '#1368ce', shape: '◆' },
    { color: '#d89e00', shape: '●' },
    { color: '#26890c', shape: '■' },
    { color: '#8e24aa', shape: '★' },
  ],
  background_image: null,
  sounds: {
    enabled: true,
    volume: 0.6,
    tick: null,
    tick_urgent: null,
    correct: null,
    wrong: null,
    reveal: null,
    advance: null,
    join: null,
    fanfare: null,
  },
};

export const DEFAULT_GAME = {
  question_count: 15,
  time_per_question_seconds: 30, // null = no time limit
  choices_per_question: 4, // 2..5
  difficulty_mix: 'balanced', // balanced | easy_ride | hardcore | custom
  categories: 'all',
  question_order: 'ramp', // ramp | shuffled
  scoring: {
    base_points: 100,
    max_speed_bonus: 100,
    difficulty_multiplier: [1, 1.25, 1.5, 1.75, 2],
    wrong_penalty_max: 50,
    min_score: 0,
  },
  network: { peer_config: null },
};

/**
 * Validate and normalize an already-parsed dataset object.
 * The dataset may be bare (title + questions); theme/game_defaults blocks are
 * optional and deep-merged over the built-in defaults. `source` only labels
 * error messages (a URL or a file name).
 */
export function normalizeConfig(dataset, source = 'pack') {
  if (!dataset || !Array.isArray(dataset.questions) || dataset.questions.length === 0) {
    throw new Error(`Config ${source} has no questions[]`);
  }
  const theme = deepMerge(DEFAULT_THEME, dataset.theme || {});
  const gameDefaults = deepMerge(DEFAULT_GAME, dataset.game_defaults || {});
  return { dataset, theme, gameDefaults };
}

/** Fetch a game config JSON from a URL and normalize it. */
export async function loadConfig(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load config ${url}: HTTP ${res.status}`);
  return normalizeConfig(await res.json(), url);
}

/**
 * Load the manifest of built-in packs (data/packs.json). Returns [] on any
 * failure so the home screen can still offer "upload your own pack".
 */
export async function loadPackManifest(url = 'data/packs.json') {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const packs = Array.isArray(data) ? data : data.packs;
    return Array.isArray(packs) ? packs.filter((p) => p && typeof p.file === 'string') : [];
  } catch (err) {
    console.warn('pack manifest unavailable:', err.message || err);
    return [];
  }
}

/** Write theme values into CSS variables + document chrome (title, favicon). */
export function applyTheme(theme, dataset) {
  const root = document.documentElement.style;
  const c = theme.colors;
  const grad = Array.isArray(c.background_gradient) && c.background_gradient.length >= 2
    ? c.background_gradient
    : [c.background, c.background];
  root.setProperty('--bg', c.background);
  root.setProperty('--bg-grad-a', grad[0]);
  root.setProperty('--bg-grad-b', grad[1]);
  root.setProperty('--surface', c.surface);
  root.setProperty('--text', c.text);
  root.setProperty('--text-muted', c.text_muted);
  root.setProperty('--primary', c.primary);
  root.setProperty('--accent', c.accent);
  root.setProperty('--correct', c.correct);
  root.setProperty('--wrong', c.wrong);
  root.setProperty('--timer', c.timer);
  root.setProperty('--font-family', theme.font_family);
  root.setProperty(
    '--bg-image',
    theme.background_image ? `url("${encodeURI(theme.background_image)}")` : 'none'
  );
  theme.answer_buttons.forEach((b, i) => root.setProperty(`--btn-${i}-color`, b.color));

  if (dataset?.title) document.title = dataset.title;
  setEmojiFavicon(theme.emoji);
}

/** Apply a colors patch received from a remote host (players mirror host theme). */
export function applyRemoteColors(colors) {
  if (!colors || typeof colors !== 'object') return;
  const safe = {};
  for (const [k, v] of Object.entries(colors)) {
    if (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)) safe[k] = v;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(x))) safe[k] = v;
  }
  applyTheme(deepMerge(DEFAULT_THEME, { colors: safe }), null);
}

function setEmojiFavicon(emoji) {
  if (!emoji) return;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<text y="0.9em" font-size="90">${emoji}</text></svg>`;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.append(link);
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
