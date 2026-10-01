// Partages d'écran reçus : vignettes, affichage en grand, projection automatique.
import { boardZone } from './board.js';
import { $ } from './dom.js';
import { links } from './media.js';
import { S, users } from './state.js';
import { sendsVideo } from './world.js';

const projected = new Set(); // partages déjà projetés automatiquement
export function renderVideos() {
  if (!S.me) return;
  const box = $('#videos');
  const want = new Map();
  if (S.sharing && S.screenStream) want.set('me', { stream: S.screenStream, name: 'Votre écran' });
  for (const u of users.values()) {
    if (u.id === S.myId || !sendsVideo(u, S.me)) continue;
    const L = links.get(u.id);
    if (L?.videoStream) want.set(String(u.id), { stream: L.videoStream, name: `Écran de ${u.name}` });
  }
  for (const el of [...box.children]) if (!want.has(el.dataset.key)) el.remove();
  for (const [key, v] of want) {
    let el = box.querySelector(`[data-key="${key}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'vtile'; el.dataset.key = key;
      const video = document.createElement('video');
      video.autoplay = true; video.playsInline = true; video.muted = true;
      const label = document.createElement('span');
      el.append(video, label);
      el.onclick = () => openFocus(key);
      box.append(el);
    }
    const video = el.querySelector('video');
    if (video.srcObject !== v.stream) video.srcObject = v.stream;
    el.querySelector('span').textContent = v.name;
  }
  // Projection : dans la classe et le bureau principal, un nouveau partage s'ouvre en grand
  for (const key of projected) if (!want.has(key)) projected.delete(key);
  for (const key of want.keys()) {
    if (key === 'me' || projected.has(key)) continue;
    projected.add(key);
    if (boardZone(S.me.zone) && users.get(key)?.zone === S.me.zone && !S.focusKey && $('#board').hidden) openFocus(key);
  }
  if (S.focusKey && !want.has(S.focusKey)) closeFocus();
  else if (S.focusKey) {
    const v = want.get(S.focusKey);
    const fv = $('#focus video');
    if (fv.srcObject !== v.stream) fv.srcObject = v.stream;
  }
}
function openFocus(key) {
  const tile = $(`#videos [data-key="${key}"]`);
  if (!tile) return;
  S.focusKey = key;
  $('#focus video').srcObject = tile.querySelector('video').srcObject;
  $('#focus .focus-name').textContent = tile.querySelector('span').textContent;
  $('#focus').hidden = false;
}
export function closeFocus() {
  S.focusKey = null;
  $('#focus').hidden = true;
  $('#focus video').srcObject = null;
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initVideos() {
  $('#focus button').onclick = closeFocus;
}
