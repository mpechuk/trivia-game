#!/usr/bin/env python3
"""Regenerate the game's bundled sound effects (assets/sounds/*.wav).

Pure-stdlib synthesis (wave + math) — no dependencies. The generated files are
original works dedicated to the public domain (CC0). Tweak the recipes below
and re-run to reshape the game's sounds, or replace the files entirely with a
downloaded pack (see docs/SOUND_PACKS.md).

Usage:  python3 tools/generate_sounds.py
"""
import math
import random
import struct
import wave
from pathlib import Path

SR = 22050
OUT = Path(__file__).resolve().parents[1] / "assets" / "sounds"
random.seed(2026)


def render(dur):
    return [0.0] * int(SR * dur)


def add_tone(buf, freq, t0, dur, amp=0.5, harmonics=((1, 1.0),), attack=0.008,
             decay=None, vibrato_hz=0.0, vibrato_depth=0.0):
    """Additive tone with exponential decay envelope, mixed into buf at t0."""
    n0 = int(t0 * SR)
    n = int(dur * SR)
    decay = decay if decay is not None else dur
    for i in range(n):
        if n0 + i >= len(buf):
            break
        t = i / SR
        env = min(1.0, t / attack) * math.exp(-3.0 * t / decay)
        f = freq
        if vibrato_hz:
            f *= 1.0 + vibrato_depth * math.sin(2 * math.pi * vibrato_hz * t)
        s = 0.0
        for mult, hamp in harmonics:
            s += hamp * math.sin(2 * math.pi * f * mult * t)
        buf[n0 + i] += amp * env * s


def add_sweep_noise(buf, t0, dur, f_start, f_end, amp=0.5, q=0.25):
    """Band-passed white noise, center frequency swept f_start → f_end
    (Chamberlin state-variable filter, band output)."""
    n0 = int(t0 * SR)
    n = int(dur * SR)
    low = band = 0.0
    for i in range(n):
        if n0 + i >= len(buf):
            break
        frac = i / n
        fc = f_start + (f_end - f_start) * frac
        f = 2.0 * math.sin(math.pi * min(fc, SR * 0.45) / SR)
        x = random.uniform(-1, 1)
        low += f * band
        high = x - low - q * band
        band += f * high
        env = math.sin(math.pi * frac) ** 0.7  # smooth rise and fall
        buf[n0 + i] += amp * env * band


def fade_edges(buf, ms=4):
    n = int(SR * ms / 1000)
    for i in range(min(n, len(buf))):
        g = i / n
        buf[i] *= g
        buf[-1 - i] *= g


def write_wav(name, buf, peak=0.85):
    m = max(1e-9, max(abs(s) for s in buf))
    scale = peak / m
    fade_edges(buf)
    data = b"".join(
        struct.pack("<h", int(max(-1.0, min(1.0, s * scale)) * 32767)) for s in buf
    )
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(f"{name}: {len(buf)/SR:.2f}s {(OUT/name).stat().st_size//1024}KB")


BRIGHT = ((1, 1.0), (2, 0.45), (3, 0.2), (4, 0.08))
SOFT = ((1, 1.0), (2, 0.25))
BRASS = ((1, 1.0), (2, 0.6), (3, 0.45), (4, 0.3), (5, 0.15), (6, 0.08))

C5, D5, E5, G5, A5, C6, E6, G4, C4 = 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1318.5, 392.0, 261.63

# tick — short woodblock-like blip (played each second of the countdown)
buf = render(0.07)
add_tone(buf, 1050, 0, 0.07, amp=0.9, harmonics=SOFT, attack=0.002, decay=0.035)
write_wav("tick.wav", buf)

# tick_urgent — higher double-blip for the last seconds
buf = render(0.12)
add_tone(buf, 1500, 0.0, 0.05, amp=0.9, harmonics=SOFT, attack=0.002, decay=0.03)
add_tone(buf, 1500, 0.06, 0.05, amp=0.8, harmonics=SOFT, attack=0.002, decay=0.03)
write_wav("tick_urgent.wav", buf)

# correct — bright rising arpeggio chime
buf = render(0.85)
for i, (f, t) in enumerate([(C5, 0.0), (E5, 0.09), (G5, 0.18), (C6, 0.27)]):
    add_tone(buf, f, t, 0.55, amp=0.55 - 0.05 * i, harmonics=BRIGHT, decay=0.5)
write_wav("correct.wav", buf)

# wrong — descending two-tone womp with detuned roughness
buf = render(0.6)
for det in (1.0, 1.012):
    add_tone(buf, 233.1 * det, 0.0, 0.28, amp=0.45, harmonics=BRASS, attack=0.01, decay=0.35)
    add_tone(buf, 174.6 * det, 0.22, 0.38, amp=0.5, harmonics=BRASS, attack=0.01, decay=0.4)
write_wav("wrong.wav", buf)

# reveal — rising noise sweep into a ding (drumroll-swish before the answer)
buf = render(0.9)
add_sweep_noise(buf, 0.0, 0.55, 300, 3200, amp=0.7)
add_tone(buf, A5, 0.55, 0.35, amp=0.6, harmonics=BRIGHT, decay=0.35)
write_wav("reveal.wav", buf)

# advance — whoosh for avatars moving on the race track
buf = render(0.5)
add_sweep_noise(buf, 0.0, 0.5, 350, 2600, amp=0.9)
write_wav("advance.wav", buf)

# join — friendly two-note pop when a player enters the lobby
buf = render(0.45)
add_tone(buf, E5, 0.0, 0.2, amp=0.55, harmonics=SOFT, decay=0.18)
add_tone(buf, A5, 0.12, 0.3, amp=0.6, harmonics=SOFT, decay=0.28)
write_wav("join.wav", buf)

# fanfare — brass-like flourish and sustained major chord for the podium
buf = render(2.6)
seq = [(G4, 0.00, 0.16), (C5, 0.14, 0.16), (E5, 0.28, 0.16), (G5, 0.42, 0.30),
       (E5, 0.72, 0.14), (G5, 0.86, 0.75)]
for f, t, d in seq:
    add_tone(buf, f, t, d, amp=0.42, harmonics=BRASS, attack=0.012, decay=max(d, 0.2),
             vibrato_hz=5.5, vibrato_depth=0.004)
for f in (C4, C5, E5, G5, C6):
    add_tone(buf, f, 1.05, 1.5, amp=0.26, harmonics=BRASS, attack=0.02, decay=1.4,
             vibrato_hz=5.0, vibrato_depth=0.005)
add_sweep_noise(buf, 0.95, 0.35, 800, 4000, amp=0.25)  # cymbal-ish shimmer
write_wav("fanfare.wav", buf)

print("done")
