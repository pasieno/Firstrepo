/**
 * Pasrally 2000 — main game
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'pasrally2000_scores';
  const NAME_MAX = 5;

  // ---- DOM ----
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const screens = {
    menu: document.getElementById('screen-menu'),
    tracks: document.getElementById('screen-tracks'),
    scores: document.getElementById('screen-scores'),
    race: document.getElementById('screen-race'),
    name: document.getElementById('screen-name'),
    result: document.getElementById('screen-result'),
  };
  const steerSlider = document.getElementById('steer');
  const accelBtn = document.getElementById('accel');
  const clockEl = document.getElementById('clock');
  const lapEl = document.getElementById('lap-info');
  const speedEl = document.getElementById('speed-info');
  const nameInput = document.getElementById('name-input');
  const resultTimeEl = document.getElementById('result-time');
  const resultMsgEl = document.getElementById('result-msg');
  const scoresListEl = document.getElementById('scores-list');
  const trackListEl = document.getElementById('track-list');

  // ---- State ----
  let screen = 'menu';
  let trackIndex = 0;
  let road = [];
  let player = null;
  let race = null;
  let animId = null;
  let lastTs = 0;
  let accelHeld = false;
  let pendingScore = null; // { trackId, timeMs }

  // ---- Canvas sizing ----
  function resize() {
    const wrap = canvas.parentElement;
    const w = Math.min(640, wrap.clientWidth || 640);
    const h = Math.floor(w * 0.75);
    canvas.width = w;
    canvas.height = h;
  }
  window.addEventListener('resize', resize);
  resize();

  // PLACEHOLDER_WILL_FAIL_VERIFY
})();
