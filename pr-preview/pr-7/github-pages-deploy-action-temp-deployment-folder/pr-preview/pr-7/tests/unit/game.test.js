import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, TIMING } from '../../js/game.js';

// Shrink the stage timings so the state machine runs fast under test.
TIMING.introMs = 5;
TIMING.graceMs = 5;
TIMING.revealMs = 60_000; // tests drive reveal→race explicitly via advance()
// race→next has no engine timer (the host UI drives it); tests advance() it directly

const SCORING = {
  base_points: 100,
  max_speed_bonus: 100,
  difficulty_multiplier: [1, 1.25, 1.5, 1.75, 2],
  wrong_penalty_max: 50,
  min_score: 0,
};

const item = (difficulty, i = 0) => ({
  question: { question: `q${i}`, answer: 'A', difficulty, category: 'cat' },
  labels: ['A', 'B', 'C', 'D'],
  correctIndex: 0,
});

function makeEngine({ plan, timeLimitSeconds = null, players = ['p1', 'p2'] }) {
  const engine = new GameEngine({ plan, settings: { timeLimitSeconds }, scoring: { ...SCORING } });
  players.forEach((id) => engine.addPlayer({ id, name: id, avatar: { kind: 'emoji', value: '🙂' } }));
  return engine;
}

const once = (engine, event) =>
  new Promise((resolve) => {
    const off = engine.events.on(event, (d) => {
      off();
      resolve(d);
    });
  });

test('no-limit round: correct scores base×multiplier, wrong costs nothing, closes on all-answered', async (t) => {
  const engine = makeEngine({ plan: [item(1), item(3, 1)] });
  t.after(() => engine.destroy());
  const q0 = once(engine, 'question');
  engine.start();
  await q0;

  assert.equal(engine.submitAnswer('p1', 0, 0).accepted, true); // correct
  assert.equal(engine.submitAnswer('p2', 0, 1).accepted, true); // wrong → closes the round
  const reveal = await once(engine, 'reveal');

  assert.equal(reveal.results.get('p1').correct, true);
  assert.equal(reveal.results.get('p1').delta, 100); // no time limit → no speed bonus
  assert.equal(reveal.results.get('p2').correct, false);
  assert.equal(reveal.results.get('p2').delta, 0); // no time limit → no speed penalty
  assert.equal(reveal.standings[0].id, 'p1');
  assert.equal(reveal.standings[0].rank, 1);
  assert.equal(reveal.standings[1].rank, 2);

  // difficulty 3 question: correct pays 100 × 1.5
  const q1 = once(engine, 'question');
  engine.advance(); // reveal → race
  engine.advance(); // race → next question
  await q1;
  engine.submitAnswer('p1', 1, 0);
  engine.submitAnswer('p2', 1, 0);
  const reveal2 = await once(engine, 'reveal');
  assert.equal(reveal2.results.get('p1').delta, 150);
  assert.equal(engine.players.get('p1').score, 250);

  const over = once(engine, 'gameover');
  engine.advance();
  engine.advance();
  const { standings } = await over;
  assert.equal(engine.phase, 'over');
  assert.equal(standings[0].score, 250);
});

test('timed round: fast correct earns a speed bonus, fast wrong moves you backwards (clamped at 0)', async (t) => {
  const engine = makeEngine({ plan: [item(1)], timeLimitSeconds: 2 });
  t.after(() => engine.destroy());
  const q = once(engine, 'question');
  engine.start();
  const { deadline, timeLimitSeconds } = await q;
  assert.equal(timeLimitSeconds, 2);
  assert.ok(deadline > Date.now());

  engine.submitAnswer('p1', 0, 0); // instant correct → frac ≈ 1
  engine.submitAnswer('p2', 0, 2); // instant wrong → near-max penalty
  const reveal = await once(engine, 'reveal');

  const p1 = reveal.results.get('p1');
  assert.ok(p1.delta > 150 && p1.delta <= 200, `speed bonus expected, got ${p1.delta}`);
  const p2 = reveal.results.get('p2');
  assert.ok(p2.delta < -30, `fast wrong answer should be punished, got ${p2.delta}`);
  // score cannot drop below min_score
  assert.equal(engine.players.get('p2').score, 0);
});

