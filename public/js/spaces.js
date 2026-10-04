// Porte des espaces (couloir) : changer d'espace de travail (salle Trystero) sans quitter
// la page. Fenêtre de choix (identifiant saisi ou espace enregistré), puis passage de la
// porte animé : on y entre, l'écran se referme en cercle, on ressort dans l'autre espace,
// même personne, même apparence.
import { banMinutesLeft } from './admin.js';
import { portalMusic } from './audio.js';
import { resetChat } from './chat.js';
import { $, toast } from './dom.js';
import { pushState, setPtt, stopShare } from './media.js';
import { onMyMove, sendMove, stepAsideIfTaken } from './movement.js';
import { switchRoom } from './net.js';
import { rememberRoom } from './profile.js';
import { canvas, ctx } from './render.js';
import { cleanRoom, forgetSpace, rememberSpace, roomName, roomUrl, savedSpaces } from './rooms.js';
import { S, keys } from './state.js';
import { PORTAL, PORTAL_SPOT, TILE } from './world.js';

const OUT_MS = 900, IN_MS = 900, MIN_WAIT_MS = 500, FIRST_WAIT_MS = 1100;

export const spacesOpen = () => !$('#spaces').hidden;

export function openSpaces() {
  if (!S.me || S.warp) return;
  keys.clear();
  $('#spacesCurrent').textContent = roomName(S.roomId);
  $('#spacesInput').value = '';
  renderSpaces();
  $('#spaces').hidden = false;
  if (!matchMedia('(pointer: coarse)').matches) $('#spacesInput').focus();
}

export function closeSpaces() {
  $('#spaces').hidden = true;
  document.activeElement?.blur();
  canvas.focus?.();
}

function renderSpaces() {
  const ul = $('#spacesList');
  ul.replaceChildren();
  const list = savedSpaces();
  if (!list.includes(S.roomId)) list.unshift(S.roomId);
  for (const id of list) {
    const li = document.createElement('li');
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'sp-go';
    go.innerHTML = '<b></b><small></small>';
    go.querySelector('b').textContent = roomName(id);
    go.querySelector('small').textContent = id === S.roomId ? 'vous êtes ici' : id === 'lobby' ? 'lobby' : '';
    go.disabled = id === S.roomId;
    go.onclick = () => goTo(id);
    li.append(go);
    if (id !== S.roomId) {
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'sp-del'; del.textContent = '×';
      del.title = `Retirer « ${roomName(id)} » de la liste`;
      del.onclick = () => { forgetSpace(id); renderSpaces(); };
      li.append(del);
    }
    ul.append(li);
  }
}

function goTo(raw) {
  const id = cleanRoom(raw);
  if (id === S.roomId) return toast(`Vous êtes déjà dans « ${roomName(id)} »`);
  const left = banMinutesLeft(id);
  if (left) return toast(`🚫 Vous avez été retiré·e de cet espace : retour possible dans ${left} min.`);
  closeSpaces();
  warp(id);
}

// ============================================================
// Passage de la porte
// ============================================================
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Pendant que l'écran se ferme et reste noir, l'interface (barre, panneau, aide…)
// s'efface ; elle revient quand le personnage sort de la porte
function setWarp(w) {
  S.warp = w;
  document.body.classList.toggle('warping', !!w && w.phase !== 'in');
  document.body.classList.toggle('warp-in', w?.phase === 'in');
}

async function warp(id) {
  // On quitte proprement : talkie relâché, partage arrêté, main baissée
  if (S.pttHeld) setPtt(false);
  if (S.sharing) stopShare();
  if (S.me.hand) { S.me.hand = false; pushState(); }
  S.path = null; S.portalTarget = false;
  Object.assign(S.me, { x: PORTAL_SPOT[0], y: PORTAL_SPOT[1], dir: 'up', seated: false, crouch: false });
  sendMove();
  portalMusic();
  setWarp({ phase: 'out', at: performance.now(), name: roomName(id) });
  await wait(OUT_MS);
  setWarp({ ...S.warp, phase: 'wait', at: performance.now() });
  await Promise.all([switchRoom(id), wait(MIN_WAIT_MS)]);
  // Nouvel espace : le chat de l'ancien n'a plus de sens
  resetChat();
  S.globalHistoryLoaded = false;
  history.replaceState(null, '', roomUrl(id));
  rememberSpace(id);
  rememberRoom(id);
  await emerge();
  toast(`🚪 Bienvenue dans « ${roomName(id)} »`);
}

