// Clavier et souris : raccourcis, directions tenues, clic sur la carte.
import { DIRS } from './config.js';
import { $, toast, typing } from './dom.js';
import { setPtt, toggleMic } from './media.js';
import { bfs, chairBusy, dash, freeLecternSpot, interact, jump, sendMove, sitOn, startOnAir, stopOnAir, toggleCrouch } from './movement.js';
import { showPanel } from './panel.js';
import { closeProfile } from './profile.js';
import { canvas } from './render.js';
import { REACTIONS, sendJingle, sendReaction, setSixSeven, toggleHand } from './social.js';
import { openSpaces, spacesOpen } from './spaces.js';
import { S, keys } from './state.js';
import { closeFocus } from './videos.js';
import { LECTERN, PORTAL, PORTAL_SPOT, TILE, chairAt, nearPortal } from './world.js';

export function heldDir() {
  const order = ['up', 'down', 'left', 'right'];
  return [...keys].reverse().find((d) => order.includes(d));
}

// Easter egg « 67 » : 6 et 7 maintenus ensemble. Le 6 seul reste la réaction 😮,
// envoyée avec un léger retard pour pouvoir l'annuler si le 7 suit.
const CHORD_MS = 120;
const digitsHeld = new Set();
let pendingSix = null;

function onDigit(d) {
  digitsHeld.add(d);
  const other = d === '6' ? '7' : d === '7' ? '6' : null;
  if (other && digitsHeld.has(other)) {
    clearTimeout(pendingSix); pendingSix = null;
    setSixSeven(true);
  } else if (d === '6') {
    pendingSix = setTimeout(() => { pendingSix = null; sendReaction(REACTIONS[5]); }, CHORD_MS);
  } else if (d !== '7') sendReaction(REACTIONS[d - 1]);
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initInput() {
  addEventListener('keydown', (e) => {
    if (e.key === 'Shift') S.sprinting = true;
    if (!S.me) return;
    if (S.editingProfile) { if (e.key === 'Escape') closeProfile(); return; }
    if (S.warp || spacesOpen()) return;
    if (e.key === 'Escape') {
      if (S.focusKey) closeFocus();
      document.activeElement?.blur();
      return;
    }
    if (typing()) return;
    if (e.code === 'Enter') { e.preventDefault(); if ($('#sidebar').classList.contains('closed') || S.activePanel !== 'chat') showPanel('chat'); else $('#chatInput').focus(); return; }
    if (e.code === 'KeyN') { e.preventDefault(); if (!e.repeat) setPtt(true); return; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) dash(); return; }
    // preventDefault : si E ouvre la porte des espaces, le « e » ne s'écrit pas dans son champ
    if (e.code === 'KeyE') { e.preventDefault(); if (!e.repeat) interact(); return; }
    if (e.code === 'KeyC') { if (!e.repeat) toggleCrouch(); return; }
    if (e.code === 'KeyV') { if (!e.repeat) jump(); return; }
    if (e.code === 'KeyH') { if (!e.repeat) toggleHand(); return; }
    if (e.code === 'KeyJ') { if (!e.repeat) sendJingle(); return; }
    const n = /^(Digit|Numpad)([1-7])$/.exec(e.code);
    if (n) { if (!e.repeat) onDigit(n[2]); return; }
    if (e.key.toLowerCase() === 'm' && !e.repeat) { toggleMic(); return; }
    if (DIRS[e.code]) {
      e.preventDefault();
      keys.add(DIRS[e.code]); S.path = null;
      if (!e.repeat && (S.me.dir !== DIRS[e.code] || S.me.seated)) { S.me.dir = DIRS[e.code]; S.me.seated = false; sendMove(); }
    }
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'Shift') S.sprinting = false;
    if (e.code === 'Space' && !typing()) e.preventDefault(); // évite d'« appuyer » sur le bouton qui a le focus
    if (e.code === 'KeyN') setPtt(false);
    const n = /^(Digit|Numpad)([1-7])$/.exec(e.code);
    if (n) { digitsHeld.delete(n[2]); if (n[2] === '6' || n[2] === '7') setSixSeven(false); }
    if (DIRS[e.code]) keys.delete(DIRS[e.code]);
  });
  addEventListener('blur', () => { keys.clear(); digitsHeld.clear(); S.sprinting = false; if (S.me) { setPtt(false); setSixSeven(false); } });
  $('#chatInput').addEventListener('focus', () => keys.clear());

  canvas.addEventListener('click', (e) => {
    if (!S.me) return;
    document.activeElement?.blur();
    // Sur ordinateur, on se déplace au clavier uniquement (E pour les chaises, le pupitre,
    // la porte) ; le clic sur la carte ne déplace que sur écran tactile, faute de clavier
    if (e.pointerType === 'mouse') return;
    const tx = Math.floor((e.clientX / S.cam.zoom + S.cam.x) / TILE);
    const ty = Math.floor((e.clientY / S.cam.zoom + S.cam.y) / TILE);
    S.airTarget = false; S.portalTarget = false;
    if (S.warp) return;
    // Porte des espaces : on s'y rend, puis la fenêtre de choix s'ouvre
    if (tx === PORTAL.x && ty === PORTAL.y) {
      S.sitTarget = null;
      if (nearPortal(S.me.x, S.me.y)) { S.path = null; return openSpaces(); }
      S.portalTarget = true;
      S.path = bfs(S.me.x, S.me.y, PORTAL_SPOT[0], PORTAL_SPOT[1]);
      return;
    }
    if (ty === LECTERN.y && tx >= LECTERN.x && tx < LECTERN.x + LECTERN.w) {
      if (S.me.onAir) return stopOnAir();
      const spot = freeLecternSpot();
      if (!spot) return toast('Quelqu\'un est déjà au pupitre');
      if (spot[0] === S.me.x && spot[1] === S.me.y) return startOnAir();
      S.sitTarget = null; S.airTarget = true;
      S.path = bfs(S.me.x, S.me.y, spot[0], spot[1]);
      return;
    }
    if (chairAt(tx, ty) && chairBusy(tx, ty)) { S.path = S.sitTarget = null; return toast('Cette chaise est déjà prise'); }
    S.sitTarget = chairAt(tx, ty) ? [tx, ty] : null;
    if (S.sitTarget && tx === S.me.x && ty === S.me.y) { S.sitTarget = null; return sitOn(tx, ty); }
    S.path = bfs(S.me.x, S.me.y, tx, ty);
  });
}
