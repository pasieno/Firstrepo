/**
 * Pasrally 2000 — arcade chiptune (Web Audio, no samples)
 * menu: title-screen groove · race: harder looping rally
 */
(function () {
  'use strict';

  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(note) {
    if (!note || note === '-') return 0;
    const m = String(note).match(/^([A-G])([#b]?)(\d)$/);
    if (!m) return 0;
    let semi = SEMI[m[1]];
    if (m[2] === '#') semi += 1;
    if (m[2] === 'b') semi -= 1;
    const midi = (parseInt(m[3], 10) + 1) * 12 + semi;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let timer = null;
  let step = 0;
  let mode = 'menu';
  let muted = false;
  let unlocked = false;

  try {
    muted = localStorage.getItem('pasrally2000_mute') === '1';
  } catch (e) { /* ignore */ }

  const MENU = {
    bpm: 118,
    steps: 16,
    kick:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
    hat:   [0,0,1,0, 0,0,1,0, 0,1,1,0, 0,0,1,1],
    bass:  ['A2',null,'A2','E2', 'A2',null,'C3','E2',
            'F2',null,'F2','C2', 'F2',null,'A2','C3',
            'C3',null,'C3','G2', 'C3',null,'E3','G2',
            'G2',null,'G2','D2', 'G2',null,'B2','D3'],
    lead:  ['E4','G4','A4',null, 'C5',null,'A4','G4',
            'E4',null,'G4','A4', 'C5','B4','A4','G4',
            'E4','G4','C5',null, 'E5',null,'C5','A4',
            'B4',null,'A4','G4', 'E4',null,'D4','E4'],
  };

  const RACE = {
    bpm: 156,
    steps: 16,
    kick:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    snare: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,1,0],
    hat:   [1,1,1,1, 1,0,1,1, 1,1,1,0, 1,1,1,1],
    bass:  ['A1','A1','A2','A1', 'A1','C2','A1','E2',
            'A1','A1','A2','G1', 'A1','C2','E2','A1',
            'F1','F1','F2','F1', 'F1','A1','C2','F1',
            'G1','G1','G2','D2', 'G1','B1','D2','G2'],
    lead:  ['A4','C5','E5','A4', 'C5','E5','A5','E5',
            'A4','C5','E5','G5', 'E5','C5','A4','E4',
            'F4','A4','C5','F4', 'A4','C5','F5','C5',
            'G4','B4','D5','G4', 'B4','D5','G5','D5'],
  };

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.22;
    master.connect(ctx.destination);
    const n = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = n;
  }

  function envGain(t, dur, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  function tone(type, f, t, dur, peak, dest) {
    if (!f) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    const g = envGain(t, dur, peak);
    o.connect(g);
    g.connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function kick(t) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = envGain(t, 0.16, 0.9);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.18);
  }

  function snare(t) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    const g = envGain(t, 0.12, 0.35);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.14);
    tone('triangle', 180, t, 0.08, 0.25);
  }

  function hat(t, open) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = envGain(t, open ? 0.1 : 0.04, open ? 0.16 : 0.09);
    src.connect(hp);
    hp.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + (open ? 0.12 : 0.05));
  }

  function song() {
    return mode === 'race' ? RACE : MENU;
  }

  function tick() {
    if (!ctx || !unlocked || muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const s = song();
    const stepDur = 60 / s.bpm / 4;
    const t = ctx.currentTime + 0.03;
    const i = step % s.bass.length;
    const barStep = i % s.steps;
    if (s.kick[barStep]) kick(t);
    if (s.snare[barStep]) snare(t);
    if (s.hat[barStep]) hat(t, barStep % 4 === 2);
    const b = s.bass[i];
    const lead = s.lead[i];
    if (b) tone(mode === 'race' ? 'square' : 'triangle', freq(b), t, stepDur * 0.9, mode === 'race' ? 0.28 : 0.32);
    if (lead) tone('square', freq(lead), t, stepDur * 0.85, mode === 'race' ? 0.16 : 0.2);
    if (mode === 'race' && lead) {
      tone('square', freq(lead) * 2, t, stepDur * 0.4, 0.05);
    }
    step++;
  }

  function startLoop() {
    if (timer) return;
    const s = song();
    const ms = (60 / s.bpm / 4) * 1000;
    timer = setInterval(tick, ms);
    tick();
  }

  function stopLoop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function restart() {
    stopLoop();
    step = 0;
    if (unlocked && !muted) startLoop();
  }

  function unlock() {
    ensure();
    if (!ctx) return;
    unlocked = true;
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = muted ? 0 : 0.22;
    if (!timer && !muted) startLoop();
  }

  function setMode(next) {
    const m = next === 'race' ? 'race' : 'menu';
    if (m === mode && timer) return;
    mode = m;
    restart();
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('pasrally2000_mute', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.value = muted ? 0 : 0.22;
    if (muted) stopLoop();
    else if (unlocked) restart();
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = muted ? 'MUSIC OFF' : 'MUSIC ON';
    return muted;
  }

  function bind() {
    const go = () => unlock();
    window.addEventListener('pointerdown', go, { passive: true });
    window.addEventListener('keydown', go);
    const btn = document.getElementById('btn-mute');
    if (btn) {
      btn.textContent = muted ? 'MUSIC OFF' : 'MUSIC ON';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        unlock();
        toggleMute();
      });
    }
  }

  window.PasrallyMusic = { unlock, setMode, toggleMute };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
