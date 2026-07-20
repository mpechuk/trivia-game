// Question sampling and choice building, driven by the host's setup options.
import { clamp, sampleN, shuffle } from './util.js';

export const DIFFICULTY_LABELS = ['Easy', 'Medium', 'Hard', 'Very Hard', 'Expert'];

// Per-difficulty weights (difficulty 1..5), normalized at use time.
export const MIX_PRESETS = {
  balanced: [25, 25, 25, 15, 10],
  easy_ride: [50, 30, 15, 5, 0],
  hardcore: [0, 10, 25, 35, 30],
};

export function categoriesOf(questions) {
  const counts = new Map();
  for (const q of questions) counts.set(q.category, (counts.get(q.category) || 0) + 1);
  return counts;
}

export function filterPool(questions, categories) {
  if (!categories || categories === 'all') return questions.slice();
  const set = new Set(categories);
  return questions.filter((q) => set.has(q.category));
}

/** Integer per-difficulty targets that sum to count (largest-remainder rounding). */
export function difficultyTargets(count, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return [0, 0, 0, 0, 0];
  const exact = weights.map((w) => (count * w) / total);
  const targets = exact.map(Math.floor);
  let remaining = count - targets.reduce((a, b) => a + b, 0);
  const byFrac = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e), weight: weights[i] }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remaining > 0 && byFrac.length > 0; k++, remaining--) {
    targets[byFrac[k % byFrac.length].i]++;
  }
  return targets;
}

/**
 * Sample `count` questions honoring the difficulty mix; when a difficulty
 * bucket runs short, the deficit is borrowed from the nearest difficulty.
 */
export function selectQuestions(questions, { count, weights, categories = 'all', order = 'ramp' }) {
  const pool = filterPool(questions, categories);
  const n = clamp(count, 1, pool.length);
  const targets = difficultyTargets(n, weights);

  const buckets = [1, 2, 3, 4, 5].map((d) => shuffle(pool.filter((q) => q.difficulty === d)));
  const picked = [];
  const deficits = [];
  buckets.forEach((bucket, i) => {
    const take = Math.min(targets[i], bucket.length);
    picked.push(...bucket.splice(0, take));
    if (take < targets[i]) deficits.push({ i, need: targets[i] - take });
  });
  for (const { i, need } of deficits) {
    let left = need;
    for (let dist = 1; dist < 5 && left > 0; dist++) {
      for (const j of [i - dist, i + dist]) {
        while (left > 0 && j >= 0 && j < 5 && buckets[j].length) {
          picked.push(buckets[j].shift());
          left--;
        }
      }
    }
  }

  if (order === 'shuffled') return shuffle(picked);
  // "ramp": ascending difficulty, shuffled within each level.
  const groups = [[], [], [], [], []];
  for (const q of picked) groups[clamp(q.difficulty, 1, 5) - 1].push(q);
  return groups.flatMap((g) => shuffle(g));
}

/** Build the shuffled multiple-choice labels for one question. */
export function buildChoices(question, choicesPerQuestion) {
  const wrong = sampleN(question.wrong_answers, clamp(choicesPerQuestion, 2, 5) - 1);
  const labels = shuffle([question.answer, ...wrong]);
  return { labels, correctIndex: labels.indexOf(question.answer) };
}

/** Full question plan for a game: selection + prebuilt choices. */
export function buildPlan(questions, options) {
  return selectQuestions(questions, options).map((q) => ({
    question: q,
    ...buildChoices(q, options.choicesPerQuestion),
  }));
}
