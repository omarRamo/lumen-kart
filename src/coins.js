// Coins: lines of spinning coins on the road. Each coin gives a tiny boost and +1 coin (max 10); every coin
// held raises the kart's top speed a little. Getting hit spills coins, which pop out of the kart.
import * as THREE from 'three';
import { bus } from './events.js';
import { createItemModel } from './models.js';

const RESPAWN = 14;
const PICK = 1.1;

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
    for (const p of track?.coinPositions || []) {
      const m = createItemModel('coin');
      m.position.copy(p);
      this.group.add(m);
      this.coins.push({ base: p.clone(), mesh: m, active: true, timer: 0, phase: Math.random() * 6 });
    }
    this._off = bus.on('kart:coinLoss', (d) => this._spill(d));
  }

  _spill(d) {
    if (!d || !d.position) return;
    const n = Math.min(5, d.n || 1);
    for (let i = 0; i < n; i++) {
      let s = this.spills.find((x) => !x.alive);
      if (!s) {
        if (this.spills.length > 30) break;
        s = { mesh: createItemModel('coin'), vel: new THREE.Vector3(), alive: false, t: 0 };
        this.group.add(s.mesh);
        this.spills.push(s);
      }
      const a = Math.random() * Math.PI * 2;
      s.alive = true; s.t = 0; s.mesh.visible = true;
      s.mesh.position.copy(d.position).add(new THREE.Vector3(0, 1.2, 0));
      s.vel.set(Math.cos(a) * (3 + Math.random() * 3), 7 + Math.random() * 4, Math.sin(a) * (3 + Math.random() * 3));
      s.mesh.scale.setScalar(0.8);
    }
  }

  update(dt) {
    if (!(dt > 0)) return;
    this.time += dt;
    const t = this.time;
    for (const c of this.coins) {
      if (!c.active) {
        c.timer -= dt;
        if (c.timer <= 0) { c.active = true; c.mesh.visible = true; c.mesh.scale.setScalar(0.01); }
        continue;
      }
      const sc = Math.min(1, c.mesh.scale.x + dt * 3);
      c.mesh.scale.setScalar(sc);
      c.mesh.rotation.y = t * 3 + c.phase;
      c.mesh.position.y = c.base.y + Math.sin(t * 3 + c.phase) * 0.15;
      for (const k of this.karts) {
        if (!k || !k.position || k.fallTimer > 0 || k.respawnTimer > 0) continue;
        const dx = k.position.x - c.base.x, dz = k.position.z - c.base.z, dy = k.position.y + 0.6 - c.base.y;
        const r = (k.radius || 1.3) + PICK;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < 2.4) {
          c.active = false; c.timer = RESPAWN; c.mesh.visible = false;
          k.addCoins?.(1);
          if ((k.boostTimer || 0) <= 0) k.applyBoost?.(0.18, 0.4, 'coin');
          bus.emit('coin:pickup', { kart: k, position: c.base });
          break;
        }
      }
    }
    for (const s of this.spills) {
      if (!s.alive) continue;
      s.t += dt;
      s.vel.y -= 30 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.y += dt * 14;
      if (s.t > 0.7) s.mesh.scale.setScalar(Math.max(0.01, 0.8 * (1 - (s.t - 0.7) / 0.3)));
      if (s.t > 1.0) { s.alive = false; s.mesh.visible = false; }
    }
  }

  dispose() {
    this._off?.();
    this.scene.remove(this.group);
    this.coins.length = 0;
    this.spills.length = 0;
  }
}
