// Efeitos sonoros sintetizados com WebAudio (sem arquivos externos).
let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

function tone({ freq = 440, freq2 = null, type = 'sine', dur = 0.15, vol = 0.5, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noise({ dur = 0.15, vol = 0.4, filter = 2000, q = 1, type = 'bandpass', delay = 0, sweep = null }) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(filter, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

export const sfx = {
  swing() { noise({ dur: 0.14, vol: 0.25, filter: 1200, sweep: 3500, q: 0.8 }); },
  hit() { noise({ dur: 0.1, vol: 0.5, filter: 600, type: 'lowpass' }); tone({ freq: 160, freq2: 60, type: 'square', dur: 0.08, vol: 0.2 }); },
  crit() { noise({ dur: 0.18, vol: 0.6, filter: 900, type: 'lowpass' }); tone({ freq: 900, freq2: 300, type: 'sawtooth', dur: 0.15, vol: 0.18 }); },
  parry() {
    tone({ freq: 1800, freq2: 1400, type: 'triangle', dur: 0.4, vol: 0.45 });
    tone({ freq: 2700, freq2: 2300, type: 'sine', dur: 0.5, vol: 0.25 });
    noise({ dur: 0.08, vol: 0.5, filter: 5000, q: 2 });
  },
  parryWhiff() { tone({ freq: 500, freq2: 420, type: 'triangle', dur: 0.06, vol: 0.12 }); },
  dodge() { noise({ dur: 0.18, vol: 0.2, filter: 600, sweep: 2400, q: 0.6 }); },
  perfectDodge() { tone({ freq: 300, freq2: 1200, type: 'sine', dur: 0.35, vol: 0.3 }); tone({ freq: 600, freq2: 2400, type: 'sine', dur: 0.35, vol: 0.15, delay: 0.05 }); },
  hurt() { tone({ freq: 220, freq2: 80, type: 'sawtooth', dur: 0.25, vol: 0.35 }); noise({ dur: 0.15, vol: 0.4, filter: 400, type: 'lowpass' }); },
  windup(unparryable) {
    if (unparryable) tone({ freq: 140, freq2: 260, type: 'sawtooth', dur: 0.3, vol: 0.18 });
    else tone({ freq: 700, freq2: 1100, type: 'triangle', dur: 0.18, vol: 0.12 });
  },
  shoot() { tone({ freq: 900, freq2: 300, type: 'square', dur: 0.12, vol: 0.12 }); },
  reflect() { tone({ freq: 1200, freq2: 2400, type: 'square', dur: 0.12, vol: 0.18 }); },
  slam() { noise({ dur: 0.5, vol: 0.7, filter: 200, type: 'lowpass' }); tone({ freq: 90, freq2: 30, type: 'sine', dur: 0.5, vol: 0.5 }); },
  death() { tone({ freq: 300, freq2: 60, type: 'triangle', dur: 0.35, vol: 0.2 }); noise({ dur: 0.3, vol: 0.25, filter: 800, sweep: 200 }); },
  stagger() { tone({ freq: 400, freq2: 200, type: 'square', dur: 0.3, vol: 0.2 }); tone({ freq: 600, freq2: 300, type: 'square', dur: 0.3, vol: 0.12, delay: 0.06 }); },
  pickup() { tone({ freq: 660, type: 'sine', dur: 0.1, vol: 0.2 }); tone({ freq: 990, type: 'sine', dur: 0.16, vol: 0.2, delay: 0.08 }); },
  door() { tone({ freq: 220, freq2: 660, type: 'sine', dur: 0.6, vol: 0.25 }); },
  clear() { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.18, delay: i * 0.08 })); },
  explosion() { noise({ dur: 0.45, vol: 0.6, filter: 1200, sweep: 120, type: 'lowpass' }); },
  jump() { tone({ freq: 250, freq2: 400, type: 'sine', dur: 0.1, vol: 0.08 }); },
};
