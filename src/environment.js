// Environment (Mondes): sky, aurora ribbons, lights, fog, terrain (or floating island over a starry void),
// water, distant backdrop, clouds, grandstands + crowd, pennants, themed scenery and weather particles for
// the eight LUMEN worlds: meadow | lagoon | jungle | desert | medina | city | aurora | night.
// Everything is procedural; vegetation/props are InstancedMesh with shared materials (mobile first).
// Quality hint (L.quality ∈ high|medium|low) thins scenery, terrain resolution, weather and the shadow map.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeFacadeTextures } from './track-textures.js';

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function hash(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f + o * 17.3, z * f - o * 9.1); norm += a; f *= 2.03; a *= 0.5; }
  return s / norm;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Paint a whole geometry with one vertex colour (so several parts can be merged into one draw call).
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const merged = (parts) => safeMerge(parts);
// Robust merge: normalises index / attribute sets so mergeGeometries never fails; returns null if it still does.
function safeMerge(parts, dispose = true) {
  const list0 = (parts || []).filter(Boolean);
  if (!list0.length) return null;
  const mixed = list0.some((p) => !p.index) && list0.some((p) => p.index);
  let list = mixed ? list0.map((p) => (p.index ? p.toNonIndexed() : p)) : list0;
  const common = Object.keys(list[0].attributes).filter((n) => list.every((p) => p.attributes[n]));
  for (const p of list) for (const n of Object.keys(p.attributes)) if (!common.includes(n)) p.deleteAttribute(n);
  for (const p of list) p.morphAttributes = {};
  let g = null;
  try { g = mergeGeometries(list); } catch (e) { g = null; }
  if (dispose) { list0.forEach((p) => p.dispose()); if (mixed) list.forEach((p) => p.dispose()); }
  return g || null;
}
const stripUV = (g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; };

// ---------------------------------------------------------------------------------------------
// The eight worlds. sky = [top, mid, horizon, below-horizon], sunCol = sun/moon disc colour.
// ---------------------------------------------------------------------------------------------
const THEMES = {
  meadow: {
    sky: [0x6fa6d6, 0xb4d4e4, 0xfbe2b8, 0xead6ae], sunCol: 0xfff0c4, sunDir: [0.62, 0.3, 0.72], sunSize: 1, moon: false,
    sun: [0xffe0ae, 2.7], hemi: [0xdcecff, 0x86b064, 1.2], fog: [320, 1450], exposure: 1.0,
    terrain: { g1: 0x8cc66a, g2: 0xb1db82, g3: 0x6fae62, rock: 0x9aa48c, sand: 0xefe0b0, sandWet: 0xcdbd8c, under: 0x7fb39a },
    relief: 1.0, hills: 1.0, water: { deep: 0x3f8fa8, shallow: 0x8fdccc, sky: 0xe0f2f2 },
    backdrop: 'hills', backdropCols: [0x5f9c86, 0x86b8a4, 0xb2d2c4], clouds: [0xffffff, 0xffe2d2, 26], stars: 0, aurora: 0,
    weather: 'pollen', envGround: 0x7fb060, stand: [0x387d76, 0xfff7dc, 0xe98c73, 0xa6dfc6], flags: [0xe98c73, 0xfff7dc, 0x387d76, 0xedc371, 0xa6dfc6, 0xdbb2f6],
  },
  lagoon: {
    sky: [0x3f9fe0, 0x8fd0ee, 0xe8f8f2, 0xbfe8e6], sunCol: 0xfff6dc, sunDir: [0.32, 0.74, -0.58], sunSize: 1, moon: false,
    sun: [0xfff3dc, 2.8], hemi: [0xd6f2ff, 0x9ccf9a, 1.25], fog: [380, 1600], exposure: 1.0,
    terrain: { g1: 0x78c25a, g2: 0x9bd66c, g3: 0x58a648, rock: 0xb8ad98, sand: 0xf6e4b4, sandWet: 0xdcc690, under: 0x8fd8c4 },
    relief: 0.85, hills: 0.9, sink: 6.5, corridor: 30, water: { deep: 0x1688c4, shallow: 0x4fe0d6, sky: 0xd0f0ff },
    backdrop: 'islands', backdropCols: [0x4f9a6a, 0x7fb8a0, 0xa8d4cc], clouds: [0xffffff, 0x9ab4c8, 30], stars: 0, aurora: 0,
    weather: null, envGround: 0x5fb090, stand: [0x3fc4c8, 0xffffff, 0xff8a6a, 0xffd27a], flags: [0x3fc4c8, 0xffffff, 0xff8a6a, 0xffd27a, 0x2f8fb0, 0xf6a6c6],
  },
  jungle: {
    sky: [0x5f9e98, 0xa4ccb4, 0xeef0c8, 0xc8d5a0], sunCol: 0xfff2c0, sunDir: [-0.42, 0.68, 0.6], sunSize: 1, moon: false,
    sun: [0xfff0c8, 2.5], hemi: [0xe4f6dc, 0x4f7a48, 1.35], fog: [210, 1100], exposure: 1.02,
    terrain: { g1: 0x4f9a4a, g2: 0x6ab45a, g3: 0x3c7f45, rock: 0x7a7a62, sand: 0xc8b080, sandWet: 0x8a7a50, under: 0x4f8f7a },
    relief: 1.6, hills: 1.5, water: { deep: 0x2a7f78, shallow: 0x6cc4a8, sky: 0x8cc0a4 },
    backdrop: 'ridges', backdropCols: [0x3f7a5a, 0x6a9e84, 0x9ec4ae], clouds: [0xf6fbf2, 0xb8d0c0, 22], stars: 0, aurora: 0,
    weather: 'fireflies', envGround: 0x3f7a48, stand: [0x3f8a4a, 0xfff2c4, 0xc9a46a, 0xffd25a], flags: [0xffd25a, 0xff8a6a, 0x3f8a4a, 0xfff2c4, 0x5fd6b0, 0xe85a6a],
  },
  desert: {
    sky: [0x6f86cc, 0xf0b48e, 0xffe2b4, 0xf0c896], sunCol: 0xfff0c8, sunDir: [0.25, 0.2, -0.95], sunSize: 1.25, moon: false,
    sun: [0xffc890, 2.7], hemi: [0xffe2c0, 0xc08a5a, 1.2], fog: [360, 1500], exposure: 1.0,
    terrain: { g1: 0xe8bf80, g2: 0xf3d29c, g3: 0xd9a868, rock: 0xc0784a, sand: 0xf6dcaa, sandWet: 0xc9a070, under: 0x6fb8a8 },
    relief: 0.8, hills: 1.2, dunes: 1, water: { deep: 0x1f8f98, shallow: 0x5fd8c4, sky: 0xffd8b0 },
    backdrop: 'dunes', backdropCols: [0xd9905c, 0xe8b07a, 0xf4cfa0], clouds: [0xffe6d0, 0xe08a8a, 16], stars: 0, aurora: 0,
    weather: 'dust', envGround: 0xd8a868, stand: [0xd0704a, 0xfff0cf, 0x2f8fb0, 0xffd27a], flags: [0xd0704a, 0xfff0cf, 0x2f8fb0, 0xffd27a, 0x4fa35a, 0xe85a6a],
  },
  medina: {
    sky: [0x4a9ad6, 0xa6d6ea, 0xfff6e2, 0xcfe8ee], sunCol: 0xfffbe8, sunDir: [-0.45, 0.68, -0.58], sunSize: 1, moon: false,
    sun: [0xfff4e0, 2.8], hemi: [0xe2f2ff, 0xc8b890, 1.3], fog: [420, 1750], exposure: 1.0,
    terrain: { g1: 0xa9bf7c, g2: 0xc8cf98, g3: 0x8aa862, rock: 0xd8cfb8, sand: 0xf2e6c4, sandWet: 0xd8c69a, under: 0x5fb4d0 },
    relief: 1.2, hills: 1.1, water: { deep: 0x1666b4, shallow: 0x3fc8d8, sky: 0xd8f0ff },
    backdrop: 'coast', backdropCols: [0x8aa0a8, 0xa9bcc0, 0xc6d6da], clouds: [0xffffff, 0xaac0d4, 14], stars: 0, aurora: 0,
    weather: 'petals', envGround: 0xb8b890, stand: [0x2a6fb0, 0xf8f6ef, 0xd66aa0, 0xf3d096], flags: [0x2a6fb0, 0xf8f6ef, 0xd66aa0, 0xf3d096, 0x3fc8d8, 0xe85a6a],
  },
  city: {
    sky: [0x5a7fb6, 0xe2aea6, 0xffe0bc, 0xe8c8b0], sunCol: 0xfff0d0, sunDir: [0.62, 0.17, -0.77], sunSize: 1.3, moon: false,
    sun: [0xffc8a0, 2.5], hemi: [0xf2dcea, 0x8a8a9a, 1.35], fog: [300, 1400], exposure: 1.02,
    terrain: { g1: 0xb9b3a8, g2: 0xcbc3b6, g3: 0xa9a398, rock: 0x9a948a, sand: 0xd8ccb4, sandWet: 0xa8a090, under: 0x5f8fa0, park: 0x8cc06a },
    relief: 0.22, hills: 0.25, water: { deep: 0x3a6898, shallow: 0x6aa8c0, sky: 0xffd8c0 },
    backdrop: 'skyline', backdropCols: [0x8a8fb0, 0xb0a6be, 0xd6bcc0], clouds: [0xffe6dc, 0xd08aa0, 20], stars: 0.15, aurora: 0,
    weather: null, envGround: 0x9a948a, stand: [0x3a3f5a, 0xffb84a, 0x5fd6e0, 0xf4f1ea], flags: [0xffb84a, 0x5fd6e0, 0xf4f1ea, 0xf28aa8, 0x8f7ff0, 0x9fd27a],
  },
  aurora: {
    sky: [0x161e48, 0x2c4880, 0x86a6d6, 0xa8c0e0], sunCol: 0xf4f8ff, sunDir: [0.35, 0.36, 0.86], sunSize: 0.9, moon: true,
    sun: [0xc8dcff, 1.7], hemi: [0xa6c2f6, 0xd0dcf2, 1.55], fog: [240, 1300], exposure: 1.12,
    terrain: { g1: 0xe8f0fb, g2: 0xf8fbff, g3: 0xd0dff0, rock: 0x6f7f98, sand: 0xdfe8f2, sandWet: 0xaebfd2, under: 0x6f8fb8 },
    relief: 1.4, hills: 1.9, ice: 1, water: { deep: 0x2f5f8f, shallow: 0xa8e4f2, sky: 0xc8d8ff },
    backdrop: 'peaks', backdropCols: [0x5a6f98, 0x8a9cc0, 0xf4f8ff], clouds: [0x6a7aa8, 0x2a3a6a, 0], stars: 1, aurora: 1,
    weather: 'snow', envGround: 0xc8d8f0, stand: [0x3f5f9a, 0xf4fbff, 0x7fb8ff, 0x9fe8d4], flags: [0x7fb8ff, 0xf4fbff, 0x9fe8d4, 0xdbb2f6, 0xffd27a, 0xe98c73],
  },
  night: {
    sky: [0x100a34, 0x281d64, 0x6a5aa8, 0x1c1650], sunCol: 0xfff7dc, sunDir: [-0.35, 0.42, 0.84], sunSize: 1.1, moon: true,
    sun: [0xcabaff, 1.6], hemi: [0xa494e0, 0x3a2f70, 1.5], fog: [230, 1250], exposure: 1.15,
    terrain: { g1: 0x504a94, g2: 0x645ea8, g3: 0x3f3a82, rock: 0x2f2a62, sand: 0x5a54a0, sandWet: 0x3a3478, under: 0x2a2458 },
    relief: 1.0, hills: 1.3, void: 1, water: null,
    backdrop: 'floaters', backdropCols: [0x2c2660, 0x4a4290, 0x8f7ff0], clouds: [0x4a3f88, 0x1c1650, 0], stars: 1.4, aurora: 1,
    weather: 'motes', envGround: 0x2a2458, stand: [0x5b4fb0, 0xf3d096, 0xb7a6ff, 0x2b2160], flags: [0xb7a6ff, 0xf3d096, 0x5b4fb0, 0xc5f5de, 0xdbb2f6, 0xfff7dc],
  },
};
const ALIAS = { beach: 'lagoon', snow: 'aurora', lava: 'night' };
const DENSITY = { high: 1, medium: 0.6, low: 0.35 };

