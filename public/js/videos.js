// Partages d'écran reçus : vignettes, affichage en grand, projection automatique,
// et écran diffusé depuis le pupitre (petite fenêtre PiP chez tout le monde, un clic l'agrandit).
import { boardZone } from './board.js';
import { $ } from './dom.js';
import { links } from './media.js';
import { S, users } from './state.js';
import { isOnAir, sendsVideo } from './world.js';

const projected = new Set(); // partages déjà projetés automatiquement
let shown = new Map();       // clé -> { stream, name } : tous les écrans affichables (vignettes et PiP)

// Crée (ou met à jour) une carte vidéo identifiée par data-key dans `box`
function videoCard(box, key, v, className, build) {
  let el = box.querySelector(`[data-key="${key}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = className; el.dataset.key = key;
    const video = document.createElement('video');
    video.autoplay = true; video.playsInline = true; video.muted = true;
    build(el, video);
    el.onclick = () => openFocus(key);
    box.append(el);
  }
  const video = el.querySelector('video');
  if (video.srcObject !== v.stream) video.srcObject = v.stream;
  el.querySelector('.v-name').textContent = v.name;
}

export function renderVideos() {
  if (!S.me) return;
  const tiles = new Map(); // vignettes en haut de l'écran
  const pips = new Map();  // écrans diffusés depuis le pupitre
  if (S.sharing && S.screenStream) tiles.set('me', { stream: S.screenStream, name: 'Votre écran' });
  for (const u of users.values()) {
    if (u.id === S.myId || !sendsVideo(u, S.me)) continue;
    const L = links.get(u.id);
    if (!L?.videoStream) continue;
    if (isOnAir(u)) pips.set(String(u.id), { stream: L.videoStream, name: `📢 Écran de ${u.name} — pupitre` });
    else tiles.set(String(u.id), { stream: L.videoStream, name: `Écran de ${u.name}` });
  }
  shown = new Map([...tiles, ...pips]);

  const box = $('#videos');
  for (const el of [...box.children]) if (!tiles.has(el.dataset.key)) el.remove();
  for (const [key, v] of tiles) {
    videoCard(box, key, v, 'vtile', (el, video) => {
      const label = document.createElement('span'); label.className = 'v-name';
      el.append(video, label);
    });
  }

  const air = $('#airPip');
  for (const el of [...air.children]) if (!pips.has(el.dataset.key)) el.remove();
  for (const [key, v] of pips) {
    videoCard(air, key, v, 'air-card', (el, video) => {
      const head = document.createElement('div'); head.className = 'air-head';
      const name = document.createElement('b'); name.className = 'v-name';
      const grow = document.createElement('button'); grow.type = 'button'; grow.textContent = 'Agrandir';
      head.append(name, grow);
      el.append(head, video);
    });
  }
  // Masquée pendant que cet écran est affiché en grand ; sous le tableau blanc s'il est en PiP
  air.hidden = !pips.size || pips.has(S.focusKey);
  const board = $('#board');
  air.style.top = !board.hidden && board.classList.contains('pip') ? `${board.getBoundingClientRect().bottom + 10}px` : '';

  // Projection : dans la classe et le bureau principal, un nouveau partage s'ouvre en grand
  // (pas ceux du pupitre, qui restent en PiP jusqu'au clic)
  for (const key of projected) if (!tiles.has(key)) projected.delete(key);
  for (const key of tiles.keys()) {
    if (key === 'me' || projected.has(key)) continue;
    projected.add(key);
    if (boardZone(S.me.zone) && users.get(key)?.zone === S.me.zone && !S.focusKey && $('#board').hidden) openFocus(key);
  }
  if (S.focusKey && !shown.has(S.focusKey)) closeFocus();
  else if (S.focusKey) {
    const v = shown.get(S.focusKey);
    const fv = $('#focus video');
    if (fv.srcObject !== v.stream) fv.srcObject = v.stream;
  }
}

function openFocus(key) {
  const v = shown.get(key);
  if (!v) return;
  S.focusKey = key;
  $('#focus video').srcObject = v.stream;
  $('#focus .focus-name').textContent = v.name;
  $('#focus').hidden = false;
  $('#airPip').hidden = !$('#airPip').querySelector(`[data-key]:not([data-key="${key}"])`);
}

export function closeFocus() {
  S.focusKey = null;
  $('#focus').hidden = true;
  $('#focus video').srcObject = null;
  renderVideos(); // l'écran du pupitre revient en PiP
}

// Partage d'un autre affiché en grand, ou null : repris par la vue en incrustation (pip.js)
export const focusedShare = () => (S.focusKey && S.focusKey !== 'me' && shown.get(S.focusKey)) || null;

// Branchement des événements de la page (appelé une fois par main.js)
export function initVideos() {
  $('#focus button').onclick = closeFocus;
}
