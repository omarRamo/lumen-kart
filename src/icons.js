// Lumen Kart — UI art: LUMEN-style item icons (canvas, cached data URLs), inline SVG glyphs and the logo.
// Soft pastel fills, a deep teal ink outline and a small highlight — the botanical look of LUMEN.

const INK = '#254d45';
const iconCache = new Map();
let provider = null;
/** Prefer the art agent's createItemIcon (matches the 3D item models); our drawings stay as fallback. */
export function setItemIconProvider(fn) { provider = typeof fn === 'function' ? fn : null; iconCache.clear(); }

export function itemIcon(type) {
  if (iconCache.has(type)) return iconCache.get(type);
  let url = '';
  if (provider) { try { url = provider(type, 128) || ''; } catch { url = ''; } }
  if (url) { iconCache.set(type, url); return url; }
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    drawItem(g, type);
    url = c.toDataURL();
  } catch { url = ''; }
  iconCache.set(type, url);
  return url;
}

function ink(g, w = 5) { g.strokeStyle = INK; g.lineWidth = w; }
function shine(g, x, y, rx, ry, rot = -0.6, a = 0.6) {
  g.save(); g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); g.restore();
}
function starPath(g, cx, cy, r1, r2, n = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * Math.PI / n, r = i % 2 === 0 ? r1 : r2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}
/** Four-point sparkle (the LUMEN star). */
function sparkle(g, cx, cy, r, fill, stroke = true) {
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 - Math.PI / 2, b = a + Math.PI / 4;
    const x1 = cx + Math.cos(a) * r, y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(b) * r * 0.32, y2 = cy + Math.sin(b) * r * 0.32;
    if (i === 0) g.moveTo(x1, y1); else g.lineTo(x1, y1);
    g.quadraticCurveTo(cx + Math.cos(b) * r * 0.12, cy + Math.sin(b) * r * 0.12, x2, y2);
    const a2 = a + Math.PI / 2;
    g.quadraticCurveTo(cx + Math.cos(b) * r * 0.12, cy + Math.sin(b) * r * 0.12, cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
  }
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) { ink(g, 4); g.stroke(); }
}
function small(g, fn, spots, s = 0.56) {
  for (const [x, y] of spots) { g.save(); g.translate(x, y); g.scale(s, s); g.translate(-64, -64); fn(); g.restore(); }
}

