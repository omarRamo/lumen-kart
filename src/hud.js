// Lumen Kart — in-race HUD (DOM overlay + minimap canvas), results, GP standings, podium, unlock cards.
import { bus } from './events.js';
import { ITEMS, CHARACTERS, CLASSES, PHYSICS } from './config.js';
import { formatTime } from './race.js';
import { t, esc, ordinalParts, itemLabel, trackName, cupName, className } from './i18n.js';
import { itemIcon, svgIcon, noteIconURL } from './icons.js';
import { SCARVES } from './save.js';

export { itemIcon };
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
export const ordinal = (n) => ordinalParts(n).suffix;
export const PLACE_COLORS = ['#edc371', '#cfd8dc', '#e0a27a', '#7cc8a4', '#7cc8a4', '#7cc8a4', '#9fb3ad', '#9fb3ad'];
const ROULETTE = ITEMS.filter((i) => i !== 'coin');

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
function restartAnim(e, cls) {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}
const placeHTML = (n) => { const o = ordinalParts(n); return `${o.n}<small>${esc(o.suffix)}</small>`; };

export function coinIconURL() { return noteIconURL(); }

// ---------------------------------------------------------------------------------------------
export class HUD {
  constructor(uiRoot) {
    this.uiRoot = uiRoot;
    this.root = el('div', 'hud hidden', uiRoot);
    this.portraitFn = null;
    this.player = null;
    this.track = null;
    this._offs = [];
    this._last = {};
    this._rouletteTimer = 0;
    this._rouletteIdx = 0;
    this._lastItemKey = '';
    this._standKey = '';
    this.active = false;
    this.touch = false;
    this._unlockQueue = [];

    const r = this.root;
    // top-left: lap, timer, notes
    this.tl = el('div', 'hud-tl', r);
    this.lapEl = el('div', 'hud-pill hud-lap', this.tl, '<span class="lbl"></span><span class="val">1</span><span class="of">/3</span>');
    this.lapLbl = this.lapEl.querySelector('.lbl');
    this.lapVal = this.lapEl.querySelector('.val');
    this.lapOf = this.lapEl.querySelector('.of');
    this.timerEl = el('div', 'hud-pill hud-timer', this.tl, '0:00.00');
    this.coinEl = el('div', 'hud-pill hud-coins', this.tl, '<img alt=""><span class="cn">0</span><span class="cmax">/10</span>');
    this.coinEl.querySelector('img').src = noteIconURL();
    this.coinVal = this.coinEl.querySelector('.cn');
    this.recordEl = el('div', 'hud-record', this.tl);
    this.splitsEl = el('div', 'hud-splits', this.tl);

    // top-centre item slot + name
    this.itemWrap = el('div', 'hud-item', r);
    this.itemSlot = el('div', 'item-slot', this.itemWrap);
    this.itemImg = el('img', 'item-img', this.itemSlot);
    this.itemImg.alt = '';
    this.itemCount = el('div', 'item-count', this.itemSlot);
    this.itemName = el('div', 'item-name', this.itemWrap);

    // right side standings (desktop)
    this.standEl = el('div', 'hud-standings', r);
    this.standRows = [];
    for (let i = 0; i < 8; i++) {
      const row = el('div', 'st-row', this.standEl, '<span class="st-pos"></span><span class="st-chip"></span><span class="st-name"></span>');
      this.standRows.push({ row, pos: row.querySelector('.st-pos'), chip: row.querySelector('.st-chip'), name: row.querySelector('.st-name') });
    }

    // bottom-left minimap
    this.mapWrap = el('div', 'hud-minimap', r);
    this.mapCanvas = el('canvas', '', this.mapWrap);
    this.mapCanvas.width = this.mapCanvas.height = 320;
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapBg = null;

    // bottom-right: drift meter + place badge
    this.br = el('div', 'hud-br', r);
    this.driftEl = el('div', 'hud-drift', this.br, '<span class="dl"></span><span class="dbar"><i></i><i></i><i></i></span>');
    this.driftLbl = this.driftEl.querySelector('.dl');
    this.driftSegs = [...this.driftEl.querySelectorAll('i')];
    this.placeEl = el('div', 'hud-place', this.br, '<span class="num">1</span><span class="suf"></span>');
    this.placeNum = this.placeEl.querySelector('.num');
    this.placeSuf = this.placeEl.querySelector('.suf');

    // overlays
    this.countEl = el('div', 'hud-countdown', r);
    this.bannerEl = el('div', 'hud-banner', r);
    this.wrongEl = el('div', 'hud-wrongway', r, '<div class="ww-arrow"></div><div class="ww-text"></div>');
    this.flashEl = el('div', 'hud-flash', uiRoot);
    this.finishEl = el('div', 'hud-finish', r);
    this.lapPop = el('div', 'hud-lappop', r);
    this.calloutEl = el('div', 'hud-callout', r);
    this.tipEl = el('div', 'hud-tip', r);
    this.slipEl = el('div', 'hud-slip', r, '<i></i>');
    this.slipFill = this.slipEl.querySelector('i');

    this.resultsEl = el('div', 'results hidden', uiRoot);
    this.toastEl = el('div', 'toast', uiRoot);
    this.unlockEl = el('div', 'unlock-stack', uiRoot);
    this.fpsEl = el('div', 'fps-meter hidden', uiRoot);
    this._fps = { frames: 0, time: 0 };

    this._subscribe();
    this.relabel();
  }

