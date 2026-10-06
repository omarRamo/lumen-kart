// Lumen Kart course catalogue + cups. Each definition drives the procedural generator in track.js and the
// themed world in environment.js. Feature positions use "cpf" (fractional control-point index): 4.5 is
// half-way between control points 4 and 5. Lateral offsets are metres (+ = right of race direction).
//
// Fields (see docs/agents/worlds.md):
//   id (stable, used by saves/network), name (EN, legacy), names {fr,en}, short (EN, legacy) + shorts {fr,en},
//   blurb (EN, legacy) + blurbs {fr,en}, theme (world key), song (an existing AudioEngine song: race|snow|desert|lava),
//   music (the world's own song id, for when the audio side provides one), color (menu accent),
//   cp (control points [x, y, z]), scale, lake {x,z,r,open?}, bridges [{from,to}], shortcuts [{from,to}],
//   pads, ramps (gap = jump over a hole), itemRows, coins (music notes), hazards (LUMEN creatures).
// World keys: meadow | lagoon | jungle | desert | medina | city | aurora | night
// (legacy keys beach / snow / lava are still accepted and resolve to lagoon / aurora / night).

export const TRACKS = [
  {
    id: 'meadow',
    name: 'Dawn Meadows',
    names: { fr: 'Prairies d’aurore', en: 'Dawn Meadows' },
    short: 'DAWN MEADOWS',
    shorts: { fr: 'PRAIRIES D’AURORE', en: 'DAWN MEADOWS' },
    theme: 'meadow',
    song: 'race',
    music: 'meadow',
    color: '#9fd27a',
    banner: 'PRAIRIES D’AURORE',
    blurb: 'Golden hills, lanterns and a flower field to cut through.',
    blurbs: {
      fr: 'Collines dorées, lanternes et un champ de fleurs à couper au plus court.',
      en: 'Golden hills, lanterns and a flower field to cut through.',
    },
    scale: 1.07,
    cp: [
      [0, 0, -60], [0, 0, 40], [14, 1, 120], [64, 3, 176], [140, 6, 196], [214, 9, 178], [262, 10, 128], [276, 9, 62],
      [320, 7, 20], [372, 6, -20], [396, 5, -90], [370, 4, -160], [300, 4, -185], [250, 4, -150], [240, 4, -80],
      [238, 4, -20], [205, 4, 14], [170, 4, -18], [168, 4, -80], [150, 3, -150], [100, 1, -200], [40, 0, -215], [4, 0, -160],
    ],
    lake: { x: 70, z: -268, r: 80 },
    shortcuts: [{ from: 15.3, to: 16.7 }],
    pads: [
      { at: 2.4, line: 2 },
      { at: 15.0, lats: [8.4] },                       // aimed into the flower-field shortcut
      { at: 17.6, lats: [-5, 5] },
      { at: 21.4, lats: [-6, 0, 6], stagger: true },
    ],
    ramps: [{ at: 5.75, hw: 10, h: 1.8 }],
    itemRows: [1.2, 6.8, 10.5, 14.2, 18.6, 20.9],
    coins: [
      { at: 0.3, lat: 0, n: 6 }, { at: 3.3, lat: -6, n: 5 }, { at: 7.3, lat: 5, n: 5 }, { at: 11.5, lat: 0, n: 6 },
      { at: 15.4, lat: -6, n: 4 }, { at: 18.2, lat: -5, n: 5 }, { at: 20.3, lat: 0, n: 6 },
    ],
    hazards: [
      { type: 'dandelion', at: 7.0, amp: 9 }, { type: 'sheep', at: 9.4, amp: 8 },
      { type: 'sheep', at: 12.5, amp: 7, phase: 1.4 }, { type: 'dandelion', at: 19.0, amp: 9, phase: 0.8 },
    ],
  },
  {
    id: 'palm-cove',
    name: 'Coral Lagoons',
    names: { fr: 'Lagons de corail', en: 'Coral Lagoons' },
    short: 'CORAL LAGOONS',
    shorts: { fr: 'LAGONS DE CORAIL', en: 'CORAL LAGOONS' },
    theme: 'lagoon',
    song: 'race',
    music: 'lagoon',
    color: '#3fc4c8',
    banner: 'LAGONS DE CORAIL',
    blurb: 'Turquoise water, a boardwalk over the reef and scuttling crabs.',
    blurbs: {
      fr: 'Eau turquoise, ponton au-dessus du récif et crabes qui traversent.',
      en: 'Turquoise water, a boardwalk over the reef and scuttling crabs.',
    },
    scale: 1.08,
    cp: [
      [0, 0, -60], [0, 0, 60], [2, 0, 175], [22, 1, 258], [80, 3, 302], [160, 5, 296], [230, 6, 252],
      [262, 6, 182], [238, 5, 118], [292, 4, 64], [258, 4, 4], [296, 6, -62], [304, 10, -140], [284, 10, -212],
      [226, 6, -262], [150, 3, -284], [66, 1, -300], [-20, 0, -318], [-96, 0, -322], [-128, 0, -292],
      [-106, 0, -256], [-50, 0, -236], [-8, 0, -196], [0, 0, -140],
    ],
    lake: { x: 405, z: -205, r: 125 },
    shortcuts: [{ from: 18.5, to: 20.4 }],
    pads: [
      { at: 10.45, lats: [-6, 0, 6], stagger: true },
      { at: 20.75, lats: [-4.5, 4.5] }, { at: 21.3, lats: [0] },
      { at: 4.15, line: 2 },
      { at: 18.1, lats: [-8.4] },                      // aimed across the sandbar shortcut
    ],
    ramps: [{ at: 14.35, hw: 10, h: 1.7 }, { at: 4.65, hw: 9, h: 1.5 }],
    itemRows: [1.25, 6.5, 9.2, 12.5, 16.4, 21.6],
    coins: [
      { at: 2.1, lat: 0, n: 6 }, { at: 5.3, lat: -6, n: 5 }, { at: 7.6, lat: 5, n: 5 }, { at: 11.4, lat: 0, n: 6 },
      { at: 15.4, lat: -6, n: 5 }, { at: 17.4, lat: 7, n: 4 }, { at: 22.6, lat: -4, n: 5 },
    ],
    hazards: [
      { type: 'crab', at: 16.8, lat: 0, amp: 8 }, { type: 'crab', at: 17.4, lat: 0, amp: 9 },
      { type: 'crab', at: 2.9, lat: 0, amp: 8, phase: 1.1 },
    ],
  },
  {
    id: 'jungle',
    name: 'Amazon Canopy',
    names: { fr: 'Canopée d’Amazonie', en: 'Amazon Canopy' },
    short: 'AMAZON CANOPY',
    shorts: { fr: 'CANOPÉE D’AMAZONIE', en: 'AMAZON CANOPY' },
    theme: 'jungle',
    song: 'race',
    music: 'jungle',
    color: '#4fa35a',
    banner: 'CANOPÉE D’AMAZONIE',
    blurb: 'Vine bridge over the river, switchbacks up to the canopy and a gorge to leap.',
    blurbs: {
      fr: 'Pont de lianes sur la rivière, lacets jusqu’à la canopée et une gorge à sauter.',
      en: 'Vine bridge over the river, switchbacks up to the canopy and a gorge to leap.',
    },
    scale: 1.04,
    cp: [
      [0, 0, -60], [0, 0, 50], [-20, 1, 130], [-80, 2, 172], [-160, 2, 178], [-240, 3, 150], [-280, 5, 95],
      [-270, 7, 40], [-220, 9, 22], [-140, 10, 22], [-96, 10, 8], [-88, 10, -24], [-122, 10, -46], [-200, 12, -46],
      [-262, 15, -70], [-252, 17, -116], [-170, 19, -116], [-90, 19, -122], [-50, 15, -170], [-80, 10, -230],
      [-40, 6, -280], [20, 3, -272], [40, 1, -210], [10, 0, -150],
    ],
    lake: { x: -170, z: 262, r: 95 },
    shortcuts: [{ from: 9.4, to: 11.3 }],
    pads: [
      { at: 0.6, line: 2 },
      { at: 9.15, lats: [-8.4] },                      // aimed through the fern shortcut
      { at: 14.9, lats: [-4.5, 4.5] }, { at: 15.25, lats: [0] },
      { at: 21.4, lats: [-6, 0, 6], stagger: true },
    ],
    ramps: [{ at: 15.5, hw: 12.2, h: 2.0, gap: 12 }, { at: 19.45, hw: 8, h: 1.2 }],
    itemRows: [1.3, 5.2, 8.6, 13.2, 17.4, 21.9],
    coins: [
      { at: 0.4, lat: 0, n: 6 }, { at: 3.6, lat: 0, n: 6 }, { at: 7.5, lat: -5, n: 5 }, { at: 12.4, lat: 5, n: 5 },
      { at: 16.3, lat: 0, n: 5 }, { at: 19.9, lat: -5, n: 5 }, { at: 22.6, lat: 4, n: 5 },
    ],
    hazards: [
      { type: 'frog', at: 5.6, amp: 8 }, { type: 'frog', at: 6.3, amp: 9, phase: 1.2 },
      { type: 'frog', at: 12.8, amp: 8, phase: 0.6 }, { type: 'frog', at: 20.5, amp: 9, phase: 2.1 },
    ],
  },
  {
    id: 'sunset-canyon',
    name: 'Singing Dunes',
    names: { fr: 'Dunes qui chantent', en: 'Singing Dunes' },
    short: 'SINGING DUNES',
    shorts: { fr: 'DUNES QUI CHANTENT', en: 'SINGING DUNES' },
    theme: 'desert',
    song: 'desert',
    music: 'dunes',
    color: '#e8a860',
    banner: 'DUNES QUI CHANTENT',
    blurb: 'Tozeur’s dunes at sunset: palm grove, sandstone arches and big jumps.',
    blurbs: {
      fr: 'Les dunes de Tozeur au couchant : palmeraie, arches de grès et grands sauts.',
      en: 'Tozeur’s dunes at sunset: palm grove, sandstone arches and big jumps.',
    },
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
    id: 'medina',
    name: 'Sidi Bou Said',
    names: { fr: 'Sidi Bou Saïd', en: 'Sidi Bou Said' },
    short: 'SIDI BOU SAID',
    shorts: { fr: 'SIDI BOU SAÏD', en: 'SIDI BOU SAID' },
    theme: 'medina',
    song: 'desert',
    music: 'medina',
    color: '#2a6fb0',
    banner: 'SIDI BOU SAÏD',
    blurb: 'White and blue lanes up to the cliff, a plaza leap and the harbour below.',
    blurbs: {
      fr: 'Ruelles blanches et bleues jusqu’à la falaise, un saut de place et le port en contrebas.',
      en: 'White and blue lanes up to the cliff, a plaza leap and the harbour below.',
    },
    scale: 1.05,
    cp: [
      [0, 0, -60], [0, 0, 30], [10, 1, 90], [60, 3, 110], [120, 5, 100], [150, 8, 60], [190, 11, 40], [240, 13, 60],
      [270, 15, 110], [250, 17, 170], [190, 17, 190], [130, 17, 210], [100, 17, 260], [150, 17, 300], [230, 12, 290],
      [300, 8, 240], [340, 5, 170], [350, 3, 90], [330, 1, 10], [280, 1, -40], [200, 0, -60], [140, 0, -110],
      [80, 0, -160], [20, 0, -150],
    ],
    lake: { x: 470, z: 120, r: 100 },
    shortcuts: [{ from: 11.5, to: 12.7 }],
    pads: [
      { at: 0.6, line: 2 },
      { at: 11.25, lats: [-8.4] },                     // aimed through the garden shortcut
      { at: 16.9, lats: [-6, 0, 6], stagger: true },
      { at: 20.6, lats: [-4.5, 4.5] },
    ],
    ramps: [{ at: 13.55, hw: 11, h: 1.6 }],
    itemRows: [1.4, 5.5, 9.6, 14.3, 18.5, 21.7],
    coins: [
      { at: 2.4, lat: 0, n: 5 }, { at: 6.4, lat: 5, n: 5 }, { at: 10.4, lat: -5, n: 5 }, { at: 15.2, lat: 0, n: 6 },
      { at: 19.4, lat: 5, n: 5 }, { at: 22.3, lat: -4, n: 5 },
    ],
    hazards: [
      { type: 'cat', at: 4.4, amp: 7 }, { type: 'cat', at: 8.5, amp: 8, phase: 1.6 },
      { type: 'cat', at: 19.8, amp: 8, phase: 0.7 }, { type: 'cat', at: 21.2, amp: 7, phase: 2.4 },
    ],
  },
  {
    id: 'city',
    name: 'Rooftop City',
    names: { fr: 'La Ville des toits', en: 'Rooftop City' },
    short: 'ROOFTOP CITY',
    shorts: { fr: 'LA VILLE DES TOITS', en: 'ROOFTOP CITY' },
    theme: 'city',
    song: 'race',
    music: 'city',
    color: '#ffb84a',
    banner: 'LA VILLE DES TOITS',
    blurb: 'Tram-rail streets, a viaduct leap between rooftops and a canal at dusk.',
    blurbs: {
      fr: 'Rues à rails de tram, un saut de viaduc entre les toits et un canal au crépuscule.',
      en: 'Tram-rail streets, a viaduct leap between rooftops and a canal at dusk.',
    },
    scale: 1.0,
    cp: [
      [0, 0, -60], [0, 0, 60], [0, 1, 150], [30, 3, 205], [110, 6, 215], [200, 10, 215], [280, 12, 205], [325, 12, 160],
      [330, 10, 70], [310, 8, 10], [250, 6, -20], [230, 4, -90], [262, 2, -140], [330, 2, -150], [400, 2, -150],
      [442, 2, -182], [426, 2, -228], [360, 2, -240], [260, 1, -300], [150, 0, -300], [80, 0, -270], [30, 0, -220], [0, 0, -150],
    ],
    lake: { x: 160, z: -372, r: 85 },
    bridges: [{ from: 4.5, to: 7.7 }],
    shortcuts: [{ from: 14.2, to: 15.8 }],
    pads: [
      { at: 1.2, line: 2 },
      { at: 4.95, lats: [-4.5, 4.5] }, { at: 5.15, lats: [0] },
      { at: 13.85, lats: [-8.4] },                     // aimed across the plaza shortcut
      { at: 19.6, lats: [-6, 0, 6], stagger: true },
    ],
    ramps: [{ at: 5.4, hw: 12.2, h: 1.9, gap: 13 }],
    itemRows: [1.6, 6.6, 9.8, 12.5, 17.4, 20.6],
    coins: [
      { at: 0.5, lat: 0, n: 6 }, { at: 3.6, lat: -5, n: 5 }, { at: 7.0, lat: 0, n: 5 }, { at: 10.5, lat: 5, n: 5 },
      { at: 13.0, lat: -4, n: 5 }, { at: 18.3, lat: 0, n: 6 }, { at: 21.3, lat: 4, n: 5 },
    ],
    hazards: [
      { type: 'pigeon', at: 2.5, amp: 7 }, { type: 'pigeon', at: 11.2, amp: 8, phase: 1.3 },
      { type: 'pigeon', at: 17.0, amp: 8, phase: 0.4 }, { type: 'pigeon', at: 20.2, amp: 7, phase: 2.2 },
    ],
  },
  {
    id: 'frosty-peaks',
    name: 'Aurora Night',
    names: { fr: 'Nuit des aurores', en: 'Aurora Night' },
    short: 'AURORA NIGHT',
    shorts: { fr: 'NUIT DES AURORES', en: 'AURORA NIGHT' },
    theme: 'aurora',
    song: 'snow',
    music: 'aurora',
    color: '#7fb8ff',
    banner: 'NUIT DES AURORES',
    blurb: 'Snowy pass under the northern lights: lanterns, snowmen and a fast downhill.',
    blurbs: {
      fr: 'Col enneigé sous les aurores boréales : lanternes, bonshommes de neige et descente rapide.',
      en: 'Snowy pass under the northern lights: lanterns, snowmen and a fast downhill.',
    },
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
    id: 'lava-keep',
    name: 'Realm of Night',
    names: { fr: 'Le Domaine de la Nuit', en: 'Realm of Night' },
    short: 'REALM OF NIGHT',
    shorts: { fr: 'DOMAINE DE LA NUIT', en: 'REALM OF NIGHT' },
    theme: 'night',
    song: 'lava',
    music: 'night',
    color: '#8f7ff0',
    banner: 'DOMAINE DE LA NUIT',
    blurb: 'Crystal castle over a starry void: shadow stompers and a broken star bridge.',
    blurbs: {
      fr: 'Château de cristal au-dessus du vide étoilé : écraseurs d’ombre et pont d’étoiles brisé.',
      en: 'Crystal castle over a starry void: shadow stompers and a broken star bridge.',
    },
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
  {
    id: 'dawn',
    name: 'Coupe de l’Aube',
    names: { fr: 'Coupe de l’Aube', en: 'Dawn Cup' },
    color: '#ffc193',
    unlocked: true,
    tracks: ['meadow', 'palm-cove', 'jungle', 'sunset-canyon'],
  },
  {
    id: 'dusk',
    name: 'Coupe du Crépuscule',
    names: { fr: 'Coupe du Crépuscule', en: 'Dusk Cup' },
    color: '#8f7ff0',
    unlocked: false,           // unlocked by a podium in the Dawn Cup (GAME_DESIGN §5)
    tracks: ['medina', 'city', 'frosty-peaks', 'lava-keep'],
  },
];

// Cup ids used by Turbo Kart Rally builds (saved trophies / settings) map onto the Lumen cups.
export const LEGACY_CUP_IDS = { turbo: 'dawn', reverse: 'dusk' };
export function getCup(id) {
  const key = LEGACY_CUP_IDS[id] || id;
  return CUPS.find((c) => c.id === key) || CUPS[0];
}

export const GP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

// Ids used by earlier builds / saved online rooms map onto the current courses.
const LEGACY_IDS = { palm: 'palm-cove', frost: 'frosty-peaks', canyon: 'sunset-canyon', lava: 'lava-keep', 'alpine-rush': 'frosty-peaks', 'neon-harbor': 'lava-keep' };

export function getTrackDef(id) {
  const key = LEGACY_IDS[id] || id;
  return TRACKS.find((t) => t.id === key) || TRACKS[0];
}

/** Localised display name ('fr' | 'en'), falling back to the English `name`. */
export function trackName(def, lang = 'fr') {
  return (def && def.names && def.names[lang]) || (def && def.name) || '';
}
export function trackBlurb(def, lang = 'fr') {
  return (def && def.blurbs && def.blurbs[lang]) || (def && def.blurb) || '';
}
