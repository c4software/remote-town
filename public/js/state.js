// État partagé entre les modules.
// Règle : les objets exportés ici sont mutés, jamais réassignés. Tout module peut
// lire et écrire S.me, S.path… ; une variable utile à un seul module reste dans ce module.
import * as trysteroModule from '../vendor/trystero-nostr.js';

export const users = new Map(); // id -> participant (moi compris, avec isMe: true)
export const keys = new Set();  // directions tenues au clavier ('up', 'down'…)
export const myIds = new Set(); // nos identifiants successifs (un par instance de Trystero)

export const S = {
  // --- Moi ---
  myId: null,       // identifiant pair-à-pair courant
  me: null,         // mon participant (aussi présent dans users)
  roomId: 'lobby',  // salle rejointe (?room=…)
  joinedAt: 0,
  kicked: false,    // expulsé·e de l'espace par un administrateur (admin.js) : plus de reconnexion
  editingProfile: false, // écran du personnage rouvert pendant la session

  // --- Réseau ---
  // Module Trystero courant : « Relancer la connexion » en charge une instance neuve,
  // car Trystero abandonne définitivement un relais après ~2 min d'échecs.
  tr: trysteroModule,
  room: null,       // salle Trystero (joinRoom)
  net: null,        // actions réseau : hello, move, state, chat, wb, react, jingle, history

  // --- Audio et partage d'écran ---
  audioCtx: null,
  micDevice: '',    // micro choisi (deviceId) ; '' = micro par défaut du système
  micStream: null,
  micTrack: null,
  localAnalyser: null,
  micOn: false,     // micro (M)
  pttHeld: false,   // N maintenu
  screenStream: null,
  screenTrack: null,
  sharing: false,

  // --- Déplacements ---
  path: null,       // trajet en cours (liste de cases) après un clic
  sitTarget: null,  // chaise visée par le trajet : on s'y assoit en arrivant
  airTarget: false, // pupitre visé par le trajet : on prend la parole en arrivant
  portalTarget: false, // porte des espaces visée par le trajet : on l'ouvre en arrivant
  warp: null,       // passage de la porte en cours : { phase: 'out' | 'wait' | 'in', at, name }
  nextStepAt: 0,
  nextDashAt: 0,
  sprinting: false, // Maj maintenu

  // --- Affichage ---
  mapCanvas: null,  // carte pré-rendue
  cam: { x: 0, y: 0, zoom: 2 },
  focusKey: null,   // partage d'écran affiché en grand
  activePanel: 'chat',
  globalHistoryLoaded: false,
};