// Sortie de la porte, dans l'espace où l'on arrive. Si quelqu'un se tient déjà
// devant la porte, on fait un pas de côté pour ne pas se superposer.
async function emerge() {
  Object.assign(S.me, { x: PORTAL_SPOT[0], y: PORTAL_SPOT[1], rx: PORTAL_SPOT[0], ry: PORTAL_SPOT[1], dir: 'down' });
  onMyMove();
  setWarp({ ...S.warp, phase: 'in', at: performance.now() });
  await wait(IN_MS);
  setWarp(null);
  stepAsideIfTaken();
  sendMove();
}

// Première arrivée (après « Rejoindre l'espace ») : même passage, déjà dans la porte.
// L'écran noir laisse aussi le temps aux connexions de s'établir.
// La musique est lancée au clic sur « Rejoindre l'espace » (profile.js), avec le
// cercle noir du formulaire (#cover) que l'on retire ici : le canevas a pris le relais.
export async function firstArrival() {
  setWarp({ phase: 'wait', at: performance.now(), name: roomName(S.roomId), title: 'Bienvenue dans' });
  requestAnimationFrame(() => { $('#cover').hidden = true; });
  await wait(FIRST_WAIT_MS);
  await emerge();
}

// Pendant le passage : mon personnage entre dans la porte (monte et s'efface),
// puis en ressort de l'autre côté
export function warpPose(u, now) {
  if (!u.isMe || !S.warp) return null;
  const k = Math.min(1, (now - S.warp.at) / (S.warp.phase === 'in' ? IN_MS : OUT_MS));
  if (S.warp.phase === 'wait') return { alpha: 0, dy: 0 };
  const inside = S.warp.phase === 'out' ? k : 1 - k; // 0 = devant la porte, 1 = dedans
  return { alpha: 1 - inside, dy: -inside * 14 };
}

// Porte ouverte (lumière violette qui tourne), en coordonnées du monde
export function drawPortalOpen(now) {
  if (!S.warp) return;
  const px = PORTAL.x * TILE, py = PORTAL.y * TILE;
  ctx.fillStyle = '#1b1035';
  ctx.fillRect(px + 7, py + 9, 18, 23);
  const glow = ctx.createRadialGradient(px + 16, py + 20, 1, px + 16, py + 20, 14);
  glow.addColorStop(0, '#fff3c4'); glow.addColorStop(0.4, '#c8b6ff'); glow.addColorStop(1, 'rgba(123,44,191,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(px + 7, py + 9, 18, 23);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < 5; i++) {
    const a = now / 260 + i * 1.26, r = 4 + ((now / 90 + i * 3) % 6);
    ctx.fillRect(Math.round(px + 16 + Math.cos(a) * r), Math.round(py + 20 + Math.sin(a) * r * 1.2), 1, 1);
  }
}

