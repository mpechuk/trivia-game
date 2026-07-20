// Landing screen: pick a question pack (built-in or uploaded), then play
// solo, host a room, or join one. Solo/host stay locked until a pack is chosen.
import { loadConfig, loadPackManifest, normalizeConfig } from '../../config.js';
import { el } from '../../util.js';

export const homeScreen = {
  mount(container, ctx) {
    // Arriving home always tears down any leftover game/network state.
    ctx.session.reset();
    ctx.wakeLock.disable();

    let manifest = [];
    let busy = false; // true while a pack is being fetched/parsed
    const status = el('p', { class: 'status-line', role: 'status' });

    const fileInput = el('input', {
      type: 'file',
      accept: '.json,application/json',
      class: 'visually-hidden',
      onchange: () => {
        const file = fileInput.files && fileInput.files[0];
        if (file) selectUpload(file);
        fileInput.value = ''; // allow re-picking the same file
      },
    });

    async function selectBuiltin(entry) {
      if (busy) return;
      busy = true;
      status.textContent = `Loading ${entry.name || entry.file}…`;
      paint();
      try {
        const config = await loadConfig(`data/${entry.file}`);
        ctx.setPack(config, { source: 'builtin', file: entry.file, name: entry.name });
        status.textContent = '';
      } catch (err) {
        console.error(err);
        status.textContent = `Could not load that pack: ${err.message || err}`;
      } finally {
        busy = false;
        paint();
      }
    }

    async function selectUpload(file) {
      if (busy) return;
      busy = true;
      status.textContent = `Reading ${file.name}…`;
      paint();
      try {
        const config = normalizeConfig(JSON.parse(await file.text()), file.name);
        ctx.setPack(config, { source: 'upload', name: file.name });
        status.textContent = '';
      } catch (err) {
        console.error(err);
        status.textContent =
          err instanceof SyntaxError
            ? `${file.name} is not valid JSON.`
            : `That pack can't be used: ${err.message || err}`;
      } finally {
        busy = false;
        paint();
      }
    }

    function packCard(entry) {
      const selected = ctx.pack?.source === 'builtin' && ctx.pack.file === entry.file;
      return el('button', {
        type: 'button',
        class: `pack-card ${selected ? 'selected' : ''}`,
        disabled: busy ? '' : null,
        onclick: () => selectBuiltin(entry),
      },
        el('span', { class: 'pack-emoji', 'aria-hidden': 'true' }, entry.emoji || '🎯'),
        el('span', { class: 'pack-info' },
          el('span', { class: 'pack-name' }, entry.name || entry.file),
          entry.description ? el('span', { class: 'muted small pack-desc' }, entry.description) : null
        ),
        selected ? el('span', { class: 'pack-check', 'aria-hidden': 'true' }, '✓') : null
      );
    }

    function chooser() {
      const cards = manifest.map(packCard);
      const uploadSelected = ctx.pack?.source === 'upload';
      return el('div', { class: 'pack-chooser' },
        el('h3', {}, 'Choose a question pack'),
        cards.length
          ? el('div', { class: 'pack-list' }, cards)
          : el('p', { class: 'muted small' }, 'No built-in packs found — upload your own below.'),
        el('div', { class: 'pack-upload' },
          el('button', {
            type: 'button',
            class: `btn btn-ghost pack-upload-btn ${uploadSelected ? 'selected' : ''}`,
            disabled: busy ? '' : null,
            onclick: () => fileInput.click(),
          }, uploadSelected ? `✓ ${ctx.pack.title}` : '⬆ Upload your own pack (.json)'),
          fileInput
        )
      );
    }

    function paint() {
      const pack = ctx.pack;
      const ready = !!ctx.dataset;
      const title = ready ? ctx.dataset.title || 'Trivia' : 'Trivia';

      container.replaceChildren(
        el('div', { class: 'home card' },
          el('div', { class: 'home-emoji', 'aria-hidden': 'true' }, (ready ? ctx.theme.emoji : '🎯') || '🎯'),
          el('h1', { class: 'home-title' }, title),
          ready && ctx.dataset.description
            ? el('p', { class: 'muted home-desc' }, ctx.dataset.description)
            : el('p', { class: 'muted home-desc' }, 'Pick a pack to start, or join a game someone else is hosting.'),

          chooser(),

          el('div', { class: 'home-menu' },
            el('button', {
              class: 'btn btn-primary btn-big', type: 'button',
              disabled: ready && !busy ? null : '',
              onclick: () => ready && ctx.router.go('solo'),
            }, '🎮 Play solo'),
            el('button', {
              class: 'btn btn-primary btn-big', type: 'button',
              disabled: ready && !busy ? null : '',
              onclick: () => ready && ctx.router.go('host'),
            }, '📺 Host multiplayer'),
            el('button', {
              class: 'btn btn-accent btn-big', type: 'button',
              onclick: () => ctx.router.go('join'),
            }, '📱 Join a game')
          ),
          !ready
            ? el('p', { class: 'muted small' }, 'Solo and hosting unlock once a pack is loaded.')
            : el('p', { class: 'muted small' },
                `${ctx.dataset.questions.length} questions · ${Object.keys(ctx.dataset.category_breakdown || {}).length || 'several'} categories`),
          status
        )
      );
    }

    paint();
    // Fetch the built-in pack list, then repaint to show the cards.
    loadPackManifest().then((packs) => {
      manifest = packs;
      paint();
    });
  },
};
