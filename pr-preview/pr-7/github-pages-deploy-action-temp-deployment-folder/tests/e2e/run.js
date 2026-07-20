// E2E orchestrator: provisions the infrastructure (static servers, local
// PeerServer, generated test configs), then runs every scenario module.
//
//   npm run test:e2e
//
// Requires a Playwright chromium (npx playwright install chromium), or set
// CHROMIUM_PATH to an existing chromium binary.
import {
  HTTP_PORT,
  REPO_ROOT,
  SUBPATH_PORT,
  generateConfigs,
  startPeerServer,
  staticServer,
} from './helpers.js';
import { run as runCore } from './core.e2e.js';
import { run as runFeatures } from './features.e2e.js';

const SCENARIOS = [
  ['core gameplay (solo + multiplayer)', runCore],
  ['features (theme, reconnect, play-again, subpath)', runFeatures],
];

await generateConfigs();
await staticServer({ root: REPO_ROOT, port: HTTP_PORT });
await staticServer({ root: REPO_ROOT, port: SUBPATH_PORT, prefix: '/trivia-game/' });
await startPeerServer();
console.log('infra up: http :%d, subpath :%d, peer :9100\n', HTTP_PORT, SUBPATH_PORT);

let failed = false;
for (const [name, run] of SCENARIOS) {
  console.log(`▶ ${name}`);
  const errors = [];
  try {
    await run(errors);
  } catch (err) {
    failed = true;
    console.error(`✗ ${name} FAILED:`, err.message);
  }
  if (errors.length) {
    failed = true;
    console.error(`✗ ${name} — JS errors on pages:`);
    errors.forEach((e) => console.error('  -', e));
  }
  console.log('');
}

console.log(failed ? 'E2E: FAILED' : 'E2E: ALL SCENARIOS PASSED');
process.exit(failed ? 1 : 0);
