// Lumen Kart — menus: Title → Mode → Class → Cup/Course → Driver → race, plus Pause, Settings and Loading.
// Screens are re-rendered from data (so a language switch is instant); events are delegated through
// data-act attributes; keyboard / gamepad use a spatial focus model over [data-nav] elements.
import { bus } from './events.js';
import { CHARACTERS, CLASSES } from './config.js';
import { TRACKS, CUPS } from './tracks.js';
import { t, esc, trackName, trackBlurb, cupName, className, characterTitle, formatTime, getLanguage, ordinal } from './i18n.js';
import { svgIcon, logoEmblemSVG, itemIcon } from './icons.js';
import {
  SCARVES, isCupUnlocked, isClassUnlocked, isCharacterUnlocked, isTrackUnlocked, isScarfUnlocked, medal, recordKey, trophyCount,
} from './save.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
const LAPS = [1, 2, 3, 5];
const STAT_KEYS = ['speed', 'accel', 'handling', 'weight'];
const APP_VERSION = (() => { try { return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : (import.meta.env?.VITE_APP_VERSION || 'dev'); } catch { return 'dev'; } })();
const ONLINE = (() => { try { return !!import.meta.env?.VITE_WS_URL; } catch { return false; } })();
const THEME_COL = {
  meadow: ['#9fd889', '#ffd59a'], beach: ['#5cc8d6', '#bff2e6'], lagoon: ['#5cc8d6', '#bff2e6'], jungle: ['#4fae6f', '#c9ec9a'],
  desert: ['#f0a868', '#ffe1a6'], medina: ['#5b9be0', '#f4f7ff'], city: ['#8f86d8', '#ffc9b5'], snow: ['#8ab8e8', '#e8f6ff'],
  aurora: ['#6ab8c8', '#cfe8ff'], lava: ['#4a3d9c', '#b9a8ff'], night: ['#4a3d9c', '#b9a8ff'],
};
const CUP_COL = ['#f3c97a', '#b9a3ec', '#8fd3ff'];

function cupList() { return Array.isArray(CUPS) && CUPS.length ? CUPS : []; }
function cupIds() { return cupList().map((c) => c.id); }
function trackDef(id) { return TRACKS.find((d) => d.id === id) || null; }
function classById(id) { return CLASSES.find((c) => c.id === id) || CLASSES[1] || CLASSES[0]; }

