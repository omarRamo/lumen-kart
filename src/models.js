// Lumen Kart — Art: procedural drivers, karts, items, portraits and HUD icons in the soft LUMEN style.
// Everything is built from Three.js primitives + CanvasTextures (no external assets). Static parts are
// merged per material into cached templates (one template per character), so a kart is ~45 draw calls,
// and every geometry / material / texture marked `userData.shared` is reused by all instances.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './theme.js';

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------------------------
const _c1 = new THREE.Color();
function hexShift(hex, lightMul = 1, satMul = 1, lightAdd = 0) {
  const hsl = {};
  _c1.setHex(hex).getHSL(hsl);
  _c1.setHSL(hsl.h, clamp(hsl.s * satMul, 0, 1), clamp(hsl.l * lightMul + lightAdd, 0, 1));
  return _c1.getHex();
}
function css(hex) { return '#' + (hex >>> 0).toString(16).padStart(6, '0').slice(-6); }
function cssShift(hex, lightMul, satMul = 1, lightAdd = 0) { return css(hexShift(hex, lightMul, satMul, lightAdd)); }

// ---------------------------------------------------------------------------------------------
// Soft pastel environment map (dawn sky over a meadow) so speculars stay warm whatever the scene.
// ---------------------------------------------------------------------------------------------
let _envTex = null;
function envMap() {
  if (_envTex) return _envTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0.0, '#8cc3e6');
  grd.addColorStop(0.32, '#cfe9ef');
  grd.addColorStop(0.49, '#fff3da');
  grd.addColorStop(0.53, '#d6dcb0');
  grd.addColorStop(0.75, '#90ae78');
  grd.addColorStop(1.0, '#58744e');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  const blob = (x, y, r, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,250,235,${a})`);
    rg.addColorStop(1, 'rgba(255,250,235,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  };
  blob(60, 26, 30, 1); blob(170, 34, 40, 0.6); blob(225, 20, 18, 0.7);
  _envTex = new THREE.CanvasTexture(c);
  _envTex.mapping = THREE.EquirectangularReflectionMapping;
  _envTex.colorSpace = THREE.SRGBColorSpace;
  _envTex.userData.shared = true;
  return _envTex;
}

// ---------------------------------------------------------------------------------------------
// Quality / LOD. Read from window.__lumenQuality ('high' | 'medium' | 'low') when a model is built.
// `seg` scales small-detail tessellation, `big` scales hero shapes (heads, bodies), `detail` gates
// decorative extras (stitches, spots, specks, name decal, separate blink/ear/lantern parts).
// ---------------------------------------------------------------------------------------------
const QUALITY = {
  high: { name: 'high', seg: 0.62, big: 0.8, detail: 2, ribbon: 10 },
  medium: { name: 'medium', seg: 0.36, big: 0.48, detail: 1, ribbon: 7 },
  low: { name: 'low', seg: 0.26, big: 0.32, detail: 0, ribbon: 5 },
};
let Q = QUALITY.high;
function currentQuality() {
  let q = null;
  try { q = typeof window !== 'undefined' ? window.__lumenQuality : globalThis.__lumenQuality; } catch { q = null; }
  return QUALITY[q] || QUALITY.high;
}
function withQuality(q, fn) { const prev = Q; Q = q; try { return fn(); } finally { Q = prev; } }
const S = (n, min = 3) => Math.max(Q.detail ? min : Math.max(3, min - 1), Math.round(n * Q.seg));
const SB = (n, min = 4) => Math.max(min, Math.round(n * Q.big));

// ---------------------------------------------------------------------------------------------
// Surfaces: every static part is baked into ONE vertex-coloured geometry per moving group and drawn
// with a single shared shader. A "spec" carries the per-vertex colour + surface (glow, rough, metal):
//   glow 0..1 = emissive lift (1 = lamp), glow >= 2 = twinkling star speck (fract = phase).
// ---------------------------------------------------------------------------------------------
function spec(c, r = 0.6, m = 0, g = 0) { return { isSpec: true, c, r, m, g }; }
function stdMat(color, rough = 0.6, metal = 0, extra = null) {
  const e = extra && extra.emissive != null ? (extra.emissiveIntensity ?? 1) * 0.6 : 0;
  return spec(color, rough, metal, e);
}
// Soft "felt" fur: matte with a small emissive lift so the pastel colours never go muddy in shade.
function furMat(color, lift = 0.13) { return spec(color, 0.82, 0, lift); }
// Glowing colour (reads as light; picked up by bloom when the renderer has it).
const TWINKLE = { twinkleA: 2.0, twinkleB: 2.33, twinkleC: 2.66 };
function glowMat(color, boost = 1.2, extra = null, tag = '') { return spec(color, 0.9, 0, TWINKLE[tag] ?? Math.min(0.85, boost * 0.65)); }

const MAT = {
  get gold() { return spec(0xedc371, 0.35, 0.45, 0.22); },
  get dark() { return spec(0x2c3a40, 0.7, 0.05, 0); },
  get tire() { return spec(0x3d4650, 0.9, 0, 0.02); },
  get shine() { return spec(0xffffff, 0.3, 0, 0.6); },
  get lamp() { return spec(0xfff1c4, 0.9, 0, Math.min(1.15, Q.detail >= 1 ? 1.15 : 0.5)); },
};

// Real (non vertex-colour) materials: cached by key.
const _mats = new Map();
function cached(key, make) {
  let m = _mats.get(key);
  if (!m) { m = make(); m.userData.shared = true; _mats.set(key, m); }
  return m;
}
function realStd(color, rough = 0.6, metal = 0, extra = null, tag = '') {
  return cached(`std:${color}:${rough}:${metal}:${tag}`, () => new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, envMap: envMap(), envMapIntensity: 0.6, ...(extra || {}),
  }));
}
function addMat(color, opacity = 0.5, tag = '') {
  return cached(`add:${color}:${opacity}:${tag}`, () => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  }));
}

// The one shader for every vertex-coloured part (shared program; per-kart clones only differ in
// uniforms, e.g. the aurora/star emissive tint).
const U_TIME = { value: 0 };
function makeLumenMaterial() {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 1, envMap: envMap(), envMapIntensity: 0.55, emissive: 0x000000,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U_TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute vec3 surf;\nvarying vec3 vSurf;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvSurf = surf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <color_pars_fragment>', '#include <color_pars_fragment>\nvarying vec3 vSurf;\nuniform float uTime;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.y;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.z;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float lumGlow = vSurf.x;
if (lumGlow > 1.5) lumGlow = 0.3 + 0.9 * max(0.0, sin(uTime * 3.0 + fract(lumGlow) * 18.85));
totalEmissiveRadiance += diffuseColor.rgb * lumGlow;`);
  };
  m.customProgramCacheKey = () => 'lumen-vc-1';
  return m;
}
let _lumenMat = null;
function lumenMat() { if (!_lumenMat) { _lumenMat = makeLumenMaterial(); _lumenMat.userData.shared = true; } return _lumenMat; }

// ---------------------------------------------------------------------------------------------
// Canvas textures (cached)
// ---------------------------------------------------------------------------------------------
const _tex = new Map();
function cachedTex(key, draw, w = 256, h = 256, opts = {}) {
  let t = _tex.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
  t.userData.shared = true;
  _tex.set(key, t);
  return t;
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// LUMEN 2D primitives (same curves as ../lumen/js/world-art.js) — used by portraits, icons, decals.
function p2Ellipse(g, x, y, rx, ry, color, rot = 0) {
  g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  if (color) { g.fillStyle = color; g.fill(); }
}
function p2Star(g, x, y, size, color, pinch = 0.18) {
  g.fillStyle = color; g.beginPath(); g.moveTo(x, y - size);
  g.quadraticCurveTo(x + size * pinch, y - size * pinch, x + size, y);
  g.quadraticCurveTo(x + size * pinch, y + size * pinch, x, y + size);
  g.quadraticCurveTo(x - size * pinch, y + size * pinch, x - size, y);
  g.quadraticCurveTo(x - size * pinch, y - size * pinch, x, y - size); g.fill();
}
function p2Leaf(g, x, y, size, angle, color, w = 1) {
  g.save(); g.translate(x, y); g.rotate(angle); g.fillStyle = color;
  g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-size * 0.6 * w, -size * 0.4, -size * 0.5 * w, -size, 0, -size * 1.5);
  g.bezierCurveTo(size * 0.5 * w, -size, size * 0.6 * w, -size * 0.4, 0, 0); g.fill(); g.restore();
}
function p2Stroke(g, pts, color, width = 2, dash = null) {
  g.save();
  if (dash) g.setLineDash(dash);
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
  g.restore();
}

function scarfTexture(color, stitch, kind = 'scarf') {
  return cachedTex(`scarf:${kind}:${color}:${stitch}`, (g, w, h) => {
    // u across the ribbon, canvas top = neck end, bottom = fringed tip.
    g.clearRect(0, 0, w, h);
    const base = css(color), edge = cssShift(color, 0.82), hi = cssShift(color, 1.0, 1.0, 0.08);
    const body = h * 0.9;
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, edge); grd.addColorStop(0.2, base); grd.addColorStop(0.5, hi); grd.addColorStop(0.8, base); grd.addColorStop(1, edge);
    g.fillStyle = grd; g.fillRect(0, 0, w, body);
    // soft knit threads (like the 2D hatching)
    g.strokeStyle = kind === 'veil' ? 'rgba(183,166,255,0.16)' : 'rgba(106,64,88,0.16)'; g.lineWidth = 1;
    for (let y = -w; y < body; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w * 0.6); g.stroke(); }
    if (kind === 'veil') {
      // starry night: little sparkles + dots
      let s = 7;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let i = 0; i < 26; i++) {
        const x = 6 + rnd() * (w - 12), y = 6 + rnd() * (body - 12);
        if (i % 4 === 0) p2Star(g, x, y, 3 + rnd() * 2.5, '#fff6d8', 0.22);
        else p2Ellipse(g, x, y, 1 + rnd() * 1.2, 1 + rnd() * 1.2, rnd() > 0.5 ? '#d9ccff' : '#fff6d8');
      }
    }
    // dotted golden stitching down the middle and along both borders
    g.fillStyle = css(stitch);
    for (let y = 4; y < body - 2; y += 9) {
      roundRectPath(g, w * 0.5 - 1.6, y, 3.2, 5.2, 1.6); g.fill();
    }
    g.globalAlpha = 0.55;
    for (let y = 8; y < body - 2; y += 9) {
      g.beginPath(); g.arc(w * 0.12, y, 1.3, 0, TAU); g.fill();
      g.beginPath(); g.arc(w * 0.88, y, 1.3, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    // fringe
    g.fillStyle = edge;
    const tassels = 5;
    for (let i = 0; i < tassels; i++) {
      const x0 = (i / tassels) * w + 2, x1 = ((i + 1) / tassels) * w - 2;
      roundRectPath(g, x0, body - 4, x1 - x0, h - body + 2, 3); g.fill();
    }
  }, 64, 256);
}

function decalMat(tex) {
  return cached(`decal:${tex.uuid}`, () => new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, roughness: 0.5, metalness: 0, envMap: envMap(), envMapIntensity: 0.4,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
}

function emblemTex(kind, color, accent) {
  return cachedTex(`emblem:${kind}:${color}:${accent}`, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 4, 0, TAU);
    g.fillStyle = kind === 'moon' ? '#2a2158' : '#fff7dc'; g.fill();
    g.lineWidth = 9; g.strokeStyle = css(accent); g.stroke();
    if (kind === 'moon') {
      g.fillStyle = '#d9ccff';
      g.beginPath(); g.arc(w / 2 - 4, h / 2, w * 0.27, 0, TAU); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(w / 2 + 12, h / 2 - 6, w * 0.24, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
      p2Star(g, w * 0.7, h * 0.66, 9, '#fff6d8', 0.22);
    } else {
      p2Star(g, w / 2, h / 2, w * 0.3, '#edc371', 0.2);
      p2Ellipse(g, w / 2, h / 2, w * 0.07, w * 0.07, '#fff0ce');
    }
  }, 128, 128);
}