test('timed round closes at the deadline even with silent players', async (t) => {
  const engine = makeEngine({ plan: [item(1)], timeLimitSeconds: 0.3 });
  t.after(() => engine.destroy());
  const q = once(engine, 'question');
  const closed = once(engine, 'closed');
  engine.start();
  await q;
  engine.submitAnswer('p1', 0, 0); // p2 never answers
  const { reason } = await closed;
  assert.equal(reason, 'time');
  const reveal = await once(engine, 'reveal');
  assert.equal(reveal.results.get('p2').answered, false);
  assert.equal(reveal.results.get('p2').delta, 0);
});

test('submitAnswer rejects stale, duplicate, out-of-range, and unknown submissions', async (t) => {
  const engine = makeEngine({ plan: [item(1)] });
  t.after(() => engine.destroy());
  const q = once(engine, 'question');
  engine.start();
  await q;
  assert.equal(engine.submitAnswer('p1', 5, 0).accepted, false); // wrong question index
  assert.equal(engine.submitAnswer('p1', 0, 9).accepted, false); // out-of-range choice
  assert.equal(engine.submitAnswer('ghost', 0, 0).accepted, false); // unknown player
  assert.equal(engine.submitAnswer('p1', 0, 1).accepted, true);
  assert.equal(engine.submitAnswer('p1', 0, 0).accepted, false); // first answer wins
});

test('disconnected players are skipped by the all-answered check and greyed in standings', async (t) => {
  const engine = makeEngine({ plan: [item(1)] });
  t.after(() => engine.destroy());
  const q = once(engine, 'question');
  engine.start();
  await q;
  engine.markConnected('p2', false);
  const reveal = once(engine, 'reveal');
  engine.submitAnswer('p1', 0, 0); // only connected player → round closes
  const { standings } = await reveal;
  assert.equal(standings.find((s) => s.id === 'p2').connected, false);
});

test('a disconnect after everyone else answered also closes the round', async (t) => {
  const engine = makeEngine({ plan: [item(1)] });
  t.after(() => engine.destroy());
  const q = once(engine, 'question');
  engine.start();
  await q;
  engine.submitAnswer('p1', 0, 0);
  assert.equal(engine.phase, 'q_open'); // still waiting for p2
  const reveal = once(engine, 'reveal');
  engine.markConnected('p2', false);
  await reveal;
});

test('ties share a rank', async (t) => {
  const engine = makeEngine({ plan: [item(1)], players: ['a', 'b', 'c'] });
  t.after(() => engine.destroy());
  const q = once(engine, 'question');
  engine.start();
  await q;
  engine.submitAnswer('a', 0, 0);
  engine.submitAnswer('b', 0, 0);
  engine.submitAnswer('c', 0, 1);
  const { standings } = await once(engine, 'reveal');
  assert.equal(standings[0].rank, 1);
  assert.equal(standings[1].rank, 1);
  assert.equal(standings[2].rank, 3);
});

test('getStateFor snapshots the running question for reconnects', async (t) => {
  const engine = makeEngine({ plan: [item(1)], timeLimitSeconds: 5 });
  t.after(() => engine.destroy());
  const q = once(engine, 'question');
  engine.start();
  await q;
  engine.submitAnswer('p1', 0, 0);

  const s1 = engine.getStateFor('p1');
  assert.equal(s1.phase, 'q_open');
  assert.deepEqual(s1.choices, ['A', 'B', 'C', 'D']);
  assert.ok(s1.remainingMs > 0 && s1.remainingMs <= 5000);
  assert.equal(s1.answered, true);
  assert.equal(engine.getStateFor('p2').answered, false);

  engine.submitAnswer('p2', 0, 1);
  await once(engine, 'reveal');
  const s2 = engine.getStateFor('p2');
  assert.equal(s2.phase, 'reveal');
  assert.equal(s2.correctChoiceIndex, 0);
  assert.equal(s2.answerText, 'A');
  assert.equal(s2.result.correct, false);
});

test('maxPossibleSoFar tracks the best achievable cumulative score', async (t) => {
  const engine = makeEngine({ plan: [item(1), item(5, 1)], players: ['p1'] });
  t.after(() => engine.destroy());
  const q = once(engine, 'question');
  engine.start();
  await q;
  engine.submitAnswer('p1', 0, 0);
  const r1 = await once(engine, 'reveal');
  assert.equal(r1.maxPossibleSoFar, 100); // no time limit → no bonus headroom
  const q2 = once(engine, 'question');
  engine.advance();
  engine.advance();
  await q2;
  engine.submitAnswer('p1', 1, 0);
  const r2 = await once(engine, 'reveal');
  assert.equal(r2.maxPossibleSoFar, 100 + 200); // difficulty 5 ×2 multiplier
});
