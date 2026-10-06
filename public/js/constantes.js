// Constantes de l'application (réglages, palettes, réseau, clavier).
import { MAP_H, MAP_W, TILE } from './world.js';

// --- Déplacements ---
export const STEP_MS = 140;      // durée d'un pas
export const SPRINT_MS = 65;     // Maj maintenu : courir
export const CROUCH_MS = 260;    // C : accroupi, on avance à pas de loup
// Fatigue : courir vide l'endurance (~4 s de course) ; on la récupère à l'arrêt (~4 s), deux
// fois moins vite en marchant. À zéro, essoufflé·e : plus de course avant d'être remonté·e à
// recoverAt.
export const STAMINA = { max: 100, sprintCost: 1.6, regenPerS: 25, walkRegenFactor: 0.5, regenDelay: 600, recoverAt: 40 };
export const DASH_TILES = 3;     // Espace : bond de 3 cases
export const DASH_COOLDOWN = 450;
export const TRAIL_MS = 260;     // durée de la traînée du dash
export const HOP_MS = 220;       // petit bond : V (sauter) ou en levant le talkie (N)
export const WALKIE_BEEP_GAP = 3000; // N répété avant ce délai : pas de nouveau bip chez les voisins
// Téléphone (phone.js) : durée de la sonnerie, délai entre deux appels, temps laissé pour
// choisir de laisser un message, durée et taille maximales du message, messages gardés
export const CALL = { ringFileGapMs: 10000, ringMs: 20000, gapMs: 30000, awayMs: 20000, vmailMs: 20000, vmailBytes: 400000, vmailKeep: 5 };
// Partage d'écran (media.js) : chaque spectateur reçoit son propre flux, encodé et envoyé par
// la personne qui partage. Le débit montant total est donc réparti entre les spectateurs
// (totalKbps, borné par flux) ; les images par seconde et la hauteur de l'image baissent avec
// leur nombre (tiers : [spectateurs au plus, images/s, lignes]). À 45 spectateurs sans ces
// paliers, la machine qui partage saturait : son personnage se figeait ou disparaissait.
export const SHARE = { totalKbps: 5000, maxKbps: 2000, minKbps: 100, tiers: [[6, 15, 1080], [15, 8, 1080], [30, 5, 720], [Infinity, 3, 720]] };

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
// IP, seul utilisé tant qu'il répond ; les relais publics ne servent qu'en secours (net.js). S'il fournit aussi /turn
// (identifiants TURN temporaires), le son et l'image passent par un relais TURN quand la
// connexion directe est impossible ; sinon on s'en passe. Utilisé seulement depuis les
// pages de NET_HOSTS (le relais refuse les autres) ; ailleurs, relais publics seuls.
export const NET_URL = 'https://relay.brosseau.ovh';
export const NET_HOSTS = ['distance.brosseau.ovh', 'c4software.github.io'];
// Serveurs STUN publics gratuits (sans identifiants) : secours pour trouver son adresse
// publique quand /turn ne répond pas. Trystero en inclut déjà (Google et Cloudflare) ;
// on déclare le nôtre explicitement pour ne pas dépendre de la liste interne du bundle.
export const STUN_SERVERS = [{ urls: 'stun:stun.cloudflare.com:3478' }];

// --- Modération ---
// Clé publique d'administration (ECDSA P-256) : vérifie les ordres d'expulsion signés avec
// le jeton (clé privée) de l'administrateur. Générée par tools/admin-key.mjs ; null = désactivé.
export const ADMIN_KEY = { x: 'lZbylMSDtRGce6_Yu0RqVAVva1ufiEddXlJqZB0p4gg', y: 'sbZGNsB5kD9aoIPpZO-TV6eUuWL2p3myH0A1Q2XTRJQ' };

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

// ============================================================
// Listes de choix et énumérations. Chaque liste est la seule source : les écrans construisent
// leurs choix à partir d'elle, et elle sert de liste blanche pour ce qui est reçu du réseau.
// ============================================================
// Personnalisations proposées : la seule liste, dans l'ordre d'affichage. L'écran du
// personnage (profile.js) et le téléphone (phone.js) construisent leurs choix à partir d'elle,
// et elle sert de liste blanche pour ce qui est reçu du réseau. Un accessoire pour la tête,
// un pour le corps ; « Aucun » (null) est ajouté par les écrans.
export const STYLES = [
  { id: 'boy', label: 'Gars' },
  { id: 'girl', label: 'Fille' },
];
export const HEAD_OPTIONS = [
  { id: 'cap', label: '🧢 Casquette' },
  { id: 'beanie', label: '🧶 Bonnet' },
  { id: 'tophat', label: '🎩 Haut-de-forme' },
  { id: 'partyhat', label: '🥳 Chapeau de fête' },
  { id: 'crown', label: '👑 Couronne' },
  { id: 'unicorn', label: '🦄 Licorne' },
  { id: 'catears', label: '🐱 Oreilles de chat' },
  { id: 'flower', label: '🌸 Fleur' },
  { id: 'headphones', label: '🎧 Casque audio' },
  { id: 'specs', label: '👓 Lunettes de vue' },
  { id: 'glasses', label: '🤓 Grosses lunettes' },
  { id: 'shades', label: '🕶️ Lunettes de soleil' },
];
export const BODY_OPTIONS = [
  { id: 'metal', label: '🤘 T-shirt metal' },
  { id: 'claude', label: '✳️ T-shirt Claude' },
  { id: 'codex', label: '⌨️ T-shirt Codex' },
  { id: 'linux', label: '🐧 T-shirt Linux' },
  { id: 'windows', label: '🪟 T-shirt Windows' },
  { id: 'macos', label: '🍎 T-shirt macOS' },
  { id: 'tie', label: '👔 Cravate' },
  { id: 'bowtie', label: '🎀 Nœud papillon' },
  { id: 'scarf', label: '🧣 Écharpe' },
  { id: 'medal', label: '🏅 Médaille' },
  { id: 'backpack', label: '🎒 Sac à dos' },
  { id: 'cape', label: '🦸 Cape' },
];

