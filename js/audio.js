// Sound effects. Plays bundled WAV files (assets/sounds/*.wav); any of them
// can be overridden with a URL in the config's theme.sounds block.
// The AudioContext is created/resumed on the first user gesture (iOS rule).

const SOUND_NAMES = [
  'tick',
  'tick_urgent',
  'correct',
  'wrong',
  'reveal',
  'advance',
  'join',
  'fanfare',
];

export function createAudio(soundsConfig = {}, basePath = 'assets/sounds/') {
  const enabled = soundsConfig.enabled !== false;
  const baseVolume = typeof soundsConfig.volume === 'number' ? soundsConfig.volume : 0.6;
  let muted = localStorage.getItem('trivia_muted') === '1';
  let audioCtx = null;
  const buffers = new Map();

  function urlFor(name) {
    return typeof soundsConfig[name] === 'string' && soundsConfig[name]
      ? soundsConfig[name]
      : `${basePath}${name}.wav`;
  }

  async function load(name) {
    if (!audioCtx || buffers.has(name)) return;
    buffers.set(name, null); // in-flight marker
    try {
      const res = await fetch(urlFor(name));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await audioCtx.decodeAudioData(await res.arrayBuffer());
      buffers.set(name, buf);
    } catch (err) {
      console.warn(`sound "${name}" unavailable:`, err.message || err);
    }
  }

  function unlock() {
    if (!enabled) return;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      SOUND_NAMES.forEach(load);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function play(name, gain = 1) {
    if (!enabled || muted || !audioCtx) return;
    const buffer = buffers.get(name);
    if (!buffer) return;
    const src = audioCtx.createBufferSource();
    const g = audioCtx.createGain();
    g.gain.value = baseVolume * gain;
    src.buffer = buffer;
    src.connect(g);
    g.connect(audioCtx.destination);
    src.start();
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem('trivia_muted', muted ? '1' : '0');
    return muted;
  }

  // Any first interaction unlocks audio; keep listening in case the first
  // gesture happened before the context could start.
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  return {
    play,
    toggleMute,
    unlock,
    get muted() {
      return muted;
    },
  };
}
