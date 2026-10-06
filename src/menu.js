// Title screen, mode select (Grand Prix / Versus / Time Trial + engine class), character select, cup / course
// select with track previews and records, pause menu, gamepad navigation.
import { bus } from './events.js';
import { CHARACTERS, GAME_TITLE, CLASSES } from './config.js';
import { TRACKS, CUPS } from './tracks.js';
import { itemIcon } from './hud.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
const LAPS = [1, 2, 3, 5, 7];
const MODES = [
  { id: 'gp', name: 'GRAND PRIX', desc: 'Four races in a row. Score points, climb the standings and win a trophy.', icon: 'star' },
  { id: 'vs', name: 'VERSUS', desc: 'Pick any course and any lap count. Pure racing chaos.', icon: 'red_shell' },
  { id: 'tt', name: 'TIME TRIAL', desc: 'Just you, the clock and three mushrooms. Beat your records.', icon: 'mushroom' },
];
const THEME_COL = { beach: ['#2f9bff', '#6ee7ff'], snow: ['#7aa8e0', '#eef6ff'], desert: ['#ff8a3d', '#ffd08a'], lava: ['#6a1a4a', '#ff5a1a'] };
function fmt(t) {
  if (t == null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s2 = t - m * 60, ss = Math.floor(s2), cs = Math.floor((s2 - ss) * 100);
  return `${m}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
function load(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }

/** Draw a track outline preview from its control points (uniform Catmull-Rom). */
function trackPreview(def, mirror = false, size = 220) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const cp = def.cp.map(([x, , z]) => [x * (mirror ? -1 : 1), z]);
  const pts = [];
  const n = cp.length;
  for (let i = 0; i < n; i++) {
    const p0 = cp[(i - 1 + n) % n], p1 = cp[i], p2 = cp[(i + 1) % n], p3 = cp[(i + 2) % n];
    for (let k = 0; k < 10; k++) {
      const t = k / 10, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c2, d) => 0.5 * ((2 * b) + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const pad = size * 0.12, sc = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = (size - (maxX - minX) * sc) / 2, oz = (size - (maxZ - minZ) * sc) / 2;
  const mp = ([x, z]) => [ox + (x - minX) * sc, oz + (z - minZ) * sc];
  const path = () => { g.beginPath(); pts.forEach((p, i) => { const [x, y] = mp(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  path(); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = size * 0.075; g.stroke();
  path(); g.strokeStyle = '#fff'; g.lineWidth = size * 0.05; g.stroke();
  path(); g.strokeStyle = '#3a4466'; g.lineWidth = size * 0.028; g.stroke();
  const [sx, sy] = mp(pts[0]);
  g.fillStyle = '#ffd23f'; g.strokeStyle = '#14122b'; g.lineWidth = 3;
  g.beginPath(); g.arc(sx, sy, size * 0.035, 0, Math.PI * 2); g.fill(); g.stroke();
  return c.toDataURL();
}
const STAT_KEYS = [['speed', 'SPEED', 'SPD'], ['accel', 'ACCEL', 'ACC'], ['handling', 'HANDLING', 'HDL'], ['weight', 'WEIGHT', 'WGT']];

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const statBar = (v) => `<div class="bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</div>`;

const CONTROLS_HTML = `
  <div class="ctl"><span class="kc">HOLD E</span> Drag item behind (shield)</div>
  <div class="ctl"><span class="kc">↑</span><span class="kc">W</span> Accelerate</div>
  <div class="ctl"><span class="kc">↓</span><span class="kc">S</span> Brake / Reverse</div>
  <div class="ctl"><span class="kc">←→</span><span class="kc">A D</span> Steer</div>
  <div class="ctl"><span class="kc wide">SPACE</span> Hop / Drift</div>
  <div class="ctl"><span class="kc">E</span><span class="kc">X</span><span class="kc wide">L-SHIFT</span> Use item</div>
  <div class="ctl"><span class="kc">C</span> Look back</div>
  <div class="ctl"><span class="kc wide">ESC</span><span class="kc">P</span> Pause</div>
  <div class="ctl"><span class="kc">M</span> Mute</div>`;

export class Menu {
  constructor(uiRoot, handlers = {}) {
    this.uiRoot = uiRoot;
    this.h = handlers; // { onStart({characterIndex, difficulty, laps}), onResume, onRestart, onQuit }
    this.screen = null; // 'title' | 'select' | 'pause' | null
    this.portraitFn = null;
    this.charIndex = 0;
    this.classIndex = 1;
    this.lapsIndex = 2;
    this.modeIndex = 0;
    this.courseIndex = 0;
    this.cupIndex = 0;
    this.modeZone = 'modes';
    this.zone = 'grid';
    this.optIndex = 0;
    this.pauseIndex = 0;
    this._pad = { prev: {}, repeatT: 0, dir: null };
    this.gameState = 'title';
    try {
      const s = JSON.parse(localStorage.getItem('tkr-settings') || '{}');
      if (s.charIndex >= 0 && s.charIndex < CHARACTERS.length) this.charIndex = s.charIndex;
      if (s.classIndex >= 0 && s.classIndex < CLASSES.length) this.classIndex = s.classIndex;
      if (s.lapsIndex >= 0 && s.lapsIndex < LAPS.length) this.lapsIndex = s.lapsIndex;
      if (s.modeIndex >= 0 && s.modeIndex < MODES.length) this.modeIndex = s.modeIndex;
      if (s.courseIndex >= 0 && s.courseIndex < TRACKS.length) this.courseIndex = s.courseIndex;
      if (s.cupIndex >= 0 && s.cupIndex < CUPS.length) this.cupIndex = s.cupIndex;
    } catch (e) { /* storage unavailable */ }

    this._buildTitle();
    this._buildMode();
    this._buildSelect();
    this._buildCourse();
    this._buildPause();
    this._buildLoading();

    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
  }

  setPortraitProvider(fn) {
    this.portraitFn = fn;
    this._portraits = new Map();
    this.cards.forEach((c, i) => {
      const url = this.portrait(CHARACTERS[i]);
      if (url) { c.img.src = url; c.img.style.display = ''; c.initial.style.display = 'none'; }
    });
    this._refreshPreview();
  }
  portrait(ch) {
    if (!ch || !this.portraitFn) return '';
    this._portraits = this._portraits || new Map();
    if (this._portraits.has(ch.id)) return this._portraits.get(ch.id);
    let url = '';
    try { url = this.portraitFn(ch) || ''; } catch (e) { url = ''; }
    this._portraits.set(ch.id, url);
    return url;
  }

  // ------------------------------------------------------------------ build
  _buildTitle() {
    const t = this.titleEl = el('div', 'screen title-screen', this.uiRoot);
    const words = GAME_TITLE.toUpperCase().split(' ');
    const first = words.shift();
    t.innerHTML = `
      <div class="title-vignette"></div>
      <div class="logo">
        <div class="logo-line l1" data-text="${first}">${first}</div>
        <div class="logo-line l2" data-text="${words.join(' ')}">${words.join(' ')}</div>
        <div class="logo-swoosh"></div>
      </div>
      <div class="press-start">TAP TO RACE · ENTER</div>
      <div class="title-foot">
        <span>© Turbo Kart Rally · original procedural game</span>
        <span class="kc">M</span> mute
      </div>`;
    t.addEventListener('click', () => { if (this.screen === 'title') this._toMode(); });
  }

  _buildMode() {
    const m = this.modeEl = el('div', 'screen mode-screen', this.uiRoot);
    m.innerHTML = `
      <div class="sel-header"><div class="sel-title">SELECT MODE</div><div class="sel-back">ESC · BACK</div></div>
      <div class="mode-cards">${MODES.map((md, i) => `<div class="mode-card m-${md.id}" data-i="${i}"><img class="mc-icon" src="${itemIcon(md.icon)}" alt=""><div class="mc-name">${md.name}</div><div class="mc-desc">${md.desc}</div></div>`).join('')}</div>
      <div class="class-row"><span class="opt-lbl">ENGINE CLASS</span>${CLASSES.map((c, i) => `<div class="class-chip" data-i="${i}"><b>${c.label}</b><small>${c.sub}</small></div>`).join('')}</div>
      <div class="mode-hint">◀ ▶ choose · ▼ engine class · ENTER confirm</div>`;
    this.modeCards = [...m.querySelectorAll('.mode-card')];
    this.classChips = [...m.querySelectorAll('.class-chip')];
    this.modeCards.forEach((c, i) => {
      c.addEventListener('mouseenter', () => { if (this.screen === 'mode') { this.modeZone = 'modes'; this._setMode(i); } });
      c.addEventListener('click', () => { if (this.screen === 'mode') { this._setMode(i); this._toSelect(); } });
    });
    this.classChips.forEach((c, i) => c.addEventListener('click', () => { if (this.screen === 'mode') { this.modeZone = 'class'; this._setClass(i); } }));
    m.querySelector('.sel-back').addEventListener('click', () => this._toTitle());
    this._refreshMode();
  }

  _buildCourse() {
    const c = this.courseEl = el('div', 'screen course-screen', this.uiRoot);
    c.innerHTML = `
      <div class="sel-header"><div class="sel-title course-title">CHOOSE A COURSE</div><div class="sel-back">ESC · BACK</div></div>
      <div class="course-grid"></div>
      <div class="course-info"></div>`;
    c.querySelector('.sel-back').addEventListener('click', () => { bus.emit('ui:back'); this.showSelect(); this.h.onScreen && this.h.onScreen('select'); });
  }

  _refreshCourse() {
    const c = this.courseEl;
    const mode = MODES[this.modeIndex].id;
    const cls = CLASSES[this.classIndex];
    const grid = c.querySelector('.course-grid');
    c.querySelector('.course-title').textContent = mode === 'gp' ? 'CHOOSE A CUP' : 'CHOOSE A COURSE';
    grid.className = 'course-grid' + (mode === 'gp' ? ' cups' : '');
    this._previews = this._previews || new Map();
    const prev = (def) => {
      const key = def.id + (cls.mirror ? 'm' : '');
      if (!this._previews.has(key)) this._previews.set(key, trackPreview(def, !!cls.mirror));
      return this._previews.get(key);
    };
    if (mode === 'gp') {
      grid.innerHTML = CUPS.map((cup, i) => {
        const tr = load(`tkr-trophy-${cup.id}-${cls.id}`);
        const trophy = tr ? `<div class="cup-trophy t${tr}">${['', 'GOLD', 'SILVER', 'BRONZE'][tr]}</div>` : '<div class="cup-trophy none">NO TROPHY</div>';
        return `<div class="course-card cup-card" data-i="${i}" style="--c1:${cup.color}">
          <div class="cup-name">${cup.name.toUpperCase()}</div>
          <div class="cup-tracks">${cup.tracks.map((id, k) => { const d = TRACKS.find((t) => t.id === id); return `<div class="cup-trk"><img src="${prev(d)}" alt=""><span>${k + 1}. ${d.short}</span></div>`; }).join('')}</div>
          ${trophy}</div>`;
      }).join('');
    } else {
      grid.innerHTML = TRACKS.map((d, i) => {
        const [c1, c2] = THEME_COL[d.theme] || THEME_COL.beach;
        const rec = mode === 'tt' ? load(`tkr-tt-${d.id}${cls.mirror ? '-m' : ''}`) : null;
        return `<div class="course-card" data-i="${i}" style="--c1:${c1};--c2:${c2}">
          <img class="cc-map" src="${prev(d)}" alt="">
          <div class="cc-name">${d.name.toUpperCase()}</div>
          <div class="cc-blurb">${d.blurb}</div>
          ${mode === 'tt' ? `<div class="cc-rec">RECORD <b>${rec && rec.time ? fmt(rec.time) : '--:--.--'}</b> · LAP <b>${rec && rec.lap ? fmt(rec.lap) : '--:--.--'}</b></div>` : ''}
        </div>`;
      }).join('');
    }
    this.courseCards = [...grid.querySelectorAll('.course-card')];
    this.courseCards.forEach((cd, i) => {
      cd.addEventListener('mouseenter', () => { if (this.screen === 'course') this._setCourse(i); });
      cd.addEventListener('click', () => { if (this.screen === 'course') { this._setCourse(i); this._start(); } });
    });
    const info = c.querySelector('.course-info');
    info.innerHTML = `${MODES[this.modeIndex].name} · ${cls.label} ${cls.sub}${mode === 'vs' ? ` · ${LAPS[this.lapsIndex]} LAPS` : ' · 3 LAPS'} · ${CHARACTERS[this.charIndex].name.toUpperCase()}`;
    this._setCourse(mode === 'gp' ? this.cupIndex : this.courseIndex, true);
  }

  _setCourse(i, silent) {
    const mode = MODES[this.modeIndex].id;
    const n = this.courseCards.length;
    i = (i + n) % n;
    const cur = mode === 'gp' ? this.cupIndex : this.courseIndex;
    if (i !== cur && !silent) bus.emit('ui:move');
    if (mode === 'gp') this.cupIndex = i; else this.courseIndex = i;
    this.courseCards.forEach((c, j) => c.classList.toggle('focus', j === i));
  }

  _setMode(i, silent) {
    i = (i + MODES.length) % MODES.length;
    if (i !== this.modeIndex && !silent) bus.emit('ui:move');
    this.modeIndex = i;
    this._refreshMode();
  }
  _setClass(i) {
    i = (i + CLASSES.length) % CLASSES.length;
    if (i !== this.classIndex) bus.emit('ui:move');
    this.classIndex = i;
    this._refreshMode();
    this._refreshOpts();
  }
  _refreshMode() {
    if (!this.modeCards) return;
    this.modeCards.forEach((c, j) => { c.classList.toggle('selected', j === this.modeIndex); c.classList.toggle('focus', j === this.modeIndex && this.modeZone === 'modes'); });
    this.classChips.forEach((c, j) => { c.classList.toggle('selected', j === this.classIndex); c.classList.toggle('focus', j === this.classIndex && this.modeZone === 'class'); });
  }

  _buildSelect() {
    const s = this.selectEl = el('div', 'screen select-screen', this.uiRoot);
    s.innerHTML = `
      <div class="sel-header"><div class="sel-title">CHOOSE YOUR RACER</div><div class="sel-back">ESC · BACK</div></div>
      <div class="sel-body">
        <div class="sel-grid"></div>
        <div class="sel-side">
          <div class="preview">
            <div class="pv-portrait"><img alt=""><span class="pv-initial"></span></div>
            <div class="pv-info">
              <div class="pv-name"></div>
              <div class="pv-kart"><span class="swatch"></span><span class="pv-kart-lbl"></span></div>
              <div class="pv-stats"></div>
            </div>
          </div>
          <div class="opts">
            <div class="opt" data-i="0"><span class="opt-lbl">LEVEL</span><span class="opt-arrow l">◀</span><span class="opt-val"></span><span class="opt-arrow r">▶</span></div>
            <div class="opt" data-i="1"><span class="opt-lbl">LAPS</span><span class="opt-arrow l">◀</span><span class="opt-val"></span><span class="opt-arrow r">▶</span></div>
            <button class="btn primary race-btn" data-i="2">NEXT ▶</button>
            <button class="btn online-race-btn" type="button">PLAY ONLINE</button>
          </div>
        </div>
      </div>
      <div class="controls-help">${CONTROLS_HTML}</div>`;
    const grid = s.querySelector('.sel-grid');
    this.cards = CHARACTERS.map((ch, i) => {
      const card = el('div', 'card', grid);
      card.style.setProperty('--kc', hex(ch.color));
      card.style.setProperty('--ka', hex(ch.accent));
      card.innerHTML = `
        <div class="card-portrait"><img alt="" style="display:none"><span class="initial">${ch.name[0]}</span></div>
        <div class="card-name">${ch.name}</div>
        <div class="card-stats">${STAT_KEYS.map(([k, , sh]) => `<div class="st"><span>${sh}</span>${statBar(ch.stats[k])}</div>`).join('')}</div>`;
      card.addEventListener('mouseenter', () => { if (this.screen === 'select') { this.zone = 'grid'; this._setChar(i); } });
      card.addEventListener('click', () => { if (this.screen === 'select') { this._setChar(i); this._confirmChar(); } });
      card.addEventListener('dblclick', () => { if (this.screen === 'select') this._start(); });
      return { card, img: card.querySelector('img'), initial: card.querySelector('.initial') };
    });
    this.pv = {
      img: s.querySelector('.pv-portrait img'),
      initial: s.querySelector('.pv-initial'),
      portrait: s.querySelector('.pv-portrait'),
      name: s.querySelector('.pv-name'),
      swatch: s.querySelector('.swatch'),
      kartLbl: s.querySelector('.pv-kart-lbl'),
      stats: s.querySelector('.pv-stats'),
    };
    this.optEls = [...s.querySelectorAll('.opts [data-i]')];
    this.optEls.forEach((o, i) => {
      o.addEventListener('mouseenter', () => { if (this.screen === 'select' && !o.classList.contains('disabled')) { this.zone = 'opts'; this.optIndex = i; this._refreshFocus(); } });
      if (i < 2) {
        o.querySelector('.l').addEventListener('click', (e) => { e.stopPropagation(); this.zone = 'opts'; this.optIndex = i; this._changeOpt(-1); });
        o.querySelector('.r').addEventListener('click', (e) => { e.stopPropagation(); this.zone = 'opts'; this.optIndex = i; this._changeOpt(1); });
        o.querySelector('.opt-val').addEventListener('click', () => { this.zone = 'opts'; this.optIndex = i; this._changeOpt(1); });
      } else {
        o.addEventListener('click', () => this._toCourse());
      }
    });
    s.querySelector('.online-race-btn').addEventListener('click', () => {
      if (this.screen === 'select') this.h.onOnline?.(this.settings);
    });
    s.querySelector('.sel-back').addEventListener('click', () => this._toModeBack());
    this._refreshPreview();
    this._refreshOpts();
  }

  _buildPause() {
    const p = this.pauseEl = el('div', 'screen pause-screen', this.uiRoot);
    p.innerHTML = `
      <div class="pause-panel">
        <div class="pause-title">PAUSED</div>
        <button class="btn" data-a="resume">RESUME</button>
        <button class="btn" data-a="restart">RESTART</button>
        <button class="btn" data-a="quit">QUIT TO MENU</button>
        <div class="controls-help compact">${CONTROLS_HTML}</div>
      </div>`;
    this.pauseBtns = [...p.querySelectorAll('.btn')];
    this.pauseBtns.forEach((b, i) => {
      b.addEventListener('mouseenter', () => { if (this.pauseIndex !== i) { this.pauseIndex = i; this._refreshPause(); bus.emit('ui:move'); } });
      b.addEventListener('click', () => this._pauseAct(b.dataset.a));
    });
  }

  _buildLoading() {
    this.loadingEl = el('div', 'screen loading-screen', this.uiRoot, '<div class="spinner"></div><div class="loading-text">LOADING</div>');
  }

  // ------------------------------------------------------------------ screens
  _showOnly(elm) {
    for (const s of [this.titleEl, this.modeEl, this.selectEl, this.courseEl, this.pauseEl, this.loadingEl]) s.classList.toggle('active', s === elm);
  }
  showTitle() { this.screen = 'title'; this._showOnly(this.titleEl); }
  showMode() { this.screen = 'mode'; this.modeZone = 'modes'; this._refreshMode(); this._showOnly(this.modeEl); }
  showCourse() { this.screen = 'course'; this._refreshCourse(); this._showOnly(this.courseEl); }
  showSelect() {
    this.screen = 'select'; this.zone = 'grid';
    this._showOnly(this.selectEl);
    this._setChar(this.charIndex, true);
    this._refreshOpts();
  }
  showPause() { this.screen = 'pause'; this.pauseIndex = 0; this._refreshPause(); this._showOnly(this.pauseEl); }
  showLoading(text = 'LOADING') {
    this.screen = 'loading';
    this.loadingEl.querySelector('.loading-text').textContent = text;
    this._showOnly(this.loadingEl);
  }
  hideAll() { this.screen = null; this._showOnly(null); }
  get settings() {
    const mode = MODES[this.modeIndex].id;
    return {
      gameMode: mode, characterIndex: this.charIndex, classId: CLASSES[this.classIndex].id, laps: LAPS[this.lapsIndex],
      trackId: TRACKS[this.courseIndex].id, cupId: CUPS[this.cupIndex].id,
    };
  }

  _toMode() { bus.emit('ui:confirm'); this.showMode(); this.h.onScreen && this.h.onScreen('mode'); }
  _toModeBack() { bus.emit('ui:back'); this.showMode(); this.h.onScreen && this.h.onScreen('mode'); }
  _toSelect() { bus.emit('ui:confirm'); this.showSelect(); this.h.onScreen && this.h.onScreen('select'); }
  _toCourse() { if (this.screen !== 'select') return; bus.emit('ui:confirm'); this.showCourse(); this.h.onScreen && this.h.onScreen('course'); }
  _toTitle() { bus.emit('ui:back'); this.showTitle(); this.h.onScreen && this.h.onScreen('title'); }

  _setChar(i, silent) {
    i = (i + CHARACTERS.length) % CHARACTERS.length;
    if (i !== this.charIndex && !silent) bus.emit('ui:move');
    this.charIndex = i;
    this.cards.forEach((c, j) => c.card.classList.toggle('selected', j === i));
    this._refreshPreview();
    this._refreshFocus();
  }
  _confirmChar() {
    bus.emit('ui:confirm');
    this.zone = 'opts'; this.optIndex = 2;
    const c = this.cards[this.charIndex].card;
    c.classList.remove('picked'); void c.offsetWidth; c.classList.add('picked');
    this._refreshFocus();
  }
  _refreshPreview() {
    if (!this.pv) return;
    const ch = CHARACTERS[this.charIndex];
    const url = this.portrait(ch);
    if (url) { this.pv.img.src = url; this.pv.img.style.display = ''; this.pv.initial.style.display = 'none'; }
    else { this.pv.img.style.display = 'none'; this.pv.initial.style.display = ''; this.pv.initial.textContent = ch.name[0]; }
    this.pv.portrait.style.setProperty('--kc', hex(ch.color));
    this.pv.name.textContent = ch.name.toUpperCase();
    this.pv.swatch.style.background = `linear-gradient(135deg, ${hex(ch.color)} 60%, ${hex(ch.accent)} 60%)`;
    this.pv.kartLbl.textContent = `${ch.hat.toUpperCase()} · KART`;
    this.pv.stats.innerHTML = STAT_KEYS.map(([k, l]) => `<div class="st big"><span>${l}</span>${statBar(ch.stats[k])}</div>`).join('');
    this.pv.portrait.classList.remove('pop'); void this.pv.portrait.offsetWidth; this.pv.portrait.classList.add('pop');
  }
  _refreshOpts() {
    if (!this.optEls) return;
    const c = CLASSES[this.classIndex];
    this.optEls[0].querySelector('.opt-val').textContent = `${c.label} · ${c.sub}`;
    const vs = MODES[this.modeIndex].id === 'vs';
    this.optEls[1].querySelector('.opt-val').textContent = vs ? `${LAPS[this.lapsIndex]} LAP${LAPS[this.lapsIndex] > 1 ? 'S' : ''}` : '3 LAPS';
    this.optEls[1].classList.toggle('disabled', !vs);
  }
  _refreshFocus() {
    this.cards.forEach((c, j) => c.card.classList.toggle('focus', this.zone === 'grid' && j === this.charIndex));
    this.optEls.forEach((o, j) => o.classList.toggle('focus', this.zone === 'opts' && j === this.optIndex));
  }
  _changeOpt(d) {
    if (this.optIndex === 0) this.classIndex = (this.classIndex + d + CLASSES.length) % CLASSES.length;
    else if (this.optIndex === 1) { if (MODES[this.modeIndex].id !== 'vs') return; this.lapsIndex = (this.lapsIndex + d + LAPS.length) % LAPS.length; }
    else return;
    bus.emit('ui:move');
    this._refreshOpts(); this._refreshFocus();
    const v = this.optEls[this.optIndex].querySelector('.opt-val');
    v.classList.remove('bump'); void v.offsetWidth; v.classList.add('bump');
  }
  _start() {
    if (this.screen !== 'course') return;
    try {
      localStorage.setItem('tkr-settings', JSON.stringify({ charIndex: this.charIndex, classIndex: this.classIndex, lapsIndex: this.lapsIndex,
        modeIndex: this.modeIndex, courseIndex: this.courseIndex, cupIndex: this.cupIndex }));
    } catch (e) { /* ignore */ }
    bus.emit('ui:confirm');
    this.h.onStart && this.h.onStart(this.settings);
  }
  _gridCols() {
    try {
      const g = this.selectEl.querySelector('.sel-grid');
      const n = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length;
      return n >= 1 && n <= 8 ? n : 2;
    } catch (e) { return 2; }
  }
  _refreshPause() { this.pauseBtns.forEach((b, i) => b.classList.toggle('focus', i === this.pauseIndex)); }
  _pauseAct(a) {
    if (this.screen !== 'pause') return;
    bus.emit('ui:confirm');
    if (a === 'resume') this.h.onResume && this.h.onResume();
    else if (a === 'restart') this.h.onRestart && this.h.onRestart();
    else if (a === 'quit') this.h.onQuit && this.h.onQuit();
  }

  // ------------------------------------------------------------------ input
  _key(e) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable) return;
    const c = e.code;
    const isEnter = c === 'Enter' || c === 'NumpadEnter' || c === 'Space';
    if (this.screen === 'title') {
      if ((isEnter || c === 'KeyE') && !e.repeat) { e.preventDefault(); this._toMode(); }
      return;
    }
    const up = c === 'ArrowUp' || c === 'KeyW', down = c === 'ArrowDown' || c === 'KeyS';
    const left = c === 'ArrowLeft' || c === 'KeyA', right = c === 'ArrowRight' || c === 'KeyD';
    const back = c === 'Escape' || c === 'Backspace';
    if (this.screen === 'mode') {
      if (up || down || left || right || isEnter) e.preventDefault();
      if (back) { this._toTitle(); return; }
      if (this.modeZone === 'modes') {
        if (left) this._setMode(this.modeIndex - 1);
        else if (right) this._setMode(this.modeIndex + 1);
        else if (down) { this.modeZone = 'class'; bus.emit('ui:move'); this._refreshMode(); }
        else if (isEnter && !e.repeat) this._toSelect();
      } else {
        if (left) this._setClass(this.classIndex - 1);
        else if (right) this._setClass(this.classIndex + 1);
        else if (up) { this.modeZone = 'modes'; bus.emit('ui:move'); this._refreshMode(); }
        else if (isEnter && !e.repeat) this._toSelect();
      }
      return;
    }
    if (this.screen === 'course') {
      if (up || down || left || right || isEnter) e.preventDefault();
      if (back) { bus.emit('ui:back'); this.showSelect(); this.h.onScreen && this.h.onScreen('select'); return; }
      const cur = MODES[this.modeIndex].id === 'gp' ? this.cupIndex : this.courseIndex;
      const cols = MODES[this.modeIndex].id === 'gp' ? this.courseCards.length : 2;
      if (left) this._setCourse(cur - 1);
      else if (right) this._setCourse(cur + 1);
      else if (up) this._setCourse(cur - cols);
      else if (down) this._setCourse(cur + cols);
      else if (isEnter && !e.repeat) this._start();
      return;
    }
    if (this.screen === 'select') {
      if (up || down || left || right || isEnter) e.preventDefault();
      if (back) {
        if (this.zone === 'opts') { this.zone = 'grid'; this._refreshFocus(); bus.emit('ui:back'); }
        else this._toModeBack();
        return;
      }
      if (this.zone === 'grid') {
        const cols = this._gridCols(), i = this.charIndex, col = i % cols, row = Math.floor(i / cols), rows = Math.ceil(CHARACTERS.length / cols);
        if (left) this._setChar(col === 0 ? i + cols - 1 : i - 1);
        else if (right) {
          if (col === cols - 1) { this.zone = 'opts'; this.optIndex = 0; bus.emit('ui:move'); this._refreshFocus(); }
          else this._setChar(i + 1);
        } else if (up) this._setChar(((row - 1 + rows) % rows) * cols + col);
        else if (down) this._setChar(((row + 1) % rows) * cols + col);
        else if (isEnter && !e.repeat) this._confirmChar();
      } else {
        if (up) {
          if (this.optIndex === 0) { this.zone = 'grid'; } else this.optIndex--;
          bus.emit('ui:move'); this._refreshFocus();
        } else if (down) { this.optIndex = Math.min(2, this.optIndex + 1); bus.emit('ui:move'); this._refreshFocus(); }
        else if (left) {
          if (this.optIndex === 2) { this.zone = 'grid'; bus.emit('ui:move'); this._refreshFocus(); } else this._changeOpt(-1);
        } else if (right) { if (this.optIndex < 2) this._changeOpt(1); }
        else if (isEnter && !e.repeat) { if (this.optIndex === 2) this._toCourse(); else this._changeOpt(1); }
      }
      return;
    }
    if (this.screen === 'pause') {
      if (c === 'ArrowUp' || c === 'KeyW') { this.pauseIndex = (this.pauseIndex + 2) % 3; this._refreshPause(); bus.emit('ui:move'); e.preventDefault(); }
      else if (c === 'ArrowDown' || c === 'KeyS') { this.pauseIndex = (this.pauseIndex + 1) % 3; this._refreshPause(); bus.emit('ui:move'); e.preventDefault(); }
      else if (isEnter && !e.repeat) { e.preventDefault(); this._pauseAct(this.pauseBtns[this.pauseIndex].dataset.a); }
    }
  }

  /** Poll gamepads; translate to synthetic key presses for menus (and Start -> Escape for pause). */
  update(dt, gameState) {
    this.gameState = gameState;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads || []) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const now = {
      up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
      a: b(0), b: b(1), start: b(9),
    };
    const prev = this._pad.prev;
    const inMenu = ['title', 'mode', 'select', 'course', 'pause'].includes(this.screen) || gameState === 'results';
    const fire = (code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    };
    if (inMenu) {
      const dirs = [['up', 'ArrowUp'], ['down', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight']];
      let held = null;
      for (const [k, code] of dirs) {
        if (now[k] && !prev[k]) { fire(code); this._pad.repeatT = 0.4; }
        if (now[k]) held = code;
      }
      if (held) { this._pad.repeatT -= dt; if (this._pad.repeatT <= 0) { fire(held); this._pad.repeatT = 0.14; } }
      if (now.a && !prev.a) fire('Enter');
      if (now.b && !prev.b) fire(this.screen === 'pause' ? 'Escape' : 'Backspace');
    }
    if (now.start && !prev.start) fire(this.screen === 'title' ? 'Enter' : 'Escape');
    if (gameState === 'intro' && now.a && !prev.a) fire('Enter');
    this._pad.prev = now;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    for (const s of [this.titleEl, this.modeEl, this.selectEl, this.courseEl, this.pauseEl, this.loadingEl]) s.remove();
  }
}
