// Accès de débogage window.rt (pilotage depuis la console, tests de bout en bout) : page
// ouverte avec ?debug, en local, ou sur le site publié avec un jeton d'administration
// vérifié (voir debugMode dans dom.js et admin.js).
import { loadToken, setTestKey } from './admin.js';
import { diagnostic, lastDiag } from './diag.js';
import { debugMode } from './dom.js';
import { links } from './media.js';
import { bfs, onMyMove, sendMove, sitOn, toggleSit } from './movement.js';
import { rejoin, relaunch } from './net.js';
import { S, users } from './state.js';

// Appelé au démarrage (main.js), puis par admin.js une fois le jeton vérifié
export function initDebug() {
  if (window.rt || !debugMode()) return;
  window.rt = {
    users,
    links,
    get me() { return S.me; },
    get room() { return S.room; },
    get tr() { return S.tr; },
    get path() { return S.path; },
    get warp() { return S.warp; },
    get cam() { return S.cam; },
    get pipOn() { return S.pipOn; },
    get stamina() { return { value: S.stamina, exhausted: S.exhausted }; },
    walkTo: (x, y) => (S.path = bfs(S.me.x, S.me.y, x, y)),
    place: (x, y) => { S.me.x = S.me.rx = x; S.me.y = S.me.ry = y; sendMove(); onMyMove(); },
    sitOn: (x, y) => sitOn(x, y),
    toggleSit: () => toggleSit(),
    rejoin: () => rejoin(),
    relaunch: () => relaunch(),
    diag: () => diagnostic(),
    setAdminTestKey: setTestKey, // tests de l'expulsion avec une clé jetable
    loadAdminToken: loadToken,
    get lastDiag() { return lastDiag(); },
  };
}
