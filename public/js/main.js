// Point d'entrée : branche les événements de chaque module, dans l'ordre.
// Les modules ne font rien au chargement (hormis déclarer constantes et fonctions) :
// tout ce qui touche à la page est dans leur fonction init…(), appelée ici.
import { initBoard } from './board.js';
import { initChat } from './chat.js';
import { diagnostic, initDiag, lastDiag } from './diag.js';
import { initEmotes } from './emotes.js';
import { initHud } from './hud.js';
import { initInput } from './input.js';
import { links } from './media.js';
import { bfs, onMyMove, sendMove, sitOn, toggleSit } from './movement.js';
import { rejoin, relaunch } from './net.js';
import { initPanel } from './panel.js';
import { initProfile } from './profile.js';
import { initSpaces } from './spaces.js';
import { S, users } from './state.js';
import { initVideos } from './videos.js';

initProfile(); // écran de connexion : la connexion démarre quand on le valide
initHud();
initPanel();
initChat();
initBoard();
initVideos();
initInput();
initEmotes();
initSpaces();
initDiag();

// Accès de débogage (utilisé par les tests automatisés) : ouvrir la page avec ?debug
if (new URLSearchParams(location.search).has('debug')) {
  window.rt = {
    users,
    links,
    get me() { return S.me; },
    get room() { return S.room; },
    get tr() { return S.tr; },
    get path() { return S.path; },
    get warp() { return S.warp; },
    get cam() { return S.cam; },
    walkTo: (x, y) => (S.path = bfs(S.me.x, S.me.y, x, y)),
    place: (x, y) => { S.me.x = S.me.rx = x; S.me.y = S.me.ry = y; sendMove(); onMyMove(); },
    sitOn: (x, y) => sitOn(x, y),
    toggleSit: () => toggleSit(),
    rejoin: () => rejoin(),
    relaunch: () => relaunch(),
    diag: () => diagnostic(),
    get lastDiag() { return lastDiag(); },
  };
}
