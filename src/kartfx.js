// Kart attachments, re-dressed for Lumen Kart:
//  - createRescueDrone(): a friendly glowing lantern-bird that fishes fallen karts back onto the track
//    with four threads of light (API unchanged: { root, animate(time, ropeLen) }).
//  - createRocketShell(): the "Plume d'envol" (flight feather, internal id `bullet`) — a soft glowing
//    glider cocoon with two big feather wings and a sparkle trail (API unchanged: { root, animate(time) }).
// Static parts are merged into one vertex-coloured mesh with the shared Lumen shader (models.js), so
// the bird is 6 draw calls and the glider 5. Templates are built once; animate() allocates nothing.
import * as THREE from 'three';
import { _fx } from './models.js';

const PI = Math.PI;
const { Builder, instantiate, furMat, stdMat, glowMat, MAT, M, extrude, sparkleShape, leafShape, sphere, bigSphere, coneG, cylG, torusG, glowSprite, tailMat, currentQuality, withQuality } = _fx;

function eyes(b, x, y, z, s, yaw = 0) {
  for (const sx of [-1, 1]) {
    b.add(sphere(1, 12, 8), stdMat(0x25575b, 0.25), M([x + sx * 0.17 * s, y, z], [0, sx * yaw, 0], [0.07 * s, 0.11 * s, 0.05 * s]));
    b.add(sphere(1, 6, 4), MAT.shine, M([x + sx * 0.17 * s + 0.025 * s, y + 0.04 * s, z + 0.045 * s], null, [0.025 * s, 0.032 * s, 0.02 * s]));
  }
}

let tpl = null;
function templates() {
  if (tpl) return tpl;
  tpl = withQuality(currentQuality(), () => {
    const cream = furMat(0xfff1c9, 0.22), mint = furMat(0xb5f3d0, 0.2), deep = furMat(0x67baa5, 0.15);
    // lantern-bird body
    const bird = new Builder();
    bird.add(bigSphere(0.8, 22, 16), cream, M([0, 0, 0], null, [1, 0.85, 1.1]));
    bird.add(bigSphere(0.5, 20, 14), cream, M([0, 0.52, 0.7]));
    eyes(bird, 0, 0.6, 1.14, 1.2, 0.2);
    for (const sx of [-1, 1]) bird.add(sphere(1, 8, 6), furMat(0xedba9c, 0.1), M([sx * 0.33, 0.45, 1.07], [0, sx * 0.5, 0], [0.07, 0.04, 0.02]));
    bird.add(coneG(0.1, 0.24, 8), MAT.gold, M([0, 0.48, 1.22], [PI / 2, 0, 0]));
    for (const [z, r] of [[0.6, -0.4], [0.75, 0.2]]) bird.add(extrude(leafShape(0.14, 1), 0.03, 0.015), mint, M([0, 0.98, z], [-0.3, PI / 2, r]));
    for (const r of [-0.45, 0, 0.45]) bird.add(extrude(leafShape(0.3, 0.9), 0.04, 0.02), r === 0 ? deep : mint, M([0, 0.1, -0.8], [-PI / 2 - 0.4, 0, r]));
    const wing = new Builder();
    const wg = extrude(leafShape(0.72, 1.05), 0.05, 0.025);
    wg.rotateZ(-PI / 2); // tip toward +X
    wing.add(wg, mint, M([0, 0, 0], [PI / 2 - 0.55, 0, 0]));
    const lantern = new Builder();
    lantern.add(new THREE.OctahedronGeometry(0.26, 0), glowMat(0xffd98a, 0.9), M([0, -0.38, 0], null, [1, 1.45, 1]));
    lantern.add(sphere(0.13, 10, 8), glowMat(0xfff6cc, 1.3), M([0, -0.38, 0]));
    lantern.add(coneG(0.14, 0.12, 8), MAT.gold, M([0, -0.02, 0]));
    const ropes = new Builder();
    for (const [x, z] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) ropes.add(cylG(0.028, 0.028, 1, 5), glowMat(0xffe2ac, 1.2), M([x, -0.5, z]));
    // flight-feather glider
    const pod = new Builder();
    pod.add(bigSphere(1.2, 24, 16), stdMat(0xd9f8d4, 0.45, 0, { emissive: 1, emissiveIntensity: 0.55 }), M([0, 0, 0], null, [1, 0.95, 1.35]));
    pod.add(torusG(1.08, 0.12, 8, 28), stdMat(0xfff7dc, 0.5), M([0, 0, -0.35], null, [1, 0.95, 1]));
    pod.add(extrude(sparkleShape(0.42, 0.28), 0.12, 0.05), MAT.gold, M([0, 0.35, 1.55]));
    eyes(pod, 0, -0.05, 1.56, 2.2, 0.15);
    const feather = new Builder();
    const fg = extrude(leafShape(1.25, 0.62), 0.07, 0.035, 8);
    fg.rotateZ(-PI / 2);
    { const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + Math.sin(x * 1.2) * 0.12); } fg.computeVertexNormals(); }
    feather.add(fg, stdMat(0xeefcf0, 0.6, 0, { emissive: 1, emissiveIntensity: 0.55 }), M([0, 0, 0], [PI / 2 - 0.5, 0, 0]));
    const sparkles = new Builder();
    for (let i = 0; i < 4; i++) sparkles.add(extrude(sparkleShape(0.16 * (1 - i * 0.18), 0.24), 0.03, 0), glowMat(0xfff6d8, 1.2), M([Math.sin(i * 2.4) * 0.6, Math.cos(i * 1.7) * 0.45, -0.4 - i * 0.8], [0, 0, i]));
    const trail = new THREE.ConeGeometry(0.95, 3.0, 14, 1, true).translate(0, 1.5, 0).rotateX(-PI / 2);
    return { bird: bird.build(), wing: wing.build(), lantern: lantern.build(), ropes: ropes.build(), pod: pod.build(), feather: feather.build(), sparkles: sparkles.build(), trail };
  });
  return tpl;
}

