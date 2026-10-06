// Track catalogue + cups. Each definition drives the procedural generator in track.js and the themed
// environment in environment.js. Feature positions use "cpf" (fractional control-point index): 4.5 is
// half-way between control points 4 and 5. Lateral offsets are metres (+ = right of race direction).

export const TRACKS = [
  {
    id: 'palm-cove',
    name: 'Palm Cove Circuit',
    short: 'PALM COVE',
    theme: 'beach',
    song: 'race',
    banner: 'TURBO KART RALLY',
    blurb: 'Sunny seaside sprint over the lagoon bridge.',
    scale: 1.15,
    cp: [
      [0, 0, -60], [0, 0, 60], [2, 0, 175], [22, 1, 258], [80, 3, 302], [160, 5, 296], [230, 6, 252],
      [262, 6, 182], [238, 5, 118], [292, 4, 64], [258, 4, 4], [296, 6, -62], [304, 10, -140], [284, 10, -212],
      [226, 6, -262], [150, 3, -284], [66, 1, -300], [-20, 0, -318], [-96, 0, -322], [-128, 0, -292],
      [-106, 0, -256], [-50, 0, -236], [-8, 0, -196], [0, 0, -140],
    ],
    lake: { x: 405, z: -205, r: 125 },
    pads: [
      { at: 10.45, lats: [-6, 0, 6], stagger: true },
      { at: 20.55, lats: [-4.5, 4.5] }, { at: 21.2, lats: [0] },
      { at: 4.15, line: 2 },
    ],
    ramps: [{ at: 14.35, hw: 10, h: 1.7 }, { at: 4.65, hw: 9, h: 1.5 }],
    itemRows: [1.25, 6.5, 9.2, 12.5, 16.4, 21.6],
    coins: [
      { at: 2.1, lat: 0, n: 6 }, { at: 5.3, lat: -6, n: 5 }, { at: 7.6, lat: 5, n: 5 }, { at: 11.4, lat: 0, n: 6 },
      { at: 15.4, lat: -6, n: 5 }, { at: 18.2, lat: 7, n: 4 }, { at: 22.6, lat: -4, n: 5 },
    ],
    hazards: [
      { type: 'crab', at: 16.8, lat: 0, amp: 8 }, { type: 'crab', at: 17.4, lat: 0, amp: 9 },
    ],
  },
  {
    id: 'frosty-peaks',
    name: 'Frosty Peaks Pass',
    short: 'FROSTY PEAKS',
    theme: 'snow',
    song: 'snow',
    banner: 'FROSTY PEAKS',
    blurb: 'Climb the summit, dodge snowmen, bomb the downhill.',
    scale: 1.15,
    cp: [
      [0, 0, -60], [0, 2, 50], [-20, 5, 140], [-80, 9, 190], [-160, 13, 190], [-220, 17, 150], [-240, 20, 80],
      [-210, 22, 20], [-150, 20, -10], [-120, 16, -70], [-160, 12, -130], [-230, 10, -170], [-280, 8, -240],
      [-250, 5, -310], [-180, 3, -330], [-100, 2, -300], [-40, 1, -250], [10, 0, -190], [0, 0, -130],
    ],
    lake: { x: -200, z: -490, r: 135 },
    pads: [{ at: 8.35, line: 2 }, { at: 16.4, lats: [-6, 0, 6], stagger: true }, { at: 4.2, lats: [0] }],
    ramps: [{ at: 9.35, hw: 10, h: 2.0 }, { at: 2.6, hw: 8, h: 1.3 }],
    itemRows: [1.3, 5.5, 8.8, 12.6, 15.8],
    coins: [
      { at: 0.4, lat: 0, n: 6 }, { at: 3.4, lat: 5, n: 5 }, { at: 6.4, lat: -5, n: 5 }, { at: 10.4, lat: 0, n: 6 },
      { at: 13.8, lat: 4, n: 5 }, { at: 17.3, lat: -5, n: 5 },
    ],
    hazards: [
      { type: 'snowman', at: 4.55, lat: -5 }, { type: 'snowman', at: 4.75, lat: 6 }, { type: 'snowman', at: 11.3, lat: 0 },
      { type: 'snowman', at: 11.5, lat: -7 }, { type: 'snowman', at: 17.1, lat: 4 },
      { type: 'snowball', at: 7.5, amp: 7 }, { type: 'snowball', at: 13.3, amp: 7 },
    ],
  },
  {
    id: 'sunset-canyon',
    name: 'Sunset Canyon Raceway',
    short: 'SUNSET CANYON',
    theme: 'desert',
    song: 'desert',
    banner: 'SUNSET CANYON',
    blurb: 'Blistering straights, huge jumps and rolling boulders.',
    scale: 1.15,
    cp: [
      [0, 0, -60], [0, 0, 80], [10, 1, 200], [60, 3, 270], [140, 5, 280], [200, 6, 230], [210, 6, 150],
      [170, 5, 90], [190, 4, 20], [250, 4, -30], [320, 6, -60], [360, 8, -140], [330, 8, -220], [260, 6, -260],
      [170, 3, -250], [100, 1, -280], [30, 0, -300], [-40, 0, -270], [-50, 0, -200], [-10, 0, -150],
    ],
    lake: { x: 530, z: -170, r: 130 },
    pads: [{ at: 0.7, line: 2 }, { at: 8.6, lats: [-6, 0, 6], stagger: true }, { at: 16.3, lats: [-4.5, 4.5] }, { at: 11.6, lats: [0] }],
    ramps: [{ at: 3.3, hw: 10, h: 2.2 }, { at: 12.4, hw: 11, h: 2.0 }, { at: 18.2, hw: 7, h: 1.3 }],
    itemRows: [1.4, 6.2, 9.5, 13.6, 17.4],
    coins: [
      { at: 1.8, lat: 0, n: 6 }, { at: 4.6, lat: 6, n: 5 }, { at: 7.4, lat: -5, n: 5 }, { at: 10.4, lat: 4, n: 5 },
      { at: 14.6, lat: -5, n: 6 }, { at: 19.3, lat: 0, n: 5 },
    ],
    hazards: [
      { type: 'boulder', at: 5.6, amp: 7 }, { type: 'boulder', at: 15.1, amp: 7 },
      { type: 'tumbleweed', at: 2.4, amp: 10 }, { type: 'tumbleweed', at: 16.9, amp: 10 },
    ],
  },
  {
    id: 'lava-keep',
    name: 'Lava Keep',
    short: 'LAVA KEEP',
    theme: 'lava',
    song: 'lava',
    banner: 'LAVA KEEP',
    blurb: 'Night fortress: stompers, a broken drawbridge and a lava moat.',
    scale: 1.15,
    cp: [
      [0, 0, -60], [0, 0, 60], [30, 2, 150], [100, 4, 190], [170, 4, 160], [190, 5, 90], [150, 6, 30],
      [160, 8, -40], [220, 10, -90], [290, 10, -110], [350, 9, -90], [390, 7, -150], [375, 4, -225], [300, 2, -270],
      [200, 1, -280], [120, 0, -250], [60, 0, -300], [-20, 0, -300], [-60, 0, -240], [-30, 0, -180], [0, 0, -120],
    ],
    lake: { x: 340, z: -20, r: 140, open: true },
    pads: [{ at: 7.3, lats: [0] }, { at: 8.45, lats: [0] }, { at: 13.4, lats: [-6, 0, 6], stagger: true }, { at: 19.2, lats: [-4.5, 4.5] }],
    ramps: [{ at: 8.75, hw: 12.2, h: 2.2, gap: 14 }, { at: 3.5, hw: 8, h: 1.3 }],
    itemRows: [1.3, 5.3, 10.3, 12.5, 17.5, 19.8],
    coins: [
      { at: 0.4, lat: 0, n: 6 }, { at: 4.4, lat: -5, n: 5 }, { at: 7.7, lat: 0, n: 5 }, { at: 11.4, lat: 5, n: 5 },
      { at: 14.5, lat: 0, n: 6 }, { at: 18.4, lat: -5, n: 5 },
    ],
    hazards: [
      { type: 'stomper', at: 15.35, lat: -5.5 }, { type: 'stomper', at: 15.6, lat: 5.5, phase: 1.3 },
      { type: 'stomper', at: 16.3, lat: 0, phase: 0.6 }, { type: 'stomper', at: 16.65, lat: -6, phase: 2.0 },
      { type: 'stomper', at: 16.7, lat: 6, phase: 0.2 },
      { type: 'boulder', at: 5.8, amp: 7, lava: true },
    ],
  },
];

export const CUPS = [
  { id: 'turbo', name: 'Turbo Cup', color: '#ffb300', tracks: ['palm-cove', 'frosty-peaks', 'sunset-canyon', 'lava-keep'] },
  { id: 'reverse', name: 'Blazing Cup', color: '#ff5252', tracks: ['lava-keep', 'sunset-canyon', 'frosty-peaks', 'palm-cove'] },
];

export const GP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

// Ids used by earlier builds / saved online rooms map onto the current courses.
const LEGACY_IDS = { palm: 'palm-cove', frost: 'frosty-peaks', canyon: 'sunset-canyon', lava: 'lava-keep', 'alpine-rush': 'frosty-peaks', 'neon-harbor': 'lava-keep' };

export function getTrackDef(id) {
  const key = LEGACY_IDS[id] || id;
  return TRACKS.find((t) => t.id === key) || TRACKS[0];
}