  setPortraitProvider(fn) { this.portraitFn = fn; this._portraits?.clear(); }
  portrait(character) {
    if (!character) return '';
    const key = `${character.id}:${character.accent}:${character.scarf}`;
    this._portraits = this._portraits || new Map();
    if (this._portraits.has(key)) return this._portraits.get(key);
    let url = '';
    try { if (this.portraitFn) url = this.portraitFn(character) || ''; } catch { url = ''; }
    this._portraits.set(key, url);
    return url;
  }

  /** Re-apply translated static labels (language switch). */
  relabel() {
    this.lapLbl.textContent = t('hud.lap');
    this.wrongEl.querySelector('.ww-text').textContent = t('hud.wrongWay');
    this._last = {};
    this._lastItemKey = '';
  }

  _subscribe() {
    const on = (n, f) => this._offs.push(bus.on(n, (d) => { if (this.active) f(d || {}); }));
    const P = (k) => k && k.isPlayer;
    on('race:countdown', (d) => this.showCount(String(d.n), 'n' + d.n));
    on('race:go', () => { this.showCount(t('hud.go'), 'go'); clearTimeout(this._cdT); this._cdT = setTimeout(() => this.countEl.classList.remove('show'), 1100); });
    on('race:finalLap', () => this.banner(t('hud.finalLap'), 'final'));
    on('race:lap', (d) => {
      if (P(d.kart)) {
        restartAnim(this.lapEl, 'pulse');
        if (d.lapTime != null) { this.lapPop.textContent = formatTime(d.lapTime); restartAnim(this.lapPop, 'show'); }
      }
    });
    on('race:wrongWay', (d) => { this.wrongEl.classList.toggle('show', !!d.active); this.root.classList.toggle('wrong-way', !!d.active); });
    on('item:lightning', (d) => { if (!(d.by && d.by.isPlayer)) restartAnim(this.flashEl, 'flash'); else restartAnim(this.flashEl, 'flash-soft'); });
    on('race:finish', (d) => {
      if (!P(d.kart)) return;
      const p = d.place || 1;
      this.finishEl.innerHTML = `<div class="fin-title">${esc(t('hud.finish'))}</div><div class="fin-place" style="--pc:${PLACE_COLORS[p - 1] || '#fff'}">${placeHTML(p)}</div>`;
      restartAnim(this.finishEl, 'show');
      this.wrongEl.classList.remove('show'); this.root.classList.remove('wrong-way');
      this.hideTip();
    });
    on('item:got', (d) => {
      if (!P(d.kart)) return;
      restartAnim(this.itemSlot, 'got');
      const id = d.item || d.kart.item;
      if (id) { this.itemName.textContent = itemLabel(id); restartAnim(this.itemName, 'show'); }
    });
    on('kart:hit', (d) => { if (P(d.kart)) restartAnim(this.root, 'shake'); });
    on('kart:boost', (d) => {
      if (!P(d.kart)) return;
      if (d.source === 'trick') this.callout(t('call.trick'), 'trick');
      else if (d.source === 'start') this.callout(t(d.strength >= 1 ? 'call.rocketStart' : 'call.goodStart'), 'start');
    });
    on('kart:miniTurbo', (d) => { if (P(d.kart) && d.level >= 3) this.callout(t('call.ultra'), 'ultra'); });
    on('kart:slipstream', (d) => { if (P(d.kart)) this.callout(t('call.slip'), 'slip'); });
    on('kart:stall', (d) => { if (P(d.kart)) this.callout(t('call.stall'), 'bad'); });
    on('item:block', (d) => { if (P(d.kart)) this.callout(t('call.blocked'), 'block'); });
    on('item:steal', (d) => {
      if (P(d.kart)) this.callout(t('call.stolenFrom', { name: d.from?.character?.name || '?' }), 'steal');
      else if (P(d.from)) this.callout(t('call.stoleYours', { name: d.kart?.character?.name || '?' }), 'bad');
    });
    on('item:hit', (d) => { if (P(d.by) && !P(d.kart) && d.kart) this.callout(t('call.hit', { name: d.kart.character?.name || '' }), 'hit'); });
    on('kart:coin', (d) => { if (P(d.kart) && d.count === 10 && d.gained > 0) this.callout(t('call.maxNotes'), 'coin'); if (P(d.kart)) restartAnim(this.coinEl, 'pop'); });
    on('kart:coinLoss', (d) => { if (P(d.kart)) restartAnim(this.coinEl, 'lose'); });
    on('kart:fall', (d) => { if (!P(d.kart)) return; const isVoid = d.pitKind ? d.pitKind === 'void' : !!(d.void || d.lava); this.callout(t(isVoid ? 'call.void' : 'call.splash'), isVoid ? 'ultra' : 'bad'); });
    on('kart:rocket', (d) => { if (P(d.kart)) this.callout(t('call.feather'), 'ultra'); });
    on('kart:ghost', (d) => { if (P(d.kart)) this.callout(t('call.veil'), 'steal'); });
    on('hazard:hit', (d) => { if (P(d.kart)) this.callout(t(d.type === 'stomper' ? 'call.squashed' : 'call.ouch'), 'bad'); });
    on('game:record', () => this.callout(t('call.record'), 'ultra'));
  }

