// Procedural CanvasTextures for the Lumen Kart worlds (Mondes). No external assets.
// Every road/offroad/barrier/rail texture takes a world key:
//   meadow | lagoon | jungle | desert | medina | city | aurora | night
// Legacy theme keys (beach, snow, lava) are accepted through `worldKey()`.
import * as THREE from 'three';

const ALIAS = { beach: 'lagoon', snow: 'aurora', lava: 'night' };
export const worldKey = (k) => ALIAS[k] || k || 'meadow';
const FONT = '"Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true, anisotropy = 8, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (repeat) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
  tex.anisotropy = anisotropy;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(ctx, w, h, count, colors, rand, minS = 1, maxS = 2.5) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    const s = minS + rand() * (maxS - minS);
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
}

function blotches(ctx, W, H, n, rand, dark, light, rMin = 20, rMax = 70) {
  for (let i = 0; i < n; i++) {
    const x = rand() * W, y = rand() * H, r = rMin + rand() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rand() < 0.5 ? dark : light);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    // draw wrapped vertically so the texture tiles along the road
    for (const oy of [-H, 0, H]) ctx.fillRect(x - r, y - r + oy, r * 2, r * 2);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function star4(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, rr = k % 2 ? r * 0.36 : r;
    ctx.lineTo(x + Math.sin(a) * rr, y - Math.cos(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

function note(ctx, x, y, s) {
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.5, s * 0.36, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x + s * 0.38, y - s * 1.5, s * 0.14, s * 1.5);
  ctx.beginPath(); ctx.moveTo(x + s * 0.52, y - s * 1.5); ctx.quadraticCurveTo(x + s * 1.2, y - s * 1.1, x + s * 0.9, y - s * 0.6);
  ctx.quadraticCurveTo(x + s * 1.0, y - s * 1.05, x + s * 0.52, y - s * 1.15); ctx.fill();
}

// ---------------------------------------------------------------------------------------------
// Road surfaces: u across the road (0 = left edge, 1 = right edge), v along (one repeat ≈ 22 m).
// ---------------------------------------------------------------------------------------------
const ROAD = {
  meadow: { base: '#8a8592', spk: ['#7b7684', '#9a95a2', '#a7a1ae', '#706b79'], edge: '#fff3d8', mid: '#f2a07f', lane: 'rgba(255,243,216,0.45)' },
  lagoon: { base: '#958c84', spk: ['#88807a', '#a39a90', '#afa59a', '#7f776f'], edge: '#ffffff', mid: '#56d0cf', lane: 'rgba(255,255,255,0.45)' },
  jungle: { base: '#a27058', spk: ['#92624c', '#b27e64', '#bc8a6e', '#865844'], edge: '#e8d79a', mid: null, lane: null },
  desert: { base: '#c79c6c', spk: ['#b88c5e', '#d4aa7a', '#dfb889', '#ad8255'], edge: '#fff0cf', mid: '#d86f4a', lane: null },
  medina: { base: '#a99f92', spk: [], edge: '#2a6fb0', mid: null, lane: null },
  city: { base: '#535a66', spk: ['#4a505b', '#5f6672', '#6a717d', '#444a54'], edge: '#f4f1ea', mid: '#ffcf5a', lane: 'rgba(244,241,234,0.6)' },
  aurora: { base: '#8ea3c2', spk: ['#9db0cc', '#7f95b6', '#b6c6dd', '#a7b9d3'], edge: '#f4fbff', mid: '#9fe8d4', lane: null },
  night: { base: '#433f78', spk: ['#3b3770', '#4d4985', '#57538f', '#38346a'], edge: '#cbbcff', mid: '#f3d096', lane: null },
};

export function makeRoadTexture(world = 'meadow') {
  const key = worldKey(world);
  const S = ROAD[key] || ROAD.meadow;
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rand = rng(11 + key.length * 7);
  ctx.fillStyle = S.base; ctx.fillRect(0, 0, W, H);

  if (key === 'medina') {
    // cobblestones: rows of rounded stones, offset every other row, blue tile bands at the edges
    ctx.fillStyle = '#8f877c'; ctx.fillRect(0, 0, W, H);
    const rowH = 16;
    for (let r = 0; r < H / rowH; r++) {
      let x = (r % 2) * -9 - rand() * 4;
      while (x < W) {
        const w = 15 + rand() * 9;
        const tone = 205 + rand() * 30 | 0;
        ctx.fillStyle = `rgb(${tone},${tone - 6 - (rand() * 6 | 0)},${tone - 18 - (rand() * 10 | 0)})`;
        roundRect(ctx, x + 1.5, r * rowH + 1.5, w - 3, rowH - 3, 5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        roundRect(ctx, x + 3, r * rowH + 2.5, w - 7, 4, 2); ctx.fill();
        x += w;
      }
    }
    // soft wear in the racing lanes
    blotches(ctx, W, H, 30, rand, 'rgba(70,60,50,0.10)', 'rgba(255,250,235,0.10)');
    // blue & white tile bands
    for (const x0 of [W * 0.02, W * 0.94]) {
      for (let y = 0; y < H; y += 16) {
        ctx.fillStyle = (y / 16) % 2 ? '#f4f1e8' : '#2a6fb0';
        ctx.fillRect(x0, y, W * 0.04, 16);
      }
    }
    return finish(c, { anisotropy: 16 });
  }

  if (key === 'jungle') {
    blotches(ctx, W, H, 50, rand, 'rgba(90,40,25,0.22)', 'rgba(220,150,110,0.16)');
    speckle(ctx, W, H, 7000, S.spk, rand, 1, 2.6);
    // ruts
    for (const cx of [0.28, 0.72]) {
      const g = ctx.createLinearGradient(W * (cx - 0.1), 0, W * (cx + 0.1), 0);
      g.addColorStop(0, 'rgba(70,30,20,0)'); g.addColorStop(0.5, 'rgba(70,30,20,0.22)'); g.addColorStop(1, 'rgba(70,30,20,0)');
      ctx.fillStyle = g; ctx.fillRect(W * (cx - 0.1), 0, W * 0.2, H);
    }
    // mossy edges + fallen leaves
    for (const [x0, dir] of [[0, 1], [W, -1]]) {
      const g = ctx.createLinearGradient(x0, 0, x0 + dir * W * 0.09, 0);
      g.addColorStop(0, 'rgba(70,130,60,0.95)'); g.addColorStop(1, 'rgba(70,130,60,0)');
      ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x0 + dir * W * 0.09), 0, W * 0.09, H);
    }
    for (let i = 0; i < 70; i++) {
      ctx.save(); ctx.translate(rand() * W, rand() * H); ctx.rotate(rand() * 6.28);
      ctx.fillStyle = ['#5f9a3e', '#8bb84a', '#c9a23a', '#3f7a3a'][(rand() * 4) | 0];
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    // dotted cream edge stones
    ctx.fillStyle = S.edge;
    for (const lx of [0.075, 0.925]) for (let y = 8; y < H; y += 32) { ctx.beginPath(); ctx.ellipse(W * lx, y, 6, 9, 0, 0, Math.PI * 2); ctx.fill(); }
    return finish(c, { anisotropy: 16 });
  }

  blotches(ctx, W, H, 60, rand, 'rgba(30,30,40,0.14)', 'rgba(255,255,255,0.10)');
  speckle(ctx, W, H, 9000, S.spk, rand, 1, 2.2);
  if (key === 'desert') {
    // wind-blown sand drifts from the edges
    for (let i = 0; i < 26; i++) {
      const left = rand() < 0.5, y = rand() * H, len = 40 + rand() * 120, w = 20 + rand() * 60;
      const g = ctx.createLinearGradient(left ? 0 : W, 0, left ? w : W - w, 0);
      g.addColorStop(0, 'rgba(240,214,160,0.85)'); g.addColorStop(1, 'rgba(240,214,160,0)');
      ctx.fillStyle = g;
      for (const oy of [-H, 0, H]) ctx.fillRect(left ? 0 : W - w, y + oy, w, len);
    }
  }
  if (key === 'aurora') {
    // packed snow ruts and ice glints
    for (const cx of [0.3, 0.7]) {
      const g = ctx.createLinearGradient(W * (cx - 0.08), 0, W * (cx + 0.08), 0);
      g.addColorStop(0, 'rgba(90,110,150,0)'); g.addColorStop(0.5, 'rgba(90,110,150,0.25)'); g.addColorStop(1, 'rgba(90,110,150,0)');
      ctx.fillStyle = g; ctx.fillRect(W * (cx - 0.08), 0, W * 0.16, H);
    }
    for (let i = 0; i < 160; i++) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(rand() * W, rand() * H, 2, 1); }
    for (const [x0, dir] of [[0, 1], [W, -1]]) {
      const g = ctx.createLinearGradient(x0, 0, x0 + dir * W * 0.07, 0);
      g.addColorStop(0, 'rgba(250,253,255,0.95)'); g.addColorStop(1, 'rgba(250,253,255,0)');
      ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x0 + dir * W * 0.07), 0, W * 0.07, H);
    }
  }
  if (key === 'night') {
    // large slabs with soft lavender joints
    ctx.strokeStyle = 'rgba(25,20,60,0.55)'; ctx.lineWidth = 3;
    for (let y = 0; y <= H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let r = 0; r < 8; r++) for (let k = 0; k < 4; k++) {
      const x = (k + (r % 2) * 0.5) * W / 4; ctx.beginPath(); ctx.moveTo(x, r * 64); ctx.lineTo(x, r * 64 + 64); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(183,166,255,0.08)';
    for (let r = 0; r < 8; r++) ctx.fillRect(0, r * 64 + 3, W, 4);
  }
  if (key === 'lagoon') {
    blotches(ctx, W, H, 18, rand, 'rgba(250,236,200,0.35)', 'rgba(250,236,200,0.25)', 30, 90);
  }
  if (key === 'city') {
    // tram rails in both lanes
    for (const cx of [0.27, 0.73]) {
      for (const off of [-0.035, 0.035]) {
        ctx.fillStyle = '#3a3f48'; ctx.fillRect(W * (cx + off) - 4, 0, 8, H);
        ctx.fillStyle = '#b9c0c9'; ctx.fillRect(W * (cx + off) - 2, 0, 3, H);
      }
    }
  }
  // tire wear lanes (subtle)
  if (key !== 'aurora') {
    for (const cx of [0.32, 0.68]) {
      const g = ctx.createLinearGradient(W * (cx - 0.1), 0, W * (cx + 0.1), 0);
      g.addColorStop(0, 'rgba(30,30,36,0)'); g.addColorStop(0.5, 'rgba(30,30,36,0.10)'); g.addColorStop(1, 'rgba(30,30,36,0)');
      ctx.fillStyle = g; ctx.fillRect(W * (cx - 0.1), 0, W * 0.2, H);
    }
  }
  // edge lines
  ctx.fillStyle = S.edge;
  ctx.fillRect(W * 0.035, 0, W * 0.022, H);
  ctx.fillRect(W * (1 - 0.057), 0, W * 0.022, H);
  // centre marks
  if (key === 'night') {
    ctx.fillStyle = S.mid;
    for (let y = 0; y < H; y += 128) star4(ctx, W * 0.5, y + 64, 13);
  } else if (key === 'meadow') {
    ctx.fillStyle = S.mid;
    for (let y = 0; y < H; y += 128) { roundRect(ctx, W * 0.5 - 5, y + 30, 10, 60, 5); ctx.fill(); }
  } else if (S.mid) {
    ctx.fillStyle = S.mid;
    for (let y = 0; y < H; y += 256) ctx.fillRect(W * 0.5 - 5, y + 40, 10, 150);
  }
  if (S.lane) {
    ctx.fillStyle = S.lane;
    for (const lx of [0.27, 0.73]) for (let y = 0; y < H; y += 256) ctx.fillRect(W * lx - 3, y + 170, 6, 70);
  }
  return finish(c, { anisotropy: 16 });
}
/** @deprecated kept for older callers — same as makeRoadTexture('city'). */
export const makeAsphaltTexture = (world = 'city') => makeRoadTexture(world);

// Wooden boardwalk for bridges (lagoon pontoons, meadow/jungle bridges). Planks run across the road.
export function makeBoardwalkTexture(world = 'lagoon') {
  const key = worldKey(world);
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rand = rng(77);
  const tones = key === 'jungle' ? ['#9a6a45', '#8a5c3a', '#a8774f', '#7d5334'] : key === 'meadow' ? ['#c99a6a', '#b88a5c', '#d6a876', '#c09060'] : ['#c8a172', '#b98f60', '#d5ae7f', '#bf9767'];
  const plank = 32;
  for (let y = 0; y < H; y += plank) {
    ctx.fillStyle = tones[(rand() * tones.length) | 0];
    ctx.fillRect(0, y, W, plank);
    // grain
    ctx.strokeStyle = 'rgba(80,50,25,0.18)'; ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) { const yy = y + 4 + rand() * (plank - 8); ctx.beginPath(); ctx.moveTo(0, yy); ctx.bezierCurveTo(W * 0.3, yy + 3, W * 0.6, yy - 3, W, yy); ctx.stroke(); }
    ctx.fillStyle = 'rgba(60,35,20,0.6)'; ctx.fillRect(0, y, W, 3);
    ctx.fillStyle = 'rgba(255,240,210,0.18)'; ctx.fillRect(0, y + 3, W, 2);
    // nails
    ctx.fillStyle = 'rgba(60,50,45,0.7)';
    for (const x of [0.06, 0.3, 0.7, 0.94]) { ctx.beginPath(); ctx.arc(W * x, y + plank / 2, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
  // guide lines so the driving line stays readable
  ctx.fillStyle = key === 'jungle' ? 'rgba(232,215,154,0.9)' : 'rgba(255,255,255,0.85)';
  ctx.fillRect(W * 0.035, 0, W * 0.02, H); ctx.fillRect(W * (1 - 0.055), 0, W * 0.02, H);
  return finish(c, { anisotropy: 16 });
}

// Two-colour rumble strip: u across (0..1), v along (one block of each colour per repeat)
const CURB = {
  meadow: ['#ef9679', '#fff4dc'], lagoon: ['#3fc4c8', '#ffffff'], jungle: ['#e8b93a', '#3f8a4a'], desert: ['#d0704a', '#fff0cf'],
  medina: ['#2a6fb0', '#f8f6ef'], city: ['#ffb84a', '#3a3f4a'], aurora: ['#7fb8ff', '#f4fbff'], night: ['#b7a6ff', '#f3d096'],
};
export function makeCurbTexture(a, b) {
  if (a && !a.startsWith('#')) { const k = CURB[worldKey(a)] || CURB.meadow; a = k[0]; b = k[1]; }
  a = a || '#e8322f'; b = b || '#fbfbf7';
  const [c, ctx] = canvas(64, 128);
  ctx.fillStyle = a; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = b; ctx.fillRect(0, 64, 64, 64);
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.2, 'rgba(0,0,0,0)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 128);
  return finish(c);
}

// ---------------------------------------------------------------------------------------------
// Offroad bands (between the road edge and the barrier)
// ---------------------------------------------------------------------------------------------
const OFF = {
  meadow: { base: '#97cf6f', spk: ['#86c060', '#a6da7c', '#8fca68', '#b3e08a', '#7ab558'], dots: ['#ffd6e4', '#fff3c4', '#ffffff', '#ffb59a', '#d9c4ff'] },
  lagoon: { base: '#efdcaa', spk: ['#e6d19c', '#f6e6ba', '#ddc690', '#f9ecc8'], dots: ['#ffffff', '#ffd1c4', '#cfeee8'] },
  jungle: { base: '#4f8f45', spk: ['#45823c', '#5c9e4f', '#3c7536', '#6aac58', '#7a5a3a'], dots: ['#ffd25a', '#ff8a6a', '#b8f070'] },
  desert: { base: '#ecca92', spk: ['#e2bf86', '#f3d6a4', '#d8b47a', '#f6dcb0'], dots: ['#c99a5a', '#fff2d6'] },
  medina: { base: '#c8bc8a', spk: ['#bdb07c', '#d2c796', '#a9b26a', '#cfc08e'], dots: ['#e66aa6', '#fff6e6', '#9cc26a'] },
  city: { base: '#8fc46c', spk: ['#80b65f', '#9dd078', '#78ac58', '#a8d884'], dots: ['#ffffff', '#ffe08a'] },
  aurora: { base: '#eef4fb', spk: ['#dfe9f5', '#ffffff', '#d3e1f0', '#f6fbff'], dots: ['#bfe0ff', '#ffffff'] },
  night: { base: '#5a5596', spk: ['#4f4a8a', '#655fa4', '#4a4580', '#6f69ae'], dots: ['#f3d096', '#c5f5de', '#dbb2f6'] },
};
export function makeOffroadTexture(world = 'meadow') {
  const key = worldKey(world);
  const S = OFF[key] || OFF.meadow;
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(23 + key.length);
  ctx.fillStyle = S.base; ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, 14, rand, 'rgba(0,0,0,0.06)', 'rgba(255,255,255,0.08)', 15, 45);
  speckle(ctx, W, H, 5000, S.spk, rand, 1, 3);
  for (let i = 0; i < 70; i++) { ctx.fillStyle = S.dots[(rand() * S.dots.length) | 0]; ctx.fillRect(rand() * W, rand() * H, 2.5, 2.5); }
  return finish(c);
}
export const makeGrassTexture = () => makeOffroadTexture('meadow');
export const makeSandTexture = () => makeOffroadTexture('desert');
export const makeSnowTexture = () => makeOffroadTexture('aurora');
export const makeAshTexture = () => makeOffroadTexture('night');

export function makeConcreteTexture(world = 'city') {
  const key = worldKey(world);
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rand = rng(41);
  const base = { medina: '#f2eee4', night: '#6d66a8', aurora: '#d8e6f4', desert: '#d9b07e', city: '#b9bcc2' }[key] || '#cfc6b4';
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 3000, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.1)'], rand, 1, 2);
  ctx.strokeStyle = 'rgba(60,60,80,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(W, 1); ctx.stroke();
  return finish(c);
}

// ---------------------------------------------------------------------------------------------
// Barriers: u along the wall (one repeat = 9.6 m), v up the wall (0 = buried foot, 1 = top).
// ---------------------------------------------------------------------------------------------
export function makeBarrierTexture(world = 'meadow') {
  const key = worldKey(world);
  const W = 1024, H = 128;
  const [c, ctx] = canvas(W, H);
  const rand = rng(91);
  // visible band is roughly the upper 45 % (the rest sits below the ground)
  const top = 0, vis = H * 0.47;
  const ground = (col) => { ctx.fillStyle = col; ctx.fillRect(0, vis, W, H - vis); };
  switch (key) {
    case 'jungle': {
      // log palisade
      for (let x = 0; x < W; x += 32) {
        const tone = ['#8a5a36', '#7a4e2e', '#946440', '#6e4428'][(x / 32) % 4];
        const g = ctx.createLinearGradient(x, 0, x + 32, 0);
        g.addColorStop(0, '#4a2e1a'); g.addColorStop(0.25, tone); g.addColorStop(0.7, tone); g.addColorStop(1, '#3e2614');
        ctx.fillStyle = g; ctx.fillRect(x, 0, 32, H);
        ctx.fillStyle = 'rgba(90,150,70,0.8)'; ctx.fillRect(x, vis - 10 - rand() * 14, 32, 30);
      }
      ctx.fillStyle = 'rgba(232,215,154,0.9)'; ctx.fillRect(0, 10, W, 6);
      break;
    }
    case 'desert': {
      ctx.fillStyle = '#d9a46c'; ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < 4; r++) for (let x = -(r % 2) * 40; x < W; x += 80) {
        ctx.fillStyle = ['#e2b07a', '#cf9762', '#dca870'][(rand() * 3) | 0];
        roundRect(ctx, x + 2, r * 16 + 2, 76, 13, 3); ctx.fill();
      }
      ctx.fillStyle = '#d0704a'; ctx.fillRect(0, 0, W, 5);
      ground('#c99860');
      break;
    }
    case 'medina': {
      ctx.fillStyle = '#f7f4ec'; ctx.fillRect(0, 0, W, H);
      speckle(ctx, W, vis, 1400, ['rgba(0,0,0,0.04)', 'rgba(255,255,255,0.5)'], rand, 1, 3);
      // blue & white zellige band
      for (let x = 0; x < W; x += 24) {
        ctx.fillStyle = (x / 24) % 2 ? '#2a6fb0' : '#e9f0f7'; ctx.fillRect(x, 20, 24, 14);
        ctx.fillStyle = '#f3d096'; star4(ctx, x + 12, 27, 5);
      }
      ctx.fillStyle = '#2a6fb0'; ctx.fillRect(0, 0, W, 6);
      ground('#e7e0d0');
      break;
    }
    case 'city': {
      ctx.fillStyle = '#c9cbd0'; ctx.fillRect(0, 0, W, H);
      speckle(ctx, W, H, 2500, ['#bdbfc4', '#d6d8dc', '#b2b5bb'], rand, 1, 2);
      for (let x = 0; x < W; x += 128) { ctx.fillStyle = 'rgba(60,64,72,0.35)'; ctx.fillRect(x, 0, 3, H); }
      // soft neon stripe + chevrons
      ctx.fillStyle = '#ffb84a'; ctx.fillRect(0, 16, W, 8);
      ctx.fillStyle = '#5fd6e0'; ctx.fillRect(0, 30, W, 4);
      ground('#9da1a8');
      break;
    }
    case 'aurora': {
      ctx.fillStyle = '#e8f2fb'; ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < 4; r++) for (let x = -(r % 2) * 48; x < W; x += 96) {
        ctx.fillStyle = ['#f6fbff', '#dbe9f6', '#e9f3fc'][(rand() * 3) | 0];
        roundRect(ctx, x + 2, r * 16 + 2, 92, 13, 5); ctx.fill();
      }
      ctx.fillStyle = '#7fb8ff'; ctx.fillRect(0, 0, W, 5);
      ground('#d3e1f0');
      break;
    }
    case 'night': {
      ctx.fillStyle = '#3a3570'; ctx.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 64) {
        ctx.fillStyle = (x / 64) % 2 ? '#423d7c' : '#352f68'; ctx.fillRect(x, 0, 64, vis);
        ctx.fillStyle = '#cbbcff'; star4(ctx, x + 32, 28, 9);
      }
      ctx.fillStyle = '#b7a6ff'; ctx.fillRect(0, 0, W, 5);
      ground('#2a2656');
      break;
    }
    default: {
      // meadow / lagoon: soft pastel boards with LUMEN motifs (notes, stars, leaves)
      const pal = key === 'lagoon'
        ? [['#3fc4c8', '#ffffff'], ['#ffffff', '#2f8fb0'], ['#ffd27a', '#2f8fb0'], ['#ef9679', '#ffffff']]
        : [['#387d76', '#fff7dc'], ['#fff7dc', '#e98c73'], ['#e98c73', '#fff7dc'], ['#a6dfc6', '#306f70']];
      const pw = W / pal.length;
      pal.forEach(([bg, fg], i) => {
        ctx.fillStyle = bg; ctx.fillRect(i * pw, 0, pw, H);
        ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(i * pw, 0, pw, 8);
        ctx.fillStyle = fg;
        ctx.font = `bold 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (i === 0) ctx.fillText('LUMEN', i * pw + pw / 2, 30);
        else if (i === 2) ctx.fillText('KART', i * pw + pw / 2, 30);
        else if (i === 1) { for (let k = 0; k < 3; k++) note(ctx, i * pw + 60 + k * 70, 40, 14); }
        else { for (let k = 0; k < 3; k++) star4(ctx, i * pw + 60 + k * 70, 30, 14); }
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(i * pw, 0, 3, H);
      });
      ground(key === 'lagoon' ? '#d9c79a' : '#6f9a55');
      break;
    }
  }
  void top;
  return finish(c);
}

// Bridge parapets: u along, v up
export function makeRailTexture(world = 'lagoon') {
  const key = worldKey(world);
  const W = 256, H = 64;
  const [c, ctx] = canvas(W, H);
  if (key === 'medina' || key === 'desert') {
    ctx.fillStyle = key === 'medina' ? '#f7f4ec' : '#e2b07a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = key === 'medina' ? '#2a6fb0' : '#b5683e';
    for (let x = 8; x < W; x += 32) { roundRect(ctx, x, 14, 16, 34, 7); ctx.fill(); }
    ctx.fillRect(0, 0, W, 8);
  } else if (key === 'city') {
    ctx.fillStyle = '#5f8f9c'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2f5866'; ctx.lineWidth = 6;
    for (let x = -64; x < W + 64; x += 64) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 64, H); ctx.stroke(); }
    ctx.fillStyle = '#ffb84a'; ctx.fillRect(0, 0, W, 8); ctx.fillRect(0, H - 8, W, 8);
  } else if (key === 'aurora') {
    ctx.fillStyle = '#cfe6fb'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(120,170,230,0.4)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (key === 'night') {
    ctx.fillStyle = '#4a4488'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#cbbcff'; for (let x = 16; x < W; x += 32) star4(ctx, x, 32, 10);
    ctx.fillRect(0, 0, W, 6);
  } else {
    // wooden posts + rope rails
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = key === 'jungle' ? '#7a5030' : '#b98f60';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = key === 'jungle' ? '#5a3a20' : '#9c7448';
    for (let x = 0; x < W; x += 64) ctx.fillRect(x, 0, 12, H);
    ctx.fillStyle = key === 'jungle' ? '#d9c27a' : '#fff2d6';
    ctx.fillRect(0, 8, W, 6); ctx.fillRect(0, 30, W, 5);
  }
  return finish(c);
}

// Boost pad: soft gold → coral chevrons pointing toward +v (race direction). Scrolled in update().
export function makeBoostTexture() {
  const W = 128, H = 256;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#ff8a5c'); g.addColorStop(0.5, '#ffc95a'); g.addColorStop(1, '#ff8a5c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 2; k++) {
    const y0 = k * 128;
    ctx.fillStyle = '#fff7dc';
    ctx.beginPath();
    ctx.moveTo(14, y0 + 96); ctx.lineTo(64, y0 + 30); ctx.lineTo(114, y0 + 96);
    ctx.lineTo(114, y0 + 124); ctx.lineTo(64, y0 + 58); ctx.lineTo(14, y0 + 124);
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#b5482a'; ctx.lineWidth = 8; ctx.strokeRect(4, -10, W - 8, H + 20);
  return finish(c);
}

// Jump ramp top: stripes in the world colours with a cream arrow; v along ramp.
export function makeRampTexture(world = 'meadow') {
  const key = worldKey(world);
  const [a, b] = { meadow: ['#387d76', '#fff7dc'], lagoon: ['#2f8fb0', '#e7fbfa'], jungle: ['#8a5a36', '#c9a46a'], desert: ['#c0663e', '#ffe7c0'],
    medina: ['#2a6fb0', '#f8f6ef'], city: ['#3a3f4a', '#ffb84a'], aurora: ['#5a8fd6', '#f4fbff'], night: ['#5b4fb0', '#dbd0ff'] }[key] || ['#1e88e5', '#e3f2fd'];
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.fillRect(i * 32, 0, 32, H); }
  ctx.fillStyle = '#ffd36a';
  ctx.strokeStyle = '#3a2a40'; ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(128, 20); ctx.lineTo(210, 120); ctx.lineTo(160, 120); ctx.lineTo(160, 236);
  ctx.lineTo(96, 236); ctx.lineTo(96, 120); ctx.lineTo(46, 120); ctx.closePath();
  ctx.fill(); ctx.stroke();
  return finish(c, { repeat: false });
}

export function makeCheckerTexture(cols = 8, rows = 2) {
  const S = 32;
  const [c, ctx] = canvas(cols * S, rows * S);
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
    ctx.fillStyle = (x + y) % 2 ? '#26305a' : '#fff7dc';
    ctx.fillRect(x * S, y * S, S, S);
  }
  const t = finish(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

// Start banner: LUMEN-style ribbon, cream lettering, star ends.
export function makeBannerTexture(title, colors = ['#387d76', '#2b625d', '#fff7dc', '#edc371']) {
  const W = 1024, H = 128;
  const [c, ctx] = canvas(W, H);
  const [c1, c2, txt, acc] = colors;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = acc; ctx.fillRect(0, 0, W, 7); ctx.fillRect(0, H - 7, W, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = 12; x < W; x += 24) { ctx.beginPath(); ctx.arc(x, 18, 2, 0, Math.PI * 2); ctx.arc(x, H - 18, 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = acc;
  for (const x of [56, W - 56]) star4(ctx, x, H / 2, 30);
  let size = 72;
  ctx.font = `bold ${size}px ${FONT}`;
  const width = () => ((ctx.measureText && ctx.measureText(title)) || {}).width || 0;
  while (width() > W - 220 && size > 30) { size -= 4; ctx.font = `bold ${size}px ${FONT}`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(20,30,50,0.45)';
  ctx.strokeText(title, W / 2, H / 2 + 4);
  ctx.fillStyle = txt;
  ctx.fillText(title, W / 2, H / 2 + 4);
  return finish(c, { repeat: false });
}

// Stand canopy / pillar stripes
export function makeStripeTexture(a = '#ffffff', b = '#e8322f', n = 8) {
  const [c, ctx] = canvas(256, 16);
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.fillRect(i * 256 / n, 0, 256 / n, 16); }
  return finish(c);
}

// Facade tile for instanced buildings: one window per tile (u = 1 per 4 m, v = 1 per 3.4 m floor).
// The wall is white so per-instance colours tint it; returns { map, emissiveMap } (lit windows glow).
export function makeFacadeTextures(world = 'city') {
  const key = worldKey(world);
  const S = 64;
  const [c, ctx] = canvas(S, S);
  const [e, ex] = canvas(S, S);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
  ex.fillStyle = '#000000'; ex.fillRect(0, 0, S, S);
  if (key === 'medina') {
    ctx.fillStyle = '#2a6fb0'; roundRect(ctx, 22, 16, 20, 28, 9); ctx.fill();
    ctx.fillStyle = '#1d4f86'; ctx.fillRect(31, 18, 2, 26);
    ctx.fillStyle = '#e9e3d6'; ctx.fillRect(18, 44, 28, 4);
  } else {
    ctx.fillStyle = '#ece6dc'; ctx.fillRect(0, 58, S, 6);
    ctx.fillStyle = '#5a6f86'; ctx.fillRect(14, 12, 36, 34);
    ctx.fillStyle = '#e7dccb'; ctx.fillRect(12, 46, 40, 4);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(31, 12, 2, 34); ctx.fillRect(14, 27, 36, 2);
    ex.fillStyle = '#ffd89a'; ex.fillRect(15, 13, 15, 13); ex.fillRect(34, 29, 15, 16);
  }
  const map = finish(c, { anisotropy: 4 });
  const emissiveMap = finish(e, { anisotropy: 4 });
  map.magFilter = THREE.LinearFilter;
  return { map, emissiveMap };
}
