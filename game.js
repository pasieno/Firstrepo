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
  let steerDragging = false;
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

  // Spring steering wheel back to center when released (phone-friendly)
  steerSlider.addEventListener('pointerdown', () => { steerDragging = true; });
  steerSlider.addEventListener('pointerup', () => { steerDragging = false; });
  steerSlider.addEventListener('pointercancel', () => { steerDragging = false; });
  window.addEventListener('pointerup', () => { steerDragging = false; });


  // ---- Race ----
  function startRace(idx) {
    trackIndex = idx;
    const track = TRACKS[idx];
    road = expandTrack(track);
    player = {
      z: 0,
      x: 0,
      speed: 0,
      maxSpeed: 240,
      accel: 130,
      brake: 155,
      coast: 48,
      steerPower: 2.5,
      offRoadFactor: 0.8,
      centrifugal: 0.09,    // drift out if you don't steer; full steer holds
      roadLimit: 1.22,
      softLimit: 1.8,
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

    if (!steerDragging) {
      const v = parseFloat(steerSlider.value);
      steerSlider.value = String(v + (50 - v) * Math.min(1, dt * 8));
    }

    // Physics — middle ground: bends push, steering recovers
    const steer = getSteer();
    const absX = Math.abs(player.x);
    const onRoad = absX < player.roadLimit;
    const spdRatio = player.speed / player.maxSpeed;

    if (accelHeld && onRoad) {
      player.speed += player.accel * dt;
    } else if (accelHeld && !onRoad) {
      player.speed += player.accel * player.offRoadFactor * dt;
    } else {
      player.speed -= player.coast * dt;
      if (!onRoad) player.speed -= player.brake * 0.18 * dt;
    }
    if (!onRoad && player.speed > player.maxSpeed * 0.7) {
      player.speed -= player.brake * 0.22 * dt;
    }
    player.speed = Math.max(0, Math.min(player.maxSpeed, player.speed));

    const segIdx = Math.floor(player.z) % road.length;
    const seg = road[segIdx] || { curve: 0 };

    const speedGate = Math.min(1, player.speed / 28);
    player.x += steer * player.steerPower * speedGate * dt;

    // Outward on bends. No auto-steer assist — you must turn.
    const curvePush = seg.curve * player.centrifugal * (0.25 + 0.75 * spdRatio);
    player.x -= curvePush * dt;

    // Light centering so the car doesn't pin to the wall
    player.x -= player.x * 0.22 * dt;

    if (!onRoad) {
      // Can drive back on; extra pull if steering toward the road
      const toward = Math.abs(steer) < 0.12 || Math.sign(steer) === -Math.sign(player.x || 1);
      player.x -= Math.sign(player.x || 1) * (toward ? 1.6 : 0.45) * dt;
    }

    player.x = Math.max(-player.softLimit, Math.min(player.softLimit, player.x));

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

    // Sky gradient + soft bands
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, track.skyTop);
    g.addColorStop(0.55, shade(track.skyBot, 0.92));
    g.addColorStop(1, track.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Simple parallax cloud bands (scroll with z)
    const cloudShift = (player.z * 0.35) % W;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let c = 0; c < 4; c++) {
      const cx = ((c * W * 0.38 - cloudShift * (0.4 + c * 0.12)) % (W + 80)) - 40;
      const cy = H * (0.06 + c * 0.05);
      const cw = W * (0.16 + (c % 2) * 0.06);
      ctx.fillRect(cx, cy, cw, H * 0.018);
      ctx.fillRect(cx + cw * 0.2, cy - H * 0.012, cw * 0.55, H * 0.016);
    }

    // Sun / moon disc with glow
    const sunX = W * 0.78;
    const sunY = H * 0.11;
    const sunR = W * 0.055;
    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 2.2);
    glow.addColorStop(0, track.id === 'desert' ? 'rgba(255,200,80,0.55)' : 'rgba(255,240,180,0.4)');
    glow.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = track.id === 'desert' ? '#ffd060' : '#fff0b0';
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    // Distant hills silhouette (parallax)
    const hillShift = (player.z * 1.2) % (W * 2);
    ctx.fillStyle = shade(track.fogColor || track.color, 0.55);
    ctx.beginPath();
    ctx.moveTo(0, H * 0.52);
    for (let hx = -W; hx <= W * 2; hx += 40) {
      const wx = hx - hillShift * 0.5;
      const hh = Math.sin(wx * 0.012 + trackIndex) * H * 0.04 + Math.sin(wx * 0.03) * H * 0.025;
      ctx.lineTo(hx, H * 0.5 - hh - H * 0.02);
    }
    ctx.lineTo(W * 2, H * 0.55);
    ctx.lineTo(0, H * 0.55);
    ctx.fill();

    // Ground base
    ctx.fillStyle = track.color;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);

    const baseIdx = Math.floor(player.z);
    const camY = camH + (road[baseIdx % road.length] ? road[baseIdx % road.length].y * 40 : 0);

    // Visible bends (curve * scale) + modest player offset (not scale*roadW, that looked like instant ejects)
    const drawDist = 100;
    let x = 0;
    let dx = 0;

    const pts = [];
    for (let n = 0; n < drawDist; n++) {
      const i = (baseIdx + n) % road.length;
      const seg = road[i];
      const zWorld = (n - (player.z - baseIdx)) * segLen;
      if (zWorld <= 8) {
        dx += seg.curve * 0.42;
        x += dx;
        pts.push(null);
        continue;
      }
      const yWorld = camY - seg.y * 40;
      const scale = camDepth / (zWorld / 100);
      const screenY = H / 2 + (scale * yWorld) / 4;
      const screenW = scale * roadW;
      const camShift = player.x * Math.min(W * 0.16, scale * 90);
      const screenX = W / 2 - camShift + x * scale * 6.5;
      pts.push({ x: screenX, y: screenY, w: screenW, scale, i, seg });
      dx += seg.curve * 0.42;
      x += dx;
    }

    const shoulderCol = track.shoulderColor || shade(track.color, 1.15);

    for (let n = pts.length - 1; n >= 1; n--) {
      const p = pts[n];
      const p2 = pts[n - 1];
      if (!p || !p2) continue;
      if (p.y >= p2.y) continue;
      if (p2.y > H + 40) continue;

      const grassA = ((p.i % 6) < 3) ? shade(track.color, 1) : shade(track.color, 0.88);
      const grassB = ((p.i % 6) < 3) ? shade(track.color, 0.92) : shade(track.color, 0.8);
      const rumble = (p.i % 4) < 2 ? '#f0e8d8' : '#d03030';
      const roadCol = (p.i % 4) < 2 ? track.roadColor : shade(track.roadColor, 1.1);
      const edge = (p.i % 4) < 2 ? '#e8e0c8' : '#c8c0a8';

      // Grass strip
      const gg = ctx.createLinearGradient(0, p.y, 0, p2.y);
      gg.addColorStop(0, grassA);
      gg.addColorStop(1, grassB);
      ctx.fillStyle = gg;
      ctx.fillRect(0, p.y, W, Math.max(1, p2.y - p.y + 1));

      // Dirt shoulder
      drawTrap(p.x, p.y, p.w * 1.28, p2.x, p2.y, p2.w * 1.28, shade(shoulderCol, (p.i % 2) ? 1 : 0.92));
      // Rumble strips
      drawTrap(p.x, p.y, p.w * 1.14, p2.x, p2.y, p2.w * 1.14, rumble);
      // Road surface
      drawTrap(p.x, p.y, p.w, p2.x, p2.y, p2.w, roadCol);
      // Soft edge highlight
      drawTrap(p.x, p.y, p.w * 0.98, p2.x, p2.y, p2.w * 0.98, 'rgba(255,255,255,0.04)');
      // Lane edges
      drawTrap(p.x - p.w * 0.42, p.y, p.w * 0.035, p2.x - p2.w * 0.42, p2.y, p2.w * 0.035, edge);
      drawTrap(p.x + p.w * 0.42, p.y, p.w * 0.035, p2.x + p2.w * 0.42, p2.y, p2.w * 0.035, edge);
      // Center dashes
      if (p.i % 8 < 4) {
        drawTrap(p.x, p.y, p.w * 0.045, p2.x, p2.y, p2.w * 0.045, '#e8e070');
      }

      // Roadside props
      if (p.i % 5 === 0 && p.scale > 0.02) {
        drawSprite(p.x - p.w * 0.78, p.y, p.scale, 'tree', track);
        drawSprite(p.x + p.w * 0.78, p.y, p.scale, 'tree', track);
      }
      if (p.i % 11 === 3 && p.scale > 0.03) {
        drawSprite(p.x - p.w * 1.05, p.y, p.scale * 0.85, 'rock', track);
      }
      if (p.i === 0 || p.i === Math.floor(road.length / 2)) {
        drawBanner(p.x, p.y, p.w, p.scale);
      }
    }

    // Horizon haze
    const haze = ctx.createLinearGradient(0, H * 0.45, 0, H * 0.58);
    haze.addColorStop(0, 'rgba(0,0,0,0)');
    haze.addColorStop(0.5, (track.fogColor || '#888') + '33');
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, H * 0.45, W, H * 0.14);

    drawCar(W, H);

    if (race.crashFlash > 0) {
      ctx.fillStyle = 'rgba(255,50,40,' + race.crashFlash * 0.45 + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // Off-road vignette hint
    if (Math.abs(player.x) > player.roadLimit) {
      ctx.fillStyle = 'rgba(80,40,10,0.12)';
      ctx.fillRect(0, 0, W, H);
    }

    if (!race.started) {
      ctx.fillStyle = 'rgba(0,0,0,0.48)';
      ctx.fillRect(0, 0, W, H);
      const showGo = race.countdown <= 0;
      ctx.fillStyle = showGo ? '#50f050' : '#ffe040';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.font = 'bold ' + Math.floor(W * 0.18) + 'px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = showGo ? 'GO!' : String(Math.max(1, Math.ceil(race.countdown)));
      ctx.strokeText(label, W / 2, H / 2);
      ctx.fillText(label, W / 2, H / 2);
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
    if (!hex || hex[0] !== '#' || hex.length < 7) return hex;
    const n = parseInt(hex.slice(1, 7), 16);
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

    if (type === 'rock') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x - w * 0.35, y - h * 0.08, w * 0.7, h * 0.1);
      ctx.fillStyle = track.id === 'desert' ? '#a88850' : '#6a6a72';
      ctx.fillRect(x - w * 0.3, y - h * 0.35, w * 0.6, h * 0.35);
      ctx.fillStyle = track.id === 'desert' ? '#c8a868' : '#8a8a92';
      ctx.fillRect(x - w * 0.22, y - h * 0.42, w * 0.35, h * 0.2);
      return;
    }

    // Shadow under prop
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x - w * 0.35, y - h * 0.04, w * 0.7, h * 0.08);

    if (track.id === 'desert') {
      // Cactus
      ctx.fillStyle = '#3a7a28';
      ctx.fillRect(x - w * 0.1, y - h * 0.85, w * 0.2, h * 0.85);
      ctx.fillRect(x - w * 0.42, y - h * 0.55, w * 0.32, w * 0.18);
      ctx.fillRect(x - w * 0.42, y - h * 0.7, w * 0.16, h * 0.22);
      ctx.fillRect(x + w * 0.1, y - h * 0.48, w * 0.28, w * 0.16);
      ctx.fillRect(x + w * 0.22, y - h * 0.62, w * 0.14, h * 0.2);
      ctx.fillStyle = '#5a9a40';
      ctx.fillRect(x - w * 0.06, y - h * 0.85, w * 0.08, h * 0.5);
      return;
    }

    if (track.id === 'mountain') {
      // Pine
      ctx.fillStyle = '#4a3020';
      ctx.fillRect(x - w * 0.08, y - h * 0.28, w * 0.16, h * 0.28);
      ctx.fillStyle = '#1a4a28';
      for (let t = 0; t < 3; t++) {
        const th = h * (0.45 - t * 0.08);
        const ty = y - h * (0.35 + t * 0.28);
        const tw = w * (0.95 - t * 0.2);
        ctx.beginPath();
        ctx.moveTo(x, ty - th);
        ctx.lineTo(x + tw * 0.5, ty);
        ctx.lineTo(x - tw * 0.5, ty);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#2a6a38';
      ctx.beginPath();
      ctx.moveTo(x, y - h * 1.05);
      ctx.lineTo(x + w * 0.28, y - h * 0.72);
      ctx.lineTo(x - w * 0.28, y - h * 0.72);
      ctx.closePath();
      ctx.fill();
      return;
    }

    // Forest deciduous — layered chunky canopy
    ctx.fillStyle = '#5a3a18';
    ctx.fillRect(x - w * 0.1, y - h * 0.38, w * 0.2, h * 0.38);
    ctx.fillStyle = '#0e4a1c';
    ctx.fillRect(x - w * 0.48, y - h * 0.95, w * 0.96, h * 0.62);
    ctx.fillStyle = '#1a6a2a';
    ctx.fillRect(x - w * 0.38, y - h * 1.08, w * 0.76, h * 0.4);
    ctx.fillStyle = '#2a8a3a';
    ctx.fillRect(x - w * 0.22, y - h * 1.18, w * 0.44, h * 0.28);
    ctx.fillStyle = '#3aaa48';
    ctx.fillRect(x - w * 0.12, y - h * 0.85, w * 0.2, h * 0.15);
  }

  function drawBanner(x, y, w, scale) {
    const h = 120 * scale * 10;
    if (h < 3) return;
    // Poles
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x - w * 0.55, y - h, w * 0.07, h);
    ctx.fillRect(x + w * 0.48, y - h, w * 0.07, h);
    // Checkered stripe
    const bw = w * 1.1;
    const bh = h * 0.28;
    const bx = x - w * 0.55;
    const by = y - h;
    const cells = 8;
    const cw = bw / cells;
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#e02828' : '#f8f8f8';
      ctx.fillRect(bx + i * cw, by, cw + 1, bh * 0.55);
      ctx.fillStyle = i % 2 === 0 ? '#f8f8f8' : '#e02828';
      ctx.fillRect(bx + i * cw, by + bh * 0.55, cw + 1, bh * 0.45);
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(8, h * 0.16) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PASRALLY', x, y - h * 0.78);
  }

  function drawCar(W, H) {
    // C64 OutRun rear view: wide red Testarossa-like, black tires, spoiler, light bar.
    const cx = W / 2 + player.x * W * 0.045;
    const cy = H * 0.80;
    const s = W / 280;
    const steer = getSteer();
    const lean = steer * 5;
    const bob = Math.sin(player.z * 0.9) * (player.speed / player.maxSpeed) * 1.1 * s;

    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.rotate((lean * Math.PI) / 180);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-36 * s, 16 * s, 72 * s, 8 * s);

    // Rear tires (chunky, C64-like)
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-38 * s, -2 * s, 14 * s, 22 * s);
    ctx.fillRect(24 * s, -2 * s, 14 * s, 22 * s);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-36 * s, 2 * s, 10 * s, 14 * s);
    ctx.fillRect(26 * s, 2 * s, 10 * s, 14 * s);
    ctx.fillStyle = '#888';
    ctx.fillRect(-33 * s, 6 * s, 4 * s, 6 * s);
    ctx.fillRect(29 * s, 6 * s, 4 * s, 6 * s);

    // Side pods
    ctx.fillStyle = '#9a1818';
    ctx.fillRect(-30 * s, -4 * s, 10 * s, 16 * s);
    ctx.fillRect(20 * s, -4 * s, 10 * s, 16 * s);

    // Main rear body
    ctx.fillStyle = '#d42828';
    ctx.beginPath();
    ctx.moveTo(-28 * s, 14 * s);
    ctx.lineTo(28 * s, 14 * s);
    ctx.lineTo(22 * s, -10 * s);
    ctx.lineTo(-22 * s, -10 * s);
    ctx.closePath();
    ctx.fill();

    // Cabin / rear deck
    ctx.fillStyle = '#b01c1c';
    ctx.fillRect(-16 * s, -18 * s, 32 * s, 12 * s);

    // Rear window (dark, C64 OutRun)
    ctx.fillStyle = '#141820';
    ctx.fillRect(-13 * s, -16 * s, 26 * s, 8 * s);
    ctx.fillStyle = '#4a7098';
    ctx.fillRect(-11 * s, -15 * s, 8 * s, 3 * s);

    // Spoiler
    ctx.fillStyle = '#111';
    ctx.fillRect(-24 * s, -24 * s, 48 * s, 4 * s);
    ctx.fillRect(-20 * s, -22 * s, 4 * s, 6 * s);
    ctx.fillRect(16 * s, -22 * s, 4 * s, 6 * s);

    // White center stripe
    ctx.fillStyle = '#f4f0e8';
    ctx.fillRect(-3 * s, -8 * s, 6 * s, 20 * s);

    // Rear light bar
    ctx.fillStyle = '#2a0a0a';
    ctx.fillRect(-24 * s, 6 * s, 48 * s, 7 * s);
    ctx.fillStyle = '#ff3030';
    ctx.fillRect(-22 * s, 7 * s, 12 * s, 5 * s);
    ctx.fillRect(10 * s, 7 * s, 12 * s, 5 * s);
    ctx.fillStyle = '#ffb040';
    ctx.fillRect(-8 * s, 8 * s, 5 * s, 3 * s);
    ctx.fillRect(3 * s, 8 * s, 5 * s, 3 * s);

    // Bumper + exhausts
    ctx.fillStyle = '#222';
    ctx.fillRect(-26 * s, 13 * s, 52 * s, 4 * s);
    ctx.fillStyle = '#888';
    ctx.fillRect(-10 * s, 14 * s, 4 * s, 4 * s);
    ctx.fillRect(6 * s, 14 * s, 4 * s, 4 * s);

    // License plate
    ctx.fillStyle = '#f0e8c0';
    ctx.fillRect(-6 * s, 9 * s, 12 * s, 4 * s);
    ctx.fillStyle = '#222';
    ctx.fillRect(-4 * s, 10 * s, 8 * s, 2 * s);

    ctx.restore();
  }

  // Boot
  show('menu');
  renderClock(0);
})();
