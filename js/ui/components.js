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

// A stick figure body (neck-down) drawn in SVG; the avatar rides on top as the
// head. Limb <g> groups pivot at the shoulders/hips so CSS can swing them.
const STICK_BODY_SVG = `
<svg class="stick-body" viewBox="0 0 40 46" aria-hidden="true" focusable="false">
  <line class="torso" x1="20" y1="2" x2="20" y2="26"/>
  <g class="limb arm arm-l"><line x1="20" y1="8" x2="10" y2="19"/></g>
  <g class="limb arm arm-r"><line x1="20" y1="8" x2="30" y2="19"/></g>
  <g class="limb leg leg-l"><line x1="20" y1="26" x2="12" y2="44"/></g>
  <g class="limb leg leg-r"><line x1="20" y1="26" x2="28" y2="44"/></g>
</svg>`;

function stickBodyNode() {
  const tpl = document.createElement('template');
  tpl.innerHTML = STICK_BODY_SVG.trim();
  return tpl.content.firstElementChild;
}

function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

// Below this per-round change (in normalized 0..100 units) a figure is treated
// as standing still rather than genuinely moving.
export const RACE_MOVE_EPS = 0.5;

/**
 * How a stick figure should react to a per-round position change: gaining
 * ground runs forward, losing ground stumbles back, no meaningful change idles
 * in place. Both inputs are normalized positions in 0..100. Pure — exported for
 * testing.
 */
export function raceMood(prevPct, newPct) {
  const delta = newPct - prevPct;
  if (delta > RACE_MOVE_EPS) return 'run';
  if (delta < -RACE_MOVE_EPS) return 'stumble';
  return 'idle';
}

/**
 * Normalize a score into a 0..100 track position. Returns 0 when nothing has
 * been scored yet (or scores are non-positive). Pure — exported for testing.
 */
export function racePosition(score, maxPossible) {
  const frac = maxPossible > 0 ? clamp(score / maxPossible, 0, 1) : 0;
  return frac * 100;
}

/**
 * A randomized per-figure "gait" so no two stick figures animate identically.
 * Every field feeds a CSS custom property on the figure. Pure (modulo the RNG)
 * — exported for testing.
 */
export function randomGait() {
  return {
    swing: rand(24, 42),
    dur: rand(0.84, 1.32),
    lean: rand(6, 13),
    bob: rand(2.5, 5),
    phase: -rand(0, 1),
    idleDur: rand(3.6, 6),
    stumbleDur: rand(1.6, 2.2),
  };
}

/**
 * The virtual "run": one lane per player. Each player is a little stick figure
 * wearing their avatar as a head, advancing toward the finish flag in
 * proportion to their score. update() drives three per-round moods:
 *   gained points  -> run forward (limbs pumping, leaning ahead)
 *   lost points    -> stumble backward
 *   no change      -> idle in place, shifting its weight while it waits.
 * Each figure gets slightly randomized timing/amplitude so no two move alike.
 */
export function raceTrack() {
  const lanesEl = el('div', { class: 'race-lanes' });
  const root = el('div', { class: 'race-track' },
    el('div', { class: 'race-finish' }, '🏁'),
    lanesEl
  );
  const lanes = new Map(); // playerId -> {lane, runner, stickman, pos, timer}

  function ensureLane(p) {
    if (lanes.has(p.id)) return lanes.get(p.id);
    const stickman = el('div', { class: 'stickman idle' },
      renderAvatar(p.avatar, 32, p.name),
      stickBodyNode()
    );
    // Per-figure variation, set once so each runner keeps its own gait.
    const gait = randomGait();
    stickman.style.setProperty('--swing', gait.swing.toFixed(1));
    stickman.style.setProperty('--dur', `${gait.dur.toFixed(2)}s`);
    stickman.style.setProperty('--lean', gait.lean.toFixed(1));
    stickman.style.setProperty('--bob', gait.bob.toFixed(1));
    stickman.style.setProperty('--phase', `${gait.phase.toFixed(2)}s`);
    stickman.style.setProperty('--idle-dur', `${gait.idleDur.toFixed(2)}s`);
    stickman.style.setProperty('--stumble-dur', `${gait.stumbleDur.toFixed(2)}s`);
    const runner = el('div', { class: 'race-runner' },
      stickman,
      el('span', { class: 'race-name' }, p.name)
    );
    const lane = el('div', { class: 'race-lane' }, runner);
    lanesEl.append(lane);
    const entry = { lane, runner, stickman, pos: 0, timer: 0 };
    lanes.set(p.id, entry);
    return entry;
  }

  // Set the figure's mood. 'run'/'stumble' are transient bursts that settle
  // back to 'idle'; 'idle' just parks it. Restarting the class re-triggers the
  // keyframes so repeated moves in the same direction replay the animation.
  function setMood(entry, mood, durMs = 2300) {
    clearTimeout(entry.timer);
    entry.stickman.classList.remove('idle', 'run', 'stumble');
    // force a reflow so the keyframe animation restarts from the top
    void entry.stickman.offsetWidth;
    entry.stickman.classList.add(mood);
    if (mood !== 'idle') {
      entry.timer = setTimeout(() => {
        entry.stickman.classList.remove('run', 'stumble');
        entry.stickman.classList.add('idle');
      }, durMs);
    }
  }

  /**
   * Called twice per round by the host screen: first with animate=false to
   * paint the previous positions, then with animate=true to glide to the new
   * ones. We only commit the baseline (and pick a mood) on the animated pass,
   * so the run/stumble/idle decision reflects the real per-round movement.
   *
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
      const pct = racePosition(p.score, maxPossible);
      entry.runner.classList.toggle('leader', p.score === leaderScore && p.score > 0);
      entry.runner.classList.toggle('disconnected', p.connected === false);
      if (!animate) {
        // Prime pass: hold the previous position so the next pass can glide.
        entry.runner.style.setProperty('--race-pos', `${entry.pos}`);
        continue;
      }
      const mood = raceMood(entry.pos, pct);
      entry.runner.style.setProperty('--race-pos', `${pct}`);
      if (mood !== 'idle') moved++;
      setMood(entry, mood);
      entry.pos = pct;
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