export function createEnvironment(scene, renderer, root, L) {
  const world = ALIAS[L.world || L.theme] || L.world || L.theme || 'meadow';
  const TH = THEMES[world] || THEMES.meadow;
  const Q = L.quality || 'high';
  const dens = DENSITY[Q] || 1;
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const uniforms = { uTime: { value: 0 } };
  const WATER = L.waterLevel;
  const VOID = !!TH.void;
  const animated = [];   // { update(time) }

  const SUN_DIR = new THREE.Vector3(...TH.sunDir).normalize();
  const COL = {
    top: new THREE.Color(TH.sky[0]), mid: new THREE.Color(TH.sky[1]), horizon: new THREE.Color(TH.sky[2]),
    bottom: new THREE.Color(TH.sky[3]), sun: new THREE.Color(TH.sunCol),
  };
  if (renderer && renderer.isWebGLRenderer) renderer.toneMappingExposure = TH.exposure;

  // island centre
  const cx = (L.bounds.minX + L.bounds.maxX) / 2, cz = (L.bounds.minZ + L.bounds.maxZ) / 2;
  const ISLAND_R = 760;

  // ------------------------------------------------------------------ sky dome
  const skyMat = keep(new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: COL.top }, uMid: { value: COL.mid }, uHorizon: { value: COL.horizon }, uBottom: { value: COL.bottom },
      uSunDir: { value: SUN_DIR }, uSunColor: { value: COL.sun }, uStars: { value: TH.stars }, uVoid: { value: VOID ? 1 : 0 },
      uMoon: { value: TH.moon ? 1 : 0 }, uSunSize: { value: TH.sunSize || 1 }, uTime: uniforms.uTime,
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSunColor;
      uniform float uStars; uniform float uVoid; uniform float uMoon; uniform float uSunSize; uniform float uTime;
      varying vec3 vDir;
      float h31(vec3 q) { return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col;
        if (y > 0.0) {
          col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, y));
          col = mix(col, uTop, smoothstep(0.18, 0.75, y));
        } else {
          col = mix(uHorizon, uBottom, smoothstep(0.0, uVoid > 0.5 ? -0.35 : -0.12, y));
        }
        float sd = max(dot(d, uSunDir), 0.0);
        float disc = smoothstep(1.0 - 0.0009 * uSunSize, 1.0 - 0.0005 * uSunSize, sd);
        if (uMoon > 0.5) {
          // soft crescent moon: a second, offset disc carves the shadow side
          vec3 off = normalize(uSunDir + vec3(0.018, 0.012, 0.0));
          float carve = smoothstep(1.0 - 0.0007 * uSunSize, 1.0 - 0.0004 * uSunSize, max(dot(d, off), 0.0));
          col += uSunColor * (disc * (1.0 - carve * 0.85) * 2.2 + pow(sd, 90.0) * 0.25 + pow(sd, 8.0) * 0.06);
        } else {
          col += uSunColor * (disc * 3.5 + pow(sd, 60.0) * 0.45 + pow(sd, 6.0) * 0.16);
        }
        if (uStars > 0.0) {
          vec3 q = floor(d * 240.0);
          float h = h31(q);
          float tw = 0.65 + 0.35 * sin(uTime * (1.5 + fract(h * 31.0) * 3.0) + h * 60.0);
          float band = uVoid > 0.5 ? 1.0 : smoothstep(0.03, 0.3, y);
          col += vec3(0.95, 0.93, 1.0) * step(0.9962, h) * band * uStars * (0.45 + 0.55 * fract(h * 97.0)) * tw;
          // a few big soft four-point stars
          vec3 q2 = floor(d * 46.0);
          float h2 = h31(q2 + 7.0);
          if (h2 > 0.985) {
            vec3 c2 = (q2 + 0.5) / 46.0;
            float dd = length(d - normalize(c2)) * 46.0;
            col += vec3(1.0, 0.95, 0.85) * smoothstep(0.35, 0.0, dd) * band * uStars * 0.9 * tw;
          }
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
  }));
  const skyGeo = keep(new THREE.SphereGeometry(900, 48, 24));
  const makeSky = () => {
    const m = new THREE.Mesh(skyGeo, skyMat);
    m.frustumCulled = false; m.renderOrder = -1000; m.name = 'sky';
    m.onBeforeRender = (r, s, cam) => { m.position.copy(cam.position); m.updateMatrixWorld(); };
    return m;
  };
  root.add(makeSky());

  // env map from the sky for PBR materials (karts)
  let envRT = null;
  const prevEnv = scene.environment, prevBg = scene.background, prevFog = scene.fog;
  try {
    if (renderer && renderer.isWebGLRenderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.add(makeSky());
      const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TH.envGround }));
      ground.position.y = -20; envScene.add(ground);
      envRT = pmrem.fromScene(envScene, 0.02, 0.1, 2000);
      ground.geometry.dispose(); ground.material.dispose();
      pmrem.dispose();
      scene.environment = envRT.texture;
      if ('environmentIntensity' in scene) scene.environmentIntensity = 0.55;
    }
  } catch (e) { envRT = null; }
  scene.background = COL.horizon.clone();
  const fogCol = COL.horizon.clone().lerp(COL.mid, 0.25);
  scene.fog = new THREE.Fog(fogCol, TH.fog[0], TH.fog[1]);

  // ------------------------------------------------------------------ lights
  const hemi = new THREE.HemisphereLight(TH.hemi[0], TH.hemi[1], TH.hemi[2]);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(TH.sun[0], TH.sun[1]);
  sun.castShadow = true;
  const SM = Q === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(SM, SM);
  const SH = Q === 'low' ? 55 : 75;
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 600 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  const texel = (SH * 2) / SM;
  // a low sun casts very long shadows: keep the light high enough for readable, compact shadows
  const LIGHT_DIR = SUN_DIR.clone(); if (LIGHT_DIR.y < 0.45) { LIGHT_DIR.y = 0.45; LIGHT_DIR.normalize(); }
  function setShadowFocus(v) {
    if (!v || !isFinite(v.x)) return;
    const fx = Math.round(v.x / texel) * texel, fz = Math.round(v.z / texel) * texel;
    sun.target.position.set(fx, v.y || 0, fz);
    sun.position.set(fx, v.y || 0, fz).addScaledVector(LIGHT_DIR, 250);
    sun.target.updateMatrixWorld();
  }
  setShadowFocus(L.startPositions[0]?.position || new THREE.Vector3());

  // ------------------------------------------------------------------ terrain
  const T = TH.terrain;
  function natural(x, z) {
    const dx = x - cx, dz = z - cz;
    const r = Math.hypot(dx, dz) / ISLAND_R;
    let h = 1.2 + (4.5 * fbm(x * 0.0075, z * 0.0075) + 9 * Math.pow(fbm(x * 0.004 - 20, z * 0.004 + 13, 3), 2.2)) * TH.relief;
    const ang = Math.atan2(dz, dx);
    const hillMask = smoothstep(0.58, 0.8, r) * (1 - smoothstep(0.86, 0.95, r)) * (0.45 + 0.55 * Math.max(0, Math.sin(ang * 3 + 1.3)));
    h += hillMask * (14 + 34 * fbm(x * 0.012 + 3, z * 0.012 - 7)) * TH.hills;
    if (TH.dunes) {
      // crescent dune ridges, strongest away from the course
      const w = fbm(x * 0.004 + 9, z * 0.004 - 3, 2) * 6;
      const ridge = 1 - Math.abs(Math.sin(x * 0.018 + z * 0.006 + w));
      h += Math.pow(ridge, 2.2) * 11 * smoothstep(0.25, 0.6, r) + fbm(x * 0.02, z * 0.02, 2) * 2;
    }
    if (TH.sink) h -= TH.sink * (0.6 + 0.8 * fbm(x * 0.01 + 40, z * 0.01, 2));
    h = lerp(h, -16, smoothstep(0.9, 1.06, r));
    const dl = Math.hypot(x - L.lake.x, z - L.lake.z);
    h = lerp(h, -9 - 3 * fbm(x * 0.03, z * 0.03), 1 - smoothstep(L.lake.r * 0.72, L.lake.r + 14, dl));
    return h;
  }
  const corridor = { w: 0, y: 0, d: 0, wall: 0, i: -1 };
  function corridorAt(x, z) {
    const q = L.nearest(x, z, true);
    corridor.i = q.i;
    if (q.i < 0) { corridor.w = 0; corridor.d = 1e9; return corridor; }
    const i = q.i, d = Math.sqrt(q.d2);
    const lat = (x - L.px[i]) * L.rx[i] + (z - L.pz[i]) * L.rz[i];
    const wall = Math.min(lat >= 0 ? L.wallR[i] : L.wallL[i], L.halfWidth + 26);
    corridor.d = d; corridor.wall = wall; corridor.y = L.py[i];
    corridor.w = (1 - smoothstep(wall + 4, wall + (TH.corridor || 58), d)) * (1 - L.bridge[i]);
    return corridor;
  }
  function heightAt(x, z) {
    const n = natural(x, z);
    const c = corridorAt(x, z);
    const h = c.w > 0 ? lerp(n, c.y - 0.6, c.w) : n;
    // QA: never let the ground rise through the road. Near bridge ends the corridor weight fades out (bridge
    // weight) and on hillsides the 58 m blend leaves a few % of a tall hill: with a coarse terrain grid the
    // interpolated triangles then poked metres above the road (meadow pond bridge, jungle river, aurora…).
    // Cap the terrain under the road and let it rise from wall + 4 m with a gentle 0.35 bank.
    if (c.i < 0) return h;
    return Math.min(h, c.y - 0.6 + Math.max(0, c.d - c.wall - 4) * 0.35);
  }
  // a void world: the island floats; outside the rim and inside the lake is open sky
  const isVoid = (x, z) => {
    if (!VOID) return false;
    const r = Math.hypot(x - cx, z - cz) / ISLAND_R;
    if (r > 0.9) return true;
    return Math.hypot(x - L.lake.x, z - L.lake.z) < L.lake.r * 0.86;
  };

  const T_SIZE = 1900, T_SEG = Q === 'high' ? 260 : Q === 'medium' ? 200 : 150;
  let tGeo = new THREE.PlaneGeometry(T_SIZE, T_SIZE, T_SEG, T_SEG).rotateX(-Math.PI / 2);
  tGeo.translate(cx, 0, cz);
  const tPos = tGeo.attributes.position;
  const tCol = new Float32Array(tPos.count * 3);
  const near = new Float32Array(tPos.count);
  const voidV = new Uint8Array(tPos.count);
  const res = T_SEG + 1;
  const depthData = new Uint8Array(res * res * 4);
  for (let k = 0; k < tPos.count; k++) {
    const x = tPos.getX(k), z = tPos.getZ(k);
    const h = heightAt(x, z);
    tPos.setY(k, h);
    near[k] = corridor.w;
    voidV[k] = isVoid(x, z) && corridor.w < 0.5 ? 1 : 0;
  }
  tGeo.computeVertexNormals();
  {
    const c = new THREE.Color();
    const sandWet = new THREE.Color(T.sandWet), sand = new THREE.Color(T.sand);
    const g1 = new THREE.Color(T.g1), g2 = new THREE.Color(T.g2), g3 = new THREE.Color(T.g3);
    const rock = new THREE.Color(T.rock), under = new THREE.Color(T.under);
    const park = T.park ? new THREE.Color(T.park) : null;
    const nrm = tGeo.attributes.normal;
    for (let k = 0; k < tPos.count; k++) {
      const x = tPos.getX(k), y = tPos.getY(k), z = tPos.getZ(k);
      const n1 = fbm(x * 0.02, z * 0.02, 3);
      c.copy(g1).lerp(g2, smoothstep(0.35, 0.7, n1));
      c.lerp(g3, smoothstep(14, 30, y) * 0.8);
      if (park) c.lerp(park, smoothstep(0.55, 0.62, fbm(x * 0.006 + 4, z * 0.006 - 2, 2)) * (1 - near[k]));
      c.lerp(g2, near[k] * 0.3);
      const slope = 1 - nrm.getY(k);
      c.lerp(rock, smoothstep(0.22, 0.4, slope));
      if (!VOID) {
        const beach = (1 - smoothstep(WATER + 1.6, WATER + 3.2, y)) * (1 - smoothstep(0.02, 0.2, near[k]));
        c.lerp(sand, beach);
        c.lerp(sandWet, (1 - smoothstep(WATER - 0.5, WATER + 0.6, y)) * (1 - near[k]));
        c.lerp(under, smoothstep(WATER - 1, WATER - 8, y) * 0.5);
      }
      tCol[k * 3] = c.r; tCol[k * 3 + 1] = c.g; tCol[k * 3 + 2] = c.b;
    }
    for (let k = 0; k < tPos.count; k++) {
      const ix = k % res, z = tPos.getZ(k);
      const iz = Math.round((z - (cz - T_SIZE / 2)) / T_SIZE * T_SEG);
      const depth = Math.min(1, Math.max(0, (WATER - tPos.getY(k)) / 9));
      const o = (iz * res + ix) * 4;
      depthData[o] = depth * 255; depthData[o + 1] = 0; depthData[o + 2] = 0; depthData[o + 3] = 255;
    }
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  let skirt = null;
  if (VOID) {
    // drop triangles over the void and hang a crystal-rock skirt from the new rim
    const idx = tGeo.index.array;
    const keptIdx = [];
    const edgeCount = new Map();
    const ekey = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c2 = idx[t + 2];
      if (voidV[a] + voidV[b] + voidV[c2] >= 2) continue;
      keptIdx.push(a, b, c2);
      for (const [p, q] of [[a, b], [b, c2], [c2, a]]) { const kk = ekey(p, q); edgeCount.set(kk, (edgeCount.get(kk) || 0) + 1); }
    }
    tGeo.setIndex(keptIdx);
    const sp = [], sc = [];
    const top = new THREE.Color(T.rock).lerp(new THREE.Color(0x8f7ff0), 0.25), bot = new THREE.Color(TH.sky[3]);
    for (let t = 0; t < keptIdx.length; t += 3) {
      const tri = [keptIdx[t], keptIdx[t + 1], keptIdx[t + 2]];
      for (let e = 0; e < 3; e++) {
        const p = tri[e], q = tri[(e + 1) % 3];
        if (edgeCount.get(ekey(p, q)) !== 1) continue;
        const ax = tPos.getX(p), ay = tPos.getY(p), az = tPos.getZ(p);
        const bx = tPos.getX(q), by = tPos.getY(q), bz = tPos.getZ(q);
        const da = 30 + 50 * hash(p, 3), db = 30 + 50 * hash(q, 3);
        // quad (a, b, b-down, a-down); winding outward-facing follows the triangle edge order
        sp.push(ax, ay, az, bx, by - 0.01, bz, bx, by - db, bz, ax, ay, az, bx, by - db, bz, ax, ay - da, az);
        for (const f of [0, 0, 1, 0, 1, 1]) { const cc = top.clone().lerp(bot, f * 0.85); sc.push(cc.r, cc.g, cc.b); }
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    sg.computeVertexNormals();
    keep(sg);
    skirt = new THREE.Mesh(sg, keep(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    skirt.name = 'islandSkirt';
    root.add(skirt);
  }
  keep(tGeo);
  const detail = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ececec'; ctx.fillRect(0, 0, 256, 256);
    const rnd = mulberry(7);
    for (let i = 0; i < 7000; i++) {
      ctx.fillStyle = ['#d8d8d8', '#f8f8f8', '#e0e0e0', '#cccccc'][(rnd() * 4) | 0];
      ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2.5);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(T_SIZE / 9, T_SIZE / 9);
    return keep(t);
  })();
  const terrainMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, map: detail }));
  const terrain = new THREE.Mesh(tGeo, terrainMat);
  terrain.receiveShadow = true; terrain.name = 'terrain';
  root.add(terrain);

  // ------------------------------------------------------------------ water
  let waterMat = null;
  if (TH.water) {
    const depthTex = keep(new THREE.DataTexture(depthData, res, res, THREE.RGBAFormat));
    depthTex.magFilter = THREE.LinearFilter; depthTex.minFilter = THREE.LinearFilter;
    depthTex.needsUpdate = true;
    waterMat = keep(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uSunDir: { value: SUN_DIR.clone() },
        uDeep: { value: new THREE.Color(TH.water.deep) },
        uShallow: { value: new THREE.Color(TH.water.shallow) },
        uSky: { value: new THREE.Color(TH.water.sky) },
        uIce: { value: TH.ice ? 1 : 0 },
        uFoam: { value: new THREE.Color(0xffffff) },
        uDepth: { value: null },
        uBounds: { value: new THREE.Vector3(cx - T_SIZE / 2, cz - T_SIZE / 2, T_SIZE) },
      }]),
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uSunDir; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uFoam;
        uniform sampler2D uDepth; uniform vec3 uBounds; uniform float uIce;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        vec2 waveGrad(vec2 p, float t) {
          vec2 g = vec2(0.0);
          vec2 d1 = normalize(vec2(0.7, 0.4)), d2 = normalize(vec2(-0.3, 0.9)), d3 = normalize(vec2(0.9, -0.5)), d4 = normalize(vec2(-0.8, -0.3));
          g += d1 * cos(dot(p, d1) * 0.11 + t * 1.3) * 0.22;
          g += d2 * cos(dot(p, d2) * 0.19 + t * 1.7) * 0.16;
          g += d3 * cos(dot(p, d3) * 0.37 + t * 2.3) * 0.10;
          g += d4 * cos(dot(p, d4) * 0.61 + t * 2.9) * 0.07;
          float e = 0.35;
          vec2 q = p * 0.35 + vec2(t * 0.4, t * 0.25);
          float n0 = vn(q), nx = vn(q + vec2(e, 0.0)), nz = vn(q + vec2(0.0, e));
          g += vec2(nx - n0, nz - n0) / e * 0.18;
          return g;
        }
        void main() {
          vec2 p = vWorld.xz;
          float tt = uTime * (1.0 - uIce * 0.97);
          vec2 g = waveGrad(p, tt) * (1.0 - uIce * 0.8);
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
          vec2 duv = (p - uBounds.xy) / uBounds.z;
          float depth = 1.0;
          if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) depth = texture2D(uDepth, duv).r;
          vec3 col = mix(uShallow, uDeep, smoothstep(0.02, 0.55, depth));
          // soft caustic ripples in the shallows
          float caus = vn(p * 0.45 + vec2(tt * 0.35, -tt * 0.2)) * vn(p * 0.31 - vec2(tt * 0.2, tt * 0.3));
          col += vec3(0.9, 1.0, 0.95) * smoothstep(0.32, 0.6, caus) * (1.0 - smoothstep(0.05, 0.4, depth)) * 0.35 * (1.0 - uIce);
          if (uIce > 0.5) {
            float crack = smoothstep(0.02, 0.0, abs(vn(p * 0.08) - 0.5)) * 0.5 + smoothstep(0.015, 0.0, abs(vn(p * 0.21 + 3.0) - 0.5)) * 0.35;
            col = mix(col, vec3(0.92, 0.97, 1.0), crack);
          }
          col = mix(col, uSky, clamp(fres * 0.75, 0.0, 0.75));
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(n, H), 0.0), 260.0) * 3.0;
          float sparkle = step(0.985, vn(p * 1.7 + tt * 0.8)) * pow(max(dot(n, H), 0.0), 20.0) * 1.5;
          float foamBand = smoothstep(0.05, 0.0, depth);
          float foamWave = 0.55 + 0.45 * sin(depth * 70.0 - tt * 2.2 + vn(p * 0.25) * 6.0);
          float foam = clamp(foamBand * foamWave * 0.8 + smoothstep(0.015, 0.0, depth), 0.0, 1.0) * step(0.001, depth + 0.001) * (1.0 - uIce * 0.7);
          col = mix(col, uFoam, foam * 0.9);
          col += (spec + sparkle) * vec3(1.0, 0.96, 0.85);
          float alpha = mix(0.62, 0.96, smoothstep(0.0, 0.35, depth));
          alpha = max(alpha, foam);
          if (uIce > 0.5) alpha = 0.97;
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true, fog: true, depthWrite: true,
    }));
    waterMat.uniforms.uDepth.value = depthTex;
    const waterGeo = keep(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2));
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(cx, WATER, cz);
    water.name = 'water';
    water.renderOrder = 1;
    root.add(water);
  }

  // ------------------------------------------------------------------ distant backdrop (own baked haze, no fog)
  {
    const rnd = mulberry(99);
    const geos = [];
    const haze = fogCol.clone();
    const [cNear, cMid, cFar] = TH.backdropCols.map((h) => new THREE.Color(h));
    const tint = (g, col, hz) => {
      const n = g.attributes.position.count, arr = new Float32Array(n * 3);
      const pos = g.attributes.position;
      let ymin = Infinity, ymax = -Infinity;
      for (let k = 0; k < n; k++) { ymin = Math.min(ymin, pos.getY(k)); ymax = Math.max(ymax, pos.getY(k)); }
      const c = new THREE.Color();
      for (let k = 0; k < n; k++) {
        const f = (pos.getY(k) - ymin) / Math.max(1, ymax - ymin);
        c.copy(col).multiplyScalar(0.86 + 0.24 * f).lerp(haze, hz);
        arr[k * 3] = c.r; arr[k * 3 + 1] = c.g; arr[k * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      if (g.attributes.uv) g.deleteAttribute('uv');
      return g;
    };
    const ring = (count, dist0, dist1, make) => {
      for (let m = 0; m < count; m++) {
        const ang = (m / count) * Math.PI * 2 + rnd() * 0.25;
        const dist = dist0 + rnd() * (dist1 - dist0);
        const g = make(rnd, dist);
        if (!g) continue;
        g.rotateY(-ang);
        g.translate(cx + Math.cos(ang) * dist, 0, cz + Math.sin(ang) * dist);
        geos.push(g);
      }
    };
    const style = TH.backdrop;
    if (style === 'hills' || style === 'islands' || style === 'coast') {
      const layers = style === 'hills' ? [[cFar, 1380, 0.55, 1.0], [cMid, 1180, 0.35, 0.8], [cNear, 1020, 0.18, 0.6]] : [[cFar, 1350, 0.5, 0.7], [cMid, 1150, 0.3, 0.5]];
      for (const [col, d, hz, hs] of layers) {
        ring(style === 'hills' ? 18 : 11, d, d + 160, (r) => {
          if (style === 'islands' && r() < 0.35) return null;
          const rad = 140 + r() * 200, hgt = (45 + r() * 80) * hs * (style === 'coast' ? 0.8 : 1);
          const g = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(rad * (1.2 + r()), hgt, rad);
          g.translate(0, style === 'hills' ? -18 : -6, 0);
          return tint(g, col, hz);
        });
      }
      if (style === 'islands') {
        ring(5, 1250, 1450, (r) => tint(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(120 + r() * 80, 160 + r() * 120, 110 + r() * 60).translate(0, -10, 0), cNear, 0.35));
      }
    } else if (style === 'ridges') {
      for (const [col, d, hz] of [[cFar, 1350, 0.55], [cMid, 1150, 0.35]]) {
        ring(16, d, d + 150, (r) => {
          if (r() < 0.3) return tint(new THREE.CylinderGeometry(120 + r() * 60, 150 + r() * 60, 200 + r() * 120, 10).translate(0, 60, 0), col, hz); // tepui
          const rad = 110 + r() * 90;
          return tint(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(rad, 150 + r() * 160, rad * (0.8 + r() * 0.4)).translate(0, -10, 0), col, hz);
        });
      }
    } else if (style === 'dunes') {
      for (const [col, d, hz] of [[cFar, 1350, 0.5], [cMid, 1150, 0.3], [cNear, 980, 0.15]]) {
        ring(14, d, d + 140, (r) => {
          if (col === cNear && r() < 0.45) return tint(new THREE.CylinderGeometry(70 + r() * 60, 95 + r() * 60, 90 + r() * 120, 9).translate(0, 30, 0), new THREE.Color(0xc0663e), 0.25);
          const g = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(260 + r() * 220, 50 + r() * 70, 120 + r() * 80);
          return tint(g.translate(0, -8, 0), col, hz);
        });
      }
    } else if (style === 'skyline') {
      for (const [col, d, hz, hs] of [[cFar, 1350, 0.55, 1.4], [cMid, 1150, 0.35, 1.0], [cNear, 1000, 0.2, 0.7]]) {
        ring(Math.round(70 * Math.max(0.5, dens)), d, d + 120, (r) => {
          const w = 30 + r() * 60, h = (40 + r() * r() * 170) * hs;
          const g = new THREE.BoxGeometry(w, h, 30 + r() * 40).translate(0, h / 2 - 5, 0);
          return tint(g, col.clone().offsetHSL(0, 0, (r() - 0.5) * 0.08), hz);
        });
      }
    } else if (style === 'peaks') {
      const snow = new THREE.Color(0xf4f8ff), rockC = new THREE.Color(cMid);
      ring(22, 1080, 1460, (r, dist) => {
        const rad = 140 + r() * 170, hgt = 170 + r() * 260;
        const g = new THREE.ConeGeometry(rad, hgt, 11, 6).toNonIndexed();
        const pos = g.attributes.position;
        const seed = r() * 100;
        for (let k = 0; k < pos.count; k++) {
          let x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
          const hr = (y + hgt / 2) / hgt, a = Math.atan2(z, x);
          const nn = fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2 + hr * 3, 3);
          const s = 1 + (nn - 0.5) * 0.7 * (1 - hr);
          x *= s; z *= s; y += (nn - 0.5) * hgt * 0.12 * (1 - hr) * hr * 4;
          pos.setXYZ(k, x, y, z);
        }
        const colors = new Float32Array(pos.count * 3), c = new THREE.Color();
        for (let k = 0; k < pos.count; k += 3) {
          const yy = (pos.getY(k) + pos.getY(k + 1) + pos.getY(k + 2)) / 3;
          const hr = (yy + hgt / 2) / hgt + (r() - 0.5) * 0.08;
          c.copy(hr < 0.42 ? cNear : hr < 0.62 ? rockC : snow);
          c.lerp(haze, 0.3 + 0.18 * (dist - 1080) / 380);
          for (let j = 0; j < 3; j++) { colors[(k + j) * 3] = c.r; colors[(k + j) * 3 + 1] = c.g; colors[(k + j) * 3 + 2] = c.b; }
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        g.deleteAttribute('uv');
        g.computeVertexNormals();
        return g.translate(0, hgt / 2 - 25, 0);
      });
    } else if (style === 'floaters') {
      ring(26, 950, 1450, (r) => {
        const rad = 30 + r() * 70, hgt = 60 + r() * 90;
        const parts = [
          paint(new THREE.ConeGeometry(rad, hgt, 8, 2).rotateX(Math.PI).translate(0, -hgt / 2, 0), cNear.clone().lerp(haze, 0.3)),
          paint(new THREE.CylinderGeometry(rad * 1.02, rad * 0.98, 6, 8).translate(0, 2, 0), cMid.clone().lerp(haze, 0.25)),
        ];
        if (r() < 0.6) parts.push(paint(new THREE.OctahedronGeometry(8 + r() * 10, 0).scale(0.6, 2.4, 0.6).translate((r() - 0.5) * rad, 20, (r() - 0.5) * rad), cFar.clone().lerp(haze, 0.15)));
        return merged(parts).translate(0, 40 + r() * 220, 0);
      });
    }
    if (geos.length) {
      const mg = safeMerge(geos);
      if (mg) keep(mg);
      mg.computeVertexNormals();
      const mm = new THREE.Mesh(mg, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: style === 'peaks' || style === 'floaters', fog: false })));
      mm.name = 'backdrop';
      root.add(mm);
    }
  }

  // ------------------------------------------------------------------ clouds
  const cloudGroup = new THREE.Group();
  cloudGroup.position.set(cx, 0, cz);
  root.add(cloudGroup);
  if (TH.clouds[2] > 0) {
    const rnd = mulberry(5);
    const parts = [];
    for (let k = 0; k < 7; k++) {
      const s = 7 + rnd() * 7;
      const g = new THREE.IcosahedronGeometry(s, 1);
      g.scale(1, 0.62, 1);
      g.translate((k - 3) * 7 + rnd() * 4, (3 - Math.abs(k - 3)) * 2.5 + rnd() * 3, rnd() * 10 - 5);
      parts.push(stripUV(g));
    }
    const cg = merged(parts); if (cg) keep(cg);
    const cm = keep(new THREE.MeshLambertMaterial({ color: TH.clouds[0], emissive: TH.clouds[1], emissiveIntensity: 0.45, fog: false }));
    const COUNT = Math.max(6, Math.round(TH.clouds[2] * dens));
    const im = new THREE.InstancedMesh(cg, cm, COUNT);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let k = 0; k < COUNT; k++) {
      const a = rnd() * Math.PI * 2, r = 280 + rnd() * 780;
      p.set(Math.cos(a) * r, 170 + rnd() * 170, Math.sin(a) * r);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
      const sc = 1.2 + rnd() * 2.2;
      s.set(sc * 1.3, sc * (0.7 + rnd() * 0.3), sc);
      im.setMatrixAt(k, m4.compose(p, q, s));
    }
    im.frustumCulled = false; im.name = 'clouds';
    cloudGroup.add(im);
  }

  // ------------------------------------------------------------------ aurora ribbons (aurora / night)
  let auroraMat = null;
  if (TH.aurora) {
    const parts = [];
    const rnd = mulberry(33);
    const bands = world === 'night' ? 3 : 4;
    for (let b = 0; b < bands; b++) {
      const a0 = rnd() * Math.PI * 2, span = 1.0 + rnd() * 0.9, R = 620 + rnd() * 220, base = 150 + rnd() * 70, hgt = 120 + rnd() * 90;
      const g = new THREE.PlaneGeometry(1, 1, 72, 6);
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let k = 0; k < pos.count; k++) {
        const u = uv.getX(k), v = uv.getY(k);
        const a = a0 + (u - 0.5) * span;
        const rr = R + Math.sin(u * 9 + b) * 40 + Math.sin(u * 23 + b * 2) * 12;
        pos.setXYZ(k, cx + Math.cos(a) * rr, base + v * hgt + Math.sin(u * 5 + b) * 25, cz + Math.sin(a) * rr);
      }
      const seed = new Float32Array(pos.count).fill(b * 1.7);
      g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
      parts.push(g);
    }
    const ag = safeMerge(parts); if (ag) keep(ag);
    const [ca, cb] = world === 'night' ? [0x9fe8d4, 0xb48cff] : [0x7dffc0, 0x9a7dff];
    auroraMat = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uA: { value: new THREE.Color(ca) }, uB: { value: new THREE.Color(cb) } },
      vertexShader: /* glsl */`
        attribute float seed; varying vec2 vUv; varying float vSeed; uniform float uTime;
        void main() {
          vUv = uv; vSeed = seed;
          vec3 p = position;
          p.y += sin(uv.x * 14.0 + uTime * 0.6 + seed) * 10.0 * uv.y;
          p.x += sin(uv.x * 7.0 + uTime * 0.35 + seed * 2.0) * 14.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uA; uniform vec3 uB; uniform float uTime; varying vec2 vUv; varying float vSeed;
        void main() {
          float curtain = 0.55 + 0.45 * sin(vUv.x * 60.0 + sin(vUv.x * 9.0 + uTime * 0.5 + vSeed) * 4.0 + uTime * 0.8);
          float fade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y)) * smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          vec3 col = mix(uA, uB, smoothstep(0.25, 0.95, vUv.y));
          gl_FragColor = vec4(col * (0.9 + 0.3 * curtain), fade * (0.35 + 0.35 * curtain));
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    }));
    const am = new THREE.Mesh(ag, auroraMat);
    am.frustumCulled = false; am.renderOrder = -900; am.name = 'aurora';
    root.add(am);
  }

  // ------------------------------------------------------------------ placement helpers
  const standZones = [];   // {i0, i1, side, depth} along-sample ranges with grandstands
  const inStand = (i, lat, d, wall) => {
    for (const z of standZones) {
      const inRange = z.i0 <= z.i1 ? (i >= z.i0 && i <= z.i1) : (i >= z.i0 || i <= z.i1);
      if (inRange && Math.sign(lat) === z.side && d < wall + z.depth) return true;
    }
    return false;
  };
  function spot(x, z, minClear) {
    if (VOID && isVoid(x, z)) return { ok: false };
    const q = L.nearest(x, z, true);
    if (q.i < 0) return { ok: true, d: 1e9, i: -1 };
    const i = q.i, d = Math.sqrt(q.d2);
    const lat = (x - L.px[i]) * L.rx[i] + (z - L.pz[i]) * L.rz[i];
    const open = lat >= 0 ? L.openR[i] : L.openL[i];
    const wall = open ? L.halfWidth + 2 : (lat >= 0 ? L.wallR[i] : L.wallL[i]);
    if (d < wall + minClear) return { ok: false };
    if (open && d < 64) return { ok: false, field: true };
    if (inStand(i, lat, d, wall)) return { ok: false };
    return { ok: true, d: d - wall, i };
  }
  // walk along the course and offer spots on both sides at a given distance beyond the barrier
  function alongTrack(stepM, offset, cb, { jitter = 0, rnd = Math.random, minClear = 2, bridges = false } = {}) {
    const step = Math.max(1, Math.round(stepM / L.ds));
    for (let i = 0; i < L.N; i += step) {
      if (!bridges && L.bridge[i] > 0.2) continue;
      for (const side of [1, -1]) {
        const wall = side > 0 ? L.wallR[i] : L.wallL[i];
        if ((side > 0 ? L.openR[i] : L.openL[i])) continue;
        const off = (typeof offset === 'function' ? offset(rnd) : offset) + (jitter ? (rnd() - 0.5) * jitter : 0);
        const lat = side * (wall + off);
        const x = L.px[i] + L.rx[i] * lat, z = L.pz[i] + L.rz[i] * lat;
        const s = spot(x, z, minClear);
        if (!s.ok) continue;
        cb({ x, z, y: heightAt(x, z), i, side, face: Math.atan2(-L.rx[i] * side, -L.rz[i] * side), head: L.head[i] });
      }
    }
  }

  // ------------------------------------------------------------------ grandstands + crowd
  const withTime = (material, vertexPatch) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertexPatch);
    };
    material.customProgramCacheKey = () => vertexPatch;
    return material;
  };
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const tmpQ2 = new THREE.Quaternion();
  function instanced(geo, material, list, { cast = true, colors = null, name = '' } = {}) {
    if (!list.length || !geo || !material) return null;
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((it, k) => {
      tmpQ.setFromAxisAngle(upAxis, it.r || 0);
      if (it.tilt || it.tilt2) tmpQ.multiply(tmpQ2.setFromEuler(tmpE.set(it.tilt || 0, 0, it.tilt2 || 0)));
      tmpS.set(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sz || 1));
      im.setMatrixAt(k, tmpM.compose(tmpP.set(it.x, it.y, it.z), tmpQ, tmpS));
      if (colors) im.setColorAt(k, colors(it, k));
    });
    im.castShadow = cast === 'high' ? Q === 'high' : cast && Q !== 'low'; im.receiveShadow = true;
    im.name = name;
    root.add(im);
    return im;
  }
  const vcMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const flatMat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
  const smoothMat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const leafDS = keep(new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  const glowMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true }));
  const C = new THREE.Color();
  const pick = (arr, k) => C.setHex(arr[k % arr.length]);

  {
    const rnd = mulberry(123);
    const nSteps = (m) => Math.round(m / L.ds);
    const defs = [
      { from: -150, to: 70, side: 1, tiers: 8 },
      { from: -70, to: 45, side: -1, tiers: 6 },
    ];
    const standGeos = [];
    const crowd = [];
    const seatCols = TH.stand;
    const SEG_LEN = 10;
    for (const def of defs) {
      const i0 = ((nSteps(def.from) % L.N) + L.N) % L.N, i1 = ((nSteps(def.to) % L.N) + L.N) % L.N;
      const depth = 4 + def.tiers * 1.6 + 4;
      standZones.push({ i0, i1, side: def.side, depth });
      const segSamples = nSteps(SEG_LEN);
      const total = nSteps(def.to - def.from);
      for (let k = 0; k <= total - segSamples; k += segSamples) {
        const i = (i0 + k + Math.floor(segSamples / 2)) % L.N;
        const wall = def.side > 0 ? L.wallR[i] : L.wallL[i];
        const base = new THREE.Vector3(L.px[i], L.py[i], L.pz[i]);
        const right = new THREE.Vector3(L.rx[i], 0, L.rz[i]).multiplyScalar(def.side); // outward
        const rotY = Math.atan2(right.x, right.z);   // local +Z = outward, local X along track
        const place = (g, lx, ly, lz) => {
          g.rotateY(rotY);
          const off = right.clone().multiplyScalar(wall + 3 + lz);
          const along = new THREE.Vector3(-right.z, 0, right.x).multiplyScalar(lx);
          g.translate(base.x + off.x + along.x, base.y + ly, base.z + off.z + along.z);
          return g;
        };
        standGeos.push(place(paint(new THREE.BoxGeometry(SEG_LEN + 0.05, 4, 0.5), 0xe8e2d4), 0, -1, 0));
        for (let t = 0; t < def.tiers; t++) {
          const top = 1 + t * 0.85;
          standGeos.push(place(paint(new THREE.BoxGeometry(SEG_LEN + 0.05, top + 3, 1.6), seatCols[(t + (k / segSamples | 0)) % 4]), 0, (top - 3) / 2, 0.5 + t * 1.6 + 0.8));
          if (Q === 'low') continue;
          for (let c = 0; c < 6; c++) {
            if (rnd() < 0.12) continue;
            crowd.push({
              p: base.clone().addScaledVector(right, wall + 3 + 0.5 + t * 1.6 + 0.8 + (rnd() - 0.5) * 0.3)
                .addScaledVector(new THREE.Vector3(-right.z, 0, right.x), (c - 2.5) * (SEG_LEN / 6) + (rnd() - 0.5) * 0.6)
                .setY(base.y + top),
              rot: rotY + Math.PI,
            });
          }
        }
        const backZ = 0.5 + def.tiers * 1.6 + 0.3;
        const roofY = 1 + def.tiers * 0.85 + 4.2;
        standGeos.push(place(paint(new THREE.BoxGeometry(SEG_LEN + 0.05, roofY + 3, 0.6), 0xded6c6), 0, (roofY - 3) / 2, backZ));
        const roof = paint(new THREE.BoxGeometry(SEG_LEN + 0.1, 0.4, def.tiers * 1.6 + 3), (k / segSamples | 0) % 2 ? seatCols[2] : 0xfff7ec);
        roof.rotateX(-0.08);
        standGeos.push(place(roof, 0, roofY, backZ - (def.tiers * 1.6 + 3) / 2 + 0.3));
        standGeos.push(place(paint(new THREE.CylinderGeometry(0.18, 0.18, roofY - 1, 6), 0xc8c2b6), -SEG_LEN / 2 + 0.3, (roofY - 1) / 2 + 1, 0.5));
      }
    }
    const sg = merged(standGeos); if (sg) keep(sg);
    const stands = new THREE.Mesh(sg, vcMat);
    stands.castShadow = true; stands.receiveShadow = true; stands.name = 'grandstands';
    root.add(stands);

    if (crowd.length) {
      // crowd: little round creatures (body + head) bouncing via shader
      const bodyGeo = keep(new THREE.SphereGeometry(0.42, 7, 5).scale(0.85, 1.05, 0.85).translate(0, 0.5, 0));
      const headGeo = keep(new THREE.SphereGeometry(0.3, 7, 5).translate(0, 1.18, 0));
      const bounce = `
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 0.71;
          float jumper = step(0.45, fract(ph * 0.173));
          transformed.y += jumper * max(0.0, sin(uTime * (7.0 + fract(ph) * 3.0) + ph)) * 0.38;
        #endif`;
      const bodyMat = keep(withTime(new THREE.MeshLambertMaterial(), bounce));
      const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, crowd.length);
      const heads = new THREE.InstancedMesh(headGeo, bodyMat, crowd.length);
      const fur = [0x387d76, 0xe98c73, 0xd9a35b, 0x6d7b8c, 0x47b36b, 0xe0a23a, 0xc98a3c, 0x99d1b7, 0xdbb2f6, 0xffc193];
      const face = [0xfff7dc, 0xf6e3c2, 0xffe0bd, 0xf3d9a4];
      const m4 = new THREE.Matrix4(), c = new THREE.Color();
      crowd.forEach((cr, k) => {
        m4.makeRotationY(cr.rot).setPosition(cr.p);
        bodies.setMatrixAt(k, m4); heads.setMatrixAt(k, m4);
        bodies.setColorAt(k, c.setHex(fur[(rnd() * fur.length) | 0]));
        heads.setColorAt(k, c.setHex(face[(rnd() * face.length) | 0]));
      });
      bodies.name = 'crowd'; heads.name = 'crowdHeads';
      root.add(bodies, heads);
    }
  }

  // ------------------------------------------------------------------ pennants
  {
    const flagSpots = [];
    const step = Math.round(55 / L.ds);
    for (let i = 0; i < L.N; i += step) {
      if (L.bridge[i] > 0.2) continue;
      const side = L.kS[i] > 0 ? 1 : -1;  // outside of turn
      if (side > 0 ? L.openR[i] : L.openL[i]) continue;
      const wall = side > 0 ? L.wallR[i] : L.wallL[i];
      const lat = side * (wall + 2.2);
      const x = L.px[i] + L.rx[i] * lat, z = L.pz[i] + L.rz[i] * lat;
      if (!spot(x, z, 1.5).ok) continue;
      flagSpots.push({ x, y: L.py[i] - 0.5, z, rot: L.head[i] + Math.PI / 2 });
    }
    for (const zdef of standZones) {
      const len = ((zdef.i1 - zdef.i0) + L.N) % L.N;
      for (let k = 0; k <= len; k += Math.round(12 / L.ds)) {
        const i = (zdef.i0 + k) % L.N;
        const wall = zdef.side > 0 ? L.wallR[i] : L.wallL[i];
        const lat = zdef.side * (wall + zdef.depth - 4.8);
        flagSpots.push({ x: L.px[i] + L.rx[i] * lat, y: L.py[i] + 1 + 8 * 0.85 + 3.2, z: L.pz[i] + L.rz[i] * lat, rot: L.head[i] + Math.PI / 2, short: true });
      }
    }
    const poleGeo = keep(new THREE.CylinderGeometry(0.1, 0.13, 8, 6).translate(0, 4, 0));
    const poleMat = keep(new THREE.MeshLambertMaterial({ color: 0xfff7ec }));
    // swallow-tail pennant
    const fg = new THREE.PlaneGeometry(3.2, 1.9, 12, 4).translate(1.6, 7, 0);
    {
      const p = fg.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v), y = p.getY(v) - 7;
        const notch = smoothstep(2.2, 3.2, x) * (1 - Math.abs(y) / 0.95) * 0.9;
        p.setX(v, x - notch);
      }
    }
    const flagGeo = keep(fg);
    const flagMat = keep(withTime(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), `
      #ifdef USE_INSTANCING
        float fph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
        float fw = clamp(position.x / 3.2, 0.0, 1.0);
        transformed.z += sin(uTime * 6.0 - position.x * 1.7 + fph) * 0.42 * fw;
        transformed.y += sin(uTime * 3.7 - position.x * 1.2 + fph) * 0.12 * fw;
      #endif`));
    if (flagSpots.length) {
      const poles = new THREE.InstancedMesh(poleGeo, poleMat, flagSpots.length);
      const flags = new THREE.InstancedMesh(flagGeo, flagMat, flagSpots.length);
      const m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4(), c = new THREE.Color(), sc = new THREE.Vector3();
      flagSpots.forEach((f, k) => {
        const s = f.short ? 0.6 : 1;
        m4.makeRotationY(f.rot).scale(sc.set(1, s, 1)).setPosition(f.x, f.y, f.z);
        poles.setMatrixAt(k, m4);
        m5.makeRotationY(f.rot).setPosition(f.x, f.y - (1 - s) * 7, f.z);
        flags.setMatrixAt(k, m5);
        flags.setColorAt(k, c.setHex(TH.flags[k % TH.flags.length]));
      });
      poles.castShadow = Q !== 'low'; poles.name = 'flagPoles'; flags.name = 'flags';
      root.add(poles, flags);
    }
  }

  // ------------------------------------------------------------------ shared prop geometry
  const G = {};
  const LOD = Q === 'low' ? 0 : 1;   // icosphere subdivision for foliage
  const geo = (key, make) => { if (!G[key]) { const g = make(); if (g) G[key] = keep(g); } return G[key] || null; };
  const trunkGeo = () => geo('trunk', () => stripUV(new THREE.CylinderGeometry(0.3, 0.48, 3.4, 6).translate(0, 1.7, 0)));
  const canopyGeo = () => geo('canopy', () => {
    const parts = [
      new THREE.IcosahedronGeometry(2.6, LOD).translate(0, 4.7, 0),
      new THREE.IcosahedronGeometry(1.9, LOD).translate(1.4, 4.1, 0.6),
      new THREE.IcosahedronGeometry(1.8, LOD).translate(-1.2, 4.3, -0.8),
      new THREE.IcosahedronGeometry(1.5, LOD).translate(0.2, 6.2, 0.2),
    ].map(stripUV);
    return merged(parts);
  });
  const pineGeo = () => geo('pine', () => merged([
    new THREE.ConeGeometry(2.8, 3.6, 8).translate(0, 3.4, 0), new THREE.ConeGeometry(2.2, 3.2, 8).translate(0, 5.2, 0),
    new THREE.ConeGeometry(1.5, 2.8, 8).translate(0, 6.9, 0)].map(stripUV)));
  const pineTrunk = () => geo('pineTrunk', () => stripUV(new THREE.CylinderGeometry(0.25, 0.4, 2.2, 5).translate(0, 1.1, 0)));
  const rockGeo = () => geo('rock', () => stripUV(new THREE.DodecahedronGeometry(1, 1)));
  const bushGeo = () => geo('bush', () => stripUV(new THREE.IcosahedronGeometry(1.3, 1).scale(1, 0.75, 1)));
  const tuftGeo = () => geo('tuft', () => {
    const parts = [];
    for (let k = 0; k < 3; k++) parts.push(stripUV(new THREE.ConeGeometry(0.14, 0.9, 3).rotateZ((k - 1) * 0.35).rotateY(k * 2.1).translate(0, 0.4, 0)));
    return merged(parts);
  });
  const flowerGeo = () => geo('flower', () => {
    // a five-petal corolla (flattened 10-gon with notched rim) on a thin stem: ~40 triangles
    const head = new THREE.CylinderGeometry(0.24, 0.12, 0.1, 10, 1).translate(0, 0.52, 0);
    const p = head.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), z = p.getZ(v), r = Math.hypot(x, z);
      if (r > 0.18) { const k = (Math.round(Math.atan2(z, x) / (Math.PI / 5)) % 2) ? 0.62 : 1; p.setX(v, x * k); p.setZ(v, z * k); }
    }
    return merged([stripUV(head), stripUV(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 3).translate(0, 0.25, 0))]);
  });
  const palmGeos = () => {
    if (G.palmTrunk) return [G.palmTrunk, G.palmFronds];
    const tp = [];
    for (let k = 0; k < 6; k++) {
      const g = stripUV(new THREE.CylinderGeometry(0.3 - k * 0.02, 0.36 - k * 0.02, 1.35, 6));
      g.translate(k * k * 0.035, 0.65 + k * 1.25, 0);
      tp.push(g);
    }
    G.palmTrunk = keep(merged(tp));
    const topX = 25 * 0.035, topY = 0.65 + 5 * 1.25 + 0.6;
    const fp = [];
    for (let k = 0; k < 8; k++) {
      const f = stripUV(new THREE.BoxGeometry(3.8, 0.08, 0.9, 4, 1, 1));
      const p = f.attributes.position;
      for (let v = 0; v < p.count; v++) { const xx = p.getX(v) + 1.9; p.setX(v, xx); p.setY(v, p.getY(v) - 0.09 * xx * xx); p.setZ(v, p.getZ(v) * (1 - xx / 4.5)); }
      f.rotateY((k / 8) * Math.PI * 2 + (k % 2) * 0.2);
      f.translate(topX, topY, 0);
      fp.push(f.toNonIndexed()); f.dispose();
    }
    fp.push(stripUV(new THREE.IcosahedronGeometry(0.45, 0).translate(topX, topY - 0.3, 0)));
    G.palmFronds = keep(merged(fp));
    G.palmFronds.computeVertexNormals();
    return [G.palmTrunk, G.palmFronds];
  };
  // lantern on a post: post geometry + glowing lantern geometry (two instanced meshes)
  const lanternGeos = () => {
    if (G.lanternPost) return [G.lanternPost, G.lanternGlow];
    G.lanternPost = keep(merged([
      paint(new THREE.CylinderGeometry(0.09, 0.12, 3.2, 6).translate(0, 1.6, 0), 0x5a4a3a),
      paint(new THREE.BoxGeometry(0.9, 0.08, 0.08).translate(0.35, 3.15, 0), 0x5a4a3a),
      paint(new THREE.ConeGeometry(0.42, 0.32, 6).translate(0.75, 3.05, 0), 0x6a4f3a),
    ]));
    G.lanternGlow = keep(stripUV(new THREE.SphereGeometry(0.32, 10, 8).scale(1, 1.25, 1).translate(0.75, 2.62, 0)));
    return [G.lanternPost, G.lanternGlow];
  };

  // ------------------------------------------------------------------ scatter (vegetation & props)
  const rnd = mulberry(2024 + world.length * 31);
  const R = ISLAND_R * 0.93;
  function scatter(maxN, minClear, accept, guardMax = 60000) {
    const out = [];
    let guard = 0;
    const target = Math.round(maxN * dens);
    while (out.length < target && guard++ < guardMax) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const s = spot(x, z, minClear);
      if (!s.ok) continue;
      const y = heightAt(x, z);
      const it = accept(x, y, z, s);
      if (it) out.push(it);
    }
    return out;
  }
  const aboveWater = (y, m = 0.3) => VOID || y > WATER + m;
  const forestAt = (x, z) => fbm(x * 0.008 + 11, z * 0.008 - 4, 3);
  const meadowAt = (x, z) => fbm(x * 0.03 - 3, z * 0.03 + 8, 2);
  function lanternsAlong(step, glowCol, postCol) {
    const [postG, glowG] = lanternGeos();
    const list = [];
    let alt = 0;
    alongTrack(step, 2.4, (p) => { if ((alt++ % 2) === 0) list.push({ x: p.x, y: p.y - 0.2, z: p.z, r: p.face + Math.PI, s: 1.15 }); }, { rnd });
    const postMat = postCol ? keep(new THREE.MeshLambertMaterial({ color: postCol, vertexColors: true })) : vcMat;
    instanced(postG, postMat, list, { name: 'lanternPosts' });
    instanced(glowG, glowMat, list, { cast: false, colors: (it, k) => pick(glowCol, k).multiplyScalar(1.15), name: 'lanterns' });
    return list;
  }
  function shortcutDressing(flowerCols, hedgeCol) {
    // flowers fill the open field, hedges mark its invisible edges
    const fl = [];
    for (const z of L.shortcutZones || []) {
      for (let ii = z.s0; ii <= z.s1; ii += Math.max(1, Math.round(2 / L.ds))) {
        const i = ii % L.N;
        for (let k = 0; k < 6; k++) {
          const lat = z.side * (L.halfWidth + 3 + rnd() * 40);
          const x = L.px[i] + L.rx[i] * lat + (rnd() - 0.5) * 4, zz = L.pz[i] + L.rz[i] * lat + (rnd() - 0.5) * 4;
          const q = L.nearest(x, zz, true);
          if (q.i < 0 || Math.sqrt(q.d2) < L.halfWidth + 2.5) continue;
          fl.push({ x, y: heightAt(x, zz) + 0.05, z: zz, r: rnd() * 6.28, s: 0.8 + rnd() * 0.5 });
        }
      }
    }
    instanced(flowerGeo(), smoothMat, fl.slice(0, Math.round(1600 * dens)), { cast: false, colors: (it, k) => pick(flowerCols, k), name: 'shortcutFlowers' });
    const hedges = (L.openEdges || []).map((p) => ({ x: p.x, y: heightAt(p.x, p.z) - 0.2, z: p.z, r: rnd() * 6.28, s: 1.1 + rnd() * 0.4, sy: 0.9 }));
    instanced(bushGeo(), smoothMat, hedges, { colors: (it, k) => pick(hedgeCol, k), name: 'hedges' });
  }

  const greens = [0x4f9a78, 0x6fb08a, 0x3f8a6a, 0x8fc49a, 0x5fa86f, 0x78b28e];
  const flowersPastel = [0xffc6d6, 0xfff2c4, 0xffffff, 0xffb59a, 0xdbc6ff, 0xf6a6c6, 0xffe08a];

  // world-specific dressing
  const boats = [];
  const builders = {
    meadow() {
      const round = scatter(620, 6, (x, y, z) => {
        if (!aboveWater(y)) return null;
        const f = forestAt(x, z);
        if (f < 0.4 && rnd() < 0.7) return null;
        return { x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.8, blossom: rnd() < 0.14 };
      });
      alongTrack(17, (r) => 9 + r() * 22, (p) => { if (rnd() < 0.7 && aboveWater(p.y)) round.push({ x: p.x, y: p.y - 0.3, z: p.z, r: rnd() * 6.28, s: 0.9 + rnd() * 0.6, blossom: rnd() < 0.18 }); }, { rnd, minClear: 7 });
      instanced(trunkGeo(), keep(new THREE.MeshLambertMaterial({ color: 0x8a6448 })), round, { name: 'trunks' });
      instanced(canopyGeo(), smoothMat, round, { colors: (it, k) => it.blossom ? pick([0xf6b8c8, 0xffd0dc, 0xf4c4a8], k) : pick(greens, k), name: 'canopies' });
      const bushes = scatter(260, 2, (x, y, z) => aboveWater(y, 1) && { x, y: y - 0.2, z, r: rnd() * 6.28, s: 0.7 + rnd() * 0.8 });
      instanced(bushGeo(), smoothMat, bushes, { colors: (it, k) => pick(greens, k * 3).multiplyScalar(0.92), name: 'bushes' });
      const flowers = scatter(2600, 1.2, (x, y, z, s) => {
        if (!aboveWater(y, 2) || meadowAt(x, z) < 0.5 || (s.d > 70 && rnd() < 0.6)) return null;
        return { x, y: y - 0.05, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.7, c: (meadowAt(x, z) * 37) % 1 };
      });
      instanced(flowerGeo(), smoothMat, flowers, { cast: false, colors: (it) => pick(flowersPastel, (it.c * flowersPastel.length) | 0), name: 'flowers' });
      const tufts = scatter(3000, 1.2, (x, y, z, s) => aboveWater(y, 2) && (s.d < 70 || rnd() < 0.25) && { x, y: y - 0.05, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.8 });
      instanced(tuftGeo(), smoothMat, tufts, { cast: false, colors: (it, k) => pick([0x7fbf5a, 0x96cf6a, 0x6aa84f], k), name: 'tufts' });
      const rocks = scatter(90, 3, (x, y, z) => aboveWater(y, -0.5) && { x, y: y - 0.3, z, r: rnd() * 6.28, s: 0.7 + rnd() * rnd() * 2.5, sy: 0.6 });
      instanced(rockGeo(), smoothMat, rocks, { colors: (it, k) => pick([0xb8b8a8, 0xa8ac98, 0xc8c4b0], k), name: 'rocks' });
      // sleepy sheep grazing in the fields
      const sheep = scatter(28, 14, (x, y, z) => aboveWater(y, 2) && forestAt(x, z) < 0.5 && { x, y: y, z, r: rnd() * 6.28, s: 1 + rnd() * 0.3 });
      const sheepGeo = geo('sheepDecor', () => merged([
        paint(new THREE.IcosahedronGeometry(0.9, 1).scale(1.25, 0.85, 0.95).translate(0, 1.0, 0), 0xfffaf0),
        paint(new THREE.SphereGeometry(0.42, 8, 6).scale(0.9, 1, 1.1).translate(1.05, 1.05, 0), 0x4a4048),
        ...[[-0.5, -0.4], [-0.5, 0.4], [0.5, -0.4], [0.5, 0.4]].map(([a, b]) => paint(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 5).translate(a, 0.3, b), 0x4a4048)),
      ]));
      instanced(sheepGeo, vcMat, sheep, { name: 'sheepDecor' });
      lanternsAlong(26, [0xffd89a, 0xffc98a, 0xfff0c0]);
      shortcutDressing([0xffb3c8, 0xfff2c4, 0xffffff, 0xffc193, 0xdbb2f6], [0x4f9a78, 0x5fa86f]);
    },
    lagoon() {
      const palms = [];
      const round = scatter(520, 6, (x, y, z) => {
        const h = natural(x, z);
        if (!aboveWater(y)) return null;
        if (h < WATER + 3.4) { if (rnd() < 0.8) palms.push({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.45, tilt: (rnd() - 0.5) * 0.3, tilt2: (rnd() - 0.5) * 0.3 }); return null; }
        if (forestAt(x, z) < 0.44 && rnd() < 0.85) return null;
        return { x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.7 };
      });
      alongTrack(24, (r) => 7 + r() * 6, (p) => {
        if (Math.hypot(p.x - L.lake.x, p.z - L.lake.z) > L.lake.r + 110 && rnd() < 0.6) return;
        if (p.y > WATER + 0.3) palms.push({ x: p.x, y: p.y - 0.3, z: p.z, r: rnd() * 6.28, s: 0.9 + rnd() * 0.3, tilt: (rnd() - 0.5) * 0.3, tilt2: (rnd() - 0.5) * 0.3 });
      }, { rnd, minClear: 5 });
      instanced(trunkGeo(), keep(new THREE.MeshLambertMaterial({ color: 0x9a7050 })), round, { name: 'trunks' });
      instanced(canopyGeo(), smoothMat, round, { colors: (it, k) => pick([0x5cb338, 0x76c442, 0x4a9e31, 0x8fd14f, 0x6bbf3d], k), name: 'canopies' });
      const [pt, pf] = palmGeos();
      instanced(pt, keep(new THREE.MeshLambertMaterial({ color: 0xb08a5a, flatShading: true })), palms, { name: 'palmTrunks' });
      instanced(pf, leafDS, palms, { colors: (it, k) => pick([0x3fa34d, 0x52b35a, 0x359447, 0x66c060], k), name: 'palmFronds' });
      // coral heads in the shallows (visible through the turquoise water)
      const coral = scatter(420, 4, (x, y, z) => (y < WATER - 0.6 && y > WATER - 4.5) && { x, y, z, r: rnd() * 6.28, s: 0.6 + rnd() * 1.1, sy: 0.6 + rnd() * 0.8 }, 90000);
      const coralGeo = geo('coral', () => merged([
        new THREE.IcosahedronGeometry(0.8, 1).translate(0, 0.4, 0), new THREE.CylinderGeometry(0.12, 0.2, 1.4, 5).rotateZ(0.4).translate(0.4, 0.9, 0),
        new THREE.CylinderGeometry(0.12, 0.2, 1.2, 5).rotateZ(-0.5).translate(-0.4, 0.8, 0.2), new THREE.CylinderGeometry(0.1, 0.18, 1.0, 5).rotateX(0.5).translate(0, 0.8, -0.4),
      ].map(stripUV)));
      instanced(coralGeo, smoothMat, coral, { cast: false, colors: (it, k) => pick([0xff8a8a, 0xffb36b, 0xe86aa6, 0xb48cff, 0xffd27a, 0xff6f91], k), name: 'coral' });
      const flowers = scatter(900, 1.2, (x, y, z) => aboveWater(y, 2.6) && meadowAt(x, z) > 0.52 && { x, y: y - 0.05, z, r: rnd() * 6.28, s: 1 + rnd() * 0.6 });
      instanced(flowerGeo(), smoothMat, flowers, { cast: false, colors: (it, k) => pick([0xff5f7f, 0xffd84a, 0xffffff, 0xff8ad8, 0xff9a3c], k), name: 'hibiscus' });
      const tufts = scatter(1800, 1.2, (x, y, z, s) => aboveWater(y, 2.6) && (s.d < 60 || rnd() < 0.3) && { x, y: y - 0.05, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.7 });
      instanced(tuftGeo(), smoothMat, tufts, { cast: false, colors: (it, k) => pick([0x5fae3e, 0x78c24a, 0x4f9a33], k), name: 'tufts' });
      const rocks = scatter(120, 3, (x, y, z) => y > WATER - 2 && { x, y: y - 0.4, z, r: rnd() * 6.28, s: 0.8 + rnd() * rnd() * 3, sy: 0.6 });
      instanced(rockGeo(), smoothMat, rocks, { colors: (it, k) => pick([0xc8bca4, 0xb3a890, 0xd8ccb4], k), name: 'rocks' });
      // beach huts on stilts near the water
      const huts = scatter(14, 8, (x, y, z) => { const h = natural(x, z); return (h > WATER + 0.8 && h < WATER + 4) ? { x, y: y, z, r: rnd() * 6.28, s: 1 + rnd() * 0.25 } : null; }, 90000);
      const hutGeo = geo('hut', () => merged([
        ...[[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].map(([a, b]) => paint(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 5).translate(a, 1.2, b), 0x8a6a48)),
        paint(new THREE.BoxGeometry(3.8, 0.25, 3.8).translate(0, 2.4, 0), 0xc9a172),
        paint(new THREE.BoxGeometry(3.2, 2.2, 3.2).translate(0, 3.6, 0), 0xfff4e0),
        paint(new THREE.BoxGeometry(1.0, 1.4, 0.1).translate(0, 3.3, 1.62), 0x3fc4c8),
        paint(new THREE.ConeGeometry(3.3, 2.0, 4).rotateY(Math.PI / 4).translate(0, 5.7, 0), 0xe0b070),
      ]));
      instanced(hutGeo, vcMat, huts, { name: 'huts' });
      lighthouseAndBoats([0xffffff, 0x3fc4c8], 0xff8a6a);
    },
    jungle() {
      const big = scatter(260, 15, (x, y, z) => aboveWater(y) && forestAt(x, z) > 0.38 && { x, y: y - 0.5, z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.6 });
      const kapokTrunk = geo('kapokTrunk', () => merged([
        new THREE.CylinderGeometry(0.7, 1.3, 16, 7).translate(0, 8, 0),
        new THREE.CylinderGeometry(0.15, 0.3, 6, 4).rotateZ(1.0).translate(2.4, 12, 0),
        new THREE.CylinderGeometry(0.15, 0.3, 6, 4).rotateZ(-1.0).translate(-2.4, 13, 0.4),
      ].map(stripUV)));
      const kapokTop = geo('kapokTop', () => merged([
        new THREE.SphereGeometry(5.5, 12, 6).scale(1.3, 0.42, 1.3).translate(0, 16.5, 0),
        new THREE.SphereGeometry(3.8, 12, 6).scale(1.2, 0.45, 1.2).translate(3.6, 14.6, 1.0),
        new THREE.SphereGeometry(3.6, 12, 6).scale(1.2, 0.45, 1.2).translate(-3.8, 15.4, -1.2),
        new THREE.SphereGeometry(3.0, 12, 6).scale(1.2, 0.5, 1.2).translate(0.5, 18.4, 0.4),
      ].map(stripUV)));
      const lush = scatter(700, 9, (x, y, z) => aboveWater(y) && (forestAt(x, z) > 0.3 || rnd() < 0.25) && { x, y: y - 0.4, z, r: rnd() * 6.28, s: 1.3 + rnd() * 1.0 });
      instanced(trunkGeo(), keep(new THREE.MeshLambertMaterial({ color: 0x6a5642 })), lush, { name: 'lushTrunks' });
      instanced(canopyGeo(), smoothMat, lush, { colors: (it, k) => pick([0x2f7a46, 0x3f8a4a, 0x256a3c, 0x4f9a50, 0x5aa85a], k), name: 'lushCanopies' });
      instanced(kapokTrunk, keep(new THREE.MeshLambertMaterial({ color: 0x7a6650 })), big, { name: 'kapokTrunks' });
      instanced(kapokTop, smoothMat, big, { colors: (it, k) => pick([0x3f8a4a, 0x2f7a46, 0x4f9a50, 0x5fae5a, 0x3a7a3c], k), name: 'kapokCanopies' });
      // giant ferns
      const fernGeo = geo('fern', () => {
        const fp = [];
        for (let k = 0; k < 7; k++) {
          const f = stripUV(new THREE.PlaneGeometry(3.6, 0.9, 6, 1));
          const p = f.attributes.position;
          for (let v = 0; v < p.count; v++) {
            const xx = p.getX(v) + 1.8;
            p.setXYZ(v, xx, -0.12 * xx * xx + 0.5 * xx, p.getY(v) * (1 - xx / 4.2));
          }
          f.rotateY((k / 7) * Math.PI * 2 + k * 0.3);
          fp.push(f);
        }
        const g = merged(fp); g.computeVertexNormals(); return g;
      });
      const ferns = scatter(1100, 2, (x, y, z, s) => aboveWater(y, 0.8) && (s.d < 90 || forestAt(x, z) > 0.45) && { x, y: y + 0.05, z, r: rnd() * 6.28, s: 0.8 + rnd() * 1.1 });
      alongTrack(9, (r) => 1.5 + r() * 5, (p) => ferns.push({ x: p.x, y: p.y + 0.05, z: p.z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.9 }), { rnd, minClear: 1 });
      instanced(fernGeo, leafDS, ferns, { cast: 'high', colors: (it, k) => pick([0x4f9a3e, 0x62ac4a, 0x3f8a3a, 0x7abc58], k), name: 'ferns' });
      const palms = scatter(160, 10, (x, y, z) => aboveWater(y) && { x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.1 + rnd() * 0.5, tilt: (rnd() - 0.5) * 0.25 });
      const [pt, pf] = palmGeos();
      instanced(pt, keep(new THREE.MeshLambertMaterial({ color: 0x8a6a48, flatShading: true })), palms, { name: 'palmTrunks' });
      instanced(pf, leafDS, palms, { colors: (it, k) => pick([0x2f8a40, 0x3fa04a, 0x4fae52], k), name: 'palmFronds' });
      const bushes = scatter(320, 2, (x, y, z) => aboveWater(y, 0.5) && { x, y: y - 0.2, z, r: rnd() * 6.28, s: 0.9 + rnd() * 1.0 });
      instanced(bushGeo(), smoothMat, bushes, { colors: (it, k) => pick([0x3f8a4a, 0x4f9a50, 0x2f7a46], k), name: 'bushes' });
      const blooms = scatter(900, 1.2, (x, y, z) => aboveWater(y, 1) && meadowAt(x, z) > 0.55 && { x, y: y + 0.2, z, r: rnd() * 6.28, s: 1.1 + rnd() * 0.7 });
      instanced(flowerGeo(), smoothMat, blooms, { cast: false, colors: (it, k) => pick([0xff5a4a, 0xffc83a, 0xff8ad8, 0xffffff], k), name: 'blooms' });
      const rocks = scatter(140, 3, (x, y, z) => { return { x, y: y - 0.4, z, r: rnd() * 6.28, s: 0.8 + rnd() * rnd() * 3.5, sy: 0.7 }; });
      instanced(rockGeo(), smoothMat, rocks, { colors: (it, k) => pick([0x6f8a5a, 0x7a8a6a, 0x5f7a52], k), name: 'mossRocks' });
      waterfalls();
      lanternsAlong(34, [0xffe28a, 0xfff0b0]);
      shortcutDressing([0xff5a4a, 0xffc83a, 0xffffff, 0xff8ad8], [0x3f8a4a, 0x2f7a46]);
    },
    desert() {
      const oasis = (x, z) => Math.hypot(x - L.lake.x, z - L.lake.z) < L.lake.r + 130;
      const palms = scatter(260, 5, (x, y, z) => {
        if (!aboveWater(y)) return null;
        if (!oasis(x, z) && (forestAt(x, z) < 0.6 || rnd() < 0.7)) return null;
        return { x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.5, tilt: (rnd() - 0.5) * 0.25, tilt2: (rnd() - 0.5) * 0.25 };
      });
      alongTrack(30, (r) => 6 + r() * 6, (p) => { if (rnd() < 0.5) palms.push({ x: p.x, y: p.y - 0.3, z: p.z, r: rnd() * 6.28, s: 0.95 + rnd() * 0.3, tilt: (rnd() - 0.5) * 0.2 }); }, { rnd, minClear: 4 });
      const [pt, pf] = palmGeos();
      instanced(pt, keep(new THREE.MeshLambertMaterial({ color: 0xa8784a, flatShading: true })), palms, { name: 'palmTrunks' });
      instanced(pf, leafDS, palms, { colors: (it, k) => pick([0x4f9a4a, 0x5fa852, 0x6aae58], k), name: 'palmFronds' });
      // dates
      // sandstone arches
      const arches = scatter(9, 30, (x, y, z) => aboveWater(y, 1) && { x, y: y - 1.5, z, r: rnd() * 6.28, s: 1 + rnd() * 0.8 }, 90000);
      const archGeo = geo('arch', () => {
        const g = new THREE.TorusGeometry(9, 2.6, 8, 18, Math.PI).scale(1, 1.15, 0.8);
        const p = g.attributes.position;
        for (let v = 0; v < p.count; v++) { const n = fbm(p.getX(v) * 0.3, p.getY(v) * 0.3, 2) - 0.5; p.setXYZ(v, p.getX(v) * (1 + n * 0.12), p.getY(v) + n, p.getZ(v) * (1 + n * 0.3)); }
        stripUV(g); g.computeVertexNormals();
        return merged([g, stripUV(new THREE.CylinderGeometry(3.4, 4.2, 3, 7).translate(-9, 0.5, 0)), stripUV(new THREE.CylinderGeometry(3.4, 4.2, 3, 7).translate(9, 0.5, 0))]);
      });
      instanced(archGeo, flatMat, arches, { colors: (it, k) => pick([0xd0784a, 0xc8683e, 0xd98a5a], k), name: 'arches' });
      const rocks = scatter(160, 3, (x, y, z) => ({ x, y: y - 0.4, z, r: rnd() * 6.28, s: 0.8 + rnd() * rnd() * 4, sx: 1.2, sy: 0.6 + rnd() * 0.5 }));
      instanced(rockGeo(), flatMat, rocks, { colors: (it, k) => pick([0xd08a5a, 0xc0784a, 0xe0a06a], k), name: 'rocks' });
      const scrub = scatter(360, 2, (x, y, z) => aboveWater(y, 1) && { x, y: y - 0.2, z, r: rnd() * 6.28, s: 0.5 + rnd() * 0.6, sy: 0.7 });
      instanced(bushGeo(), flatMat, scrub, { colors: (it, k) => pick([0x9a9a52, 0xa8a060, 0x8a8a48], k), name: 'scrub' });
      const tufts = scatter(1400, 1.2, (x, y, z, s) => aboveWater(y, 1) && (s.d < 60 || rnd() < 0.2) && { x, y: y - 0.05, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.8 });
      instanced(tuftGeo(), smoothMat, tufts, { cast: false, colors: (it, k) => pick([0xc9b060, 0xb8a050, 0xd8c070], k), name: 'alfa' });
      lanternsAlong(40, [0xffd27a, 0xffb86a]);
    },
    medina() {
      const fac = makeFacadeTextures('medina');
      keep(fac.map); keep(fac.emissiveMap);
      const houseMat = keep(facadeMaterial(fac.map, null));
      const houses = [];
      // rows of houses lining the lanes, then the hillside village
      alongTrack(9, (r) => 4 + r() * 3, (p) => {
        if (rnd() < 0.1) return;
        const w = 6 + rnd() * 5, d = 6 + rnd() * 4, h = 4 + rnd() * 5;
        houses.push({ x: p.x, y: p.y - 0.5, z: p.z, r: p.face + (rnd() < 0.5 ? 0 : Math.PI / 2), s: 1, sx: w, sy: h, sz: d });
      }, { rnd, minClear: 3 });
      alongTrack(13, (r) => 17 + r() * 8, (p) => {
        if (rnd() < 0.25) return;
        const w = 6 + rnd() * 5, d = 6 + rnd() * 4, h = 5 + rnd() * 6;
        houses.push({ x: p.x, y: p.y - 0.5, z: p.z, r: p.face, s: 1, sx: w, sy: h, sz: d });
      }, { rnd, minClear: 12 });
      houses.push(...scatter(260, 9, (x, y, z) => {
        if (!aboveWater(y, 1.5)) return null;
        if (fbm(x * 0.012 + 5, z * 0.012, 2) < 0.42 && rnd() < 0.8) return null;
        const w = 6 + rnd() * 6, d = 6 + rnd() * 5, h = 4 + rnd() * 6;
        return { x, y: y - 0.6, z, r: rnd() * 6.28, s: 1, sx: w, sy: h, sz: d };
      }));
      const boxGeo = geo('unitBox', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
      instanced(boxGeo, houseMat, houses, { colors: (it, k) => pick([0xffffff, 0xfbf8f2, 0xf6f2ea, 0xfff9f0], k), name: 'houses' });
      // domes + roof parapets on some houses, bougainvillea on corners, blue doors
      const domes = [], bloom = [], doors = [];
      houses.forEach((hh, k) => {
        if (k % 3 === 0) domes.push({ x: hh.x, y: hh.y + hh.sy, z: hh.z, r: 0, s: Math.min(hh.sx, hh.sz) * 0.32, blue: k % 2 });
        if (k % 2 === 0) {
          const c = Math.cos(hh.r), s = Math.sin(hh.r);
          const lx = hh.sx / 2, lz = hh.sz / 2;
          bloom.push({ x: hh.x + c * lx + s * lz, y: hh.y + hh.sy * (0.45 + rnd() * 0.4), z: hh.z - s * lx + c * lz, r: rnd() * 6.28, s: 1.2 + rnd() * 0.9 });
        }
        const c = Math.cos(hh.r), s = Math.sin(hh.r);
        doors.push({ x: hh.x + s * (hh.sz / 2 + 0.06), y: hh.y + 0.5, z: hh.z + c * (hh.sz / 2 + 0.06), r: hh.r, s: 1 });
      });
      const domeGeo = geo('dome', () => stripUV(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)));
      instanced(domeGeo, smoothMat, domes, { colors: (it) => C.setHex(it.blue ? 0x2a6fb0 : 0xffffff), name: 'domes' });
      const bloomGeo = geo('bougainvillea', () => merged([0, 1, 2, 3].map((k) => stripUV(new THREE.IcosahedronGeometry(0.9 - k * 0.12, 1).translate(Math.cos(k * 2) * 0.7, k * 0.35, Math.sin(k * 2) * 0.7)))));
      instanced(bloomGeo, smoothMat, bloom, { cast: false, colors: (it, k) => pick([0xd6408a, 0xe85aa0, 0xc8307a, 0xf27ab8], k), name: 'bougainvillea' });
      const doorGeo = geo('door', () => merged([paint(new THREE.BoxGeometry(1.5, 2.6, 0.12).translate(0, 1.3, 0), 0x2a6fb0), paint(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 2.6, 0), 0x2a6fb0)]));
      instanced(doorGeo, vcMat, doors, { cast: false, name: 'doors' });
      // cypress + palms + olive bushes
      const cypress = scatter(220, 4, (x, y, z) => aboveWater(y, 1.5) && { x, y: y - 0.3, z, r: 0, s: 1 + rnd() * 0.6 });
      const cypGeo = geo('cypress', () => stripUV(new THREE.SphereGeometry(1, 10, 8).scale(1.1, 4.2, 1.1).translate(0, 4.2, 0)));
      instanced(cypGeo, smoothMat, cypress, { colors: (it, k) => pick([0x2f6a4a, 0x3a7a52, 0x285a40], k), name: 'cypress' });
      const palms = scatter(80, 5, (x, y, z) => aboveWater(y, 1) && { x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.0 + rnd() * 0.4, tilt: (rnd() - 0.5) * 0.25 });
      const [pt, pf] = palmGeos();
      instanced(pt, keep(new THREE.MeshLambertMaterial({ color: 0xa8845a, flatShading: true })), palms, { name: 'palmTrunks' });
      instanced(pf, leafDS, palms, { colors: (it, k) => pick([0x4f9a4a, 0x5fa852], k), name: 'palmFronds' });
      const bushes = scatter(300, 2, (x, y, z) => aboveWater(y, 1) && { x, y: y - 0.2, z, r: rnd() * 6.28, s: 0.6 + rnd() * 0.7 });
      instanced(bushGeo(), smoothMat, bushes, { colors: (it, k) => pick([0x8aa060, 0x9ab070, 0x7a9050], k), name: 'olives' });
      lanternsAlong(28, [0xffd27a, 0xffe6a8]);
      lighthouseAndBoats([0xffffff, 0x2a6fb0], 0x2a6fb0);
      shortcutDressing([0xd6408a, 0xffffff, 0xf3d096, 0xe85aa0], [0x2f6a4a, 0x3a7a52]);
    },
    city() {
      const fac = makeFacadeTextures('city');
      keep(fac.map); keep(fac.emissiveMap);
      const bMat = keep(facadeMaterial(fac.map, fac.emissiveMap));
      const blds = [];
      alongTrack(16, (r) => 5 + r() * 4, (p) => {
        if (rnd() < 0.1) return;
        const w = 12 + rnd() * 10, d = 12 + rnd() * 8, h = 10 + rnd() * rnd() * 34;
        blds.push({ x: p.x, y: Math.min(p.y, heightAt(p.x, p.z)) - 1, z: p.z, r: p.face, s: 1, sx: w, sy: h + p.y, sz: d });
      }, { rnd, minClear: 4 });
      alongTrack(22, (r) => 30 + r() * 12, (p) => {
        const w = 14 + rnd() * 12, d = 14 + rnd() * 10, h = 18 + rnd() * rnd() * 50;
        blds.push({ x: p.x, y: heightAt(p.x, p.z) - 1, z: p.z, r: p.face, s: 1, sx: w, sy: h, sz: d });
      }, { rnd, minClear: 16 });
      blds.push(...scatter(160, 20, (x, y, z) => {
        if (!aboveWater(y, 1)) return null;
        const w = 14 + rnd() * 14, d = 14 + rnd() * 12, h = 14 + rnd() * rnd() * 60;
        return { x, y: y - 1, z, r: Math.round(rnd() * 4) * Math.PI / 2, s: 1, sx: w, sy: h, sz: d };
      }));
      const boxGeo = geo('unitBox', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
      instanced(boxGeo, bMat, blds, { colors: (it, k) => pick([0xfff0dc, 0xf6c8b0, 0xc8dcc8, 0xb8d4dc, 0xf2b8b8, 0xe8dcc0, 0xd8c8e8], k), name: 'buildings' });
      // rooftop water towers + roof rims
      const towers = blds.filter((b, k) => k % 3 === 0).map((b) => ({ x: b.x + (rnd() - 0.5) * b.sx * 0.4, y: b.y + b.sy, z: b.z + (rnd() - 0.5) * b.sz * 0.4, r: rnd() * 6.28, s: 1 + rnd() * 0.3 }));
      const towerGeo = geo('waterTower', () => merged([
        ...[[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].map(([a, b]) => paint(new THREE.CylinderGeometry(0.12, 0.12, 3, 4).translate(a, 1.5, b), 0x5a4a44)),
        paint(new THREE.CylinderGeometry(1.8, 1.8, 3.4, 12).translate(0, 4.7, 0), 0x9a6a50),
        paint(new THREE.ConeGeometry(2.0, 1.6, 12).translate(0, 7.2, 0), 0x6a5048),
      ]));
      instanced(towerGeo, vcMat, towers, { name: 'waterTowers' });
      // street lights + neon signs
      const lamps = [];
      alongTrack(30, 1.6, (p) => lamps.push({ x: p.x, y: p.y, z: p.z, r: p.face + Math.PI, s: 1.25 }), { rnd, bridges: false });
      const [postG, glowG] = lanternGeos();
      instanced(postG, keep(new THREE.MeshLambertMaterial({ color: 0x8a9aaa, vertexColors: true })), lamps, { name: 'streetlightPosts' });
      instanced(glowG, glowMat, lamps, { cast: false, colors: (it, k) => pick([0xffe2b0, 0xfff0d0], k).multiplyScalar(1.2), name: 'streetlights' });
      const signs = blds.slice(0, Math.round(blds.length * 0.35)).filter((b, k) => k % 2 === 0).map((b) => {
        const c = Math.cos(b.r), s = Math.sin(b.r);
        return { x: b.x + s * (b.sz / 2 + 0.2), y: b.y + Math.min(b.sy - 3, 6 + rnd() * 8), z: b.z + c * (b.sz / 2 + 0.2), r: b.r, s: 1, sx: 3 + rnd() * 4, sy: 1 + rnd() * 1.2 };
      });
      const signGeo = geo('sign', () => new THREE.BoxGeometry(1, 1, 0.2));
      instanced(signGeo, glowMat, signs, { cast: false, colors: (it, k) => pick([0xff9ec8, 0x7fe8f0, 0xffd27a, 0xc8a8ff], k).multiplyScalar(1.1), name: 'neon' });
      const trees = scatter(260, 3, (x, y, z) => aboveWater(y, 0.5) && fbm(x * 0.006 + 4, z * 0.006 - 2, 2) > 0.55 && { x, y: y - 0.3, z, r: rnd() * 6.28, s: 0.8 + rnd() * 0.5 });
      alongTrack(19, 3.4, (p) => { if (rnd() < 0.6) trees.push({ x: p.x, y: p.y - 0.3, z: p.z, r: rnd() * 6.28, s: 0.7 }); }, { rnd });
      instanced(trunkGeo(), keep(new THREE.MeshLambertMaterial({ color: 0x7a604a })), trees, { name: 'trunks' });
      instanced(canopyGeo(), smoothMat, trees, { colors: (it, k) => pick([0x6aae6a, 0x8cc06a, 0x5a9e5e, 0xf2b8c8], k), name: 'canopies' });
      shortcutDressing([0xffd27a, 0xff9ec8, 0xffffff], [0x6aae6a, 0x5a9e5e]);
      lighthouseAndBoats(null, 0xffb84a);
    },
    aurora() {
      const pines = scatter(760, 5, (x, y, z) => aboveWater(y) && (forestAt(x, z) > 0.42 || rnd() < 0.15) && { x, y: y - 0.3, z, r: rnd() * 6.28, s: 1.0 + rnd() * 1.0 });
      instanced(pineTrunk(), keep(new THREE.MeshLambertMaterial({ color: 0x5a4636 })), pines, { name: 'pineTrunks' });
      instanced(pineGeo(), flatMat, pines, { colors: (it, k) => pick([0x2a6048, 0x336e52, 0x24563e, 0x3c7a5a], k), name: 'pines' });
      const capGeo = geo('snowCap', () => merged([
        new THREE.ConeGeometry(1.9, 1.2, 8).translate(0, 4.75, 0), new THREE.ConeGeometry(1.5, 1.1, 8).translate(0, 6.35, 0), new THREE.ConeGeometry(0.95, 1.3, 8).translate(0, 7.75, 0),
      ].map(stripUV)));
      instanced(capGeo, flatMat, pines, { cast: false, colors: () => C.setHex(0xf8fbff), name: 'snowCaps' });
      const mounds = scatter(300, 2, (x, y, z) => ({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 0.9 + rnd() * 1.2, sy: 0.5 }));
      instanced(bushGeo(), smoothMat, mounds, { cast: false, colors: () => C.setHex(0xf4f8fd), name: 'snowMounds' });
      const rocks = scatter(150, 3, (x, y, z) => ({ x, y: y - 0.4, z, r: rnd() * 6.28, s: 0.8 + rnd() * rnd() * 3.5, sy: 0.7 }));
      instanced(rockGeo(), flatMat, rocks, { colors: (it, k) => pick([0x7d8aa4, 0x8e9ab3, 0x6c7894], k), name: 'rocks' });
      const crystals = scatter(90, 4, (x, y, z) => aboveWater(y) && { x, y: y - 0.2, z, r: rnd() * 6.28, s: 0.6 + rnd() * 1.0 });
      const crystalGeo = geo('crystal', () => merged([0, 1, 2].map((k) => stripUV(new THREE.OctahedronGeometry(1, 0).scale(0.5, 1.8, 0.5).rotateZ((k - 1) * 0.35).translate((k - 1) * 0.6, 1.3 - Math.abs(k - 1) * 0.4, 0)))));
      instanced(crystalGeo, glowMat, crystals, { cast: false, colors: (it, k) => pick([0x9fe8f4, 0xb8d0ff, 0xc5f5de], k).multiplyScalar(0.95), name: 'iceCrystals' });
      const igloos = scatter(10, 12, (x, y, z, s) => aboveWater(y) && s.d < 80 && { x, y: y - 0.3, z, r: rnd() * 6.28, s: 1 + rnd() * 0.3 }, 90000);
      const iglooGeo = geo('igloo', () => merged([
        paint(new THREE.SphereGeometry(3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xf4f8ff),
        paint(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0, 2.8), 0xe8f0fb),
      ]));
      instanced(iglooGeo, vcMat, igloos, { name: 'igloos' });
      const iglooGlow = igloos.map((g) => { const c = Math.cos(g.r), s = Math.sin(g.r); return { x: g.x + s * 3.9 * g.s, y: g.y + 0.6, z: g.z + c * 3.9 * g.s, r: g.r, s: g.s, sy: 0.8 }; });
      instanced(geo('iglooDoor', () => stripUV(new THREE.CircleGeometry(0.9, 12, 0, Math.PI))), glowMat, iglooGlow, { cast: false, colors: () => C.setHex(0xffc87a).multiplyScalar(1.2), name: 'iglooDoors' });
      lanternsAlong(24, [0xffc87a, 0xffd89a, 0xffb86a]);
    },
    night() {
      // crystal clusters glowing in lavender, mint and gold
      const crystals = scatter(420, 3, (x, y, z) => ({ x, y: y - 0.3, z, r: rnd() * 6.28, s: 0.7 + rnd() * rnd() * 2.6 }));
      const crystalGeo = geo('crystal', () => merged([0, 1, 2].map((k) => stripUV(new THREE.OctahedronGeometry(1, 0).scale(0.5, 1.8, 0.5).rotateZ((k - 1) * 0.35).translate((k - 1) * 0.6, 1.3 - Math.abs(k - 1) * 0.4, 0)))));
      instanced(crystalGeo, glowMat, crystals, { cast: false, colors: (it, k) => pick([0xb7a6ff, 0x9fe8d4, 0xf3d096, 0xdbb2f6], k).multiplyScalar(0.9), name: 'crystals' });
      // night trees: indigo trunks with glowing lavender leaf puffs
      const trees = scatter(340, 6, (x, y, z) => (forestAt(x, z) > 0.4 || rnd() < 0.2) && { x, y: y - 0.3, z, r: rnd() * 6.28, s: 1 + rnd() * 0.7 });
      instanced(trunkGeo(), keep(new THREE.MeshLambertMaterial({ color: 0x2b2160 })), trees, { name: 'nightTrunks' });
      const leafMat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a2f7a, emissiveIntensity: 1 }));
      instanced(canopyGeo(), leafMat, trees, { colors: (it, k) => pick([0x6a5ac8, 0x7f6fe0, 0x5a8fd0, 0x8f7ff0], k), name: 'nightCanopies' });
      const flowers = scatter(1600, 1.2, (x, y, z, s) => meadowAt(x, z) > 0.5 && (s.d < 80 || rnd() < 0.3) && { x, y: y - 0.05, z, r: rnd() * 6.28, s: 0.9 + rnd() * 0.6 });
      instanced(flowerGeo(), glowMat, flowers, { cast: false, colors: (it, k) => pick([0xf3d096, 0xc5f5de, 0xdbb2f6, 0xffffff], k).multiplyScalar(0.85), name: 'starFlowers' });
      const rocks = scatter(160, 3, (x, y, z) => ({ x, y: y - 0.4, z, r: rnd() * 6.28, s: 0.8 + rnd() * rnd() * 3.5, sy: 0.7 }));
      instanced(rockGeo(), flatMat, rocks, { colors: (it, k) => pick([0x3a3478, 0x463f8a, 0x2f2a62], k), name: 'rocks' });
      // crystal towers along the course
      const towerGeo = geo('crystalTower', () => merged([
        paint(new THREE.CylinderGeometry(3.0, 3.4, 15, 8).translate(0, 7.5, 0), 0x3f3888),
        paint(new THREE.CylinderGeometry(3.7, 3.7, 1.2, 8).translate(0, 15.6, 0), 0x5b4fb0),
        paint(new THREE.ConeGeometry(4.0, 8, 8).translate(0, 20.2, 0), 0x8f7ff0),
      ]));
      const towers = [];
      const rnd2 = mulberry(4242);
      alongTrack(85, (r) => 9 + r() * 6, (p) => { if (rnd2() < 0.55) towers.push({ x: p.x, y: p.y - 0.5, z: p.z, r: p.face, s: 0.8 + rnd2() * 0.4 }); }, { rnd: rnd2, minClear: 6 });
      instanced(towerGeo, vcMat, towers, { name: 'crystalTowers' });
      const winGeo = geo('towerWindows', () => merged([0, 1, 2, 3].map((k) => stripUV(new THREE.BoxGeometry(0.9, 1.8, 0.3).translate(0, 6 + (k % 2) * 4, 3.1).rotateY(k * Math.PI / 2)))));
      instanced(winGeo, glowMat, towers, { cast: false, colors: () => C.setHex(0xffe6a8).multiplyScalar(1.1), name: 'towerWindows' });
      const tipGeo = geo('towerStar', () => stripUV(new THREE.OctahedronGeometry(1.1, 0).scale(1, 1.4, 0.4).translate(0, 25.6, 0)));
      instanced(tipGeo, glowMat, towers, { cast: false, colors: () => C.setHex(0xf3d096).multiplyScalar(1.2), name: 'towerStars' });
      lanternsAlong(26, [0xf3d096, 0xc5f5de, 0xdbb2f6]);
      crystalCastle();
    },
  };

  // custom UV patch for instanced unit boxes: windows tile per 4 m × 3.4 m whatever the instance scale
  function facadeMaterial(map, emissiveMap) {
    const m = new THREE.MeshLambertMaterial({ map, emissiveMap: emissiveMap || null, emissive: emissiveMap ? 0xffcf8a : 0x000000, emissiveIntensity: emissiveMap ? 1.0 : 0 });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 fsc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #else
          vec3 fsc = vec3(1.0);
        #endif
        vec2 fuv = vec2(abs(normal.x) > 0.5 ? position.z * fsc.z : position.x * fsc.x, position.y * fsc.y);
        fuv = vec2(fuv.x / 4.0 + 0.5, fuv.y / 3.4);
        if (abs(normal.y) > 0.5) fuv = vec2(0.03, 0.97);
        #ifdef USE_MAP
          vMapUv = fuv;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = fuv;
        #endif
      `);
    };
    m.customProgramCacheKey = () => 'lumenFacade';
    return m;
  }

  function lighthouseAndBoats(lhCols, sailAccent) {
    if (VOID) return;
    const dir = new THREE.Vector2(L.lake.x - cx, L.lake.z - cz);
    if (dir.lengthSq() < 1 || L.lake.x > 1e5) dir.set(1, 0.3);
    dir.normalize();
    if (lhCols) {
      let lx = cx, lz = cz;
      for (let r = ISLAND_R * 0.6; r < ISLAND_R * 1.1; r += 4) {
        const x = cx + dir.x * r, z = cz + dir.y * r;
        if (natural(x, z) < WATER + 1.5) break;
        lx = x; lz = z;
      }
      const gy = natural(lx, lz);
      const parts = [];
      parts.push(paint(new THREE.CylinderGeometry(6, 8, 10, 9).translate(0, gy - 4, 0), 0xd8cfb8));
      for (let k = 0; k < 6; k++) parts.push(paint(new THREE.CylinderGeometry(2.6 - k * 0.18, 2.8 - k * 0.18, 3.2, 14).translate(0, gy + 2.6 + k * 3.2, 0), k % 2 ? lhCols[0] : lhCols[1]));
      const topY = gy + 1 + 6 * 3.2;
      parts.push(paint(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 14).translate(0, topY + 0.2, 0), 0x333844));
      parts.push(paint(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 10).translate(0, topY + 1.6, 0), 0xfff3b0));
      parts.push(paint(new THREE.ConeGeometry(2, 1.8, 10).translate(0, topY + 3.7, 0), lhCols[1]));
      const g = keep(merged(parts));
      g.translate(lx, 0, lz);
      const lh = new THREE.Mesh(g, vcMat);
      lh.castShadow = true; lh.name = 'lighthouse';
      root.add(lh);
    }
    const hull = paint(new THREE.BoxGeometry(2.4, 1.2, 7, 1, 1, 2), 0xffffff);
    const hp = hull.attributes.position;
    for (let v = 0; v < hp.count; v++) if (hp.getZ(v) > 3 && hp.getY(v) > -0.1) hp.setX(v, hp.getX(v) * 0.2);
    const bg = keep(merged([hull,
      paint(new THREE.CylinderGeometry(0.1, 0.1, 8, 5).translate(0, 4.5, 0), 0x6d4c33),
      paint(new THREE.ConeGeometry(2.4, 7, 3).scale(0.08, 1, 1).translate(0, 4.8, -1.2), 0xfff7ec),
      paint(new THREE.BoxGeometry(2.45, 0.3, 6.6).translate(0, 0.3, 0), sailAccent)]));
    bg.computeVertexNormals();
    const brnd = mulberry(77);
    for (let k = 0; k < 6; k++) {
      const a = brnd() * Math.PI * 2, r = ISLAND_R * (1.12 + brnd() * 0.3);
      const b = new THREE.Mesh(bg, vcMat);
      b.position.set(cx + Math.cos(a) * r, WATER, cz + Math.sin(a) * r);
      b.userData = { a, r, speed: (0.004 + brnd() * 0.004) * (brnd() < 0.5 ? 1 : -1), ph: brnd() * 6 };
      b.scale.setScalar(1.6);
      b.name = 'boat';
      root.add(b); boats.push(b);
    }
  }

  function waterfalls() {
    if (L.lake.x > 1e5) return;
    // a cliff with a cascade on the far side of the river, plus a second one by the hills
    const away = new THREE.Vector2(L.lake.x - cx, L.lake.z - cz).normalize();
    const spots = [[L.lake.x + away.x * (L.lake.r * 0.95), L.lake.z + away.y * (L.lake.r * 0.95)]];
    const fallMat = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        void main(){
          float x = floor(vUv.x * 28.0);
          float streak = fract(vUv.y * 3.0 + uTime * (1.4 + h(vec2(x, 1.0)) * 0.8) + h(vec2(x, 2.0)));
          vec3 col = mix(vec3(0.55, 0.85, 0.88), vec3(1.0), smoothstep(0.55, 1.0, streak));
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          gl_FragColor = vec4(col, 0.85 * edge);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    for (const [x, z] of spots) {
      const gy = WATER;
      const face = Math.atan2(cx - x, cz - z);
      const rocks = [];
      const rr = mulberry(55);
      for (let k = 0; k < 14; k++) {
        const s = 7 + rr() * 7, ox = (rr() - 0.5) * 44, oy = 4 + rr() * 26, oz = -6 - rr() * 12;
        if (Math.abs(ox) < 8 && oy > 6) continue;      // keep the cascade's notch open
        rocks.push(paint(new THREE.DodecahedronGeometry(s, 1).scale(1.2, 1, 1).translate(ox, oy + gy - 4, oz), [0x7a8a6a, 0x6a7a5c, 0x86967a][k % 3]));
        rocks.push(paint(new THREE.SphereGeometry(s * 0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.6).translate(ox, oy + gy - 4 + s * 0.35, oz), [0x4f9a42, 0x5fae4a][k % 2]));
      }
      rocks.push(paint(new THREE.BoxGeometry(18, 30, 10).translate(0, 15 + gy - 2, -11), 0x6a7a5c));
      const cg = keep(merged(rocks));
      cg.rotateY(face); cg.translate(x, 0, z);
      const cm = new THREE.Mesh(cg, vcMat); cm.castShadow = true; cm.name = 'cliff';
      root.add(cm);
      const fg = keep(new THREE.PlaneGeometry(14, 33, 1, 1).translate(0, 16 + gy - 1, 0.4));
      fg.rotateY(face); fg.translate(x, 0, z);
      const fm = new THREE.Mesh(fg, fallMat); fm.name = 'waterfall'; fm.renderOrder = 2;
      root.add(fm);
    }
  }

  function crystalCastle() {
    // a floating crystal castle over the void, visible from most of the course
    const dir = new THREE.Vector2(L.lake.x - cx, L.lake.z - cz);
    if (dir.lengthSq() < 1) dir.set(0, 1);
    dir.normalize();
    const base = new THREE.Vector3(cx - dir.x * ISLAND_R * 1.15, 60, cz - dir.y * ISLAND_R * 1.15);
    const parts = [];
    parts.push(paint(new THREE.ConeGeometry(70, 120, 9, 2).rotateX(Math.PI).translate(0, -60, 0), 0x2c2660));
    parts.push(paint(new THREE.CylinderGeometry(72, 70, 8, 9).translate(0, 2, 0), 0x4a4290));
    const towers = [[0, 0, 16, 70], [-30, -12, 9, 46], [30, -10, 9, 50], [-18, 26, 8, 40], [22, 24, 8, 44], [-46, 14, 6, 30], [48, 10, 6, 32]];
    for (const [tx, tz, r, h] of towers) {
      parts.push(paint(new THREE.CylinderGeometry(r * 0.9, r, h, 10).translate(tx, h / 2 + 6, tz), 0x5b4fb0));
      parts.push(paint(new THREE.CylinderGeometry(r * 1.1, r * 1.1, 2.5, 10).translate(tx, h + 6, tz), 0x8f7ff0));
      parts.push(paint(new THREE.ConeGeometry(r * 1.15, h * 0.55, 10).translate(tx, h + 7 + h * 0.275, tz), 0xb7a6ff));
    }
    parts.push(paint(new THREE.BoxGeometry(60, 20, 30).translate(0, 16, 0), 0x463f8a));
    const g = keep(merged(parts));
    g.translate(base.x, base.y, base.z);
    const castle = new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: 0x1c1650 })));
    castle.name = 'crystalCastle';
    root.add(castle);
    const wins = [];
    for (const [tx, tz, r, h] of towers) for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.4;
      for (let f = 0; f < 3; f++) wins.push(new THREE.BoxGeometry(r * 0.25, r * 0.4, 0.5).rotateY(-a).translate(tx + Math.cos(a) * r * 0.92, 14 + f * h * 0.25, tz + Math.sin(a) * r * 0.92));
    }
    const wg = keep(merged(wins.map(stripUV)));
    wg.translate(base.x, base.y, base.z);
    const wm = new THREE.Mesh(wg, keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe6a8).multiplyScalar(1.2), toneMapped: false, fog: false })));
    wm.name = 'castleWindows';
    root.add(wm);
    animated.push({ update: (t) => { const y = Math.sin(t * 0.3) * 3; castle.position.y = y; wm.position.y = y; } });
  }

  try { (builders[world] || builders.meadow)(); } catch (e) { console.warn('[environment] scenery skipped:', e); /* scenery is optional — never break a race */ }

  // ------------------------------------------------------------------ weather (GPU-wrapped particle box around the player)
  const weatherFocus = new THREE.Vector3().copy(L.startPositions[0]?.position || new THREE.Vector3());
  let weatherMat = null;
  const WEATHER = {
    snow: { n: 2200, vel: [1.2, -5.0, 0.6], color: 0xffffff, size: 0.55, add: false, sway: 1.4, blink: 0 },
    dust: { n: 500, vel: [7.0, 0.2, 2.0], color: 0xffe0b8, size: 0.35, add: false, sway: 0.6, blink: 0 },
    pollen: { n: 600, vel: [0.8, 0.35, 0.4], color: 0xfff0b0, size: 0.32, add: true, sway: 1.6, blink: 0.4 },
    fireflies: { n: 700, vel: [0.3, 0.2, -0.2], color: 0xd8ff8a, size: 0.42, add: true, sway: 2.2, blink: 1 },
    petals: { n: 500, vel: [1.4, -1.2, 0.8], color: 0xf27ab8, size: 0.4, add: false, sway: 1.8, blink: 0 },
    motes: { n: 900, vel: [0.2, 1.6, -0.2], color: 0xcabaff, size: 0.42, add: true, sway: 1.2, blink: 0.6 },
  };
  if (TH.weather && WEATHER[TH.weather]) {
    const cfg = WEATHER[TH.weather];
    const COUNT = Math.round(cfg.n * dens);
    const BOX = new THREE.Vector3(170, 70, 170);
    const wr = mulberry(909);
    const pos = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT);
    for (let k = 0; k < COUNT; k++) {
      pos[k * 3] = wr() * BOX.x; pos[k * 3 + 1] = wr() * BOX.y; pos[k * 3 + 2] = wr() * BOX.z; seed[k] = wr();
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    weatherMat = keep(new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uFocus: { value: weatherFocus }, uBox: { value: BOX },
        uVel: { value: new THREE.Vector3(...cfg.vel) }, uColor: { value: new THREE.Color(cfg.color) },
        uSize: { value: cfg.size }, uSway: { value: cfg.sway }, uBlink: { value: cfg.blink },
      },
      vertexShader: /* glsl */`
        uniform float uTime; uniform vec3 uFocus; uniform vec3 uBox; uniform vec3 uVel; uniform float uSize; uniform float uSway; uniform float uBlink;
        attribute float seed; varying float vA;
        void main() {
          vec3 p = position + uVel * uTime * (0.7 + seed * 0.6);
          p.x += sin(uTime * (0.8 + seed) + seed * 40.0) * uSway;
          p.z += cos(uTime * (0.6 + seed) + seed * 23.0) * uSway;
          vec3 org = uFocus - uBox * 0.5;
          p = org + mod(p - org, uBox);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (300.0 / max(1.0, -mv.z));
          float blink = mix(1.0, 0.5 + 0.5 * sin(uTime * (2.0 + seed * 3.0) + seed * 50.0), uBlink);
          vA = (0.55 + 0.45 * fract(seed * 7.3)) * smoothstep(90.0, 20.0, -mv.z) * blink;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.1, length(d)) * vA;
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true, depthWrite: false, blending: cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    const pts = new THREE.Points(g, weatherMat);
    pts.frustumCulled = false; pts.renderOrder = 5; pts.name = 'weather';
    root.add(pts);
  }

  // ------------------------------------------------------------------ API
  return {
    sunLight: sun,
    hemiLight: hemi,
    heightAt,
    world,
    setShadowFocus(v) { setShadowFocus(v); if (v && isFinite(v.x)) weatherFocus.copy(v); },
    update(dt, time) {
      uniforms.uTime.value = time;
      if (weatherMat) weatherMat.uniforms.uTime.value = time;
      if (waterMat) waterMat.uniforms.uTime.value = time;
      cloudGroup.rotation.y = time * 0.004;
      for (let k = 0; k < animated.length; k++) animated[k].update(time);
      for (const b of boats) {
        const u = b.userData;
        const a = u.a + time * u.speed;
        b.position.x = cx + Math.cos(a) * u.r;
        b.position.z = cz + Math.sin(a) * u.r;
        b.position.y = WATER - 0.2 + Math.sin(time * 1.3 + u.ph) * 0.25;
        b.rotation.y = -a + (u.speed > 0 ? 0 : Math.PI);
        b.rotation.z = Math.sin(time * 1.1 + u.ph) * 0.06;
      }
    },
    dispose() {
      scene.remove(hemi, sun, sun.target);
      if (sun.shadow && sun.shadow.map) sun.shadow.map.dispose();
      root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      disposables.forEach((d) => d && d.dispose && d.dispose());
      if (envRT) envRT.dispose();
      if (scene.environment === (envRT && envRT.texture)) scene.environment = prevEnv || null;
      scene.fog = prevFog || null;
      scene.background = prevBg || null;
    },
  };
}
