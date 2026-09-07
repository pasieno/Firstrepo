# Firstrepo

Home of **Pasrally 2000** — a 1990s-style arcade rally browser game.

## Pasrally 2000

Static HTML/CSS/JS — no build step.

### How to play

1. Open `index.html` in a modern browser (Chrome, Firefox, Safari, Edge).
   - Local file is fine, or serve the folder with any static server, e.g. `python3 -m http.server`.
2. **START** → pick a track (Forest Run, Alpine Pass, or Desert Heat).
3. After the 3–2–1 countdown:
   - **Hold ACCELERATE** (or Space / ↑) to speed up; release to coast.
   - Drag the **STEER** slider left/right (mouse or touch).
4. Stay on the asphalt — grass slows you down. Finish all laps; race times are usually about 1–3 minutes.
5. Top **3** times per track are stored in the browser (`localStorage`). If you place, enter a name (max 5 characters).

### Files

- `index.html` — entry
- `style.css` — arcade UI + 7-segment clock
- `tracks.js` — three pre-generated tracks
- `game.js` — menu, physics, pseudo-3D renderer, high scores