/** Track outline preview from control points (uniform Catmull-Rom), drawn in LUMEN ink. */
function trackPreview(def, mirror = false, size = 200) {
  try {
    if (!def || !Array.isArray(def.cp) || def.cp.length < 3) return '';
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const cp = def.cp.map(([x, , z]) => [x * (mirror ? -1 : 1), z]);
    const pts = [];
    const n = cp.length;
    for (let i = 0; i < n; i++) {
      const p0 = cp[(i - 1 + n) % n], p1 = cp[i], p2 = cp[(i + 1) % n], p3 = cp[(i + 2) % n];
      for (let k = 0; k < 10; k++) {
        const tt = k / 10, t2 = tt * tt, t3 = t2 * tt;
        const f = (a, b, c2, d) => 0.5 * ((2 * b) + (-a + c2) * tt + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
        pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const pad = size * 0.13, sc = (size - pad * 2) / Math.max(1, maxX - minX, maxZ - minZ);
    const ox = (size - (maxX - minX) * sc) / 2, oz = (size - (maxZ - minZ) * sc) / 2;
    const mp = ([x, z]) => [ox + (x - minX) * sc, oz + (z - minZ) * sc];
    const path = () => { g.beginPath(); pts.forEach((p, i) => { const [x, y] = mp(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
    g.lineJoin = 'round'; g.lineCap = 'round';
    path(); g.strokeStyle = 'rgba(37,77,69,0.9)'; g.lineWidth = size * 0.085; g.stroke();
    path(); g.strokeStyle = '#fff7dc'; g.lineWidth = size * 0.045; g.stroke();
    const [sx, sy] = mp(pts[0]);
    g.fillStyle = '#edc371'; g.strokeStyle = '#254d45'; g.lineWidth = size * 0.018;
    g.beginPath(); g.arc(sx, sy, size * 0.04, 0, Math.PI * 2); g.fill(); g.stroke();
    return c.toDataURL();
  } catch { return ''; }
}

const pips = (v, max = 5) => `<span class="pips" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('')}</span>`;
const medalDot = (place, label) => `<span class="medal m${place || 0}" title="${esc(label)}">${place ? svgIcon('trophy') : ''}<small>${esc(label)}</small></span>`;

export class Menu {
  /**
   * @param {HTMLElement} uiRoot
   * @param {object} handlers { onStart(settings), onOnline(settings), onResume, onRestart, onQuit, onScreen(name),
   *   onSettingsChange(patch), onScarf(id), onResetProgress(), onLocked(msg) }
   * @param {object} ctx { getSave(), getSettings(), portraitFor(character) }
   */
  constructor(uiRoot, handlers = {}, ctx = {}) {
    this.uiRoot = uiRoot;
    this.h = handlers;
    this.ctx = ctx;
    this.screen = null;
    this.portraitFn = null;
    this._portraits = new Map();
    this._previews = new Map();
    this.charIndex = 0;
    this.modeId = 'gp';
    this.classId = '100cc';
    this.cupId = cupList()[0]?.id || null;
    this.trackId = TRACKS[0]?.id || null;
    this.laps = 3;
    this.settingsReturn = 'title';
    this.focusEl = null;
    this._pad = { prev: {}, repeatT: 0, dir: null };
    this.gameState = 'title';
    this._resetArm = 0;
    this._restoreLast();

    this.root = document.createElement('div');
    this.root.className = 'menus';
    uiRoot.appendChild(this.root);
    this.els = {};
    for (const name of ['title', 'mode', 'class', 'course', 'select', 'pause', 'settings', 'credits', 'loading']) {
      const e = document.createElement('div');
      e.className = `screen ${name}-screen`;
      e.dataset.screen = name;
      this.root.appendChild(e);
      this.els[name] = e;
    }
    // aliases kept for older call sites / tests
    this.titleEl = this.els.title; this.selectEl = this.els.select; this.pauseEl = this.els.pause; this.loadingEl = this.els.loading;
    this.els.loading.innerHTML = `<div class="loading-card"><div class="loading-emblem">${logoEmblemSVG()}</div><div class="loading-text"></div><div class="loading-dots"><i></i><i></i><i></i></div></div>`;

    this.root.addEventListener('click', (e) => this._onClick(e));
    this.root.addEventListener('input', (e) => this._onInput(e));
    this.root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest?.('[data-nav]');
      if (el && this.root.contains(el) && !el.disabled) this._setFocus(el, { silent: true, hover: true });
    });
    this.root.addEventListener('pointerdown', () => document.body.classList.remove('kbd-nav'));
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
  }

  _restoreLast() {
    const s = this._settings();
    const l = s?.last;
    if (!l) return;
    if (['gp', 'vs', 'tt'].includes(l.mode)) this.modeId = l.mode;
    if (CLASSES.some((c) => c.id === l.classId)) this.classId = l.classId;
    if (l.cupId && cupList().some((c) => c.id === l.cupId)) this.cupId = l.cupId;
    if (l.trackId && trackDef(l.trackId)) this.trackId = l.trackId;
    if (l.charIndex >= 0 && l.charIndex < CHARACTERS.length) this.charIndex = l.charIndex;
    if (LAPS.includes(l.laps)) this.laps = l.laps;
  }
  _save() { try { return this.ctx.getSave?.() || null; } catch { return null; } }
  _settings() { try { return this.ctx.getSettings?.() || null; } catch { return null; } }
  _character(i) {
    const ch = CHARACTERS[i];
    try { return (this.ctx.characterFor && this.ctx.characterFor(ch)) || ch; } catch { return ch; }
  }

  setPortraitProvider(fn) { this.portraitFn = fn; this._portraits.clear(); if (this.screen) this._render(this.screen); }
  portrait(ch) {
    if (!ch || !this.portraitFn) return '';
    const key = `${ch.id}:${ch.accent}:${ch.scarf}`;
    if (this._portraits.has(key)) return this._portraits.get(key);
    let url = '';
    try { url = this.portraitFn(ch) || ''; } catch { url = ''; }
    this._portraits.set(key, url);
    return url;
  }
  _preview(def, mirror) {
    if (!def) return '';
    const key = def.id + (mirror ? ':m' : '');
    if (!this._previews.has(key)) this._previews.set(key, trackPreview(def, mirror));
    return this._previews.get(key);
  }

  // ------------------------------------------------------------------ public screen API
  get settings() {
    const cls = classById(this.classId);
    return {
      gameMode: this.modeId, characterIndex: this.charIndex, classId: cls.id,
      laps: this.modeId === 'vs' ? this.laps : 3,
      trackId: this.trackId || TRACKS[0]?.id, cupId: this.cupId || cupList()[0]?.id,
    };
  }
  showTitle() { this._show('title'); }
  showMode() { this._show('mode'); }
  showSelect() { this._show('select'); }
  showCourse() { this._show('course'); }
  showPause() { this._show('pause'); }
  showSettings(returnTo = this.screen === 'pause' ? 'pause' : 'title') { this.settingsReturn = returnTo; this._resetArm = 0; this._show('settings'); }
  showLoading(text = t('loading.loading')) {
    this.els.loading.querySelector('.loading-text').textContent = text;
    this._show('loading', false);
  }
  hideAll() { this.screen = null; this._showOnly(null); document.body.dataset.menu = ''; }
  refresh() { if (this.screen && this.screen !== 'loading') this._render(this.screen, true); }

  _show(name, render = true) {
    const prev = this.screen;
    this.screen = name;
    document.body.dataset.menu = name || '';
    if (render) this._render(name);
    this._showOnly(this.els[name]);
    if (prev !== name) this._setFocus(this._defaultFocus(), { silent: true });
    this.h.onScreen?.(name);
  }
  _showOnly(elm) { for (const s of Object.values(this.els)) s.classList.toggle('active', s === elm); }

  _render(name, keepFocus = false) {
    const key = keepFocus && this.focusEl ? this._focusKey(this.focusEl) : null;
    const el = this.els[name];
    if (!el) return;
    switch (name) {
      case 'title': el.innerHTML = this._titleHTML(); break;
      case 'mode': el.innerHTML = this._modeHTML(); break;
      case 'class': el.innerHTML = this._classHTML(); break;
      case 'course': el.innerHTML = this._courseHTML(); break;
      case 'select': el.innerHTML = this._selectHTML(); this._refreshPreview(); break;
      case 'pause': el.innerHTML = this._pauseHTML(); break;
      case 'settings': el.innerHTML = this._settingsHTML(); break;
      case 'credits': el.innerHTML = this._creditsHTML(); break;
      default: return;
    }
    if (key) { const again = el.querySelector(`[data-key="${CSS.escape(key)}"]`); if (again) this._setFocus(again, { silent: true }); }
    else if (keepFocus) this._setFocus(this._defaultFocus(), { silent: true });
  }
  _focusKey(el) { return el?.dataset?.key || null; }

  // ------------------------------------------------------------------ templates
  _head(title, back = true) {
    return `<header class="menu-head">${back ? `<button class="back-btn" data-act="back" data-nav data-key="back" data-testid="back" aria-label="${esc(t('common.back'))}">${svgIcon('back')}<span>${esc(t('common.back'))}</span></button>` : '<span></span>'}
      <h2 class="menu-title">${esc(title)}</h2><span class="head-spacer"></span></header>`;
  }

  _titleHTML() {
    const save = this._save();
    const notes = save?.notes || 0;
    const trophies = save ? trophyCount(save) : 0;
    return `<div class="title-shade"></div>
      <div class="title-top">
        <div class="chip" title="${esc(t('title.notes'))}">${svgIcon('note')}<b>${notes}</b></div>
        <div class="chip" title="${esc(t('title.trophies'))}">${svgIcon('trophy')}<b>${trophies}</b></div>
        <span class="grow"></span>
        <button class="icon-btn" data-act="settings" data-nav data-key="settings" data-testid="title-settings" aria-label="${esc(t('title.settings'))}">${svgIcon('gear')}</button>
      </div>
      <div class="logo">
        <div class="logo-emblem">${logoEmblemSVG()}</div>
        <div class="logo-text">
          <h1 class="logo-word"><span class="logo-spark">${svgIcon('sparkle')}</span>Lumen<span class="logo-kart">Kart</span></h1>
          <p class="logo-tag">${esc(t('app.tagline'))}</p>
        </div>
      </div>
      <button class="hero-btn" data-act="play" data-nav data-key="play" data-testid="title-play">${svgIcon('play')}<span>${esc(t('title.play'))}</span></button>
      <div class="title-foot"><span>${esc(t('app.about'))}</span><span>v${esc(APP_VERSION)}</span></div>`;
  }

  _modeHTML() {
    const modes = [
      { id: 'gp', icon: 'trophy', tone: 'gold' }, { id: 'vs', icon: 'flag', tone: 'mint' }, { id: 'tt', icon: 'timer', tone: 'sky' },
      ...(ONLINE ? [{ id: 'online', icon: 'globe', tone: 'comet' }] : []),
    ];
    return `${this._head(t('mode.title'))}
      <div class="card-row mode-cards n${modes.length}">${modes.map((m) => `
        <button class="mode-card m-${m.id} tone-${m.tone}${this.modeId === m.id ? ' selected' : ''}" data-act="mode" data-v="${m.id}" data-nav data-key="mode-${m.id}" data-testid="mode-${m.id}">
          <span class="mc-icon">${svgIcon(m.icon)}</span>
          <span class="mc-name">${esc(t('mode.' + m.id))}</span>
          <span class="mc-desc">${esc(t('mode.' + m.id + '.desc'))}</span>
        </button>`).join('')}
      </div>`;
  }

  _classHTML() {
    const save = this._save();
    const ids = cupIds();
    const speedPips = { '50cc': 1, '100cc': 2, '150cc': 3, '200cc': 5, mirror: 3 };
    return `${this._head(t('class.title'))}
      <div class="card-row class-cards">${CLASSES.map((c) => {
        const locked = save ? !isClassUnlocked(save, c.id, ids) : false;
        const assist = c.id === '50cc' && (this._settings()?.assist || 'auto') !== 'off';
        return `<button class="class-card${this.classId === c.id ? ' selected' : ''}${locked ? ' locked' : ''}" data-act="class" data-v="${c.id}" data-nav data-key="class-${c.id}" data-testid="class-${c.id}" ${locked ? 'aria-disabled="true"' : ''}>
          <span class="cc-label">${c.mirror ? svgIcon('sparkle') : esc(c.label)}</span>
          <span class="cc-name">${esc(className(c))}</span>
          <span class="cc-speed">${pips(speedPips[c.id] || 3)}</span>
          <span class="cc-desc">${esc(locked ? t('class.mirror.locked') : t('class.' + c.id + '.desc'))}</span>
          ${assist ? `<span class="cc-tag">${esc(t('class.assist'))}</span>` : ''}
          ${locked ? `<span class="lock-badge">${svgIcon('lock')}</span>` : ''}
        </button>`;
      }).join('')}</div>`;
  }

  _courseHTML() {
    const save = this._save();
    const cls = classById(this.classId);
    const cups = cupList();
    const ids = cupIds();
    const mode = this.modeId;
    let body = '';
    if (mode === 'gp') {
      body = `<div class="cup-cards">${cups.map((cup, i) => {
        const locked = save ? !isCupUnlocked(save, cup.id, ids) : false;
        const prevCup = cups[i - 1];
        const medals = CLASSES.map((c) => medalDot(save ? medal(save, cup.id, c.id) : null, c.mirror ? '⟷' : c.label)).join('');
        return `<button class="cup-card${this.cupId === cup.id ? ' selected' : ''}${locked ? ' locked' : ''}" style="--cup:${CUP_COL[i % CUP_COL.length]}" data-act="cup" data-v="${esc(cup.id)}" data-nav data-key="cup-${esc(cup.id)}" data-testid="cup-${esc(cup.id)}">
          <span class="cup-head"><span class="cup-emblem">${svgIcon(i === 0 ? 'sparkle' : 'star')}</span><span class="cup-name">${esc(cupName(cup))}</span></span>
          <span class="cup-tracks">${(cup.tracks || []).map((id, k) => { const d = trackDef(id); return `<span class="cup-trk"><img src="${this._preview(d, !!cls.mirror)}" alt=""><small>${k + 1}. ${esc(trackName(d))}</small></span>`; }).join('')}</span>
          <span class="cup-medals">${medals}</span>
          ${locked ? `<span class="lock-cover">${svgIcon('lock')}<span>${esc(t('course.locked.dusk', { cup: cupName(prevCup) }))}</span></span>` : ''}
        </button>`;
      }).join('')}</div>`;
    } else {
      body = `<div class="track-cards">${TRACKS.map((d) => {
        const locked = save ? !isTrackUnlocked(save, d.id, cups) : false;
        const [c1, c2] = THEME_COL[d.theme] || THEME_COL.meadow;
        const holder = cups.find((c) => (c.tracks || []).includes(d.id));
        const rec = mode === 'tt' && save ? save.records[recordKey(d.id, !!cls.mirror)] : null;
        return `<button class="track-card${this.trackId === d.id ? ' selected' : ''}${locked ? ' locked' : ''}" style="--c1:${c1};--c2:${c2}" data-act="track" data-v="${esc(d.id)}" data-nav data-key="track-${esc(d.id)}" data-testid="track-${esc(d.id)}">
          <img class="tc-map" src="${this._preview(d, !!cls.mirror)}" alt="">
          <span class="tc-name">${esc(trackName(d))}</span>
          <span class="tc-blurb">${esc(trackBlurb(d))}</span>
          ${mode === 'tt' ? `<span class="tc-rec">${svgIcon('timer')}${rec?.time ? formatTime(rec.time) : esc(t('course.noRecord'))}</span>` : `<span class="tc-cup">${esc(holder ? cupName(holder) : '')}</span>`}
          ${locked ? `<span class="lock-cover">${svgIcon('lock')}</span>` : ''}
        </button>`;
      }).join('')}</div>`;
    }
    const lapsRow = mode === 'vs' ? `<div class="laps-row"><span class="laps-lbl">${esc(t('course.laps'))}</span>${LAPS.map((n) => `<button class="seg${this.laps === n ? ' on' : ''}" data-act="laps" data-v="${n}" data-nav data-key="laps-${n}" data-testid="laps-${n}">${n}</button>`).join('')}</div>` : '';
    const info = '';
    return `${this._head(t(mode === 'gp' ? 'course.cups' : 'course.tracks'))}
      <div class="course-body">${body}</div>
      <footer class="course-foot"><span class="crumb">${esc(t('mode.' + mode))} · ${esc(cls.mirror ? className(cls) : `${cls.label} ${className(cls)}`)}</span>${info}${lapsRow}</footer>`;
  }

  _selectHTML() {
    const save = this._save();
    const ids = cupIds();
    const lastCup = cupList()[cupList().length - 1];
    const cards = CHARACTERS.map((base, i) => {
      const ch = this._character(i);
      const locked = save ? !isCharacterUnlocked(save, ch.id, ids) : false;
      const url = locked ? '' : this.portrait(ch);
      return `<button class="char-card${i === this.charIndex ? ' selected' : ''}${locked ? ' locked' : ''}" style="--kc:${hex(ch.color)};--ka:${hex(ch.accent)}" data-act="char" data-v="${i}" data-nav data-key="char-${i}" data-testid="char-${esc(ch.id)}" aria-label="${esc(ch.name)}">
        <span class="char-portrait">${url ? `<img src="${url}" alt="">` : `<span class="initial">${locked ? svgIcon('lock') : esc(ch.name[0])}</span>`}</span>
        <span class="char-name">${esc(locked ? '???' : ch.name)}</span>
      </button>`;
    }).join('');
    return `${this._head(t('select.title'))}
      <div class="select-body">
        <div class="char-grid">${cards}</div>
        <span class="select-stage"></span>
        <aside class="char-panel">
          <div class="cp-top"><span class="cp-portrait"></span><span class="cp-id"><b class="cp-name"></b><small class="cp-title"></small></span></div>
          <div class="cp-stats"></div>
          <div class="cp-scarf"></div>
          <p class="cp-lock"></p>
          <button class="go-btn" data-act="go" data-nav data-key="go" data-testid="start-race">${esc(t('select.go'))}${svgIcon('arrow')}</button>
        </aside>
      </div>
      <div class="lock-hint" hidden>${esc(t('select.nox.locked', { cup: cupName(lastCup) }))}</div>`;
  }

  _refreshPreview() {
    const el = this.els.select;
    if (!el.querySelector('.char-panel')) return;
    const save = this._save();
    const ch = this._character(this.charIndex);
    const locked = save ? !isCharacterUnlocked(save, ch.id, cupIds()) : false;
    el.querySelectorAll('.char-card').forEach((c) => c.classList.toggle('selected', Number(c.dataset.v) === this.charIndex));
    const url = locked ? '' : this.portrait(ch);
    const panel = el.querySelector('.char-panel');
    panel.style.setProperty('--kc', hex(ch.color));
    panel.querySelector('.cp-portrait').innerHTML = url ? `<img src="${url}" alt="">` : `<span class="initial">${locked ? svgIcon('lock') : esc(ch.name[0])}</span>`;
    panel.querySelector('.cp-name').textContent = locked ? '???' : ch.name;
    panel.querySelector('.cp-title').textContent = locked ? '' : characterTitle(ch);
    panel.querySelector('.cp-stats').innerHTML = STAT_KEYS.map((k) => `<div class="stat"><span>${esc(t('stat.' + k))}</span><span class="bar"><i style="width:${(Math.max(0, Math.min(5, ch.stats?.[k] || 0)) / 5) * 100}%"></i></span></div>`).join('');
    const scarf = panel.querySelector('.cp-scarf');
    if (ch.id === 'lumen' && save) {
      scarf.innerHTML = `<span class="cp-lbl">${esc(t('select.scarf'))}</span><span class="swatches">${SCARVES.map((s) => {
        const open = isScarfUnlocked(save, s.id);
        const need = Math.max(0, s.cost - (save.notes || 0));
        const label = open ? t('scarf.' + s.id) : `${t('scarf.' + s.id)} — ${t('select.scarf.locked', { n: need })}`;
        return `<button class="swatch${save.scarf === s.id ? ' on' : ''}${open ? '' : ' locked'}" style="--sw:${hex(s.color)}" data-act="scarf" data-v="${s.id}" data-nav data-key="scarf-${s.id}" data-testid="scarf-${s.id}" title="${esc(label)}" aria-label="${esc(label)}">${open ? '' : svgIcon('lock')}</button>`;
      }).join('')}</span>`;
      scarf.hidden = false;
    } else { scarf.innerHTML = ''; scarf.hidden = true; }
    panel.querySelector('.cp-lock').textContent = locked ? t('select.nox.locked', { cup: cupName(cupList()[cupList().length - 1]) }) : '';
    const go = panel.querySelector('.go-btn');
    go.disabled = locked;
    const p = panel.querySelector('.cp-portrait');
    p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop');
  }

  _pauseHTML() {
    const b = (act, icon, label, primary) => `<button class="pill-btn${primary ? ' primary' : ''}" data-a="${act}" data-act="pause-${act}" data-nav data-key="pause-${act}" data-testid="pause-${act}">${svgIcon(icon)}<span>${esc(label)}</span></button>`;
    return `<div class="panel pause-panel">
      <h2 class="panel-title">${esc(t('pause.title'))}</h2>
      ${b('resume', 'play', t('pause.resume'), true)}
      ${b('restart', 'restart', t('pause.restart'))}
      ${b('settings', 'gear', t('pause.settings'))}
      ${b('quit', 'home', t('pause.quit'))}
    </div>`;
  }

  _settingsHTML() {
    const s = this._settings() || {};
    const seg = (key, options) => `<span class="segs">${options.map(([v, label]) => `<button class="seg${s[key] === v ? ' on' : ''}" data-act="set" data-k="${key}" data-v="${v}" data-nav data-key="set-${key}-${v}">${esc(label)}</button>`).join('')}</span>`;
    const toggle = (key) => `<button class="toggle${s[key] ? ' on' : ''}" data-act="toggle" data-k="${key}" data-nav data-key="tog-${key}" role="switch" aria-checked="${!!s[key]}"><i></i><span>${esc(t(s[key] ? 'common.on' : 'common.off'))}</span></button>`;
    const slider = (key) => `<span class="slider"><input type="range" min="0" max="100" step="5" value="${Math.round((s[key] ?? 0.7) * 100)}" data-k="${key}" data-nav data-key="range-${key}" aria-label="${esc(t('settings.' + key))}"><output>${Math.round((s[key] ?? 0.7) * 100)}</output></span>`;
    const row = (label, ctl) => `<div class="set-row"><span class="set-lbl">${esc(label)}</span>${ctl}</div>`;
    const armed = this._resetArm > performance.now();
    return `${this._head(t('settings.title'))}
      <div class="settings-body">
        <section class="panel set-group"><h3>${svgIcon('speaker')}${esc(t('settings.audio'))}</h3>
          ${row(t('settings.music'), slider('music'))}
          ${row(t('settings.sfx'), slider('sfx'))}
          ${row(t('settings.language'), seg('lang', [['fr', 'Français'], ['en', 'English']]))}
        </section>
        <section class="panel set-group"><h3>${svgIcon('flag')}${esc(t('settings.controls'))}</h3>
          ${row(t('settings.steering'), seg('steering', [['touch', t('settings.steering.touch')], ['tilt', t('settings.steering.tilt')]]))}
          ${row(t('settings.assist'), seg('assist', [['auto', t('settings.assist.auto')], ['on', t('settings.assist.on')], ['off', t('settings.assist.off')]]))}
          ${row(t('settings.haptics'), toggle('haptics'))}
        </section>
        <section class="panel set-group"><h3>${svgIcon('sparkle')}${esc(t('settings.display'))}</h3>
          ${row(t('settings.quality'), seg('quality', [['auto', t('settings.quality.auto')], ['high', t('settings.quality.high')], ['medium', t('settings.quality.medium')], ['low', t('settings.quality.low')]]))}
          ${row(t('settings.reduceMotion'), toggle('reduceMotion'))}
          ${row(t('settings.fps'), toggle('showFps'))}
          <p class="set-note">${esc(t('settings.qualityNote'))}</p>
        </section>
        <section class="panel set-group"><h3>${svgIcon('star')}${esc(t('settings.data'))}</h3>
          <button class="pill-btn danger${armed ? ' armed' : ''}" data-act="reset" data-nav data-key="reset" data-testid="settings-reset">${esc(armed ? t('settings.reset.confirm') : t('settings.reset'))}</button>
          <button class="pill-btn" data-act="credits" data-nav data-key="credits" data-testid="settings-credits">${svgIcon('sparkle')}<span>${esc(t('settings.credits'))}</span></button>
          <p class="set-note">${esc(t('app.about'))} · v${esc(APP_VERSION)}</p>
        </section>
      </div>`;
  }

  _creditsHTML() {
    const rows = [
      ['three.js 0.170', 'MIT — © 2010-2024 three.js authors'],
      ['Capacitor 8 (core, iOS, Android, App, Haptics, Preferences, Status Bar, Splash Screen)', 'MIT — © Drifty Co. (Ionic)'],
      ['AndroidX', 'Apache License 2.0 — © The Android Open Source Project'],
    ];
    const fonts = [['Fredoka', 'SIL Open Font License 1.1 — © 2016 The Fredoka Project Authors'], ['Outfit', 'SIL Open Font License 1.1 — © 2021 The Outfit Project Authors']];
    const list = (items) => `<ul class="credits-list">${items.map(([a, b]) => `<li><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join('')}</ul>`;
    return `${this._head(t('credits.title'))}
      <div class="settings-body credits-body">
        <section class="panel set-group"><h3>${svgIcon('sparkle')}Lumen Kart</h3>
          <p class="credits-p">${esc(t('credits.game'))}</p><p class="credits-p">${esc(t('credits.engine'))}</p>
          <p class="credits-p">${esc(t('credits.procedural'))}</p><p class="credits-p">${esc(t('credits.privacy'))}</p>
          <p class="set-note">v${esc(APP_VERSION)}</p></section>
        <section class="panel set-group"><h3>${svgIcon('star')}${esc(t('credits.software'))}</h3>${list(rows)}
          <h3>${svgIcon('note')}${esc(t('credits.fonts'))}</h3>${list(fonts)}</section>
      </div>`;
  }

  // ------------------------------------------------------------------ actions
  _onClick(e) {
    const el = e.target.closest?.('[data-act]');
    if (!el || !this.root.contains(el) || el.disabled) return;
    const act = el.dataset.act, v = el.dataset.v;
    switch (act) {
      case 'back': this.back(); break;
      case 'play': bus.emit('ui:confirm'); this._show('mode'); break;
      case 'settings': bus.emit('ui:confirm'); this.showSettings('title'); break;
      case 'mode':
        if (v === 'online') { bus.emit('ui:confirm'); this.h.onOnline?.(this.settings); return; }
        this.modeId = v; bus.emit('ui:confirm'); this._show('class'); break;
      case 'class': {
        const save = this._save();
        if (save && !isClassUnlocked(save, v, cupIds())) { this._denied(el, t('class.mirror.locked')); return; }
        this.classId = v; bus.emit('ui:confirm');
        if (this.modeId === 'gp' && save && !isCupUnlocked(save, this.cupId, cupIds())) this.cupId = cupList()[0]?.id;
        if (this.modeId !== 'gp' && save && !isTrackUnlocked(save, this.trackId, cupList())) this.trackId = TRACKS[0]?.id;
        this._show('course'); break;
      }
      case 'cup': {
        const save = this._save();
        const i = cupList().findIndex((c) => c.id === v);
        if (save && !isCupUnlocked(save, v, cupIds())) { this._denied(el, t('course.locked.dusk', { cup: cupName(cupList()[i - 1]) })); return; }
        this.cupId = v; bus.emit('ui:confirm'); this._show('select'); break;
      }
      case 'track': {
        const save = this._save();
        if (save && !isTrackUnlocked(save, v, cupList())) {
          const holder = cupList().find((c) => (c.tracks || []).includes(v));
          const i = cupList().indexOf(holder);
          this._denied(el, t('course.locked.dusk', { cup: cupName(cupList()[i - 1]) })); return;
        }
        this.trackId = v; bus.emit('ui:confirm'); this._show('select'); break;
      }
      case 'laps': this.laps = Number(v) || 3; bus.emit('ui:move'); this._render('course', true); break;
      case 'char': {
        const i = Number(v);
        if (i === this.charIndex && document.body.classList.contains('kbd-nav')) { this._go(); return; }
        if (i !== this.charIndex) bus.emit('ui:move');
        this.charIndex = i; this._refreshPreview(); this.h.onCharacter?.(i);
        break;
      }
      case 'scarf': {
        const save = this._save();
        if (save && !isScarfUnlocked(save, v)) { this._denied(el, el.getAttribute('aria-label')); return; }
        bus.emit('ui:move'); this.h.onScarf?.(v);
        this._portraits.clear(); this._render('select', true); break;
      }
      case 'go': this._go(); break;
      case 'pause-resume': case 'pause-restart': case 'pause-quit': case 'pause-settings': this._pauseAct(act.slice(6)); break;
      case 'set': bus.emit('ui:move'); this.h.onSettingsChange?.({ [el.dataset.k]: v }); this._render('settings', true); break;
      case 'toggle': { const s = this._settings() || {}; bus.emit('ui:move'); this.h.onSettingsChange?.({ [el.dataset.k]: !s[el.dataset.k] }); this._render('settings', true); break; }
      case 'credits': bus.emit('ui:confirm'); this._show('credits'); break;
      case 'reset':
        if (this._resetArm > performance.now()) { this._resetArm = 0; this.h.onResetProgress?.(); bus.emit('ui:back'); }
        else { this._resetArm = performance.now() + 3500; bus.emit('ui:move'); }
        this._render('settings', true); break;
      default: break;
    }
  }
  _onInput(e) {
    const el = e.target;
    if (el?.type !== 'range' || !el.dataset.k) return;
    const v = Math.max(0, Math.min(100, Number(el.value) || 0)) / 100;
    const out = el.parentElement?.querySelector('output');
    if (out) out.textContent = Math.round(v * 100);
    this.h.onSettingsChange?.({ [el.dataset.k]: v });
  }
  _denied(el, msg) {
    bus.emit('ui:back');
    el.classList.remove('denied'); void el.offsetWidth; el.classList.add('denied');
    if (msg) this.h.onLocked?.(msg);
  }
  _go() {
    if (this.screen !== 'select') return;
    const save = this._save();
    const ch = CHARACTERS[this.charIndex];
    if (save && ch && !isCharacterUnlocked(save, ch.id, cupIds())) { this._denied(this.els.select.querySelector('.go-btn'), t('select.nox.locked', { cup: cupName(cupList()[cupList().length - 1]) })); return; }
    bus.emit('ui:confirm');
    this.h.onRemember?.({ mode: this.modeId, classId: this.classId, cupId: this.cupId, trackId: this.trackId, charIndex: this.charIndex, laps: this.laps });
    this.h.onStart?.(this.settings);
  }
  _pauseAct(a) {
    if (this.screen !== 'pause') return;
    bus.emit('ui:confirm');
    if (a === 'resume') this.h.onResume?.();
    else if (a === 'restart') this.h.onRestart?.();
    else if (a === 'settings') this.showSettings('pause');
    else if (a === 'quit') this.h.onQuit?.();
  }

  /** Back one level (Escape, Backspace, gamepad B, Android back). Returns false at the title. */
  back() {
    const s = this.screen;
    if (s === 'title' || !s || s === 'loading') return false;
    bus.emit('ui:back');
    if (s === 'mode') this._show('title');
    else if (s === 'class') this._show('mode');
    else if (s === 'course') this._show('class');
    else if (s === 'select') this._show('course');
    else if (s === 'settings') { if (this.settingsReturn === 'pause') this._show('pause'); else this._show('title'); }
    else if (s === 'credits') this._show('settings');
    else if (s === 'pause') this.h.onResume?.();
    return true;
  }

  // ------------------------------------------------------------------ focus / keyboard
  _focusables() {
    const el = this.els[this.screen];
    if (!el) return [];
    return [...el.querySelectorAll('[data-nav]')].filter((n) => !n.disabled && n.offsetParent !== null);
  }
  _defaultFocus() {
    const el = this.els[this.screen];
    if (!el) return null;
    const pick = {
      title: '[data-key="play"]', mode: '.mode-card.selected', class: '.class-card.selected', course: '.selected',
      select: '.go-btn', pause: '[data-key="pause-resume"]', settings: '.set-group [data-nav]',
    }[this.screen];
    return (pick && el.querySelector(pick)) || this._focusables().find((n) => n.dataset.act !== 'back') || null;
  }
  _setFocus(el, { silent = false, hover = false } = {}) {
    if (this.focusEl === el) return;
    this.focusEl?.classList.remove('focus');
    this.focusEl = el || null;
    if (!el) return;
    el.classList.add('focus');
    if (!hover && document.body.classList.contains('kbd-nav')) { try { el.focus({ preventScroll: true }); el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } catch { /* ignore */ } }
    if (!silent) bus.emit('ui:move');
    if (this.screen === 'select' && el.dataset.act === 'char') {
      const i = Number(el.dataset.v);
      if (i !== this.charIndex) { this.charIndex = i; this._refreshPreview(); this.h.onCharacter?.(i); }
    }
  }
  _move(dx, dy) {
    const items = this._focusables();
    if (!items.length) return;
    const cur = this.focusEl && items.includes(this.focusEl) ? this.focusEl : null;
    if (!cur) { this._setFocus(this._defaultFocus() || items[0]); return; }
    if (cur.type === 'range' && dx) {
      cur.value = Math.max(0, Math.min(100, Number(cur.value) + dx * 5));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      bus.emit('ui:move');
      return;
    }
    const r0 = cur.getBoundingClientRect();
    const c0x = r0.left + r0.width / 2, c0y = r0.top + r0.height / 2;
    let best = null, bestScore = Infinity;
    for (const n of items) {
      if (n === cur) continue;
      const r = n.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const along = dx ? (cx - c0x) * dx : (cy - c0y) * dy;
      if (along <= 2) continue;
      const overlap = dx ? (Math.min(r.bottom, r0.bottom) - Math.max(r.top, r0.top)) : (Math.min(r.right, r0.right) - Math.max(r.left, r0.left));
      const perp = dx ? Math.abs(cy - c0y) : Math.abs(cx - c0x);
      const score = along + perp * (overlap > 0 ? 0.3 : 2.5);
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (best) this._setFocus(best);
  }
  _key(e) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName) && e.target?.type !== 'range') return;
    if (!this.screen || this.screen === 'loading') return;
    const c = e.code;
    const isEnter = c === 'Enter' || c === 'NumpadEnter' || c === 'Space';
    const up = c === 'ArrowUp' || c === 'KeyW', down = c === 'ArrowDown' || c === 'KeyS';
    const left = c === 'ArrowLeft' || c === 'KeyA', right = c === 'ArrowRight' || c === 'KeyD';
    const back = c === 'Escape' || c === 'Backspace';
    if (up || down || left || right || isEnter || back) { e.preventDefault(); document.body.classList.add('kbd-nav'); }
    if (this.screen === 'title' && isEnter && !e.repeat) {
      if (!this.focusEl || this.focusEl.dataset.key === 'play') { bus.emit('ui:confirm'); this._show('mode'); return; }
    }
    if (back && !e.repeat) {
      if (this.screen === 'pause' && c === 'Escape') return; // main.js handles Escape -> resume
      // Handled here: main.js must not see the same Escape once the screen changed (settings opened from the
      // pause menu went back to "pause" and main.js then resumed the race on that very key press).
      if (this.back()) e.stopImmediatePropagation();
      return;
    }
    if (left) this._move(-1, 0);
    else if (right) this._move(1, 0);
    else if (up) this._move(0, -1);
    else if (down) this._move(0, 1);
    else if (isEnter && !e.repeat && this.focusEl) {
      if (this.focusEl.dataset.act === 'char') { this._go(); return; }
      this.focusEl.click();
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
    const inMenu = ['title', 'mode', 'class', 'select', 'course', 'pause', 'settings', 'credits'].includes(this.screen) || gameState === 'results';
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
    this.root.remove();
  }
}

export { ordinal, getLanguage, itemIcon };
