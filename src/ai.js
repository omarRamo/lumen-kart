// AI driver: racing-line pursuit with PD steering, curvature-aware speed control, drift mini-turbos,
// lane personalities, hazard/kart avoidance, tactical item use, rubber-banding and stuck recovery.
import * as THREE from 'three';
import { DIFFICULTY, PHYSICS, normalizeDifficulty } from './config.js';
import { bus } from './events.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v) => Number.isFinite(v);
const wrap01 = (t) => ((t % 1) + 1) % 1;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const _tan = new THREE.Vector3();
const _pt = new THREE.Vector3();

// Per-character racing personalities (CHARACTERS[i].id). Values are blended with a little randomness so two
// races never look identical. style is informative (HUD/debug); the numbers drive behaviour:
//   aggression 0..1  -> how eagerly items are fired       driftLove 0..1 -> how often corners are drifted
//   driftLevel       -> mini-turbo stage aimed for (3 = comet violet)
//   caution          -> corner speed margin (>1 brakes later)   lookMul -> steering look-ahead
//   bumper 0..1      -> leans into karts alongside (heavy karts)  boxSeek 0..1 -> detours to grab light prisms
//   sniper           -> fires seeds/fireflies from further away  reaction -> item reaction time multiplier
//   pace             -> tiny top-speed offset (rival flavour, ±1 %)
export const PERSONALITIES = {
  lumen:   { style: 'balanced',    aggression: 0.5,  driftLove: 0.75, laneWeave: 0.15, boxSeek: 0.45, caution: 1.0 },
  zina:    { style: 'drift-master', aggression: 0.35, driftLove: 1.0, driftLevel: 3, lookMul: 1.05, caution: 1.03, boxSeek: 0.3 },
  pip:     { style: 'opportunist', aggression: 0.7,  driftLove: 0.6,  laneWeave: 0.26, boxSeek: 1.0, reaction: 0.7 },
  coralie: { style: 'careful',     aggression: 0.25, driftLove: 0.55, laneWeave: 0.1, caution: 0.96, hazardSight: 0.25, boxSeek: 0.5 },
  rivo:    { style: 'nervous',     aggression: 0.55, driftLove: 0.85, laneWeave: 0.32, laneFreqMul: 1.8, boxSeek: 0.6, reaction: 0.8 },
  jagu:    { style: 'speedster',   aggression: 0.45, driftLove: 0.7,  lookMul: 1.1, caution: 1.07, pace: 0.006, boxSeek: 0.3 },
  kibo:    { style: 'bumper',      aggression: 0.6,  driftLove: 0.5,  bumper: 1.0, laneWeave: 0.12, boxSeek: 0.4 },
  nox:     { style: 'aggressive',  aggression: 1.0,  driftLove: 0.85, sniper: true, reaction: 0.5, pace: 0.01, boxSeek: 0.7 },
};

