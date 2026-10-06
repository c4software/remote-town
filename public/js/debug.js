// Accès de débogage window.rt (pilotage depuis la console, tests de bout en bout) : page
// ouverte avec ?debug, en local, ou sur le site publié avec un jeton d'administration
// vérifié (voir debugMode dans dom.js et admin.js).
import { loadToken, setTestKey } from './admin.js';
import { nearRingInfo, ringing } from './audio.js';
import { boards } from './board.js';
import { zoneName } from './desks.js';
import { diagnostic, lastDiag } from './diag.js';
import { checkAway } from './emotes.js';
import { debugMode } from './dom.js';
import { links } from './media.js';
import { bfs, onMyMove, sendMove, sitOn, toggleSit } from './movement.js';
import { rejoin, relaunch } from './net.js';
import { openChat, openPerson } from './phone.js';
import { S, users } from './state.js';

// Appelé au démarrage (main.js), puis par admin.js une fois le jeton vérifié
export function initDebug() {
  if (window.rt || !debugMode()) return;
  window.rt = {
    users,
    links,
    boards,
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
    get nearRing() { return nearRingInfo(); },
    get ringing() { return ringing(); }, // ma propre sonnerie ou tonalité d'appel (tests) // sonnerie d'un voisin en cours (tests)
    diag: () => diagnostic(),
    inZoneFor: (ms) => { S.zoneAt = performance.now() - ms; }, // comme si j'étais dans ma zone depuis ms (tests)
    zoneName: (id) => zoneName(id), // nom affiché d'une zone (bureau renommé ou non)
    checkAway: (idleMs) => checkAway(idleMs), // absence : comme si rien n'avait été fait depuis idleMs (tests)
    openChat: (key) => openChat(key),     // téléphone : conversation 'global', 'zone' ou 'dm:<pseudo>'
    openPerson: (id) => openPerson(id),   // téléphone : fiche d'une personne
    setAdminTestKey: setTestKey, // tests de l'expulsion avec une clé jetable
    loadAdminToken: loadToken,
    get lastDiag() { return lastDiag(); },
  };
}
