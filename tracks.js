/**
 * Pasrally 2000 — pre-generated track data
 * Each segment: { curve, hill, length } — length in road units
 */
const TRACKS = [
  {
    id: 'forest',
    name: 'FOREST RUN',
    color: '#2d5a27',
    roadColor: '#555555',
    shoulderColor: '#8B7355',
    skyTop: '#4a90c8',
    skyBot: '#87ceeb',
    fogColor: '#6a9a5a',
    laps: 2,
    // Gentle intro track ~90–120s for a decent player
    segments: [
      { curve: 0, hill: 0, length: 120 },
      { curve: 2, hill: 0, length: 75 },
      { curve: 0, hill: 1, length: 60 },
      { curve: -3, hill: 0, length: 90 },
      { curve: 0, hill: -1, length: 60 },
      { curve: 4, hill: 0, length: 105 },
      { curve: -2, hill: 1, length: 75 },
      { curve: 0, hill: 0, length: 90 },
      { curve: -4, hill: 0, length: 120 },
      { curve: 3, hill: -1, length: 90 },
      { curve: 0, hill: 0, length: 75 },
      { curve: 2, hill: 0, length: 60 },
      { curve: -1, hill: 1, length: 75 },
      { curve: 0, hill: 0, length: 105 },
      { curve: 5, hill: 0, length: 90 },
      { curve: -3, hill: 0, length: 75 },
      { curve: 0, hill: 0, length: 120 },
    ],
  },
  {
    id: 'mountain',
    name: 'ALPINE PASS',
    color: '#6b7b8a',
    roadColor: '#4a4a4a',
    shoulderColor: '#9a8a70',
    skyTop: '#3a5a8a',
    skyBot: '#a0c4e8',
    fogColor: '#8a9aaa',
    laps: 2,
    segments: [
      { curve: 0, hill: 0, length: 90 },
      { curve: 3, hill: 2, length: 105 },
      { curve: -2, hill: 3, length: 90 },
      { curve: 0, hill: 2, length: 60 },
      { curve: -5, hill: 1, length: 120 },
      { curve: 4, hill: 0, length: 90 },
      { curve: 0, hill: -2, length: 75 },
      { curve: 6, hill: -1, length: 105 },
      { curve: -4, hill: -2, length: 90 },
      { curve: 0, hill: 0, length: 60 },
      { curve: -3, hill: 2, length: 105 },
      { curve: 5, hill: 1, length: 120 },
      { curve: -6, hill: 0, length: 90 },
      { curve: 2, hill: -1, length: 75 },
      { curve: 0, hill: 0, length: 90 },
      { curve: 4, hill: 1, length: 105 },
      { curve: -2, hill: 0, length: 75 },
      { curve: 0, hill: 0, length: 105 },
    ],
  },
  {
    id: 'desert',
    name: 'DESERT HEAT',
    color: '#c4a35a',
    roadColor: '#6a5a4a',
    shoulderColor: '#d4b86a',
    skyTop: '#e89040',
    skyBot: '#f5d090',
    fogColor: '#d4b070',
    laps: 2,
    segments: [
      { curve: 0, hill: 0, length: 105 },
      { curve: -2, hill: 0, length: 90 },
      { curve: 5, hill: 0, length: 120 },
      { curve: 0, hill: 1, length: 60 },
      { curve: -6, hill: 0, length: 135 },
      { curve: 3, hill: -1, length: 90 },
      { curve: -4, hill: 0, length: 105 },
      { curve: 0, hill: 0, length: 75 },
      { curve: 7, hill: 0, length: 120 },
      { curve: -3, hill: 1, length: 90 },
      { curve: 0, hill: 0, length: 60 },
      { curve: -5, hill: 0, length: 105 },
      { curve: 4, hill: 0, length: 90 },
      { curve: 0, hill: -1, length: 75 },
      { curve: 2, hill: 0, length: 90 },
      { curve: -7, hill: 0, length: 120 },
      { curve: 1, hill: 0, length: 75 },
      { curve: 0, hill: 0, length: 120 },
    ],
  },
];

function expandTrack(track) {
  const road = [];
  for (const seg of track.segments) {
    for (let i = 0; i < seg.length; i++) {
      const t = i / seg.length;
      // Ease curves in/out within segment
      let curve = seg.curve;
      if (i < 5) curve *= i / 5;
      else if (i > seg.length - 5) curve *= (seg.length - i) / 5;
      let hill = seg.hill;
      if (i < 5) hill *= i / 5;
      else if (i > seg.length - 5) hill *= (seg.length - i) / 5;
      road.push({ curve, hill, y: 0 });
    }
  }
  // Compute cumulative hill height
  let y = 0;
  for (const s of road) {
    y += s.hill;
    s.y = y;
  }
  return road;
}
