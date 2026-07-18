// Host-authoritative game engine: a pure state machine with an event bus.
// It never touches the DOM or the network; adapters subscribe to its events.
//
// Phases: idle → (q_intro → q_open → q_closed → reveal → race)* → over
import { clamp, createEmitter } from './util.js';

export const TIMING = {
  introMs: 2200, // "Question 3/15" splash
  graceMs: 400, // window after close for in-flight answers
  revealMs: 6000, // auto-advance from reveal if host doesn't click Next
  raceMs: 3600, // race animation duration
};

export class GameEngine {
  /**
   * @param plan     [{question, labels, correctIndex}]
   * @param settings {timeLimitSeconds|null}
   * @param scoring  {base_points, max_speed_bonus, difficulty_multiplier[5],
   *                  wrong_penalty_max, min_score}
   */
  constructor({ plan, settings, scoring }) {
    this.plan = plan;
    this.settings = settings;
    this.scoring = scoring;
    this.events = createEmitter();
    this.players = new Map(); // id -> {id, name, avatar, score, connected}
    this.phase = 'idle';
    this.qIndex = -1;
    this.deadline = null;
    this.answers = new Map(); // playerId -> {choiceIndex, at}
    this.lastResults = new Map(); // playerId -> reveal result (for reconnects)
    this.maxPossibleSoFar = 0;
    this._timers = new Set();
  }

  addPlayer({ id, name, avatar }) {
    this.players.set(id, { id, name, avatar, score: 0, connected: true });
  }