export class AIDriver {
  constructor(kart, track, { difficulty = 'medium', personality = null } = {}) {
    this.kart = kart;
    this.track = track;
    this.difficulty = normalizeDifficulty(difficulty);
    this.cfg = DIFFICULTY[this.difficulty];
    this.skill = clamp(this.cfg.aiSkill ?? 0.75, 0, 1);

    const r = () => Math.random();
    const base = PERSONALITIES[kart?.character?.id] || null;
    const p = { ...(base || {}), ...(personality || {}) };
    this.personality = p;
    this.style = p.style || 'random';
    const jitter = (v, amt) => clamp(v + (r() - 0.5) * amt, 0, 1);
    // Personality: preferred lane, how much it weaves, aggression with items, drift love, look-ahead.
    this.laneBias = p.laneBias ?? (r() * 2 - 1) * 0.6;          // fraction of half road width
    this.laneWeave = p.laneWeave !== undefined ? p.laneWeave * (0.85 + r() * 0.3) : 0.12 + r() * 0.2;
    this.laneFreq = (0.04 + r() * 0.07) * (p.laneFreqMul || 1);
    this.lanePhase = r() * Math.PI * 2;
    this.aggression = p.aggression !== undefined ? jitter(p.aggression, 0.15) : r();
    // 50cc AIs are softer item users; 150cc+ AIs fight
    this.aggression *= 0.55 + 0.45 * this.skill;
    if (p.aggression >= 0.95) this.aggression = Math.max(this.aggression, 0.75);
    this.driftLove = clamp(p.driftLove !== undefined ? p.driftLove * (0.75 + 0.35 * this.skill) : (this.skill + (r() - 0.5) * 0.35), 0.1, 1);
    this.lookMul = (p.lookMul ?? 1) * (0.92 + r() * 0.16);
    this.caution = (p.caution ?? 1) * (0.94 + r() * 0.1);
    this.reaction = (0.15 + (1 - this.skill) * 0.6 + r() * 0.3) * (p.reaction ?? 1);
    this.noiseAmp = (1 - this.skill) * 0.12 * (p.laneFreqMul ? 1.4 : 1);
    this.bumper = clamp(p.bumper ?? 0, 0, 1);
    this.boxSeek = clamp(p.boxSeek ?? 0.4, 0, 1);
    this.sniper = !!p.sniper;
    this.hazardSight = clamp(this.skill + (p.hazardSight ?? 0), 0, 1);
    this.pace = fin(p.pace) ? p.pace : 0;
    this._rb = null;

    this.time = r() * 100;
    this.prevErr = 0;
    this.stuckTime = 0;
    this.reverseTime = 0;
    this.recoveries = [];
    this.wrongWayTime = 0;
    this.driftCooldown = 0;
    this.driftOppositeTime = 0;
    this.fixedDriftLevel = p.driftLevel || 0;
    this.driftTargetLevel = this.fixedDriftLevel || 2 + (r() < this.skill ? 1 : 0);
    this.itemHoldTime = 0;
    this.itemCooldown = 0;
    this.lastItem = null;
    this.avoidOffset = 0;
    this.lastProgress = null;
    this.progressTimer = 0;

    this._unsubs = [
      bus.on('race:go', () => {
        // Random rocket starts by skill.
        if (!this.kart) return;
        if (Math.random() < this.skill * 0.8) {
          const strong = Math.random() < this.skill;
          const delay = Math.random() * 0.15;
          this._startBoost = { delay, strong };
        }
      }),
    ];
  }

  _neutral() {
    const inp = this.kart.input || (this.kart.input = {});
    inp.throttle = 0; inp.brake = 0; inp.steer = 0; inp.drift = false; inp.item = false; inp.itemHeld = false; inp.lookBack = false;
    return inp;
  }

  update(dt, ctx = {}) {
    const kart = this.kart, track = this.track;
    if (!kart || !track || !(dt > 0)) return;
    try {
      this._update(Math.min(dt, 0.05), ctx || {});
    } catch (err) {
      if (!this._warned) { console.error('[ai] update failed', err); this._warned = true; }
      this._neutral();
    }
  }

