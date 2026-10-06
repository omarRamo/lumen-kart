// Lumen Kart shared identity: palette, item names and course/cup identifiers.
// Internal ids (coin, banana, green_shell…) are kept from the original engine so physics, AI, network and
// tests keep working; everything the player sees reads its name, colour and icon from here.

export const PALETTE = {
  lumenTeal: 0x387d76,
  lumenDeep: 0x306f70,
  lumenMint: 0x99d1b7,
  leafLight: 0xa6dfc6,
  cream: 0xfff7dc,
  scarf: 0xe98c73,
  scarfStitch: 0xffe2ac,
  starGold: 0xedc371,
  chestStar: 0xf3d096,
  eye: 0x25575b,
  cheek: 0xedba9c,
  night: 0x1c1640,
  aurora: 0xb5f3d0,
  dawn: 0xffc193,
  comet: 0xdbb2f6,
};

// CSS versions for the DOM UI.
export const CSS = {
  teal: '#387d76', deep: '#1f4f4c', mint: '#99d1b7', cream: '#fff7dc', scarf: '#e98c73',
  gold: '#edc371', night: '#1c1640', aurora: '#b5f3d0', dawn: '#ffc193', comet: '#dbb2f6',
};

// Every item the engine knows, re-dressed in Lumen's world. `icon` is an emoji fallback for compact UI;
// the HUD should prefer a rendered/canvas icon when available.
export const ITEM_INFO = {
  coin:            { fr: 'Note',              en: 'Note',            color: '#f3d096', icon: '🎵' },
  banana:          { fr: 'Ronce',             en: 'Bramble',         color: '#7a9a4a', icon: '🌿' },
  triple_banana:   { fr: 'Triple ronce',      en: 'Triple bramble',  color: '#7a9a4a', icon: '🌿' },
  green_shell:     { fr: 'Graine',            en: 'Seed',            color: '#7ed37a', icon: '🌰' },
  triple_green:    { fr: 'Triple graine',     en: 'Triple seed',     color: '#7ed37a', icon: '🌰' },
  red_shell:       { fr: 'Luciole',           en: 'Firefly',         color: '#ffb36b', icon: '✨' },
  mushroom:        { fr: 'Comète',            en: 'Comet',           color: '#dbb2f6', icon: '☄️' },
  triple_mushroom: { fr: 'Triple comète',     en: 'Triple comet',    color: '#dbb2f6', icon: '☄️' },
  bomb:            { fr: 'Fleur solaire',     en: 'Sunflower burst', color: '#ffc193', icon: '🌼' },
  ghost:           { fr: 'Voile de nuit',     en: 'Night veil',      color: '#6b5fd0', icon: '🌙' },
  star:            { fr: 'Aurore',            en: 'Aurora',          color: '#b5f3d0', icon: '🌈' },
  bullet:          { fr: 'Plume d’envol',     en: 'Flight feather',  color: '#d9f8d4', icon: '🪶' },
  lightning:       { fr: 'Éclipse',           en: 'Eclipse',         color: '#ffe27a', icon: '🌑' },
  blue_shell:      { fr: 'Étoile filante',    en: 'Shooting star',   color: '#8fd3ff', icon: '🌠' },
  horn:            { fr: 'Résonance',         en: 'Resonance',       color: '#c5f5de', icon: '🔔' },
  item_box:        { fr: 'Prisme de lumière', en: 'Light prism',     color: '#fff4c5', icon: '💎' },
};

export function itemName(id, lang = 'fr') {
  const info = ITEM_INFO[id];
  return info ? (info[lang] || info.en) : String(id || '');
}