export function createRescueDrone() {
  const T = templates();
  const root = new THREE.Group();
  root.name = 'rescueDrone';
  const bird = instantiate(T.bird, null, true);
  root.add(bird);
  const wings = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.62, 0.25, 0.05);
    const w = instantiate(T.wing);
    w.scale.set(sx, 1, 1);
    pivot.add(w);
    bird.add(pivot);
    wings.push({ pivot, sx });
  }
  const lanternPivot = new THREE.Group();
  lanternPivot.position.set(0, -0.62, 0.1);
  lanternPivot.add(instantiate(T.lantern));
  const halo = glowSprite(0xffd98a, 2.2, 0.7); halo.position.y = -0.38; lanternPivot.add(halo);
  bird.add(lanternPivot);
  const ropes = instantiate(T.ropes);
  ropes.position.y = -0.5;
  root.add(ropes);
  root.visible = false;
  return {
    root,
    animate(time, ropeLen) {
      const flap = Math.sin(time * 11);
      for (const w of wings) w.pivot.rotation.z = w.sx * (0.15 + flap * 0.55);
      bird.position.y = Math.sin(time * 11 + 0.8) * 0.08;
      bird.rotation.x = Math.sin(time * 2.1) * 0.05;
      lanternPivot.rotation.z = Math.sin(time * 3.2) * 0.18;
      halo.material.opacity = 0.55 + Math.sin(time * 5) * 0.15;
      ropes.visible = ropeLen > 0.05;
      ropes.scale.y = Math.max(0.01, ropeLen);
      root.rotation.z = Math.sin(time * 3) * 0.04;
    },
  };
}

export function createRocketShell() {
  const T = templates();
  const root = new THREE.Group();
  root.name = 'rocketShell';
  const glider = instantiate(T.pod, null, true);
  glider.position.y = 1.1;
  root.add(glider);
  const feathers = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.95, 0.35, 0.1);
    const f = instantiate(T.feather);
    f.scale.set(sx, 1, 1);
    pivot.add(f);
    glider.add(pivot);
    feathers.push({ pivot, sx });
  }
  const tail = new THREE.Mesh(T.trail, tailMat(0xb5f3d0, 0.55)); tail.position.set(0, 1.1, -1.4); root.add(tail);
  const sparkles = instantiate(T.sparkles);
  sparkles.position.set(0, 1.1, -1.5);
  root.add(sparkles);
  root.visible = false;
  return {
    root,
    animate(time) {
      for (const f of feathers) f.pivot.rotation.z = f.sx * (0.12 + Math.sin(time * 4) * 0.12);
      glider.rotation.z = Math.sin(time * 1.7) * 0.08;
      glider.position.y = 1.1 + Math.sin(time * 2.4) * 0.1;
      const k = 0.85 + Math.sin(time * 30) * 0.12;
      tail.scale.set(k, k, 0.9 + Math.sin(time * 23) * 0.15);
      sparkles.rotation.z = time * 2.5;
      sparkles.position.z = -1.5 - ((time * 1.6) % 1) * 0.8;
    },
  };
}
