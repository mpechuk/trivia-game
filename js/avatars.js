// Player avatars: an emoji (works offline) or a DiceBear-generated image
// (free HTTP API, https://www.dicebear.com — MIT code, free/CC0 styles).
// Only {kind, value} / {kind, style, seed} travels over the wire.
import { el } from './util.js';

export const EMOJI_CHOICES = [
  '⚽', '🏀', '🎾', '🏈', '🥅', '🏆', '🥇', '🎯',
  '🦊', '🐼', '🐸', '🐙', '🦁', '🐯', '🦄', '🐨',
  '🐧', '🦉', '🦈', '🐬', '🦜', '🐝', '🦋', '🐢',
  '🚀', '🛸', '🏎️', '🚁', '⛵', '🎸', '🎤', '🎮',
  '🍕', '🌮', '🍩', '🍉', '🍓', '🥑', '🌶️', '🧀',
  '😎', '🤩', '🤠', '🥷', '🧙', '🦸', '🧛', '🤖',
];

export const DICEBEAR_STYLES = ['adventurer', 'bottts', 'fun-emoji', 'pixel-art'];

export function dicebearUrl(style, seed, size = 96) {
  return (
    `https://api.dicebear.com/9.x/${encodeURIComponent(style)}/svg` +
    `?seed=${encodeURIComponent(seed)}&size=${size}`
  );
}

export function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

export function randomEmojiAvatar() {
  return { kind: 'emoji', value: EMOJI_CHOICES[Math.floor(Math.random() * EMOJI_CHOICES.length)] };
}

// The default avatar: a freshly-shuffled DiceBear "adventurer" character.
export function randomAdventurerAvatar() {
  return { kind: 'dicebear', style: 'adventurer', seed: randomSeed() };
}

const NAME_ADJECTIVES = [
  'Brave', 'Swift', 'Clever', 'Mighty', 'Sneaky', 'Cosmic', 'Turbo', 'Wild',
  'Lucky', 'Fuzzy', 'Sunny', 'Zesty', 'Rowdy', 'Nimble', 'Dizzy', 'Jolly',
];
const NAME_NOUNS = [
  'Otter', 'Falcon', 'Panda', 'Ninja', 'Wizard', 'Comet', 'Tiger', 'Yeti',
  'Koala', 'Dragon', 'Penguin', 'Fox', 'Llama', 'Narwhal', 'Raccoon', 'Badger',
];

