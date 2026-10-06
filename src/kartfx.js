// Kart attachments: the rescue drone that fishes fallen karts back onto the track and the rocket shell
// a kart turns into when it fires the Bullet item. Geometry/materials are shared between instances.
import * as THREE from 'three';

let shared = null;
function assets() {
  if (shared) return shared;
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, ...extra });
  shared = {
    body: new THREE.SphereGeometry(0.9, 18, 12),
    visor: new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    arm: new THREE.BoxGeometry(3.2, 0.14, 0.22),
    rotor: new THREE.CylinderGeometry(0.62, 0.62, 0.04, 16),
    hub: new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8),
    rope: new THREE.CylinderGeometry(0.03, 0.03, 1, 5).translate(0, -0.5, 0),
    flag: new THREE.PlaneGeometry(1.1, 0.7).translate(0.55, 0, 0),
    shell: new THREE.CylinderGeometry(1.25, 1.25, 3.0, 20, 1, true).rotateX(Math.PI / 2),
    nose: new THREE.SphereGeometry(1.25, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2),
    tail: new THREE.CylinderGeometry(1.25, 1.0, 0.6, 20).rotateX(Math.PI / 2),
    fin: new THREE.BoxGeometry(0.12, 1.0, 1.0),
    eye: new THREE.SphereGeometry(0.28, 12, 8),
    pupil: new THREE.SphereGeometry(0.14, 10, 6),
    flame: new THREE.ConeGeometry(0.8, 2.6, 12, 1, true).rotateX(-Math.PI / 2),
    mats: {
      drone: std(0xf6f6f6), stripe: std(0xff4d4d), visor: std(0x1e2a44, { roughness: 0.15, metalness: 0.6 }),
      dark: std(0x2a2d35), rotor: new THREE.MeshBasicMaterial({ color: 0xcfd8dc, transparent: true, opacity: 0.45 }),
      rope: std(0x333333), flag: new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      bullet: std(0x22252c, { roughness: 0.3, metalness: 0.5 }), eyeW: std(0xffffff), eyeB: std(0x111111),
      flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a2a).multiplyScalar(2), transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }),
    },
  };
  const c = document.createElement('canvas'); c.width = 64; c.height = 40;
  const g = c.getContext('2d');
  for (let x = 0; x < 8; x++) for (let y = 0; y < 5; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  shared.mats.flag.map = tex;
  return shared;
}

export function createRescueDrone() {
  const A = assets(), M = A.mats;
  const root = new THREE.Group();
  root.name = 'rescueDrone';
  const body = new THREE.Mesh(A.body, M.drone); body.scale.set(1, 0.7, 1.1); body.castShadow = true; root.add(body);
  const stripe = new THREE.Mesh(A.hub, M.stripe); stripe.scale.set(6.6, 0.5, 6.6); root.add(stripe);
  const visor = new THREE.Mesh(A.visor, M.visor); visor.position.set(0, 0.05, 0.62); visor.rotation.x = Math.PI / 2; root.add(visor);
  const rotors = [];
  for (const r of [0, Math.PI / 2]) {
    const arm = new THREE.Mesh(A.arm, M.dark); arm.rotation.y = r + Math.PI / 4; arm.position.y = 0.35; root.add(arm);
  }
  for (const [x, z] of [[1.15, 1.15], [-1.15, 1.15], [1.15, -1.15], [-1.15, -1.15]]) {
    const hub = new THREE.Mesh(A.hub, M.dark); hub.position.set(x, 0.5, z); root.add(hub);
    const rot = new THREE.Mesh(A.rotor, M.rotor); rot.position.set(x, 0.68, z); root.add(rot); rotors.push(rot);
  }
  const ropes = [];
  for (const [x, z] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) {
    const rope = new THREE.Mesh(A.rope, M.rope); rope.position.set(x, -0.5, z); root.add(rope); ropes.push(rope);
  }
  const flag = new THREE.Mesh(A.flag, M.flag); flag.position.set(-1.0, 0.2, -0.9); root.add(flag);
  root.visible = false;
  return {
    root,
    animate(time, ropeLen) {
      for (const r of rotors) r.rotation.y = time * 40;
      for (const rp of ropes) { rp.visible = ropeLen > 0.05; rp.scale.y = Math.max(0.01, ropeLen); }
      flag.rotation.y = Math.sin(time * 9) * 0.35;
      root.rotation.z = Math.sin(time * 3) * 0.05;
    },
  };
}

export function createRocketShell() {
  const A = assets(), M = A.mats;
  const root = new THREE.Group();
  root.name = 'rocketShell';
  const body = new THREE.Mesh(A.shell, M.bullet); body.position.y = 1.1; body.castShadow = true; root.add(body);
  const nose = new THREE.Mesh(A.nose, M.bullet); nose.position.set(0, 1.1, 1.5); nose.castShadow = true; root.add(nose);
  const tail = new THREE.Mesh(A.tail, M.dark); tail.position.set(0, 1.1, -1.75); root.add(tail);
  for (let k = 0; k < 4; k++) {
    const fin = new THREE.Mesh(A.fin, M.dark);
    const a = k * Math.PI / 2 + Math.PI / 4;
    fin.position.set(Math.cos(a) * 1.3, 1.1 + Math.sin(a) * 1.3, -1.5);
    fin.rotation.z = a; root.add(fin);
  }
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(A.eye, M.eyeW); e.position.set(s * 0.55, 1.55, 2.2); e.scale.set(1, 1.3, 0.6); root.add(e);
    const p = new THREE.Mesh(A.pupil, M.eyeB); p.position.set(s * 0.55, 1.58, 2.36); root.add(p);
  }
  const flame = new THREE.Mesh(A.flame, M.flame); flame.position.set(0, 1.1, -3.2); root.add(flame);
  root.visible = false;
  return {
    root,
    animate(time) {
      const f = 0.8 + Math.sin(time * 50) * 0.2;
      flame.scale.set(f, f, 0.8 + Math.sin(time * 37) * 0.3);
      body.rotation.z = time * 6;
    },
  };
}
