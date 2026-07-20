# CLAUDE.md

Guidance for working in this repo. See [README.md](README.md) for the full project overview.

## What this is

A config-driven online trivia game — a **plain static site with no build step**. Play solo
or host a live multiplayer quiz; players join from their phones over WebRTC (PeerJS). The
host browser tab *is* the game server. Everything about a game (questions, theme, scoring,
timing, sounds) is driven by a single JSON config.

## Always write tests for new functionality

**Any change that adds or changes behavior must come with tests.** This is not optional.

- **Prefer fast unit tests.** Extract the decision logic into a **pure, exported function**
  (no DOM, no network, no randomness baked in) and test it in `tests/unit/`. Node's built-in
  runner is used — no framework. See `tests/unit/components.test.js` for the pattern
  (pure helpers like `raceMood`/`racePosition`/`randomGait` tested directly).
- **Add an e2e assertion when the behavior is visual or wiring-level** (DOM structure,
  rendering, multiplayer flow) — extend the Playwright scenarios in `tests/e2e/`.
- When touching DOM/UI code, factor out the testable core so it can be unit-tested without a
  browser, then cover the rendering/integration in e2e.
- Run `npm test` (and `npm run test:e2e` when relevant) before considering a change done.
  Both run in CI on every PR.

## Running & testing

```
python3 -m http.server 8080     # serve locally, open http://127.0.0.1:8080/
npm test                        # unit tests (Node --test, tests/unit/*.test.js)
npx playwright install chromium # once
npm run test:e2e                # end-to-end (starts its own static + PeerJS servers)
```

The e2e suite is timing-sensitive (real WebRTC + auto-advance timers); an occasional
unrelated timeout can be a flake — re-run before assuming a regression.

## Layout

- `js/` — app logic. `game.js` (engine/phases/scoring), `net/` (host/player/protocol over
  PeerJS), `ui/screens/` (one module per screen), `ui/components.js` (shared widgets),
  `avatars.js`, `config.js`, `questions.js`.
- `css/` — `base.css`, `screens.css`, `animations.css` (keyframes; respect
  `prefers-reduced-motion`).
- `data/` — question packs + `packs.json` manifest.
- `tests/unit/`, `tests/e2e/` — see above.
- `vendor/` — bundled third-party libs (PeerJS, qrcode).

## Conventions

- Vanilla ES modules, no framework, no bundler. Build the DOM with the `el()` helper in
  `js/util.js`; never inject untrusted HTML.
- All asset URLs stay **relative** so the app works from a subpath (Pages / PR previews).
- Keep file names stable — the deploy workflow uses `keep_files: true`, so renamed/deleted
  files linger on `gh-pages`.
- Branch for changes and open a PR; don't commit directly to `main`.