  _update(dt, ctx) {
    const kart = this.kart, track = this.track;
    this.time += dt;
    if (this._startBoost) {
      this._startBoost.delay -= dt;
      if (this._startBoost.delay <= 0) {
        const { strong } = this._startBoost;
        kart.applyBoost?.(strong ? 1.2 : 0.6, strong ? 1 : 0.7, 'start');
        this._startBoost = null;
      }
    }
    const inp = this._neutral();
    if (kart.controlsLocked && !kart.finished) { this.stuckTime = 0; this.prevErr = 0; return; }

    const L = Math.max(100, track.length || 1000);
    const halfW = (track.roadWidth || 24) / 2;
    const t = wrap01(kart.trackT || 0);
    const speed = kart.speed || 0;
    const absSpeed = Math.abs(speed);
    const heading = kart.heading;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const disabled = kart.spinTimer > 0 || kart.respawnTimer > 0 || kart.stallTimer > 0;

    // ---- rubber band / speed scaling
    this._rubberBand(ctx, dt);

    // ---- course geometry
    const tanNow = this._tangent(t);
    const courseDot = fx * tanNow.x + fz * tanNow.z;
    const cornerNear = this._cornerAngle(t, 5, 5 + Math.max(20, absSpeed * 0.9));
    const cornerFar = this._cornerAngle(t, 10, 10 + Math.max(35, absSpeed * 1.6));
    const cornerMag = Math.max(Math.abs(cornerNear), Math.abs(cornerFar) * 0.8);

    // ---- lane selection
    let lane = this.laneBias * halfW * 0.55 + Math.sin(this.time * this.laneFreq * Math.PI * 2 + this.lanePhase) * halfW * this.laneWeave;
    lane *= 1 - clamp(cornerMag / 1.2, 0, 0.75); // tighten toward the racing line in corners
    // opportunists detour through light prisms (item boxes) when empty-handed
    const seek = this._boxLane(ctx, t, L, halfW, dt);
    if (seek !== null) lane += (seek - lane) * this.boxSeek * (1 - clamp(cornerMag / 1.2, 0, 0.7));
    const avoid = this._avoidance(ctx, t, L, halfW, lane);
    this.avoidOffset += (avoid - this.avoidOffset) * (1 - Math.exp(-6 * dt));
    lane = clamp(lane + this.avoidOffset, -halfW * 0.8, halfW * 0.8);

    // ---- look-ahead target
    const look = (7 + absSpeed * 0.42) * this.lookMul;
    const tA = wrap01(t + look / L);
    const target = this._racingPoint(tA, _pt);
    const tanA = this._tangent(tA);
    // right vector at tA: (-tz, 0, tx). Keep the final target on the paved road.
    let lineLat = 0;
    try {
      const c = track.getPointAt(tA);
      if (c && fin(c.x)) lineLat = (target.x - c.x) * -tanA.z + (target.z - c.z) * tanA.x;
    } catch { lineLat = 0; }
    const edge = Math.max(1, halfW - 2.2);
    const totalLat = clamp(lineLat + lane, -edge, edge);
    const shift = totalLat - lineLat;
    target.x += -tanA.z * shift;
    target.z += tanA.x * shift;

    const dx = target.x - kart.position.x, dz = target.z - kart.position.z;
    const desired = Math.atan2(dx, dz);
    let err = wrapAngle(desired - heading); // + = target is to the left (heading must increase)
    err += Math.sin(this.time * 1.7 + this.lanePhase) * this.noiseAmp * 0.2;
    const dErr = (err - this.prevErr) / dt;
    this.prevErr = err;

    // steer + = right (heading decreasing), so steer = -err
    let steer = clamp(-(err * 2.8) - clamp(dErr, -8, 8) * 0.06, -1, 1);

    // ---- speed control from upcoming curvature
    let throttle = 1, brake = 0;
    const turnRate = kart.stats?.turnRate || 2;
    const dist = Math.max(20, absSpeed * 0.9);
    const kappa = Math.abs(cornerNear) / dist;
    if (kappa > 1e-4) {
      const drifting = kart.drifting;
      const vAllowed = (turnRate * (drifting ? 1.05 : 0.9) / kappa) * this.caution * (0.85 + this.skill * 0.25);
      if (absSpeed > vAllowed + 4) throttle = 0.2;
      if (absSpeed > vAllowed + 10) { throttle = 0; brake = 0.6; }
    }
    // Big heading error (e.g. after a hit): ease off so we can turn
    if (Math.abs(err) > 1.2 && absSpeed > 14) { throttle = 0.3; }

    // ---- drifting
    this.driftCooldown -= dt;
    let drift = false;
    if (kart.drifting) {
      drift = true;
      const dir = kart.driftDir;
      // While drifting the nose points inside the travel direction, so steer on the velocity heading:
      // desired yaw rate -> how hard to steer into / out of the drift.
      const vx = kart.velocity.x, vz = kart.velocity.z;
      const velHeading = Math.hypot(vx, vz) > 3 ? Math.atan2(vx, vz) : heading;
      const errV = wrapAngle(desired - velHeading);
      const turnRateNow = Math.max(0.5, (kart.stats?.turnRate || 2) * 1.08 * (1 - 0.16 * clamp(absSpeed / (kart.stats?.maxSpeed || 38), 0, 1)));
      const wantYaw = -errV * 3.2 + (-cornerNear / Math.max(0.6, dist / Math.max(8, absSpeed))); // + = right
      const latK = kart.lateral || 0;
      const edgeK = clamp((Math.abs(latK) - halfW * 0.7) / (halfW * 0.3), 0, 1);
      const wantYawAdj = wantYaw - Math.sign(latK) * edgeK * 0.9;
      const into = ((wantYawAdj * dir) / turnRateNow - 0.62) / 0.5;
      steer = clamp(into, -1, 1) * dir;
      if (into < -1.6) this.driftOppositeTime += dt; else this.driftOppositeTime = Math.max(0, this.driftOppositeTime - dt);
      const nextTh = PHYSICS.driftChargeThresholds?.[kart.driftLevel];
      const almost = nextTh !== undefined && nextTh - (kart.driftCharge || 0) < 0.3 * this.skill;
      const cornerEnding = Math.abs(cornerNear) < 0.12 && Math.abs(errV) < 0.15 && !almost;
      const reason = this.driftOppositeTime > 0.35 ? 'opposite' : cornerEnding ? 'ending' : kart.driftTime > 4.5 ? 'long'
        : (kart.driftLevel >= this.driftTargetLevel && Math.abs(cornerNear) < 0.3) ? 'charged' : kart.surface === 'offroad' ? 'offroad'
        : (Math.abs(kart.lateral || 0) > halfW * 0.82 && Math.sign(kart.lateral || 0) === -dir) ? 'edge' : null;
      if (reason) {
        this.lastDriftRelease = reason;
        drift = false;
        this.driftCooldown = 0.35 + (1 - this.skill) * 0.5;
      }
    } else if (!(this._driftAttempt > 0) && this.driftCooldown <= 0 && !disabled && !kart.airborne && absSpeed > 18 &&
      Math.abs(cornerFar) > 0.55 - this.driftLove * 0.15 && Math.sign(cornerFar) === Math.sign(-steer || cornerFar) &&
      absSpeed * Math.abs(cornerFar) / Math.max(35, absSpeed * 1.6) > (kart.stats?.turnRate || 2) * 0.2 &&
      Math.abs(steer) > 0.2) {
      // Decide once per corner entry
      if (Math.random() < this.driftLove * 0.9 + 0.05) {
        drift = true;
        this._driftAttempt = 0.5;
        this._driftSteerDir = cornerFar > 0 ? -1 : 1;
        this.driftTargetLevel = this.fixedDriftLevel || (Math.random() < this.skill ? 3 : 2);
      } else {
        this.driftCooldown = 1.0;
      }
    }
    // Hold drift through the hop and until the kart commits to the drift direction
    if (kart.drifting) this._driftAttempt = 0;
    else if (this._driftAttempt > 0) {
      this._driftAttempt -= dt;
      drift = true;
      if (Math.abs(steer) < 0.35 || Math.sign(steer) !== this._driftSteerDir) steer = this._driftSteerDir * 0.6;
      if (this._driftAttempt <= 0 || disabled) { drift = false; this._driftAttempt = 0; this.driftCooldown = 0.6; }
    }

    // ---- wrong-way / stuck recovery
    if (courseDot < -0.3 && !disabled) this.wrongWayTime += dt; else this.wrongWayTime = Math.max(0, this.wrongWayTime - dt);
    if (!disabled && !kart.airborne && this.reverseTime <= 0 && absSpeed < 2.5 && throttle > 0) this.stuckTime += dt;
    else if (absSpeed > 5) this.stuckTime = 0;

    // Progress watchdog: no track progress for a long time -> respawn
    this.progressTimer += dt;
    if (this.progressTimer > 4) {
      const prog = t;
      if (this.lastProgress !== null && !kart.finished) {
        let dp = prog - this.lastProgress;
        dp -= Math.round(dp);
        if (dp < 8 / L && !disabled && !kart.controlsLocked) this._forceRespawn();
      }
      this.lastProgress = prog;
      this.progressTimer = 0;
    }

    if (this.stuckTime > 1.1) {
      this.stuckTime = 0;
      this.reverseTime = 0.9;
      this.recoveries.push(this.time);
    }
    this.recoveries = this.recoveries.filter((x) => this.time - x < 12);
    if (this.recoveries.length >= 3 || this.wrongWayTime > 7) {
      this.recoveries.length = 0;
      this.wrongWayTime = 0;
      this._forceRespawn();
    }
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      throttle = 0; brake = 1; drift = false;
      // reversing flips yaw direction; steer so the nose swings toward the target
      steer = clamp(err * 3, -1, 1);
    }

