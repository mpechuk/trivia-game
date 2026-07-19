# Trivia Game

A config-driven online trivia game — play solo or host a live multiplayer quiz where
friends join from their phones. Live at **https://mpechuk.github.io/trivia-game/**

Everything about a game — questions, categories, difficulty, colors, fonts, answer-button
palette, sounds, timing, scoring — is driven by a single JSON configuration file
(see [`data/fifa_world_cup_2026_trivia.json`](data/fifa_world_cup_2026_trivia.json)).

## How to play

On the home screen, first **choose a question pack** — pick one of the built-in packs
(listed from [`data/packs.json`](data/packs.json)) or **upload your own** `.json` pack.
Solo and hosting unlock once a pack is loaded; joining a game never needs one (players
mirror the host's pack over the network).

### Solo
**Play solo** → pick length, difficulty mix, categories, timer → answer on the same screen.

### Multiplayer
1. **Host multiplayer** on a big screen (TV/laptop). Configure the game and create a room.
2. Players open the site on their phones and **Join a game** with the room code — or scan
   the QR code in the lobby. Each player picks a name and an avatar (emoji or a generated
   [DiceBear](https://www.dicebear.com/) avatar).
3. The host screen shows the question, the multiple-choice answers, and the standings.
   Player phones show only big colored answer buttons (with the answer text repeated small).
4. When the countdown ends (or everyone answered), the correct answer is revealed and the
   avatars advance in the virtual **run** toward the finish flag. Podium + confetti at the end.

Multiplayer is fully serverless: browsers talk directly to the host tab over WebRTC
([PeerJS](https://peerjs.com/)); only the initial handshake uses the free PeerJS cloud broker.
The host tab must stay open — it *is* the game server.

### Scoring (the "run")
- **Correct**: `(base_points + speed_bonus) × difficulty_multiplier` — answering faster and
  taking harder questions moves you further.
- **Wrong**: a penalty scaled by how *fast* you answered — reckless guessing moves you
  **backwards** (a last-second wrong guess costs ~0).
- **No answer**: 0. Scores never drop below 0. With no time limit, speed bonuses and
  penalties are disabled.

All numbers are configurable (`game_defaults.scoring`, plus an "Advanced scoring" panel in setup).

## Make your own quiz

Create a JSON file with the shape below, then use it any of three ways:

- **Upload it** on the home screen (**Upload your own pack**) — nothing to deploy.
- **List it as a built-in pack**: drop the file in `data/` and add an entry to
  [`data/packs.json`](data/packs.json) (`file`, `name`, `emoji`, `description`) so it
  appears as a card in the pack chooser.
- **Deep-link it** via `?config=` (the pack is preselected on load):

```
https://mpechuk.github.io/trivia-game/?config=data/my_quiz.json
```

Minimal question shape (4 `wrong_answers` recommended; 1–4 supported):

```json
{
  "title": "My Quiz",
  "questions": [
    {
      "id": 1,
      "category": "Science",
      "difficulty": 1,
      "question": "…?",
      "answer": "Right answer",
      "wrong_answers": ["No", "Nope", "Nah", "Never"],
      "photo_link": "https://… (optional)",
      "answer_photo": null
    }
  ]
}
```

Two optional blocks drive look & behavior (all fields have defaults; see the FIFA file for a
complete example):

- **`theme`** — `emoji` (page icon), `font_family`, `colors` (background/gradient, surface,
  text, primary, accent, correct, wrong, timer), `answer_buttons` (per-button `color` +
  `shape` glyph), `background_image`, and `sounds` (enable/volume, or per-sound URL
  overrides: `tick`, `tick_urgent`, `correct`, `wrong`, `reveal`, `advance`, `join`, `fanfare`).
- **`game_defaults`** — `question_count`, `time_per_question_seconds` (`null` = no limit),
  `choices_per_question` (2–5), `difficulty_mix` (`balanced` | `easy_ride` | `hardcore` |
  `custom`), `categories`, `question_order` (`ramp` | `shuffled`), `scoring`
  (`base_points`, `max_speed_bonus`, `difficulty_multiplier` per level, `wrong_penalty_max`,
  `min_score`), and `network.peer_config`.

`network.peer_config` accepts PeerJS options (`host`, `port`, `path`, `secure`, `key`,
`config.iceServers`) to use a self-hosted [PeerServer](https://github.com/peers/peerjs-server)
or your own TURN relay — see the connectivity section below.

## Multiplayer connectivity & debugging

Players connect straight to the host's browser tab over WebRTC. When a player is on a
different network than the host — typically a phone on cellular data — the connection may
need a TURN relay: carrier-grade NAT often can't be traversed with STUN alone. **There are
no free public TURN servers left** (the relays PeerJS ships as defaults have dead DNS, and
Open Relay rejects every port — verified July 2026), so by default the game uses live public
STUN servers only, which covers the friendlier NAT combinations.

To see exactly where a connection fails, add `?debug=1` to the URL **before hosting**
(e.g. `https://…/trivia-game/?debug=1`). An on-screen log panel appears for the host and —
because the lobby QR/join link carries the flag — on players' phones too, showing broker
registration, ICE candidates (`host`/`srflx`/`relay`), state changes, and which candidate
pair finally connected. `ice state: failed` after only `host`/`srflx` candidates means this
network pair requires TURN.

To add TURN, get free-tier credentials (e.g. [metered.ca](https://www.metered.ca/stun-turn)
or [expressturn.com](https://www.expressturn.com), or self-hosted
[coturn](https://github.com/coturn/coturn)) and put them in your pack — prefer an endpoint
on `:443?transport=tcp`, which passes the most restrictive networks:

```json
"game_defaults": {
  "network": {
    "peer_config": {
      "config": {
        "iceServers": [
          { "urls": "stun:stun.l.google.com:19302" },
          { "urls": "turn:YOUR_TURN_HOST:443?transport=tcp",
            "username": "USER", "credential": "SECRET" }
        ]
      }
    }
  }
}
```

Configuring the **host alone is enough** for most cases: a relay candidate on either side is
publicly reachable by the other. Players who join via the lobby QR/link inherit the host's
config automatically (the link carries `?config=`).

## Development

Plain static files — no build step (GitHub Pages deploys the repo root as-is):

```
python3 -m http.server 8080     # then open http://127.0.0.1:8080/
```

To test multiplayer locally without the PeerJS cloud, run `npx peerjs --port 9100` and point
`game_defaults.network.peer_config` at `{"host":"127.0.0.1","port":9100,"path":"/","secure":false}`.

### Tests

Unit tests (game engine, scoring, question sampling, wire protocol, avatars, config
merging — Node's built-in test runner) and Playwright end-to-end tests (solo games on
both timer paths, a full multiplayer game over a local PeerServer including reconnects,
disconnects, late-join rejection and play-again, JSON-driven theming, subpath serving).
Both run in CI on every PR (`.github/workflows/test.yml`).

```
npm install
npm test                                  # unit tests
npx playwright install chromium           # once
npm run test:e2e                          # end-to-end (starts its own servers)
```

### Sounds

The eight bundled effects in `assets/sounds/` are CC0 and swappable — see
[docs/SOUND_PACKS.md](docs/SOUND_PACKS.md) for where to download free sound packs
(Kenney, OpenGameArt, Freesound…) and how to wire them in, and
`tools/generate_sounds.py` to regenerate the bundled ones.

Notes:
- All asset URLs are relative, so the app works from a subpath (Pages, PR previews).
- The deploy workflow uses `keep_files: true` — renamed/deleted files linger on
  `gh-pages`; prefer stable file names.

## Credits

- [PeerJS](https://peerjs.com/) (MIT) — WebRTC data channels, `vendor/peerjs.min.js`.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) — lobby QR code, `vendor/qrcode.js`.
- [DiceBear](https://www.dicebear.com/) — free avatar HTTP API (styles by their respective artists).
- Question photos in the sample dataset use flag images from [flagcdn.com](https://flagcdn.com/).
- Sound effects in `assets/sounds/` were synthesized specifically for this project
  (public domain / CC0 — use them however you like). Swap in downloaded packs via
  [docs/SOUND_PACKS.md](docs/SOUND_PACKS.md).
