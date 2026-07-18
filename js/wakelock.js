// Screen Wake Lock: keeps the device awake while a game is in progress.
// This is the root-cause guard against phones sleeping mid-round (which drops
// the WebRTC connection and forces a reconnect). The lock is automatically
// released by the browser whenever the page is hidden, so we re-acquire it on
// every return to visibility. All calls are no-ops where the API is missing
// (older browsers, non-secure contexts) or when the request is denied.

export function createWakeLock() {
  let sentinel = null;
  let want = false;

  async function acquire() {
    if (!want || sentinel) return;
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    } catch {
      // Denied (e.g. battery saver, page not focused) — retry on next
      // visibility change. Never surface this as an error to the user.
      sentinel = null;
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') acquire();
  }

  function enable() {
    if (want) return;
    want = true;
    document.addEventListener('visibilitychange', onVisibility);
    acquire();
  }

  async function disable() {
    if (!want) return;
    want = false;
    document.removeEventListener('visibilitychange', onVisibility);
    const held = sentinel;
    sentinel = null;
    if (held) {
      try {
        await held.release();
      } catch {
        /* already released */
      }
    }
  }

  return {
    enable,
    disable,
    get wanted() {
      return want;
    },
    get held() {
      return sentinel !== null;
    },
  };
}
