// Game setup screen, used for both "Host multiplayer" and "Play solo".
// All controls default to the config's game_defaults block.
import { avatarPicker, randomName } from '../../avatars.js';
import { createRoom } from '../../net/host.js';
import { buildPeerOptions, hasTurnServer, withExtraIceServers } from '../../net/ice.js';
import { loadProfile, saveProfile } from '../../net/player.js';
import { MIX_PRESETS, buildPlan, categoriesOf, difficultyTargets, filterPool, DIFFICULTY_LABELS } from '../../questions.js';
import { clamp, el } from '../../util.js';

const TIMER_CHOICES = [10, 15, 20, 30, 45, 60, 90, 0]; // 0 = no limit

export function hostSetupScreen(solo) {
  return {
    mount(container, ctx) {
      // Reached without a pack (e.g. a direct #/solo link) — send them home to pick one.
      if (!ctx.dataset) {
        ctx.router.go('home');
        return;
      }
      const { dataset, gameDefaults } = ctx;
      const questions = dataset.questions;
      const catCounts = categoriesOf(questions);
      const allCats = [...catCounts.keys()];

      // ---- state ----
      const state = {
        count: gameDefaults.question_count,
        timeLimit: gameDefaults.time_per_question_seconds ?? 0,
        choicesN: gameDefaults.choices_per_question,
        preset: MIX_PRESETS[gameDefaults.difficulty_mix] ? gameDefaults.difficulty_mix : 'balanced',
        customWeights: [5, 5, 5, 5, 5],
        categories: new Set(
          gameDefaults.categories === 'all' ? allCats : gameDefaults.categories.filter((c) => catCounts.has(c))
        ),
        order: gameDefaults.question_order,
        scoring: { ...gameDefaults.scoring },
      };
      const profile = loadProfile();

      const weights = () => (state.preset === 'custom' ? state.customWeights : MIX_PRESETS[state.preset]);
      const pool = () => filterPool(questions, [...state.categories]);

      // ---- widgets that need cross-updates ----
      const countValue = el('span', { class: 'setup-value' });
      const countInput = el('input', {
        class: 'slider', type: 'range', min: '3', step: '1',
        oninput: () => { state.count = Number(countInput.value); refresh(); },
      });
      const mixPreview = el('p', { class: 'muted small mix-preview' });
      const poolInfo = el('span', { class: 'muted small' });

      function refresh() {
        const size = pool().length;
        countInput.max = String(Math.max(3, size));
        state.count = clamp(state.count, 3, Math.max(3, size));
        countInput.value = String(state.count);
        countValue.textContent = `${state.count} questions`;
        poolInfo.textContent = `${size} available`;
        const t = difficultyTargets(state.count, weights());
        mixPreview.textContent = t.map((n, i) => `${DIFFICULTY_LABELS[i]}: ${n}`).join(' · ');
      }

      // difficulty preset chips + custom sliders
      const presetRow = el('div', { class: 'chip-row' });
      const customBox = el('div', { class: 'custom-mix' });
      function renderPresets() {
        presetRow.replaceChildren(
          ...[['balanced', 'Balanced'], ['easy_ride', 'Easy ride'], ['hardcore', 'Hardcore'], ['custom', 'Custom']]
            .map(([key, label]) =>
              el('button', {
                type: 'button',
                class: `chip ${state.preset === key ? 'active' : ''}`,
                onclick: () => { state.preset = key; renderPresets(); refresh(); },
              }, label)
            )
        );
        customBox.style.display = state.preset === 'custom' ? '' : 'none';
      }
      DIFFICULTY_LABELS.forEach((label, i) => {
        const s = el('input', {
          class: 'slider slider-small', type: 'range', min: '0', max: '10',
          value: String(state.customWeights[i]),
          oninput: () => { state.customWeights[i] = Number(s.value); refresh(); },
        });
        customBox.append(el('label', { class: 'custom-mix-row' }, el('span', {}, label), s));
      });

      // categories
      const catBox = el('div', { class: 'cat-grid' });
      for (const [cat, n] of catCounts) {
        const cb = el('input', {
          type: 'checkbox',
          onchange: () => {
            if (cb.checked) state.categories.add(cat);
            else if (state.categories.size > 1) state.categories.delete(cat);
            else cb.checked = true; // keep at least one
            refresh();
          },
        });
        cb.checked = state.categories.has(cat);
        catBox.append(el('label', { class: 'cat-item' }, cb, ` ${cat} `, el('span', { class: 'muted small' }, `(${n})`)));
      }

      const timerSelect = el('select', { class: 'input', onchange: () => { state.timeLimit = Number(timerSelect.value); } },
        TIMER_CHOICES.map((s) =>
          el('option', { value: String(s), selected: s === state.timeLimit ? '' : null },
            s === 0 ? 'No time limit' : `${s} seconds`)
        )
      );
      const choicesSelect = el('select', { class: 'input', onchange: () => { state.choicesN = Number(choicesSelect.value); } },
        [2, 3, 4, 5].map((n) =>
          el('option', { value: String(n), selected: n === state.choicesN ? '' : null }, `${n} choices`)
        )
      );
      const orderSelect = el('select', { class: 'input', onchange: () => { state.order = orderSelect.value; } },
        el('option', { value: 'ramp', selected: state.order === 'ramp' ? '' : null }, 'Easy → hard'),
        el('option', { value: 'shuffled', selected: state.order === 'shuffled' ? '' : null }, 'Shuffled')
      );

      const scoringInputs = ['base_points', 'max_speed_bonus', 'wrong_penalty_max'].map((key) => {
        const input = el('input', {
          class: 'input input-num', type: 'number', min: '0', max: '1000',
          value: String(state.scoring[key]),
          onchange: () => { state.scoring[key] = clamp(Number(input.value) || 0, 0, 1000); },
        });
        const labels = {
          base_points: 'Base points (correct)',
          max_speed_bonus: 'Max speed bonus',
          wrong_penalty_max: 'Max penalty (fast wrong answer)',
        };
        return el('label', { class: 'field' }, labels[key], input);
      });

      // solo identity
      let picker = null;
      const nameInput = el('input', {
        class: 'input', type: 'text', maxlength: '24', placeholder: 'Your name',
        value: profile.name || randomName(),
      });
      const soloIdentity = solo
        ? el('div', { class: 'setup-block' },
            el('h3', {}, 'You'),
            el('label', { class: 'field' }, 'Name', nameInput),
            (picker = avatarPicker(profile.avatar)).el
          )
        : null;

      const status = el('p', { class: 'status-line', role: 'status' });
      const startBtn = el('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: start },
        solo ? '▶ Start solo game' : '📺 Create room');

      // Pack peer_config + TURN credentials from data/turn.local.json. Without
      // a relay, players behind carrier-grade NAT (phones on cellular) cannot
      // reach the host — warn up front rather than fail mysteriously.
      const peerConfig = withExtraIceServers(gameDefaults.network?.peer_config, ctx.turnServers);
      const turnReady = hasTurnServer(buildPeerOptions(peerConfig).config.iceServers);
      const turnWarning = !solo && !turnReady
        ? el('p', { class: 'turn-warning' },
            '⚠️ No TURN relay configured — only players on the same network as this screen ' +
            'can connect. Phones on cellular data won\'t reach the game. ' +
            'See README → "Multiplayer connectivity" to add relay credentials.')
        : null;

      async function start() {
        const settings = { timeLimitSeconds: state.timeLimit === 0 ? null : state.timeLimit };
        const scoring = { ...gameDefaults.scoring, ...state.scoring };
        const plan = buildPlan(questions, {
          count: state.count,
          weights: weights(),
          categories: [...state.categories],
          order: state.order,
          choicesPerQuestion: state.choicesN,
        });
        if (!plan.length) {
          status.textContent = 'No questions match this setup.';
          return;
        }
        if (solo) {
          const name = nameInput.value.trim() || 'You';
          const avatar = picker.getAvatar();
          saveProfile(name, avatar);
          ctx.session.mode = 'solo';
          ctx.session.solo = { plan, settings, scoring, profile: { name, avatar } };
          ctx.router.go('game');
          return;
        }
        startBtn.disabled = true;
        status.textContent = 'Creating room…';
        try {
          const net = await createRoom(peerConfig);
          ctx.session.mode = 'host';
          ctx.session.host = {
            net,
            roomCode: net.roomCode,
            roster: new Map(),
            plan,
            settings,
            scoring,
            engine: null,
          };
          ctx.router.go('lobby');
        } catch (err) {
          console.error('createRoom failed', err);
          startBtn.disabled = false;
          status.textContent =
            'Could not reach the PeerJS server — check your connection and try again.';
        }
      }

      container.append(
        el('div', { class: 'setup card' },
          el('div', { class: 'screen-head' },
            el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => ctx.router.go('home') }, '‹ Back'),
            el('h2', {}, solo ? 'Solo game setup' : 'Host a game')
          ),
          soloIdentity,
          el('div', { class: 'setup-block' },
            el('h3', {}, 'Length ', poolInfo),
            el('div', { class: 'field-row' }, countInput, countValue)
          ),
          el('div', { class: 'setup-block' },
            el('h3', {}, 'Difficulty'),
            presetRow, customBox, mixPreview
          ),
          el('div', { class: 'setup-block' },
            el('h3', {}, 'Categories'),
            catBox
          ),
          el('div', { class: 'setup-block setup-grid' },
            el('label', { class: 'field' }, 'Time per question', timerSelect),
            el('label', { class: 'field' }, 'Answer choices', choicesSelect),
            el('label', { class: 'field' }, 'Question order', orderSelect)
          ),
          el('details', { class: 'setup-block' },
            el('summary', {}, 'Advanced scoring'),
            el('div', { class: 'setup-grid' }, scoringInputs),
            el('p', { class: 'muted small' },
              'Correct: (base + speed bonus) × difficulty multiplier. Wrong: −penalty scaled by how fast you answered. Unanswered: 0.')
          ),
          turnWarning,
          startBtn,
          status
        )
      );
      renderPresets();
      refresh();
    },
  };
}
