// Visual effects: pooled particles (Points + InstancedMesh), fireballs, rings, hit stars, speed lines.
// See ARCHITECTURE.md §3. No per-frame allocations in update().
import * as THREE from 'three';
import { bus } from './events.js';

// Particle budget per quality level (window.__lumenQuality: 'high' | 'medium' | 'low', default 'high').
// Pools are sized once per race; emission rates and burst counts scale with `rate` every frame.
export const FX_QUALITY = {
  high:   { add: 5000, smoke: 2200, chunks: 700, streaks: 70, rate: 1 },
  medium: { add: 3000, smoke: 1300, chunks: 420, streaks: 48, rate: 0.6 },
  low:    { add: 1500, smoke: 650,  chunks: 220, streaks: 28, rate: 0.35 },
};
export function fxQuality() {
  let q = null;
  try { q = typeof window !== 'undefined' ? window.__lumenQuality : null; } catch (_) { q = null; }
  return FX_QUALITY[q] ? q : 'high';
}
const FIREBALLS = 10;
const RINGS = 20;
const STAR_SLOTS = 8;
const STARS_PER = 5;
const STREAKS = 70;

// LUMEN drift stages: 1 breeze mint #b5f3d0, 2 bloom dawn #ffc193, 3 comet violet #dbb2f6 (index 0 = no stage).
// Sparks are born in the exact aura colour (HOT) and cool into a deeper shade of it so they stay readable
// under additive blending + bloom on bright roads.
const DRIFT_COLORS_HOT = [0xffffff, 0xb5f3d0, 0xffc193, 0xdbb2f6];
const DRIFT_COLORS = [0xffffff, 0x4fdba4, 0xff8a4a, 0xa772ee];
// Aurora (star item) ribbon colours and light-prism (item box) colours.
const AURORA = [0xb5f3d0, 0x8fd3ff, 0xdbb2f6, 0xffc193, 0xf3d096, 0xc5f5de, 0xffb3c7];
const PRISM = [0xffc193, 0xfff4c5, 0xb5f3d0, 0xdbb2f6, 0x8fd3ff, 0xffb3c7, 0xf3d096];

// scratch (module-level, reused)
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _drawSize = new THREE.Vector2();
const _zAxis = new THREE.Vector3(0, 0, 1);

const rand = (a, b) => a + Math.random() * (b - a);
const finite = (n, d = 0) => (Number.isFinite(n) ? n : d);

// ---------------------------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------------------------
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function makeSmokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  // a few overlapping soft blobs -> puffy cloud silhouette
  const blobs = [[64, 64, 44, 0.9], [44, 56, 30, 0.7], [84, 58, 30, 0.7], [58, 82, 28, 0.6], [80, 80, 26, 0.6], [62, 40, 26, 0.6]];
  for (const [x, y, r, a] of blobs) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.6, `rgba(255,255,255,${a * 0.45})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Point particle pool
// ---------------------------------------------------------------------------------------------
const POINT_VERT = /* glsl */`
  attribute vec4 aColor;
  attribute float aSize;
  attribute float aRot;
  attribute float aShape;
  uniform float uScale;
  uniform float uMaxSize;
  varying vec4 vColor;
  varying float vRot;
  varying float vShape;
  void main() {
    vColor = aColor; vRot = aRot; vShape = aShape;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // particles that drift into the lens fade out and never cover the screen
    vColor.a *= smoothstep(0.8, 3.2, -mv.z);
    gl_PointSize = min(aSize * uScale / max(0.2, -mv.z), uMaxSize);
    if (aSize <= 0.0 || vColor.a <= 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;
const POINT_FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying vec4 vColor;
  varying float vRot;
  varying float vShape;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    float a = texture2D(uMap, p + 0.5).a;
    if (vShape > 0.5) {
      vec2 q = abs(p * 2.0);
      float star = max(0.0, 1.0 - q.x * 7.0) * max(0.0, 1.0 - q.y) + max(0.0, 1.0 - q.y * 7.0) * max(0.0, 1.0 - q.x);
      a = max(a * 0.75, star);
    }
    a *= vColor.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class PointPool {
  constructor(count, texture, blending, fadeIn) {
    this.n = count;
    this.cursor = 0;
    this.fadeIn = fadeIn;
    this.alive = 0;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 4);
    this.size = new Float32Array(count);
    this.rot = new Float32Array(count);
    this.shape = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.s0 = new Float32Array(count);
    this.s1 = new Float32Array(count);
    this.c0 = new Float32Array(count * 3);
    this.c1 = new Float32Array(count * 3);
    this.a0 = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.spin = new Float32Array(count);

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    this.aShape = new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aRot', this.aRot);
    geo.setAttribute('aShape', this.aShape);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uScale: { value: 600 }, uMaxSize: { value: 160 } },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    const uScale = this.material.uniforms.uScale;
    const uMax = this.material.uniforms.uMaxSize;
    this.points.onBeforeRender = (renderer, scene, camera) => {
      if (!camera?.isPerspectiveCamera) return;
      renderer.getDrawingBufferSize(_drawSize);
      uMax.value = Math.max(16, _drawSize.y * 0.22);
      uScale.value = _drawSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * (camera.zoom ? 1 / camera.zoom : 1));
    };
  }

  // colors are THREE.Color (linear); alpha 0..1; shape 0 = soft dot, 1 = sparkle
  spawn(x, y, z, vx, vy, vz, life, s0, s1, col0, col1, alpha, grav, drag, shape = 0, spin = 0) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i3] = col0.r; this.c0[i3 + 1] = col0.g; this.c0[i3 + 2] = col0.b;
    this.c1[i3] = col1.r; this.c1[i3 + 1] = col1.g; this.c1[i3 + 2] = col1.b;
    this.a0[i] = alpha;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.shape[i] = shape;
    this.spin[i] = spin;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.size[i] = s0;
    const i4 = i * 4;
    this.col[i4] = col0.r; this.col[i4 + 1] = col0.g; this.col[i4 + 2] = col0.b;
    this.col[i4 + 3] = this.fadeIn ? 0 : alpha;
    this.alive = Math.max(this.alive, 1);
  }

  update(dt) {
    if (this.alive === 0) return;
    let alive = 0;
    const { pos, vel, life, maxLife, s0, s1, c0, c1, a0, grav, drag, col, size, rot, spin } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { size[i] = 0; col[i * 4 + 3] = 0; continue; }
      alive++;
      const i3 = i * 3;
      const d = Math.max(0, 1 - drag[i] * dt);
      vel[i3] *= d; vel[i3 + 1] = vel[i3 + 1] * d - grav[i] * dt; vel[i3 + 2] *= d;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      const f = 1 - life[i] / maxLife[i];
      size[i] = s0[i] + (s1[i] - s0[i]) * f;
      rot[i] += spin[i] * dt;
      const i4 = i * 4;
      col[i4] = c0[i3] + (c1[i3] - c0[i3]) * f;
      col[i4 + 1] = c0[i3 + 1] + (c1[i3 + 1] - c0[i3 + 1]) * f;
      col[i4 + 2] = c0[i3 + 2] + (c1[i3 + 2] - c0[i3 + 2]) * f;
      const fin = this.fadeIn ? Math.min(1, f * 6) : 1;
      col[i4 + 3] = a0[i] * fin * (1 - f) * (this.fadeIn ? 1 : (1 - f * 0.3));
    }
    this.alive = alive;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aRot.needsUpdate = true;
    this.aShape.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.size.fill(0); this.alive = 1; }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

// ---------------------------------------------------------------------------------------------
// Instanced chunk pool (cubes / confetti / flecks)
// ---------------------------------------------------------------------------------------------
class ChunkPool {
  constructor(count) {
    this.n = count;
    this.cursor = 0;
    this.alive = 0;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    // Unlit: pastel petals/leaves/confetti keep their exact palette colour and cost less on phones.
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.rot = new Float32Array(count * 3);
    this.angVel = new Float32Array(count * 3);
    this.scl = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.floor = new Float32Array(count);
    this.flutter = new Float32Array(count);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) this.mesh.setMatrixAt(i, _m);
  }

  spawn(x, y, z, vx, vy, vz, life, sx, sy, sz, color, grav, drag, floorY, flutter = 0) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.rot[i3] = Math.random() * 6; this.rot[i3 + 1] = Math.random() * 6; this.rot[i3 + 2] = Math.random() * 6;
    this.angVel[i3] = rand(-10, 10); this.angVel[i3 + 1] = rand(-10, 10); this.angVel[i3 + 2] = rand(-10, 10);
    this.scl[i3] = sx; this.scl[i3 + 1] = sy; this.scl[i3 + 2] = sz;
    this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag; this.floor[i] = floorY; this.flutter[i] = flutter;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor.needsUpdate = true;
    this.alive = Math.max(1, this.alive);
  }

  update(dt, time) {
    if (this.alive === 0) return;
    let alive = 0;
    const { pos, vel, rot, angVel, scl, life, maxLife, grav, drag, floor, flutter } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) continue;
      const i3 = i * 3;
      life[i] -= dt;
      if (life[i] <= 0) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      alive++;
      const d = Math.max(0, 1 - drag[i] * dt);
      vel[i3] *= d; vel[i3 + 2] *= d;
      vel[i3 + 1] = vel[i3 + 1] * d - grav[i] * dt;
      if (flutter[i] > 0) {
        pos[i3] += Math.sin(time * 7 + i) * flutter[i] * dt;
        pos[i3 + 2] += Math.cos(time * 6 + i * 1.3) * flutter[i] * dt;
      }
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < floor[i]) {
        pos[i3 + 1] = floor[i];
        if (vel[i3 + 1] < 0) vel[i3 + 1] *= -0.35;
        vel[i3] *= 0.6; vel[i3 + 2] *= 0.6;
        angVel[i3] *= 0.6; angVel[i3 + 1] *= 0.6; angVel[i3 + 2] *= 0.6;
      }
      rot[i3] += angVel[i3] * dt; rot[i3 + 1] += angVel[i3 + 1] * dt; rot[i3 + 2] += angVel[i3 + 2] * dt;
      const f = life[i] / maxLife[i];
      const k = f < 0.2 ? f / 0.2 : 1; // shrink out at the end
      _e.set(rot[i3], rot[i3 + 1], rot[i3 + 2]);
      _q.setFromEuler(_e);
      _v.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
      _s.set(scl[i3] * k, scl[i3 + 1] * k, scl[i3 + 2] * k);
      _m.compose(_v, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = 0;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); this.mesh.dispose?.(); }
}

