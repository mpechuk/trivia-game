# Sound packs: how to download and install game sounds

The game plays eight named sound effects. The bundled files in
[`assets/sounds/`](../assets/sounds/) were synthesized for this repo
(public domain / CC0), but they are designed to be swapped out — this guide
shows where to download free packs and how to wire them in.

## The eight sound slots

| Slot | File | Plays when |
|---|---|---|
| `tick` | `assets/sounds/tick.wav` | each second of the countdown (last 10 s) |
| `tick_urgent` | `assets/sounds/tick_urgent.wav` | each of the final 5 seconds |
| `correct` | `assets/sounds/correct.wav` | your answer was right (player/solo) |
| `wrong` | `assets/sounds/wrong.wav` | your answer was wrong or time ran out |
| `reveal` | `assets/sounds/reveal.wav` | the answering window closes |
| `advance` | `assets/sounds/advance.wav` | avatars move on the race track |
| `join` | `assets/sounds/join.wav` | a player enters the lobby |
| `fanfare` | `assets/sounds/fanfare.wav` | the podium appears |

## Where to download free sounds

- **[Kenney](https://kenney.nl/assets?q=audio)** — the best first stop. The
  *Interface Sounds*, *UI Audio*, and *Music Jingles* packs are all **CC0**
  (no attribution required) and cover every slot above. Download the ZIP from
  the asset page and pick the effects you like.
- **[OpenGameArt](https://opengameart.org/art-search-advanced?field_art_licenses_tid%5B%5D=4)** —
  filter by the CC0 license; large selection of game SFX and jingles.
- **[Freesound](https://freesound.org/search/?f=license:%22Creative+Commons+0%22)** —
  huge library; filter by the *Creative Commons 0* license (a free account is
  needed to download).
- **[Pixabay Sound Effects](https://pixabay.com/sound-effects/)** — free under
  the Pixabay license (no attribution required).

Stick to CC0 / public-domain files if you don't want to manage attribution.
For CC-BY files, credit the author in your README.

## Installing a pack

### Option A — drop-in replacement (keeps the config untouched)

Replace the files in `assets/sounds/`, keeping the **same eight file names**
(`tick.wav`, `tick_urgent.wav`, `correct.wav`, `wrong.wav`, `reveal.wav`,
`advance.wav`, `join.wav`, `fanfare.wav`). The defaults are looked up by name,
so `.wav` is required for drop-ins. If your downloads are in another format,
convert them (see below) or use Option B.

### Option B — point the config at any files or URLs

Each slot in the config's `theme.sounds` block accepts a path or URL, in any
format the browser can decode (`.wav`, `.ogg`, `.mp3`):

```json
"theme": {
  "sounds": {
    "enabled": true,
    "volume": 0.6,
    "correct": "assets/sounds/my-pack/success.ogg",
    "wrong": "https://example.com/sfx/fail.mp3",
    "fanfare": "assets/sounds/my-pack/jingle-win.ogg"
  }
}
```

Slots left as `null` keep the bundled default. `"enabled": false` silences the
game entirely; `volume` is a 0–1 master level.

### Converting formats

With [ffmpeg](https://ffmpeg.org/):

```bash
# to WAV (drop-in, Option A) — 22 kHz mono keeps files small
ffmpeg -i input.ogg -ar 22050 -ac 1 assets/sounds/correct.wav

# or to OGG (smaller, Option B)
ffmpeg -i input.wav -c:a libvorbis -q:a 3 assets/sounds/my-pack/correct.ogg
```

Keep effects short (tick well under 0.15 s, most effects under 1 s, the
fanfare 2–4 s) — the tick plays every second and long effects overlap.

## Regenerating the bundled sounds

The bundled effects come from a dependency-free Python script. Tweak the
recipes (frequencies, envelopes, harmonics) and re-run:

```bash
python3 tools/generate_sounds.py
```

## A note on the original plan

These slots were designed around Kenney's CC0 packs, and that is still the
recommended upgrade path. The bundled files are synthesized stand-ins created
because the packaging environment could not reach kenney.nl — they are CC0,
so keep, remix, or replace them freely.
