// Host lobby: shows the room code / QR / join URL and the players as they
// arrive. Owns join handling while in the lobby phase.
import { GameEngine } from '../../game.js';
import { renderAvatar } from '../../avatars.js';
import { MSG, msg } from '../../net/protocol.js';
import { el } from '../../util.js';

export const lobbyScreen = {
  mount(container, ctx) {
    const host = ctx.session.host;
    if (!host || ctx.session.mode !== 'host') {
      ctx.router.go('home');
      return;
    }
    const { net, roster } = host;

    // Returning from a finished game ("Play again") — reset scores/engine and
    // drop roster entries whose connection didn't survive the last game.
    if (host.engine) {
      host.engine.destroy();
      host.engine = null;
    }
    for (const id of [...roster.keys()]) {
      if (!net.connections.has(id)) roster.delete(id);
    }

    const joinUrl =
      `${location.origin}${location.pathname}${location.search}#/join/${host.roomCode}`;

    const playersBox = el('div', { class: 'lobby-players' });
    const startBtn = el('button', {
      class: 'btn btn-primary btn-big', type: 'button', disabled: '', onclick: startGame,
    }, '▶ Start game');
    const countLine = el('p', { class: 'muted' });

    function lobbyMsg() {
      return msg(MSG.LOBBY, {
        players: [...roster.values()].map((p) => ({ name: p.name, avatar: p.avatar })),
        settings: {
          questionCount: host.plan.length,
          timeLimitSeconds: host.settings.timeLimitSeconds,
        },
      });
    }

    function renderPlayers() {
      playersBox.replaceChildren(
        ...[...roster.values()].map((p) =>
          el('div', { class: 'player-chip pop-in' }, renderAvatar(p.avatar, 40, p.name), el('span', {}, p.name))
        )
      );
      countLine.textContent = roster.size
        ? `${roster.size} player${roster.size > 1 ? 's' : ''} in`
        : 'Waiting for players…';
      if (roster.size > 0) startBtn.removeAttribute('disabled');
      else startBtn.setAttribute('disabled', '');
    }

    function uniqueName(requested, playerId) {
      let name = requested;
      let n = 2;
      const taken = () =>
        [...roster.values()].some((p) => p.id !== playerId && p.name.toLowerCase() === name.toLowerCase());
      while (taken()) name = `${requested} ${n++}`;
      return name;
    }

    net.onJoin = ({ playerId, name, avatar, conn }) => {
      const finalName = uniqueName(name, playerId);
      roster.set(playerId, { id: playerId, name: finalName, avatar, connected: true });
      net.attach(playerId, conn);
      net.sendTo(playerId, msg(MSG.WELCOME, {
        playerId,
        roomCode: host.roomCode,
        phase: 'lobby',
        title: ctx.dataset.title,
        buttonTheme: ctx.theme.answer_buttons,
        colors: ctx.theme.colors,
      }));
      net.broadcast(lobbyMsg());
      ctx.audio.play('join');
      renderPlayers();
    };
    net.onDisconnect = (playerId) => {
      // In the lobby, disconnected players simply drop off the list.
      roster.delete(playerId);
      net.broadcast(lobbyMsg());
      renderPlayers();
    };
    net.onAnswer = null;

    function startGame() {
      const engine = new GameEngine({
        plan: host.plan,
        settings: host.settings,
        scoring: host.scoring,
      });
      for (const p of roster.values()) engine.addPlayer(p);
      host.engine = engine;
      ctx.router.go('game');
    }

    // QR code (vendor/qrcode.js exposes window.qrcode)
    let qrNode = null;
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(joinUrl);
      qr.make();
      qrNode = el('img', { class: 'lobby-qr', alt: 'Join QR code', src: qr.createDataURL(6, 4) });
    } catch (err) {
      console.warn('QR generation failed', err);
    }

    const copyBtn = el('button', {
      class: 'btn btn-small', type: 'button',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(joinUrl);
          copyBtn.textContent = '✓ Copied';
          setTimeout(() => (copyBtn.textContent = 'Copy link'), 1500);
        } catch {
          copyBtn.textContent = joinUrl;
        }
      },
    }, 'Copy link');

    container.append(
      el('div', { class: 'lobby card' },
        el('div', { class: 'screen-head' },
          el('button', {
            class: 'btn btn-ghost', type: 'button',
            onclick: () => { ctx.session.reset(); ctx.router.go('home'); },
          }, '✕ Cancel'),
          el('h2', {}, 'Lobby')
        ),
        el('div', { class: 'lobby-grid' },
          el('div', { class: 'lobby-join-info' },
            el('p', { class: 'muted' }, 'Join at'),
            el('p', { class: 'lobby-url' }, `${location.host}${location.pathname}`),
            el('p', { class: 'muted' }, 'with room code'),
            el('div', { class: 'lobby-code' }, host.roomCode),
            copyBtn
          ),
          qrNode
        ),
        countLine,
        playersBox,
        startBtn,
        el('p', { class: 'muted small' },
          'Players connect directly to this browser tab — keep it open during the game.')
      )
    );
    renderPlayers();
    net.broadcast(lobbyMsg()); // tell returning players we're back in the lobby
    ctx.wakeLock.enable(); // keep the host awake while waiting for players

    return () => {
      net.onJoin = null;
      net.onDisconnect = null;
    };
  },
};
