// Tiny synthesized sound effects (no audio files).
let ac = null;
export let muted = false;
try { muted = localStorage.getItem('tc-muted') === '1'; } catch { /* storage unavailable */ }

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('tc-muted', m ? '1' : '0'); } catch { /* ignore */ }
}

function ctx() {
  if (muted) return null;
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, dur, { type = 'square', vol = 0.05, to = null, delay = 0 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, freq = 800, q = 0.8 } = {}) {
  const a = ctx(); if (!a) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let n = 0; n < d.length; n++) d[n] = (Math.random() * 2 - 1) * (1 - n / d.length);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export function gobble(pitch = 1, vol = 0.09) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), g = a.createGain(), f = a.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(560 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(320 * pitch, t + 0.5);
  lfo.type = 'square'; lfo.frequency.value = 24; lg.gain.value = 160;
  lfo.connect(lg).connect(o.frequency);
  f.type = 'lowpass'; f.frequency.value = 1800;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  o.connect(f).connect(g).connect(a.destination);
  o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
}

export const sfx = {
  corn: () => { tone(880, 0.08, { vol: 0.04 }); tone(1320, 0.12, { vol: 0.04, delay: 0.08 }); },
  hit: () => { noise(0.35, { vol: 0.5, freq: 300 }); tone(180, 0.3, { vol: 0.06, to: 60 }); },
  honk: () => { tone(415, 0.28, { vol: 0.035 }); tone(330, 0.28, { vol: 0.035 }); },
  flap: () => noise(0.15, { vol: 0.15, freq: 500, q: 0.6 }),
  splash: () => noise(0.5, { vol: 0.3, freq: 1400, q: 0.5 }),
  discover: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { vol: 0.045, delay: i * 0.1 })),
  blip: () => tone(660, 0.04, { vol: 0.025 }),
  faint: () => [440, 392, 330, 262].forEach((f, i) => tone(f, 0.2, { vol: 0.05, delay: i * 0.16 })),
  chomp: () => { noise(0.08, { vol: 0.45, freq: 1800, q: 1.5 }); tone(140, 0.12, { vol: 0.08, to: 70 }); },
  scream: () => {
    const f = 700 + Math.random() * 500;
    tone(f, 0.45, { type: 'sawtooth', vol: 0.025, to: f * 1.4 });
    tone(f * 1.01, 0.45, { type: 'square', vol: 0.015, to: f * 0.8, delay: 0.05 });
  },
  boom: () => { noise(0.7, { vol: 0.7, freq: 120, q: 0.4 }); tone(90, 0.6, { vol: 0.12, to: 35 }); },
  whoosh: () => noise(0.4, { vol: 0.25, freq: 2200, q: 0.3 }),
  rampage: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'sawtooth', vol: 0.04, delay: i * 0.08 })),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.16, { vol: 0.05, delay: i * 0.1 })),
  busted: () => [659, 523, 415, 330].forEach((f, i) => tone(f, 0.3, { type: 'sawtooth', vol: 0.04, delay: i * 0.22 })),
  star: () => tone(1200, 0.12, { vol: 0.04, to: 1800 }),
  unlock: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, { vol: 0.05, delay: i * 0.12 })),
};

// Two-tone police siren that runs while cruisers are chasing.
let siren = null;
export function setSiren(on) {
  if (on && !siren) {
    const a = ctx(); if (!a) return;
    const o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), g = a.createGain();
    o.type = 'square'; o.frequency.value = 750;
    lfo.type = 'square'; lfo.frequency.value = 1.6; lg.gain.value = 150;
    lfo.connect(lg).connect(o.frequency);
    g.gain.value = 0.018;
    o.connect(g).connect(a.destination);
    o.start(); lfo.start();
    siren = { o, lfo };
  } else if (!on && siren) {
    siren.o.stop(); siren.lfo.stop();
    siren = null;
  }
}
