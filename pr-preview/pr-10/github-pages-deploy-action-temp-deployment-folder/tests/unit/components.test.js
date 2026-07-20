import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RACE_MOVE_EPS,
  RUN_STRIDES,
  moodDurationMs,
  raceMood,
  racePosition,
  randomGait,
  soloAnswerFeedback,
} from '../../js/ui/components.js';

// ---- raceMood: the run / stumble / idle decision ----

test('raceMood: gaining ground runs forward', () => {
  assert.equal(raceMood(0, 50), 'run');
  assert.equal(raceMood(20, 20.6), 'run');
  assert.equal(raceMood(99, 100), 'run');
});

test('raceMood: losing ground stumbles backward', () => {
  assert.equal(raceMood(80, 20), 'stumble');
  assert.equal(raceMood(50, 49.4), 'stumble');
  assert.equal(raceMood(100, 0), 'stumble');
});

test('raceMood: no meaningful change idles in place', () => {
  assert.equal(raceMood(0, 0), 'idle');
  assert.equal(raceMood(42, 42), 'idle');
  // sub-epsilon jitter in either direction still counts as standing still
  assert.equal(raceMood(30, 30 + RACE_MOVE_EPS), 'idle');
  assert.equal(raceMood(30, 30 - RACE_MOVE_EPS), 'idle');
});

test('raceMood: the epsilon is exclusive — the boundary is idle, just past it moves', () => {
  assert.equal(raceMood(10, 10 + RACE_MOVE_EPS), 'idle');
  assert.equal(raceMood(10, 10 + RACE_MOVE_EPS + 0.001), 'run');
  assert.equal(raceMood(10, 10 - RACE_MOVE_EPS - 0.001), 'stumble');
});

// ---- racePosition: score -> normalized 0..100 track position ----

test('racePosition: normalizes a score against the max possible', () => {
  assert.equal(racePosition(0, 100), 0);
  assert.equal(racePosition(50, 100), 50);
  assert.equal(racePosition(100, 100), 100);
  assert.equal(racePosition(40, 80), 50);
});

test('racePosition: clamps out-of-range scores into 0..100', () => {
  // a leader can never overshoot the finish line
  assert.equal(racePosition(150, 100), 100);
  // a negative running total sits at the start line, never off-track
  assert.equal(racePosition(-50, 100), 0);
});

test('racePosition: no scoring yet parks everyone at the start line', () => {
  assert.equal(racePosition(0, 0), 0);
  assert.equal(racePosition(10, 0), 0);
});

// racePosition + raceMood compose into the behavior the run screen relies on.
test('racePosition + raceMood: a wrong-answer penalty stumbles a leader back', () => {
  const before = racePosition(80, 80); // was in the lead, at the flag
  const after = racePosition(30, 100); // penalized, and the ceiling rose
  assert.equal(raceMood(before, after), 'stumble');
});

// ---- randomGait: per-figure variation so no two figures move alike ----

test('randomGait: every field lands inside its documented range', () => {
  for (let i = 0; i < 200; i++) {
    const g = randomGait();
    assert.ok(g.swing >= 24 && g.swing < 42, `swing ${g.swing}`);
    assert.ok(g.dur >= 1.68 && g.dur < 2.64, `dur ${g.dur}`);
    assert.ok(g.lean >= 6 && g.lean < 13, `lean ${g.lean}`);
    assert.ok(g.bob >= 2.5 && g.bob < 5, `bob ${g.bob}`);
    assert.ok(g.phase > -2 && g.phase <= 0, `phase ${g.phase}`);
    assert.ok(g.idleDur >= 7.2 && g.idleDur < 12, `idleDur ${g.idleDur}`);
    assert.ok(g.stumbleDur >= 3.2 && g.stumbleDur < 4.4, `stumbleDur ${g.stumbleDur}`);
  }
});

// ---- moodDurationMs: how long the run screen waits for each figure ----

test('moodDurationMs: a run plays RUN_STRIDES full strides', () => {
  const gait = { dur: 2, stumbleDur: 3 };
  assert.equal(moodDurationMs('run', gait), 2000 * RUN_STRIDES);
});

test('moodDurationMs: a stumble lasts one --stumble-dur', () => {
  assert.equal(moodDurationMs('stumble', { dur: 2, stumbleDur: 3 }), 3000);
  assert.equal(moodDurationMs('stumble', { dur: 1, stumbleDur: 2.2 }), 2200);
});

test('moodDurationMs: an idle figure has nothing to wait for', () => {
  assert.equal(moodDurationMs('idle', { dur: 2, stumbleDur: 3 }), 0);
});

test('moodDurationMs: every randomized gait yields a positive, finite duration', () => {
  for (let i = 0; i < 200; i++) {
    const g = randomGait();
    for (const mood of ['run', 'stumble']) {
      const ms = moodDurationMs(mood, g);
      assert.ok(Number.isFinite(ms) && ms > 0, `${mood} -> ${ms}`);
    }
  }
});

test('randomGait: figures get distinct gaits (no two animations identical)', () => {
  const sigs = new Set();
  for (let i = 0; i < 100; i++) {
    const g = randomGait();
    sigs.add([g.swing, g.dur, g.lean, g.bob, g.phase, g.idleDur, g.stumbleDur].join('|'));
  }
  // Seven independent continuous randoms colliding is astronomically unlikely.
  assert.equal(sigs.size, 100);
});

// ---- soloAnswerFeedback: the solo per-answer label/tone/delta ----

test('soloAnswerFeedback: correct answer shows a positive gain', () => {
  assert.deepEqual(soloAnswerFeedback({ answered: true, correct: true, delta: 150 }), {
    label: 'Correct! +150',
    tone: 'good',
    delta: 150,
  });
});

test('soloAnswerFeedback: wrong answer with a penalty shows the signed loss', () => {
  assert.deepEqual(soloAnswerFeedback({ answered: true, correct: false, delta: -30 }), {
    label: 'Wrong -30',
    tone: 'bad',
    delta: -30,
  });
});

test('soloAnswerFeedback: wrong answer with no penalty omits the number', () => {
  assert.deepEqual(soloAnswerFeedback({ answered: true, correct: false, delta: 0 }), {
    label: 'Wrong',
    tone: 'bad',
    delta: 0,
  });
});

test('soloAnswerFeedback: no answer is muted with a null delta', () => {
  const expected = { label: 'No answer', tone: 'muted', delta: null };
  assert.deepEqual(soloAnswerFeedback({ answered: false, correct: false, delta: 0 }), expected);
  assert.deepEqual(soloAnswerFeedback(null), expected);
  assert.deepEqual(soloAnswerFeedback(undefined), expected);
});
