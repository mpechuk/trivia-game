// Player join screen: room code + name + avatar, then dial the host.
import { avatarPicker, randomName } from '../../avatars.js';
import { applyRemoteColors } from '../../config.js';
import { showNetLog } from '../../net/debug.js';
import { normalizeRoomCode } from '../../net/protocol.js';
import { PlayerNetwork, getPlayerId, loadProfile, saveProfile } from '../../net/player.js';
import { el } from '../../util.js';

export const joinScreen = {
  mount(container, ctx, codeArg) {
    const profile = loadProfile();
    let net = null;
    let joined = false;

    const codeInput = el('input', {
      class: 'input input-code',
      type: 'text',
      maxlength: '8',
      autocapitalize: 'characters',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'ROOM CODE',
      value: normalizeRoomCode(codeArg || sessionStorage.getItem('trivia_last_room') || ''),
      oninput: () => {
        codeInput.value = normalizeRoomCode(codeInput.value);
      },
    });
    const nameInput = el('input', {
      class: 'input',
      type: 'text',
      maxlength: '24',
      placeholder: 'Your name',
      value: profile.name || randomName(),
    });
    const picker = avatarPicker(profile.avatar);
    const status = el('p', { class: 'status-line', role: 'status' });
    const joinBtn = el('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: join }, '🎮 Join game');

    // Diagnostics escape hatch: connecting from another network can fail in
    // ways that are invisible without the ICE log. Offer it whenever the
    // join drags on or fails.
    const logBtn = el('button', {
      class: 'btn btn-ghost btn-small', type: 'button',
      onclick: () => {
        showNetLog();
        logBtn.remove();
      },
    }, '🔍 Show connection log');
    let logBtnTimer = null;
    function offerLog() {
      if (!joined && !logBtn.isConnected) status.after(logBtn);
    }

    function fail(text) {
      status.textContent = text;
      joinBtn.disabled = false;
      clearTimeout(logBtnTimer);
      offerLog();
      if (net) {
        net.leave();
        net = null;
      }
    }

    function join() {
      const roomCode = normalizeRoomCode(codeInput.value);
      const name = nameInput.value.trim() || 'Player';
      if (roomCode.length < 4) {
        status.textContent = 'Enter the room code shown on the host screen.';
        return;
      }
      const avatar = picker.getAvatar();
      saveProfile(name, avatar);
      joinBtn.disabled = true;
      status.textContent = 'Connecting…';

      net = new PlayerNetwork({
        roomCode,
        profile: { playerId: getPlayerId(), name, avatar },
        peerConfig: ctx.gameDefaults.network?.peer_config,
      });
      net.on('welcome', (m) => {
        if (joined) return;
        joined = true;
        // Lets a reloaded tab find its way back into the same room.
        sessionStorage.setItem('trivia_last_room', roomCode);
        if (m.colors) applyRemoteColors(m.colors);
        ctx.session.mode = 'player';
        ctx.session.player = {
          net,
          roomCode,
          profile: { name, avatar },
          buttonTheme: Array.isArray(m.buttonTheme) && m.buttonTheme.length ? m.buttonTheme : ctx.theme.answer_buttons,
          title: typeof m.title === 'string' ? m.title : '',
        };
        ctx.router.go('play');
      });
      net.on('reject', (m) => {
        fail(m.reason === 'in_progress'
          ? 'This game is already in progress — ask the host to invite you next round.'
          : 'The host turned you away.');
      });
      net.on('not_found', () => fail('Room not found — double-check the code.'));
      net.on('fatal', () => fail('Connection failed. Are you online?'));
      net.on('lost', () => fail('Could not reach the host. Try again.'));
      net.on('reconnecting', ({ attempt }) => {
        if (joined) return;
        status.textContent = `Still trying to reach the game… (attempt ${attempt})`;
        offerLog();
      });
      net.connect();
      clearTimeout(logBtnTimer);
      logBtnTimer = setTimeout(offerLog, 6000);
    }

    container.append(
      el('div', { class: 'join card' },
        el('div', { class: 'screen-head' },
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => ctx.router.go('home') }, '‹ Back'),
          el('h2', {}, 'Join a game')
        ),
        el('label', { class: 'field' }, 'Room code', codeInput),
        el('label', { class: 'field' }, 'Name', nameInput),
        el('h3', {}, 'Avatar'),
        picker.el,
        joinBtn,
        status
      )
    );

    return () => {
      // If we left the screen without completing a join, drop the connection.
      clearTimeout(logBtnTimer);
      if (!joined && net) net.leave();
    };
  },
};
