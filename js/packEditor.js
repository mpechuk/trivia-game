// Pure, DOM-free helpers for previewing and editing a question pack's
// questions in memory. Kept side-effect free so they can be unit-tested
// directly (see tests/unit/packEditor.test.js); the preview screen wires them
// to the DOM.
import { clamp } from './util.js';
import { DIFFICULTY_LABELS } from './questions.js';

/** Smallest positive integer id not already used by `questions`. */
export function nextQuestionId(questions) {
  let max = 0;
  for (const q of questions) {
    const n = Number(q.id);
    if (Number.isFinite(n) && n > max) max = Math.floor(n);
  }
  return max + 1;
}

/** A blank question (with a fresh id) ready to be filled in. */
export function makeBlankQuestion(questions) {
  return {
    id: nextQuestionId(questions),
    category: '',
    difficulty: 1,
    difficulty_label: DIFFICULTY_LABELS[0],
    question: '',
    photo_link: null,
    answer: '',
    answer_photo: null,
    wrong_answers: ['', '', ''],
  };
}

/**
 * Clean an edited question for storage: trim text, default the category, sync
 * difficulty (1..5) with its label, and drop blank / duplicate wrong answers
 * (and any that collide with the correct answer). Pure — returns a new object,
 * preserving unknown fields (photo links, etc.).
 */
export function normalizeQuestion(q) {
  const difficulty = clamp(Math.round(Number(q.difficulty) || 1), 1, 5);
  const answer = String(q.answer ?? '').trim();
  const seen = new Set();
  const wrong_answers = (q.wrong_answers || [])
    .map((w) => String(w ?? '').trim())
    .filter((w) => {
      if (!w || w === answer || seen.has(w)) return false;
      seen.add(w);
      return true;
    });
  return {
    ...q,
    question: String(q.question ?? '').trim(),
    answer,
    category: String(q.category ?? '').trim() || 'General',
    difficulty,
    difficulty_label: DIFFICULTY_LABELS[difficulty - 1],
    wrong_answers,
  };
}

/**
 * Human-readable problems that would stop a question from being playable.
 * An empty array means the question is valid. Pure.
 */
export function validateQuestion(q) {
  const n = normalizeQuestion(q);
  const errors = [];
  if (!n.question) errors.push('Question text is required.');
  if (!n.answer) errors.push('A correct answer is required.');
  if (n.wrong_answers.length < 1) errors.push('Add at least one wrong answer.');
  return errors;
}

/** Insert (when the id is new) or replace a question by id. Returns a new array. Pure. */
export function upsertQuestion(questions, question) {
  const idx = questions.findIndex((q) => q.id === question.id);
  if (idx === -1) return [...questions, question];
  const next = questions.slice();
  next[idx] = question;
  return next;
}

/** Remove the question with `id`. Returns a new array. Pure. */
export function removeQuestion(questions, id) {
  return questions.filter((q) => q.id !== id);
}

/**
 * Recompute the { total_questions, category_breakdown, difficulty_breakdown }
 * summary fields for a questions array, matching the shape used in pack JSON so
 * the home/setup screens stay in sync after edits. Pure.
 */
export function computeBreakdowns(questions) {
  const category_breakdown = {};
  const difficulty_breakdown = {};
  for (const q of questions) {
    const cat = String(q.category ?? '').trim() || 'General';
    category_breakdown[cat] = (category_breakdown[cat] || 0) + 1;
    const label = DIFFICULTY_LABELS[clamp(Math.round(Number(q.difficulty) || 1), 1, 5) - 1];
    difficulty_breakdown[label] = (difficulty_breakdown[label] || 0) + 1;
  }
  return { total_questions: questions.length, category_breakdown, difficulty_breakdown };
}