function note(g) {
  g.save();
  ink(g, 5);
  const grd = g.createLinearGradient(30, 20, 100, 110); grd.addColorStop(0, '#fff0ce'); grd.addColorStop(0.5, '#f3d096'); grd.addColorStop(1, '#d9a54a');
  g.fillStyle = grd;
  // stem + flag
  g.beginPath(); g.moveTo(66, 92); g.lineTo(66, 20); g.bezierCurveTo(80, 30, 100, 34, 98, 58); g.bezierCurveTo(92, 46, 82, 44, 74, 44); g.lineTo(74, 92); g.closePath(); g.fill(); g.stroke();
  // head
  g.beginPath(); g.ellipse(52, 94, 22, 16, -0.45, 0, Math.PI * 2); g.fill(); g.stroke();
  shine(g, 46, 88, 8, 4);
  g.restore();
}
function bramble(g) {
  g.save(); g.translate(64, 66);
  ink(g, 5);
  g.strokeStyle = INK; g.lineWidth = 14;
  g.beginPath(); g.arc(0, 0, 30, 0.3, Math.PI * 2 - 0.2); g.stroke();
  g.strokeStyle = '#7a9a4a'; g.lineWidth = 8;
  g.beginPath(); g.arc(0, 0, 30, 0.3, Math.PI * 2 - 0.2); g.stroke();
  g.fillStyle = '#7a9a4a'; ink(g, 3.5);
  for (let i = 0; i < 9; i++) {
    const a = 0.5 + i * 0.66, r = 30;
    const x = Math.cos(a) * r, y = Math.sin(a) * r, nx = Math.cos(a), ny = Math.sin(a);
    const o = i % 2 ? 1 : -1;
    g.beginPath(); g.moveTo(x - ny * 5, y + nx * 5); g.lineTo(x + nx * 14 * o, y + ny * 14 * o); g.lineTo(x + ny * 5, y - nx * 5); g.closePath(); g.fill(); g.stroke();
  }
  // leaf + berries
  g.fillStyle = '#a6dfc6'; ink(g, 4);
  g.beginPath(); g.moveTo(26, -18); g.quadraticCurveTo(52, -40, 46, -8); g.quadraticCurveTo(36, -2, 26, -18); g.fill(); g.stroke();
  g.fillStyle = '#8a4f86';
  for (const [x, y] of [[-8, 4], [4, 10], [-4, -8]]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); g.stroke(); }
  shine(g, -10, 2, 2.5, 2, 0, 0.7);
  g.restore();
}
function seed(g) {
  g.save(); g.translate(64, 70);
  ink(g, 5);
  const grd = g.createRadialGradient(-12, -14, 4, 0, 0, 46); grd.addColorStop(0, '#c9f2b8'); grd.addColorStop(1, '#5fb85e');
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(0, -38); g.bezierCurveTo(30, -30, 38, 10, 22, 30); g.bezierCurveTo(10, 42, -10, 42, -22, 30); g.bezierCurveTo(-38, 10, -30, -30, 0, -38); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(37,77,69,0.45)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(8, 0, 0, 34); g.stroke();
  // sprout
  g.fillStyle = '#a6dfc6'; ink(g, 4);
  g.beginPath(); g.moveTo(0, -38); g.quadraticCurveTo(-4, -50, -2, -54); g.stroke();
  g.beginPath(); g.moveTo(-2, -52); g.quadraticCurveTo(-24, -64, -26, -46); g.quadraticCurveTo(-12, -42, -2, -52); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-2, -52); g.quadraticCurveTo(16, -66, 22, -50); g.quadraticCurveTo(8, -44, -2, -52); g.fill(); g.stroke();
  shine(g, -12, -14, 8, 5);
  g.restore();
}
function firefly(g) {
  g.save(); g.translate(64, 66);
  const glow = g.createRadialGradient(0, 10, 4, 0, 10, 56); glow.addColorStop(0, 'rgba(255,214,140,0.95)'); glow.addColorStop(0.45, 'rgba(255,179,107,0.45)'); glow.addColorStop(1, 'rgba(255,179,107,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(0, 10, 56, 0, Math.PI * 2); g.fill();
  ink(g, 4);
  g.fillStyle = 'rgba(230,250,255,0.85)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 20, -16, 18, 11, s * -0.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
  g.fillStyle = '#ffe9a8';
  g.beginPath(); g.ellipse(0, 16, 15, 20, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#3c6b62';
  g.beginPath(); g.arc(0, -10, 12, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-5, -20); g.quadraticCurveTo(-10, -34, -18, -36); g.moveTo(5, -20); g.quadraticCurveTo(10, -34, 18, -36); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(-4, -11, 3, 0, Math.PI * 2); g.arc(5, -11, 3, 0, Math.PI * 2); g.fill();
  shine(g, -5, 10, 5, 8, 0, 0.7);
  g.restore();
}
function comet(g) {
  g.save();
  const tail = (w, col, y0) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(74, 52 + y0); g.quadraticCurveTo(46, 74 + y0, 10, 112 + y0 * 0.5); g.stroke(); };
  tail(26, 'rgba(219,178,246,0.35)', 0); tail(14, 'rgba(219,178,246,0.65)', 2); tail(6, '#fff2ff', 4);
  g.translate(80, 46);
  sparkle(g, 0, 0, 36, '#dbb2f6');
  sparkle(g, 0, 0, 16, '#fff7dc', false);
  g.restore();
}
function sunflower(g) {
  g.save(); g.translate(64, 64);
  ink(g, 4);
  for (let i = 0; i < 12; i++) {
    g.save(); g.rotate(i * Math.PI / 6);
    g.fillStyle = i % 2 ? '#ffc193' : '#edc371';
    g.beginPath(); g.ellipse(0, -36, 11, 22, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
  }
  const grd = g.createRadialGradient(-6, -6, 2, 0, 0, 26); grd.addColorStop(0, '#c98a5a'); grd.addColorStop(1, '#8a5a3a');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,240,206,0.7)';
  for (let i = 0; i < 10; i++) { const a = i * 2.4, r = 6 + (i % 3) * 5; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 2.2, 0, Math.PI * 2); g.fill(); }
  g.restore();
}
function veil(g) {
  g.save(); g.translate(64, 62);
  ink(g, 5);
  const grd = g.createLinearGradient(-40, -40, 40, 40); grd.addColorStop(0, '#9a8cf0'); grd.addColorStop(1, '#4a3d9c');
  g.fillStyle = grd;
  g.beginPath(); g.arc(0, 0, 40, 0.35 * Math.PI, 1.65 * Math.PI, false); g.arc(16, -6, 32, 1.55 * Math.PI, 0.45 * Math.PI, true); g.closePath(); g.fill(); g.stroke();
  // veil drape
  g.fillStyle = 'rgba(219,206,255,0.55)'; g.strokeStyle = 'rgba(37,77,69,0.6)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-30, -26); g.quadraticCurveTo(10, -46, 40, -20); g.quadraticCurveTo(30, 20, 44, 50); g.quadraticCurveTo(10, 36, -20, 52); g.quadraticCurveTo(-10, 10, -30, -26); g.fill(); g.stroke();
  for (const [x, y, r] of [[30, -36, 7], [44, 8, 5], [14, 30, 4]]) sparkle(g, x, y, r, '#fff7dc', false);
  g.restore();
}
function aurora(g) {
  g.save(); g.translate(64, 66);
  const grd = g.createLinearGradient(-50, -50, 50, 50);
  grd.addColorStop(0, '#b5f3d0'); grd.addColorStop(0.35, '#8fd3ff'); grd.addColorStop(0.65, '#dbb2f6'); grd.addColorStop(1, '#ffc193');
  g.fillStyle = grd; ink(g, 5);
  starPath(g, 0, 0, 50, 22); g.fill(); g.stroke();
  g.fillStyle = INK;
  g.beginPath(); g.ellipse(-9, -2, 4, 8, 0, 0, Math.PI * 2); g.ellipse(9, -2, 4, 8, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ed9b77'; g.lineWidth = 3.5; g.beginPath(); g.arc(0, 8, 7, 0.2, Math.PI - 0.2); g.stroke();
  shine(g, -18, -18, 8, 4);
  g.restore();
}
function feather(g) {
  g.save(); g.translate(64, 64); g.rotate(-0.7);
  ink(g, 5);
  const grd = g.createLinearGradient(0, -50, 0, 50); grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#b5f3d0');
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(0, -54); g.bezierCurveTo(30, -34, 26, 18, 4, 40); g.lineTo(-4, 40); g.bezierCurveTo(-26, 18, -30, -34, 0, -54); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(37,77,69,0.5)'; g.lineWidth = 2.5;
  for (let i = -3; i <= 3; i++) { const y = i * 11; g.beginPath(); g.moveTo(0, y + 6); g.lineTo(-18 + Math.abs(i) * 3, y - 6); g.moveTo(0, y + 6); g.lineTo(18 - Math.abs(i) * 3, y - 6); g.stroke(); }
  ink(g, 5); g.beginPath(); g.moveTo(0, -48); g.lineTo(0, 58); g.stroke();
  g.restore();
}
function eclipse(g) {
  g.save(); g.translate(64, 64);
  ink(g, 4);
  g.fillStyle = '#ffe27a';
  for (let i = 0; i < 12; i++) {
    g.save(); g.rotate(i * Math.PI / 6);
    g.beginPath(); g.moveTo(-7, -38); g.lineTo(0, -56); g.lineTo(7, -38); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  const glow = g.createRadialGradient(0, 0, 26, 0, 0, 42); glow.addColorStop(0, '#fff3b0'); glow.addColorStop(1, '#edc371');
  g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.fill(); g.stroke();
  const d = g.createRadialGradient(-8, -8, 4, 0, 0, 34); d.addColorStop(0, '#4a3d9c'); d.addColorStop(1, '#1c1640');
  g.fillStyle = d; g.beginPath(); g.arc(4, 2, 32, 0, Math.PI * 2); g.fill(); g.stroke();
  sparkle(g, -6, -6, 6, 'rgba(255,247,220,0.8)', false);
  g.restore();
}
function shootingStar(g) {
  g.save();
  for (const [w, c] of [[24, 'rgba(143,211,255,0.35)'], [12, 'rgba(143,211,255,0.7)'], [5, '#ffffff']]) {
    g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(70, 56); g.quadraticCurveTo(40, 88, 8, 100); g.stroke();
  }
  g.translate(78, 50);
  // little wings
  ink(g, 4); g.fillStyle = '#ffffff';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 20, 0); g.bezierCurveTo(s * 50, -26, s * 52, 10, s * 26, 14); g.closePath(); g.fill(); g.stroke(); }
  const grd = g.createRadialGradient(-8, -10, 3, 0, 0, 38); grd.addColorStop(0, '#e6f6ff'); grd.addColorStop(1, '#5fb4ef');
  g.fillStyle = grd; starPath(g, 0, 0, 34, 15); g.fill(); ink(g, 5); g.stroke();
  shine(g, -10, -10, 6, 3);
  g.restore();
}
function bell(g) {
  g.save(); g.translate(60, 66);
  ink(g, 5);
  g.strokeStyle = 'rgba(197,245,222,0.95)'; g.lineWidth = 5;
  for (const r of [16, 28]) { g.beginPath(); g.arc(36, -6, r, -0.7, 0.7); g.stroke(); }
  ink(g, 5);
  const grd = g.createLinearGradient(-30, -40, 30, 40); grd.addColorStop(0, '#fff3c4'); grd.addColorStop(1, '#e0b25c');
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(-34, 28); g.bezierCurveTo(-26, 18, -28, -10, -22, -24); g.bezierCurveTo(-14, -42, 14, -42, 22, -24); g.bezierCurveTo(28, -10, 26, 18, 34, 28); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#e98c73'; g.beginPath(); g.arc(0, 34, 8, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(0, -40); g.lineTo(0, -48); g.stroke();
  g.fillStyle = '#c5f5de'; g.beginPath(); g.roundRect(-30, 16, 60, 10, 5); g.fill(); g.stroke();
  shine(g, -12, -16, 5, 10, 0.2);
  g.restore();
}
function prism(g) {
  g.save(); g.translate(64, 64);
  ink(g, 5);
  const pts = [[0, -50], [40, -18], [30, 40], [-30, 40], [-40, -18]];
  const grd = g.createLinearGradient(-40, -50, 40, 40);
  grd.addColorStop(0, '#fff7dc'); grd.addColorStop(0.3, '#b5f3d0'); grd.addColorStop(0.6, '#8fd3ff'); grd.addColorStop(1, '#dbb2f6');
  g.fillStyle = grd;
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(37,77,69,0.55)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -50); g.lineTo(-12, -10); g.lineTo(-30, 40); g.moveTo(-12, -10); g.lineTo(14, -10); g.lineTo(30, 40); g.moveTo(14, -10); g.lineTo(0, -50); g.moveTo(-40, -18); g.lineTo(-12, -10); g.moveTo(40, -18); g.lineTo(14, -10); g.stroke();
  g.fillStyle = INK; g.font = '700 30px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('?', 0, 18);
  shine(g, -18, -18, 8, 4);
  g.restore();
}