// Écriteau en bois accroché au mur à droite de la porte, avec le nom de l'espace en
// cours. Dessiné en pixels écran (texte net à tout zoom) ; au plus trois cases de mur (la porte du bureau 2 suit).
export function drawSpaceSign(zoom) {
  const X = (PORTAL.x + 1) * TILE + 4, Y = PORTAL.y * TILE + 13, MAX_W = 3 * TILE - 12, H = 12; // en pixels du monde
  ctx.font = `700 ${6 * zoom}px "DM Sans", sans-serif`;
  let name = roomName(S.roomId);
  const fits = (t) => ctx.measureText(t).width <= (MAX_W - 8) * zoom;
  if (!fits(name)) { while (name.length > 1 && !fits(`${name}…`)) name = name.slice(0, -1); name += '…'; }
  const w = ctx.measureText(name).width / zoom + 8;
  const sx = (X - S.cam.x) * zoom, sy = (Y - S.cam.y) * zoom, cx = sx + (w / 2) * zoom;
  // ficelle et clou
  ctx.strokeStyle = '#5a3a24'; ctx.lineWidth = Math.max(1, zoom * 0.6);
  ctx.beginPath(); ctx.moveTo(sx + 3 * zoom, sy + zoom); ctx.lineTo(cx, sy - 4 * zoom); ctx.lineTo(sx + (w - 3) * zoom, sy + zoom); ctx.stroke();
  ctx.fillStyle = '#4a4e69'; ctx.fillRect(cx - zoom, sy - 5 * zoom, 2 * zoom, 2 * zoom);
  // planche
  ctx.fillStyle = '#7a5134'; ctx.beginPath(); ctx.roundRect(sx, sy, w * zoom, H * zoom, 2 * zoom); ctx.fill();
  ctx.fillStyle = '#c9965f'; ctx.beginPath(); ctx.roundRect(sx + zoom, sy + zoom, (w - 2) * zoom, (H - 2) * zoom, 1.5 * zoom); ctx.fill();
  ctx.fillStyle = 'rgba(122,81,52,.35)'; ctx.fillRect(sx + 2 * zoom, sy + (H / 2) * zoom, (w - 4) * zoom, Math.max(1, zoom * 0.5));
  ctx.fillStyle = '#3b2414'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, sy + (H / 2 + 0.5) * zoom);
}

// Fermeture puis ouverture de l'écran en cercle autour de la porte, en pixels écran
export function drawWarpOverlay(now, zoom) {
  if (!S.warp) return;
  const sx = (PORTAL.x * TILE + TILE / 2 - S.cam.x) * zoom;
  const sy = (PORTAL.y * TILE + TILE * 0.7 - S.cam.y) * zoom;
  const full = Math.hypot(Math.max(sx, innerWidth - sx), Math.max(sy, innerHeight - sy)) + 10;
  const k = Math.min(1, (now - S.warp.at) / (S.warp.phase === 'in' ? IN_MS : OUT_MS));
  const ease = (t) => t * t * (3 - 2 * t);
  const r = S.warp.phase === 'wait' ? 0 : S.warp.phase === 'out' ? full * (1 - ease(k)) : full * ease(k);
  ctx.fillStyle = '#0d0f1f';
  ctx.beginPath();
  ctx.rect(0, 0, innerWidth, innerHeight);
  if (r > 0) ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill('evenodd');
  const textAlpha = S.warp.phase === 'wait' ? 1 : S.warp.phase === 'out' ? Math.max(0, k * 3 - 2) : Math.max(0, 1 - k * 3);
  if (textAlpha > 0) {
    ctx.globalAlpha = textAlpha;
    ctx.fillStyle = '#c8b6ff'; ctx.font = '600 14px "DM Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`🚪 ${S.warp.title || 'En route vers'}`, innerWidth / 2, innerHeight / 2 - 14);
    ctx.fillStyle = '#fff'; ctx.font = '700 22px "DM Sans", sans-serif';
    ctx.fillText(S.warp.name, innerWidth / 2, innerHeight / 2 + 14);
    ctx.globalAlpha = 1;
  }
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initSpaces() {
  $('#spacesForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#spacesInput').value.trim();
    if (!v) return $('#spacesInput').focus();
    goTo(v);
  });
  $('#spacesInput').addEventListener('input', () => {
    const v = $('#spacesInput').value.trim();
    $('#spacesHint').textContent = v ? `Identifiant : ${cleanRoom(v)}` : '';
  });
  $('#spacesClose').onclick = closeSpaces;
  $('#spaces').addEventListener('pointerdown', (e) => { if (e.target.id === 'spaces') closeSpaces(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && spacesOpen()) closeSpaces(); });
}
