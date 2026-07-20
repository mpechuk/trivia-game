// Tiny hash router. Routes look like "#/name" or "#/name/arg".
// Screens are { mount(container, ctx, arg) -> cleanupFn | undefined }.

export function createRouter(container, ctx) {
  const routes = new Map();
  let cleanup = null;

  function register(name, screen) {
    routes.set(name, screen);
  }

  function parse() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [name, ...rest] = hash.split('/');
    return { name: name || 'home', arg: rest.length ? decodeURIComponent(rest.join('/')) : null };
  }

  function go(name, arg) {
    location.hash = arg ? `#/${name}/${encodeURIComponent(arg)}` : `#/${name}`;
  }

  function render() {
    const { name, arg } = parse();
    const screen = routes.get(name) || routes.get('home');
    if (cleanup) {
      try {
        cleanup();
      } catch (err) {
        console.error('screen cleanup failed', err);
      }
      cleanup = null;
    }
    container.replaceChildren();
    container.className = `screen screen-${routes.has(name) ? name : 'home'}`;
    cleanup = screen.mount(container, ctx, arg) || null;
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  return { register, go, render, parse };
}
