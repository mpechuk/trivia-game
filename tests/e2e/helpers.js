// Shared infrastructure for the end-to-end tests: static file servers, a
// local PeerServer (so tests don't depend on the public PeerJS cloud), test
// config generation, and browser/console-error plumbing.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const HTTP_PORT = 8080;
export const SUBPATH_PORT = 8082;
export const PEER_PORT = 9100;
export const BASE = `http://127.0.0.1:${HTTP_PORT}/?config=data/test_config.local.json`;
export const THEME_BASE = `http://127.0.0.1:${HTTP_PORT}/?config=data/theme_test.local.json`;
export const TURN_BASE = `http://127.0.0.1:${HTTP_PORT}/?config=data/turn_test.local.json`;
export const SUBPATH_URL = `http://127.0.0.1:${SUBPATH_PORT}/trivia-game/`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** Tiny static file server; `prefix` simulates GitHub Pages subpath hosting. */
export function staticServer({ root, port, prefix = '/' }) {
  const rootAbs = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!path.startsWith(prefix)) {
        res.writeHead(404);
        return res.end('outside prefix');
      }
      path = path.slice(prefix.length);
      if (path === '' || path.endsWith('/')) path += 'index.html';
      // The developer's real TURN credentials (git-ignored) must not leak
      // into tests — scenarios control TURN via their generated pack configs.
      if (path === 'data/turn.local.json') {
        res.writeHead(404);
        return res.end('not served in tests');
      }
      const file = resolve(rootAbs, path);
      if (!file.startsWith(rootAbs)) {
        res.writeHead(403);
        return res.end();
      }
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((ok, err) => {
    server.on('error', err);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}

export async function startPeerServer() {
  const { PeerServer } = await import('peer');
  return PeerServer({ port: PEER_PORT, host: '127.0.0.1', path: '/' });
}

/** Generate the git-ignored *.local.json configs the tests load. */
export async function generateConfigs() {
  const src = JSON.parse(
    await readFile(resolve(REPO_ROOT, 'data/fifa_world_cup_2026_trivia.json'), 'utf8')
  );
  const testCfg = structuredClone(src);
  testCfg.game_defaults.network.peer_config = {
    host: '127.0.0.1', port: PEER_PORT, path: '/', secure: false, key: 'peerjs',
  };
  await writeFile(
    resolve(REPO_ROOT, 'data/test_config.local.json'), JSON.stringify(testCfg), 'utf8'
  );

  // Same local-broker setup plus a (fake) TURN relay in the pack config —
  // exercises the "relay configured" UI states without touching the network.
  const turnCfg = structuredClone(testCfg);
  turnCfg.game_defaults.network.peer_config.config = {
    iceServers: [
      { urls: 'turn:turn.invalid:3478', username: 'test', credential: 'test' },
    ],
  };
  await writeFile(
    resolve(REPO_ROOT, 'data/turn_test.local.json'), JSON.stringify(turnCfg), 'utf8'
  );

  const themeCfg = structuredClone(testCfg);
  themeCfg.title = 'Theme Test Quiz';
  themeCfg.theme.colors.primary = '#ff00aa';
  themeCfg.theme.font_family = 'Georgia, serif';
  themeCfg.theme.answer_buttons[0].color = '#111111';
  await writeFile(
    resolve(REPO_ROOT, 'data/theme_test.local.json'), JSON.stringify(themeCfg), 'utf8'
  );
}

export async function launchBrowser() {
  const { chromium } = await import('playwright');
  // CHROMIUM_PATH lets environments with a pre-provisioned browser skip
  // `playwright install`; CI leaves it unset and uses the default cache.
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}

/** Collect page JS errors. Failed resource loads (blocked flagcdn/dicebear in
 *  sandboxes) are expected and handled by in-app fallbacks, so not errors. */
export function watch(page, name, errors) {
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (m.text().includes('Failed to load resource')) return;
    errors.push(`[${name}] console: ${m.text()}`);
  });
}

export async function setupGame(page, { count = '3', timer = '10' } = {}) {
  await page.locator('input.slider').first().fill(count);
  await page.locator('select.input').first().selectOption(timer);
}