  // ------------------------------------------------------------------ lifecycle
  show() { this.active = true; this.root.classList.remove('hidden'); }
  hide() { this.active = false; this.root.classList.add('hidden'); this.hideTip(); }

  reset({ player, track, laps, gameMode = 'vs', record = null, touch = false }) {
    this.player = player;
    this.track = track;
    this.laps = laps;
    this.gameMode = gameMode;
    this.touch = touch;
    this.relabel();
    this.root.classList.toggle('mode-tt', gameMode === 'tt');
    this.recordEl.textContent = gameMode === 'tt' ? (record && record.time ? t('hud.record', { t: formatTime(record.time) }) : t('hud.noRecord')) : '';
    this.calloutEl.className = 'hud-callout';
    this._standKey = '';
    this.splitsEl.innerHTML = '';
    this.countEl.className = 'hud-countdown';
    this.bannerEl.className = 'hud-banner';
    this.wrongEl.classList.remove('show'); this.root.classList.remove('wrong-way');
    this.finishEl.className = 'hud-finish';
    this.lapPop.className = 'hud-lappop';
    this.itemName.className = 'item-name';
    this.hideTip();
    this.hideResults();
    this._buildMinimap(track);
  }

  callout(text, cls = '') {
    this.calloutEl.textContent = text;
    this.calloutEl.className = 'hud-callout';
    void this.calloutEl.offsetWidth;
    this.calloutEl.className = `hud-callout show ${cls}`;
  }
  toast(msg) { this.toastEl.textContent = msg; restartAnim(this.toastEl, 'show'); }
  showCount(text, cls) {
    this.countEl.textContent = text;
    this.countEl.className = 'hud-countdown';
    void this.countEl.offsetWidth;
    this.countEl.className = `hud-countdown show ${cls}`;
  }
  banner(text, cls = '') {
    this.bannerEl.textContent = text;
    this.bannerEl.className = 'hud-banner';
    void this.bannerEl.offsetWidth;
    this.bannerEl.className = `hud-banner show ${cls}`;
  }
  /** First-race tutorial hint (stays ~6 s). */
  tip(text, icon = null) {
    clearTimeout(this._tipT);
    this.tipEl.innerHTML = `${icon ? `<img src="${icon}" alt="">` : svgIcon('sparkle')}<span>${esc(text)}</span>`;
    restartAnim(this.tipEl, 'show');
    this._tipT = setTimeout(() => this.hideTip(), 6500);
  }
  hideTip() { clearTimeout(this._tipT); this.tipEl.classList.remove('show'); }