// ---------------------------------------------------------------------------------------------
// Fireball + ring shaders
// ---------------------------------------------------------------------------------------------
const FIRE_VERT = /* glsl */`
  uniform float uTime;
  varying float vNoise;
  varying vec3 vN;
  varying vec3 vV;
  float n3(vec3 p) {
    return sin(p.x * 3.1 + uTime * 5.0) * sin(p.y * 2.7 + uTime * 4.3) * sin(p.z * 3.3 + uTime * 6.1)
         + 0.5 * sin(p.x * 7.3 - uTime * 7.0) * sin(p.z * 6.1 + uTime * 5.0);
  }
  void main() {
    vec3 p = position;
    float n = n3(normal * 2.0);
    vNoise = n;
    p += normal * n * 0.22;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const FIRE_FRAG = /* glsl */`
  uniform float uLife;
  uniform float uOpacity;
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  varying float vNoise;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float fres = 1.0 - abs(dot(vN, vV));
    float heat = clamp(0.9 - uLife * 1.5 + vNoise * 0.4 - fres * 0.75, 0.0, 1.0);
    vec3 col = mix(uC0, uC1, smoothstep(0.0, 0.45, heat));
    col = mix(col, uC2, smoothstep(0.55, 1.0, heat));
    float edge = smoothstep(0.0, 0.55, 1.0 - fres);
    float a = uOpacity * pow(1.0 - uLife, 0.8) * edge;
    gl_FragColor = vec4(col * 1.15, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const RING_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const RING_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uThick;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float ring = smoothstep(1.0 - uThick, 1.0 - uThick * 0.35, d) * (1.0 - smoothstep(0.93, 1.0, d));
    float inner = (1.0 - smoothstep(0.0, 1.0 - uThick, d)) * 0.12;
    float a = (ring + inner) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const STREAK_VERT = /* glsl */`
  attribute float aAlpha;
  varying float vAlpha;
  void main() { vAlpha = aAlpha; gl_Position = projectionMatrix * vec4(position, 1.0); }
`;
const STREAK_FRAG = /* glsl */`
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.004) discard;
    gl_FragColor = vec4(uColor, vAlpha);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------------------------
export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.time = 0;
    this.group = new THREE.Group();
    this.group.name = 'Effects';
    scene?.add(this.group);

    this.quality = fxQuality();
    const QB = FX_QUALITY[this.quality];
    this.q = QB.rate;                 // emission multiplier (re-read every frame)
    this.speedLines = true;           // settings hook ("reduce motion" can turn wind streaks off)
    this.items = null;                // ItemSystem (for projectile trails), attached through the bus
    this.glowTex = makeGlowTexture();
    this.smokeTex = makeSmokeTexture();
    this.add = new PointPool(QB.add, this.glowTex, THREE.AdditiveBlending, false);
    this.smoke = new PointPool(QB.smoke, this.smokeTex, THREE.NormalBlending, true);
    this.chunks = new ChunkPool(QB.chunks);
    this.smoke.points.renderOrder = 5;
    this.add.points.renderOrder = 6;
    this.group.add(this.chunks.mesh, this.smoke.points, this.add.points);

    // fireballs
    this.fireGeo = new THREE.IcosahedronGeometry(1, 4);
    this.fireballs = [];
    for (let i = 0; i < FIREBALLS; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uLife: { value: 0 }, uOpacity: { value: 1 },
          uC0: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() } },
        vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
        transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      });
      const mesh = new THREE.Mesh(this.fireGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.group.add(mesh);
      this.fireballs.push({ mesh, mat, t: 0, dur: 0, size: 1, active: false, seed: Math.random() * 10 });
    }
    this.fireCursor = 0;

    // rings
    this.ringGeo = new THREE.PlaneGeometry(2, 2);
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 0 }, uThick: { value: 0.3 } },
        vertexShader: RING_VERT, fragmentShader: RING_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, t: 0, dur: 0, r0: 0, r1: 1, active: false, kart: null, back: 0 });
    }
    this.ringCursor = 0;

    // hit stars (little stars circling a dizzy kart)
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.26 : 0.11;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    this.starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
    this.starGeo.center();
    this.starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.starMesh = new THREE.InstancedMesh(this.starGeo, this.starMat, STAR_SLOTS * STARS_PER);
    this.starMesh.frustumCulled = false;
    this.starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.starMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(STAR_SLOTS * STARS_PER * 3), 3);
    _m.makeScale(0, 0, 0);
    const starCols = [0xffe14d, 0xffffff, 0xffb300, 0xfff59d, 0xffd54f];
    for (let i = 0; i < STAR_SLOTS * STARS_PER; i++) {
      this.starMesh.setMatrixAt(i, _m);
      this.starMesh.setColorAt(i, _c0.setHex(starCols[i % starCols.length]));
    }
    this.group.add(this.starMesh);
    this.starSlots = [];
    for (let i = 0; i < STAR_SLOTS; i++) this.starSlots.push({ kart: null, t: 0, dur: 0, active: false });

    // speed streaks (view-space quads, drawn over the scene)
    this.streakPos = new Float32Array(STREAKS * 4 * 3);
    this.streakAlpha = new Float32Array(STREAKS * 4);
    const idx = new Uint16Array(STREAKS * 6);
    for (let i = 0; i < STREAKS; i++) {
      const v = i * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 2; idx[o + 2] = v + 1;
      idx[o + 3] = v + 1; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }
    const sg = new THREE.BufferGeometry();
    this.aStreakPos = new THREE.BufferAttribute(this.streakPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aStreakAlpha = new THREE.BufferAttribute(this.streakAlpha, 1).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('position', this.aStreakPos);
    sg.setAttribute('aAlpha', this.aStreakAlpha);
    sg.setIndex(new THREE.BufferAttribute(idx, 1));
    this.streakGeo = sg;
    this.streakMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.9, 0.95, 1.0) } },
      vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.streakMesh = new THREE.Mesh(sg, this.streakMat);
    this.streakMesh.frustumCulled = false;
    this.streakMesh.renderOrder = 999;
    this.streakMesh.visible = false;
    this.group.add(this.streakMesh);
    this.streakCount = Math.min(STREAKS, QB.streaks);
    sg.setDrawRange(0, this.streakCount * 6);
    this.streakKick = 0;
    this.streakTint = new THREE.Color(1, 0.97, 0.88);
    this.streaks = [];
    for (let i = 0; i < STREAKS; i++) this.streaks.push({ ang: 0, k: 0, d: 0, len: 0, w: 0, spd: 0, bright: 0 });
    for (const s of this.streaks) this._resetStreak(s, true);
    this.streakIntensity = 0;

    // per-kart emitter state
    this.kartState = new Map();

    // colours (linear) reused for spawning
    this.driftCols = DRIFT_COLORS.map((h) => new THREE.Color(h));
    this.driftHot = DRIFT_COLORS_HOT.map((h) => new THREE.Color(h));
    // LUMEN palette (src/theme.js): warm, pastel, never dark or aggressive.
    this.C = {
      white: new THREE.Color(0xffffff),
      cream: new THREE.Color(0xfff7dc),
      flameCore: new THREE.Color(0xfff0ce),   // boost core: chest-star light
      flameEnd: new THREE.Color(0xe98c73),    // scarf coral
      flameBlue: new THREE.Color(0xb5f3d0),   // breeze mint glow
      dawn: new THREE.Color(0xffc193),
      comet: new THREE.Color(0xdbb2f6),
      cometDeep: new THREE.Color(0x7a5cc4),
      mint: new THREE.Color(0xb5f3d0),
      echo: new THREE.Color(0xc5f5de),
      gold: new THREE.Color(0xf3d096),
      starGold: new THREE.Color(0xedc371),
      firefly: new THREE.Color(0xffb36b),
      fireflyCore: new THREE.Color(0xfff2c2),
      sky: new THREE.Color(0x8fd3ff),
      seed: new THREE.Color(0x7ed37a),
      petal: new THREE.Color(0xffd34d),
      petal2: new THREE.Color(0xffb23f),
      petalHeart: new THREE.Color(0x9a6a3a),
      smokeLight: new THREE.Color(0xf2efe6),
      smokeGrey: new THREE.Color(0xcfc8bd),
      smokeDark: new THREE.Color(0xd9cdea),   // explosion puffs: soft lavender, not soot
      smokeDarker: new THREE.Color(0xb7a9d6),
      dust: new THREE.Color(0xd9bf94),
      dustEnd: new THREE.Color(0xeee0c4),
      grass1: new THREE.Color(0x8fcf6a),
      grass2: new THREE.Color(0x5fae55),
      leaf: new THREE.Color(0x99d1b7),
      dirt: new THREE.Color(0xa07a52),
      spark: new THREE.Color(0xfff0ce),
      sparkEnd: new THREE.Color(0xf3b07a),
      orange: new THREE.Color(0xffc193),
      yellow: new THREE.Color(0xf3d096),
      water: new THREE.Color(0xd8f3ff),
      waterEnd: new THREE.Color(0x7fc8ff),
      debris: new THREE.Color(0x8a7aa8),
    };
    this.rainbow = PRISM.map((h) => new THREE.Color(h));
    this.aurora = AURORA.map((h) => new THREE.Color(h));
    this.fireSets = {
      warm: [new THREE.Color(0xe98c73), new THREE.Color(0xffc193), new THREE.Color(0xfff2d8)],   // sunflower bloom
      star: [new THREE.Color(0x6b5fd0), new THREE.Color(0x8fd3ff), new THREE.Color(0xf4fbff)],   // shooting star
      soft: [new THREE.Color(0xc9a7e8), new THREE.Color(0xffd9b8), new THREE.Color(0xfffaf0)],   // small poof
    };

    // bus subscriptions
    this.unsubs = [];
    const on = (name, fn) => this.unsubs.push(bus.on(name, (d) => { try { fn(d || {}); } catch (err) { console.error('[effects]', name, err); } }));
    on('item:pickup', (d) => this.burst('itemBox', d.position || d.kart?.position));
    on('item:explode', (d) => this.burst('explosion', d.position, { radius: d.radius, kind: d.kind }));
    on('kart:hit', (d) => {
      if (!d.kart) return;
      if (d.kind === 'shrink') this.burst('shrink', d.kart.position, { kart: d.kart });
      else this.burst('hitStars', d.kart.position, { kart: d.kart, kind: d.kind });
    });
    on('kart:land', (d) => {
      if (!d.kart) return;
      this.burst('landingDust', d.kart.position, { kart: d.kart });
      if (d.kart.surface === 'offroad') this.burst('leaves', d.kart.position, { count: 8 });
      else if (finite(d.intensity) > 0.5) this.burst('lightMotes', d.kart.position, { count: 8 });
    });
    on('race:finish', (d) => { if (d.kart?.isPlayer) this.burst('confetti', d.kart.position, { kart: d.kart }); });
    on('kart:wallBump', (d) => {
      const k = d.kart; if (!k?.position) return;
      this._kartForward(k, _fwd);
      _v3.copy(k.position).addScaledVector(_fwd, finite(k.radius, 1.3) * 0.8); _v3.y += 0.5;
      this.burst('sparks', _v3, { intensity: d.intensity });
    });
    on('kart:bump', (d) => {
      if (!d.a?.position || !d.b?.position) return;
      _v3.addVectors(d.a.position, d.b.position).multiplyScalar(0.5); _v3.y += 0.6;
      this.burst('sparks', _v3, { intensity: d.intensity, small: true });
    });
    on('kart:miniTurbo', (d) => d.kart && this.burst('miniTurbo', d.kart.position, { kart: d.kart, level: d.level }));
    on('coin:pickup', (d) => d.position && this._burstCoin(d.position));
    on('kart:fall', (d) => {
      if (!d.position) return;
      const isVoid = d.pitKind ? d.pitKind === 'void' : !!d.lava;
      if (isVoid) this.burst('voidFall', d.position, { kart: d.kart, scale: 1 });
      else this.burst('splash', d.position, { scale: 1.5 });
    });
    on('item:splash', (d) => {
      if (!d.position) return;
      if (d.pitKind === 'void') this.burst('voidFall', d.position, { scale: 0.45 });
      else this.burst('splash', d.position, { scale: 0.6 });
    });
    on('hazard:smash', (d) => d.position && this.burst('splash', d.position, { scale: 1.2 }));
    on('hazard:stomp', (d) => {
      if (!d.position) return;
      this.burst('landingDust', d.position, {});
      this._ring(d.position, 0, null, 1, 7, 0.45, this.C.smokeLight, 0.7, 'ground', 0.35);
    });
    on('item:horn', (d) => {
      // Résonance: Lumen's call -> concentric echo-mint rings + a soft halo of light notes
      if (!d.position) return;
      const r = finite(d.radius, 12);
      const C = this.C;
      this._ring(d.position, 0, null, 1, r, 0.5, C.echo, 0.95, 'ground', 0.35);
      this._ring(d.position, 0.09, null, 1, r * 0.82, 0.5, C.white, 0.75, 'ground', 0.25);
      this._ring(d.position, 0.18, null, 1, r * 0.62, 0.5, C.mint, 0.7, 'ground', 0.3);
      if (d.kart) {
        this._ring(d.kart.position, 0, d.kart, 0.5, 4.5, 0.4, C.echo, 0.9, 'kart', 0.3);
        this._ring(d.kart.position, 0.1, d.kart, 0.5, 3.2, 0.35, C.white, 0.7, 'kart', 0.25);
      }
      const p = d.position, n = this._n(28);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.add.spawn(p.x + Math.cos(a) * 1.5, p.y + 0.8, p.z + Math.sin(a) * 1.5, Math.cos(a) * r * 1.4, rand(1, 3), Math.sin(a) * r * 1.4,
          rand(0.4, 0.6), rand(0.5, 0.8), 0.1, C.white, C.echo, 0.9, 0, 2, 1, rand(-3, 3));
      }
    });
    on('kart:slipstream', (d) => { if (d.kart) this._ring(d.kart.position, 0, d.kart, 0.4, 2.2, 0.3, this.C.water, 0.8, 'kart', 0.25); });
    on('kart:rocketEnd', (d) => d.kart && this.burst('smoke', d.kart.position, {}));
    on('kart:boost', (d) => {
      if (!d.kart) return;
      const st = this._state(d.kart);
      if (d.source === 'mushroom' || d.source === 'item') { st.bigBoost = true; st.boostKind = 'comet'; }
      else if (d.source === 'miniTurbo') st.boostKind = 'mini';
      else if (d.source !== 'star') st.boostKind = 'warm';
      if (d.kart.isPlayer && d.source !== 'coin') {
        this.streakKick = Math.max(this.streakKick, d.source === 'mushroom' || d.source === 'pad' || d.source === 'start' ? 1 : 0.7);
        this.streakTint.copy(st.boostKind === 'comet' ? this.C.comet : st.boostKind === 'mini' ? this.driftCols[st.miniLevel || 1] : this.C.cream);
      }
    });
    on('kart:miniTurbo', (d) => { if (d.kart) this._state(d.kart).miniLevel = Math.max(1, Math.min(3, d.level | 0)); });
    on('items:created', (d) => this.attachItems(d.system));
    on('items:disposed', (d) => { if (d.system === this.items) this.items = null; });
    on('item:use', (d) => {
      if (d.kart && (d.item === 'mushroom' || d.item === 'triple_mushroom')) {
        const st = this._state(d.kart);
        st.bigBoost = true;
        st.boostKind = 'comet';
        st.boostKick = 0.25;
        // comet burst: violet ring + a puff of stardust
        this._kartForward(d.kart, _fwd);
        _v3.copy(d.kart.position).addScaledVector(_fwd, -1.4); _v3.y += 0.7;
        this._ring(_v3, 0, d.kart, 0.4, 2.4, 0.3, this.C.comet, 0.9, 'kart', 0.3);
      }
    });
    on('item:hit', (d) => {
      // petal/leaf puff where an item lands on someone (soft, never gory)
      if (!d.kart?.position) return;
      this.burst(d.item === 'bomb' ? 'petals' : 'leaves', d.kart.position, { count: 10 });
    });
    // let an already-built ItemSystem find us (main builds items before effects)
    bus.emit('fx:created', { effects: this });
  }

  /** Attach the race ItemSystem so projectiles get trails (firefly glow, starry trail, seed dust, petals). */
  attachItems(system) { if (system && Array.isArray(system.entities)) this.items = system; }

  /** Quality-scaled particle count for bursts. */
  _n(count) { return Math.max(1, Math.round(count * this.q)); }

  // ------------------------------------------------------------------ helpers
  _state(kart) {
    let s = this.kartState.get(kart);
    if (!s) {
      s = { spark: 0, smoke: 0, flame: 0, dust: 0, fleck: 0, star: 0, puff: 0, trail: 0, mote: 0, bigBoost: false, boostKick: 0, lastBoost: 0,
        boostKind: 'warm', miniLevel: 1 };
      this.kartState.set(kart, s);
    }
    return s;
  }

  _kartForward(kart, out) {
    const h = finite(kart.heading, kart.object3D?.rotation?.y ?? 0);
    return out.set(Math.sin(h), 0, Math.cos(h));
  }

  // world position of a model anchor, falling back to a local offset on kart.object3D
  _anchor(kart, name, lx, ly, lz, out) {
    const a = kart.model?.anchors?.[name];
    if (a && a.isObject3D) {
      try { a.updateWorldMatrix(true, false); return out.setFromMatrixPosition(a.matrixWorld); } catch (_) { /* fall through */ }
    }
    const o = kart.object3D;
    if (o && o.isObject3D) {
      o.updateWorldMatrix(true, false);
      return out.set(lx, ly, lz).applyMatrix4(o.matrixWorld);
    }
    // bare fallback using heading
    this._kartForward(kart, _fwd);
    const p = kart.position || _v2.set(0, 0, 0);
    // right = (-cos h, 0, sin h); local +X is driver's left
    return out.set(p.x + _fwd.z * lx + _fwd.x * lz, p.y + ly, p.z - _fwd.x * lx + _fwd.z * lz);
  }

  // ------------------------------------------------------------------ frame update
  update(dt, karts) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.q = FX_QUALITY[fxQuality()].rate;
    try {
      if (karts) for (const k of karts) if (k) this._emitKart(k, dt);
      if (this.items) this._emitItemTrails(dt);
    } catch (err) { console.error('[effects] emit', err); }
    try {
      this.add.update(dt);
      this.smoke.update(dt);
      this.chunks.update(dt, this.time);
      this._updateFireballs(dt);
      this._updateRings(dt);
      this._updateStars(dt);
      this._updateStreaks(dt, karts);
    } catch (err) { console.error('[effects] update', err); }
  }

  _emitKart(k, dt) {
    if (!k.position) return;
    const st = this._state(k);
    const add = this.add, smoke = this.smoke, C = this.C;
    const speed = finite(k.speed);
    const absSpeed = Math.abs(speed);
    const fwd = this._kartForward(k, _fwd);
    _right.set(-fwd.z, 0, fwd.x); // driver's right = (-cos h, 0, sin h)
    const vx = finite(k.velocity?.x), vy = finite(k.velocity?.y), vz = finite(k.velocity?.z);
    const scale = finite(k.object3D?.scale?.x, 1) * (finite(k.shrinkTimer) > 0 ? 0.7 : 1);
    const airborne = !!k.airborne;

    // ---- drift sparks / tire smoke
    if (k.drifting && !airborne) {
      const lvl = Math.max(0, Math.min(3, finite(k.driftLevel) | 0));
      const dir = finite(k.driftDir, 1);
      if (lvl >= 1) {
        st.spark += dt * (lvl === 3 ? 110 : lvl === 2 ? 90 : 70) * this.q;
        const col = this.driftCols[lvl], hot = this.driftHot[lvl];
        while (st.spark >= 1) {
          st.spark -= 1;
          const left = Math.random() < 0.5;
          this._anchor(k, left ? 'wheelRL' : 'wheelRR', left ? 0.78 : -0.78, 0.18, -0.85, _v);
          const out = (left ? 1 : -1) * rand(1, 4);
          const back = rand(3, 9);
          add.spawn(_v.x, _v.y, _v.z,
            vx * 0.6 - fwd.x * back - _right.x * out, rand(3, 8), vz * 0.6 - fwd.z * back - _right.z * out,
            rand(0.2, 0.42), rand(0.5, 0.85) * scale, 0.08, hot, col, 1, 26, 1.5, Math.random() < 0.3 ? 1 : 0);
        }
        // hot glow at the wheels (flickering)
        st.puff += dt * 30 * Math.max(0.5, this.q);
        while (st.puff >= 1) {
          st.puff -= 1;
          for (let w = 0; w < 2; w++) {
            this._anchor(k, w ? 'wheelRL' : 'wheelRR', w ? 0.78 : -0.78, 0.25, -0.85, _v);
            add.spawn(_v.x, _v.y, _v.z, vx, vy + 1, vz, 0.1, (1.3 + lvl * 0.35) * scale, 0.6 * scale, hot, col, 0.9, 0, 0, 0);
          }
        }
        st.smoke += dt * 8 * this.q;
      } else {
        st.smoke += dt * 22 * this.q;
      }
      while (st.smoke >= 1) {
        st.smoke -= 1;
        const left = Math.random() < 0.5;
        this._anchor(k, left ? 'wheelRL' : 'wheelRR', left ? 0.78 : -0.78, 0.15, -0.85, _v);
        smoke.spawn(_v.x, _v.y, _v.z, vx * 0.15 - _right.x * dir * rand(0, 2), rand(0.8, 2), vz * 0.15 - _right.z * dir * rand(0, 2),
          rand(0.5, 0.9), 0.5 * scale, rand(1.8, 2.6) * scale, C.smokeLight, C.smokeGrey, 0.5, -1.2, 2.5, 0, rand(-1, 1));
      }
    } else { st.spark = 0; }

    // ---- rocket exhaust
    if (finite(k.rocketTimer) > 0) {
      st.rocket = (st.rocket || 0) + dt * 90 * this.q;
      while (st.rocket >= 1) {
        st.rocket -= 1;
        _v.copy(k.position).addScaledVector(fwd, -3.2); _v.y += 1.1;
        this.add.spawn(_v.x + rand(-0.4, 0.4), _v.y + rand(-0.4, 0.4), _v.z + rand(-0.4, 0.4), vx * 0.3 - fwd.x * rand(6, 12), rand(-1, 1), vz * 0.3 - fwd.z * rand(6, 12),
          rand(0.2, 0.35), rand(1.4, 2.2), 0.2, C.cream, C.mint, 1, 0, 2, 0); // flight feather: breeze trail
        if (Math.random() < 0.4) this.smoke.spawn(_v.x, _v.y, _v.z, vx * 0.1, rand(0.5, 2), vz * 0.1, rand(0.6, 1), 1, 3.5, C.smokeLight, C.smokeGrey, 0.45, -0.5, 2, 0, rand(-1, 1));
      }
    }
    // ---- slipstream air streaks
    if (finite(k.slipCharge) > 0.12) {
      st.slip = (st.slip || 0) + dt * 40 * this.q;
      while (st.slip >= 1) {
        st.slip -= 1;
        const a = Math.random() * Math.PI * 2, r = rand(1.2, 2.2);
        _v.copy(k.position).addScaledVector(fwd, rand(0, 3)).addScaledVector(_right, Math.cos(a) * r); _v.y += 1 + Math.sin(a) * r * 0.6;
        this.add.spawn(_v.x, _v.y, _v.z, vx * 0.55, 0, vz * 0.55, rand(0.18, 0.3), 0.18, 0.05, C.white, C.mint, 0.55, 0, 0, 1);
      }
    }

    // ---- boost flames
    const boost = finite(k.boostTimer);
    if (boost > 0) {
      const big = st.bigBoost;
      const kind = st.boostKind;
      // exhaust colours: comet (item) violet, mini-turbo = its drift stage colour, pads/start = warm dawn
      const c0 = kind === 'comet' ? C.comet : kind === 'mini' ? this.driftHot[st.miniLevel || 1] : C.flameCore;
      const c1 = kind === 'comet' ? C.cometDeep : kind === 'mini' ? this.driftCols[st.miniLevel || 1] : C.dawn;
      st.flame += dt * (big ? 110 : 75) * this.q;
      const sz = (big ? 1.25 : 0.85) * scale;
      while (st.flame >= 1) {
        st.flame -= 1;
        for (let e = 0; e < 2; e++) {
          this._anchor(k, e ? 'exhaustL' : 'exhaustR', e ? 0.32 : -0.32, 0.5, -1.2, _v);
          _v.addScaledVector(fwd, -0.35);
          const back = rand(5, 10);
          add.spawn(_v.x, _v.y, _v.z,
            vx - fwd.x * back + rand(-0.7, 0.7), vy + rand(0.3, 1.6), vz - fwd.z * back + rand(-0.7, 0.7),
            rand(0.12, 0.24), sz * rand(0.9, 1.3), sz * 0.3, c0, c1, 0.75, -3, 0, 0);
          if (big && Math.random() < 0.35) {
            add.spawn(_v.x, _v.y, _v.z, vx * 0.9 - fwd.x * 3, vy * 0.9, vz * 0.9 - fwd.z * 3,
              0.1, sz * 1.5, sz * 0.7, C.flameBlue, c1, 0.35, 0, 0, 0);
          }
        }
      }
      // comet trail: long-lived stardust left in the air behind an item boost (reads as a comet tail)
      if (kind === 'comet') {
        st.trail += dt * 70 * this.q;
        while (st.trail >= 1) {
          st.trail -= 1;
          _v.copy(k.position).addScaledVector(fwd, -1.6 - Math.random() * 0.8); _v.y += rand(0.4, 1.2);
          add.spawn(_v.x + rand(-0.5, 0.5), _v.y, _v.z + rand(-0.5, 0.5), vx * 0.05, rand(-0.2, 0.4), vz * 0.05,
            rand(0.45, 0.8), rand(0.7, 1.2) * scale, 0.1, Math.random() < 0.1 ? C.white : C.comet, C.cometDeep, 0.5, 0, 1, Math.random() < 0.25 ? 1 : 0, rand(-2, 2));
        }
      }
      // soft light motes drifting off the kart while boosting
      st.mote += dt * 9 * this.q;
      while (st.mote >= 1) {
        st.mote -= 1;
        _v.copy(k.position).addScaledVector(_right, rand(-1.2, 1.2)).addScaledVector(fwd, rand(-1.5, 0.5)); _v.y += rand(0.3, 1.6);
        add.spawn(_v.x, _v.y, _v.z, vx * 0.4, rand(0.6, 1.6), vz * 0.4, rand(0.6, 1.0), rand(0.25, 0.45) * scale, 0.02, C.cream, c1, 0.6, -0.5, 1.5, 0);
      }
      st.lastBoost = boost;
    } else {
      st.flame = 0;
      st.bigBoost = false;
      // idle exhaust puffs while pulling away
      if (finite(k.input?.throttle) > 0.2 && absSpeed < 14 && !airborne) {
        st.puff += dt * 7;
        while (st.puff >= 1) {
          st.puff -= 1;
          this._anchor(k, Math.random() < 0.5 ? 'exhaustL' : 'exhaustR', 0.32, 0.5, -1.2, _v);
          smoke.spawn(_v.x, _v.y, _v.z, vx * 0.5 - fwd.x * 2, rand(0.6, 1.4), vz * 0.5 - fwd.z * 2,
            0.6, 0.25 * scale, 0.9 * scale, C.smokeGrey, C.smokeLight, 0.35, -0.8, 2, 0, rand(-1, 1));
        }
      }
    }
    if (st.boostKick > 0) st.boostKick -= dt;

    // ---- offroad dust & grass flecks
    if (k.surface === 'offroad' && absSpeed > 4 && !airborne) {
      const rate = Math.min(1, absSpeed / 30);
      st.dust += dt * 28 * rate * this.q;
      st.fleck += dt * 22 * rate * this.q;
      while (st.dust >= 1) {
        st.dust -= 1;
        const left = Math.random() < 0.5;
        this._anchor(k, left ? 'wheelRL' : 'wheelRR', left ? 0.78 : -0.78, 0.1, -0.85, _v);
        smoke.spawn(_v.x, _v.y, _v.z, vx * 0.2 - fwd.x * 2 + rand(-1, 1), rand(1, 2.5), vz * 0.2 - fwd.z * 2 + rand(-1, 1),
          rand(0.6, 1.0), 0.6 * scale, rand(2, 3) * scale, C.dust, C.dustEnd, 0.55, -0.5, 2, 0, rand(-1, 1));
      }
      while (st.fleck >= 1) {
        st.fleck -= 1;
        const left = Math.random() < 0.5;
        this._anchor(k, left ? 'wheelRL' : 'wheelRR', left ? 0.78 : -0.78, 0.15, -0.85, _v);
        const r = Math.random();
        const col = r < 0.4 ? C.grass1 : r < 0.7 ? C.grass2 : r < 0.85 ? C.leaf : C.dirt;
        const s = rand(0.08, 0.16);
        this.chunks.spawn(_v.x, _v.y, _v.z,
          vx * 0.3 - fwd.x * rand(2, 6) + rand(-2, 2), rand(4, 8), vz * 0.3 - fwd.z * rand(2, 6) + rand(-2, 2),
          rand(0.5, 0.8), s, s * 0.4, s * 1.6, col, 26, 0.5, _v.y - 0.3);
      }
    }

    // ---- star rainbow sparkles
    if (finite(k.starTimer) > 0) {
      st.star += dt * 75 * this.q;
      while (st.star >= 1) {
        st.star -= 1;
        // Aurore: aurora-borealis ribbon colours cycling over time
        const ai = ((this.time * 3 + Math.random() * 2) | 0) % this.aurora.length;
        const hueCol = this.aurora[ai];
        _c2.copy(hueCol).lerp(C.white, 0.15);
        const ox = rand(-1.1, 1.1), oy = rand(0.2, 1.8), oz = rand(-1.4, 1.0);
        _v.set(k.position.x + _right.x * ox + fwd.x * oz, k.position.y + oy, k.position.z + _right.z * ox + fwd.z * oz);
        add.spawn(_v.x, _v.y, _v.z, vx * 0.5 + rand(-1, 1), rand(0.5, 2.5), vz * 0.5 + rand(-1, 1),
          rand(0.35, 0.7), rand(0.5, 0.9) * scale, 0.05, _c2, hueCol, 0.85, -1, 2, 1, rand(-3, 3));
      }
      // two aurora ribbons streaming from the rear wheels
      st.trail += dt * 60 * this.q;
      while (st.trail >= 1) {
        st.trail -= 1;
        const left = Math.random() < 0.5;
        this._anchor(k, left ? 'wheelRL' : 'wheelRR', left ? 0.78 : -0.78, 0.35, -0.85, _v);
        const col = this.aurora[((this.time * 6) | 0) % this.aurora.length];
        add.spawn(_v.x, _v.y + rand(0, 0.5), _v.z, vx * 0.08, rand(0.4, 1.2), vz * 0.08,
          rand(0.5, 0.8), rand(0.6, 1.0) * scale, 0.2, col, this.aurora[(((this.time * 6) | 0) + 2) % this.aurora.length], 0.4, -0.3, 1, 0);
      }
    }
  }

  // ------------------------------------------------------------------ item trails
  _emitItemTrails(dt) {
    const ents = this.items?.entities;
    if (!Array.isArray(ents)) return;
    const add = this.add, C = this.C, q = this.q;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e || e.dead || !e.pos) continue;
      const p = e.pos;
      const vx = finite(e.vel?.x), vz = finite(e.vel?.z);
      let rate = 0;
      if (e.type === 'red_shell') rate = 55;
      else if (e.type === 'blue_shell') rate = 70;
      else if (e.type === 'green_shell') rate = 18;
      else if (e.type === 'bomb') rate = e.flying ? 10 : 4;
      else continue;
      e.fxAcc = finite(e.fxAcc) + dt * rate * q;
      while (e.fxAcc >= 1) {
        e.fxAcc -= 1;
        if (e.type === 'red_shell') {
          // Luciole: warm firefly glow with a blinking halo
          add.spawn(p.x + rand(-0.2, 0.2), p.y + 0.5 + rand(-0.2, 0.2), p.z + rand(-0.2, 0.2), -vx * 0.05 + rand(-0.6, 0.6), rand(0.2, 1.2), -vz * 0.05 + rand(-0.6, 0.6),
            rand(0.35, 0.6), rand(0.35, 0.6), 0.05, C.fireflyCore, C.firefly, 0.95, -0.4, 2, Math.random() < 0.3 ? 1 : 0, rand(-3, 3));
          if (Math.random() < 0.25) add.spawn(p.x, p.y + 0.5, p.z, vx * 0.6, 0, vz * 0.6, 0.12, 2.6, 1.6, C.fireflyCore, C.firefly, 0.5, 0, 0, 0);
        } else if (e.type === 'blue_shell') {
          // Étoile filante: starry trail (sparkle stars, sky blue -> violet)
          add.spawn(p.x + rand(-0.4, 0.4), p.y + rand(-0.3, 0.3), p.z + rand(-0.4, 0.4), rand(-1, 1), rand(-1.5, 0.3), rand(-1, 1),
            rand(0.6, 1.1), rand(0.6, 1.0), 0.05, Math.random() < 0.4 ? C.white : C.sky, C.comet, 1, 1.5, 1, 1, rand(-4, 4));
        } else if (e.type === 'green_shell') {
          // Graine: a little mint seed dust
          add.spawn(p.x, p.y + 0.3, p.z, rand(-0.5, 0.5), rand(0.3, 1), rand(-0.5, 0.5), rand(0.25, 0.4), 0.35, 0.05, C.mint, C.seed, 0.7, 0, 2, 0);
        } else {
          // Fleur solaire: drifting petals and pollen
          this.chunks.spawn(p.x, p.y + 0.6, p.z, rand(-1.5, 1.5), rand(0.5, 2), rand(-1.5, 1.5), rand(0.8, 1.3), 0.16, 0.02, 0.1,
            Math.random() < 0.6 ? C.petal : C.petal2, 3, 1.5, p.y, rand(1, 2));
          add.spawn(p.x, p.y + 0.8, p.z, rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5), 0.5, 0.3, 0.05, C.cream, C.petal, 0.7, 0, 1, 1);
        }
      }
    }
  }

  // ------------------------------------------------------------------ bursts
  burst(kind, position, opts = {}) {
    try {
      if (!position) position = opts.kart?.position;
      if (!position || !Number.isFinite(position.x)) return;
      switch (kind) {
        case 'itemBox': return this._burstItemBox(position);
        case 'explosion': return this._burstExplosion(position, opts);
        case 'confetti': return this._burstConfetti(position, opts);
        case 'hitStars': return this._burstHitStars(position, opts);
        case 'splash': return this._burstSplash(position, opts);
        case 'landingDust': return this._burstLanding(position, opts);
        case 'sparks': return this._burstSparks(position, opts);
        case 'miniTurbo': return this._burstMiniTurbo(position, opts);
        case 'shrink': return this._burstShrink(position, opts);
        case 'smoke': return this._burstSmoke(position, opts);
        case 'petals': return this._burstPetals(position, opts);
        case 'leaves': return this._burstLeaves(position, opts);
        case 'lightMotes': return this._burstMotes(position, opts);
        case 'voidFall': return this._burstVoid(position, opts);
        default: return undefined;
      }
    } catch (err) {
      console.error('[effects] burst', kind, err);
    }
    return undefined;
  }

  _burstItemBox(p) {
    const C = this.C;
    // bright flash
    this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.22, 3.5, 6, C.white, C.cream, 0.9, 0, 0, 0);
    const nShard = this._n(22), nGlow = this._n(36);
    for (let i = 0; i < nShard; i++) {
      const col = this.rainbow[i % this.rainbow.length];
      const a = Math.random() * Math.PI * 2, e = rand(-0.3, 1);
      const sp = rand(5, 11);
      const s = rand(0.12, 0.24);
      this.chunks.spawn(p.x, p.y, p.z, Math.cos(a) * sp, e * sp * 0.8 + 4, Math.sin(a) * sp,
        rand(0.6, 1.0), s, s, s * 0.35, col, 24, 0.8, p.y - 1.2);
    }
    for (let i = 0; i < nGlow; i++) {
      const col = this.rainbow[(Math.random() * this.rainbow.length) | 0];
      _c2.copy(col).lerp(C.white, 0.5);
      const a = Math.random() * Math.PI * 2, u = rand(-1, 1), sp = rand(3, 9);
      const r = Math.sqrt(1 - u * u);
      this.add.spawn(p.x, p.y, p.z, Math.cos(a) * r * sp, u * sp + 1.5, Math.sin(a) * r * sp,
        rand(0.35, 0.7), rand(0.4, 0.7), 0.05, _c2, col, 1, 4, 2.5, 1, rand(-4, 4));
    }
    this._ring(p, 0, null, 0.4, 2.6, 0.3, C.white, 0.4, 'ground', 0.18);
  }

  _burstExplosion(p, opts) {
    const C = this.C;
    const radius = finite(opts.radius, 3);
    const s = Math.max(0.4, radius / 3);
    const small = opts.kind === 'small' || radius < 2;
    const star = opts.kind === 'blue_shell' || opts.kind === 'blue_shell_defused';
    const bomb = opts.kind === 'bomb';
    const set = star ? this.fireSets.star : small ? this.fireSets.soft : this.fireSets.warm;
    // soft bloom ball (sun-bloom for the sunflower, starlight for the shooting star)
    this._fireball(p.x, p.y + radius * 0.35, p.z, radius * (small ? 0.8 : 0.6), small ? 0.45 : 0.9, set);
    if (!small) this._fireball(p.x + rand(-1, 1) * s, p.y + 1.6 * s, p.z + rand(-1, 1) * s, radius * 0.45, 0.75, set);
    // flash
    this.add.spawn(p.x, p.y + 1, p.z, 0, 0, 0, 0.2, radius * 1.8, radius * 2.6, C.white, star ? C.sky : C.dawn, 0.75, 0, 0, 0);
    // sparkles
    const nSparks = this._n(small ? 18 : 45 * Math.min(2, s));
    const sc0 = star ? C.white : C.spark, sc1 = star ? C.comet : C.sparkEnd;
    for (let i = 0; i < nSparks; i++) {
      const a = Math.random() * Math.PI * 2, u = rand(-0.2, 1), sp = rand(8, 20) * Math.sqrt(s);
      const r = Math.sqrt(1 - u * u);
      this.add.spawn(p.x, p.y + 0.5, p.z, Math.cos(a) * r * sp, u * sp + 3, Math.sin(a) * r * sp,
        rand(0.4, 0.9), rand(0.3, 0.55), 0.05, sc0, sc1, 1, 22, 1.2, star || Math.random() < 0.3 ? 1 : 0, rand(-4, 4));
    }
    // soft lavender/cream puffs (never black smoke)
    const nSmoke = this._n(small ? 6 : 14 * Math.min(2, s));
    for (let i = 0; i < nSmoke; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(1, 4) * s;
      this.smoke.spawn(p.x + Math.cos(a) * s * 0.8, p.y + rand(0.5, 2) * s, p.z + Math.sin(a) * s * 0.8,
        Math.cos(a) * sp, rand(2, 5) * Math.sqrt(s), Math.sin(a) * sp,
        rand(0.9, 1.5), rand(1.5, 2.5) * s, rand(4, 6) * s, C.smokeLight, C.smokeDark, 0.5, -1.5, 1.2, 0, rand(-1, 1));
    }
    if (bomb) this._burstPetals(p, { count: 70 * Math.min(1.6, s), speed: 7 * Math.sqrt(s), sunflower: true });
    else if (!small) {
      const nDebris = this._n(Math.round(12 * Math.min(2, s)));
      for (let i = 0; i < nDebris; i++) {
        const a = Math.random() * Math.PI * 2, sp = rand(5, 12) * Math.sqrt(s);
        const sz = rand(0.15, 0.3) * Math.sqrt(s);
        this.chunks.spawn(p.x, p.y + 0.6, p.z, Math.cos(a) * sp, rand(6, 13), Math.sin(a) * sp,
          rand(1, 1.6), sz, sz, sz, star ? (Math.random() < 0.5 ? C.sky : C.comet) : (Math.random() < 0.5 ? C.dawn : C.debris), 30, 0.3, p.y);
      }
    }
    // shockwave rings
    this._ring(p, 0.15, null, 0.5 * s, radius * 1.7, small ? 0.35 : 0.55, star ? C.sky : C.dawn, 1, 'ground', 0.25);
    if (!small) this._ring(p, 0.3, null, 0.5 * s, radius * 1.2, 0.45, star ? C.comet : C.white, 0.7, 'ground', 0.15);
  }

  /** Sunflower / blossom petals: flat fluttering chunks + pollen sparkles. */
  _burstPetals(p, opts = {}) {
    const C = this.C;
    const n = this._n(finite(opts.count, 24));
    const sp0 = finite(opts.speed, 6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(0.4, 1) * sp0;
      const col = opts.sunflower ? (Math.random() < 0.65 ? C.petal : Math.random() < 0.7 ? C.petal2 : C.petalHeart)
        : (Math.random() < 0.5 ? C.dawn : Math.random() < 0.5 ? C.flameEnd : C.cream);
      this.chunks.spawn(p.x + rand(-0.5, 0.5), p.y + rand(0.6, 1.4), p.z + rand(-0.5, 0.5), Math.cos(a) * sp, rand(4, 9), Math.sin(a) * sp,
        rand(1.4, 2.4), rand(0.13, 0.2), 0.015, rand(0.07, 0.1), col, 8, 1.8, p.y - 0.4, rand(1, 3));
    }
    const ng = this._n(Math.round(n * 0.5));
    for (let i = 0; i < ng; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(2, 6);
      this.add.spawn(p.x, p.y + 1, p.z, Math.cos(a) * sp, rand(1, 5), Math.sin(a) * sp, rand(0.4, 0.8), rand(0.3, 0.5), 0.05, C.cream, C.gold, 0.9, 2, 1.5, 1, rand(-3, 3));
    }
  }

  /** Leaf flecks (soft mint/teal), e.g. when an item lands or a kart ploughs a bush. */
  _burstLeaves(p, opts = {}) {
    const C = this.C;
    const n = this._n(finite(opts.count, 14));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(2, 6);
      const col = Math.random() < 0.4 ? C.leaf : Math.random() < 0.5 ? C.grass1 : C.mint;
      this.chunks.spawn(p.x, p.y + rand(0.6, 1.4), p.z, Math.cos(a) * sp, rand(3, 7), Math.sin(a) * sp,
        rand(1.0, 1.8), rand(0.12, 0.18), 0.015, rand(0.07, 0.1), col, 9, 1.6, p.y - 0.4, rand(1, 2.5));
    }
  }

  /**
   * Falling into the Night's starry void: a swirl of star sparkles and lavender motes sucked downward, a faint
   * indigo/violet ring where the kart vanished. No water, no smoke.
   */
  _burstVoid(p, opts = {}) {
    const C = this.C;
    const s = finite(opts.scale, 1);
    const n = this._n(Math.round(46 * s));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.3, 2.2) * s;
      // tangential swirl + downward pull (negative gravity sign = falls faster)
      const tx = -Math.sin(a) * rand(2, 5), tz = Math.cos(a) * rand(2, 5);
      this.add.spawn(p.x + Math.cos(a) * r, p.y + rand(0, 1.5), p.z + Math.sin(a) * r, tx, rand(-1, 2.5), tz,
        rand(0.6, 1.2), rand(0.35, 0.7) * s, 0.05, Math.random() < 0.5 ? C.white : C.sky, Math.random() < 0.5 ? C.comet : C.cometDeep,
        1, 6, 1.2, Math.random() < 0.6 ? 1 : 0, rand(-4, 4));
    }
    const nm = this._n(Math.round(14 * s));
    for (let i = 0; i < nm; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add.spawn(p.x + Math.cos(a) * 0.8, p.y + 0.5, p.z + Math.sin(a) * 0.8, Math.cos(a) * 1.5, rand(0.5, 2), Math.sin(a) * 1.5,
        rand(0.9, 1.5), rand(0.6, 1.0) * s, 0.1, C.comet, C.cometDeep, 0.5, -0.5, 1, 0);
    }
    this.add.spawn(p.x, p.y + 0.6, p.z, 0, 0, 0, 0.25, 3 * s, 0.4, C.white, C.comet, 0.8, 0, 0, 1);
    this._ring(p, 0, null, 0.3, 3.4 * s, 0.6, C.comet, 0.75, 'ground', 0.25);
    this._ring(p, 0.12, null, 0.3, 2.2 * s, 0.5, C.sky, 0.6, 'ground', 0.2);
  }

  /** Soft floating light particles (LUMEN's glow motes). */
  _burstMotes(p, opts = {}) {
    const C = this.C;
    const n = this._n(finite(opts.count, 16));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.5, 2.5);
      this.add.spawn(p.x + Math.cos(a) * r, p.y + rand(0.3, 2), p.z + Math.sin(a) * r, rand(-0.5, 0.5), rand(0.5, 1.6), rand(-0.5, 0.5),
        rand(0.8, 1.6), rand(0.3, 0.6), 0.05, C.cream, Math.random() < 0.5 ? C.mint : C.gold, 0.7, -0.3, 1, Math.random() < 0.3 ? 1 : 0);
    }
  }

  _burstConfetti(p) {
    const nc = this._n(200), ng = this._n(60);
    for (let i = 0; i < nc; i++) {
      const col = this.rainbow[i % this.rainbow.length];
      const a = Math.random() * Math.PI * 2, sp = rand(2, 9);
      this.chunks.spawn(p.x + rand(-2, 2), p.y + rand(1, 3), p.z + rand(-2, 2),
        Math.cos(a) * sp, rand(9, 20), Math.sin(a) * sp,
        rand(3, 5), rand(0.18, 0.28), 0.02, rand(0.1, 0.16), col, 9, 2.4, p.y - 0.5, rand(1, 3));
    }
    for (let i = 0; i < ng; i++) {
      const col = this.rainbow[(Math.random() * this.rainbow.length) | 0];
      this.add.spawn(p.x + rand(-3, 3), p.y + rand(1, 5), p.z + rand(-3, 3), rand(-2, 2), rand(1, 5), rand(-2, 2),
        rand(0.6, 1.4), rand(0.5, 0.9), 0.05, this.C.white, col, 1, 1, 1, 1, rand(-3, 3));
    }
  }

  _burstHitStars(p, opts) {
    const k = opts.kart;
    const C = this.C;
    if (k) {
      let slot = this.starSlots.find((s) => s.active && s.kart === k) || this.starSlots.find((s) => !s.active);
      if (!slot) slot = this.starSlots.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
      slot.kart = k; slot.t = 0; slot.dur = opts.kind === 'spin' ? 1.4 : 1.8; slot.active = true;
    }
    const nh = this._n(18);
    for (let i = 0; i < nh; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(4, 9);
      this.add.spawn(p.x, p.y + 1, p.z, Math.cos(a) * sp, rand(2, 7), Math.sin(a) * sp,
        rand(0.3, 0.55), rand(0.35, 0.6), 0.05, C.white, C.starGold, 1, 14, 1.5, 1, rand(-4, 4));
    }
    for (let i = 0; i < this._n(5); i++) {
      this.smoke.spawn(p.x + rand(-0.8, 0.8), p.y + 0.5, p.z + rand(-0.8, 0.8), rand(-1.5, 1.5), rand(1, 2.5), rand(-1.5, 1.5),
        0.7, 1, 2.4, C.smokeLight, C.smokeGrey, 0.5, -0.5, 2, 0, rand(-1, 1));
    }
  }

  _burstShrink(p, opts) {
    const C = this.C;
    this.add.spawn(p.x, p.y + 1, p.z, 0, 0, 0, 0.25, 5, 1, C.white, C.yellow, 1, 0, 0, 0);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add.spawn(p.x + Math.cos(a) * 1.5, p.y + rand(0.2, 2), p.z + Math.sin(a) * 1.5, -Math.cos(a) * 3, rand(0, 2), -Math.sin(a) * 3,
        rand(0.3, 0.5), 0.5, 0.05, C.white, C.yellow, 1, 0, 1, 1, rand(-4, 4));
    }
    this._burstSmoke(p, { count: 6 });
    if (opts.kart) this._burstHitStars(p, { kart: opts.kart, kind: 'spin' });
  }

  _burstSmoke(p, opts) {
    const C = this.C;
    const n = finite(opts.count, 8);
    for (let i = 0; i < n; i++) {
      this.smoke.spawn(p.x + rand(-1, 1), p.y + rand(0.3, 1.2), p.z + rand(-1, 1), rand(-2, 2), rand(1, 3), rand(-2, 2),
        rand(0.6, 1), 1.2, 3, C.smokeLight, C.smokeGrey, 0.6, -0.5, 2, 0, rand(-1, 1));
    }
  }

  _burstCoin(p) {
    // Note de musique: golden chime sparkles rising like a melody
    const C = this.C;
    const n = this._n(14);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(2, 5);
      this.add.spawn(p.x, p.y, p.z, Math.cos(a) * sp, rand(2, 6), Math.sin(a) * sp, rand(0.25, 0.45), rand(0.35, 0.55), 0.05, C.cream, C.gold, 1, 10, 1.5, Math.random() < 0.5 ? 1 : 0);
    }
    for (let i = 0; i < this._n(4); i++) this.add.spawn(p.x + rand(-0.4, 0.4), p.y + 0.3, p.z + rand(-0.4, 0.4), 0, rand(2.5, 4), 0, 0.6, 0.5, 0.2, C.white, C.mint, 0.9, 0, 2, 1, 0);
    this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.12, 2.2, 0.5, C.white, C.gold, 0.9, 0, 0, 0);
  }

  _burstSplash(p, opts) {
    const C = this.C;
    const s = finite(opts.scale, 1);
    for (let i = 0, n = this._n(40); i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(2, 6) * s;
      this.add.spawn(p.x, p.y + 0.2, p.z, Math.cos(a) * sp, rand(5, 11) * s, Math.sin(a) * sp,
        rand(0.5, 0.9), rand(0.25, 0.45) * s, 0.1, C.water, C.waterEnd, 0.8, 24, 0.5, 0);
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.spawn(p.x + Math.cos(a), p.y + 0.3, p.z + Math.sin(a), Math.cos(a) * 3, rand(1, 3), Math.sin(a) * 3,
        0.8, 1.2 * s, 3 * s, C.water, C.waterEnd, 0.5, 0, 2, 0, rand(-1, 1));
    }
    this._ring(p, 0.05, null, 0.4, 3.2 * s, 0.7, C.water, 0.8, 'ground', 0.2);
  }

  _burstLanding(p, opts) {
    const C = this.C;
    const k = opts.kart;
    const offroad = k?.surface === 'offroad';
    const col0 = offroad ? C.dust : C.smokeLight, col1 = offroad ? C.dustEnd : C.smokeGrey;
    const scl = finite(k?.object3D?.scale?.x, 1);
    const nl = this._n(16);
    for (let i = 0; i < nl; i++) {
      const a = (i / nl) * Math.PI * 2 + rand(-0.2, 0.2), sp = rand(4, 7);
      this.smoke.spawn(p.x + Math.cos(a) * 0.8, p.y + 0.15, p.z + Math.sin(a) * 0.8, Math.cos(a) * sp, rand(0.3, 1.2), Math.sin(a) * sp,
        rand(0.45, 0.75), 0.6 * scl, 2.2 * scl, col0, col1, 0.55, 0, 3.5, 0, rand(-1, 1));
    }
  }

  _burstSparks(p, opts) {
    const C = this.C;
    let inten = finite(opts.intensity, 0.5);
    if (inten > 2) inten /= 20;
    inten = Math.max(0.15, Math.min(1, inten));
    const n = this._n(Math.round((opts.small ? 6 : 10) + inten * (opts.small ? 14 : 28)));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = rand(0, 1), sp = rand(5, 13);
      const r = Math.sqrt(1 - u * u);
      this.add.spawn(p.x, p.y, p.z, Math.cos(a) * r * sp, u * sp + 2, Math.sin(a) * r * sp,
        rand(0.2, 0.45), rand(0.2, 0.35), 0.03, C.spark, C.sparkEnd, 1, 26, 1, 0);
    }
    this.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.1, 1.5 + inten * 2, 0.5, C.white, C.spark, 0.9, 0, 0, 0);
  }

  _burstMiniTurbo(p, opts) {
    const k = opts.kart;
    const lvl = Math.max(1, Math.min(3, finite(opts.level, 1) | 0));
    const col = this.driftCols[lvl], hot = this.driftHot[lvl];
    if (k) {
      this._kartForward(k, _fwd);
      _v.copy(k.position).addScaledVector(_fwd, -1.3); _v.y += 0.6;
      this._ring(_v, 0, k, 0.3, 1.5 + lvl * 0.3, 0.28, col, 0.9, 'kart', 0.3);
    } else {
      _v.copy(p); _v.y += 0.6;
    }
    this.add.spawn(_v.x, _v.y, _v.z, 0, 0, 0, 0.15, 4 + lvl, 2, hot, col, 1, 0, 0, 0);
    const vx = finite(k?.velocity?.x), vz = finite(k?.velocity?.z);
    for (let i = 0, n = this._n(16 + lvl * 8); i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(3, 8);
      this.add.spawn(_v.x, _v.y, _v.z, vx * 0.7 + Math.cos(a) * sp, rand(1, 6), vz * 0.7 + Math.sin(a) * sp,
        rand(0.25, 0.45), rand(0.3, 0.5), 0.05, hot, col, 1, 12, 2, Math.random() < 0.5 ? 1 : 0);
    }
  }

  // ------------------------------------------------------------------ fireballs / rings / stars
  _fireball(x, y, z, size, dur, set = this.fireSets.warm) {
    const f = this.fireballs[this.fireCursor];
    this.fireCursor = (this.fireCursor + 1) % this.fireballs.length;
    f.active = true; f.t = 0; f.dur = dur; f.size = size;
    const u = f.mat.uniforms;
    u.uC0.value.copy(set[0]); u.uC1.value.copy(set[1]); u.uC2.value.copy(set[2]);
    f.mesh.position.set(x, y, z);
    f.mesh.visible = true;
    f.mesh.scale.setScalar(0.01);
    f.mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
  }

  _updateFireballs(dt) {
    for (const f of this.fireballs) {
      if (!f.active) continue;
      f.t += dt;
      const life = f.t / f.dur;
      if (life >= 1) { f.active = false; f.mesh.visible = false; continue; }
      const grow = 1 - Math.pow(1 - Math.min(1, life * 2.5), 3);
      f.mesh.scale.setScalar(f.size * (0.25 + 0.85 * grow));
      f.mesh.position.y += dt * f.size * 0.6;
      f.mat.uniforms.uLife.value = life;
      f.mat.uniforms.uTime.value = this.time + f.seed;
    }
  }

  // mode 'ground' = flat on XZ; 'kart' = vertical ring facing the kart's forward, following it
  _ring(p, delay, kart, r0, r1, dur, color, opacity, mode, thick = 0.3) {
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    r.active = true; r.t = -delay; r.dur = dur; r.r0 = r0; r.r1 = r1; r.kart = kart; r.mode = mode; r.opacity = opacity;
    r.mat.uniforms.uColor.value.copy(color);
    r.mat.uniforms.uThick.value = thick;
    r.mat.uniforms.uOpacity.value = 0;
    r.mesh.position.copy(p);
    if (mode === 'ground') { r.mesh.position.y += 0.25; r.mesh.quaternion.setFromAxisAngle(_v2.set(1, 0, 0), -Math.PI / 2); }
    r.mesh.scale.setScalar(Math.max(0.001, r0));
    r.mesh.visible = false;
  }

  _updateRings(dt) {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      if (r.t < 0) continue;
      const f = r.t / r.dur;
      if (f >= 1) { r.active = false; r.mesh.visible = false; continue; }
      r.mesh.visible = true;
      const ease = 1 - Math.pow(1 - f, 3);
      r.mesh.scale.setScalar(Math.max(0.001, r.r0 + (r.r1 - r.r0) * ease));
      r.mat.uniforms.uOpacity.value = r.opacity * (1 - f);
      if (r.mode === 'kart' && r.kart?.position) {
        this._kartForward(r.kart, _fwd);
        r.mesh.position.copy(r.kart.position).addScaledVector(_fwd, -1.4 - f * 1.5);
        r.mesh.position.y += 0.8;
        r.mesh.quaternion.setFromUnitVectors(_zAxis, _fwd);
      }
    }
  }

  _updateStars(dt) {
    const mesh = this.starMesh;
    let any = false;
    for (let si = 0; si < this.starSlots.length; si++) {
      const slot = this.starSlots[si];
      const base = si * STARS_PER;
      if (!slot.active) continue;
      slot.t += dt;
      const k = slot.kart;
      if (slot.t >= slot.dur || !k?.position) {
        slot.active = false;
        _m.makeScale(0, 0, 0);
        for (let j = 0; j < STARS_PER; j++) mesh.setMatrixAt(base + j, _m);
        any = true;
        continue;
      }
      any = true;
      const f = slot.t / slot.dur;
      const pop = Math.min(1, slot.t * 6) * (f > 0.8 ? (1 - f) / 0.2 : 1);
      const kScale = finite(k.object3D?.scale?.x, 1);
      for (let j = 0; j < STARS_PER; j++) {
        const a = slot.t * 5 + (j / STARS_PER) * Math.PI * 2;
        const rad = 1.05 * kScale;
        _v.set(k.position.x + Math.cos(a) * rad, k.position.y + 2.1 * kScale + Math.sin(a * 2 + j) * 0.12, k.position.z + Math.sin(a) * rad);
        _e.set(0.25, -a + slot.t * 3, Math.sin(slot.t * 4 + j) * 0.3);
        _q.setFromEuler(_e);
        _s.setScalar(Math.max(0.001, pop * 1.1 * kScale));
        _m.compose(_v, _q, _s);
        mesh.setMatrixAt(base + j, _m);
      }
    }
    if (any) mesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ speed streaks
  _resetStreak(s, initial) {
    s.ang = Math.random() * Math.PI * 2;
    s.k = rand(0.55, 1.05);
    s.d = initial ? rand(3, 40) : rand(30, 45);
    s.len = rand(3, 8);
    s.w = rand(0.07, 0.16);
    s.spd = rand(40, 70);
    s.bright = rand(0.4, 1);
    s.r = 0;
  }

  _updateStreaks(dt, karts) {
    let player = null;
    if (karts) for (const k of karts) if (k?.isPlayer) { player = k; break; }
    let target = 0;
    if (player) {
      if (finite(player.boostTimer) > 0) target = this._state(player).bigBoost ? 1 : 0.7;
      if (finite(player.starTimer) > 0) { target = Math.max(target, 0.8); this.streakTint.copy(this.aurora[((this.time * 2) | 0) % this.aurora.length]); }
      if (finite(player.rocketTimer) > 0) target = 1;
      target = Math.max(target, this.streakKick);
      if (Math.abs(finite(player.speed)) < 8) target *= 0.3;
    }
    this.streakKick = Math.max(0, this.streakKick - dt * 2.5);
    let reduce = false;
    try { reduce = typeof window !== 'undefined' && !!window.__lumenReduceMotion; } catch (_) { reduce = false; }
    if (!this.speedLines || reduce) target = 0;
    const rate = target > this.streakIntensity ? 8 : 2.5;
    this.streakIntensity += (target - this.streakIntensity) * Math.min(1, dt * rate);
    this.streakMat.uniforms.uColor.value.copy(this.streakTint);
    const cam = this.camera;
    if (this.streakIntensity < 0.01 || !cam?.isPerspectiveCamera) { this.streakMesh.visible = false; return; }
    this.streakMesh.visible = true;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
    const aspect = finite(cam.aspect, 1.6);
    const P = this.streakPos, A = this.streakAlpha;
    const I = this.streakIntensity;
    for (let i = 0; i < this.streakCount; i++) {
      const s = this.streaks[i];
      s.d -= s.spd * dt * (0.6 + I * 0.6);
      if (s.d < 1.0) this._resetStreak(s, false);
      if (!s.r) s.r = s.k * 34 * tanHalf; // fixed radius at a reference depth -> streaks flow outward
      const cx = Math.cos(s.ang) * s.r * aspect * 0.75, cy = Math.sin(s.ang) * s.r;
      // tangent in view plane
      const tx = -Math.sin(s.ang) * s.w, ty = Math.cos(s.ang) * s.w;
      const zh = -s.d, zt = -(s.d + s.len);
      const v = i * 12;
      P[v] = cx + tx; P[v + 1] = cy + ty; P[v + 2] = zh;
      P[v + 3] = cx - tx; P[v + 4] = cy - ty; P[v + 5] = zh;
      P[v + 6] = cx + tx; P[v + 7] = cy + ty; P[v + 8] = zt;
      P[v + 9] = cx - tx; P[v + 10] = cy - ty; P[v + 11] = zt;
      // fade in from distance, fade near camera
      const fadeFar = Math.min(1, (45 - s.d) / 12);
      const fadeNear = Math.min(1, (s.d - 1) / 4);
      const a = I * s.bright * 0.4 * Math.max(0, fadeFar) * Math.max(0, fadeNear);
      const a4 = i * 4;
      A[a4] = a; A[a4 + 1] = a; A[a4 + 2] = 0; A[a4 + 3] = 0;
    }
    this.aStreakPos.needsUpdate = true;
    this.aStreakAlpha.needsUpdate = true;
  }

  // ------------------------------------------------------------------ lifecycle
  clear() {
    this.add.clear(); this.smoke.clear(); this.chunks.clear();
    for (const f of this.fireballs) { f.active = false; f.mesh.visible = false; }
    for (const r of this.rings) { r.active = false; r.mesh.visible = false; }
    for (const s of this.starSlots) s.active = false;
  }

  dispose() {
    for (const u of this.unsubs) { try { u(); } catch (_) { /* ignore */ } }
    this.unsubs.length = 0;
    this.scene?.remove(this.group);
    this.add.dispose(); this.smoke.dispose(); this.chunks.dispose();
    this.fireGeo.dispose(); for (const f of this.fireballs) f.mat.dispose();
    this.ringGeo.dispose(); for (const r of this.rings) r.mat.dispose();
    this.starGeo.dispose(); this.starMat.dispose(); this.starMesh.dispose?.();
    this.streakGeo.dispose(); this.streakMat.dispose();
    this.glowTex.dispose(); this.smokeTex.dispose();
    this.kartState.clear();
  }
}
