// Constantes de l'application (réglages, palettes, réseau, clavier).
import { MAP_H, MAP_W, TILE } from './world.js';

// --- Déplacements ---
export const STEP_MS = 140;      // durée d'un pas
export const SPRINT_MS = 65;     // Maj maintenu : courir
export const CROUCH_MS = 260;    // C : accroupi, on avance à pas de loup
export const DASH_TILES = 3;     // Espace : bond de 3 cases
export const DASH_COOLDOWN = 450;
export const TRAIL_MS = 260;     // durée de la traînée du dash

export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

// --- Personnage ---
export const PALETTE = {
  shirt: ['#6c63ff', '#06d6a0', '#ef476f', '#ffd166', '#118ab2', '#f78c6b', '#9b5de5', '#2b2d42'],
  hair: ['#3b2a20', '#1c1c1c', '#8d5524', '#e6b85c', '#c0392b', '#d9d9d9', '#5e4bd8', '#f4a6c1'],
  skin: ['#f8d9c0', '#f1c7a4', '#d9a179', '#b07a53', '#8a5a3b', '#5c3a26'],
};
export const COLOR = /^#[0-9a-f]{6}$/i; // validation des couleurs reçues du réseau

// --- Réseau pair-à-pair (Trystero : la signalisation WebRTC passe par des relais Nostr publics) ---
export const APP_ID = 'remote-town-c4software';
// Relais choisis pour leur fiabilité (la sélection automatique de Trystero
// en incluait des morts ou lents, d'où des participants qui ne se voyaient pas)
export const RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://nostr.oxtr.dev',
  'wss://relay.nostr.net',
  'wss://relay.snort.social',
  'wss://relay.damus.io',
  'wss://offchain.pub',
  'wss://nostr.bitcoiner.social',
];

// --- Clavier et directions ---
export const DIRS = {
  // e.code = position physique : WASD en QWERTY = ZQSD en AZERTY
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};
export const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const DIR_NAMES = Object.keys(DELTA);
