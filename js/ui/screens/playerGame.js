// The remote player's controller: big colored answer buttons with small
// text, a countdown bar, personal results, and reconnect overlays.
import { renderAvatar } from '../../avatars.js';
import { getPlayerId } from '../../net/player.js';
import { MSG } from '../../net/protocol.js';
import { el } from '../../util.js';
import { confettiBurst, overlay } from '../components.js';

export const playerGameScreen = {
  mount(container, ctx) {
    const session = ctx.session.player;
    if (!session || ctx.session.mode !== 'player') {
      // A reloaded tab lost its in-memory session — send it back to the join
      // screen with the last room code prefilled (playerId survives, so the
      // host treats the re-join as a reconnect and restores the score).
      const last = sessionStorage.getItem('trivia_last_room');
      if (last) ctx.router.go('join', last);
      else ctx.router.go('home');
      return;
    }
    const { net, profile, buttonTheme } = session;
    const unsubs = [];
    let raf = null;
    let confettiCleanup = null;
    let current = { index: null, choice: null, locked: false };

    const header = el('header', { class: 'player-head' },
      renderAvatar(profile.avatar, 34, profile.name),
      el('span', { class: 'player-head-name' }, profile.name),
      el('span', { class: 'player-head-score', 'aria-live': 'polite' }, ''),
      el('button', {
        class: 'btn btn-ghost btn-small', type: 'button',
        onclick: () => { ctx.session.reset(); ctx.router.go('home'); },
      }, 'Leave')
    );
    const timerBar = el('div', { class: 'player-timer', hidden: '' }, el('div', { class: 'player-timer-fill' }));
    const main = el('div', { class: 'player-main' });
    const overlayHost = el('div', { class: 'overlay-host' });
    container.append(el('div', { class: 'player-layout' }, header, timerBar, main, overlayHost));

    const scoreEl = header.querySelector('.player-head-score');

    function stopTimer() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      timerBar.setAttribute('hidden', '');
    }

    function startTimer(deadline, totalMs) {
      stopTimer();
      timerBar.removeAttribute('hidden');
      const fill = timerBar.firstChild;
      const frame = () => {
        const remaining = Math.max(0, deadline - Date.now());
        const frac = totalMs > 0 ? remaining / totalMs : 0;
        fill.style.width = `${frac * 100}%`;
        fill.classList.toggle('urgent', remaining <= 5000);
        if (remaining > 0) raf = requestAnimationFrame(frame);
      };
      frame();
    }

    function showWaiting(note) {
      stopTimer();
      main.replaceChildren(
        el('div', { class: 'player-waiting pop-in' },
          renderAvatar(profile.avatar, 96, profile.name),
          el('h2', {}, `You're in, ${profile.name}!`),
          el('p', { class: 'muted' }, note || 'Watch the host screen — the game will start soon.'),
          el('p', { class: 'muted small' }, 'Tip: keep your screen on during the game.')
        )
      );
    }

    function showQuestion({ index, choices, deadlineMs, timeLimitSeconds, answered }) {
      current = { index, choice: null, locked: !!answered };
      if (timeLimitSeconds && deadlineMs) startTimer(deadlineMs, timeLimitSeconds * 1000);
      else stopTimer();

      if (current.locked) return showLocked(null);

      const grid = el('div', { class: `player-buttons count-${choices.length}` });
      choices.forEach((label, i) => {
        const t = buttonTheme[i % buttonTheme.length];
        const b = el('button', { class: 'player-answer', type: 'button' },
          el('span', { class: 'player-answer-shape' }, t.shape),
          el('span', { class: 'player-answer-text' }, String(label))
        );
        b.style.setProperty('--tile-color', t.color);
        b.addEventListener('click', () => {
          if (current.locked) return;
          current.locked = true;
          current.choice = i;
          net.answer(index, i);
          showLocked(i, label);
        });
        grid.append(b);
      });
      main.replaceChildren(grid);
    }

    function showLocked(choiceIndex, label) {
      const t = choiceIndex !== null ? buttonTheme[choiceIndex % buttonTheme.length] : null;
      main.replaceChildren(
        el('div', { class: 'player-locked pop-in' },
          el('div', { class: 'player-locked-mark' }, '🔒'),
          el('h2', {}, 'Locked in!'),
          t
            ? el('div', { class: 'player-locked-choice' },
                el('span', { class: 'player-answer-shape', style: `color:${t.color}` }, t.shape),
                el('span', {}, label || ''))
            : el('p', { class: 'muted' }, 'You already answered this one.'),
          el('p', { class: 'muted' }, 'Waiting for everyone else…')
        )
      );
    }

    function showReveal(m) {
      stopTimer();
      const good = !!m.correct;
      ctx.audio.play(m.answered ? (good ? 'correct' : 'wrong') : 'wrong', m.answered ? 1 : 0.5);
      scoreEl.textContent = m.you ? `${m.you.score} pts` : '';
      main.replaceChildren(
        el('div', { class: `player-result ${good ? 'good' : 'bad'} pop-in` },
          el('div', { class: 'player-result-mark' }, m.answered ? (good ? '✓' : '✗') : '⏰'),
          el('h2', {}, m.answered ? (good ? 'Correct!' : 'Wrong') : 'Too slow!'),
          el('p', { class: 'player-result-delta' },
            m.delta ? `${m.delta > 0 ? '+' : ''}${m.delta} points` : 'no points'),
          el('p', { class: 'muted' }, 'Answer: ', el('strong', {}, String(m.answerText ?? ''))),
          m.you ? el('p', { class: 'player-result-rank' }, `You're #${m.you.rank} of ${m.you.of}`) : null
        )
      );
      if (!good && m.answered) main.firstChild.classList.add('shake');
    }

    function showGameOver(m) {
      stopTimer();
      const rows = Array.isArray(m.standings) ? m.standings : [];
      const myRow = rows.find((p) => p.id === getPlayerId()) || null;
      const rank = myRow?.rank ?? '?';
      main.replaceChildren(
        el('div', { class: 'player-final pop-in' },
          el('div', { class: 'player-final-medal' },
            rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏁'),
          el('h2', {}, `You finished #${rank}`),
          myRow ? el('p', { class: 'player-result-delta' }, `${myRow.score} points`) : null,
          el('p', { class: 'muted' }, 'Thanks for playing!')
        )
      );
      if (typeof rank === 'number' && rank <= 3) {
        ctx.audio.play('fanfare');
        confettiCleanup = confettiBurst(container);
      }
    }

    function applyState(m) {
      overlayHost.replaceChildren();
      // Idempotence guard: a resync describing exactly what is already on
      // screen must not rebuild the view — repainting swaps the buttons out
      // from under the player's finger (missed taps, visible flicker).
      if (
        m.phase === 'q_open' &&
        current.index === m.index &&
        !!current.locked === !!m.answered &&
        main.querySelector('.player-buttons, .player-locked')
      ) {
        return;
      }
      scoreEl.textContent = '';
      if (m.phase === 'q_open' || m.phase === 'q_intro') {
        showQuestion({
          index: m.index,
          choices: m.choices || [],
          deadlineMs: m.remainingMs != null ? Date.now() + m.remainingMs : null,
          timeLimitSeconds: m.timeLimitSeconds,
          answered: m.answered,
        });
      } else if (m.phase === 'reveal' || m.phase === 'race' || m.phase === 'q_closed') {
        if (m.result) {
          showReveal({
            ...m.result,
            answerText: m.answerText,
            correctChoiceIndex: m.correctChoiceIndex,
            you: null,
          });
        } else {
          showWaiting('Round in progress — you rejoin with the next question.');
        }
      } else if (m.phase === 'over') {
        showGameOver(m);
      } else {
        showWaiting();
      }
    }

    // ---------- network events ----------
    unsubs.push(net.on(MSG.LOBBY, (m) => {
      const n = Array.isArray(m.players) ? m.players.length : 0;
      showWaiting(n > 1 ? `${n} players in the lobby. Waiting for the host…` : 'Waiting for the host to start…');
    }));
    unsubs.push(net.on(MSG.QUESTION, (m) => {
      overlayHost.replaceChildren();
      showQuestion({
        index: m.index,
        choices: Array.isArray(m.choices) ? m.choices : [],
        deadlineMs: m.timeLimitSeconds ? Date.now() + m.timeLimitSeconds * 1000 : null,
        timeLimitSeconds: m.timeLimitSeconds,
        answered: false,
      });
    }));
    unsubs.push(net.on(MSG.ANSWER_ACK, () => {
      const h = main.querySelector('.player-locked h2');
      if (h) h.textContent = 'Locked in ✓';
    }));
    unsubs.push(net.on(MSG.REVEAL, (m) => showReveal(m)));
    unsubs.push(net.on(MSG.GAME_OVER, (m) => showGameOver(m)));
    unsubs.push(net.on(MSG.STATE, (m) => applyState(m)));
    // A STATE resync may have arrived before this screen mounted (reconnect
    // races the hash navigation) — apply the cached one.
    const pendingState = net.lastState;
    net.lastState = null;
    unsubs.push(net.on(MSG.HOST_CLOSED, () => {
      overlayHost.replaceChildren(overlay('The host ended the game.', {
        actionLabel: 'Home',
        onAction: () => { ctx.session.reset(); ctx.router.go('home'); },
      }));
    }));
    unsubs.push(net.on('reconnecting', () => {
      overlayHost.replaceChildren(overlay('Connection lost — reconnecting…'));
    }));
    unsubs.push(net.on('welcome', () => {
      // Successful rejoin; a STATE message follows and repaints the view.
      overlayHost.replaceChildren();
    }));
    unsubs.push(net.on('lost', () => {
      overlayHost.replaceChildren(overlay('Could not reconnect.', {
        actionLabel: 'Rejoin',
        onAction: () => {
          overlayHost.replaceChildren(overlay('Reconnecting…'));
          net.retryNow();
        },
      }));
    }));
    unsubs.push(net.on('not_found', () => {
      overlayHost.replaceChildren(overlay('The room is gone — the host may have closed it.', {
        actionLabel: 'Home',
        onAction: () => { ctx.session.reset(); ctx.router.go('home'); },
      }));
    }));

    if (pendingState) applyState(pendingState);
    else showWaiting();

    return () => {
      unsubs.forEach((u) => u());
      stopTimer();
      confettiCleanup?.();
    };
  },
};
