// Shared UI widgets: timer ring, answer tiles, standings, race track,
// confetti, podium. Pure DOM — theme comes in via CSS variables and the
// theme.answer_buttons array.
import { renderAvatar } from '../avatars.js';
import { clamp, el } from '../util.js';

/**
 * Circular countdown. start(deadline, totalMs) animates from the deadline;
 * onTick(secondsLeft) fires once per second (for tick sounds).
 */
export function timerRing({ size = 92, onTick } = {}) {
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'timer-ring');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  const track = document.createElementNS(svgNS, 'circle');
  const bar = document.createElementNS(svgNS, 'circle');
  for (const [c, cls] of [[track, 'timer-track'], [bar, 'timer-bar']]) {
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', String(R));
    c.setAttribute('class', cls);
  }
  bar.style.strokeDasharray = String(CIRC);
  const text = document.createElementNS(svgNS, 'text');
  text.setAttribute('x', '50');
  text.setAttribute('y', '58');
  text.setAttribute('class', 'timer-text');
  svg.append(track, bar, text);

  let raf = null;
  let lastSec = null;

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    lastSec = null;
  }

  function showInfinity() {
    stop();
    bar.style.strokeDashoffset = '0';
    text.textContent = '∞';
    svg.classList.remove('urgent');
  }

  function start(deadline, totalMs) {
    stop();
    const frame = () => {
      const remaining = Math.max(0, deadline - Date.now());
      const frac = totalMs > 0 ? remaining / totalMs : 0;
      bar.style.strokeDashoffset = String(CIRC * (1 - frac));
      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        text.textContent = String(sec);
        svg.classList.toggle('urgent', sec <= 5 && sec > 0);
        if (remaining > 0) onTick?.(sec);
      }
      if (remaining > 0) raf = requestAnimationFrame(frame);
    };
    frame();
  }

  return { el: svg, start, stop, showInfinity };
}

/** One answer tile (host board and solo tap targets). */
export function answerTile(index, label, buttonTheme, { onclick, small = false } = {}) {
  const t = buttonTheme[index % buttonTheme.length];
  const tile = el(
    onclick ? 'button' : 'div',
    { class: `answer-tile ${small ? 'small' : ''}`, type: onclick ? 'button' : null, onclick },
    el('span', { class: 'tile-shape' }, t.shape),
    el('span', { class: 'tile-label' }, label)
  );
  tile.style.setProperty('--tile-color', t.color);
  return tile;
}

/** Ranked standings list. highlightId marks "you" on player screens. */
export function standingsList(standings, { limit = 0, highlightId = null, showDelta = true } = {}) {
  const rows = limit ? standings.slice(0, limit) : standings;
  return el(
    'ol',
    { class: 'standings' },
    rows.map((p) =>
      el(
        'li',
        {
          class:
            `standing-row${p.connected === false ? ' disconnected' : ''}` +
            `${p.id === highlightId ? ' me' : ''}`,
        },
        el('span', { class: 'standing-rank' }, `${p.rank}`),
        renderAvatar(p.avatar, 32, p.name),
        el('span', { class: 'standing-name' }, p.name),
        showDelta && p.delta
          ? el('span', { class: `standing-delta ${p.delta > 0 ? 'up' : 'down'}` },
              `${p.delta > 0 ? '+' : ''}${p.delta}`)
          : null,
        el('span', { class: 'standing-score' }, String(p.score))
      )
    )
  );
}

/**
 * The virtual "run": one lane per player, avatars advance toward the finish
 * flag proportionally to score. update() animates from the previous position
 * (including moving backwards after a penalty).
 */
export function raceTrack() {
  const lanesEl = el('div', { class: 'race-lanes' });
  const root = el('div', { class: 'race-track' },
    el('div', { class: 'race-finish' }, '🏁'),
    lanesEl
  );
  const lanes = new Map(); // playerId -> {lane, runner, pos}

  function ensureLane(p) {
    if (lanes.has(p.id)) return lanes.get(p.id);
    const runner = el('div', { class: 'race-runner' },
      renderAvatar(p.avatar, 44, p.name),
      el('span', { class: 'race-name' }, p.name)
    );
    const lane = el('div', { class: 'race-lane' }, runner);
    lanesEl.append(lane);
    const entry = { lane, runner, pos: 0 };
    lanes.set(p.id, entry);
    return entry;
  }

  /**
   * @param standings engine standings
   * @param maxPossible max cumulative score so far (normalizes positions)
   * @param animate    when true, transition from previous positions
   * @returns number of runners that moved (for the whoosh sound)
   */
  function update(standings, maxPossible, animate = true) {
    let moved = 0;
    const leaderScore = standings.length ? standings[0].score : 0;
    for (const p of standings) {
      const entry = ensureLane(p);
      const frac = maxPossible > 0 ? clamp(p.score / maxPossible, 0, 1) : 0;
      const pct = frac * 100;
      const apply = () => {
        entry.runner.style.setProperty('--race-pos', `${pct}`);
        entry.runner.classList.toggle('leader', p.score === leaderScore && p.score > 0);
        entry.runner.classList.toggle('disconnected', p.connected === false);
      };
      if (Math.abs(pct - entry.pos) > 0.5) {
        moved++;
        entry.runner.classList.remove('bounce', 'stumble');
        if (animate) {
          // restart the keyframe animation
          void entry.runner.offsetWidth;
          entry.runner.classList.add(pct > entry.pos ? 'bounce' : 'stumble');
        }
      }
      entry.pos = pct;
      apply();
    }
    return moved;
  }

  return { el: root, update };
}

/** Lightweight DOM confetti. Returns a cleanup function. */
export function confettiBurst(container, { count = 120, durationMs = 4200 } = {}) {
  const colors = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#8e24aa', '#2dd4bf', '#facc15'];
  const layer = el('div', { class: 'confetti-layer', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    const piece = el('span', { class: 'confetti' });
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 1.2}s`;
    piece.style.animationDuration = `${2.2 + Math.random() * 2}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 240}px`);
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.append(piece);
  }
  container.append(layer);
  const timer = setTimeout(() => layer.remove(), durationMs + 1600);
  return () => {
    clearTimeout(timer);
    layer.remove();
  };
}

/** Winners' podium: pedestals rise 3rd → 2nd → 1st. */
export function podium(standings) {
  const top = standings.slice(0, 3);
  const order = [1, 0, 2]; // visual order: 2nd, 1st, 3rd
  const medals = ['🥇', '🥈', '🥉'];
  const root = el('div', { class: 'podium' });
  order.forEach((rankIdx) => {
    const p = top[rankIdx];
    if (!p) return;
    const step = el(
      'div',
      { class: `podium-step place-${rankIdx + 1}` },
      el('div', { class: 'podium-player' },
        renderAvatar(p.avatar, 64, p.name),
        el('div', { class: 'podium-name' }, p.name),
        el('div', { class: 'podium-score' }, String(p.score))
      ),
      el('div', { class: 'podium-block' }, medals[rankIdx])
    );
    step.style.animationDelay = `${(2 - rankIdx) * 0.55}s`;
    root.append(step);
  });
  return root;
}

/** Simple modal-ish notice with optional action button. */
export function overlay(text, { actionLabel, onAction } = {}) {
  return el('div', { class: 'overlay' },
    el('div', { class: 'overlay-box' },
      el('p', {}, text),
      actionLabel ? el('button', { class: 'btn btn-primary', type: 'button', onclick: onAction }, actionLabel) : null
    )
  );
}
