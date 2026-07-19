// The game board. Used by the solo player (tiles are tappable) and by the
// multiplayer host (players answer on their phones). Owns the GameEngine
// wiring: engine events → board UI, sounds, and (host mode) network traffic.
import { GameEngine } from '../../game.js';
import { MSG, msg } from '../../net/protocol.js';
import { DIFFICULTY_LABELS } from '../../questions.js';
import { el } from '../../util.js';
import { answerTile, confettiBurst, podium, raceTrack, RACE_SETTLE_MS, standingsList, timerRing } from '../components.js';

const SOLO_PLAYER_ID = 'you';

export const hostGameScreen = {
  mount(container, ctx) {
    const mode = ctx.session.mode;
    let engine = null;
    let net = null;

    if (mode === 'solo' && ctx.session.solo) {
      const s = ctx.session.solo;
      engine = new GameEngine({ plan: s.plan, settings: s.settings, scoring: s.scoring });
      engine.addPlayer({ id: SOLO_PLAYER_ID, ...s.profile });
      s.engine = engine;
    } else if (mode === 'host' && ctx.session.host?.engine) {
      engine = ctx.session.host.engine;
      net = ctx.session.host.net;
    } else {
      ctx.router.go('home');
      return;
    }

    const solo = mode === 'solo';
    const buttons = ctx.theme.answer_buttons;
    const unsubs = [];
    let confettiCleanup = null;
    let raceTimer = 0;

    // ---------- layout ----------
    const progressEl = el('div', { class: 'game-progress' });
    const categoryEl = el('div', { class: 'game-category' });
    const timer = timerRing({
      onTick: (sec) => {
        if (sec <= 5) ctx.audio.play('tick_urgent');
        else if (sec <= 10) ctx.audio.play('tick');
      },
    });
    const main = el('div', { class: 'game-main' });
    const answeredPill = el('div', { class: 'answered-pill', hidden: '' });
    const controls = el('div', { class: 'game-controls' });
    const sidebar = el('aside', { class: 'game-sidebar' });

    container.append(
      el('div', { class: 'game-layout' + (solo ? ' solo' : '') },
        el('header', { class: 'game-head' },
          progressEl, categoryEl, answeredPill, timer.el
        ),
        main,
        solo ? null : sidebar,
        controls
      )
    );

    function setControls(...nodes) {
      controls.replaceChildren(...nodes.filter(Boolean));
    }
    function btn(label, onclick, cls = 'btn btn-primary') {
      return el('button', { class: cls, type: 'button', onclick }, label);
    }
    function renderSidebar(standings) {
      if (solo) return;
      sidebar.replaceChildren(
        el('h3', {}, 'Players'),
        standingsList(standings, { limit: 8 })
      );
    }

    // race track lives for the whole game so positions animate between rounds
    const track = raceTrack();

    // ---------- engine → UI ----------
    unsubs.push(engine.events.on('intro', ({ index, total, question }) => {
      progressEl.textContent = `${index + 1} / ${total}`;
      categoryEl.replaceChildren(
        el('span', { class: 'chip static' }, question.category),
        el('span', { class: 'chip static diff' }, DIFFICULTY_LABELS[(question.difficulty || 1) - 1])
      );
      timer.stop();
      timer.el.classList.add('hidden-soft');
      answeredPill.setAttribute('hidden', '');
      setControls();
      main.replaceChildren(
        el('div', { class: 'splash pop-in' },
          el('div', { class: 'splash-count' }, `Question ${index + 1}`),
          el('div', { class: 'splash-sub' }, `${question.category} · ${DIFFICULTY_LABELS[(question.difficulty || 1) - 1]}`)
        )
      );
      renderSidebar(engine.getStandings());
    }));

    unsubs.push(engine.events.on('question', ({ index, total, item, deadline, timeLimitSeconds }) => {
      timer.el.classList.remove('hidden-soft');
      if (deadline) timer.start(deadline, timeLimitSeconds * 1000);
      else timer.showInfinity();

      let answeredLocally = false;
      const tiles = item.labels.map((label, i) =>
        answerTile(i, label, buttons, {
          onclick: solo
            ? () => {
                if (answeredLocally) return;
                const r = engine.submitAnswer(SOLO_PLAYER_ID, index, i);
                if (!r.accepted) return;
                answeredLocally = true;
                tiles.forEach((t, j) => {
                  t.classList.toggle('chosen', j === i);
                  t.classList.add('locked');
                });
              }
            : undefined,
        })
      );

      const photo = item.question.photo_link
        ? el('img', {
            class: 'question-photo',
            src: item.question.photo_link,
            alt: '',
            onerror: (e) => e.target.remove(),
          })
        : null;

      main.replaceChildren(
        el('div', { class: 'question-view' },
          el('h2', { class: 'question-text pop-in' }, item.question.question),
          photo,
          el('div', { class: `tiles tiles-${item.labels.length}` }, tiles)
        )
      );

      if (!solo) {
        answeredPill.removeAttribute('hidden');
        answeredPill.textContent = `0 / ${engine._connectedCount()} answered`;
      }
      setControls(btn(solo ? 'Skip ▸' : 'End question now', () => engine.closeQuestion('host'), 'btn btn-ghost'));

      if (net) {
        net.broadcast(msg(MSG.QUESTION, {
          index,
          total,
          timeLimitSeconds,
          choices: item.labels,
        }));
      }
    }));

    unsubs.push(engine.events.on('answerCount', ({ answered, of }) => {
      if (!solo) answeredPill.textContent = `${answered} / ${of} answered`;
    }));

    unsubs.push(engine.events.on('closed', () => {
      timer.stop();
      ctx.audio.play('reveal');
      setControls();
    }));

    unsubs.push(engine.events.on('reveal', (data) => {
      const { item, counts, results, standings } = data;
      timer.stop();
      timer.el.classList.add('hidden-soft');

      const tiles = item.labels.map((label, i) => {
        const tile = answerTile(i, label, buttons, {});
        if (i === item.correctIndex) tile.classList.add('correct');
        else tile.classList.add('dimmed');
        if (!solo) {
          tile.append(el('span', { class: 'tile-count' }, `${counts[i]}`));
        }
        return tile;
      });

      const answerPhoto = item.question.answer_photo
        ? el('img', {
            class: 'question-photo small',
            src: item.question.answer_photo,
            alt: '',
            onerror: (e) => e.target.remove(),
          })
        : null;

      main.replaceChildren(
        el('div', { class: 'question-view reveal' },
          el('h2', { class: 'question-text' }, item.question.question),
          el('p', { class: 'answer-line pop-in' }, '✓ ', el('strong', {}, item.question.answer)),
          answerPhoto,
          el('div', { class: `tiles tiles-${item.labels.length}` }, tiles)
        )
      );

      if (solo) {
        const r = results.get(SOLO_PLAYER_ID);
        ctx.audio.play(r?.correct ? 'correct' : 'wrong');
        const line = r?.answered
          ? r.correct
            ? `Correct! +${r.delta}`
            : `Wrong ${r.delta ? r.delta : ''}`
          : 'No answer';
        main.querySelector('.answer-line').after(
          el('p', { class: `solo-result ${r?.correct ? 'good' : 'bad'}` }, line)
        );
      }

      renderSidebar(standings);
      setControls(btn('Next ▸', () => engine.advance()));

      if (net) {
        for (const row of standings) {
          const r = results.get(row.id);
          net.sendTo(row.id, msg(MSG.REVEAL, {
            questionIndex: data.index,
            total: data.total,
            correctChoiceIndex: item.correctIndex,
            yourChoiceIndex: r?.choiceIndex ?? null,
            answered: r?.answered ?? false,
            correct: r?.correct ?? false,
            delta: r?.delta ?? 0,
            answerText: item.question.answer,
            you: { score: row.score, rank: row.rank, of: standings.length },
          }));
        }
      }
    }));

    unsubs.push(engine.events.on('race', ({ standings, maxPossibleSoFar }) => {
      answeredPill.setAttribute('hidden', '');
      main.replaceChildren(
        el('div', { class: 'race-view' },
          el('h2', { class: 'race-title' }, '🏃 The run'),
          track.el
        )
      );
      // paint previous positions first, then animate to the new ones
      track.update(standings, maxPossibleSoFar, false);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const { moved, animationMs } = track.update(standings, maxPossibleSoFar, true);
          if (moved) ctx.audio.play('advance');
          // Advance only once the run animation has finished, plus a short
          // settle. The host can still skip ahead with the button below.
          clearTimeout(raceTimer);
          raceTimer = setTimeout(() => engine.advance(), animationMs + RACE_SETTLE_MS);
        })
      );
      renderSidebar(standings);
      setControls(btn('Skip ▸', () => { clearTimeout(raceTimer); engine.advance(); }, 'btn btn-ghost'));
    }));

    unsubs.push(engine.events.on('gameover', ({ standings }) => {
      progressEl.textContent = 'Final';
      categoryEl.replaceChildren();
      answeredPill.setAttribute('hidden', '');
      timer.stop();
      timer.el.classList.add('hidden-soft');

      main.replaceChildren(
        el('div', { class: 'podium-view' },
          el('h2', { class: 'pop-in' }, '🏆 Results'),
          podium(standings),
          standingsList(standings, { showDelta: false })
        )
      );
      ctx.audio.play('fanfare');
      confettiCleanup = confettiBurst(container);

      const again = solo
        ? btn('Play again', () => ctx.router.go('solo'))
        : btn('Play again (same players)', () => ctx.router.go('lobby'));
      setControls(
        again,
        btn('Exit', () => { ctx.session.reset(); ctx.router.go('home'); }, 'btn btn-ghost')
      );

      if (net) net.broadcast(msg(MSG.GAME_OVER, { standings }));
    }));

    unsubs.push(engine.events.on('roster', (standings) => {
      renderSidebar(standings);
      if (!solo && engine.phase === 'q_open') {
        answeredPill.textContent = `${engine.answers.size} / ${engine._connectedCount()} answered`;
      }
    }));

    // ---------- network → engine (host mode) ----------
    if (net) {
      net.onAnswer = ({ playerId, questionIndex, choiceIndex }) => {
        const r = engine.submitAnswer(playerId, questionIndex, choiceIndex);
        if (r.accepted) net.sendTo(playerId, msg(MSG.ANSWER_ACK, { questionIndex, choiceIndex }));
      };
      net.onJoin = ({ playerId, name, avatar, conn }) => {
        const known = ctx.session.host.roster.get(playerId);
        if (!known) {
          net.reject(conn, 'in_progress');
          return;
        }
        // Reconnect: restore identity, resync state.
        net.attach(playerId, conn);
        known.avatar = avatar || known.avatar;
        engine.markConnected(playerId, true);
        net.sendTo(playerId, msg(MSG.WELCOME, {
          playerId,
          roomCode: ctx.session.host.roomCode,
          phase: engine.phase,
          title: ctx.dataset.title,
          buttonTheme: ctx.theme.answer_buttons,
          colors: ctx.theme.colors,
        }));
        net.sendTo(playerId, msg(MSG.STATE, engine.getStateFor(playerId)));
      };
      net.onDisconnect = (playerId) => engine.markConnected(playerId, false);
    }

    ctx.wakeLock.enable(); // keep the host screen awake for the whole game
    engine.start();

    return () => {
      unsubs.forEach((u) => u());
      timer.stop();
      clearTimeout(raceTimer);
      confettiCleanup?.();
      ctx.wakeLock.disable();
      if (net) {
        net.onAnswer = null;
        net.onJoin = null;
        net.onDisconnect = null;
      }
      // Engines are owned by the session: lobby (play again) or session.reset
      // (exit/home) decide when to destroy them.
    };
  },
};