  markConnected(id, connected) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    this.events.emit('roster', this.getStandings());
    // A disconnect can leave everyone-else already answered.
    if (connected === false && this.phase === 'q_open') this._maybeCloseAllAnswered();
  }

  start() {
    this.qIndex = -1;
    this._nextQuestion();
  }

  current() {
    return this.plan[this.qIndex] || null;
  }

  _after(ms, fn) {
    const t = setTimeout(() => {
      this._timers.delete(t);
      fn();
    }, ms);
    this._timers.add(t);
  }

  _clearTimers() {
    this._timers.forEach(clearTimeout);
    this._timers.clear();
  }

  _nextQuestion() {
    this._clearTimers();
    this.qIndex++;
    if (this.qIndex >= this.plan.length) return this._finish();
    this.phase = 'q_intro';
    this.events.emit('intro', {
      index: this.qIndex,
      total: this.plan.length,
      question: this.current().question,
    });
    this._after(TIMING.introMs, () => this._openQuestion());
  }

  _openQuestion() {
    const item = this.current();
    this.phase = 'q_open';
    this.answers = new Map();
    const tl = this.settings.timeLimitSeconds;
    this.openedAt = Date.now();
    this.deadline = tl ? this.openedAt + tl * 1000 : null;
    this.events.emit('question', {
      index: this.qIndex,
      total: this.plan.length,
      item,
      deadline: this.deadline,
      timeLimitSeconds: tl,
    });
    if (this.deadline) this._after(tl * 1000, () => this.closeQuestion('time'));
  }

  /** Called by adapters (local tap or network). Returns {accepted}. */
  submitAnswer(playerId, questionIndex, choiceIndex) {
    if (questionIndex !== this.qIndex) return { accepted: false };
    if (this.phase !== 'q_open' && this.phase !== 'q_closed') return { accepted: false };
    if (!this.players.has(playerId) || this.answers.has(playerId)) return { accepted: false };
    const item = this.current();
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= item.labels.length) {
      return { accepted: false };
    }
    this.answers.set(playerId, { choiceIndex, at: Date.now() });
    this.events.emit('answerCount', { answered: this.answers.size, of: this._connectedCount() });
    if (this.phase === 'q_open') this._maybeCloseAllAnswered();
    return { accepted: true };
  }

  _connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  _maybeCloseAllAnswered() {
    let allAnswered = this._connectedCount() > 0;
    for (const p of this.players.values()) {
      if (p.connected && !this.answers.has(p.id)) allAnswered = false;
    }
    if (allAnswered) this.closeQuestion('all_answered');
  }

  /** Ends the answering window (deadline, all-answered, or host button). */
  closeQuestion(reason) {
    if (this.phase !== 'q_open') return;
    this.phase = 'q_closed';
    this._clearTimers();
    this.events.emit('closed', { reason });
    this._after(TIMING.graceMs, () => this._computeReveal());
  }

  _delta(correct, frac, difficulty) {
    const s = this.scoring;
    const mult = s.difficulty_multiplier[clamp(difficulty, 1, 5) - 1] ?? 1;
    if (correct) return Math.round((s.base_points + s.max_speed_bonus * frac) * mult);
    return -Math.round(s.wrong_penalty_max * frac) || 0; // "|| 0" normalizes -0
  }

  _computeReveal() {
    const item = this.current();
    const tl = this.settings.timeLimitSeconds;
    const counts = item.labels.map(() => 0);
    const results = new Map();
    for (const p of this.players.values()) {
      const a = this.answers.get(p.id);
      let delta = 0;
      let correct = false;
      let choiceIndex = null;
      if (a) {
        choiceIndex = a.choiceIndex;
        counts[a.choiceIndex]++;
        correct = a.choiceIndex === item.correctIndex;
        // Speed fraction: 1 = instant answer, 0 = at (or past) the deadline.
        // Without a time limit speed is not measured (no bonus, no penalty).
        const frac = this.deadline ? clamp((this.deadline - a.at) / (tl * 1000), 0, 1) : 0;
        delta = this._delta(correct, frac, item.question.difficulty);
      }
      p.score = Math.max(this.scoring.min_score, p.score + delta);
      results.set(p.id, { choiceIndex, correct, delta, answered: !!a });
    }
    this.maxPossibleSoFar += Math.round(
      (this.scoring.base_points + (this.deadline ? this.scoring.max_speed_bonus : 0)) *
        (this.scoring.difficulty_multiplier[clamp(item.question.difficulty, 1, 5) - 1] ?? 1)
    );
    this.lastResults = results;
    this.phase = 'reveal';
    this.events.emit('reveal', {
      index: this.qIndex,
      total: this.plan.length,
      item,
      counts,
      results,
      standings: this.getStandings(),
      maxPossibleSoFar: this.maxPossibleSoFar,
    });
    this._after(TIMING.revealMs, () => this.advance());
  }

  /** reveal → race → next question. Also bound to the host "Next" button. */
  advance() {
    if (this.phase === 'reveal') {
      this._clearTimers();
      this.phase = 'race';
      this.events.emit('race', {
        index: this.qIndex,
        total: this.plan.length,
        standings: this.getStandings(),
        maxPossibleSoFar: this.maxPossibleSoFar,
      });
      this._after(TIMING.raceMs, () => this._nextQuestion());
    } else if (this.phase === 'race') {
      this._clearTimers();
      this._nextQuestion();
    }
  }

  _finish() {
    this.phase = 'over';
    this._clearTimers();
    this.events.emit('gameover', { standings: this.getStandings() });
  }

  /** Sorted standings with tie-aware ranks and last-question deltas. */
  getStandings() {
    const rows = [...this.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        connected: p.connected,
        delta: this.lastResults.get(p.id)?.delta ?? 0,
        correct: this.lastResults.get(p.id)?.correct ?? false,
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    let rank = 0;
    let prevScore = null;
    rows.forEach((r, i) => {
      if (r.score !== prevScore) {
        rank = i + 1;
        prevScore = r.score;
      }
      r.rank = rank;
    });
    return rows;
  }

  /** Snapshot for reconnecting players. */
  getStateFor(playerId) {
    const base = {
      phase: this.phase,
      index: this.qIndex,
      total: this.plan.length,
      standings: this.getStandings(),
      maxPossibleSoFar: this.maxPossibleSoFar,
    };
    if (this.phase === 'q_open' || this.phase === 'q_intro' || this.phase === 'q_closed') {
      const item = this.current();
      base.choices = item ? item.labels : [];
      base.remainingMs = this.deadline ? Math.max(0, this.deadline - Date.now()) : null;
      base.timeLimitSeconds = this.settings.timeLimitSeconds;
      base.answered = this.answers.has(playerId);
    }
    if (this.phase === 'reveal' || this.phase === 'race') {
      const item = this.current();
      const r = this.lastResults.get(playerId);
      base.correctChoiceIndex = item?.correctIndex;
      base.answerText = item?.question.answer;
      base.result = r ? { ...r } : null;
    }
    return base;
  }

  destroy() {
    this._clearTimers();
    this.events.clear();
    this.phase = 'idle';
  }
}
