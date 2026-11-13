#!/usr/bin/env python3
"""
Trilha do trailer: música original sintetizada + efeitos sonoros do jogo nos quadros
em que aconteceram (events.json gravado por record.cjs).

Uso: python3 tools/trailer/make_audio.py <pasta-da-gravacao> [saida.wav]
"""
import json
import sys
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(7)


# ---------------------------------------------------------------- síntese básica
def env_exp(n, k=5.0):
    return np.exp(-k * np.linspace(0, 1, n, endpoint=False))


def osc(f0, f1, dur, kind='sine'):
    n = int(dur * SR)
    if n <= 0:
        return np.zeros(0)
    k = np.linspace(0, 1, n, endpoint=False)
    f = f0 * (f1 / f0) ** k if f1 else np.full(n, f0)
    ph = np.cumsum(f) / SR
    p = ph - np.floor(ph)
    if kind == 'sine':
        return np.sin(2 * np.pi * p)
    if kind == 'square':
        return np.where(p < 0.5, 1.0, -1.0)
    if kind == 'saw':
        return 2 * p - 1
    return 1 - 4 * np.abs(p - 0.5)  # triângulo


def lowpass(x, f):
    """Passa-baixa de um polo; f pode ser escalar ou vetor."""
    f = np.broadcast_to(np.asarray(f, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * f / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def lowpass_fast(x, f):
    """Passa-baixa de frequência fixa (filtro IIR vetorizado com scipy se houver, senão laço)."""
    try:
        from scipy.signal import lfilter
        a = 1 - np.exp(-2 * np.pi * f / SR)
        return lfilter([a], [1, -(1 - a)], x)
    except ImportError:
        return lowpass(x, f)


def noise(dur, f0, f1=None):
    n = int(dur * SR)
    x = rng.uniform(-1, 1, n)
    if f1:
        k = np.linspace(0, 1, n, endpoint=False)
        y = lowpass(x, f0 * (f1 / f0) ** k)
    else:
        y = lowpass_fast(x, f0)
    return (y - 0.5 * np.concatenate([[0], y[:-1]])) * 1.6


def tone(f0, f1, kind, dur, vol, delay=0.0):
    x = osc(f0, f1, dur, kind) * vol * env_exp(int(dur * SR))
    return np.concatenate([np.zeros(int(delay * SR)), x])


def nz(dur, vol, f0, f1=None, delay=0.0):
    x = noise(dur, f0, f1) * vol * env_exp(int(dur * SR))
    return np.concatenate([np.zeros(int(delay * SR)), x])


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


# Mesmas receitas de src/audio.js
SFX = {
    'swing': lambda: nz(0.14, 0.25, 1200, 3500),
    'hit': lambda: mix(nz(0.1, 0.5, 600), tone(160, 60, 'square', 0.08, 0.2)),
    'crit': lambda: mix(nz(0.18, 0.6, 900), tone(900, 300, 'saw', 0.15, 0.18)),
    'parry': lambda: mix(tone(1800, 1400, 'tri', 0.4, 0.45), tone(2700, 2300, 'sine', 0.5, 0.25), nz(0.08, 0.5, 5000)),
    'parryWhiff': lambda: tone(500, 420, 'tri', 0.06, 0.12),
    'dodge': lambda: nz(0.18, 0.2, 600, 2400),
    'perfectDodge': lambda: mix(tone(300, 1200, 'sine', 0.35, 0.3), tone(600, 2400, 'sine', 0.35, 0.15, 0.05)),
    'hurt': lambda: mix(tone(220, 80, 'saw', 0.25, 0.35), nz(0.15, 0.4, 400)),
    'windup': lambda: tone(700, 1100, 'tri', 0.18, 0.1),
    'windupHeavy': lambda: tone(140, 260, 'saw', 0.3, 0.15),
    'shoot': lambda: tone(900, 300, 'square', 0.12, 0.1),
    'reflect': lambda: tone(1200, 2400, 'square', 0.12, 0.16),
    'slam': lambda: mix(nz(0.5, 0.7, 200), tone(90, 30, 'sine', 0.5, 0.5)),
    'death': lambda: mix(tone(300, 60, 'tri', 0.35, 0.2), nz(0.3, 0.25, 800, 200)),
    'stagger': lambda: mix(tone(400, 200, 'square', 0.3, 0.2), tone(600, 300, 'square', 0.3, 0.12, 0.06)),
    'pickup': lambda: mix(tone(660, None, 'sine', 0.1, 0.2), tone(990, None, 'sine', 0.16, 0.2, 0.08)),
    'door': lambda: tone(220, 660, 'sine', 0.6, 0.25),
    'clear': lambda: mix(*[tone(f, None, 'tri', 0.3, 0.18, i * 0.08) for i, f in enumerate([523, 659, 784, 1046])]),
    'explosion': lambda: nz(0.45, 0.6, 1200, 120),
    'jump': lambda: tone(250, 400, 'sine', 0.1, 0.06),
}
SFX_CACHE = {}


def sfx(name, variant=0):
    key = (name, variant)
    if key not in SFX_CACHE:
        if name == 'windup' and variant:
            SFX_CACHE[key] = SFX['windupHeavy']()
        elif name in SFX:
            SFX_CACHE[key] = SFX[name]()
        else:
            SFX_CACHE[key] = np.zeros(1)
    return SFX_CACHE[key]


def reverb(x, secs=1.8, wet=0.35):
    n = int(secs * SR)
    ir = rng.normal(0, 1, n) * np.exp(-6 * np.linspace(0, 1, n))
    ir[0] = 0
    ir /= np.sqrt(np.sum(ir ** 2)) * 6
    m = len(x) + n
    size = 1 << (m - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]
    return x * (1 - wet) + y * wet


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- instrumentos
def boom(vol=1.0):
    d = 1.6
    return tone(70, 28, 'sine', d, 0.9 * vol) + np.pad(nz(0.6, 0.5 * vol, 260), (0, int(d * SR) - int(0.6 * SR)))


def taiko(vol=1.0):
    return mix(tone(110, 48, 'sine', 0.5, 0.8 * vol), nz(0.08, 0.35 * vol, 1800))


def snare(vol=1.0):
    return mix(nz(0.18, 0.45 * vol, 3500), tone(220, 160, 'tri', 0.1, 0.2 * vol))


def hat(vol=1.0):
    x = rng.uniform(-1, 1, int(0.05 * SR))
    x = x - lowpass_fast(x, 6000)
    return x * env_exp(len(x), 9) * 0.18 * vol


def bell(f, vol=1.0, dur=4.0):
    parts = [(1, 1), (2.0, 0.6), (2.76, 0.45), (5.4, 0.25), (8.9, 0.15)]
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * (1.2 + r * 0.6)) for r, a in parts)
    return x * 0.35 * vol


