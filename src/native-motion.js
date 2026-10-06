import { Capacitor, registerPlugin } from '@capacitor/core';

const TiltMotion = registerPlugin('TiltMotion');

export function isNativeMotionAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TiltMotion');
}

// Gravity uses CoreMotion's device coordinates, in g: portrait upright is y = -1.
export async function startNativeMotion(onGravity) {
  if (!isNativeMotionAvailable()) throw new Error('Native tilt is unavailable');
  const listener = await TiltMotion.addListener('gravity', ({ x, y, z }) => {
    if ([x, y, z].every(Number.isFinite)) onGravity({ x, y, z });
  });
  try {
    await TiltMotion.start();
  } catch (error) {
    await listener.remove();
    throw error;
  }
  let stopped = false;
  return async () => {
    if (stopped) return;
    stopped = true;
    try { await TiltMotion.stop(); } finally { await listener.remove(); }
  };
}
