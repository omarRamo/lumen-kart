// Notes (internal id "coin"): golden music notes ♪ floating over the road. Each note gives a tiny boost and
// +1 note (max 10); every note held raises the kart's top speed a little. Getting hit spills notes, which pop
// out of the kart. Rendering is one InstancedMesh for every note (road + spilled) plus one Points burst pool
// for the pickup sparkle: 2 draw calls whatever the number of notes. No allocation in update().
// API (unchanged): new CoinSystem({ scene, track, karts }); update(dt); dispose().
import * as THREE from 'three';
import { bus } from './events.js';

const RESPAWN = 14;
const PICK = 1.1;
const SPILL_MAX = 30;
const SPARK_MAX = 160;

/** Eighth-note (♪) geometry: oval head + stem + flag, extruded and bevelled, centred on its middle. */
export function createNoteGeometry() {
  const head = new THREE.Shape();
  const hx = 0, hy = 0, rx = 0.36, ry = 0.27, rot = -0.38;
  for (let k = 0; k <= 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    const px = hx + x * Math.cos(rot) - y * Math.sin(rot), py = hy + x * Math.sin(rot) + y * Math.cos(rot);
    if (k === 0) head.moveTo(px, py); else head.lineTo(px, py);
  }
  const stem = new THREE.Shape();
  stem.moveTo(0.22, 0.08); stem.lineTo(0.34, 0.06); stem.lineTo(0.34, 1.32); stem.lineTo(0.22, 1.32); stem.closePath();
  const flag = new THREE.Shape();
  flag.moveTo(0.22, 1.32);
  flag.bezierCurveTo(0.34, 1.12, 0.78, 1.02, 0.66, 0.56);
  flag.bezierCurveTo(0.62, 0.5, 0.6, 0.52, 0.62, 0.6);
  flag.bezierCurveTo(0.68, 0.92, 0.42, 1.0, 0.3, 1.06);
  flag.lineTo(0.3, 1.32);
  flag.closePath();
  const g = new THREE.ExtrudeGeometry([head, stem, flag], { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
  g.computeBoundingBox();
  const bb = g.boundingBox;
  g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  g.scale(1.25, 1.25, 1.25);
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

export class CoinSystem {
  constructor({ scene, track, karts }) {
    this.scene = scene;
    this.karts = karts || [];
    this.group = new THREE.Group();
    this.group.name = 'coins';
    scene.add(this.group);
    this.coins = [];
    this.spills = [];
    this.time = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._e = new THREE.Euler();

    const positions = track?.coinPositions || [];
    this.geo = createNoteGeometry();
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffcf5a, emissive: 0xb87a10, emissiveIntensity: 0.65, metalness: 0.55, roughness: 0.28 });
    const cap = positions.length + SPILL_MAX;
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, cap));
    this.mesh.name = 'notes';
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;   // instances move every frame; bounds would be stale
    this.mesh.count = cap;
    this.group.add(this.mesh);

    positions.forEach((p, i) => {
      // deterministic phase so every client sees the same bob
      this.coins.push({ base: p.clone(), index: i, active: true, timer: 0, scale: 1, phase: (i * 2.399) % 6.28 });
    });
    for (let i = 0; i < SPILL_MAX; i++) {
      this.spills.push({ index: positions.length + i, pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: false, t: 0, spin: 0 });
    }
    for (let i = 0; i < cap; i++) this._write(i, null, 0, 0);

    // pickup sparkle: four-point stars that burst and fade
    this.sparkPos = new Float32Array(SPARK_MAX * 3);
    this.sparkVel = new Float32Array(SPARK_MAX * 3);
    this.sparkLife = new Float32Array(SPARK_MAX);
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setAttribute('life', new THREE.BufferAttribute(this.sparkLife, 1).setUsage(THREE.DynamicDrawUsage));
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xfff2b8) } },
      vertexShader: /* glsl */`
        attribute float life; varying float vLife;
        void main() {
          vLife = life;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = life > 0.0 ? (0.5 + life) * (220.0 / max(1.0, -mv.z)) : 0.0;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vLife;
        void main() {
          vec2 d = abs(gl_PointCoord - 0.5) * 2.0;
          float star = max(1.0 - (d.x * 4.0 + d.y * 0.6), 1.0 - (d.y * 4.0 + d.x * 0.6));
          float core = 1.0 - length(gl_PointCoord - 0.5) * 3.0;
          float a = clamp(max(star, core), 0.0, 1.0) * clamp(vLife * 1.6, 0.0, 1.0);
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColor * 1.4, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.sparks = new THREE.Points(this.sparkGeo, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.name = 'noteSparkles';
    this.sparks.renderOrder = 6;
    this.group.add(this.sparks);
    this._sparkHead = 0;
    this._sparkAlive = 0;

    this._off = bus.on('kart:coinLoss', (d) => this._spill(d));
  }

  _write(index, pos, rotY, scale) {
    const m = this._m;
    if (!pos || scale <= 0.001) {
      m.makeScale(0, 0, 0);
    } else {
      this._q.setFromEuler(this._e.set(0, rotY, 0));
      this._s.setScalar(scale);
      m.compose(pos, this._q, this._s);
    }
    this.mesh.setMatrixAt(index, m);
  }

  _burst(position) {
    for (let k = 0; k < 12; k++) {
      const i = this._sparkHead; this._sparkHead = (this._sparkHead + 1) % SPARK_MAX;
      const a = (k / 12) * Math.PI * 2, up = 0.3 + ((k * 7) % 5) * 0.25;
      this.sparkPos[i * 3] = position.x; this.sparkPos[i * 3 + 1] = position.y + 0.3; this.sparkPos[i * 3 + 2] = position.z;
      this.sparkVel[i * 3] = Math.cos(a) * 4.2; this.sparkVel[i * 3 + 1] = 2.5 + up * 3; this.sparkVel[i * 3 + 2] = Math.sin(a) * 4.2;
      this.sparkLife[i] = 0.75 + (k % 3) * 0.12;
    }
    this._sparkAlive = 1.2;
  }

  _spill(d) {
    if (!d || !d.position) return;
    const n = Math.min(5, d.n || 1);
    for (let i = 0; i < n; i++) {
      const s = this.spills.find((x) => !x.alive);
      if (!s) break;
      const a = Math.random() * Math.PI * 2;
      s.alive = true; s.t = 0; s.spin = Math.random() * 6;
      s.pos.copy(d.position); s.pos.y += 1.2;
      s.vel.set(Math.cos(a) * (3 + Math.random() * 3), 7 + Math.random() * 4, Math.sin(a) * (3 + Math.random() * 3));
    }
  }

  update(dt) {
    if (!(dt > 0)) return;
    this.time += dt;
    const t = this.time;
    for (const c of this.coins) {
      if (!c.active) {
        c.timer -= dt;
        if (c.timer <= 0) { c.active = true; c.scale = 0.01; }
        else { this._write(c.index, null, 0, 0); continue; }
      }
      c.scale = Math.min(1, c.scale + dt * 3);
      const p = this._p.copy(c.base);
      p.y += 0.25 + Math.sin(t * 2.6 + c.phase) * 0.18;
      this._write(c.index, p, t * 2.2 + c.phase, c.scale);
      for (const k of this.karts) {
        if (!k || !k.position || k.fallTimer > 0 || k.respawnTimer > 0) continue;
        const dx = k.position.x - c.base.x, dz = k.position.z - c.base.z, dy = k.position.y + 0.6 - c.base.y;
        const r = (k.radius || 1.3) + PICK;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < 2.4) {
          c.active = false; c.timer = RESPAWN;
          this._write(c.index, null, 0, 0);
          k.addCoins?.(1);
          if ((k.boostTimer || 0) <= 0) k.applyBoost?.(0.18, 0.4, 'coin');
          bus.emit('coin:pickup', { kart: k, position: c.base });
          this._burst(c.base);
          break;
        }
      }
    }
    for (const s of this.spills) {
      if (!s.alive) continue;
      s.t += dt;
      s.vel.y -= 30 * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.spin += dt * 14;
      const sc = s.t > 0.7 ? Math.max(0.01, 0.8 * (1 - (s.t - 0.7) / 0.3)) : 0.8;
      if (s.t > 1.0) { s.alive = false; this._write(s.index, null, 0, 0); continue; }
      this._write(s.index, s.pos, s.spin, sc);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // sparkles
    if (this._sparkAlive > 0) {
      this._sparkAlive -= dt;
      for (let i = 0; i < SPARK_MAX; i++) {
        if (this.sparkLife[i] <= 0) continue;
        this.sparkLife[i] = Math.max(0, this.sparkLife[i] - dt * 1.3);
        this.sparkVel[i * 3 + 1] -= 9 * dt;
        this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
        this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
        this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      }
      this.sparkGeo.attributes.position.needsUpdate = true;
      this.sparkGeo.attributes.life.needsUpdate = true;
    }
  }

  dispose() {
    this._off?.();
    this.scene.remove(this.group);
    this.mesh.dispose();
    this.geo.dispose(); this.mat.dispose();
    this.sparkGeo.dispose(); this.sparkMat.dispose();
    this.coins.length = 0;
    this.spills.length = 0;
  }
}
