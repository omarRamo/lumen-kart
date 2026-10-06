// Defensive access to native Capacitor plugins (Haptics, App, Preferences). Every call is optional:
// the web build (and any platform where a plugin is missing) silently falls back.
import { Capacitor, registerPlugin } from '@capacitor/core';

const proxies = {};
function plugin(name) {
  try {
    const fromWindow = globalThis.window?.Capacitor?.Plugins?.[name];
    if (fromWindow) return fromWindow;
    if (!Capacitor?.isNativePlatform?.() || !Capacitor.isPluginAvailable?.(name)) return null;
    return (proxies[name] = proxies[name] || registerPlugin(name));
  } catch { return null; }
}
const quiet = (p) => { try { p?.catch?.(() => {}); } catch { /* ignore */ } };

export function isNative() { try { return !!Capacitor?.isNativePlatform?.(); } catch { return false; } }

// ------------------------------------------------------------------------------------ haptics
let hapticsOn = true;
let lastBuzz = 0;
export function setHapticsEnabled(on) { hapticsOn = !!on; }

/** kind: 'light' | 'medium' | 'heavy' | 'success'. Throttled so bursts of events don't machine-gun. */
export function haptic(kind = 'light') {
  if (kind === 'selection') kind = 'light';
  if (!hapticsOn) return;
  const now = (globalThis.performance?.now?.() ?? Date.now());
  if (now - lastBuzz < (kind === 'light' ? 90 : 60)) return;
  lastBuzz = now;
  const H = plugin('Haptics');
  if (H) {
    try {
      if (kind === 'success') quiet(H.notification?.({ type: 'SUCCESS' }));
      else quiet(H.impact?.({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' }));
      return;
    } catch { /* fall through */ }
  }
  try {
    const nav = globalThis.navigator;
    if (nav?.vibrate && (globalThis.matchMedia?.('(pointer: coarse)').matches)) {
      nav.vibrate(kind === 'heavy' ? 45 : kind === 'medium' ? 28 : kind === 'success' ? [20, 40, 30] : 12);
    }
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------------------------ app lifecycle
/** Calls back on Android back button, app pause/resume. Returns a disposer. */
export function onAppEvents({ back, pause, resume } = {}) {
  const A = plugin('App');
  const handles = [];
  if (A?.addListener) {
    const add = (name, fn) => { if (!fn) return; try { const h = A.addListener(name, fn); handles.push(h); } catch { /* ignore */ } };
    add('backButton', back);
    add('pause', pause);
    add('resume', resume);
  }
  return () => { for (const h of handles) { Promise.resolve(h).then((x) => x?.remove?.()).catch(() => {}); } };
}
export function exitApp() {
  const A = plugin('App');
  try { if (A?.exitApp) return quiet(A.exitApp()); if (A?.minimizeApp) quiet(A.minimizeApp()); } catch { /* ignore */ }
}

// ------------------------------------------------------------------------------------ preferences
// WKWebView localStorage can be evicted by iOS; mirror the save into native Preferences when present.
export async function prefsGet(key) {
  const P = plugin('Preferences');
  if (!P?.get) return null;
  try { const r = await P.get({ key }); return r?.value ?? null; } catch { return null; }
}
export function prefsSet(key, value) {
  const P = plugin('Preferences');
  if (!P?.set) return;
  try { quiet(P.set({ key, value })); } catch { /* ignore */ }
}