function nameDecalTex(name, color, accent) {
  return cachedTex(`name:${name}:${color}:${accent}`, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const txt = String(name || '');
    g.font = `700 ${Math.round(h * 0.66)}px Fredoka, "Trebuchet MS", "Arial Rounded MT Bold", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 10; g.strokeStyle = cssShift(color, 0.55);
    g.strokeText(txt, w / 2, h / 2 + 3);
    g.fillStyle = '#fff7dc';
    g.fillText(txt, w / 2, h / 2 + 3);
    p2Star(g, 18, h / 2, 10, '#edc371', 0.22);
    p2Star(g, w - 18, h / 2, 10, '#edc371', 0.22);
  }, 256, 64);
}

function glowSpriteTex() {
  return cachedTex('glowsprite', (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    rg.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  }, 64, 64);
}
function glowSprite(color, size, opacity = 0.8) {
  const mat = cached(`spritemat:${color}:${opacity}`, () => new THREE.SpriteMaterial({
    map: glowSpriteTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

// Vertical alpha fade (opaque at v=0, transparent at v=1) for comet / shooting-star tails.
function fadeTex() {
  return cachedTex('fade', (g, w, h) => {
    const lg = g.createLinearGradient(0, h, 0, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.95)');
    lg.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
  }, 8, 64);
}
function tailMat(color, opacity = 0.75) {
  return cached(`tail:${color}:${opacity}`, () => new THREE.MeshBasicMaterial({
    color, map: fadeTex(), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y_UP = V3(0, 1, 0);
const Z_FWD = V3(0, 0, 1);
function M(p = [0, 0, 0], r = null, s = 1) {
  const sv = typeof s === 'number' ? V3(s, s, s) : V3(s[0], s[1], s[2]);
  const e = r ? new THREE.Euler(r[0], r[1], r[2], r[3] || 'XYZ') : new THREE.Euler();
  return new THREE.Matrix4().compose(V3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(e), sv);
}
function MQ(p, q, s = 1) {
  const sv = typeof s === 'number' ? V3(s, s, s) : V3(s[0], s[1], s[2]);
  return new THREE.Matrix4().compose(p.isVector3 ? p : V3(p[0], p[1], p[2]), q, sv);
}
function qFromTo(a, b) { return new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize()); }
function faceDir(dir, roll = 0) {
  const q = qFromTo(Z_FWD, dir);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(Z_FWD, roll));
  return q;
}

function roundedShape(points, radius) {
  const s = new THREE.Shape();
  const n = points.length;
  const P = points.map((p) => new THREE.Vector2(p[0], p[1]));
  for (let i = 0; i < n; i++) {
    const prev = P[(i - 1 + n) % n], cur = P[i], next = P[(i + 1) % n];
    const r = Array.isArray(radius) ? radius[i] : radius;
    const d1 = prev.clone().sub(cur), d2 = next.clone().sub(cur);
    const rr = Math.min(r, d1.length() * 0.45, d2.length() * 0.45);
    const a = cur.clone().add(d1.normalize().multiplyScalar(rr));
    const b = cur.clone().add(d2.normalize().multiplyScalar(rr));
    if (i === 0) s.moveTo(a.x, a.y); else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
  }
  s.closePath();
  return s;
}
// LUMEN four-point sparkle star.
function sparkleShape(r, pinch = 0.26) {
  const s = new THREE.Shape();
  const k = r * pinch;
  s.moveTo(0, r);
  s.quadraticCurveTo(k, k, r, 0);
  s.quadraticCurveTo(k, -k, 0, -r);
  s.quadraticCurveTo(-k, -k, -r, 0);
  s.quadraticCurveTo(-k, k, 0, r);
  return s;
}
// LUMEN leaf (base at origin, tip at +Y 1.5*size).
function leafShape(size, w = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-size * 0.6 * w, size * 0.4, -size * 0.5 * w, size, 0, size * 1.5);
  s.bezierCurveTo(size * 0.5 * w, size, size * 0.6 * w, size * 0.4, 0, 0);
  return s;
}
function star5Shape(outer, inner, rnd) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = PI / 2 + (i / 10) * TAU; const r = i % 2 ? inner : outer; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return roundedShape(pts, rnd);
}
function crescentShape(r) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0.895, TAU - 0.895, false);
  s.absarc(0.45 * r, 0, 0.8 * r, -1.35, 1.35, true);
  return s;
}
function extrude(shape, depth, bevel, curveSegments = 5, bevelSegments = 2) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0 && Q.detail >= 1, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: Math.max(1, Math.round(bevelSegments * Q.seg + 0.3)), curveSegments: S(curveSegments, 2) });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Builder: collects parts in local space (matrix stack). Parts given a spec (or a 'paint'/'accent' slot)
// go into one vertex-coloured bucket; parts given a real Material are merged per material.
// Every geometry is normalised (non-indexed, Float32 position/normal/uv[+color/surf], no groups or
// morphs) so mergeGeometries cannot fail on mismatched attributes; if it still did, the parts are
// kept separately instead of producing a null geometry.
class Builder {
  constructor(slots = null) { this.parts = new Map(); this.stack = [new THREE.Matrix4()]; this.slots = slots || {}; }
  top() { return this.stack[this.stack.length - 1]; }
  push(m) { this.stack.push(this.top().clone().multiply(m)); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  add(geo, material, m = null) {
    const g0 = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    if (!g0.attributes.normal) g0.computeVertexNormals();
    const n = g0.attributes.position.count;
    const g = new THREE.BufferGeometry();
    const copy = (name, size) => {
      const a = g0.attributes[name];
      const arr = new Float32Array(n * size);
      if (a && a.itemSize === size) for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = a.getComponent(i, k);
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    };
    copy('position', 3); copy('normal', 3); copy('uv', 2);
    g0.dispose();
    g.applyMatrix4(m ? this.top().clone().multiply(m) : this.top());
    let sp = typeof material === 'string' ? this.slots[material] : material;
    if (!sp) sp = spec(0xff00ff);
    let key;
    if (sp.isSpec) {
      key = 'vc';
      const c = _c1.setHex(sp.c);
      const col = new Float32Array(n * 3), sf = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; sf[i * 3] = sp.g; sf[i * 3 + 1] = sp.r; sf[i * 3 + 2] = sp.m; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('surf', new THREE.BufferAttribute(sf, 3));
    } else key = sp.uuid;
    let e = this.parts.get(key);
    if (!e) { e = { material: sp.isSpec ? 'vc' : sp, geos: [] }; this.parts.set(key, e); }
    e.geos.push(g);
    return this;
  }
  build() {
    const out = [];
    for (const e of this.parts.values()) {
      let merged = null;
      try { merged = e.geos.length === 1 ? e.geos[0] : mergeGeometries(e.geos, false); } catch { merged = null; }
      if (merged) {
        if (merged !== e.geos[0]) e.geos.forEach((g) => g.dispose());
        merged.computeBoundingSphere(); merged.userData.shared = true; out.push({ material: e.material, geometry: merged });
      } else {
        for (const g of e.geos) { g.computeBoundingSphere(); g.userData.shared = true; out.push({ material: e.material, geometry: g }); }
      }
    }
    this.parts.clear();
    return out;
  }
}

// One mesh per built part; 'vc' parts use `vcMat` (default: the shared Lumen material).
function instantiate(parts, vcMat = null, cast = false) {
  const g = new THREE.Group();
  for (const p of parts) {
    const mat = p.material === 'vc' ? (vcMat || lumenMat()) : p.material;
    const mesh = new THREE.Mesh(p.geometry, mat);
    mesh.castShadow = cast && p.material === 'vc';
    mesh.receiveShadow = false;
    g.add(mesh);
  }
  return g;
}

// Tessellation follows the current quality (Q).
const sphere = (r = 1, w = 16, h = 12, ...rest) => new THREE.SphereGeometry(r, S(w, 5), S(h, 4), ...rest);
const bigSphere = (r, w, h, ...rest) => new THREE.SphereGeometry(r, SB(w, 8), SB(h, 6), ...rest);
const torusG = (r, t, rs = 8, ts = 16, arc = TAU) => new THREE.TorusGeometry(r, t, S(rs, 3), S(ts, 6), arc);
const cylG = (rt, rb, h, rs = 12, hs = 1, open = false, t0 = 0, tl = TAU) => new THREE.CylinderGeometry(rt, rb, h, S(rs, 5), hs, open, t0, tl);
const coneG = (r, h, rs = 10, hs = 1, open = false) => new THREE.ConeGeometry(r, h, S(rs, 4), hs, open);
const capG = (r, l, cs = 4, rs = 10) => new THREE.CapsuleGeometry(r, l, S(cs, 2), S(rs, 5));
const latheG = (pts, segs = 16) => new THREE.LatheGeometry(pts, S(segs, 6));
const rboxG = (w, h, d, seg = 2, r = 0.05) => (Q.detail >= 1 ? new RoundedBoxGeometry(w, h, d, Q.detail >= 2 && seg >= 3 ? 2 : 1, r) : new THREE.BoxGeometry(w, h, d));

const _geos = new Map();
function cachedGeo(key, make) {
  let g = _geos.get(key);
  if (!g) { g = make(); g.userData.shared = true; _geos.set(key, g); }
  return g;
}

// Tapered tube along a curve (tails, vines, stems).
function taperTube(points, radius, tipScale = 0.35, segs = 14, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  segs = S(segs, 4); radial = S(radial, 4);
  const tg = new THREE.TubeGeometry(curve, segs, radius, radial, false);
  const pos = tg.attributes.position;
  const P = V3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, s = lerp(1, tipScale, t);
    curve.getPointAt(t, P);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      pos.setXYZ(idx, P.x + (pos.getX(idx) - P.x) * s, P.y + (pos.getY(idx) - P.y) * s, P.z + (pos.getZ(idx) - P.z) * s);
    }
  }
  tg.computeVertexNormals();
  return { geo: tg, curve };
}

// Point + outward normal on an ellipsoid of radius R scaled by sc, at (yaw, pitch); +Z is the face.
function makeSurf(R, sc) {
  return (yaw, pitch, out = 0) => {
    const cp = Math.cos(pitch);
    const p = V3(Math.sin(yaw) * cp * R * sc[0], Math.sin(pitch) * R * sc[1], Math.cos(yaw) * cp * R * sc[2]);
    const n = V3(p.x / (sc[0] * sc[0]), p.y / (sc[1] * sc[1]), p.z / (sc[2] * sc[2])).normalize();
    if (out) p.addScaledVector(n, out);
    return { p, n };
  };
}

// ---------------------------------------------------------------------------------------------
// Characters: species sheets (LUMEN palette, soft rounded shapes, big dark oval eyes)
// ---------------------------------------------------------------------------------------------
const HAT_TO_SPECIES = { leaves: 'fox', chechia: 'fennec', cap: 'raccoon', shell: 'crab', leafcap: 'frog', goggles: 'jaguar', mane: 'lion', stars: 'night', crown: 'lion', mushroom: 'frog', horns: 'jaguar', bow: 'fennec' };
const SPECIES_LIST = ['fox', 'fennec', 'raccoon', 'crab', 'frog', 'jaguar', 'lion', 'night'];

function normChar(character) {
  const c = character || {};
  const species = SPECIES_LIST.includes(c.species) ? c.species : (HAT_TO_SPECIES[c.hat] || 'fox');
  return {
    id: c.id || 'racer',
    name: c.name || 'Racer',
    species,
    color: Number.isFinite(c.color) ? c.color : PALETTE.lumenTeal,
    accent: Number.isFinite(c.accent) ? c.accent : PALETTE.scarf,
    skin: Number.isFinite(c.skin) ? c.skin : PALETTE.cream,
    hat: c.hat || '',
    // Optional unlockable scarf colour for Lumen (defaults to the accent / canonical coral).
    scarf: Number.isFinite(c.scarf) ? c.scarf : null,
  };
}

// Per-species sheet. Coordinates: head-local (centre of the head at origin, +Z = face).
function speciesSheet(ch) {
  const base = {
    species: ch.species,
    headR: 0.34, headScale: [1.1, 0.95, 1.0], headY: 0.27,
    fur: ch.color, face: ch.skin, faceMode: 'muzzle', belly: ch.skin, legs: null, feet: hexShift(ch.color, 0.62),
    hands: ch.color, handKind: 'paw', torso: [0.25, 0.27, 0.22],
    eyes: { color: 0x2b2230, yaw: 0.33, pitch: 0.1, w: 0.046, h: 0.074 },
    cheek: 0xf0a69a, cheekPitch: -0.12, cheekYaw: 0.66,
    mouth: { color: 0x8a4a46, r: 0.04, pitch: -0.36, tube: 0.012 },
    nose: { color: 0x3a2a2a, size: 0.032, pitch: -0.2 },
    muzzle: { pitch: -0.28, size: [0.55, 0.42, 0.42], fwd: 0.62 },
    ears: null, tail: null, scarf: null, neck: null,
  };
  switch (ch.species) {
    case 'fox': return {
      ...base,
      headR: 0.355, headScale: [1.14, 0.94, 0.98], faceMode: 'full', fur: ch.color, face: ch.skin,
      belly: PALETTE.lumenMint, feet: 0x234f53, chestStar: true, stitches: 0xd2e4b3,
      eyes: { color: PALETTE.eye, yaw: 0.31, pitch: 0.05, w: 0.052, h: 0.088 },
      cheek: PALETTE.cheek, cheekYaw: 0.64, cheekPitch: -0.15,
      mouth: { color: 0xed9b77, r: 0.058, pitch: -0.3, tube: 0.018 },
      nose: null, muzzle: null, browStar: PALETTE.starGold,
      ears: { kind: 'leaf', size: 0.32, w: 1, outer: PALETTE.lumenDeep, inner: PALETTE.leafLight, x: 0.13, y: 0.13, z: -0.06, splay: 0.5, tilt: -0.22, flex: 1 },
      scarf: { color: ch.scarf ?? ch.accent, stitch: PALETTE.scarfStitch, kind: 'scarf', width: 0.24, len: 1.25 },
    };
    case 'fennec': return {
      ...base,
      headR: 0.33, headScale: [1.1, 0.94, 1.0], fur: ch.color, face: ch.skin,
      ears: { kind: 'leaf', size: 0.33, w: 1.45, outer: ch.color, inner: 0xf6c1a8, x: 0.15, y: 0.1, z: -0.04, splay: 0.78, tilt: -0.12, flex: 1.2 },
      hat: 'chechia', neck: { color: ch.accent, kind: 'kerchief' },
      tail: { kind: 'bushy', color: ch.color, tip: ch.skin },
      eyes: { color: 0x3a2a20, yaw: 0.33, pitch: 0.1, w: 0.048, h: 0.078 },
    };
    case 'raccoon': return {
      ...base,
      headR: 0.34, headScale: [1.14, 0.93, 1.0], fur: ch.color, face: ch.skin, faceMode: 'mask',
      ears: { kind: 'round', size: 0.1, outer: hexShift(ch.color, 0.7), inner: ch.skin, x: 0.23, y: 0.19, z: -0.05, splay: 0.5, tilt: -0.1, flex: 0.6 },
      hat: 'cap', tail: { kind: 'ringed', color: ch.color, ring: 0x2e3440 },
      eyes: { color: 0x1d232c, yaw: 0.34, pitch: 0.1, w: 0.044, h: 0.07, out: 0.026 },
      feet: 0x3a414c, hands: 0x4a5260,
    };
    case 'crab': return {
      ...base,
      headR: 0.33, headScale: [1.38, 0.78, 1.0], headY: 0.2, fur: ch.color, face: ch.color, faceMode: 'crab', belly: ch.skin,
      torso: [0.2, 0.2, 0.18], handKind: 'claw', hands: ch.color, feet: hexShift(ch.color, 0.8),
      eyes: { color: 0x2b1c22, yaw: 0, pitch: 0, w: 0.045, h: 0.07, stalks: true },
      cheek: 0xffc0a8, cheekYaw: 0.5, cheekPitch: -0.2,
      mouth: { color: 0x8a2c2c, r: 0.05, pitch: -0.2, tube: 0.014 }, nose: null, muzzle: null,
      hat: 'shellclip',
    };
    case 'frog': return {
      ...base,
      headR: 0.34, headScale: [1.24, 0.8, 1.0], headY: 0.24, fur: ch.color, face: ch.skin, faceMode: 'frog', belly: ch.skin,
      eyes: { color: 0x1f2a22, yaw: 0, pitch: 0, w: 0.05, h: 0.072, bulge: true },
      cheek: 0xf59a9a, cheekYaw: 0.62, cheekPitch: -0.22,
      mouth: { color: 0x2d5a3a, r: 0.12, pitch: -0.24, tube: 0.015, wide: true, at: [0, -0.03, 0.352] }, nose: null, muzzle: null,
      hat: 'leafcap', neck: { color: ch.accent, kind: 'kerchief' }, hands: hexShift(ch.color, 1.15), handKind: 'frog', feet: hexShift(ch.color, 0.8),
    };
    case 'jaguar': return {
      ...base,
      headR: 0.34, headScale: [1.12, 0.94, 1.0], fur: ch.color, face: ch.skin,
      ears: { kind: 'round', size: 0.095, outer: ch.color, inner: ch.skin, x: 0.23, y: 0.18, z: -0.04, splay: 0.55, tilt: -0.12, flex: 0.5 },
      hat: 'goggles', spots: 0x5a3a1c, tail: { kind: 'spotted', color: ch.color, ring: 0x4a2f18 },
      eyes: { color: 0x2b2a1a, yaw: 0.33, pitch: 0.06, w: 0.046, h: 0.074 },
      nose: { color: 0x7a3a34, size: 0.036, pitch: -0.2 },
    };
    case 'lion': return {
      ...base,
      headR: 0.33, headScale: [1.1, 0.95, 1.0], fur: ch.color, face: ch.skin,
      ears: { kind: 'round', size: 0.085, outer: ch.color, inner: ch.skin, x: 0.21, y: 0.22, z: 0.03, splay: 0.45, tilt: -0.1, flex: 0.4 },
      hat: 'mane', tail: { kind: 'tuft', color: ch.color, tip: ch.accent }, torso: [0.27, 0.28, 0.24],
      eyes: { color: 0x3a2618, yaw: 0.33, pitch: 0.08, w: 0.046, h: 0.074 },
      nose: { color: 0x7a3f30, size: 0.038, pitch: -0.2 },
    };
    case 'night': return {
      ...base,
      headR: 0.35, headScale: [1.12, 0.95, 0.98], faceMode: 'full', fur: ch.color, face: ch.skin,
      belly: hexShift(ch.color, 1.25), feet: 0x17123a, hands: ch.color,
      eyes: { color: ch.accent, yaw: 0.3, pitch: 0.06, w: 0.05, h: 0.07, glow: true },
      cheek: null, mouth: { color: ch.accent, r: 0.04, pitch: -0.3, tube: 0.012, glow: true }, nose: null, muzzle: null,
      browMoon: ch.accent,
      ears: { kind: 'leaf', size: 0.32, w: 0.8, outer: ch.color, inner: ch.accent, innerGlow: true, x: 0.13, y: 0.13, z: -0.07, splay: 0.42, tilt: -0.3, flex: 0.8 },
      scarf: { color: 0x241c58, stitch: ch.accent, kind: 'veil', width: 0.26, len: 1.3 },
      starry: true,
    };
    default: return base;
  }
}

// --- ear geometry (cached per kind/size)
function earGeometry(kind, size, w) {
  return cachedGeo(`ear:${kind}:${size}:${w}:${Q.name}`, () => {
    if (kind === 'round') return extrude(roundedShape([[-size, 0], [size, 0], [size * 0.95, size * 0.9], [0, size * 1.6], [-size * 0.95, size * 0.9]], size * 0.7), size * 0.35, size * 0.18, 4, 1);
    return extrude(leafShape(size, w), size * 0.16, size * 0.07, 10);
  });
}

// --- head
function buildHead(ch, sp) {
  const b = new Builder();
  const eyesB = new Builder();
  const R = sp.headR, sc = sp.headScale;
  const surf = makeSurf(R, sc);
  const fur = furMat(sp.fur);
  const face = furMat(sp.face, 0.16);
  const headMat = sp.faceMode === 'full' ? face : fur;
  b.push(M([0, sp.headY, 0]));
  b.add(bigSphere(R, 26, 18), headMat, M([0, 0, 0], null, sc));

  // muzzle / masks
  let muzzle = null;
  if (sp.faceMode === 'muzzle' || sp.faceMode === 'mask') {
    const mz = sp.muzzle;
    const { p } = surf(0, mz.pitch);
    muzzle = { c: V3(0, p.y * 0.86, p.z * mz.fwd), r: V3(R * mz.size[0] * sc[0], R * mz.size[1], R * mz.size[2] + 0.02) };
    b.add(sphere(1, 22, 16), face, M([muzzle.c.x, muzzle.c.y, muzzle.c.z], null, [muzzle.r.x, muzzle.r.y, muzzle.r.z]));
  }
  if (sp.faceMode === 'mask') {
    const maskM = furMat(0x353c48, 0.08);
    for (const sx of [-1, 1]) {
      const { p, n } = surf(sx * 0.36, 0.1, -0.012);
      b.add(sphere(1, 16, 12), maskM, MQ(p, faceDir(n, sx * 0.35), [0.11, 0.075, 0.022]));
      // pale eye ring so the eyes read on the dark mask
      const ring = surf(sx * 0.34, 0.1, 0.0);
      b.add(sphere(1, 14, 10), face, MQ(ring.p, faceDir(ring.n), [0.06, 0.084, 0.026]));
      // white brows
      const br = surf(sx * 0.3, 0.42, -0.01);
      if (Q.detail >= 1) b.add(sphere(1, 12, 8), face, MQ(br.p, faceDir(br.n, sx * -0.3), [0.07, 0.03, 0.02]));
    }
  }
  if (sp.faceMode === 'frog') {
    // pale lower jaw / chin
    b.add(sphere(1, 22, 14), face, M([0, -R * 0.26, R * 0.16], null, [R * sc[0] * 0.86, R * 0.48, R * 0.86]));
  }

  // eyes (separate group so they can blink)
  const E = sp.eyes;
  let eyePos = [];
  if (E.stalks) {
    const stalkMat = furMat(hexShift(sp.fur, 1.05));
    for (const sx of [-1, 1]) {
      const base = V3(sx * 0.12, R * sc[1] * 0.75, R * 0.35);
      const top = V3(sx * 0.17, R * sc[1] + 0.16, R * 0.42);
      const d = top.clone().sub(base);
      b.add(cylG(0.03, 0.04, d.length(), 10), stalkMat, MQ(base.clone().add(top).multiplyScalar(0.5), qFromTo(Y_UP, d)));
      b.add(sphere(0.085, 18, 14), face, M([top.x, top.y, top.z]));
      eyePos.push({ p: V3(top.x, top.y, top.z + 0.07), n: V3(sx * 0.15, 0.05, 1).normalize() });
    }
  } else if (E.bulge) {
    for (const sx of [-1, 1]) {
      const c = V3(sx * R * 0.52, R * sc[1] * 0.82, R * 0.32);
      b.add(sphere(0.13, 20, 14), fur, M([c.x, c.y, c.z]));
      eyePos.push({ p: V3(c.x, c.y + 0.01, c.z + 0.11), n: V3(sx * 0.25, 0.1, 1).normalize() });
    }
  } else {
    for (const sx of [-1, 1]) {
      const s = surf(sx * E.yaw, E.pitch, E.out ?? -E.w * 0.2);
      eyePos.push(s);
    }
  }
  const pivot = V3(0, (eyePos[0].p.y + eyePos[1].p.y) / 2, (eyePos[0].p.z + eyePos[1].p.z) / 2);
  const eyeMat = E.glow ? glowMat(E.color, 1.5, null, 'eye') : stdMat(E.color, 0.25, 0, { envMapIntensity: 0.9 }, 'eye');
  eyesB.push(M([0, -pivot.y, -pivot.z]));
  eyePos.forEach(({ p, n }, i) => {
    const sx = i === 0 ? -1 : 1;
    eyesB.push(MQ(p, faceDir(n, sx * 0.05)));
    eyesB.add(sphere(1, 14, 10), eyeMat, M([0, 0, 0], null, [E.w, E.h, E.w * 0.6]));
    if (!E.glow) {
      eyesB.add(sphere(1, 10, 8), MAT.shine, M([E.w * 0.32, E.h * 0.38, E.w * 0.5], null, [E.w * 0.36, E.h * 0.3, E.w * 0.18]));
      eyesB.add(sphere(1, 8, 6), MAT.shine, M([-E.w * 0.3, -E.h * 0.45, E.w * 0.48], null, [E.w * 0.16, E.h * 0.12, E.w * 0.1]));
    } else {
      eyesB.add(sphere(1, 10, 8), glowMat(0xffffff, 1.3, null, 'eyecore'), M([0, E.h * 0.1, E.w * 0.42], null, [E.w * 0.4, E.h * 0.35, E.w * 0.2]));
    }
    eyesB.pop();
  });
  eyesB.pop();

  // cheeks
  if (sp.cheek != null) {
    const cm = stdMat(sp.cheek, 0.8, 0, { transparent: true, opacity: 0.85 }, 'cheek');
    for (const sx of [-1, 1]) {
      const { p, n } = sp.faceMode === 'crab' ? surf(sx * sp.cheekYaw, sp.cheekPitch, 0.002) : surf(sx * sp.cheekYaw, sp.cheekPitch, 0.002);
      b.add(sphere(1, 14, 10), cm, MQ(p, faceDir(n), [0.055, 0.032, 0.014]));
    }
  }
  // nose
  if (sp.nose) {
    const nm = stdMat(sp.nose.color, 0.35, 0, null, 'nose');
    if (muzzle) b.add(sphere(1, 14, 10), nm, M([0, muzzle.c.y + muzzle.r.y * 0.5, muzzle.c.z + muzzle.r.z * 0.84], [-0.3, 0, 0], [sp.nose.size * 1.3, sp.nose.size * 0.85, sp.nose.size]));
    else { const { p, n } = surf(0, sp.nose.pitch, 0.01); b.add(sphere(1, 14, 10), nm, MQ(p, faceDir(n), [sp.nose.size * 1.3, sp.nose.size * 0.85, sp.nose.size])); }
  }
  // mouth
  if (sp.mouth) {
    const mo = sp.mouth;
    const mm = mo.glow ? glowMat(mo.color, 1.2, null, 'mouth') : stdMat(mo.color, 0.5, 0, null, 'mouth');
    let { p, n } = surf(0, mo.pitch, 0.004);
    if (mo.at) { p = V3(mo.at[0], mo.at[1], mo.at[2]); n = V3(0, 0.15, 1).normalize(); }
    if (muzzle) {
      p = V3(0, muzzle.c.y - muzzle.r.y * 0.12, muzzle.c.z + muzzle.r.z * 0.98);
      n = V3(0, -0.2, 1).normalize();
      // "w" fox / cat mouth: two small arcs
      for (const sx of [-1, 1]) b.add(torusG(0.026, 0.01, 6, 12, PI), mm, MQ(V3(sx * 0.026, p.y, p.z - 0.004), faceDir(n, PI)));
    } else {
      b.add(torusG(mo.r, mo.tube, 8, 18, PI), mm, MQ(p, faceDir(n, PI), mo.wide ? [1, 0.45, 1] : [1, 0.62, 1]));
    }
  }
  // forehead ornaments
  if (sp.browStar != null) {
    const { p, n } = surf(0, 0.58, 0.005);
    b.add(extrude(sparkleShape(0.07, 0.24), 0.016, 0.008), stdMat(sp.browStar, 0.4, 0.3, { emissive: sp.browStar, emissiveIntensity: 0.35 }, 'browstar'), MQ(p, faceDir(n)));
  }
  if (sp.browMoon != null) {
    const { p, n } = surf(0, 0.55, 0.005);
    b.add(extrude(crescentShape(0.065), 0.016, 0.008), glowMat(sp.browMoon, 1.4, null, 'moon'), MQ(p, faceDir(n, -0.5)));
  }
  if (sp.spots != null && Q.detail >= 1) {
    const spotM = furMat(sp.spots, 0.05);
    for (const [yw, pt, s] of [[0, 1.1, 0.03], [0.5, 0.85, 0.026], [-0.5, 0.85, 0.026], [1.1, 0.55, 0.028], [-1.1, 0.55, 0.028], [2.3, 0.6, 0.03], [-2.3, 0.6, 0.03], [PI, 0.7, 0.032], [2.7, 0.15, 0.028], [-2.7, 0.15, 0.028], [1.6, 0.2, 0.026], [-1.6, 0.2, 0.026]]) {
      const { p, n } = surf(yw, pt, -0.004);
      b.add(new THREE.CircleGeometry(1, S(9, 5)), spotM, MQ(p.addScaledVector(n, 0.006), faceDir(n), [s * 1.2, s, 1]));
    }
  }
  if (sp.starry) addStarSpecks(b, surf, Q.detail >= 1 ? 9 : 5, 3);

  addHat(b, ch, sp, surf);
  b.pop();

  // ears
  const ears = [];
  if (sp.ears) {
    const e = sp.ears;
    const geo = earGeometry(e.kind, e.size, e.w || 1);
    const innerGeo = earGeometry(e.kind, e.size * (e.kind === 'round' ? 0.62 : 0.66), (e.w || 1) * 0.92);
    const innerMat = e.innerGlow ? glowMat(e.inner, 1.05, null, 'earglow') : furMat(e.inner, 0.18);
    for (const sx of [-1, 1]) {
      const eb = new Builder();
      eb.add(geo.clone(), furMat(e.outer));
      if (Q.detail >= 1 || e.kind !== 'round') eb.add(innerGeo.clone(), innerMat, M([0, e.kind === 'round' ? e.size * 0.18 : e.size * 0.12, e.size * 0.12]));
      ears.push({
        parts: eb.build(),
        pos: V3(sx * e.x, sp.headY + e.y, e.z),
        rot: new THREE.Euler(e.tilt, 0, -sx * e.splay, 'XYZ'),
        flex: e.flex || 1, side: sx,
      });
    }
  }
  return { head: b.build(), eyes: { parts: eyesB.build(), pivot: V3(0, sp.headY + pivot.y, pivot.z) }, ears };
}

function addStarSpecks(b, surf, count, seed) {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const mats = [glowMat(0xfff6d8, 1.3, null, 'twinkleA'), glowMat(0xd9ccff, 1.3, null, 'twinkleB'), glowMat(0xffffff, 1.4, null, 'twinkleC')];
  for (let i = 0; i < count; i++) {
    const yaw = (rnd() - 0.5) * TAU, pitch = (rnd() - 0.3) * 1.6;
    if (Math.abs(yaw) < 0.6 && pitch > -0.2 && pitch < 0.4) continue; // keep the face clean
    const { p, n } = surf(yaw, pitch, 0.002);
    const m = mats[i % 3];
    if (i % 3 === 0) b.add(extrude(sparkleShape(0.035, 0.22), 0.008, 0), m, MQ(p, faceDir(n, rnd())));
    else b.add(sphere(1, 6, 4), m, MQ(p, faceDir(n), [0.012 + rnd() * 0.01, 0.012 + rnd() * 0.01, 0.006]));
  }
}

function addHat(b, ch, sp, surf) {
  const R = sp.headR, sc = sp.headScale;
  const top = R * sc[1];
  switch (sp.hat) {
    case 'chechia': {
      const red = furMat(0xc8303a, 0.12);
      b.push(M([0.02, top * 0.86, -0.02], [-0.18, 0, -0.12]));
      b.add(cylG(0.15, 0.17, 0.14, 22), red, M([0, 0.06, 0]));
      b.add(torusG(0.15, 0.012, 6, 22), furMat(0xa8242e), M([0, 0.135, 0], [PI / 2, 0, 0]));
      // tassel: short cord + pompom, hanging over the side
      const navy = furMat(0x1f2a44, 0.1);
      const { geo } = taperTube([V3(0, 0.14, 0), V3(-0.06, 0.16, -0.02), V3(-0.14, 0.1, -0.05), V3(-0.17, 0.02, -0.06)], 0.012, 1, 8, 5);
      b.add(geo, navy);
      b.add(sphere(1, 10, 8), navy, M([-0.17, -0.02, -0.06], null, [0.03, 0.05, 0.03]));
      b.pop();
      break;
    }
    case 'cap': {
      const capM = furMat(ch.accent, 0.12);
      b.push(M([0, 0.025, -0.005], [-0.12, PI, 0]));
      b.add(sphere(R * 1.06, 26, 12, 0, TAU, 0, PI * 0.46), capM, M([0, 0, 0], null, [sc[0], sc[1] * 1.02, sc[2]]));
      b.add(cylG(0.2, 0.2, 0.028, 22, 1, false, -PI / 2, PI), capM, M([0, R * sc[1] * 0.2, R * 0.88], [0.12, 0, 0], [1.1, 1, 1.2]));
      if (Q.detail >= 1) b.add(sphere(0.03, 10, 8), furMat(0xfff7dc), M([0, R * sc[1] * 1.04, 0]));
      b.pop();
      // little sparkle badge on the (backwards) cap, seen from the chase camera
      const { p, n } = surf(PI, 0.62, 0.012);
      b.add(extrude(sparkleShape(0.05, 0.24), 0.01, 0.005), MAT.gold, MQ(p.add(V3(0, 0.02, 0)), faceDir(n)));
      break;
    }
    case 'shellclip': {
      const shellM = furMat(ch.accent, 0.2);
      const fan = roundedShape([[0, -0.02], [0.07, 0.05], [0.05, 0.085], [0, 0.095], [-0.05, 0.085], [-0.07, 0.05]], 0.02);
      const { p, n } = surf(-0.8, 0.55, 0.01);
      b.add(extrude(fan, 0.02, 0.01), shellM, MQ(p, faceDir(n, 0.4), 1.15));
      b.add(sphere(0.022, 10, 8), stdMat(0xfff4f0, 0.2, 0.1, null, 'pearl'), MQ(p.clone().addScaledVector(n, 0.025), faceDir(n)));
      // soft bumps along the carapace rim
      const bump = furMat(hexShift(ch.color, 1.08));
      for (let i = 0; i < 7; i++) {
        const yw = PI / 2 + (i / 6) * PI;
        const s = surf(yw, 0.32, -0.01);
        b.add(sphere(0.04, 10, 8), bump, M([s.p.x, s.p.y, s.p.z]));
      }
      break;
    }
    case 'leafcap': {
      const leafM = furMat(0xb4dc5a, 0.16);
      const g = extrude(leafShape(0.3, 1.5), 0.014, 0.012, 12);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, pos.getZ(i) - x * x * 1.4 + Math.sin(y * 4) * 0.01); }
      g.computeVertexNormals();
      b.push(M([0.02, top * 0.98, R * 0.3], [-PI / 2 + 0.38, 0.3, 0]));
      b.add(g, leafM);
      b.add(capG(0.008, 0.4, 2, 5), furMat(0x5f9a3a), M([0, 0.22, 0.014]));
      b.pop();
      const { geo } = taperTube([V3(0.02, top * 0.9, R * 0.3), V3(0.03, top * 0.98, R * 0.42), V3(0.08, top * 1.04, R * 0.46)], 0.014, 0.6, 6, 5);
      b.add(geo, furMat(0x3f7f3a));
      break;
    }
    case 'goggles': {
      const strap = furMat(ch.accent === 0x2b2b2b ? 0x3a3330 : ch.accent, 0.06);
      const by = top * 0.5, br = R * Math.sqrt(1 - (by / top) ** 2) * 1.03;
      b.add(torusG(br, 0.024, 6, 32), strap, M([0, by, 0], [PI / 2 - 0.22, 0, 0], [sc[0], sc[2], 1]));
      const lens = stdMat(0x8fe3d6, 0.08, 0.2, { emissive: 0x2f9c92, emissiveIntensity: 0.45, envMapIntensity: 1.4 }, 'lens');
      for (const sx of [-1, 1]) {
        const { p, n } = surf(sx * 0.3, 0.58, 0.035);
        b.add(torusG(0.068, 0.024, 8, 18), MAT.gold, MQ(p, faceDir(n)));
        b.add(sphere(1, 16, 10), lens, MQ(p, faceDir(n), [0.062, 0.062, 0.025]));
      }
      break;
    }
    case 'mane': {
      const mane = furMat(ch.accent, 0.1);
      let s = 11;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const nPuff = Q.detail >= 2 ? 16 : 10;
      for (let i = 0; i < nPuff; i++) {
        const a = (i / nPuff) * TAU;
        const r = R * 1.12;
        b.add(Q.detail >= 2 ? sphere(1, 9, 7) : new THREE.IcosahedronGeometry(1, 0), mane, M([Math.cos(a) * r * sc[0], Math.sin(a) * r * 0.98 + 0.01, -0.06], null, 0.1 + rnd() * 0.03));
      }
      for (let i = 0; i < (Q.detail >= 1 ? 10 : 0); i++) {
        const a = (i / 10) * TAU + 0.3;
        b.add(Q.detail >= 2 ? sphere(1, 8, 6) : new THREE.IcosahedronGeometry(1, 0), mane, M([Math.cos(a) * R * 0.85 * sc[0], Math.sin(a) * R * 0.85, -0.2], null, 0.13 + rnd() * 0.03));
      }
      b.add(sphere(1, 14, 10), mane, M([0, 0, -0.26], null, [R * 1.0, R * 0.95, 0.16]));
      // curly tuft on the forehead
      b.add(sphere(1, 10, 8), mane, M([0.02, top * 0.98, 0.1], null, [0.07, 0.05, 0.07]));
      break;
    }
    default: break;
  }
}

// --- torso (driver group: pivot at hips)
function buildTorso(ch, sp) {
  const b = new Builder();
  const fur = furMat(sp.fur);
  const tw = sp.torso;
  b.add(bigSphere(1, 24, 16), fur, M([0, 0.25, 0], null, tw));
  if (sp.belly != null) {
    const bellyC = V3(0, 0.23, 0.1), br = [tw[0] * 0.66, tw[1] * 0.74, 0.14];
    b.add(sphere(1, 20, 14), furMat(sp.belly, 0.16), M([bellyC.x, bellyC.y, bellyC.z], null, br));
    const onBelly = (u, v, out = 0.004) => {
      const x = u * br[0], y = v * br[1];
      const z = br[2] * Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const n = V3(x / (br[0] * br[0]), y / (br[1] * br[1]), z / (br[2] * br[2])).normalize();
      return { p: V3(x, y, z).add(bellyC).addScaledVector(n, out), n };
    };
    if (sp.stitches != null && Q.detail >= 1) {
      const sm = furMat(sp.stitches, 0.2);
      for (let i = 0; i <= 12; i++) {
        const a = (160 + (i / 12) * 220) * PI / 180;
        const { p } = onBelly(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.002);
        b.add(new THREE.OctahedronGeometry(0.012, 0), sm, M([p.x, p.y, p.z]));
      }
    }
    if (sp.chestStar) {
      const { p, n } = onBelly(0, 0.12, 0.004);
      b.add(extrude(sparkleShape(0.075, 0.24), 0.018, 0.008), stdMat(PALETTE.chestStar, 0.4, 0.3, { emissive: PALETTE.chestStar, emissiveIntensity: 0.3 }, 'cheststar'), MQ(p, faceDir(n)));
      b.add(sphere(1, 8, 6), stdMat(0xfff0ce, 0.4, 0, { emissive: 0xfff0ce, emissiveIntensity: 0.4 }, 'chestcore'), MQ(p.clone().addScaledVector(n, 0.016), faceDir(n), [0.018, 0.018, 0.008]));
    }
  }
  if (sp.spots != null && Q.detail >= 1) {
    const spotM = furMat(sp.spots, 0.05);
    const surf = makeSurf(1, tw);
    for (const [yw, pt] of [[1.2, 0.3], [-1.2, 0.3], [1.6, -0.1], [-1.6, -0.1], [2.3, 0.4], [-2.3, 0.4], [PI, 0.1], [2.8, -0.3], [-2.8, -0.3], [1.9, 0.75], [-1.9, 0.75]]) {
      const { p, n } = surf(yw, pt, -0.004);
      b.add(new THREE.CircleGeometry(1, S(9, 5)), spotM, MQ(p.add(V3(0, 0.25, 0)).addScaledVector(n, 0.006), faceDir(n), [0.034, 0.028, 1]));
    }
  }
  if (sp.starry && Q.detail >= 1) addStarSpecks(b, (yw, pt, out) => { const r = makeSurf(1, tw)(yw, pt, out); r.p.y += 0.25; return r; }, 12, 5);
  // shoulders
  for (const sx of [-1, 1]) b.add(sphere(0.085, 12, 10), fur, M([sx * (tw[0] - 0.04), 0.4, 0.03]));
  // arms, baked from the shoulders to the paws' neutral place on the steering wheel
  {
    const wheelM = new THREE.Matrix4().compose(K.wheelC, new THREE.Quaternion().setFromEuler(new THREE.Euler(K.wheelTilt, 0, 0)), V3(1, 1, 1));
    const armMat = furMat(sp.handKind === 'claw' ? sp.hands : sp.fur);
    for (const sx of [1, -1]) {
      const sh = V3(sx * (tw[0] - 0.04), 0.4, 0.03);
      const hand = V3(Math.cos(sx > 0 ? 0.35 : PI - 0.35) * K.wheelRad * 0.95, Math.sin(0.35) * K.wheelRad - 0.02, -0.06).applyMatrix4(wheelM).sub(K.hip);
      const d = hand.clone().sub(sh);
      b.add(capG(0.062, Math.max(0.05, d.length() - 0.07), 3, 8), armMat, MQ(sh.clone().add(hand).multiplyScalar(0.5), qFromTo(Y_UP, d)));
    }
  }
  // legs toward the pedals
  const legMat = furMat(sp.legs ?? sp.fur);
  const footMat = furMat(sp.feet, 0.08);
  for (const sx of [-1, 1]) {
    const hipP = V3(sx * 0.12, 0.08, 0.05), knee = V3(sx * 0.15, 0.2, 0.4), foot = V3(sx * 0.13, 0.05, 0.72);
    const seg = (a0, a1, r) => { const d = a1.clone().sub(a0); b.add(capG(r, d.length(), 3, 8), legMat, MQ(a0.clone().add(a1).multiplyScalar(0.5), qFromTo(Y_UP, d))); };
    if (Q.detail < 2) continue; // legs are hidden under the cowl from every gameplay view
    seg(hipP, knee, 0.085);
    seg(knee, foot, 0.075);
    b.add(sphere(1, 12, 8), footMat, M([foot.x, foot.y + 0.01, foot.z + 0.05], null, [0.085, 0.065, 0.12]));
  }
  // neck wear
  if (sp.scarf) {
    const sm = scarfWrapMat(sp.scarf.color);
    b.add(torusG(0.135, 0.058, 8, 20), sm, M([0, 0.47, 0.0], [PI / 2 + 0.12, 0, 0], [1.08, 0.98, 1]));
    const stitch = furMat(sp.scarf.stitch, 0.3);
    for (let i = 0; i < (Q.detail >= 1 ? 14 : 0); i++) {
      const a = (i / 14) * TAU;
      b.add(new THREE.OctahedronGeometry(0.012, 0), stitch, M([Math.cos(a) * 0.19 * 1.08, 0.47 + Math.sin(a) * 0.024, Math.sin(a) * 0.19 * 0.98]));
    }
    b.add(sphere(1, 12, 10), sm, M([0.03, 0.45, -0.17], null, [0.075, 0.065, 0.06]));
  } else if (sp.neck) {
    const km = furMat(sp.neck.color, 0.14);
    b.add(torusG(0.13, 0.045, 8, 22), km, M([0, 0.47, 0.0], [PI / 2 + 0.12, 0, 0], [1.08, 0.98, 1]));
    b.add(coneG(0.08, 0.13, 3), km, M([0, 0.42, 0.17], [0.3 + PI, 0, 0], [1.3, 1, 0.5]));
  }
  return b.build();
}
function scarfWrapMat(color) { return furMat(color, 0.16); }

// --- tail (pivot at the tail base, driver space)
function buildTail(sp) {
  const t = sp.tail;
  if (!t) return null;
  const b = new Builder();
  const pts = [V3(0, 0, 0), V3(0.1, 0.06, -0.12), V3(0.26, 0.24, -0.2), V3(0.32, 0.5, -0.16), V3(0.26, 0.66, -0.1)];
  if (t.kind === 'bushy') {
    const { geo, curve } = taperTube(pts, 0.085, 0.9, 14, 10);
    b.add(geo, furMat(t.color));
    const tip = curve.getPointAt(1);
    b.add(sphere(1, 14, 10), furMat(t.tip, 0.16), M([tip.x, tip.y + 0.02, tip.z], null, [0.085, 0.12, 0.085]));
    const mid = curve.getPointAt(0.55);
    b.add(sphere(1, 14, 10), furMat(t.color), M([mid.x, mid.y, mid.z], null, [0.105, 0.14, 0.105]));
  } else if (t.kind === 'ringed') {
    const curve = new THREE.CatmullRomCurve3(pts);
    const nr = Q.detail >= 2 ? 6 : 4;
    for (let i = 0; i <= nr; i++) {
      const p = curve.getPointAt(0.08 + (i / nr) * 0.92);
      const r = lerp(0.085, 0.07, i / nr);
      b.add(sphere(1, 10, 7), furMat(i % 2 ? t.ring : t.color, i % 2 ? 0.06 : 0.13), M([p.x, p.y, p.z], null, [r, r * 1.1, r]));
    }
  } else if (t.kind === 'spotted') {
    const { geo, curve } = taperTube(pts, 0.05, 0.75, 14, 8);
    b.add(geo, furMat(t.color));
    for (let i = 1; i <= 4; i += Q.detail >= 2 ? 1 : 2) {
      const p = curve.getPointAt(i / 4.4), tg = curve.getTangentAt(i / 4.4);
      b.add(torusG(0.047 * lerp(1, 0.78, i / 4), 0.012, 6, 14), furMat(t.ring, 0.05), MQ(p, qFromTo(Z_FWD, tg)));
    }
    const tip = curve.getPointAt(1);
    b.add(sphere(0.04, 10, 8), furMat(t.ring, 0.05), M([tip.x, tip.y, tip.z]));
  } else if (t.kind === 'tuft') {
    const { geo, curve } = taperTube(pts, 0.035, 0.8, 12, 6);
    b.add(geo, furMat(t.color));
    const tip = curve.getPointAt(1);
    b.add(sphere(1, 12, 9), furMat(t.tip, 0.1), M([tip.x, tip.y + 0.03, tip.z], null, [0.07, 0.09, 0.07]));
  }
  return { parts: b.build(), pos: V3(0.1, 0.12, -0.16) };
}

// --- steering wheel + hands (rotating part)
function buildSteeringWheel(ch, sp, slots) {
  const b = new Builder(slots);
  b.add(torusG(K.wheelRad, 0.03, 7, 22), MAT.dark);
  if (Q.detail >= 2) for (const a of [0, PI]) b.add(capG(0.018, K.wheelRad * 0.8, 2, 6), MAT.dark, M([Math.cos(a) * K.wheelRad * 0.5, -0.02, 0], [0, 0, PI / 2]));
  b.add(cylG(0.06, 0.06, 0.04, 18), 'accent', M([0, 0, -0.01], [PI / 2, 0, 0]));
  b.add(extrude(sparkleShape(0.05, 0.26), 0.012, 0.006, 3, 1), MAT.gold, M([0, 0, 0.018]));
  const hand = furMat(sp.hands);
  for (const ph of [0.35, PI - 0.35]) {
    const p = V3(Math.cos(ph) * K.wheelRad, Math.sin(ph) * K.wheelRad, -0.03);
    if (sp.handKind === 'claw') {
      const sx = ph < 1 ? 1 : -1;
      b.push(M([p.x, p.y, p.z], [0, 0, sx * -0.6]));
      b.add(sphere(1, 14, 10), hand, M([0, 0, -0.01], null, [0.075, 0.07, 0.07]));
      b.add(sphere(1, 14, 10), hand, M([0, 0.07, 0.03], [-0.5, 0, 0], [0.06, 0.04, 0.1]));
      b.add(sphere(1, 12, 8), furMat(hexShift(sp.hands, 1.15)), M([0, -0.055, 0.04], [0.5, 0, 0], [0.05, 0.032, 0.085]));
      b.pop();
    } else {
      b.add(sphere(1, 14, 10), hand, M([p.x, p.y, p.z], null, [0.066, 0.062, 0.058]));
      if (sp.handKind === 'frog') for (let i = -1; i <= 1; i++) b.add(sphere(0.018, 6, 4), furMat(ch.accent, 0.2), M([p.x + i * 0.03, p.y + 0.055, p.z + 0.03]));
    }
  }
  return b.build();
}

// ---------------------------------------------------------------------------------------------
// Kart dimensions (root faces +Z, origin at ground contact centre)
// ---------------------------------------------------------------------------------------------
const K = {
  rearR: 0.35, rearW: 0.34, rearX: 0.68, rearZ: -0.72,
  frontR: 0.29, frontW: 0.28, frontX: 0.64, frontZ: 0.76,
  wheelC: V3(0, 0.93, 0.3), wheelTilt: 0.8, wheelRad: 0.16,
  hip: V3(0, 0.54, -0.37),
  neck: V3(0, 0.5, 0.02),
  exhaustTilt: 0.35,
  lanternHook: V3(-0.8, 1.42, -1.1),
};

// ---------------------------------------------------------------------------------------------
// Wheels: soft balloon tyres, accent rims, golden sparkle hub
// ---------------------------------------------------------------------------------------------
function tireGeometry(R, W) {
  const ri = R * 0.58;
  const pts = [new THREE.Vector2(ri, -W * 0.44)];
  const n = Q.detail >= 2 ? 7 : Q.detail >= 1 ? 5 : 3;
  for (let i = 0; i <= n; i++) {
    const a = -PI / 2 + (i / n) * PI;
    pts.push(new THREE.Vector2(R - W * 0.5 + Math.cos(a) * W * 0.5, Math.sin(a) * W * 0.5));
  }
  pts.push(new THREE.Vector2(ri, W * 0.44));
  const g = latheG(pts, 22);
  g.rotateZ(PI / 2);
  return g;
}
// ---------------------------------------------------------------------------------------------
// Kart chassis template (per character): chunky soft tub, side pods, light-engine, lantern vine
// ---------------------------------------------------------------------------------------------
function buildChassis(ch, sp, slots) {
  const b = new Builder(slots);
  const seat = stdMat(hexShift(ch.color, 0.55, 0.85), 0.75, 0, null, 'seat');
  const trim = stdMat(0xfff7dc, 0.6, 0, null, 'trim');

  // Main tub: side profile extruded across the width, generous bevel for a soft toy look
  {
    const s = roundedShape([[-1.0, 0.27], [1.1, 0.27], [1.25, 0.42], [1.12, 0.57], [0.62, 0.74], [0.24, 0.8], [0.12, 0.64], [-0.52, 0.6], [-0.8, 0.7], [-1.07, 0.66]],
      [0.1, 0.12, 0.13, 0.22, 0.25, 0.08, 0.1, 0.14, 0.12, 0.12]);
    const depth = 0.8;
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.08, bevelSegments: Q.detail >= 2 ? 3 : Q.detail >= 1 ? 2 : 1, curveSegments: S(5, 2) });
    g.rotateY(-PI / 2);
    g.translate(depth / 2, 0, 0);
    b.add(g, 'paint');
  }
  // undercarriage
  b.add(rboxG(0.8, 0.08, 1.9, 2, 0.035), MAT.dark, M([0, 0.23, 0.05]));
  // side pods (chunky soft bumpers) + accent stripe
  for (const sx of [-1, 1]) {
    b.add(capG(0.16, 0.62, 4, 12), 'paint', M([sx * 0.55, 0.42, 0.06], [PI / 2, 0, 0], [1.05, 1, 1]));
    if (Q.detail >= 1) b.add(capG(0.045, 0.6, 3, 8), 'accent', M([sx * 0.6, 0.555, 0.06], [PI / 2, 0, 0]));
    if (Q.detail >= 1) {
      b.add(sphere(0.035, 8, 6), trim, M([sx * 0.71, 0.42, 0.42]));
      b.add(sphere(0.035, 8, 6), trim, M([sx * 0.71, 0.42, -0.3]));
    }
    // side emblem baked as geometry: cream roundel + golden sparkle (indigo + moon for Nox)
    const night = sp.species === 'night';
    b.push(M([sx * 0.495, 0.56, 0.45], [0, sx * PI / 2, 0]));
    b.add(cylG(0.13, 0.13, 0.012, 20), stdMat(night ? 0x2a2158 : 0xfff7dc, 0.6), M([0, 0, 0], [PI / 2, 0, 0]));
    if (Q.detail >= 1) b.add(torusG(0.125, 0.014, 4, 20), 'accent');
    b.add(extrude(night ? crescentShape(0.075) : sparkleShape(0.085, 0.22), 0.012, 0), night ? glowMat(0xd9ccff, 1) : MAT.gold, M([0, 0, 0.01]));
    b.pop();
  }
  // front bumper (accent) with cream end caps
  b.add(capG(0.1, 0.7, 4, 12), 'accent', M([0, 0.33, 1.27], [0, 0, PI / 2]));
  for (const sx of [-1, 1]) b.add(sphere(0.105, 10, 8), trim, M([sx * 0.46, 0.33, 1.25]));
  // round lantern headlights
  for (const sx of [-1, 1]) {
    if (Q.detail >= 2) b.add(torusG(0.075, 0.022, 5, 14), MAT.gold, M([sx * 0.27, 0.48, 1.205], [0.45, 0, 0]));
    b.add(sphere(0.07, 10, 8), MAT.lamp, M([sx * 0.27, 0.48, 1.195], [0.45, 0, 0], [1, 1, 0.55]));
  }
  // hood ornament: standing golden sparkle (LUMEN star)
  b.add(extrude(sparkleShape(0.11, 0.26), 0.035, 0.015, 4), MAT.gold, M([0, 0.75, 0.93], [-0.1, 0, 0]));
  b.add(cylG(0.035, 0.05, 0.06, 10), MAT.gold, M([0, 0.64, 0.95]));
  // seat (deep shade of the paint) + accent piping
  b.add(rboxG(0.62, 0.42, 0.14, 2, 0.065), seat, M([0, 0.77, -0.66], [-0.24, 0, 0]));
  b.add(rboxG(0.58, 0.12, 0.5, 2, 0.05), seat, M([0, 0.58, -0.36]));
  b.add(capG(0.042, 0.5, 3, 8), 'accent', M([0, 0.97, -0.71], [-0.24, 0, PI / 2]));
  // rear light-engine: glowing orb held in a golden ring
  b.add(rboxG(0.62, 0.28, 0.32, 2, 0.1), 'paint', M([0, 0.62, -0.9]));
  if (Q.detail >= 1) b.add(torusG(0.14, 0.035, 6, 18), MAT.gold, M([0, 0.66, -1.08]));
  b.add(sphere(0.11, 12, 8), MAT.lamp, M([0, 0.66, -1.07], null, [1, 1, 0.6]));
  // twin "trumpet flower" light pipes (exhausts)
  const a = K.exhaustTilt;
  const dir = V3(0, Math.sin(a), -Math.cos(a));
  for (const x of [-0.24, 0.24]) {
    const start = V3(x, 0.52, -0.98);
    const L = 0.36;
    const q = qFromTo(Y_UP, dir);
    if (Q.detail >= 1) b.add(cylG(0.055, 0.06, L, 12), trim, MQ(start.clone().addScaledVector(dir, L * 0.45), q));
    const tip = start.clone().addScaledVector(dir, L);
    b.add(cylG(0.105, 0.06, 0.12, 14, 1, true), MAT.gold, MQ(tip.clone().addScaledVector(dir, -0.04), q));
    b.add(new THREE.CircleGeometry(0.075, 14), MAT.lamp, MQ(tip.clone().addScaledVector(dir, -0.05), qFromTo(Z_FWD, dir)));
  }
  // soft rear wing on two struts, rounded endplates
  b.add(rboxG(1.2, 0.08, 0.34, 2, 0.035), 'paint', M([0, 0.9, -1.16], [0.08, 0, 0]));
  for (const sx of [-1, 1]) {
    b.add(rboxG(0.06, 0.26, 0.42, 2, 0.03), 'accent', M([sx * 0.62, 0.88, -1.16]));
    if (Q.detail >= 1) b.add(capG(0.03, 0.14, 3, 8), MAT.dark, M([sx * 0.26, 0.8, -1.1], [-0.2, 0, 0]));
  }
  // rear fenders over the rear wheels + accent trim
  for (const sx of [-1, 1]) {
    const fr = K.rearR + 0.07;
    b.add(cylG(fr, fr, K.rearW + 0.08, 16, 1, true, 0.25, 2.35), 'paint', M([sx * K.rearX, K.rearR, K.rearZ], [0, 0, PI / 2]));
    if (Q.detail >= 1) b.add(torusG(fr, 0.024, 5, 16, 2.35), 'accent', M([sx * (K.rearX + sx * (K.rearW / 2 + 0.04)), K.rearR, K.rearZ], [0, -PI / 2, 0.25, 'YXZ']));
    // little front mudguards
    const ff = K.frontR + 0.06;
    if (Q.detail >= 1) b.add(cylG(ff, ff, K.frontW + 0.06, 12, 1, true, 0.5, 1.9), 'paint', M([sx * K.frontX, K.frontR, K.frontZ], [0, 0, PI / 2]));
  }
  // steering column
  {
    const top = K.wheelC, base = V3(0, 0.66, 0.6);
    const d = top.clone().sub(base);
    b.add(cylG(0.03, 0.035, d.length(), 10), MAT.dark, MQ(base.clone().add(top).multiplyScalar(0.5), qFromTo(Y_UP, d)));
  }
  // lantern vine: curling stalk from the rear deck with two leaves
  {
    const vine = furMat(sp.species === 'night' ? 0x3a2f7a : 0x3f7f5a, 0.12);
    const h = K.lanternHook;
    const { geo } = taperTube([V3(-0.4, 0.68, -0.95), V3(-0.45, 1.0, -1.0), V3(-0.52, 1.36, -1.05), V3(-0.66, 1.52, -1.1), V3(h.x + 0.02, h.y + 0.04, h.z)], 0.032, 0.45, 18, 7);
    b.add(geo, vine);
    const leafM = furMat(sp.species === 'night' ? 0x6b5fd0 : 0x7fbf6a, 0.15);
    if (Q.detail >= 1) {
      b.add(extrude(leafShape(0.07, 1), 0.012, 0.006), leafM, M([-0.47, 1.12, -1.02], [0, 0.4, 0.9]));
      b.add(extrude(leafShape(0.06, 1), 0.012, 0.006), leafM, M([-0.55, 1.38, -1.06], [0, -0.3, -0.7]));
    }
  }
  return b.build();
}

function buildLantern(ch, sp) {
  const b = new Builder();
  const night = sp.species === 'night';
  const glass = stdMat(night ? 0xc9bbff : 0xffd98a, 0.25, 0, { emissive: night ? 0x8f7cff : 0xffc45e, emissiveIntensity: 0.9, transparent: true, opacity: 0.88 }, 'lanternglass');
  const oct = new THREE.OctahedronGeometry(0.12, 0);
  b.add(oct, glass, M([0, -0.2, 0], null, [1, 1.45, 1]));
  b.add(sphere(0.055, 10, 8), glowMat(night ? 0xe6dcff : 0xfff6cc, 1.4, null, 'lanterncore'), M([0, -0.2, 0]));
  b.add(coneG(0.06, 0.06, 8), MAT.gold, M([0, -0.03, 0]));
  b.add(cylG(0.006, 0.006, 0.05, 4), MAT.dark, M([0, 0.0, 0]));
  b.add(sphere(0.022, 8, 6), MAT.gold, M([0, -0.385, 0]));
  return b.build();
}

// ---------------------------------------------------------------------------------------------
// Scarf / veil ribbon: a tiny CPU-animated strip (1–2 tails), cheap on mobile.
// ---------------------------------------------------------------------------------------------
function createRibbon(spec, segs = 10, strips = 2) {
  const rows = segs + 1;
  const vcount = strips * rows * 2;
  const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), uv = new Float32Array(vcount * 2);
  const idx = [];
  for (let s = 0; s < strips; s++) {
    for (let i = 0; i < rows; i++) {
      const v = s * rows * 2 + i * 2;
      const t = 1 - i / segs;
      uv.set([0, t, 1, t], v * 2);
      if (i < segs) { const a = v, bb = v + 1, c = v + 2, d = v + 3; idx.push(a, bb, c, bb, d, c); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(V3(0, 0, -0.6), 2.4);
  const mat = cached(`ribbon:${spec.kind}:${spec.color}:${spec.stitch}`, () => new THREE.MeshStandardMaterial({
    map: scarfTexture(spec.color, spec.stitch, spec.kind), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.85, metalness: 0,
    emissive: spec.kind === 'veil' ? 0xffffff : spec.color, emissiveMap: spec.kind === 'veil' ? scarfTexture(spec.color, spec.stitch, spec.kind) : null,
    emissiveIntensity: spec.kind === 'veil' ? 0.35 : 0.12, envMap: envMap(), envMapIntensity: 0.3,
  }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.name = spec.kind;
  const St = { L: 0.5, side: 0, droop: 1, wave: 0.15, sway: 0.08, ph: Math.random() * 10 };
  const P = V3(), D = V3(), PERP = V3(), N0 = V3(), W = V3(), N = V3();
  const width = (spec.width || 0.17) * (strips === 1 ? 1.25 : 1), lenMul = spec.len || 1;
  const strip = [
    { ox: 0.05, oy: 0, oz: 0, lf: 1, phase: 0, side: -0.1, droop: 0, wf: 1 },
    { ox: -0.04, oy: -0.02, oz: 0.01, lf: 0.7, phase: 1.7, side: 0.3, droop: 0.1, wf: 0.85 },
  ];
  function update(dt, o) {
    const sf = o.sf;
    const tL = (0.42 + 0.95 * Math.min(1.2, sf) + (o.drifting ? 0.2 : 0) + (o.boosting ? 0.3 : 0)) * lenMul;
    const tDroop = lerp(1.15, -0.42, clamp(sf * 1.4, 0, 1)) - (o.airborne ? 0.35 : 0) - (o.boosting ? 0.1 : 0);
    const tSide = o.drifting ? -o.driftDir * 0.5 : o.steer * 0.2 * Math.min(1, sf);
    const tWave = 0.1 + 0.2 * Math.min(1.2, sf) + (o.drifting ? 0.16 : 0) + (o.boosting ? 0.1 : 0);
    const tSway = 0.08 + 0.14 * Math.min(1, sf) + (o.drifting ? 0.18 : 0);
    St.L = damp(St.L, tL, 3, dt); St.droop = damp(St.droop, tDroop, 3.5, dt); St.side = damp(St.side, tSide, 4, dt);
    St.wave = damp(St.wave, tWave, 3, dt); St.sway = damp(St.sway, tSway, 3, dt);
    St.ph += dt * (5 + 11 * Math.min(1.3, sf) + (o.drifting ? 4 : 0));
    for (let si = 0; si < strips; si++) {
      const st = strip[si];
      const L = St.L * st.lf, seg = L / segs;
      P.set(st.ox, st.oy, st.oz);
      for (let i = 0; i <= segs; i++) {
        const s = i / segs;
        const ph = St.ph + st.phase;
        const pitch = -(St.droop + st.droop) - (0.28 + 0.35 * (1 - Math.min(1, sf))) * s + St.wave * Math.sin(ph - s * 5.5) * (0.25 + s);
        const yaw = St.side + st.side * (0.5 + s) + St.sway * Math.sin(ph * 0.6 - s * 3.8) * (0.3 + s);
        const cp = Math.cos(pitch);
        D.set(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
        if (i > 0) P.addScaledVector(D, seg);
        PERP.set(-D.z, 0, D.x);
        if (PERP.lengthSq() < 1e-6) PERP.set(1, 0, 0);
        PERP.normalize();
        N0.crossVectors(PERP, D).normalize();
        const roll = 0.35 * Math.sin(ph * 0.8 - s * 4.5) * s;
        const cr = Math.cos(roll), sr = Math.sin(roll);
        W.copy(PERP).multiplyScalar(cr).addScaledVector(N0, sr);
        N.copy(N0).multiplyScalar(cr).addScaledVector(PERP, -sr);
        const hw = width * 0.5 * st.wf * (1 - 0.22 * s);
        const v = (si * (segs + 1) + i) * 2;
        pos[v * 3] = P.x - W.x * hw; pos[v * 3 + 1] = P.y - W.y * hw; pos[v * 3 + 2] = P.z - W.z * hw;
        pos[v * 3 + 3] = P.x + W.x * hw; pos[v * 3 + 4] = P.y + W.y * hw; pos[v * 3 + 5] = P.z + W.z * hw;
        nor[v * 3] = N.x; nor[v * 3 + 1] = N.y; nor[v * 3 + 2] = N.z;
        nor[v * 3 + 3] = N.x; nor[v * 3 + 4] = N.y; nor[v * 3 + 5] = N.z;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }
  return { mesh, update, dispose() { geo.dispose(); } };
}

// Merge several built part lists (each optionally placed by a matrix) into one: all vertex-coloured
// parts collapse into a single geometry; real-material parts are kept as they are.
function mergeParts(list) {
  const vc = [], other = [];
  for (const { parts, matrix } of list) {
    if (!parts) continue;
    for (const p of parts) {
      const g = p.geometry.clone();
      if (matrix) g.applyMatrix4(matrix);
      if (p.material === 'vc') vc.push(g); else other.push({ material: p.material, geometry: g });
    }
  }
  // real-material parts: merge per material (same attribute layout, all from the Builder)
  const byMat = new Map();
  for (const o of other) { if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(o.geometry); }
  const others = [];
  for (const [material, geos] of byMat) {
    let g = null;
    try { g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false); } catch { g = null; }
    if (g) { g.computeBoundingSphere(); g.userData.shared = true; others.push({ material, geometry: g }); } else for (const x of geos) others.push({ material, geometry: x });
  }
  if (!vc.length) return others;
  let merged = null;
  try { merged = vc.length === 1 ? vc[0] : mergeGeometries(vc, false); } catch { merged = null; }
  const out = [];
  if (merged) {
    if (merged !== vc[0]) vc.forEach((g) => g.dispose());
    merged.computeBoundingSphere(); merged.userData.shared = true; out.push({ material: 'vc', geometry: merged });
  } else for (const g of vc) { g.computeBoundingSphere(); g.userData.shared = true; out.push({ material: 'vc', geometry: g }); }
  return out.concat(others);
}

// Wheels baked with their side flip (outer face toward ±X); `axle` puts both rear wheels in one mesh.
function addWheel(b, R, W, outerSign, x = 0) {
  b.push(M([x, 0, 0], outerSign < 0 ? [0, PI, 0] : null));
  b.add(tireGeometry(R, W), MAT.tire);
  const ri = R * 0.6;
  b.add(cylG(ri, ri, W * 0.8, 18), 'accent', M([0, 0, 0], [0, 0, PI / 2]));
  if (Q.detail >= 2) b.add(torusG(ri * 0.98, 0.02, 4, 18), MAT.gold, M([W * 0.4, 0, 0], [0, PI / 2, 0]));
  b.add(extrude(sparkleShape(ri * 0.78, 0.3), 0.025, 0.012, 3, 1), MAT.gold, M([W * 0.41, 0, 0], [0, PI / 2, 0]));
  if (Q.detail >= 1) b.add(sphere(ri * 0.22, 10, 6), MAT.gold, M([W * 0.44, 0, 0], null, [0.6, 1, 1]));
  // a few soft tread nubs (geometry instead of a bump map)
  if (Q.detail >= 2) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.add(new THREE.BoxGeometry(W * 0.6, 0.04, 0.07), MAT.tire, M([0, Math.cos(a) * (R - 0.008), Math.sin(a) * (R - 0.008)], [a, 0, 0]));
  }
  b.pop();
}

// ---------------------------------------------------------------------------------------------
// Character template cache (one per character × quality)
// ---------------------------------------------------------------------------------------------
const _kartTpl = new Map();
function kartTemplate(ch, q) {
  const key = `${ch.id}:${ch.species}:${ch.color}:${ch.accent}:${ch.skin}:${ch.scarf}:${q.name}`;
  let t = _kartTpl.get(key);
  if (t) return t;
  t = withQuality(q, () => {
    const sp = speciesSheet(ch);
    const slots = { paint: spec(ch.color, 0.42, 0.05, 0.06), accent: spec(ch.accent, 0.45, 0.05, 0.06) };
    const head = buildHead(ch, sp);
    const sepLantern = q.detail >= 1;
    const tail = buildTail(sp);
    // body: chassis (+ lantern when it does not swing)
    const body = mergeParts([
      { parts: buildChassis(ch, sp, slots) },
      sepLantern ? null : { parts: buildLantern(ch, sp), matrix: new THREE.Matrix4().makeTranslation(K.lanternHook.x, K.lanternHook.y, K.lanternHook.z) },
    ].filter(Boolean));
    // wheels: 2 steerable fronts + 1 rear axle
    const wb = (fn) => { const b = new Builder(slots); fn(b); return b.build(); };
    const frontL = wb((b) => addWheel(b, K.frontR, K.frontW, 1));
    const frontR = wb((b) => addWheel(b, K.frontR, K.frontW, -1));
    const rear = wb((b) => { addWheel(b, K.rearR, K.rearW, 1, K.rearX); addWheel(b, K.rearR, K.rearW, -1, -K.rearX); });
    // ears: both in one mesh around a common pivot
    let earsPivot = null, ears = null;
    if (head.ears.length) {
      earsPivot = V3(0, head.ears[0].pos.y, head.ears[0].pos.z);
      ears = mergeParts(head.ears.map((e) => ({ parts: e.parts, matrix: new THREE.Matrix4().compose(e.pos.clone().sub(earsPivot), new THREE.Quaternion().setFromEuler(e.rot), V3(1, 1, 1)) })));
    }
    const sepParts = q.detail >= 1;
    const headParts = sepParts ? head.head : mergeParts([
      { parts: head.head },
      { parts: head.eyes.parts, matrix: new THREE.Matrix4().makeTranslation(head.eyes.pivot.x, head.eyes.pivot.y, head.eyes.pivot.z) },
      ears ? { parts: ears, matrix: new THREE.Matrix4().makeTranslation(earsPivot.x, earsPivot.y, earsPivot.z) } : null,
    ].filter(Boolean));
    const torso = buildTorso(ch, sp);
    const torsoParts = (!sepParts && tail) ? mergeParts([{ parts: torso }, { parts: tail.parts, matrix: new THREE.Matrix4().makeTranslation(tail.pos.x, tail.pos.y, tail.pos.z) }]) : torso;
    return {
      sp, q,
      body, frontL, frontR, rear,
      lantern: sepLantern ? buildLantern(ch, sp) : null,
      steer: buildSteeringWheel(ch, sp, slots),
      torso: torsoParts,
      head: headParts,
      eyes: sepParts ? head.eyes : null,
      ears: sepParts ? ears : null, earsPivot, earFlex: sp.ears ? sp.ears.flex || 1 : 1,
      tail: sepParts ? tail : null,
      ribbon: sp.scarf ? { segs: q.ribbon, strips: q.detail >= 1 ? 2 : 1 } : null,
    };
  });
  _kartTpl.set(key, t);
  return t;
}

function blobShadowTex() {
  return cachedTex('blob', (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rg.addColorStop(0, 'rgba(20,30,40,0.55)'); rg.addColorStop(0.6, 'rgba(20,30,40,0.3)'); rg.addColorStop(1, 'rgba(20,30,40,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  }, 64, 64);
}

const STAR_COLORS = [0xb5f3d0, 0x8fd3ff, 0xdbb2f6, 0xffc193, 0xfff1a8].map((h) => new THREE.Color(h));

// ---------------------------------------------------------------------------------------------
// createKartModel — ≤ 12 draw calls per kart: body (+lamps, decal emblems as geometry), name decal
// (high only), 2 front wheels + rear axle, steering wheel, torso (+arms), head, eyes (blink), ears,
// tail, scarf/veil, lantern. Only the body and the torso cast shadows (a blob decal on 'low').
// ---------------------------------------------------------------------------------------------
export function createKartModel(character) {
  const ch = normChar(character);
  const q = currentQuality();
  const tpl = kartTemplate(ch, q);
  const sp = tpl.sp;

  // per-kart material for body / wheels / steering wheel (aurora tint must not leak to other karts)
  const kartMat = makeLumenMaterial();
  const ownMats = [kartMat];
  const ownGeos = [];
  const shadows = q.detail >= 1;

  const root = new THREE.Group();
  root.name = `kartModel-${ch.id}`;
  const visual = new THREE.Group();
  root.add(visual);
  const body = new THREE.Group();     // suspended body (bob / roll / pitch)
  visual.add(body);
  const bodyMeshes = instantiate(tpl.body, kartMat, shadows);
  body.add(bodyMeshes);

  const decals = [];
  if (q.detail >= 2) {
    const nameMat = decalMat(nameDecalTex(ch.name, ch.color, ch.accent));
    const nameDecal = new THREE.Mesh(cachedGeo('decalName', () => new THREE.PlaneGeometry(1.0, 0.25)), nameMat);
    nameDecal.position.set(0, 0.9 + 0.043, -1.16 + 0.003);
    nameDecal.rotation.set(-PI / 2 + 0.08, 0, PI, 'XYZ');
    body.add(nameDecal); decals.push(nameDecal);
  }

  // lantern (pendulum)
  let lantern = null;
  if (tpl.lantern) {
    lantern = new THREE.Group();
    lantern.position.copy(K.lanternHook);
    lantern.add(instantiate(tpl.lantern));
    body.add(lantern);
  }

  // steering wheel (+ paws)
  const steerBase = new THREE.Group();
  steerBase.position.copy(K.wheelC);
  steerBase.rotation.x = K.wheelTilt;
  const steerSpin = new THREE.Group();
  steerBase.add(steerSpin);
  steerSpin.add(instantiate(tpl.steer, kartMat));
  body.add(steerBase);

  // driver (torso includes the arms)
  const driver = new THREE.Group();
  driver.position.copy(K.hip);
  body.add(driver);
  driver.add(instantiate(tpl.torso, null, shadows));
  const head = new THREE.Group();
  head.position.copy(K.neck);
  driver.add(head);
  head.add(instantiate(tpl.head));
  let eyes = null;
  if (tpl.eyes) {
    eyes = new THREE.Group();
    eyes.position.copy(tpl.eyes.pivot);
    eyes.add(instantiate(tpl.eyes.parts));
    head.add(eyes);
  }
  let ears = null;
  if (tpl.ears) {
    ears = new THREE.Group();
    ears.position.copy(tpl.earsPivot);
    ears.add(instantiate(tpl.ears));
    head.add(ears);
  }
  let tail = null;
  if (tpl.tail) {
    tail = new THREE.Group();
    tail.position.copy(tpl.tail.pos);
    tail.add(instantiate(tpl.tail.parts));
    driver.add(tail);
  }
  let ribbon = null;
  if (tpl.ribbon) {
    ribbon = createRibbon(sp.scarf, tpl.ribbon.segs, tpl.ribbon.strips);
    ribbon.mesh.position.set(0.03, 0.45, -0.19);
    driver.add(ribbon.mesh);
    ownGeos.push(ribbon);
  }

  // wheels
  const wheels = [];
  const makeWheel = (parts, x, z, R, front) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, R, z);
    const spin = new THREE.Group();
    pivot.add(spin);
    spin.add(instantiate(parts, kartMat));
    visual.add(pivot);
    wheels.push({ pivot, spin, R, front });
  };
  makeWheel(tpl.frontL, K.frontX, K.frontZ, K.frontR, true);
  makeWheel(tpl.frontR, -K.frontX, K.frontZ, K.frontR, true);
  makeWheel(tpl.rear, 0, K.rearZ, K.rearR, false);
  const anchors = {};
  for (const [name, x, z] of [['wheelRL', K.rearX, K.rearZ], ['wheelRR', -K.rearX, K.rearZ], ['wheelFL', K.frontX, K.frontZ], ['wheelFR', -K.frontX, K.frontZ]]) {
    const a = new THREE.Object3D(); a.name = name; a.position.set(x, 0, z); root.add(a); anchors[name] = a;
  }
  {
    const a = K.exhaustTilt;
    const dir = V3(0, Math.sin(a), -Math.cos(a));
    for (const [name, x] of [['exhaustL', 0.24], ['exhaustR', -0.24]]) {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.copy(V3(x, 0.52, -0.98).addScaledVector(dir, 0.4));
      root.add(o);
      anchors[name] = o;
    }
    const ih = new THREE.Object3D();
    ih.name = 'itemHold';
    ih.position.set(0, 0.6, -1.6);
    root.add(ih);
    anchors.itemHold = ih;
  }
  if (!shadows) {
    const blob = new THREE.Mesh(cachedGeo('blob', () => new THREE.PlaneGeometry(1.9, 2.9).rotateX(-PI / 2)),
      cached('blobmat', () => new THREE.MeshBasicMaterial({ map: blobShadowTex(), transparent: true, depthWrite: false, toneMapped: false })));
    blob.position.y = 0.03;
    blob.renderOrder = -1;
    visual.add(blob);
  }

  // ---- animation state
  const St = {
    wheelRot: 0, steer: 0, prevSpeed: 0, accel: 0,
    pitch: 0, pitchV: 0, roll: 0, rollV: 0, bob: 0, bobV: 0,
    lean: 0, headYaw: 0, headRoll: 0, wasAir: false, starOn: false,
    lookTimer: 4 + Math.random() * 8, lookPhase: 0, lookSide: 1, dizzy: 0, time: 0,
    blinkT: 1 + Math.random() * 3, blink: 0, earX: 0, earV: 0,
    lanX: 0, lanXV: 0, lanZ: 0, lanZV: 0, warned: false,
  };
  const ribbonArgs = { sf: 0, steer: 0, drifting: false, driftDir: 1, boosting: false, airborne: false };
  if (ribbon) ribbon.update(1, ribbonArgs);
  const earBaseX = 0, earFlex = tpl.earFlex;

  function animate(o = {}) {
    try {
      const dt = clamp(fin(o.dt, 1 / 60), 0, 0.1);
      const speed = fin(o.speed, 0);
      const steer = clamp(fin(o.steer, 0), -1, 1);
      const drifting = !!o.drifting;
      const driftDir = fin(o.driftDir, 0) >= 0 ? 1 : -1;
      const airborne = !!o.airborne;
      const boosting = !!o.boosting;
      const spin = clamp(fin(o.spin, 0), 0, 1);
      const time = fin(o.time, St.time + dt);
      St.time = time;
      U_TIME.value = time;
      const sf = clamp(Math.abs(speed) / 38, 0, 1.6);

      St.steer = damp(St.steer, steer, 14, dt);

      // wheels (geometry is pre-flipped, so every wheel spins the same way)
      St.wheelRot = (St.wheelRot + (speed * dt) / K.rearR) % (TAU * 1000);
      const steerAng = -St.steer * 0.42 * (drifting ? 0.6 : 1);
      for (const w of wheels) {
        w.spin.rotation.x = St.wheelRot * (K.rearR / w.R);
        if (w.front) w.pivot.rotation.y = steerAng;
      }

      // longitudinal accel for pitch
      const acc = dt > 0 ? (speed - St.prevSpeed) / dt : 0;
      St.prevSpeed = speed;
      St.accel = damp(St.accel, clamp(acc, -80, 80), 6, dt);
      let tPitch = -clamp(St.accel * 0.0018, -0.05, 0.05);
      if (boosting) tPitch -= 0.06;
      if (airborne) tPitch -= 0.04;
      let tRoll = -St.steer * sf * 0.05;
      if (drifting) tRoll = -driftDir * 0.06 * Math.min(1, sf + 0.3);
      const k = 140, c = 13;
      St.pitchV += ((tPitch - St.pitch) * k - St.pitchV * c) * dt; St.pitch += St.pitchV * dt;
      St.rollV += ((tRoll - St.roll) * k - St.rollV * c) * dt; St.roll += St.rollV * dt;
      if (St.wasAir && !airborne) St.bobV -= 1.4 + Math.min(1.5, sf);
      St.wasAir = airborne;
      const buzz = airborne ? 0.03 : (Math.sin(time * 23.0) * 0.5 + Math.sin(time * 37.0) * 0.5) * 0.006 * Math.min(1, sf * 1.5);
      St.bobV += ((buzz - St.bob) * 220 - St.bobV * 14) * dt; St.bob += St.bobV * dt;
      St.bob = clamp(St.bob, -0.12, 0.08);
      body.position.y = St.bob;
      body.rotation.set(St.pitch, 0, St.roll);

      // driver lean (kept small: the arms are baked to the wheel) + dizzy wobble while spun out
      const tLean = drifting ? driftDir * 0.12 : St.steer * 0.08 * Math.min(1, sf + 0.35);
      St.lean = damp(St.lean, tLean, 8, dt);
      St.dizzy = damp(St.dizzy, spin > 0 && spin < 1 ? 1 : 0, spin > 0 ? 12 : 3, dt);
      const dz = St.dizzy;
      driver.rotation.set(Math.sin(time * 9) * 0.04 * dz, Math.sin(time * 7) * 0.1 * dz, St.lean + Math.sin(time * 12) * 0.08 * dz);

      // occasional glance back over the shoulder
      St.lookTimer -= dt;
      let lookYaw = 0;
      if (St.lookTimer <= 0 && St.lookPhase <= 0) {
        if (Math.abs(steer) < 0.25 && !drifting && sf > 0.3 && !airborne) { St.lookPhase = 1.1; St.lookSide = Math.random() < 0.5 ? -1 : 1; }
        St.lookTimer = 7 + Math.random() * 10;
      }
      if (St.lookPhase > 0) {
        St.lookPhase -= dt;
        const p = 1 - St.lookPhase / 1.1;
        lookYaw = Math.sin(clamp(p, 0, 1) * PI) * 1.3 * St.lookSide;
        if (drifting || Math.abs(steer) > 0.6) St.lookPhase = 0;
      }
      St.headYaw = damp(St.headYaw, -St.steer * 0.38 + lookYaw + Math.sin(time * 10) * 0.5 * dz, 10, dt);
      St.headRoll = damp(St.headRoll, St.steer * 0.1 + (drifting ? driftDir * 0.1 : 0), 8, dt);
      head.rotation.set(-0.04 + (airborne ? -0.1 : 0) + (boosting ? -0.06 : 0), St.headYaw, St.headRoll, 'YXZ');

      // blink
      if (eyes) {
        St.blinkT -= dt;
        if (St.blinkT <= 0) { St.blink = 0.13; St.blinkT = Math.random() < 0.2 ? 0.25 : 2 + Math.random() * 3.5; }
        if (St.blink > 0) St.blink -= dt;
        eyes.scale.y = St.blink > 0 ? 0.12 : (dz > 0.5 ? 0.55 : 1);
      }
      // ears: swept back by the wind, flop on bumps
      if (ears) {
        St.earV += ((-St.bob * 4 - St.earX) * 90 - St.earV * 7) * dt; St.earX += St.earV * dt;
        ears.rotation.x = earBaseX - Math.min(1, sf) * 0.22 * earFlex + St.earX * earFlex + Math.sin(time * 14) * 0.02 * sf * earFlex;
        ears.rotation.z = Math.sin(time * 9) * 0.05 * dz;
      }
      if (tail) tail.rotation.set(Math.sin(time * 2.2) * 0.08, Math.sin(time * 3.1) * 0.18 + St.steer * 0.3, 0);

      // lantern pendulum
      if (lantern) {
        const lx = St.accel * 0.006 + (boosting ? 0.25 : 0) - St.bob * 3;
        const lz = -St.steer * sf * 0.35 + (drifting ? driftDir * 0.3 : 0);
        St.lanXV += ((lx - St.lanX) * 40 - St.lanXV * 3) * dt; St.lanX += St.lanXV * dt;
        St.lanZV += ((lz - St.lanZ) * 40 - St.lanZV * 3) * dt; St.lanZ += St.lanZV * dt;
        lantern.rotation.set(clamp(St.lanX, -0.8, 0.8), 0, clamp(St.lanZ, -0.8, 0.8));
      }

      // steering wheel (paws ride on it; arms are baked, so keep the turn modest)
      steerSpin.rotation.z = St.steer * 0.45;

      // the signature scarf / starry veil
      if (ribbon) {
        ribbonArgs.sf = sf; ribbonArgs.steer = St.steer; ribbonArgs.drifting = drifting; ribbonArgs.driftDir = driftDir;
        ribbonArgs.boosting = boosting; ribbonArgs.airborne = airborne;
        ribbon.update(dt, ribbonArgs);
      }

      // aurora (star item): pastel rainbow tint over the kart
      if (o.star) {
        const tt = time * 2.2;
        const i0 = Math.floor(tt) % STAR_COLORS.length, i1 = (i0 + 1) % STAR_COLORS.length, f = tt - Math.floor(tt);
        kartMat.emissive.copy(STAR_COLORS[i0]).lerp(STAR_COLORS[i1], f);
        kartMat.emissiveIntensity = 0.55 + Math.sin(time * 18) * 0.12;
        St.starOn = true;
      } else if (St.starOn) {
        kartMat.emissive.setHex(0); kartMat.emissiveIntensity = 1;
        St.starOn = false;
      }
    } catch (err) {
      if (!St.warned) { console.warn('[models] animate failed', err); St.warned = true; }
    }
  }

  function setShrunk(scale) {
    const s = fin(scale, 1);
    root.scale.setScalar(s > 0 ? s : 1);
  }

  function dispose() {
    try { root.parent?.remove(root); } catch { /* ignore */ }
    for (const m of ownMats) m.dispose();
    ownMats.length = 0;
    for (const g of ownGeos) g.dispose();
    ownGeos.length = 0;
  }

  return { root, anchors, animate, setShrunk, dispose, character: ch, quality: q.name, parts: { body, driver, head, eyes, ears, lantern, scarf: ribbon?.mesh || null, wheels: wheels.map((w) => w.pivot) } };
}

// ---------------------------------------------------------------------------------------------
// Items — re-dressed in Lumen's world (ids kept). Self-animated parts update from onBeforeRender
// (applied on the next frame), so items need no update() call from gameplay code.
// ---------------------------------------------------------------------------------------------
const _itemTpl = new Map();
function itemTemplate(type, make) {
  const q = currentQuality();
  const key = `${type}:${q.name}`;
  let t = _itemTpl.get(key);
  if (!t) { t = withQuality(q, make); _itemTpl.set(key, t); }
  return t;
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

function faceOn(b, z, w, eyeColor = 0x3a2a3a, scale = 1, smile = 0xed9b77) {
  // tiny cute LUMEN face on a flat front at depth z (eyes + highlights + smile)
  for (const sx of [-1, 1]) {
    b.add(sphere(1, 12, 10), stdMat(eyeColor, 0.3, 0, null, 'itemeye'), M([sx * 0.085 * scale, 0.03 * scale, z], null, [0.035 * scale, 0.058 * scale, 0.02]));
    b.add(sphere(1, 6, 4), MAT.shine, M([sx * 0.085 * scale + 0.012 * scale, 0.055 * scale, z + 0.016], null, [0.012 * scale, 0.016 * scale, 0.008]));
  }
  b.add(torusG(0.045 * scale, 0.011 * scale, 6, 14, PI), stdMat(smile, 0.5, 0, null, 'itemsmile'), M([0, -0.045 * scale, z + 0.005], [0, 0, PI], [1, 0.7, 1]));
  void w;
}

// --- Light prism (item_box)
function prismGeometry() {
  return cachedGeo('prism', () => {
    const pts = [new THREE.Vector2(0, -0.82), new THREE.Vector2(0.5, -0.2), new THREE.Vector2(0.56, 0.12), new THREE.Vector2(0, 0.86)];
    const g = new THREE.LatheGeometry(pts, 6).toNonIndexed();
    g.computeVertexNormals();
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const hues = [0.0, 0.08, 0.15, 0.36, 0.55, 0.75];
    for (let f = 0; f < pos.count / 3; f++) {
      const cx = (pos.getX(f * 3) + pos.getX(f * 3 + 1) + pos.getX(f * 3 + 2)) / 3;
      const cz = (pos.getZ(f * 3) + pos.getZ(f * 3 + 1) + pos.getZ(f * 3 + 2)) / 3;
      const cy = (pos.getY(f * 3) + pos.getY(f * 3 + 1) + pos.getY(f * 3 + 2)) / 3;
      const sector = Math.floor(((Math.atan2(cz, cx) + TAU) % TAU) / TAU * 6) % 6;
      c.setHSL(hues[sector], 1.0, cy > 0.1 ? 0.7 : cy < -0.2 ? 0.55 : 0.62);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f * 3 + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  });
}
function buildItemBox() {
  const root = new THREE.Group();
  root.name = 'item_box';
  const shell = cached('prism:shell', () => new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, flatShading: true, transparent: true, opacity: 0.72, roughness: 0.2, metalness: 0.0,
    emissive: 0xfff4c5, emissiveIntensity: 0.1, envMap: envMap(), envMapIntensity: 1.0, depthWrite: false,
  }));
  const crystal = new THREE.Mesh(prismGeometry(), shell);
  crystal.renderOrder = 2;
  crystal.castShadow = false;
  const core = instantiate(itemTemplate('prismcore', () => {
    const b = new Builder();
    const sm = glowMat(0xffe7a0, 1.1);
    b.add(extrude(sparkleShape(0.3, 0.24), 0.06, 0.03), sm);
    b.add(extrude(sparkleShape(0.3, 0.24), 0.06, 0.03), sm, M([0, 0, 0], [0, PI / 2, 0]));
    return b.build();
  }));
  const halo = glowSprite(0xfff1c0, 2.6, 0.55);
  root.add(halo, core, crystal);
  const t0 = Math.random() * 10;
  crystal.onBeforeRender = () => {
    const t = now() + t0;
    core.rotation.set(0, t * 2.2, Math.sin(t * 1.3) * 0.2);
    const s = 1 + Math.sin(t * 4) * 0.08;
    core.scale.setScalar(s);
    halo.material.opacity = 0.45 + Math.sin(t * 3) * 0.12;
  };
  return root;
}

// --- Bramble (banana)
function buildBrambleParts() {
  const b = new Builder();
  const vine = stdMat(0x5f7f3a, 0.8, 0, { emissive: 0x3a5a20, emissiveIntensity: 0.15 }, 'vine');
  const vine2 = stdMat(0x7a6a3a, 0.8, 0, { emissive: 0x4a3a20, emissiveIntensity: 0.12 }, 'vine2');
  const thorn = stdMat(0xf0e2b0, 0.6, 0, null, 'thorn');
  b.add(new THREE.IcosahedronGeometry(0.3, 1), vine2, M([0, 0.32, 0], null, [1, 0.85, 1]));
  const rings = [[0, 0, 0.2], [PI / 2, 0.5, -0.3], [0.9, -0.6, 0.6], [-0.4, 1.2, 1.1]];
  rings.forEach(([rx, ry, rz], i) => {
    b.push(M([0, 0.33, 0], [rx, ry, rz]));
    b.add(torusG(0.34, 0.045, 6, 22), i % 2 ? vine2 : vine);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + i;
      const p = V3(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0);
      b.add(coneG(0.03, 0.1, 6), thorn, MQ(p.clone().multiplyScalar(1.12), qFromTo(Y_UP, p)));
    }
    b.pop();
  });
  const leaf = stdMat(0x8cc63f, 0.6, 0, { emissive: 0x4a8a20, emissiveIntensity: 0.15, side: THREE.DoubleSide }, 'brambleleaf');
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    b.add(extrude(leafShape(0.12, 1), 0.012, 0.006), leaf, M([Math.cos(a) * 0.32, 0.5, Math.sin(a) * 0.32], [0.4, -a + PI / 2, -0.9, 'YXZ']));
  }
  const berry = stdMat(0xd2557f, 0.3, 0, { emissive: 0x7a2040, emissiveIntensity: 0.2 }, 'berry');
  for (const [x, y, z] of [[0.22, 0.6, 0.12], [-0.18, 0.62, 0.2], [0.02, 0.66, -0.24]]) {
    b.add(sphere(0.06, 10, 8), berry, M([x, y, z]));
    b.add(sphere(0.016, 6, 4), MAT.shine, M([x + 0.02, y + 0.03, z + 0.03]));
  }
  return b.build();
}

// --- Seed (green_shell)
function buildSeedParts() {
  const b = new Builder();
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, y = t * 0.8;
    const r = Math.sin(Math.pow(t, 0.85) * PI) * 0.36 * (1 - 0.25 * t) + 0.001;
    pts.push(new THREE.Vector2(r, y));
  }
  const light = stdMat(0xa6e68c, 0.35, 0, { emissive: 1, emissiveIntensity: 0.3 }), dark = stdMat(0x6cc36a, 0.35, 0, { emissive: 1, emissiveIntensity: 0.3 });
  for (let i = 0; i < 8; i++) b.add(new THREE.LatheGeometry(pts, Math.max(1, Math.round(3 * Q.seg + 0.4)), (i / 8) * TAU, TAU / 8), i % 2 ? dark : light);
  b.add(cylG(0.02, 0.03, 0.14, 6), stdMat(0x4f8f3a, 0.6, 0, null, 'sprout'), M([0, 0.85, 0], [0, 0, 0.15]));
  const leaf = stdMat(0x9ee07a, 0.5, 0, { emissive: 0x4a9a3a, emissiveIntensity: 0.2, side: THREE.DoubleSide }, 'seedleaf');
  b.add(extrude(leafShape(0.08, 1), 0.01, 0.006), leaf, M([-0.01, 0.9, 0], [0, 0, 0.9]));
  b.add(extrude(leafShape(0.07, 1), 0.01, 0.006), leaf, M([0.01, 0.9, 0], [0, 0, -0.8]));
  b.push(M([0, 0.36, 0]));
  faceOn(b, 0.335, 0, 0x234f3a, 1.1, 0xed9b77);
  b.pop();
  return b.build();
}

// --- Firefly (red_shell)
function buildFirefly() {
  const parts = itemTemplate('firefly', () => {
    const b = new Builder();
    b.add(sphere(0.3, 20, 14), stdMat(0xffd47a, 0.4, 0, { emissive: 0xff9a3a, emissiveIntensity: 0.85 }, 'fireflyglow'), M([0, 0.42, -0.2], null, [1, 0.95, 1.15]));
    b.add(sphere(0.16, 12, 10), glowMat(0xfff1c0, 1.0, null, 'fireflycore'), M([0, 0.4, -0.38]));
    b.add(sphere(0.26, 20, 14), stdMat(0x5a4a7a, 0.55, 0, { emissive: 0x2a2050, emissiveIntensity: 0.25 }, 'fireflyhead'), M([0, 0.5, 0.18]));
    b.add(torusG(0.2, 0.04, 6, 18), stdMat(0xffe2ac, 0.5, 0, null, 'fireflyband'), M([0, 0.45, -0.02]));
    for (const sx of [-1, 1]) {
      const { geo } = taperTube([V3(sx * 0.08, 0.72, 0.25), V3(sx * 0.14, 0.88, 0.3), V3(sx * 0.2, 0.95, 0.22)], 0.014, 0.8, 6, 4);
      b.add(geo, stdMat(0x3a2f55, 0.6, 0, null, 'antenna'));
      b.add(sphere(0.035, 8, 6), glowMat(0xffe6a0, 1.3, null, 'antennatip'), M([sx * 0.2, 0.95, 0.22]));
    }
    b.push(M([0, 0.5, 0.44]));
    faceOn(b, 0, 0, 0xfff1d0, 1.3, 0xffc193);
    b.pop();
    return b.build();
  });
  const root = instantiate(parts, null, true);
  root.name = 'red_shell';
  const wingMat = cached('fireflywing', () => new THREE.MeshStandardMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.55, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false, emissive: 0xbfefff, emissiveIntensity: 0.3 }));
  const wingGeo = cachedGeo('fireflywings', () => {
    const one = (sx) => { const g = new THREE.CircleGeometry(0.22, 12); g.scale(0.6, 1, 1); g.translate(0, 0.2, 0); g.rotateY(sx * 0.4); g.rotateX(-0.5); g.rotateZ(sx * 0.5); g.translate(sx * 0.12, 0, 0); return g; };
    return mergeGeometries([one(-1), one(1)], false);
  });
  const wing = new THREE.Mesh(wingGeo, wingMat);
  wing.position.y = 0.66;
  root.add(wing);
  const halo = glowSprite(0xffb35a, 1.6, 0.55);
  halo.position.set(0, 0.42, -0.2);
  root.add(halo);
  const t0 = Math.random() * 10;
  root.children[0].onBeforeRender = () => {
    const t = now() + t0;
    wing.scale.set(0.55 + Math.abs(Math.sin(t * 28)) * 0.45, 1, 1);
    halo.material.opacity = 0.4 + Math.sin(t * 5) * 0.2;
  };
  return root;
}

// --- Shooting star (blue_shell): face star + motion-aligned trail
function trailGeometry() {
  return cachedGeo('startrail', () => {
    const cone = (r, l) => { const g = coneG(r, l, 14, 1, true); g.translate(0, l / 2, 0); g.rotateX(-PI / 2); return g; };
    // outer soft blue cone + inner bright core, base (opaque) at the star, apex trailing toward -Z
    return mergeGeometries([cone(0.34, 1.8).toNonIndexed(), cone(0.17, 1.25).toNonIndexed()], false);
  });
}
function buildShootingStar() {
  const parts = itemTemplate('shootingstar', () => {
    const b = new Builder();
    const sm = stdMat(0xcfeaff, 0.3, 0, { emissive: 0x5cb8ff, emissiveIntensity: 0.5 }, 'shootstar');
    b.add(extrude(sparkleShape(0.55, 0.3), 0.16, 0.08, 10, 3), sm);
    b.add(extrude(sparkleShape(0.4, 0.3), 0.12, 0.06, 10, 3), sm, M([0, 0, 0], [0, PI / 2, 0]));
    faceOn(b, 0.17, 0, 0x2a4a7a, 1.5, 0xff9fb0);
    return b.build();
  });
  const root = new THREE.Group();
  root.name = 'blue_shell';
  const body = instantiate(parts, null, true);
  body.position.y = 0.7;
  root.add(body);
  const trail = new THREE.Group();
  trail.position.y = 0.7;
  const t1 = new THREE.Mesh(trailGeometry(), tailMat(0xbfe6ff, 0.75));
  t1.frustumCulled = false;
  trail.add(t1);
  trail.rotation.x = 0.35;
  root.add(trail);
  const halo = glowSprite(0x9fdcff, 2.4, 0.7);
  halo.position.y = 0.7;
  root.add(halo);
  // motion-aligned trail (no allocations per frame)
  const last = V3(), cur = V3(), vel = V3(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), tmpS = V3(), tmpP = V3();
  let lastT = -1, has = false;
  const t0 = Math.random() * 10;
  body.children[0].onBeforeRender = () => {
    const t = now();
    body.rotation.z = Math.sin((t + t0) * 3) * 0.15;
    halo.material.opacity = 0.55 + Math.sin((t + t0) * 6) * 0.15;
    if (t - lastT < 0.008) return;
    const dtt = lastT < 0 ? 0 : t - lastT;
    lastT = t;
    cur.setFromMatrixPosition(root.matrixWorld);
    if (has && dtt > 0) {
      vel.subVectors(cur, last).divideScalar(dtt);
      if (vel.lengthSq() > 4) {
        vel.normalize();
        wq.setFromUnitVectors(Z_FWD, vel); // trail extends along local -Z, i.e. behind the motion
        root.matrixWorld.decompose(tmpP, pq, tmpS);
        trail.quaternion.copy(pq.invert().multiply(wq));
      }
    }
    last.copy(cur); has = true;
  };
  return root;
}

// --- Comet (mushroom)
function buildCometParts() {
  const b = new Builder();
  b.add(new THREE.IcosahedronGeometry(0.3, 1), stdMat(0xe2c4fa, 0.3, 0, { emissive: 0xb07ae8, emissiveIntensity: 0.5, flatShading: true }, 'comet'), M([0, 0.36, 0.25]));
  const tail = tailMat(0xdbb2f6, 0.8);
  const tail2 = tail;
  for (const [r, l, x, y, m] of [[0.28, 1.2, 0, 0.42, tail], [0.17, 0.95, 0.12, 0.5, tail2], [0.16, 0.85, -0.12, 0.3, tail2]]) {
    const g = coneG(r, l, 12, 1, true);
    g.translate(0, l / 2, 0);
    b.add(g, m, M([x, y, 0.2], [-PI / 2 - 0.25, 0, 0]));
  }
  b.add(sphere(0.12, 10, 8), glowMat(0xffffff, 1.3, null, 'cometcore'), M([0, 0.36, 0.3]));
  return b.build();
}

// --- Aurora star (star)
function auroraRibbonGeo() {
  return cachedGeo('auroraribbon', () => {
    const g = torusG(0.72, 0.09, 4, 40, PI * 1.3);
    g.scale(1, 1, 0.15);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const a = (Math.atan2(pos.getY(i), pos.getX(i)) + TAU) % TAU;
      c.setHSL(0.38 + (a / (PI * 1.3)) * 0.45, 0.9, 0.55);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
}
function buildAuroraStar() {
  const parts = itemTemplate('aurorastar', () => {
    const b = new Builder();
    b.add(extrude(star5Shape(0.55, 0.28, 0.08), 0.16, 0.1, 8, 4), stdMat(0xffe08a, 0.3, 0.1, { emissive: 0xffb83a, emissiveIntensity: 0.35 }, 'aurorastar'));
    faceOn(b, 0.19, 0, 0x5a3a2a, 1.3, 0xed9b77);
    return b.build();
  });
  const root = new THREE.Group(); root.name = 'star';
  const inner = instantiate(parts, null, true);
  inner.position.y = 0.75;
  root.add(inner);
  const rm = cached('auroraribbonmat', () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const ribbonGeo = cachedGeo('auroraribbons3', () => mergeGeometries([0, 1, 2].map((i) => {
    const g = auroraRibbonGeo().clone().toNonIndexed();
    g.scale(1 - i * 0.12, 1 - i * 0.12, 1 - i * 0.12);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(1.1 + i * 0.5, i * 2.1, i * 1.2)));
    return g;
  }), false));
  const ribbons = new THREE.Mesh(ribbonGeo, rm);
  ribbons.position.y = 0.75;
  root.add(ribbons);
  const halo = glowSprite(0xb5f3d0, 2.2, 0.6);
  halo.position.y = 0.75;
  root.add(halo);
  const t0 = Math.random() * 10;
  inner.children[0].onBeforeRender = () => {
    const t = now() + t0;
    inner.rotation.set(Math.sin(t * 2) * 0.12, Math.sin(t * 1.4) * 0.5, 0);
    ribbons.rotation.set(Math.sin(t) * 0.2, t * 1.1, 0);
  };
  return root;
}

// --- Eclipse (lightning)
function buildEclipseParts() {
  const b = new Builder();
  b.add(sphere(0.42, 24, 16), stdMat(0x2b2160, 0.5, 0, { emissive: 0x1c1640, emissiveIntensity: 0.5 }, 'eclipse'), M([0, 0, 0], null, [1, 1, 0.45]));
  b.add(torusG(0.47, 0.05, 8, 40), glowMat(0xffe27a, 1.4, null, 'corona'));
  const ray = glowMat(0xffd56a, 1.2, null, 'ray');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const l = i % 2 ? 0.16 : 0.26;
    b.add(coneG(0.045, l, 6), ray, M([Math.cos(a) * (0.55 + l / 2), Math.sin(a) * (0.55 + l / 2), 0], [0, 0, a - PI / 2]));
  }
  // thin crescent of light on one edge
  b.add(extrude(crescentShape(0.42), 0.04, 0), glowMat(0xfff4c5, 1.3, null, 'eclipsecrescent'), M([0, 0, 0.17], [0, 0, PI]));
  return b.build();
}
function buildEclipse() {
  const root = new THREE.Group(); root.name = 'lightning';
  const inner = instantiate(itemTemplate('eclipse', buildEclipseParts), null, true);
  inner.position.y = 0.75;
  root.add(inner);
  const halo = glowSprite(0xffd56a, 2.6, 0.5);
  halo.position.y = 0.75;
  root.add(halo);
  const t0 = Math.random() * 10;
  inner.children[0].onBeforeRender = () => { const t = now() + t0; inner.rotation.z = t * 0.6; halo.material.opacity = 0.4 + Math.sin(t * 4) * 0.12; };
  return root;
}

// --- Sunflower bud (bomb)
function buildSunflowerBud() {
  const parts = itemTemplate('sunbud', () => {
    const b = new Builder();
    const stem = stdMat(0x4f9a4a, 0.7, 0, { emissive: 0x2f6a2a, emissiveIntensity: 0.15 }, 'stem');
    const { geo } = taperTube([V3(0, 0, 0), V3(0.05, 0.3, 0), V3(-0.03, 0.6, 0.02), V3(0, 0.82, 0)], 0.06, 0.8, 10, 7);
    b.add(geo, stem);
    const leaf = stdMat(0x7cc04f, 0.6, 0, { emissive: 0x3f7a2a, emissiveIntensity: 0.15, side: THREE.DoubleSide }, 'budleaf');
    b.add(extrude(leafShape(0.16, 1.1), 0.014, 0.008), leaf, M([0.04, 0.3, 0], [0.2, 0, -1.0]));
    b.add(extrude(leafShape(0.14, 1.1), 0.014, 0.008), leaf, M([-0.03, 0.45, 0], [-0.2, 0, 1.05]));
    // bud: green sepals cupping closed golden petals
    b.add(sphere(0.34, 22, 14, 0, TAU, PI * 0.42, PI * 0.58), stdMat(0x5fa84a, 0.6, 0, { emissive: 0x2f6a2a, emissiveIntensity: 0.15 }, 'sepal'), M([0, 1.02, 0]));
    const petal = stdMat(0xffcf4a, 0.45, 0, { emissive: 0xffa82a, emissiveIntensity: 0.35 }, 'petal');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      b.add(sphere(1, 10, 8), petal, M([Math.cos(a) * 0.16, 1.2, Math.sin(a) * 0.16], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], [0.11, 0.24, 0.07]));
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      b.add(coneG(0.07, 0.2, 6), stdMat(0x5fa84a, 0.6, 0, { emissive: 0x2f6a2a, emissiveIntensity: 0.15 }, 'sepal'), M([Math.cos(a) * 0.27, 1.02, Math.sin(a) * 0.27], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]));
    }
    b.push(M([0, 0.98, 0.33]));
    faceOn(b, 0, 0, 0x234f3a, 1.2, 0xed9b77);
    b.pop();
    return b.build();
  });
  const root = instantiate(parts, null, true);
  root.name = 'bomb';
  const glow = new THREE.Mesh(cachedGeo('budglow', () => new THREE.SphereGeometry(0.12, 12, 8)), cached('budglowmat', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1a8).multiplyScalar(1.4), toneMapped: false })));
  glow.position.set(0, 1.36, 0);
  root.add(glow);
  const halo = glowSprite(0xffd56a, 1.2, 0.6);
  halo.position.set(0, 1.36, 0);
  root.add(halo);
  const t0 = Math.random() * 10;
  glow.onBeforeRender = () => { const t = now() + t0; const s = 1 + Math.max(0, Math.sin(t * 9)) * 0.5; glow.scale.setScalar(s); halo.scale.setScalar(1.2 * s); };
  return root;
}

// --- Music note (coin)
function buildNoteParts() {
  const b = new Builder();
  const gold = stdMat(0xf0c060, 0.32, 0.25, { emissive: 0xc7902c, emissiveIntensity: 0.55 }, 'note');
  b.add(sphere(1, 20, 14), gold, M([-0.1, -0.3, 0], [0, 0, 0.45], [0.26, 0.19, 0.13]));
  b.add(rboxG(0.09, 0.82, 0.1, 2, 0.04), gold, M([0.11, 0.08, 0]));
  const flag = new THREE.Shape();
  flag.moveTo(0, 0);
  flag.bezierCurveTo(0.1, -0.02, 0.32, -0.12, 0.26, -0.42);
  flag.bezierCurveTo(0.24, -0.28, 0.12, -0.2, 0, -0.2);
  flag.lineTo(0, 0);
  b.add(extrude(flag, 0.07, 0.025), gold, M([0.12, 0.48, 0]));
  b.add(extrude(sparkleShape(0.07, 0.24), 0.02, 0.01), glowMat(0xfff6d8, 1.3, null, 'notesparkle'), M([-0.12, -0.3, 0.13]));
  return b.build();
}

// --- Night veil (ghost)
function buildVeilParts() {
  const b = new Builder();
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.05 + Math.sin(t * PI * 0.5) * 0.4 + Math.sin(t * 18) * 0.02 * t, 0.9 - t * 0.85)); }
  b.add(latheG(pts, 20), stdMat(0x6b5fd0, 0.5, 0, { emissive: 0x3a2f9a, emissiveIntensity: 0.4, transparent: true, opacity: 0.8, side: THREE.DoubleSide }, 'veil'));
  b.add(extrude(crescentShape(0.22), 0.06, 0.02), glowMat(0xe6dcff, 1.1, null, 'veilmoon'), M([0, 1.12, 0], [0, 0, -0.5]));
  b.push(M([0, 0.52, 0.29], [-0.35, 0, 0]));
  faceOn(b, 0, 0, 0xe6dcff, 1.2, 0xb7a6ff);
  b.pop();
  for (const [x, y, z] of [[0.25, 0.55, 0.32], [-0.3, 0.4, 0.25], [0.05, 0.25, 0.42]]) b.add(extrude(sparkleShape(0.05, 0.22), 0.01, 0), glowMat(0xfff6d8, 1.3, null, 'twinkleA'), M([x, y, z]));
  return b.build();
}

// --- Flight feather (bullet)
function buildFeatherParts() {
  const b = new Builder();
  const g = extrude(leafShape(0.5, 0.75), 0.03, 0.015, 14);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, pos.getZ(i) + Math.sin(y * 2.2) * 0.08); }
  g.computeVertexNormals();
  b.add(g, stdMat(0xd9f8d4, 0.5, 0, { emissive: 0x9fe0c0, emissiveIntensity: 0.35, side: THREE.DoubleSide }, 'feather'), M([0, 0, 0], [0, 0, -0.35]));
  const { geo } = taperTube([V3(0, -0.12, 0), V3(-0.08, 0.3, 0.06), V3(-0.24, 0.62, 0.02)], 0.018, 0.4, 10, 5);
  b.add(geo, stdMat(0x67baa5, 0.5, 0, null, 'quill'));
  b.add(extrude(sparkleShape(0.07, 0.24), 0.02, 0.01), MAT.gold, M([-0.1, 0.3, 0.06]));
  return b.build();
}

// --- Resonance (horn)
function buildBellParts() {
  const b = new Builder();
  const pts = [new THREE.Vector2(0.0, 0.62), new THREE.Vector2(0.12, 0.6), new THREE.Vector2(0.2, 0.48), new THREE.Vector2(0.24, 0.25), new THREE.Vector2(0.36, 0.08), new THREE.Vector2(0.38, 0.02), new THREE.Vector2(0.3, 0.04)];
  b.add(latheG(pts, 22), stdMat(0xc5f5de, 0.3, 0.3, { emissive: 0x6fc0a0, emissiveIntensity: 0.3, side: THREE.DoubleSide }, 'bell'));
  b.add(sphere(0.07, 10, 8), MAT.gold, M([0, 0.04, 0]));
  b.add(torusG(0.05, 0.015, 6, 12), MAT.gold, M([0, 0.66, 0]));
  const ring = tailMat(0x8fe0bf, 0.6);
  b.add(torusG(0.55, 0.018, 4, 36), ring, M([0, 0.3, 0], [PI / 2, 0, 0]));
  b.add(torusG(0.72, 0.012, 4, 40), ring, M([0, 0.3, 0], [PI / 2, 0, 0]));
  return b.build();
}

function named(obj, name) { obj.name = name; return obj; }
const TRIPLE_POS = [[-0.42, 0, 0.8], [0.42, 0, 0.8], [0, -0.4, 0.85]];
function tripleParts(key, make) {
  return itemTemplate(`triple:${key}`, () => mergeParts(TRIPLE_POS.map(([x, z, s]) => ({ parts: itemTemplate(key, make), matrix: new THREE.Matrix4().compose(V3(x, 0, z), new THREE.Quaternion(), V3(s, s, s)) }))));
}
const itemMesh = (key, make, name, cast = true) => named(instantiate(itemTemplate(key, make), null, cast), name);

/** Returns a fresh Object3D for the given item type (geometry/materials shared internally). */
export function createItemModel(type) {
  try {
    switch (type) {
      case 'item_box': return buildItemBox();
      case 'banana': return itemMesh('bramble', buildBrambleParts, 'banana');
      case 'triple_banana': return named(instantiate(tripleParts('bramble', buildBrambleParts), null, true), 'triple_banana');
      case 'green_shell': return itemMesh('seed', buildSeedParts, 'green_shell');
      case 'triple_green': return named(instantiate(tripleParts('seed', buildSeedParts), null, true), 'triple_green');
      case 'red_shell': return buildFirefly();
      case 'blue_shell': return buildShootingStar();
      case 'mushroom': return itemMesh('comet', buildCometParts, 'mushroom', false);
      case 'triple_mushroom': return named(instantiate(tripleParts('comet', buildCometParts), null, false), 'triple_mushroom');
      case 'star': return buildAuroraStar();
      case 'lightning': return buildEclipse();
      case 'bomb': return buildSunflowerBud();
      case 'coin': return itemMesh('note', buildNoteParts, 'coin');
      case 'ghost': return itemMesh('veil', buildVeilParts, 'ghost');
      case 'bullet': { const r = itemMesh('feather', buildFeatherParts, 'bullet'); r.children.forEach((c) => { c.position.y += 0.35; }); return r; }
      case 'horn': return itemMesh('bell', buildBellParts, 'horn');
      default: {
        return named(instantiate(itemTemplate('fallback', () => { const b = new Builder(); b.add(extrude(sparkleShape(0.4, 0.26), 0.12, 0.05), MAT.gold); return b.build(); })), String(type || 'item'));
      }
    }
  } catch (err) {
    console.warn('[models] createItemModel failed', type, err);
    return new THREE.Group();
  }
}

// ---------------------------------------------------------------------------------------------
// Character portraits (2D canvas, LUMEN style: flat soft shapes, no outlines, gradient sky)
// ---------------------------------------------------------------------------------------------
const _portraits = new Map();
export function createCharacterPortrait(character) {
  const ch = normChar(character);
  const key = `${ch.id}:${ch.species}:${ch.color}:${ch.accent}:${ch.scarf}`;
  if (_portraits.has(key)) return _portraits.get(key);
  let url = '';
  try {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    drawPortrait(c.getContext('2d'), ch);
    url = c.toDataURL('image/png');
  } catch (err) {
    console.warn('[models] portrait failed', err);
  }
  _portraits.set(key, url);
  return url;
}

const PORTRAIT_BG = {
  fox: ['#fff2cf', '#bfe8d6', '#7cc3b4'], fennec: ['#fff1d6', '#f6c992', '#d98a5c'], raccoon: ['#f3f0ff', '#b9c4e6', '#7d8fc0'],
  crab: ['#fff4ea', '#a8e9e2', '#5fbfc4'], frog: ['#f8ffe0', '#bfe79a', '#6fbf7a'], jaguar: ['#fff6dc', '#bfe3a8', '#4f9f7a'],
  lion: ['#fff4d6', '#f8d79a', '#e0a35c'], night: ['#6b5fd0', '#2b2160', '#120d33'],
};

function drawPortrait(g, ch) {
  const bg = PORTRAIT_BG[ch.species] || PORTRAIT_BG.fox;
  g.save();
  roundRectPath(g, 2, 2, 124, 124, 26);
  g.clip();
  const grd = g.createRadialGradient(64, 46, 4, 64, 64, 100);
  grd.addColorStop(0, bg[0]); grd.addColorStop(0.5, bg[1]); grd.addColorStop(1, bg[2]);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  // soft light rays + sparkles
  g.globalAlpha = ch.species === 'night' ? 0.06 : 0.16;
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 9; i++) {
    const a0 = -PI * 0.95 + (i / 9) * PI * 0.9, a1 = a0 + 0.08;
    g.beginPath(); g.moveTo(64, 30); g.lineTo(64 + Math.cos(a0) * 160, 30 + Math.sin(a0) * 160); g.lineTo(64 + Math.cos(a1) * 160, 30 + Math.sin(a1) * 160); g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
  const sparkle = ch.species === 'night' ? '#fff6d8' : '#ffffff';
  for (const [x, y, s, a] of [[18, 22, 5, 0.9], [108, 30, 4, 0.8], [100, 96, 3, 0.6], [24, 92, 3, 0.6], [86, 14, 2.5, 0.7]]) { g.globalAlpha = a; p2Star(g, x, y, s, sparkle); }
  g.globalAlpha = 1;

  if (ch.species === 'fox') drawLumenPortrait(g, ch);
  else drawAnimalPortrait(g, ch);

  g.restore();
  roundRectPath(g, 3, 3, 122, 122, 25);
  g.lineWidth = 3; g.strokeStyle = ch.species === 'night' ? 'rgba(183,166,255,0.8)' : 'rgba(255,255,255,0.9)'; g.stroke();
}

// Faithful bust of drawLumen (../lumen/js/song-art.js), scaled up.
function drawLumenPortrait(g, ch) {
  const scarf = css(ch.scarf ?? ch.accent);
  g.save();
  g.translate(60, 146); g.scale(2.3, 2.3);
  // scarf streaming behind
  g.fillStyle = scarf; g.beginPath(); g.moveTo(-4, -25);
  g.bezierCurveTo(-19, -26, -32, -16, -48, -24); g.lineTo(-41, -15); g.bezierCurveTo(-27, -8, -15, -16, -3, -20); g.fill();
  p2Stroke(g, [[-13, -22], [-27, -18], [-40, -20]], '#ffe2ac', 0.9, [1.6, 1.5]);
  // body + belly
  p2Ellipse(g, 0, -15, 12.5, 16, '#387d76'); p2Ellipse(g, 1, -15, 7.5, 11, '#99d1b7');
  p2Stroke(g, [[-7, -19], [-8, -9], [0, -3], [8, -9], [7, -19]], '#d2e4b3', 0.7, [1, 2]);
  p2Star(g, 0, -14, 4, '#f3d096'); p2Ellipse(g, 0, -14, 1.5, 1.5, '#fff0ce');
  // scarf wrap
  p2Ellipse(g, 0, -24, 11, 3.6, scarf);
  p2Stroke(g, [[-9, -24], [9, -24]], '#ffe2ac', 0.8, [1.4, 1.6]);
  // ears
  p2Leaf(g, -9, -36, 17, -0.56, '#306f70'); p2Leaf(g, 9, -36, 17, 0.5, '#306f70');
  p2Leaf(g, -10, -39, 11, -0.56, '#a6dfc6'); p2Leaf(g, 10, -39, 11, 0.5, '#a6dfc6');
  // face
  g.fillStyle = '#fff7dc'; g.beginPath(); g.moveTo(-17, -33);
  g.bezierCurveTo(-25, -48, 3, -56, 17, -42); g.bezierCurveTo(28, -33, 15, -21, 0, -22);
  g.bezierCurveTo(-9, -21, -17, -25, -17, -33); g.fill();
  const f = 1;
  p2Ellipse(g, -6 + f, -35, 2.4, 4, '#25575b'); p2Ellipse(g, 5 + f, -35, 2.4, 4, '#25575b');
  p2Ellipse(g, -5.3 + f, -36.4, 0.8, 1.1, '#ffffff'); p2Ellipse(g, 5.7 + f, -36.4, 0.8, 1.1, '#ffffff');
  p2Ellipse(g, -12, -30, 3, 1.7, '#edba9c'); p2Ellipse(g, 12, -30, 3, 1.7, '#edba9c');
  p2Star(g, 0, -47, 3.6, '#edc371');
  g.strokeStyle = '#ed9b77'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.ellipse(0, -27.5, 5, 2.2, 0, 0.1, PI - 0.1); g.stroke();
  g.restore();
}

function drawAnimalPortrait(g, ch) {
  const sp = speciesSheet(ch);
  const fur = css(sp.fur), face = css(sp.face), furDark = cssShift(sp.fur, 0.8), furLight = cssShift(sp.fur, 1.0, 1.0, 0.07);
  const cx = 64, cy = 66;
  const night = ch.species === 'night';
  // body / shoulders
  p2Ellipse(g, cx, 132, 40, 34, fur);
  if (sp.belly != null && !night) p2Ellipse(g, cx, 130, 22, 24, css(sp.belly));
  if (sp.neck) { p2Ellipse(g, cx, 100, 26, 7, css(sp.neck.color)); g.fillStyle = css(sp.neck.color); g.beginPath(); g.moveTo(cx - 8, 102); g.lineTo(cx + 8, 102); g.lineTo(cx, 116); g.fill(); }
  if (night) {
    g.fillStyle = '#241c58'; g.beginPath(); g.moveTo(cx - 6, 96); g.bezierCurveTo(cx - 30, 100, cx - 50, 92, cx - 62, 104); g.lineTo(cx - 58, 112); g.bezierCurveTo(cx - 40, 104, cx - 24, 108, cx - 4, 104); g.fill();
    p2Stroke(g, [[cx - 14, 101], [cx - 34, 101], [cx - 54, 104]], css(ch.accent), 1.6, [2, 3]);
    p2Ellipse(g, cx, 98, 24, 6, '#241c58');
  }
  // tails peeking
  if (sp.tail) {
    const tc = sp.tail.kind === 'ringed' ? fur : css(sp.tail.color);
    g.save(); g.translate(cx + 40, 112); g.rotate(-0.5);
    if (sp.tail.kind === 'ringed') { for (let i = 0; i < 4; i++) p2Ellipse(g, 0, -i * 11, 9, 7, i % 2 ? '#2e3440' : tc); }
    else if (sp.tail.kind === 'bushy') { p2Ellipse(g, 0, -14, 10, 18, tc); p2Ellipse(g, 0, -30, 8, 7, css(sp.tail.tip)); }
    else if (sp.tail.kind === 'tuft') { p2Stroke(g, [[0, 0], [2, -20], [0, -30]], tc, 4); p2Ellipse(g, 0, -33, 7, 8, css(sp.tail.tip)); }
    else { p2Stroke(g, [[0, 0], [3, -18], [0, -34]], tc, 7); for (let i = 1; i < 4; i++) p2Ellipse(g, 1, -i * 9, 4, 2, css(sp.tail.ring)); }
    g.restore();
  }
  // mane behind head
  if (sp.hat === 'mane') {
    const mc = css(ch.accent);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; p2Ellipse(g, cx + Math.cos(a) * 36, cy + Math.sin(a) * 33, 12, 12, mc); }
    p2Ellipse(g, cx, cy, 38, 35, mc);
  }
  // ears
  const R = 32;
  if (sp.ears) {
    const e = sp.ears;
    if (e.kind === 'leaf') {
      const sz = e.w > 1.2 ? 22 : 19;
      p2Leaf(g, cx - 14, cy - 18, sz, -0.6 - (e.w > 1.2 ? 0.15 : 0), css(e.outer), e.w);
      p2Leaf(g, cx + 14, cy - 18, sz, 0.6 + (e.w > 1.2 ? 0.15 : 0), css(e.outer), e.w);
      p2Leaf(g, cx - 15, cy - 22, sz * 0.65, -0.6 - (e.w > 1.2 ? 0.15 : 0), css(e.inner), e.w);
      p2Leaf(g, cx + 15, cy - 22, sz * 0.65, 0.6 + (e.w > 1.2 ? 0.15 : 0), css(e.inner), e.w);
    } else {
      for (const sx of [-1, 1]) { p2Ellipse(g, cx + sx * 25, cy - 24, 11, 11, css(e.outer)); p2Ellipse(g, cx + sx * 25, cy - 23, 6.5, 6.5, css(e.inner)); }
    }
  }
  // head
  if (ch.species === 'crab') {
    // eye stalks first
    for (const sx of [-1, 1]) { p2Stroke(g, [[cx + sx * 10, cy - 14], [cx + sx * 15, cy - 36]], furDark, 5); p2Ellipse(g, cx + sx * 15, cy - 40, 10, 10, face); }
    p2Ellipse(g, cx, cy + 2, 44, 26, fur);
    for (let i = 0; i < 6; i++) { const a = PI + 0.25 + (i / 5) * (PI - 0.5); p2Ellipse(g, cx + Math.cos(a) * 40, cy + 2 + Math.sin(a) * 22, 5, 5, furLight); }
    p2Ellipse(g, cx - 10, cy - 10, 16, 6, 'rgba(255,255,255,0.22)', -0.15);
    // claws
    for (const sx of [-1, 1]) { p2Ellipse(g, cx + sx * 46, cy + 34, 14, 11, fur, sx * 0.5); p2Ellipse(g, cx + sx * 52, cy + 26, 9, 6, furLight, sx * 0.6); }
  } else if (ch.species === 'frog') {
    for (const sx of [-1, 1]) p2Ellipse(g, cx + sx * 18, cy - 20, 14, 13, fur);
    p2Ellipse(g, cx, cy + 2, 40, 28, fur);
    p2Ellipse(g, cx, cy + 14, 32, 15, face);
  } else {
    p2Ellipse(g, cx, cy, R * 1.12, R * 0.97, sp.faceMode === 'full' ? face : fur);
    if (!night && sp.faceMode !== 'full') p2Ellipse(g, cx - 9, cy - 14, 14, 7, 'rgba(255,255,255,0.18)', -0.2);
  }
  if (sp.faceMode === 'muzzle' || sp.faceMode === 'mask') p2Ellipse(g, cx, cy + 12, 19, 14, face);
  if (sp.faceMode === 'mask') {
    for (const sx of [-1, 1]) { p2Ellipse(g, cx + sx * 13, cy - 3, 14, 9, '#353c48', sx * 0.3); p2Ellipse(g, cx + sx * 12, cy - 3, 7.5, 9, face); p2Ellipse(g, cx + sx * 11, cy - 16, 7, 3, face, sx * -0.3); }
  }
  if (sp.spots != null) for (const [x, y] of [[-18, -18], [16, -20], [0, -27], [-26, -4], [26, -4], [-8, -24], [9, -26]]) p2Ellipse(g, cx + x, cy + y, 3.2, 2.6, css(sp.spots));
  if (sp.starry) for (const [x, y, s] of [[-22, -12, 2.4], [20, -18, 2], [-6, -26, 1.6], [26, 4, 1.6], [-28, 6, 1.4]]) p2Star(g, cx + x, cy + y, s * 1.4, '#fff6d8', 0.22);
  // eyes
  const ey = ch.species === 'crab' ? cy - 40 : ch.species === 'frog' ? cy - 21 : cy - 2;
  const ex = ch.species === 'crab' ? 15 : ch.species === 'frog' ? 18 : 12;
  for (const sx of [-1, 1]) {
    if (night) { p2Ellipse(g, cx + sx * ex, ey, 4.6, 6.6, css(ch.accent)); p2Ellipse(g, cx + sx * ex, ey - 1, 2, 3, '#ffffff'); continue; }
    p2Ellipse(g, cx + sx * ex, ey, 4.2, 7, css(sp.eyes.color));
    p2Ellipse(g, cx + sx * ex + 1.3, ey - 2.6, 1.6, 2, '#ffffff');
  }
  // cheeks, nose, mouth
  if (sp.cheek != null) for (const sx of [-1, 1]) p2Ellipse(g, cx + sx * (ch.species === 'crab' ? 24 : 22), cy + (ch.species === 'crab' ? 6 : 9), 5.5, 3, css(sp.cheek));
  if (sp.nose) p2Ellipse(g, cx, cy + 7, 4.4, 3, css(sp.nose.color));
  if (sp.muzzle) {
    g.strokeStyle = css(sp.mouth.color); g.lineWidth = 2; g.lineCap = 'round';
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(cx + sx * 3.6, cy + 12, 3.6, 0.1, PI - 0.1); g.stroke(); }
  } else if (sp.mouth) {
    g.strokeStyle = css(sp.mouth.color); g.lineWidth = 2.4; g.lineCap = 'round';
    const w = sp.mouth.wide ? 12 : ch.species === 'crab' ? 7 : 6;
    g.beginPath(); g.ellipse(cx, ch.species === 'frog' ? cy + 10 : cy + 10, w, 3, 0, 0.15, PI - 0.15); g.stroke();
  }
  // hats & ornaments
  switch (sp.hat) {
    case 'chechia':
      g.fillStyle = '#c8303a'; roundRectPath(g, cx - 15, cy - 50, 30, 20, 6); g.fill();
      p2Ellipse(g, cx, cy - 50, 15, 3.5, '#a8242e');
      p2Stroke(g, [[cx, cy - 50], [cx - 12, cy - 47], [cx - 19, cy - 38]], '#1f2a44', 1.8);
      p2Ellipse(g, cx - 19, cy - 36, 3, 4, '#1f2a44');
      break;
    case 'cap':
      g.fillStyle = css(ch.accent); g.beginPath(); g.moveTo(cx - R - 2, cy - 12); g.bezierCurveTo(cx - R, cy - 50, cx + R, cy - 50, cx + R + 2, cy - 12); g.closePath(); g.fill();
      p2Ellipse(g, cx - 34, cy - 14, 13, 5, cssShift(ch.accent, 0.85), 0.3);
      p2Ellipse(g, cx, cy - 37, 3, 3, '#fff7dc');
      p2Star(g, cx + 12, cy - 26, 5, '#edc371');
      break;
    case 'shellclip':
      g.fillStyle = css(ch.accent); g.beginPath(); g.moveTo(cx + 26, cy - 8); g.arc(cx + 26, cy - 8, 10, PI * 1.05, PI * 1.95); g.closePath(); g.fill();
      p2Ellipse(g, cx + 26, cy - 9, 2.6, 2.6, '#fff4f0');
      break;
    case 'leafcap':
      p2Leaf(g, cx + 2, cy - 28, 15, -0.45, '#b4dc5a', 1.5);
      p2Stroke(g, [[cx + 2, cy - 28], [cx - 7, cy - 47]], '#5f9a3a', 1.2);
      break;
    case 'goggles':
      p2Stroke(g, [[cx - 36, cy - 12], [cx - 20, cy - 20], [cx + 20, cy - 20], [cx + 36, cy - 12]], '#3a3330', 4);
      for (const sx of [-1, 1]) { p2Ellipse(g, cx + sx * 11, cy - 21, 9, 8, '#edc371'); p2Ellipse(g, cx + sx * 11, cy - 21, 6.5, 5.5, '#8fe3d6'); p2Ellipse(g, cx + sx * 11 + 2, cy - 23, 2, 1.6, '#ffffff'); }
      break;
    case 'mane':
      p2Ellipse(g, cx + 2, cy - 30, 8, 5, css(ch.accent));
      break;
    default: break;
  }
  if (sp.browMoon != null) {
    g.fillStyle = css(sp.browMoon); g.beginPath(); g.arc(cx, cy - 20, 6, 0, TAU); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx + 3, cy - 22, 5.2, 0, TAU); g.fill(); g.globalCompositeOperation = 'source-over';
    // the cut-out above also removed the face: repaint that tiny area with the face colour
    g.save(); g.globalCompositeOperation = 'destination-over'; p2Ellipse(g, cx + 3, cy - 22, 5.4, 5.4, face); g.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// HUD item icons (2D canvas, LUMEN style). Bonus for the UI: createItemIcon('red_shell') -> dataURL.
// ---------------------------------------------------------------------------------------------
const _icons = new Map();
export function createItemIcon(type, size = 96) {
  const key = `${type}:${size}`;
  if (_icons.has(key)) return _icons.get(key);
  let url = '';
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.scale(size / 96, size / 96);
    drawItemIcon(g, type);
    url = c.toDataURL('image/png');
  } catch (err) {
    console.warn('[models] icon failed', type, err);
  }
  _icons.set(key, url);
  return url;
}

function iconFace(g, x, y, s = 1, eye = '#3a2a3a', smile = '#ed9b77') {
  for (const sx of [-1, 1]) { p2Ellipse(g, x + sx * 6 * s, y, 2.2 * s, 3.6 * s, eye); p2Ellipse(g, x + sx * 6 * s + 0.8 * s, y - 1.4 * s, 0.8 * s, 1 * s, '#ffffff'); }
  g.strokeStyle = smile; g.lineWidth = 1.8 * s; g.lineCap = 'round'; g.beginPath(); g.ellipse(x, y + 4 * s, 3.5 * s, 1.6 * s, 0, 0.1, PI - 0.1); g.stroke();
}

function drawItemIcon(g, type) {
  const glow = (x, y, r, color) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  const triple = (fn) => { for (const [x, y] of [[19, 0], [0, 37], [38, 37]]) { g.save(); g.translate(x, y); g.scale(0.6, 0.6); fn(); g.restore(); } };
  const bramble = () => {
    p2Ellipse(g, 48, 54, 24, 21, '#7a6a3a');
    g.strokeStyle = '#5f7f3a'; g.lineWidth = 6;
    for (const r of [0.3, 1.4, 2.4]) { g.beginPath(); g.ellipse(48, 54, 26, 12, r, 0, TAU); g.stroke(); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; p2Star(g, 48 + Math.cos(a) * 27, 54 + Math.sin(a) * 23, 3, '#f0e2b0', 0.2); }
    p2Leaf(g, 38, 36, 9, -0.7, '#8cc63f'); p2Leaf(g, 60, 36, 8, 0.7, '#8cc63f');
    p2Ellipse(g, 56, 46, 5, 5, '#d2557f'); p2Ellipse(g, 40, 60, 4.5, 4.5, '#d2557f');
  };
  const seed = () => {
    g.fillStyle = '#7ed37a'; g.beginPath(); g.moveTo(48, 20); g.bezierCurveTo(76, 30, 74, 78, 48, 80); g.bezierCurveTo(22, 78, 20, 30, 48, 20); g.fill();
    g.strokeStyle = 'rgba(40,110,60,0.45)'; g.lineWidth = 2; for (const x of [-10, 0, 10]) { g.beginPath(); g.moveTo(48 + x * 0.5, 24); g.quadraticCurveTo(48 + x * 1.8, 50, 48 + x, 78); g.stroke(); }
    p2Leaf(g, 46, 22, 7, -0.9, '#9ee07a'); p2Leaf(g, 50, 22, 6, 0.9, '#9ee07a');
    iconFace(g, 48, 54, 1, '#234f3a');
  };
  const comet = () => {
    g.save(); g.translate(48, 48); g.rotate(-0.6);
    const lg = g.createLinearGradient(0, 0, 0, 44); lg.addColorStop(0, 'rgba(219,178,246,0.95)'); lg.addColorStop(1, 'rgba(255,193,232,0)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(-14, 0); g.quadraticCurveTo(-8, 30, 0, 46); g.quadraticCurveTo(8, 30, 14, 0); g.fill();
    g.restore();
    glow(40, 40, 24, 'rgba(219,178,246,0.8)');
    p2Ellipse(g, 40, 40, 13, 13, '#f2e2ff'); p2Ellipse(g, 37, 37, 5, 5, '#ffffff');
  };
  g.clearRect(0, 0, 96, 96);
  switch (type) {
    case 'coin':
      glow(48, 48, 40, 'rgba(243,208,150,0.6)');
      p2Ellipse(g, 38, 66, 14, 10, '#f3d096', -0.45); g.fillStyle = '#f3d096'; g.fillRect(48, 20, 7, 48);
      g.beginPath(); g.moveTo(55, 20); g.bezierCurveTo(66, 22, 80, 30, 74, 50); g.bezierCurveTo(72, 40, 62, 36, 55, 36); g.fill();
      p2Star(g, 36, 66, 4, '#fff6d8');
      break;
    case 'banana': bramble(); break;
    case 'triple_banana': triple(bramble); break;
    case 'green_shell': seed(); break;
    case 'triple_green': triple(seed); break;
    case 'red_shell':
      glow(40, 56, 34, 'rgba(255,179,107,0.85)');
      p2Ellipse(g, 64, 30, 9, 15, 'rgba(232,251,255,0.8)', 0.6); p2Ellipse(g, 70, 40, 8, 13, 'rgba(232,251,255,0.7)', 1.0);
      p2Ellipse(g, 38, 58, 20, 18, '#ffc46b'); p2Ellipse(g, 60, 46, 17, 16, '#5a4a7a');
      p2Stroke(g, [[62, 32], [66, 18], [74, 14]], '#3a2f55', 2); p2Ellipse(g, 74, 14, 3, 3, '#ffe6a0');
      iconFace(g, 62, 46, 0.9, '#fff1d0', '#ffc193');
      break;
    case 'mushroom': comet(); break;
    case 'triple_mushroom': triple(comet); break;
    case 'bomb':
      p2Stroke(g, [[48, 90], [50, 64], [48, 50]], '#4f9a4a', 6);
      p2Leaf(g, 50, 74, 10, 1.1, '#7cc04f'); p2Leaf(g, 47, 66, 9, -1.1, '#7cc04f');
      glow(48, 22, 16, 'rgba(255,241,168,0.9)');
      for (let i = 0; i < 5; i++) p2Ellipse(g, 48 + (i - 2) * 6, 28, 5, 11, '#ffcf4a', (i - 2) * 0.25);
      g.fillStyle = '#5fa84a'; g.beginPath(); g.arc(48, 40, 18, 0, PI); g.fill();
      iconFace(g, 48, 44, 0.9, '#234f3a');
      break;
    case 'ghost':
      g.fillStyle = 'rgba(107,95,208,0.9)'; g.beginPath(); g.moveTo(48, 26); g.bezierCurveTo(78, 28, 76, 78, 80, 84); g.lineTo(16, 84); g.bezierCurveTo(20, 78, 18, 28, 48, 26); g.fill();
      g.fillStyle = '#e6dcff'; g.beginPath(); g.arc(46, 20, 12, 0, TAU); g.fill();
      g.fillStyle = 'rgba(107,95,208,1)'; g.beginPath(); g.arc(52, 16, 10, 0, TAU); g.fill();
      p2Star(g, 34, 58, 4, '#fff6d8'); p2Star(g, 60, 70, 3, '#fff6d8'); p2Star(g, 56, 46, 2.5, '#fff6d8');
      break;
    case 'star':
      for (const [c, r] of [['rgba(181,243,208,0.8)', 40], ['rgba(143,211,255,0.7)', 34], ['rgba(219,178,246,0.7)', 28]]) { g.strokeStyle = c; g.lineWidth = 5; g.beginPath(); g.arc(48, 52, r, PI * 1.05, PI * 1.95); g.stroke(); }
      g.fillStyle = '#fff6c8'; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i / 10) * TAU; const r = i % 2 ? 13 : 28; g.lineTo(48 + Math.cos(a) * r, 54 + Math.sin(a) * r); }
      g.closePath(); g.fill();
      iconFace(g, 48, 56, 0.9, '#5a3a2a');
      break;
    case 'bullet':
      glow(48, 48, 36, 'rgba(181,243,208,0.5)');
      p2Leaf(g, 34, 82, 28, 0.55, '#d9f8d4', 0.7);
      p2Stroke(g, [[34, 82], [50, 52], [68, 22]], '#67baa5', 2.4);
      p2Star(g, 52, 50, 5, '#edc371');
      break;
    case 'lightning':
      glow(48, 48, 44, 'rgba(255,213,106,0.7)');
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; p2Stroke(g, [[48 + Math.cos(a) * 30, 48 + Math.sin(a) * 30], [48 + Math.cos(a) * (i % 2 ? 36 : 42), 48 + Math.sin(a) * (i % 2 ? 36 : 42)]], '#ffd56a', 3); }
      p2Ellipse(g, 48, 48, 27, 27, '#ffe27a'); p2Ellipse(g, 52, 46, 25, 25, '#2b2160');
      break;
    case 'blue_shell':
      g.save(); g.translate(48, 48); g.rotate(0.7);
      { const lg = g.createLinearGradient(0, 0, 0, 46); lg.addColorStop(0, 'rgba(159,220,255,0.9)'); lg.addColorStop(1, 'rgba(159,220,255,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(-14, 0); g.quadraticCurveTo(0, 30, 0, 48); g.quadraticCurveTo(0, 30, 14, 0); g.fill(); }
      g.restore();
      glow(40, 40, 30, 'rgba(159,220,255,0.8)');
      p2Star(g, 40, 40, 26, '#dff3ff', 0.3);
      iconFace(g, 40, 41, 0.9, '#2a4a7a', '#ff9fb0');
      break;
    case 'horn':
      for (const r of [34, 42]) { g.strokeStyle = 'rgba(197,245,222,0.7)'; g.lineWidth = 3; g.beginPath(); g.arc(48, 52, r, PI * 1.1, PI * 1.9); g.stroke(); }
      g.fillStyle = '#c5f5de'; g.beginPath(); g.moveTo(40, 26); g.bezierCurveTo(30, 30, 34, 60, 22, 70); g.lineTo(74, 70); g.bezierCurveTo(62, 60, 66, 30, 56, 26); g.closePath(); g.fill();
      p2Ellipse(g, 48, 72, 6, 5, '#edc371'); p2Ellipse(g, 48, 24, 5, 4, '#edc371');
      break;
    case 'item_box': {
      glow(48, 48, 44, 'rgba(255,244,197,0.8)');
      const cols = ['#ffb3b3', '#ffd9a8', '#fff1a8', '#b5f3d0', '#9fdcff', '#dbb2f6'];
      for (let i = 0; i < 6; i++) { g.fillStyle = cols[i]; g.beginPath(); g.moveTo(48, 10); g.lineTo(26 + i * 8.8, 50); g.lineTo(26 + (i + 1) * 8.8, 50); g.closePath(); g.fill(); g.beginPath(); g.moveTo(48, 88); g.lineTo(26 + i * 8.8, 50); g.lineTo(26 + (i + 1) * 8.8, 50); g.closePath(); g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1; }
      p2Star(g, 48, 50, 12, '#fffbe8');
      break;
    }
    default:
      p2Star(g, 48, 48, 30, '#edc371');
  }
}

export const _internal = { normChar, speciesSheet, SPECIES_LIST };
// Shared building blocks for src/kartfx.js (same vertex-colour pipeline, same LOD rules).
export const _fx = { Builder, instantiate, mergeParts, spec, furMat, stdMat, glowMat, MAT, M, extrude, sparkleShape, leafShape, sphere, bigSphere, coneG, cylG, torusG, glowSprite, tailMat, currentQuality, withQuality };