    inp.throttle = throttle;
    inp.brake = brake;
    inp.steer = clamp(steer, -1, 1);
    inp.drift = drift;
    this._items(dt, ctx, cornerFar, disabled, inp);
  }

  _forceRespawn() {
    this.stuckTime = 0;
    this.reverseTime = 0;
    try { this.kart.respawn?.(); } catch { /* ignore */ }
  }

  /**
   * Fair rubber-banding per class: at 50cc an AI behind the player gets at most +3 % (no blatant catch-up) while
   * AIs ahead ease off up to -11 % so a young player can come back; at 150/200cc AIs behind push up to +12 % and the
   * leaders barely lift (-2..-3.5 %) so the fight is real. Smoothed so speed never jumps.
   */
  _rubberBand(ctx, dt = 1 / 60) {
    const kart = this.kart;
    const cfg = this.cfg;
    const base = (cfg.aiSpeedFactor ?? 0.94) * (1 + this.pace);
    const behind = cfg.rubberBandBehind ?? cfg.rubberBand ?? 0.1;
    const ahead = cfg.rubberBandAhead ?? (cfg.rubberBand ?? 0.1) * 0.8;
    const player = ctx.player;
    let scale = base;
    if (player && player !== kart && !player.finished && !kart.finished && fin(player.raceProgress) && fin(kart.raceProgress)) {
      const L = Math.max(100, this.track.length || 1000);
      const gap = (kart.raceProgress - player.raceProgress) * L; // + ahead of player
      if (gap < 0) scale = base + behind * clamp((-gap - 15) / 170, 0, 1);
      else scale = base - ahead * clamp((gap - 10) / 180, 0, 1);
    } else if (kart.finished) {
      scale = base * 0.9;
    }
    this._rb = this._rb === null ? scale : this._rb + (scale - this._rb) * (1 - Math.exp(-1.5 * dt));
    kart.maxSpeedScale = this._rb;
  }

  _tangent(t) {
    try {
      const v = this.track.getTangentAt(wrap01(t));
      if (v && fin(v.x)) {
        _tan.set(v.x, 0, v.z);
        if (_tan.lengthSq() > 1e-8) return _tan.normalize().clone();
      }
    } catch { /* ignore */ }
    return new THREE.Vector3(0, 0, 1);
  }

  _racingPoint(t, out) {
    let p = null;
    try { p = this.track.getRacingLine ? this.track.getRacingLine(t) : this.track.getPointAt(t); } catch { p = null; }
    if (!p || !fin(p.x)) { try { p = this.track.getPointAt(t); } catch { p = null; } }
    if (!p || !fin(p.x)) return out.set(0, 0, 0);
    return out.copy(p);
  }

  /** Signed heading change of the course between two distances ahead (+ = turning left). */
  _cornerAngle(t, d0, d1) {
    const L = Math.max(100, this.track.length || 1000);
    const a = this._tangent(t + d0 / L);
    const b = this._tangent(t + d1 / L);
    const ha = Math.atan2(a.x, a.z), hb = Math.atan2(b.x, b.z);
    return wrapAngle(hb - ha);
  }

  /** Lateral offset (m) to steer around hazards and karts directly ahead. */
  _avoidance(ctx, t, L, halfW, lane) {
    const kart = this.kart;
    const fx = Math.sin(kart.heading), fz = Math.cos(kart.heading);
    const rx = -Math.cos(kart.heading), rz = Math.sin(kart.heading);
    let offset = 0;
    const range = 18 + Math.abs(kart.speed || 0) * 0.6;

    let hazards = null;
    try { hazards = ctx.itemSystem?.getHazards?.(); } catch { hazards = null; }
    if (Array.isArray(hazards) && hazards.length) {
      // Work in track-lateral space: find the smallest sideways shift of our planned line that clears every
      // hazard coming up within range.
      const intervals = [];
      const baseLat = this._lineLat(t) + lane;
      const edge = halfW - 1.8;
      for (const hz of hazards) {
        const p = hz?.position;
        if (!p || !fin(p.x)) continue;
        const dx = p.x - kart.position.x, dz = p.z - kart.position.z;
        if (dx * dx + dz * dz > range * range * 1.5) continue;
        const info = this._hazardInfo(hz, p, t);
        if (!info) continue;
        let dT = info.t - t; dT -= Math.round(dT);
        const ahead = dT * L;
        if (ahead < 1.5 || ahead > range) continue;
        if (!this._hazardSeen(hz, ahead, range)) continue;
        const planned = this._lineLat(info.t) + lane;
        const clear = (hz.radius || 1) + (kart.radius || 1.3) + 0.9;
        intervals.push([info.lateral - clear - planned, info.lateral + clear - planned]);
      }
      if (intervals.length) {
        const cands = [0];
        for (const [lo, hi] of intervals) cands.push(lo - 0.01, hi + 0.01);
        let best = null;
        for (const c of cands) {
          if (Math.abs(baseLat + c) > edge) continue;
          let blocked = false;
          for (const [lo, hi] of intervals) if (c > lo && c < hi) { blocked = true; break; }
          if (!blocked && (best === null || Math.abs(c) < Math.abs(best))) best = c;
        }
        if (best !== null) offset += best;
      }
    }

    const karts = ctx.karts;
    if (Array.isArray(karts)) {
      for (const o of karts) {
        if (!o || o === kart) continue;
        const dx = o.position.x - kart.position.x, dz = o.position.z - kart.position.z;
        const ahead = dx * fx + dz * fz;
        if (this.bumper > 0 && Math.abs(ahead) < 3 && !o.finished && (o.mass || 1) <= (kart.mass || 1) * 1.1) {
          // heavy bumper (Kibo): lean into a kart running alongside
          const sideB = dx * rx + dz * rz;
          if (Math.abs(sideB) > 1.6 && Math.abs(sideB) < 6) offset += Math.sign(sideB) * this.bumper * 1.6;
        }
        if (ahead < 0.5 || ahead > 14) continue;
        const rel = (kart.speed || 0) - (o.speed || 0);
        if (rel < 1 && ahead > 5) continue;
        const side = dx * rx + dz * rz;
        const clear = (o.radius || 1.3) + (kart.radius || 1.3) + 0.8;
        if (Math.abs(side) < clear) {
          const dir = side >= 0 ? -1 : 1;
          offset += dir * (clear - Math.abs(side)) * 0.9;
        }
      }
    }
    return clamp(offset, -halfW * 0.8, halfW * 0.8);
  }

  /** Lane (offset from the racing line, m) that passes through the next active item box, or null. */
  _boxLane(ctx, t, L, halfW, dt) {
    const kart = this.kart;
    const sys = ctx.itemSystem;
    if (this.boxSeek <= 0 || !sys || kart.item != null || sys.roulettes?.has?.(kart) || kart.finished) { this._seekLane = null; return null; }
    this._seekTimer = (this._seekTimer || 0) - dt;
    if (this._seekTimer > 0) return this._seekLane ?? null;
    this._seekTimer = 0.25;
    this._seekLane = null;
    const boxes = sys.boxes;
    if (!Array.isArray(boxes) || !boxes.length) return null;
    if (!this._boxCache) this._boxCache = new WeakMap();
    let best = null, bestAhead = Infinity;
    for (const b of boxes) {
      if (!b || !b.active || !b.base) continue;
      const dx = b.base.x - kart.position.x, dz = b.base.z - kart.position.z;
      if (dx * dx + dz * dz > 70 * 70) continue;
      let info = this._boxCache.get(b);
      if (!info) {
        let si = null;
        try { si = this.track.getSurfaceInfo(b.base); } catch { si = null; }
        if (!si || !fin(si.t) || !fin(si.lateral)) continue;
        info = { t: si.t, lateral: si.lateral };
        this._boxCache.set(b, info);
      }
      let dT = info.t - t; dT -= Math.round(dT);
      const aheadM = dT * L;
      if (aheadM < 12 || aheadM > 60) continue;
      const lane = info.lateral - this._lineLat(info.t);
      if (Math.abs(info.lateral) > halfW - 1.5) continue;
      // nearest row first, then the box closest to our current plan
      const score = aheadM + Math.abs(lane) * 1.5;
      if (score < bestAhead) { bestAhead = score; best = lane; }
    }
    this._seekLane = best;
    return best;
  }

  _lineLat(t) {
    try {
      const tr = this.track;
      if (!tr.getRacingLine) return 0;
      const r = tr.getRacingLine(wrap01(t)), c = tr.getPointAt(wrap01(t)), tg = this._tangent(t);
      if (!r || !c || !fin(r.x)) return 0;
      return (r.x - c.x) * -tg.z + (r.z - c.z) * tg.x;
    } catch { return 0; }
  }

  _hazardInfo(hz, p, t) {
    if (!this._hzCache) this._hzCache = new WeakMap();
    let e = null;
    try { e = this._hzCache.get(hz); } catch { e = null; }
    if (e && Math.abs(e.x - p.x) < 0.5 && Math.abs(e.z - p.z) < 0.5) return e.info;
    let info = null;
    try { info = this.track.getSurfaceInfo(p, t); } catch { info = null; }
    if (!info || !fin(info.t) || !fin(info.lateral)) return null;
    const out = { t: info.t, lateral: info.lateral };
    try { this._hzCache.set(hz, { x: p.x, z: p.z, info: out }); } catch { /* primitive */ }
    return out;
  }

  _hazardSeen(hz, ahead, range) {
    // Deterministic per hazard object so decisions don't flicker frame to frame.
    if (!this._seen) this._seen = new WeakMap();
    let v = this._seen.get(hz);
    if (v === undefined) {
      v = Math.random() < 0.25 + this.hazardSight * 0.75;
      try { this._seen.set(hz, v); } catch { return v; }
    }
    return v && ahead < range * (0.55 + this.hazardSight * 0.45);
  }

  _items(dt, ctx, cornerFar, disabled, inp) {
    const kart = this.kart;
    const sys = ctx.itemSystem;
    const dragging = !!sys?.isDragging?.(kart);
    if (this.itemCooldown > 0) this.itemCooldown -= dt;
    const item = kart.item;
    if (!item) { this.itemHoldTime = 0; this.lastItem = null; return; }
    if (item !== this.lastItem) { this.itemHoldTime = 0; this.lastItem = item; }
    this.itemHoldTime += dt;
    if (dragging) inp.itemHeld = true;
    if (disabled || this.itemCooldown > 0 || this.itemHoldTime < this.reaction) return;

    const hold = this.itemHoldTime;
    const eager = 0.5 + this.aggression; // 0.5..1.5
    const place = kart.place || 4;
    const straight = Math.abs(cornerFar) < 0.3;
    const others = this._relKarts(ctx);
    const behindClose = others.some((o) => o.ahead < -2 && o.ahead > -18 && Math.abs(o.side) < 4);
    const reach = this.sniper ? 65 : 45, cone = this.sniper ? 1.6 : 1;
    const aheadAligned = others.some((o) => o.ahead > 4 && o.ahead < reach && Math.abs(o.side) < (1.2 + o.ahead * 0.06) * cone);
    let use = false;
    let drag = false;

    switch (item) {
      case 'star':
      case 'coin':
        use = true;
        break;
      case 'mushroom':
      case 'triple_mushroom':
        use = (straight && (kart.speed || 0) > 14 && (place > 1 || hold > 5 / eager)) ||
          (kart.surface === 'offroad' && (kart.speed || 0) < 22) || hold > 12;
        break;
      case 'banana':
        use = behindClose || hold > 14 / eager;
        drag = !use && place <= 4;
        break;
      case 'triple_banana':
        use = behindClose || hold > 16 / eager;
        break;
      case 'green_shell':
        use = aheadAligned || (hold > 10 && behindClose) || hold > 16 / eager;
        drag = !use && place <= 3;
        break;
      case 'triple_green':
        use = aheadAligned || hold > 14 / eager;
        break;
      case 'red_shell':
        use = (place > 1 && others.some((o) => o.ahead > 5 && o.ahead < (this.sniper ? 120 : 90) && Math.abs(o.angle) < 0.8)) || hold > 8 / eager;
        drag = !use && place === 1;
        break;
      case 'bomb':
        use = others.filter((o) => o.ahead > 8 && o.ahead < 40 && Math.abs(o.side) < 10).length >= 1 || hold > 9 / eager;
        break;
      case 'bullet':
        use = hold > 0.8 && Math.abs(cornerFar) < 0.9;
        break;
      case 'ghost':
        use = (ctx.karts || []).some((k) => k && k !== kart && k.item && (k.place || 9) < place) || hold > 7;
        break;
      case 'horn': {
        const blue = (sys?.entities || []).some((e) => !e.dead && e.type === 'blue_shell' && e.target === kart && e.pos.distanceTo(kart.position) < 26);
        use = blue || others.filter((o) => Math.hypot(o.ahead, o.side) < 9).length >= 2 || (place > 1 && hold > 10) || hold > 25;
        break;
      }
      case 'blue_shell':
        use = hold > 1.2;
        break;
      case 'lightning':
        use = (place > 1 && hold > 1.0) || hold > 14;
        break;
      default:
        use = hold > 3;
    }
    if (kart.finished && hold > 2) use = true;
    if (dragging) {
      if (use) { inp.itemHeld = false; this.itemCooldown = 0.5 + Math.random() * 0.5; this.itemHoldTime = 0; }
      return;
    }
    if (use) {
      inp.item = true;
      this.itemCooldown = item.startsWith('triple') ? 0.9 + Math.random() * 0.6 : 0.5 + Math.random() * 0.6;
      if (!item.startsWith('triple')) this.itemHoldTime = 0;
    } else if (drag && this.skill > 0.5) {
      inp.item = true; inp.itemHeld = true;
      this.itemCooldown = 0.3;
    }
  }

  _relKarts(ctx) {
    const kart = this.kart;
    const out = [];
    const karts = ctx.karts;
    if (!Array.isArray(karts)) return out;
    const h = kart.heading;
    const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
    for (const o of karts) {
      if (!o || o === kart) continue;
      const dx = o.position.x - kart.position.x, dz = o.position.z - kart.position.z;
      const ahead = dx * fx + dz * fz;
      const side = dx * rx + dz * rz;
      out.push({ kart: o, ahead, side, angle: Math.atan2(side, ahead) });
    }
    return out;
  }

  dispose() {
    for (const u of this._unsubs) { try { u(); } catch { /* ignore */ } }
    this._unsubs.length = 0;
    this.kart = null;
  }
}