/** A fun random display name, e.g. "SwiftOtter42" (fits the 24-char cap). */
export function randomName() {
  const adj = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${adj}${noun}${num}`;
}

/** Sanitize an avatar object arriving from the network. */
export function sanitizeAvatar(avatar) {
  if (avatar && avatar.kind === 'emoji' && typeof avatar.value === 'string' && avatar.value.trim()) {
    return { kind: 'emoji', value: [...avatar.value.trim()].slice(0, 3).join('').slice(0, 12) };
  }
  if (
    avatar &&
    avatar.kind === 'dicebear' &&
    typeof avatar.style === 'string' &&
    /^[a-z0-9-]{1,32}$/.test(avatar.style) &&
    typeof avatar.seed === 'string' &&
    /^[\w-]{1,32}$/.test(avatar.seed)
  ) {
    return { kind: 'dicebear', style: avatar.style, seed: avatar.seed };
  }
  return { kind: 'emoji', value: '🙂' };
}

/** Render an avatar as a DOM node with a graceful offline fallback. */
export function renderAvatar(avatar, px = 40, name = '') {
  const a = sanitizeAvatar(avatar);
  if (a.kind === 'dicebear') {
    const img = el('img', {
      class: 'avatar avatar-img',
      src: dicebearUrl(a.style, a.seed, Math.max(48, px * 2)),
      alt: name || 'avatar',
      width: px,
      height: px,
      loading: 'lazy',
    });
    img.addEventListener('error', () => {
      img.replaceWith(initialCircle(name, px));
    });
    return img;
  }
  const span = el('span', { class: 'avatar avatar-emoji', role: 'img', 'aria-label': name || 'avatar' }, a.value);
  span.style.fontSize = `${Math.round(px * 0.82)}px`;
  span.style.width = span.style.height = `${px}px`;
  return span;
}

function initialCircle(name, px) {
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const hue = [...(name || '?')].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) % 360, 7);
  const span = el('span', { class: 'avatar avatar-initial' }, letter);
  span.style.width = span.style.height = `${px}px`;
  span.style.fontSize = `${Math.round(px * 0.5)}px`;
  span.style.background = `hsl(${hue} 60% 45%)`;
  return span;
}

/**
 * Avatar picker widget (emoji grid + DiceBear tab).
 * Returns {el, getAvatar}. Small enough to embed in solo setup and join.
 */
export function avatarPicker(initial) {
  let avatar = sanitizeAvatar(initial || randomAdventurerAvatar());
  let dicebear = avatar.kind === 'dicebear'
    ? { style: avatar.style, seed: avatar.seed }
    : { style: DICEBEAR_STYLES[0], seed: randomSeed() };

  const preview = el('div', { class: 'avatar-preview' });
  const tabs = el('div', { class: 'tabs' });
  const body = el('div', { class: 'avatar-picker-body' });
  const root = el('div', { class: 'avatar-picker' }, preview, tabs, body);
  let active = avatar.kind === 'dicebear' ? 'dicebear' : 'emoji';

  function refreshPreview() {
    preview.replaceChildren(renderAvatar(avatar, 72));
  }

  function renderTabs() {
    tabs.replaceChildren(
      el('button', {
        type: 'button',
        class: `tab ${active === 'emoji' ? 'active' : ''}`,
        onclick: () => { active = 'emoji'; renderTabs(); renderBody(); },
      }, 'Emoji'),
      el('button', {
        type: 'button',
        class: `tab ${active === 'dicebear' ? 'active' : ''}`,
        onclick: () => { active = 'dicebear'; renderTabs(); renderBody(); },
      }, 'Generated')
    );
  }

  function renderBody() {
    if (active === 'emoji') {
      const grid = el('div', { class: 'emoji-grid' },
        EMOJI_CHOICES.map((e) =>
          el('button', {
            type: 'button',
            class: `emoji-cell ${avatar.kind === 'emoji' && avatar.value === e ? 'selected' : ''}`,
            onclick: () => { avatar = { kind: 'emoji', value: e }; refreshPreview(); renderBody(); },
          }, e)
        )
      );
      const custom = el('input', {
        class: 'input emoji-custom',
        type: 'text',
        maxlength: '4',
        placeholder: 'or type any emoji…',
        oninput: (ev) => {
          const v = ev.target.value.trim();
          if (v) { avatar = sanitizeAvatar({ kind: 'emoji', value: v }); refreshPreview(); }
        },
      });
      body.replaceChildren(grid, custom);
    } else {
      const styleRow = el('div', { class: 'chip-row' },
        DICEBEAR_STYLES.map((s) =>
          el('button', {
            type: 'button',
            class: `chip ${dicebear.style === s ? 'active' : ''}`,
            onclick: () => { dicebear.style = s; apply(); },
          }, s)
        )
      );
      const shuffleBtn = el('button', {
        type: 'button',
        class: 'btn btn-small',
        onclick: () => { dicebear.seed = randomSeed(); apply(); },
      }, '🎲 Shuffle');
      const note = el('p', { class: 'muted small' }, 'Needs internet — generated by dicebear.com');
      function apply() {
        avatar = { kind: 'dicebear', style: dicebear.style, seed: dicebear.seed };
        refreshPreview();
        renderBody();
      }
      body.replaceChildren(styleRow, shuffleBtn, note);
      if (avatar.kind !== 'dicebear') apply();
    }
  }

  refreshPreview();
  renderTabs();
  renderBody();
  return { el: root, getAvatar: () => avatar };
}
