// Small shared helpers. No DOM state, no globals.

/** Create a DOM element. Children are appended as nodes or text (never HTML). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

/** In-place Fisher-Yates shuffle; returns the same array. */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Random sample of n items (n may exceed arr.length). */
export function sampleN(arr, n) {
  return shuffle(arr.slice()).slice(0, n);
}

export function createEmitter() {
  const listeners = new Map();
  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    emit(event, data) {
      listeners.get(event)?.forEach((fn) => {
        try {
          fn(data);
        } catch (err) {
          console.error(`listener for "${event}" failed`, err);
        }
      });
    },
    clear() {
      listeners.clear();
    },
  };
}

/** Deep-merge plain objects; src wins, arrays and scalars are replaced wholesale. */
export function deepMerge(base, src) {
  if (!isPlainObject(base) || !isPlainObject(src)) {
    return src === undefined ? base : src;
  }
  const out = { ...base };
  for (const [k, v] of Object.entries(src)) {
    out[k] = deepMerge(base[k], v);
  }
  return out;
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

export function formatSeconds(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '∞';
  const s = Math.max(0, Math.ceil(totalSeconds));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
}