// --- Émotes (roue du clic droit, emotes.js) et réactions (touches 1 à 6, social.js) ---
export const EMOTES = [
  { id: 'work', icon: '💻', label: 'Travail' },
  { id: 'afk', icon: '⏳', label: 'AFK' },
  { id: 'sleep', icon: '😴', label: 'Sieste' },
  { id: 'coffee', icon: '☕', label: 'Café' },
  { id: 'think', icon: '🤔', label: 'Réflexion' },
];
export const REACTIONS = ['👍', '❤️', '😂', '🎉', '👏', '😮'];
export const REACT_MS = 3000;    // durée d'affichage d'une réaction
export const JINGLE_GAP = 3000;  // ms entre deux jingles d'une même personne (le carillon dure ~2,3 s)
export const MAX_HANDS = 6;      // bulles de mains levées affichées

// --- Téléphone (phone.js) ---
// Sonneries proposées dans les réglages du téléphone (motifs synthétisés dans audio.js)
export const RING_STYLES = [
  { id: 'ip', label: 'Téléphone IP (trilles)' },
  { id: 'bell', label: 'Téléphone à cloche' },
  { id: 'beeps', label: 'Bips numériques' },
  { id: 'chime', label: 'Carillon doux' },
  { id: 'file', label: 'Mon fichier audio…' },
];
export const RING_FILE_MAX = 600000; // octets
// Formats acceptés pour la sonnerie personnelle reçue d'un voisin
export const RING_FILE_TYPES = /^audio\/(mpeg|mp3|ogg|wav|x-wav|wave|webm|mp4|aac|x-m4a|m4a|flac)(;.*)?$/i;
// État du téléphone vu des autres (champ `phone` de l'action `state`) : il sonne / en ligne
export const PHONE = Object.freeze({ RING: 'ring', CALL: 'call' });
// Phases d'un appel : ça sonne chez l'autre, on m'appelle, en ligne, pas de réponse (laisser
// un message ?), enregistrement du message vocal
export const CALL_PHASE = Object.freeze({ OUT: 'out', IN: 'in', ON: 'on', AWAY: 'away', REC: 'rec' });
// Ordres de l'action `call`
export const CALL_MSG = Object.freeze({ RING: 'ring', ACCEPT: 'accept', DECLINE: 'decline', BUSY: 'busy', CANCEL: 'cancel', END: 'end' });
// Pages du téléphone
export const PHONE_VIEW = Object.freeze({
  HOME: 'home', CONTACTS: 'contacts', PERSON: 'person', CHATS: 'chats', CHAT: 'chat', VMAIL: 'vmail', LOOK: 'look', SETTINGS: 'settings',
});

// --- Discussions (chat.js) ---
export const CHAT_KEEP = 300;    // messages gardés par conversation
export const NOTIF_MS = 6000;    // durée d'affichage de la notification d'un message reçu
// Conversations : les deux groupes, et le préfixe d'un message direct (« dm:<pseudo> »)
export const CHAT_KEY = Object.freeze({ GLOBAL: 'global', ZONE: 'zone', DM: 'dm:' });

// --- Tableau blanc (board.js) ---
export const BOARD_W = 1600, BOARD_H = 900;
export const BOARD_COLORS = ['#1d1e30', '#e63946', '#118ab2', '#2a9d8f', '#f4a261'];
export const BOARD_SIZES = [4, 9, 18];
export const BOARD_ERASER = { c: '#ffffff', w: 40 };
export const BOARD_TEXT_MAX = 400, BOARD_TEXT_LINES = 20; // un bloc de texte : caractères et lignes au plus
export const BOARD_FONT = '"DM Sans", system-ui, sans-serif', BOARD_LINE = 1.2;
export const boardFontPx = (w) => 20 + w * 3;       // taille du texte selon l'épaisseur choisie (32, 47, 74 px)
export const TEACHER_BUBBLE_MS = 200; // rafraîchissement de la bulle du prof (teacher.js)
// Messages de l'action `wb`
export const WB_MSG = Object.freeze({ OPEN: 'open', SEG: 'seg', TEXT: 'txt', CLEAR: 'clear', CLOSE: 'close', SYNC: 'sync' });

// --- Modération (admin.js) et espaces enregistrés (rooms.js) ---
// Expulsion : retour impossible pendant 15 min dans le même espace ; un ordre plus vieux que
// 2 min (ou rejoué) est ignoré
export const KICK = { banMs: 15 * 60000, maxAgeMs: 2 * 60000 };
export const SPACES_MAX = 15;
