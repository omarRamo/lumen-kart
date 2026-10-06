// Host-authoritative simulation transport. Guests render snapshots and send controls only.
import * as THREE from 'three';
import { buildItemVisual } from './items.js';

const FIELDS = ['heading', 'speed', 'trackT', 'lap', 'place', 'raceProgress', 'finished', 'finishTime',
  'boostTimer', 'starTimer', 'shrinkTimer', 'spinTimer', 'drifting', 'driftDir', 'driftLevel',
  'driftCharge', 'airborne', 'item', 'itemCount', 'controlsLocked', 'spinDuration', 'hitKind', 'steerSmoothed', 'radius', 'hopY', 'respawnTimer', 'respawnInvuln'];

export function snapshotWorld(w, state) {
  return {
    state, time: w.ctx.time, phase: w.race.phase, raceTime: w.race.raceTime,
    countdownValue: w.race.countdownValue, ended: w.race.ended,
    karts: w.karts.map(k => ({
      ...Object.fromEntries(FIELDS.map(key => [key, k[key]])),
      position: k.position.toArray(), velocity: k.velocity.toArray(), normal: k.groundNormal.toArray(), lapTimes: k.lapTimes,
    })),
    boxes: w.items?.boxes.map(b => b.active) || [],
    entities: w.items?.entities.filter(e => !e.dead).map((e, i) => ({
      id: i, type: e.type, position: e.holder.position.toArray(), rotation: e.holder.rotation.toArray().slice(0, 3), scale: e.holder.scale.toArray(),
    })) || [],
    results: w.race.ended ? w.race.computeResults().map(r => ({
      index: r.kart.index, place: r.place, time: r.time, estimated: r.estimated, bestLap: r.bestLap,
    })) : null,
  };
}

export class SnapshotRenderer {
  constructor(world, bus) {
    this.world = world;
    this.bus = bus;
    this.target = null;
    this.entities = new Map();
    this.lastCountdown = null;
    this.finished = false;
    this.finalLap = false;
  }
  accept(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.karts) || snapshot.karts.length !== this.world.karts.length) return false;
    if (!snapshot.karts.every(k => Array.isArray(k.position) && k.position.length === 3 && k.position.every(Number.isFinite)
      && Array.isArray(k.velocity) && k.velocity.length === 3 && k.velocity.every(Number.isFinite))) return false;
    this.target = snapshot;
    const w = this.world;
    w.race.phase = snapshot.phase;
    w.race.raceTime = snapshot.raceTime;
    w.race.countdownValue = snapshot.countdownValue;
    w.race.ended = !!snapshot.ended;
    w.ctx.time = snapshot.time;
    snapshot.karts.forEach((s, i) => {
      const k = w.karts[i];
      for (const key of FIELDS) if (key in s) k[key] = s[key];
      k.velocity.fromArray(s.velocity);
      if (s.normal?.length === 3) k.groundNormal.fromArray(s.normal);
      k.time = snapshot.time;
      k.model?.setShrunk(k.shrinkTimer > 0 ? 0.6 : 1);
      k.lapTimes = s.lapTimes || [];
    });
    w.race.standings = [...w.karts].sort((a, b) => a.place - b.place);
    if (snapshot.countdownValue !== this.lastCountdown) {
      this.lastCountdown = snapshot.countdownValue;
      if (snapshot.countdownValue === 'GO') this.bus.emit('race:go', {});
      else if (typeof snapshot.countdownValue === 'number') this.bus.emit('race:countdown', { n: snapshot.countdownValue });
    }
    if (!this.finalLap && w.player.lap === w.laps && w.laps > 1) {
      this.finalLap = true; this.bus.emit('race:finalLap', {});
    }
    if (w.player.finished && !this.finished) {
      this.finished = true;
      this.bus.emit('race:finish', { kart: w.player, place: w.player.place, time: w.player.finishTime });
    }
    w.items?.boxes.forEach((b, i) => { b.active = !!snapshot.boxes?.[i]; b.holder.visible = b.active; });
    this.syncEntities(snapshot.entities || []);
    return true;
  }
  syncEntities(entities) {
    const live = new Set();
    for (const entity of entities.slice(0, 64)) {
      if (!['banana', 'green_shell', 'red_shell', 'blue_shell'].includes(entity.type)) continue;
      const key = `${entity.id}:${entity.type}`;
      live.add(key);
      let model = this.entities.get(key);
      if (!model) {
        model = buildItemVisual(entity.type);
        this.entities.set(key, model);
        this.world.scene.add(model);
      }
      model.position.fromArray(entity.position);
      model.rotation.set(...entity.rotation);
      if (entity.scale?.length === 3) model.scale.fromArray(entity.scale);
    }
    for (const [key, model] of this.entities) if (!live.has(key)) {
      model.removeFromParent(); this.entities.delete(key);
    }
  }
  update(dt) {
    if (!this.target) return;
    const alpha = 1 - Math.exp(-dt * 20);
    this.target.karts.forEach((s, i) => {
      const k = this.world.karts[i];
      const p = new THREE.Vector3().fromArray(s.position);
      if (k.position.distanceToSquared(p) > 400) k.position.copy(p);
      else k.position.lerp(p, alpha);
      k.object3D.rotation.y = k.heading;
      k._animate?.(dt, 0, Math.abs(k.speed) > 1 ? 1 : 0);
    });
  }
  results() {
    return this.target?.results?.map(r => {
      const kart = this.world.karts[r.index];
      return { ...r, kart, character: kart.character, name: kart.character.name, isPlayer: kart.isPlayer };
    });
  }
  dispose() {
    for (const model of this.entities.values()) model.removeFromParent();
    this.entities.clear();
  }
}
