// Landing screen: play solo, host a room, or join one.
import { el } from '../../util.js';

export const homeScreen = {
  mount(container, ctx) {
    // Arriving home always tears down any leftover game/network state.
    ctx.session.reset();
    ctx.wakeLock.disable();
    const { dataset, theme } = ctx;

    container.append(
      el('div', { class: 'home card' },
        el('div', { class: 'home-emoji', 'aria-hidden': 'true' }, theme.emoji || '🎯'),
        el('h1', { class: 'home-title' }, dataset.title || 'Trivia'),
        dataset.description ? el('p', { class: 'muted home-desc' }, dataset.description) : null,
        el('div', { class: 'home-menu' },
          el('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: () => ctx.router.go('solo') },
            '🎮 Play solo'),
          el('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: () => ctx.router.go('host') },
            '📺 Host multiplayer'),
          el('button', { class: 'btn btn-accent btn-big', type: 'button', onclick: () => ctx.router.go('join') },
            '📱 Join a game')
        ),
        el('p', { class: 'muted small' },
          `${dataset.questions.length} questions · ${Object.keys(dataset.category_breakdown || {}).length || 'several'} categories`)
      )
    );
  },
};