def pad(freqs, dur, vol=0.2, cutoff=900):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ph = np.cumsum(np.full(n, f * 2 ** (det / 12)) * (1 + 0.002 * np.sin(2 * np.pi * 5 * t))) / SR
            x += 2 * (ph - np.floor(ph)) - 1
    x = lowpass_fast(x / (len(freqs) * 3), cutoff)
    a = np.minimum(1, t / 1.2) * np.minimum(1, (dur - t) / 0.8)
    return x * a * vol


def bass_note(f, dur, vol=0.35):
    x = osc(f, None, dur, 'saw') * 0.6 + osc(f / 2, None, dur, 'sine') * 0.7
    x = lowpass_fast(x, 420)
    n = len(x)
    e = np.minimum(1, np.arange(n) / (0.01 * SR)) * np.exp(-2.2 * np.arange(n) / n)
    return x * e * vol


def swell(dur, vol=0.3):
    """Ruído que cresce até o corte (efeito de 'sucção')."""
    n = int(dur * SR)
    k = np.linspace(0, 1, n)
    return noise(dur, 400, 5000) * (k ** 3) * vol


def place(buf, x, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= buf.shape[0] or len(x) == 0:
        return
    x = x[: buf.shape[0] - i]
    buf[i:i + len(x), 0] += x * gain * (1 - max(0, pan))
    buf[i:i + len(x), 1] += x * gain * (1 + min(0, pan))


# ---------------------------------------------------------------- trilha
def main():
    folder = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else folder + '/trailer.wav'
    info = json.load(open(folder + '/shots.json'))
    events = json.load(open(folder + '/events.json'))
    fps = info['fps']
    total = info['total'] / fps + 1.5
    shots = {s['id']: (s['start'] / fps, s['frames'] / fps) for s in info['shots']}
    music = np.zeros((int(total * SR), 2))
    fx = np.zeros_like(music)

    def t_of(sid):
        return shots[sid][0] if sid in shots else None

    # Abertura: drone em Ré menor, sinos e impactos nos cortes
    cine_end = (t_of('aparo') or 14.0)
    drone = pad([midi(38), midi(45), midi(50)], cine_end + 0.5, 0.22, 600)
    place(music, drone, 0)
    place(music, pad([midi(62), midi(65), midi(69)], cine_end - 2, 0.07, 1500), 2.0)
    place(music, bell(midi(62), 1.0, 5), 0.4, pan=-0.2)
    place(music, bell(midi(57), 0.7, 5), 2.9, pan=0.2)
    for sid in ('arauto', 'mestre'):
        t = t_of(sid)
        if t is not None:
            place(music, boom(0.9), t)
            place(music, swell(0.8, 0.18), t - 0.8)
    if t_of('arauto') is not None:
        place(music, bell(midi(50), 0.9, 4), t_of('arauto') + 0.05)

    # Gameplay: percussão a 96 bpm + baixo ostinato, com tudo indo até o chefe
    bpm = 96
    beat = 60 / bpm
    g_start = cine_end
    g_end = t_of('arvore') or (total - 9)
    place(music, boom(1.1), g_start)
    place(music, swell(1.0, 0.25), g_start - 1.0)
    bass_seq = [38, 38, 41, 38, 36, 38, 43, 41]
    t = g_start
    i = 0
    boss_t = t_of('chefe') or g_end
    while t < g_end - 0.05:
        intense = 1.25 if t >= boss_t else 1.0
        b = i % 8
        if b in (0, 3, 6) or (intense > 1 and b in (5,)):
            place(music, taiko(0.9 * intense), t, pan=-0.1)
        if b in (2, 6):
            place(music, snare(0.8 * intense), t, pan=0.1)
        place(music, hat(1.0), t, pan=0.3)
        place(music, hat(0.6), t + beat / 2, pan=0.3)
        if i % 2 == 0:
            place(music, bass_note(midi(bass_seq[(i // 2) % 8]), beat * 2, 0.3 * intense), t)
        t += beat
        i += 1
    place(music, pad([midi(50), midi(53), midi(57)], g_end - g_start, 0.06, 1200), g_start)
    for sid in ('esquiva', 'mago', 'tempestade', 'punhos', 'flechas', 'chefe'):
        if t_of(sid) is not None:
            place(music, boom(0.7), t_of(sid))
    if t_of('chefe') is not None:
        place(music, pad([midi(38), midi(44)], shots['chefe'][1], 0.12, 500), t_of('chefe'))

    # Árvore e encerramento: respiro e sino final
    if t_of('arvore') is not None:
        place(music, pad([midi(50), midi(57), midi(62), midi(65)], shots['arvore'][1] + 1, 0.12, 1400), t_of('arvore'))
    if t_of('fim') is not None:
        tf = t_of('fim')
        place(music, swell(1.0, 0.3), tf - 1.0)
        place(music, boom(1.3), tf)
        place(music, bell(midi(50), 1.2, 6), tf + 0.02, pan=-0.1)
        place(music, bell(midi(57), 0.8, 6), tf + 0.02, pan=0.1)
        place(music, pad([midi(38), midi(50), midi(57), midi(62)], shots['fim'][1] + 1.0, 0.16, 900), tf)

    # Efeitos do jogo, nos quadros em que aconteceram
    gains = {'windup': 0.5, 'swing': 0.6, 'shoot': 0.5, 'parryWhiff': 0.5, 'jump': 0.4}
    last = {}
    for e in events:
        t = e['f'] / fps
        name = e['s']
        if last.get(name, -1) > t - 0.035:
            continue  # evita empilhar o mesmo som no mesmo instante
        last[name] = t
        place(fx, sfx(name, e.get('a', 0)), t, gains.get(name, 0.8), pan=float(rng.uniform(-0.25, 0.25)))

    music[:, 0] = reverb(music[:, 0], 2.2, 0.3)
    music[:, 1] = reverb(music[:, 1], 2.3, 0.3)
    fx[:, 0] = reverb(fx[:, 0], 0.9, 0.15)
    fx[:, 1] = reverb(fx[:, 1], 0.9, 0.15)
    master = music * 0.9 + fx * 0.75
    # Fim suave e limitador
    n = len(master)
    fade = np.ones(n)
    fl = int(1.2 * SR)
    fade[-fl:] = np.linspace(1, 0, fl)
    master *= fade[:, None]
    master = np.tanh(master * 1.3) / np.tanh(1.3)
    master /= max(1e-6, np.abs(master).max()) / 0.95
    pcm = (master * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print('áudio:', out, f'{n / SR:.1f}s')


if __name__ == '__main__':
    main()