  setFpsVisible(on) { this.fpsEl.classList.toggle('hidden', !on); this._fpsOn = !!on; }
  tickFps(rawDt) {
    if (!this._fpsOn) return;
    const f = this._fps;
    f.frames++; f.time += rawDt;
    if (f.time >= 0.5) { this.fpsEl.textContent = t('hud.fps', { n: Math.round(f.frames / f.time) }); f.frames = 0; f.time = 0; }
  }

  /** Celebration cards for unlocks / medals, queued one after another. */
  celebrate(events = []) {
    for (const ev of events) {
      const text = this._unlockText(ev);
      if (text) this._unlockQueue.push({ ev, text });
    }
    if (!this._unlockBusy) this._nextUnlock();
  }
  _unlockText(ev) {
    switch (ev.type) {
      case 'cup': return t('unlock.cup', { cup: cupName({ id: ev.id, names: ev.names }) });
      case 'mirror': return t('unlock.mirror');
      case 'character': { const ch = CHARACTERS.find((c) => c.id === ev.id); return t('unlock.character', { name: ch?.name || ev.id }); }
      case 'scarf': return t('unlock.scarf', { name: t('scarf.' + ev.id) });
      case 'medal': { const cls = CLASSES.find((c) => c.id === ev.classId); return t('unlock.medal', { cup: cupName({ id: ev.cupId }), cls: cls ? (cls.mirror ? className(cls) : cls.label) : '' }); }
      default: return '';
    }
  }
  _nextUnlock() {
    const item = this._unlockQueue.shift();
    if (!item) { this._unlockBusy = false; return; }
    this._unlockBusy = true;
    const { ev, text } = item;
    const sw = ev.type === 'scarf' ? SCARVES.find((s) => s.id === ev.id) : null;
    const icon = ev.type === 'medal' ? `<span class="uc-icon medal m${ev.place}">${svgIcon('trophy')}</span>`
      : sw ? `<span class="uc-icon swatch-ico" style="--sw:${hex(sw.color)}"></span>`
        : `<span class="uc-icon">${svgIcon(ev.type === 'character' ? 'star' : 'sparkle')}</span>`;
    const card = el('div', 'unlock-card', this.unlockEl, `${icon}<span class="uc-text"><small>${esc(ev.type === 'medal' ? t('common.new') : t('unlock.title'))}</small><b>${esc(text)}</b></span>`);
    bus.emit('game:unlock', ev);
    requestAnimationFrame(() => card.classList.add('show'));
    setTimeout(() => { card.classList.remove('show'); card.classList.add('out'); }, 2900);
    setTimeout(() => { card.remove(); this._nextUnlock(); }, 3300);
  }

