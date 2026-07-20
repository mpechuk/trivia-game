// Pack preview + editor: browse every question in the loaded pack and
// add / edit / delete questions and their answers. Edits mutate the in-memory
// pack, so solo/host setup picks them up immediately; "Export" writes the
// edited pack to a .json file (nothing is persisted server-side).
import {
  computeBreakdowns,
  makeBlankQuestion,
  normalizeQuestion,
  removeQuestion,
  upsertQuestion,
  validateQuestion,
} from '../../packEditor.js';
import { DIFFICULTY_LABELS } from '../../questions.js';
import { el } from '../../util.js';

export const previewScreen = {
  mount(container, ctx) {
    // Reached without a pack (e.g. a direct #/preview link) — go pick one.
    if (!ctx.dataset) {
      ctx.router.go('home');
      return;
    }
    const dataset = ctx.dataset;

    // ---- screen state ----
    let editing = null; // { draft, isNew } while a question is being edited
    let editErrors = []; // validation problems for the open editor
    let confirmDeleteId = null; // id awaiting inline delete confirmation

    // Persist a new questions array onto the live pack and keep the summary
    // counts (used by home + setup screens) in sync.
    function commit(nextQuestions) {
      dataset.questions = nextQuestions;
      Object.assign(dataset, computeBreakdowns(nextQuestions));
    }

    function startAdd() {
      editing = { draft: makeBlankQuestion(dataset.questions), isNew: true };
      editErrors = [];
      confirmDeleteId = null;
      paint();
    }
    function startEdit(q) {
      editing = { draft: { ...q, wrong_answers: [...(q.wrong_answers || [])] }, isNew: false };
      editErrors = [];
      confirmDeleteId = null;
      paint();
    }
    function cancelEdit() {
      editing = null;
      editErrors = [];
      paint();
    }
    function save() {
      const problems = validateQuestion(editing.draft);
      if (problems.length) {
        editErrors = problems;
        paint();
        return;
      }
      commit(upsertQuestion(dataset.questions, normalizeQuestion(editing.draft)));
      editing = null;
      editErrors = [];
      paint();
    }
    function del(id) {
      commit(removeQuestion(dataset.questions, id));
      if (editing && editing.draft.id === id) editing = null;
      confirmDeleteId = null;
      paint();
    }

    function exportPack() {
      const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const base = (dataset.title || 'trivia-pack').replace(/[^\w.-]+/g, '_') || 'trivia-pack';
      const a = el('a', { href: url, download: `${base}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    // ---- editor form for one question (add or edit) ----
    function editorForm() {
      const d = editing.draft;

      const qInput = el('textarea', {
        class: 'input q-edit-text', rows: '2', placeholder: 'Question text',
        oninput: () => { d.question = qInput.value; },
      });
      qInput.value = d.question || '';

      const catInput = el('input', {
        class: 'input', type: 'text', maxlength: '60', placeholder: 'Category',
        value: d.category || '', oninput: () => { d.category = catInput.value; },
      });

      const diffSelect = el('select', {
        class: 'input', onchange: () => { d.difficulty = Number(diffSelect.value); },
      }, DIFFICULTY_LABELS.map((label, i) =>
        el('option', { value: String(i + 1), selected: d.difficulty === i + 1 ? '' : null },
          `${i + 1} · ${label}`)));

      const answerInput = el('input', {
        class: 'input q-edit-answer', type: 'text', placeholder: 'Correct answer',
        value: d.answer || '', oninput: () => { d.answer = answerInput.value; },
      });

      // Wrong answers: one text input per entry, each removable; plus an add button.
      const wrongRows = (d.wrong_answers || []).map((w, i) => {
        const input = el('input', {
          class: 'input', type: 'text', placeholder: `Wrong answer ${i + 1}`,
          value: w || '', oninput: () => { d.wrong_answers[i] = input.value; },
        });
        return el('div', { class: 'wrong-answer-row' },
          input,
          el('button', {
            class: 'btn btn-ghost btn-small', type: 'button', 'aria-label': 'Remove answer',
            onclick: () => { d.wrong_answers.splice(i, 1); paint(); },
          }, '✕'));
      });

      return el('div', { class: 'q-editor' },
        el('label', { class: 'field' }, 'Question', qInput),
        el('div', { class: 'q-edit-meta' },
          el('label', { class: 'field' }, 'Category', catInput),
          el('label', { class: 'field' }, 'Difficulty', diffSelect)),
        el('label', { class: 'field' }, 'Correct answer', answerInput),
        el('div', { class: 'field' },
          el('span', {}, 'Wrong answers'),
          ...wrongRows,
          el('button', {
            class: 'btn btn-ghost btn-small add-answer-btn', type: 'button',
            onclick: () => { d.wrong_answers.push(''); paint(); },
          }, '＋ Add wrong answer')),
        editErrors.length
          ? el('ul', { class: 'q-edit-errors' }, editErrors.map((e) => el('li', {}, e)))
          : null,
        el('div', { class: 'q-editor-actions' },
          el('button', { class: 'btn btn-primary', type: 'button', onclick: save }, '✓ Save'),
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: cancelEdit }, 'Cancel'))
      );
    }

    // ---- read-only view of one question ----
    function questionCard(q, index) {
      if (editing && !editing.isNew && editing.draft.id === q.id) {
        return el('li', { class: 'q-card editing' }, editorForm());
      }
      const label = DIFFICULTY_LABELS[Math.min(4, Math.max(0, (q.difficulty || 1) - 1))];
      return el('li', { class: 'q-card' },
        el('div', { class: 'q-card-head' },
          el('span', { class: 'q-index' }, `${index + 1}`),
          el('div', { class: 'q-tags' },
            q.category ? el('span', { class: 'chip q-chip' }, q.category) : null,
            el('span', { class: 'chip q-chip' }, label)),
          el('div', { class: 'q-card-actions' },
            confirmDeleteId === q.id
              ? el('span', { class: 'q-confirm' },
                  el('span', { class: 'muted small' }, 'Delete?'),
                  el('button', { class: 'btn btn-small q-del-yes', type: 'button', onclick: () => del(q.id) }, 'Yes'),
                  el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => { confirmDeleteId = null; paint(); } }, 'No'))
              : el('span', {},
                  el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: () => startEdit(q) }, '✎ Edit'),
                  el('button', { class: 'btn btn-ghost btn-small q-del', type: 'button', onclick: () => { confirmDeleteId = q.id; paint(); } }, '🗑 Delete')))),
        el('p', { class: 'q-text' }, q.question || el('span', { class: 'muted' }, '(no question text)')),
        el('ul', { class: 'q-answers' },
          el('li', { class: 'q-answer correct' }, '✓ ', q.answer || el('span', { class: 'muted' }, '(no answer)')),
          ...(q.wrong_answers || []).map((w) => el('li', { class: 'q-answer' }, w)))
      );
    }

    function paint() {
      const questions = dataset.questions;
      const list = el('ol', { class: 'q-list' },
        editing && editing.isNew ? el('li', { class: 'q-card editing' }, editorForm()) : null,
        questions.map((q, i) => questionCard(q, i)));

      container.replaceChildren(
        el('div', { class: 'preview card' },
          el('div', { class: 'screen-head' },
            el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => ctx.router.go('home') }, '‹ Back'),
            el('h2', {}, dataset.title || 'Question pack')),
          el('div', { class: 'preview-toolbar' },
            el('button', {
              class: 'btn btn-primary btn-small', type: 'button',
              disabled: editing && editing.isNew ? '' : null,
              onclick: startAdd,
            }, '＋ Add question'),
            el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: exportPack }, '⬇ Export pack (.json)'),
            el('span', { class: 'muted small preview-count' }, `${questions.length} questions`)),
          questions.length || (editing && editing.isNew)
            ? list
            : el('p', { class: 'muted' }, 'This pack has no questions yet. Add one to get started.'),
          el('p', { class: 'muted small' }, 'Edits apply to this session immediately. Use “Export” to save them to a file.'))
      );
    }

    paint();
  },
};
