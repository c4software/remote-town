// Réactions (1 à 6), main levée (H) et bulles des mains levées en bas à droite.
import { drawAvatar } from './avatar.js';
import { chime } from './audio.js';
import { $, ofName, toast } from './dom.js';
import { pushState } from './media.js';
import { goToUser } from './movement.js';
import { broadcast } from './net.js';
import { ctx } from './render.js';
import { S, users } from './state.js';
import { MAP, isOnAir } from './world.js';

export const REACTIONS = ['👍', '❤️', '😂', '🎉', '👏', '😮'];
const REACT_MS = 3000;
let lastReactAt = 0;

export function addReaction(u, e) {
  u.reacts = [...(u.reacts || []), { e, t: performance.now() }].slice(-5);
}

// Easter egg « 67 » : tant que 6 et 7 sont maintenus ensemble, les mains
// montent et descendent (état partagé comme le talkie, champ `six` de `state`)
export function setSixSeven(on) {
  if (!S.me || on === !!S.me.sixSeven) return;
  S.me.sixSeven = on;
  if (on) S.me.sixSevenAt = performance.now();
  pushState();
}

// Décalage des mains pendant le « 67 », null en dehors
export function sixSevenPump(u, now) {
  return u.sixSeven ? Math.round(Math.sin((now - (u.sixSevenAt || 0)) / 70) * 3) : null;
}

export function sendReaction(e) {
  if (!S.me || !REACTIONS.includes(e) || performance.now() - lastReactAt < 250) return;
  lastReactAt = performance.now();
  addReaction(S.me, e);
  broadcast('react', { e });
}

// Jingle d'annonce (J) : seulement depuis le pupitre, joué chez tout le monde.
// Juste le carillon : la voix de synthèse d'autrefois perturbait le son.
const JINGLE = [523.25, 659.25, 783.99, 1046.5]; // do, mi, sol, do
const JINGLE_GAP = 3000; // ms entre deux jingles d'une même personne (le carillon dure ~2,3 s)
export function sendJingle() {
  if (!S.me) return;
  if (!isOnAir(S.me)) return toast("🔔 Le jingle d'annonce se joue depuis le pupitre (E)");
  if (playJingle(S.me)) broadcast('jingle', {});
}
// Un jingle reçu n'est joué que si son auteur est bien au pupitre
export function onJingle(u) {
  if (isOnAir(u)) playJingle(u);
}
function playJingle(u) {
  const now = performance.now();
  if (now - (u.jingleAt || 0) < JINGLE_GAP) return false;
  u.jingleAt = now;
  chime(JINGLE, 0.2);
  toast(u.isMe ? '🔔 Annonce : tout le monde entend le jingle' : `🔔 Annonce ${ofName(u.name)}`);
  return true;
}

export function toggleHand() {
  if (!S.me) return;
  S.me.hand = !S.me.hand;
  if (S.me.hand) S.me.handAt = performance.now();
  pushState();
  renderHandBtn();
}

// Au-dessus de l'étiquette : la main levée (fixe) puis les réactions qui montent et s'effacent
export function drawHandAndReactions(u, sx, top, now) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  let base = top;
  if (u.hand) {
    const k = Math.min(1, (now - (u.handAt || 0)) / 250);
    const size = 20 * (k < 1 ? 0.5 + 0.7 * k : 1);
    ctx.save();
    ctx.translate(sx, base);
    ctx.rotate(Math.sin(now / 220) * 0.18);
    ctx.font = `${size}px sans-serif`;
    ctx.fillText('✋', 0, 0);
    ctx.restore();
    base -= 24;
  }
  const pump = sixSevenPump(u, now);
  if (pump !== null) { // le 6 et le 7 suivent chacun une main
    ctx.font = '20px sans-serif';
    ctx.fillText('6️⃣', sx - 13, base + pump * 2);
    ctx.fillText('7️⃣', sx + 13, base - pump * 2);
    base -= 30;
  }
  if (u.reacts?.length) {
    u.reacts = u.reacts.filter((r) => now - r.t < REACT_MS);
    u.reacts.forEach((r, i) => {
      const age = (now - r.t) / REACT_MS;
      const pop = age < 0.07 ? 0.4 + (age / 0.07) * 0.9 : age < 0.12 ? 1.3 - ((age - 0.07) / 0.05) * 0.3 : 1;
      ctx.globalAlpha = age > 0.7 ? (1 - age) / 0.3 : 1;
      ctx.font = `${Math.round(24 * pop)}px sans-serif`;
      ctx.fillText(r.e, sx + Math.sin(r.t + i) * 10, base - age * 36);
    });
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = 'middle';
}

function renderHandBtn() {
  const b = $('#handBtn');
  b.classList.toggle('active', !!S.me?.hand);
  b.title = S.me?.hand ? 'Baisser la main (H)' : 'Lever la main (H)';
}

// ============================================================
// Mains levées : bulles en bas à droite ; un clic emmène auprès de la personne
// ============================================================
const MAX_HANDS = 6;

function headPortrait(u) {
  const c = document.createElement('canvas');
  c.width = 26 * 3; c.height = 26 * 3;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.scale(3, 3);
  drawAvatar(g, { ...u.look, face: 'question' }, 13, 41, 'down');
  return c;
}

export function renderHands() {
  const box = $('#hands');
  if (!box || !S.me) return;
  const raised = [...users.values()].filter((u) => !u.isMe && u.hand).sort((a, b) => (a.handAt || 0) - (b.handAt || 0));
  box.replaceChildren();
  box.hidden = !raised.length;
  for (const u of raised.slice(0, MAX_HANDS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hand-bubble';
    b.title = `${u.name} lève la main · ${MAP.zoneById[u.zone]?.name || ''} — cliquer pour le rejoindre`;
    const q = document.createElement('span'); q.className = 'hb-q'; q.textContent = '?';
    const n = document.createElement('span'); n.className = 'hb-name'; n.textContent = u.name;
    b.append(headPortrait(u), q, n);
    b.onclick = () => goToUser(u.id);
    box.append(b);
  }
  if (raised.length > MAX_HANDS) {
    const more = document.createElement('div');
    more.className = 'hand-bubble more';
    more.textContent = `+${raised.length - MAX_HANDS}`;
    more.title = raised.slice(MAX_HANDS).map((u) => u.name).join(', ');
    box.append(more);
  }
}