function drawItem(g, type) {
  switch (type) {
    case 'coin': note(g); break;
    case 'banana': bramble(g); break;
    case 'triple_banana': small(g, () => bramble(g), [[34, 40], [94, 40], [64, 92]]); break;
    case 'green_shell': seed(g); break;
    case 'triple_green': small(g, () => seed(g), [[34, 42], [94, 42], [64, 94]]); break;
    case 'red_shell': firefly(g); break;
    case 'mushroom': comet(g); break;
    case 'triple_mushroom': small(g, () => comet(g), [[36, 40], [94, 46], [62, 94]]); break;
    case 'bomb': sunflower(g); break;
    case 'ghost': veil(g); break;
    case 'star': aurora(g); break;
    case 'bullet': feather(g); break;
    case 'lightning': eclipse(g); break;
    case 'blue_shell': shootingStar(g); break;
    case 'horn': bell(g); break;
    case 'item_box': prism(g); break;
    default: prism(g);
  }
}

export function noteIconURL() { return itemIcon('coin'); }

// ---------------------------------------------------------------------------------------------
// Inline SVG glyphs (stroke icons, currentColor)
// ---------------------------------------------------------------------------------------------
const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/><circle cx="12" cy="12" r="7"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M10 3h4M12 3v3.5M18 7l1.5-1.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3.2 3 13.8 0 17M12 3.5c-3 3.2-3 13.8 0 17"/>',
  note: '<path d="M9 18V6l10-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>',
  star: '<path d="M12 3.5l2.5 5.4 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.1 2.8 1.1-5.8-4.3-4 5.8-.7z"/>',
  sparkle: '<path d="M12 2.5c.6 4.9 2.6 6.9 7.5 7.5-4.9.6-6.9 2.6-7.5 7.5-.6-4.9-2.6-6.9-7.5-7.5 4.9-.6 6.9-2.6 7.5-7.5z" fill="currentColor" stroke="none"/>',
  recenter: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  home: '<path d="M4 11l8-6.5 8 6.5M6.5 9.5V19h11V9.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  speaker: '<path d="M4 9.5h4l5-4v13l-5-4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
};
export function svgIcon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

