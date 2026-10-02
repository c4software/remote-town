// Constantes de l'application (réglages, palettes, réseau, clavier).
import { MAP_H, MAP_W, TILE } from './world.js';

// --- Déplacements ---
export const STEP_MS = 140;      // durée d'un pas
export const SPRINT_MS = 65;     // Maj maintenu : courir
export const CROUCH_MS = 260;    // C : accroupi, on avance à pas de loup
export const DASH_TILES = 3;     // Espace : bond de 3 cases
export const DASH_COOLDOWN = 450;
export const TRAIL_MS = 260;     // durée de la traînée du dash
export const HOP_MS = 220;       // petit bond : V (sauter) ou en levant le talkie (N)

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
// en incluait des morts ou lents, d'où des participants qui ne se voyaient pas).
// Retirés : offchain.pub et nostr.bitcoiner.social (comptes « de confiance » seulement),
// relay.damus.io (nous bannit pour excès de requêtes), nos.lol et nostr.mom (exigent
// une preuve de travail que Trystero ne fournit pas).
export const RELAYS = [
  'wss://relay.primal.net',
  'wss://nostr.oxtr.dev',
  'wss://relay.nostr.net',
  'wss://relay.snort.social',
];
// Notre relais de mise en relation (dossier relay/, auto-hébergé) : sans quota par adresse
// IP, placé avant les relais publics, qui restent en secours. S'il fournit aussi /turn
// (identifiants TURN temporaires), le son et l'image passent par un relais TURN quand la
// connexion directe est impossible ; sinon on s'en passe. Utilisé seulement depuis les
// pages de NET_HOSTS (le relais refuse les autres) ; ailleurs, relais publics seuls.
export const NET_URL = 'https://relay.brosseau.ovh';
export const NET_HOSTS = ['distance.brosseau.ovh', 'c4software.github.io'];
// Serveurs STUN publics gratuits (sans identifiants) : secours pour trouver son adresse
// publique quand /turn ne répond pas. Trystero en inclut déjà (Google et Cloudflare) ;
// on déclare le nôtre explicitement pour ne pas dépendre de la liste interne du bundle.
export const STUN_SERVERS = [{ urls: 'stun:stun.cloudflare.com:3478' }];

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