  // ------------------------------------------------------------------ minimap
  _buildMinimap(track) {
    this.mapBg = null;
    const mm = track && track.minimap;
    if (!mm || !mm.points || mm.points.length < 2) { this.mapWrap.style.visibility = 'hidden'; return; }
    this.mapWrap.style.visibility = '';
    const W = this.mapCanvas.width, pad = 30;
    const b = mm.bounds || this._bounds(mm.points);
    const spanX = Math.max(1, b.maxX - b.minX), spanZ = Math.max(1, b.maxZ - b.minZ);
    const scale = (W - pad * 2) / Math.max(spanX, spanZ);
    const ox = (W - spanX * scale) / 2, oz = (W - spanZ * scale) / 2;
    this._map = { minX: b.minX, minZ: b.minZ, scale, ox, oz };
    const c = document.createElement('canvas'); c.width = c.height = W;
    const g = c.getContext('2d');
    const path = () => {
      g.beginPath();
      mm.points.forEach((p, i) => { const [x, y] = this._mp(p.x, p.z); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.closePath();
    };
    g.lineJoin = 'round'; g.lineCap = 'round';
    const rw = Math.max(16, Math.min(24, (track.roadWidth || 24) * scale));
    path(); g.strokeStyle = 'rgba(37,77,69,0.9)'; g.lineWidth = rw + 14; g.stroke();
    path(); g.strokeStyle = '#fff7dc'; g.lineWidth = rw; g.stroke();
    const p0 = mm.points[0], p1 = mm.points[1];
    const [x0, y0] = this._mp(p0.x, p0.z), [x1, y1] = this._mp(p1.x, p1.z);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    g.save(); g.translate(x0, y0); g.rotate(ang);
    g.fillStyle = '#edc371'; g.strokeStyle = '#254d45'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(-4, -rw / 2 - 3, 8, rw + 6, 3); g.fill(); g.stroke();
    g.restore();
    this.mapBg = c;
  }
  _bounds(pts) {
    const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of pts) { b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z); }
    return b;
  }
  _mp(x, z) {
    const m = this._map;
    return [m.ox + (x - m.minX) * m.scale, m.oz + (z - m.minZ) * m.scale];
  }
  _drawMinimap(karts, player, time) {
    if (!this.mapBg) return;
    const g = this.mapCtx, W = this.mapCanvas.width;
    g.clearRect(0, 0, W, W);
    g.drawImage(this.mapBg, 0, 0);
    for (let i = karts.length - 1; i >= 0; i--) {
      const k = karts[i];
      if (k === player || !k.position) continue;
      const [x, y] = this._mp(k.position.x, k.position.z);
      g.fillStyle = k.character ? hex(k.character.color) : '#ccc';
      g.strokeStyle = '#254d45'; g.lineWidth = 3.5;
      g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if (player && player.position) {
      const [x, y] = this._mp(player.position.x, player.position.z);
      const pulse = 1 + Math.sin(time * 6) * 0.15;
      g.fillStyle = 'rgba(255,247,220,0.45)';
      g.beginPath(); g.arc(x, y, 20 * pulse, 0, Math.PI * 2); g.fill();
      const h = player.heading || 0;
      g.save(); g.translate(x, y); g.rotate(Math.atan2(Math.cos(h), Math.sin(h)));
      g.fillStyle = player.character ? hex(player.character.accent || player.character.color) : '#e98c73';
      g.strokeStyle = '#254d45'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(24, 0); g.lineTo(-15, 17); g.lineTo(-7, 0); g.lineTo(-15, -17); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }

  // ------------------------------------------------------------------ per-frame
  update(dt, { player, karts, race, itemSystem, time = 0 } = {}) {
    if (!this.active || !player) return;
    const L = this._last;

    const laps = race ? race.laps : this.laps || 3;
    const lap = Math.max(1, Math.min(laps, player.lap || 1));
    if (L.lap !== lap || L.laps !== laps) {
      if (L.lap != null && lap > L.lap) restartAnim(this.lapEl, 'pulse');
      L.lap = lap; L.laps = laps;
      this.lapVal.textContent = lap; this.lapOf.textContent = '/' + laps;
      this.lapEl.classList.toggle('final', lap === laps && laps > 1);
    }

    const rt = race ? (race.phase === 'racing' || race.phase === 'done' ? (player.finished ? player.finishTime : race.raceTime) : 0) : 0;
    const ts = formatTime(rt);
    if (L.ts !== ts) { L.ts = ts; this.timerEl.textContent = ts; }

    const lt = player.lapTimes || [];
    if (L.splits !== lt.length) {
      L.splits = lt.length;
      const best = lt.length ? Math.min(...lt) : 0;
      this.splitsEl.innerHTML = lt.map((x, i) => `<div class="split${x === best && lt.length > 1 ? ' best' : ''}"><span>${i + 1}</span>${formatTime(x)}</div>`).join('');
    }

    const place = player.place || 1;
    if (L.place !== place) {
      L.place = place;
      const o = ordinalParts(place);
      this.placeNum.textContent = o.n;
      this.placeSuf.textContent = o.suffix;
      this.placeEl.style.setProperty('--pc', PLACE_COLORS[place - 1] || '#9fb3ad');
      restartAnim(this.placeEl, 'bump');
    }

    // item slot
    let spinning = false, display = null;
    if (itemSystem && typeof itemSystem.rouletteState === 'function') {
      try { const rs = itemSystem.rouletteState(player); if (rs) { spinning = !!rs.spinning; display = rs.displayItem || null; } } catch { /* ignore */ }
    }
    let key;
    if (spinning) {
      this._rouletteTimer -= dt;
      if (this._rouletteTimer <= 0) { this._rouletteTimer = 0.08; this._rouletteIdx = (this._rouletteIdx + 1) % ROULETTE.length; }
      const shown = display && ITEMS.includes(display) ? display : ROULETTE[this._rouletteIdx];
      key = 'spin:' + shown;
      if (key !== this._lastItemKey) this.itemImg.src = itemIcon(shown);
    } else if (player.item) {
      const count = player.itemCount || 1;
      key = 'item:' + player.item + ':' + count;
      if (key !== this._lastItemKey) {
        this.itemImg.src = itemIcon(player.item);
        this.itemCount.textContent = count > 1 ? '×' + count : '';
      }
    } else key = 'none';
    if (key !== this._lastItemKey) {
      this._lastItemKey = key;
      const has = key !== 'none';
      this.itemImg.style.visibility = has ? 'visible' : 'hidden';
      this.itemSlot.classList.toggle('spinning', spinning);
      this.itemSlot.classList.toggle('filled', has && !spinning);
      if (!player.item || spinning) this.itemCount.textContent = '';
    }

    const coins = player.coins | 0;
    if (L.coins !== coins) { L.coins = coins; this.coinVal.textContent = coins; this.coinEl.classList.toggle('max', coins >= 10); }
    const slip = Math.min(1, (player.slipCharge || 0) / 1.5);
    const slipOn = slip > 0.04;
    if (L.slipOn !== slipOn) { L.slipOn = slipOn; this.slipEl.classList.toggle('show', slipOn); }
    if (slipOn) this.slipFill.style.transform = `scaleX(${slip.toFixed(3)})`;

    // drift charge meter: three segments filling with the mini-turbo thresholds
    const dl = player.drifting ? Math.max(0, Math.min(3, player.driftLevel | 0)) : -1;
    const ch = player.drifting ? (player.driftCharge || 0) : 0;
    const prog = Math.round(Math.min(1, ch / ((PHYSICS.driftChargeThresholds || [3])[2] || 3)) * 30);
    const dk = dl + ':' + prog;
    if (L.dk !== dk) {
      L.dk = dk;
      this.driftEl.className = 'hud-drift' + (dl >= 0 ? ' show lvl' + dl : '');
      this.driftLbl.textContent = dl > 0 ? t('hud.drift.' + dl) : t('hud.drift');
      const th = PHYSICS.driftChargeThresholds || [0.9, 1.9, 3.0];
      let prev = 0;
      this.driftSegs.forEach((s, i) => { const f = Math.max(0, Math.min(1, (ch - prev) / (th[i] - prev))); prev = th[i]; s.style.transform = `scaleX(${f.toFixed(2)})`; });
    }

    const standings = (race && race.standings) || karts || [];
    const sk = standings.map((k) => k.index).join(',');
    if (sk !== this._standKey) {
      this._standKey = sk;
      for (let i = 0; i < this.standRows.length; i++) {
        const row = this.standRows[i], k = standings[i];
        if (!k) { row.row.style.display = 'none'; continue; }
        row.row.style.display = '';
        row.pos.textContent = i + 1;
        row.chip.style.background = k.character ? hex(k.character.color) : '#888';
        row.name.textContent = k.character ? k.character.name : '?';
        row.row.classList.toggle('me', k === player);
      }
    }
    this._drawMinimap(standings, player, time);
  }

  // ------------------------------------------------------------------ results
  _row(r, i, extra = '') {
    const img = this.portrait(r.character);
    const col = r.character ? hex(r.character.color) : '#888';
    return `<div class="res-row${r.isPlayer ? ' me' : ''}" style="--d:${0.15 + i * 0.06}s;--pc:${PLACE_COLORS[r.place - 1] || '#9fb3ad'}">
        <div class="res-place">${placeHTML(r.place)}</div>
        <div class="res-portrait" style="--kc:${col}">${img ? `<img src="${img}" alt="">` : `<span>${esc((r.name || '?')[0])}</span>`}</div>
        <div class="res-name">${esc(r.name)}${r.isPlayer ? ` <em>${esc(t('res.you'))}</em>` : ''}</div>
        ${extra}
      </div>`;
  }

  /** Shared panel + keyboard/mouse button handling. buttons = [{label, act, primary, icon}] */
  _panel(html, buttons, onAct) {
    const R = this.resultsEl;
    this.hideResults();
    R.innerHTML = `<div class="res-panel">${html}<div class="res-buttons">${buttons.map((b) => `<button class="pill-btn${b.primary ? ' primary' : ''}" data-act="${b.act}" data-testid="results-${b.act}">${b.icon ? svgIcon(b.icon) : ''}<span>${esc(b.label)}</span></button>`).join('')}</div></div>`;
    R.classList.remove('hidden');
    requestAnimationFrame(() => R.classList.add('show'));
    const btns = [...R.querySelectorAll('.res-buttons .pill-btn')];
    let sel = 0;
    const focus = () => btns.forEach((b, i) => b.classList.toggle('focus', i === sel));
    focus();
    let done = false;
    const act = (a) => { if (done) return; done = true; this.hideResults(); bus.emit('ui:confirm'); onAct(a); };
    btns.forEach((b, i) => {
      b.addEventListener('click', () => act(b.dataset.act));
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && sel !== i) { sel = i; focus(); bus.emit('ui:move'); } });
    });
    const handler = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD'].includes(e.code)) {
        const d = ['ArrowLeft', 'ArrowUp', 'KeyA'].includes(e.code) ? -1 : 1;
        sel = (sel + d + btns.length) % btns.length; focus(); bus.emit('ui:move'); e.preventDefault();
      } else if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') && !e.repeat) {
        e.preventDefault(); act(btns[sel].dataset.act);
      }
    };
    this._resKey = handler;
    this._resBack = () => { const last = btns[btns.length - 1]; if (last) act(last.dataset.act); };
    // defer so the keypress that ended the race doesn't trigger a button
    this._resTimer = setTimeout(() => { if (this._resKey === handler) window.addEventListener('keydown', handler); }, 450);
    return R;
  }

  _trackLabel() { return this.track?.def ? trackName(this.track.def) : (this.track?.name || ''); }

  showResults(results, { onRestart, onMenu, laps, mode, record, newTime, newLap, notes = 0 } = {}) {
    const rows = results.map((r, i) => this._row(r, i, `<div class="res-best">${r.bestLap ? formatTime(r.bestLap) : ''}</div>
        <div class="res-time">${r.estimated ? '~' : ''}${formatTime(r.time)}</div>`)).join('');
    const me = results.find((r) => r.isPlayer);
    let title, sub, extra = '';
    if (mode === 'tt') {
      title = newTime ? t('res.newRecord') : t('res.tt');
      sub = t(laps === 1 ? 'res.lapRace1' : 'res.lapRace', { n: laps || '', track: this._trackLabel() });
      const lapsHtml = (me?.kart?.lapTimes || []).map((x, i) => `<div class="tt-lap" style="--d:${0.15 + i * 0.08}s"><span>${esc(t('res.lapN', { n: i + 1 }))}</span>${formatTime(x)}</div>`).join('');
      extra = `<div class="tt-box"><div class="tt-laps">${lapsHtml}</div><div class="tt-rec">
        <div><span>${esc(t('res.total'))}</span><b>${formatTime(me?.time)}</b>${newTime ? ` <em>${esc(t('common.new'))}</em>` : ''}</div>
        <div><span>${esc(t('res.bestLap'))}</span><b>${formatTime(me?.bestLap)}</b>${newLap ? ` <em>${esc(t('common.new'))}</em>` : ''}</div>
        <div class="old">${esc(t('res.prevRecord'))} ${record && record.time ? formatTime(record.time) : '—'}</div></div></div>`;
    } else {
      title = me ? (me.place === 1 ? t('res.victory') : me.place <= 3 ? t('res.podium') : t('res.complete')) : t('res.results');
      sub = t(laps === 1 ? 'res.lapRace1' : 'res.lapRace', { n: laps || '', track: this._trackLabel() });
    }
    const notesChip = notes > 0 ? `<div class="res-notes"><img src="${noteIconURL()}" alt="">${esc(t('res.notes', { n: notes }))}</div>` : '';
    this._panel(`<div class="res-title">${esc(title)}</div><div class="res-sub">${esc(sub)}</div>${notesChip}
      ${mode === 'tt' ? extra : `<div class="res-table">${rows}</div>`}`,
    [{ label: mode === 'tt' ? t('res.tryAgain') : t('res.again'), act: 'restart', primary: true, icon: 'restart' }, { label: t('res.menu'), act: 'menu', icon: 'home' }],
    (a) => { if (a === 'restart') onRestart && onRestart(); else onMenu && onMenu(); });
  }

  showGPResults(results, standings, { cup, raceIndex, total, last, onNext, onMenu, notes = 0 } = {}) {
    const raceRows = results.map((r, i) => this._row(r, i, `<div class="res-best">${formatTime(r.time)}</div><div class="res-pts">+${r.points || 0}</div>`)).join('');
    const standRows = standings.map((r, i) => this._row(r, i, `<div class="res-best">${r.race ? esc(t('res.thisRace', { p: ordinalParts(r.race.place).n + ordinalParts(r.race.place).suffix })) : ''}</div><div class="res-pts total">${r.points}</div>`)).join('');
    const notesChip = notes > 0 ? `<div class="res-notes"><img src="${noteIconURL()}" alt="">${esc(t('res.notes', { n: notes }))}</div>` : '';
    const R = this._panel(`<div class="res-title">${esc(cupName(cup))}</div>
      <div class="res-sub">${esc(t('intro.race', { i: raceIndex + 1, n: total }))} · ${esc(this._trackLabel())}</div>${notesChip}
      <div class="gp-tabs"><button class="on" data-tab="race">${esc(t('res.tab.race'))}</button><button data-tab="total">${esc(t('res.tab.total'))}</button></div>
      <div class="res-table gp-race">${raceRows}</div>
      <div class="res-table gp-total hidden">${standRows}</div>`,
    [{ label: last ? t('res.ceremony') : t('res.next'), act: 'next', primary: true, icon: last ? 'trophy' : 'arrow' }, { label: t('res.quitGp'), act: 'menu', icon: 'home' }],
    (a) => { clearTimeout(this._gpTab); if (a === 'next') onNext && onNext(); else onMenu && onMenu(); });
    const tabs = [...R.querySelectorAll('.gp-tabs button')];
    const show = (x) => {
      tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === x));
      R.querySelector('.gp-race').classList.toggle('hidden', x !== 'race');
      R.querySelector('.gp-total').classList.toggle('hidden', x !== 'total');
    };
    tabs.forEach((b) => b.addEventListener('click', () => { clearTimeout(this._gpTab); show(b.dataset.tab); }));
    this._gpTab = setTimeout(() => show('total'), 3200);
  }

  showPodium(standings, { cup, classLabel, onDone } = {}) {
    const top = standings.slice(0, 3);
    const me = standings.find((s) => s.isPlayer);
    const trophy = ['gold', 'silver', 'bronze'];
    const order = [1, 0, 2];
    const cols = order.map((i) => {
      const r = top[i]; if (!r) return '';
      const img = this.portrait(r.character);
      return `<div class="pod-col p${i + 1}${r.isPlayer ? ' me' : ''}" style="--kc:${hex(r.character.color)}">
        <div class="pod-portrait">${img ? `<img src="${img}" alt="">` : esc(r.name[0])}</div>
        <div class="pod-name">${esc(r.name)}</div><div class="pod-pts">${r.points} ${esc(t('res.pts'))}</div>
        <div class="pod-block"><span>${i + 1}</span></div></div>`;
    }).join('');
    const msg = me && me.place <= 3 ? t('pod.' + trophy[me.place - 1]) : t('pod.none', { p: me ? ordinalParts(me.place).n + ordinalParts(me.place).suffix : '' });
    const cup3 = me && me.place <= 3 ? `<div class="trophy ${trophy[me.place - 1]}"><div class="cupbowl"></div><div class="cupstem"></div><div class="cupbase"></div></div>` : '';
    const R = this._panel(`<div class="res-title">${esc(cupName(cup))}</div><div class="res-sub">${esc(classLabel || '')}</div>
      <div class="podium">${cols}</div>${cup3}<div class="pod-msg">${esc(msg)}</div>`,
    [{ label: t('pod.continue'), act: 'done', primary: true, icon: 'arrow' }], () => onDone && onDone());
    R.classList.add('podium-screen');
    if (me && me.place <= 3) {
      const conf = el('div', 'confetti', R);
      const cols2 = ['#edc371', '#e98c73', '#99d1b7', '#dbb2f6', '#8fd3ff', '#fff7dc'];
      for (let i = 0; i < 60; i++) {
        const c = el('i', i % 3 === 0 ? 'star' : '', conf);
        c.style.left = Math.random() * 100 + '%';
        c.style.background = cols2[i % cols2.length];
        c.style.animationDelay = (Math.random() * 2.5) + 's';
        c.style.animationDuration = (3 + Math.random() * 2.5) + 's';
      }
    }
  }

  hideResults() {
    if (this._resKey) { window.removeEventListener('keydown', this._resKey); this._resKey = null; }
    this._resBack = null;
    clearTimeout(this._resTimer); clearTimeout(this._gpTab);
    this.resultsEl.classList.remove('show', 'podium-screen');
    this.resultsEl.classList.add('hidden');
    this.resultsEl.innerHTML = '';
  }
  /** Android back / Escape on a results panel: take the last (secondary) action. */
  resultsBack() { if (this._resBack) { this._resBack(); return true; } return false; }

  get resultsVisible() { return !!this._resKey || this.resultsEl.classList.contains('show'); }

  dispose() {
    for (const off of this._offs) off();
    this._offs = [];
    this.hideResults();
    this.root.remove(); this.flashEl.remove(); this.resultsEl.remove(); this.toastEl.remove(); this.unlockEl.remove(); this.fpsEl.remove();
  }
}

export { CHARACTERS };
