// Clavier et souris : raccourcis, directions tenues, clic sur la carte.
import { DIRS } from './config.js';
import { $, toast, typing } from './dom.js';
import { setPtt, toggleMic } from './media.js';
import { bfs, chairBusy, dash, freeLecternSpot, interact, sendMove, sitOn, startOnAir, stopOnAir, toggleCrouch } from './movement.js';
import { showPanel } from './panel.js';
import { closeProfile } from './profile.js';
import { canvas } from './render.js';
import { REACTIONS, sendReaction, toggleHand } from './social.js';
import { S, keys } from './state.js';
import { closeFocus } from './videos.js';
import { LECTERN, TILE, chairAt } from './world.js';

export function heldDir() {
  const order = ['up', 'down', 'left', 'right'];
  return [...keys].reverse().find((d) => order.includes(d));
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initInput() {
  addEventListener('keydown', (e) => {
    if (e.key === 'Shift') S.sprinting = true;
    if (!S.me) return;
    if (S.editingProfile) { if (e.key === 'Escape') closeProfile(); return; }
    if (e.key === 'Escape') {
      if (S.focusKey) closeFocus();
      document.activeElement?.blur();
      return;
    }
    if (typing()) return;
    if (e.code === 'Enter') { e.preventDefault(); if ($('#sidebar').classList.contains('closed') || S.activePanel !== 'chat') showPanel('chat'); else $('#chatInput').focus(); return; }
    if (e.code === 'KeyN') { e.preventDefault(); if (!e.repeat) setPtt(true); return; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) dash(); return; }
    if (e.code === 'KeyE') { if (!e.repeat) interact(); return; }
    if (e.code === 'KeyC') { if (!e.repeat) toggleCrouch(); return; }
    if (e.code === 'KeyH') { if (!e.repeat) toggleHand(); return; }
    const n = /^(Digit|Numpad)([1-6])$/.exec(e.code);
    if (n) { if (!e.repeat) sendReaction(REACTIONS[n[2] - 1]); return; }
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
    if (DIRS[e.code]) keys.delete(DIRS[e.code]);
  });
  addEventListener('blur', () => { keys.clear(); S.sprinting = false; if (S.me) setPtt(false); });
  $('#chatInput').addEventListener('focus', () => keys.clear());

  canvas.addEventListener('click', (e) => {
    if (!S.me) return;
    document.activeElement?.blur();
    const tx = Math.floor((e.clientX / S.cam.zoom + S.cam.x) / TILE);
    const ty = Math.floor((e.clientY / S.cam.zoom + S.cam.y) / TILE);
    S.airTarget = false;
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
