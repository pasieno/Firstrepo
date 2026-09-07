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

  // ---- Screens ----
  function show(name) {
    screen = name;
    Object.keys(screens).forEach((k) => {
      screens[k].classList.toggle('active', k === name);
    });
    if (name === 'race') {
      document.getElementById('hud').style.display = 'flex';
      document.getElementById('controls').style.display = 'flex';
    } else {
      document.getElementById('hud').style.display = 'none';
      document.getElementById('controls').style.display = 'none';
    }
  }

  // ---- High scores ----
  function loadScores() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveScores(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function getTrackScores(trackId) {
    const all = loadScores();
    return (all[trackId] || []).slice(0, 3);
  }
  function tryInsertScore(trackId, timeMs, name) {
    const all = loadScores();
    const list = (all[trackId] || []).slice();
    list.push({ name: name.slice(0, NAME_MAX).toUpperCase() || 'AAA', time: timeMs });
    list.sort((a, b) => a.time - b.time);
    all[trackId] = list.slice(0, 3);
    saveScores(all);
  }
  function isTop3(trackId, timeMs) {
    const list = getTrackScores(trackId);
    if (list.length < 3) return true;
    return timeMs < list[list.length - 1].time;
  }

  function formatTime(ms) {
    const t = Math.max(0, Math.floor(ms));
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const cs = Math.floor((t % 1000) / 10);
    return (
      String(m).padStart(1, '0') +
      "'" +
      String(s).padStart(2, '0') +
      '"' +
      String(cs).padStart(2, '0')
    );
  }

  // 7-segment style clock digits
  function renderClock(ms) {
    const str = formatTime(ms);
    clockEl.innerHTML = '';
    for (const ch of str) {
      const span = document.createElement('span');
      span.className = ch === "'" || ch === '"' ? 'seg-sep' : 'seg-digit';
      span.textContent = ch;
      clockEl.appendChild(span);
    }
  }

  // ---- Menu wiring ----
  document.getElementById('btn-start').addEventListener('click', () => {
    buildTrackSelect();
    show('tracks');
  });
  document.getElementById('btn-scores').addEventListener('click', () => {
    buildScoresView();
    show('scores');
  });
  document.getElementById('btn-back-tracks').addEventListener('click', () => show('menu'));
  document.getElementById('btn-back-scores').addEventListener('click', () => show('menu'));
  document.getElementById('btn-save-name').addEventListener('click', saveNameAndFinish);
  document.getElementById('btn-skip-name').addEventListener('click', () => {
    pendingScore = null;
    showResult(false);
  });
  document.getElementById('btn-again').addEventListener('click', () => startRace(trackIndex));
  document.getElementById('btn-menu').addEventListener('click', () => {
    stopRace();
    show('menu');
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveNameAndFinish();
  });
  nameInput.addEventListener('input', () => {
    nameInput.value = nameInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, NAME_MAX);
  });

  function buildTrackSelect() {
    trackListEl.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const btn = document.createElement('button');
      btn.className = 'menu-btn track-btn';
      const best = getTrackScores(t.id)[0];
      btn.innerHTML =
        '<span class="track-name">' +
        t.name +
        '</span><span class="track-meta">' +
        t.laps +
        ' LAPS' +
        (best ? ' · BEST ' + formatTime(best.time) : '') +
        '</span>';
      btn.addEventListener('click', () => startRace(i));
      trackListEl.appendChild(btn);
    });
  }

  function buildScoresView() {
    scoresListEl.innerHTML = '';
    TRACKS.forEach((t) => {
      const block = document.createElement('div');
      block.className = 'score-track';
      const title = document.createElement('h3');
      title.textContent = t.name;
      block.appendChild(title);
      const list = getTrackScores(t.id);
      if (!list.length) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = 'NO RECORDS';
        block.appendChild(p);
      } else {
        const ol = document.createElement('ol');
        list.forEach((e) => {
          const li = document.createElement('li');
          li.innerHTML =
            '<span class="hs-name">' +
            e.name +
            '</span><span class="hs-time">' +
            formatTime(e.time) +
            '</span>';
          ol.appendChild(li);
        });
        block.appendChild(ol);
      }
      scoresListEl.appendChild(block);
    });
  }

  function saveNameAndFinish() {
    if (!pendingScore) {
      showResult(false);
      return;
    }
    const name = (nameInput.value || 'AAA').slice(0, NAME_MAX);
    tryInsertScore(pendingScore.trackId, pendingScore.timeMs, name);
    pendingScore = null;
    showResult(true);
  }

  function showResult(saved) {
    const t = race ? race.totalTime : 0;
    resultTimeEl.textContent = formatTime(t);
    resultMsgEl.textContent = saved ? 'SCORE SAVED!' : 'FINISH!';
    show('result');
  }

  // ---- Controls ----
  function setAccel(v) {
    accelHeld = v;
    accelBtn.classList.toggle('held', v);
  }
  accelBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    setAccel(true);
  });
  accelBtn.addEventListener('mouseup', () => setAccel(false));
  accelBtn.addEventListener('mouseleave', () => setAccel(false));
  accelBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    setAccel(true);
  }, { passive: false });
  accelBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    setAccel(false);
  });
  accelBtn.addEventListener('touchcancel', () => setAccel(false));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      setAccel(true);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      setAccel(false);
    }
  });

  // Steering: -1 .. 1
  function getSteer() {
    return (parseFloat(steerSlider.value) - 50) / 50;
  }
  function resetSteer() {
    steerSlider.value = 50;
  }

  // ---- Race ----
  function startRace(idx) {
    trackIndex = idx;
    const track = TRACKS[idx];
    road = expandTrack(track);
    player = {
      z: 0,
      x: 0, // -1 .. 1 relative to road center
      speed: 0,
      maxSpeed: 260,
      accel: 120,
      brake: 180,
      coast: 60,
      steerPower: 2.2,
      offRoadFactor: 0.45,
    };
    race = {
      lap: 1,
      laps: track.laps,
      totalTime: 0,
      lapTime: 0,
      finished: false,
      started: false,
      countdown: 3.0, // 3,2,1 then GO flash
      crashFlash: 0,
      trackId: track.id,
      trackLen: road.length,
    };
    resetSteer();
    setAccel(false);
    renderClock(0);
    lapEl.textContent = 'LAP 1/' + race.laps;
    speedEl.textContent = '0 km/h';
    show('race');
    lastTs = 0;
    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
  }

  function stopRace() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
  }

  function finishRace() {
    race.finished = true;
    stopRace();
    const timeMs = race.totalTime;
    if (isTop3(race.trackId, timeMs)) {
      pendingScore = { trackId: race.trackId, timeMs };
      nameInput.value = '';
      document.getElementById('name-prompt-time').textContent = formatTime(timeMs);
      show('name');
      setTimeout(() => nameInput.focus(), 100);
    } else {
      pendingScore = null;
      showResult(false);
    }
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;

    if (screen !== 'race' || !race || race.finished) return;

    update(dt);
    draw();
    animId = requestAnimationFrame(loop);
  }

  function update(dt) {
    const track = TRACKS[trackIndex];

    // Countdown
    if (!race.started) {
      race.countdown -= dt;
      if (race.countdown <= -0.55) {
        race.started = true;
        race.countdown = 0;
      }
      return;
    }

    race.totalTime += dt * 1000;
    race.lapTime += dt * 1000;
    if (race.crashFlash > 0) race.crashFlash -= dt;

    // Physics
    const steer = getSteer();
    const onRoad = Math.abs(player.x) < 1.05;

    if (accelHeld && onRoad) {
      player.speed += player.accel * dt;
    } else if (accelHeld && !onRoad) {
      player.speed += player.accel * player.offRoadFactor * dt;
    } else {
      player.speed -= (accelHeld ? 0 : player.coast) * dt;
      if (!onRoad) player.speed -= player.brake * 0.3 * dt;
    }
    if (!onRoad && player.speed > player.maxSpeed * 0.55) {
      player.speed -= player.brake * 0.5 * dt;
    }
    player.speed = Math.max(0, Math.min(player.maxSpeed, player.speed));

    // Centrifugal force from curve
    const segIdx = Math.floor(player.z) % road.length;
    const seg = road[segIdx] || { curve: 0 };
    const curveForce = seg.curve * player.speed * 0.00035;
    player.x += steer * player.steerPower * (player.speed / player.maxSpeed) * dt * 1.4;
    player.x -= curveForce * dt * 60;
    // Soft walls
    if (player.x < -1.6) {
      player.x = -1.6;
      player.speed *= 0.96;
      race.crashFlash = 0.15;
    }
    if (player.x > 1.6) {
      player.x = 1.6;
      player.speed *= 0.96;
      race.crashFlash = 0.15;
    }

    // Advance
    const dz = (player.speed / 100) * dt * 12;
    const prevZ = player.z;
    player.z += dz;

    // Lap check
    const lapZ = player.z % race.trackLen;
    const prevLapZ = prevZ % race.trackLen;
    if (prevZ > 5 && prevLapZ > lapZ && dz > 0) {
      // crossed finish
      if (race.lap >= race.laps) {
        finishRace();
        return;
      }
      race.lap++;
      race.lapTime = 0;
    }

    // HUD
    renderClock(race.totalTime);
    lapEl.textContent = 'LAP ' + Math.min(race.lap, race.laps) + '/' + race.laps;
    speedEl.textContent = Math.round(player.speed) + ' km/h';
  }

  // ---- Renderer (pseudo-3D) ----
  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.imageSmoothingEnabled = false;
    const track = TRACKS[trackIndex];
    const camH = 1000;
    const camDepth = 1 / Math.tan(((70 / 2) * Math.PI) / 180);
    const roadW = 2000;
    const segLen = 200;

    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, track.skyTop);
    g.addColorStop(1, track.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Sun / sky decoration
    ctx.fillStyle = 'rgba(255,230,150,0.85)';
    ctx.beginPath();
    ctx.arc(W * 0.78, H * 0.12, W * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Ground base
    ctx.fillStyle = track.color;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    const baseIdx = Math.floor(player.z);
    const camY = camH + (road[baseIdx % road.length] ? road[baseIdx % road.length].y * 40 : 0);

    // Project segments from far to near
    const drawDist = 90;
    let x = 0;
    let dx = 0;
    const maxY = H;
    let prev = null;

    // Precompute projected points
    const pts = [];
    for (let n = 0; n < drawDist; n++) {
      const i = (baseIdx + n) % road.length;
      const seg = road[i];
      const zWorld = (n - (player.z - baseIdx)) * segLen;
      if (zWorld <= 0) {
        pts.push(null);
        continue;
      }
      const yWorld = camY - seg.y * 40;
      const scale = camDepth / (zWorld / 100);
      const screenY = H / 2 + (scale * yWorld) / 4;
      const screenW = scale * roadW;
      // accumulate curve
      dx += seg.curve * 0.35;
      x += dx;
      const screenX = W / 2 + scale * (-player.x * roadW * 0.5) + x * scale * 8;
      pts.push({ x: screenX, y: screenY, w: screenW, scale, i, seg });
    }

    // Draw from back to front
    for (let n = pts.length - 1; n >= 1; n--) {
      const p = pts[n];
      const p2 = pts[n - 1];
      if (!p || !p2) continue;
      if (p.y >= p2.y) continue;
      if (p2.y > maxY + 40) continue;

      const grass = ((p.i % 6) < 3) ? shade(track.color, 1) : shade(track.color, 0.85);
      const rumble = (p.i % 4) < 2 ? '#eee' : '#c22';
      const roadCol = (p.i % 4) < 2 ? track.roadColor : shade(track.roadColor, 1.08);

      // Grass
      ctx.fillStyle = grass;
      ctx.fillRect(0, p.y, W, p2.y - p.y + 1);

      // Shoulder / rumble
      drawTrap(p.x, p.y, p.w * 1.15, p2.x, p2.y, p2.w * 1.15, rumble);
      // Road
      drawTrap(p.x, p.y, p.w, p2.x, p2.y, p2.w, roadCol);
      // Center line
      if (p.i % 8 < 4) {
        drawTrap(p.x, p.y, p.w * 0.04, p2.x, p2.y, p2.w * 0.04, '#ddd');
      }

      // Side trees / markers every few segments
      if (p.i % 5 === 0 && p.scale > 0.02) {
        drawSprite(p.x - p.w * 0.75, p.y, p.scale, 'tree', track);
        drawSprite(p.x + p.w * 0.75, p.y, p.scale, 'tree', track);
      }
      // Start/finish banners
      if (p.i === 0 || p.i === Math.floor(road.length / 2)) {
        drawBanner(p.x, p.y, p.w, p.scale);
      }
    }

    // Car
    drawCar(W, H);

    // Crash flash
    if (race.crashFlash > 0) {
      ctx.fillStyle = 'rgba(255,40,40,' + race.crashFlash * 0.5 + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // Countdown overlay
    if (!race.started) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
      const showGo = race.countdown <= 0;
      ctx.fillStyle = showGo ? '#4f4' : '#ff0';
      ctx.font = 'bold ' + Math.floor(W * 0.18) + 'px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(showGo ? 'GO!' : String(Math.max(1, Math.ceil(race.countdown))), W / 2, H / 2);
    }
  }

  function drawTrap(x1, y1, w1, x2, y2, w2, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1 - w1 / 2, y1);
    ctx.lineTo(x1 + w1 / 2, y1);
    ctx.lineTo(x2 + w2 / 2, y2);
    ctx.lineTo(x2 - w2 / 2, y2);
    ctx.closePath();
    ctx.fill();
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    r = Math.min(255, Math.max(0, Math.round(r * f)));
    g = Math.min(255, Math.max(0, Math.round(g * f)));
    b = Math.min(255, Math.max(0, Math.round(b * f)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function drawSprite(x, y, scale, type, track) {
    const h = 180 * scale * 12;
    const w = 70 * scale * 12;
    if (h < 2) return;
    if (type === 'tree') {
      // Trunk
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(x - w * 0.12, y - h * 0.35, w * 0.24, h * 0.35);
      // Foliage (chunky)
      ctx.fillStyle = track.id === 'desert' ? '#8a9a3a' : '#1a6a28';
      ctx.fillRect(x - w * 0.45, y - h, w * 0.9, h * 0.7);
      ctx.fillStyle = track.id === 'desert' ? '#aaba4a' : '#2a8a38';
      ctx.fillRect(x - w * 0.3, y - h * 1.05, w * 0.6, h * 0.4);
    }
  }

  function drawBanner(x, y, w, scale) {
    const h = 120 * scale * 10;
    if (h < 3) return;
    ctx.fillStyle = '#222';
    ctx.fillRect(x - w * 0.55, y - h, w * 0.08, h);
    ctx.fillRect(x + w * 0.47, y - h, w * 0.08, h);
    ctx.fillStyle = '#e22';
    ctx.fillRect(x - w * 0.55, y - h, w * 1.1, h * 0.25);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(8, h * 0.18) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PASRALLY', x, y - h * 0.82);
  }

  function drawCar(W, H) {
    const cx = W / 2 + player.x * W * 0.08;
    const cy = H * 0.78;
    const s = W / 320;
    const steer = getSteer();
    const lean = steer * 6;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((lean * Math.PI) / 180);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-28 * s, 18 * s, 56 * s, 10 * s);

    // 1980s sports car — chunky pixels
    // Body
    ctx.fillStyle = '#c42828';
    ctx.fillRect(-30 * s, -8 * s, 60 * s, 28 * s);
    // Nose
    ctx.fillStyle = '#a02020';
    ctx.fillRect(-22 * s, -18 * s, 44 * s, 12 * s);
    // Cabin / windshield
    ctx.fillStyle = '#3a6aaa';
    ctx.fillRect(-18 * s, -14 * s, 36 * s, 10 * s);
    // Roof
    ctx.fillStyle = '#8a1818';
    ctx.fillRect(-14 * s, -20 * s, 28 * s, 8 * s);
    // Hood stripe
    ctx.fillStyle = '#eee';
    ctx.fillRect(-4 * s, -16 * s, 8 * s, 20 * s);
    // Headlights
    ctx.fillStyle = '#ffe8a0';
    ctx.fillRect(-20 * s, -18 * s, 8 * s, 5 * s);
    ctx.fillRect(12 * s, -18 * s, 8 * s, 5 * s);
    // Tail lights
    ctx.fillStyle = '#ff3030';
    ctx.fillRect(-28 * s, 16 * s, 10 * s, 5 * s);
    ctx.fillRect(18 * s, 16 * s, 10 * s, 5 * s);
    // Wheels
    ctx.fillStyle = '#111';
    ctx.fillRect(-32 * s, 4 * s, 10 * s, 16 * s);
    ctx.fillRect(22 * s, 4 * s, 10 * s, 16 * s);
    ctx.fillRect(-28 * s, -6 * s, 8 * s, 10 * s);
    ctx.fillRect(20 * s, -6 * s, 8 * s, 10 * s);
    // Wheel hubs
    ctx.fillStyle = '#888';
    ctx.fillRect(-29 * s, 8 * s, 4 * s, 6 * s);
    ctx.fillRect(25 * s, 8 * s, 4 * s, 6 * s);

    ctx.restore();
  }

  // Boot
  show('menu');
  renderClock(0);
})();