/** App-icon-like emblem: Lumen's face with leaf ears, scarf and the golden forehead star. */
export function logoEmblemSVG(cls = '') {
  return `<svg class="${cls}" viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <linearGradient id="lkBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f9c8f"/><stop offset="1" stop-color="#1f4f4c"/></linearGradient>
    <radialGradient id="lkGlow" cx=".5" cy=".38" r=".6"><stop offset="0" stop-color="#fff2c4" stop-opacity=".55"/><stop offset="1" stop-color="#fff2c4" stop-opacity="0"/></radialGradient>
  </defs>
  <rect x="4" y="4" width="112" height="112" rx="30" fill="url(#lkBg)"/>
  <rect x="4" y="4" width="112" height="112" rx="30" fill="url(#lkGlow)"/>
  <path d="M30 56 L22 18 Q40 26 50 44 Z" fill="#306f70" stroke="#173f3c" stroke-width="3" stroke-linejoin="round"/>
  <path d="M33 50 L28 27 Q39 33 45 44 Z" fill="#a6dfc6"/>
  <path d="M90 56 L98 18 Q80 26 70 44 Z" fill="#306f70" stroke="#173f3c" stroke-width="3" stroke-linejoin="round"/>
  <path d="M87 50 L92 27 Q81 33 75 44 Z" fill="#a6dfc6"/>
  <ellipse cx="60" cy="62" rx="34" ry="27" fill="#fff7dc" stroke="#173f3c" stroke-width="3"/>
  <ellipse cx="47" cy="62" rx="5" ry="7.5" fill="#25575b"/><ellipse cx="73" cy="62" rx="5" ry="7.5" fill="#25575b"/>
  <circle cx="48.6" cy="59.2" r="1.9" fill="#fff"/><circle cx="74.6" cy="59.2" r="1.9" fill="#fff"/>
  <ellipse cx="38" cy="71" rx="5" ry="3" fill="#edba9c"/><ellipse cx="82" cy="71" rx="5" ry="3" fill="#edba9c"/>
  <path d="M55 72 Q60 77 65 72" fill="none" stroke="#ed9b77" stroke-width="3" stroke-linecap="round"/>
  <path d="M60 39 l2.4 4.6 4.6 2.4 -4.6 2.4 -2.4 4.6 -2.4 -4.6 -4.6 -2.4 4.6 -2.4z" fill="#edc371" stroke="#b8862f" stroke-width="1"/>
  <path d="M26 88 Q60 100 94 88 L96 98 Q60 112 24 98 Z" fill="#e98c73" stroke="#173f3c" stroke-width="3" stroke-linejoin="round"/>
  <path d="M30 95 Q60 105 90 95" fill="none" stroke="#ffe2ac" stroke-width="2" stroke-dasharray="3 4"/>
  <path d="M88 96 Q104 104 110 96 Q106 110 92 106 Z" fill="#e98c73" stroke="#173f3c" stroke-width="3" stroke-linejoin="round"/>
</svg>`;
}

/** Data-URL version for the favicon / apple-touch fallback. */
export function logoEmblemDataURL() {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoEmblemSVG().replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
}
