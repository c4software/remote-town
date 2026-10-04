// Participants : qui parle, mise à jour de ce qui les affiche (contacts du téléphone, bulles
// des mains levées), et petit menu d'une main levée (rejoindre, appeler, écrire).
import { dmKey } from './chat.js';
import { PHONE_VIEW } from './constantes.js';
import { $ } from './dom.js';
import { joinFromPanel } from './movement.js';
import { startCall } from './call.js';
import { openChat, phoneRefresh } from './phone.js';
import { renderHands } from './social.js';
import { S, users } from './state.js';
import { ROOM_TYPES, canCallIn, isOnAir, sideBySide, zoneType } from './world.js';

const besideSomeone = (u) => !!u.mic && [...users.values()].some((v) => sideBySide(u, v));
export function isTransmitting(u) {
  return u.ptt || isOnAir(u) || (u.mic && ROOM_TYPES.includes(zoneType(u.zone)))
    || ((!u.isMe || !!S.micTrack) && besideSomeone(u));
}

// Les participants ou leur état ont changé : contacts du téléphone et mains levées
export function renderPeople() {
  if (!S.me) return;
  phoneRefresh(PHONE_VIEW.CONTACTS);
  renderHands();
}

// ============================================================
// Menu d'une main levée (clic sur sa bulle, social.js) : aller voir la personne, l'appeler
// ou lui écrire
// ============================================================
function menuItem(cls, text, fn) {
  const b = Object.assign(document.createElement('button'), { type: 'button', className: `pm-item ${cls}`, textContent: text });
  b.onclick = () => { $('#personMenu').hidden = true; fn(); };
  return b;
}
// « Appeler » : grisé si l'un des deux est dans une salle sans téléphone
function callItem(u) {
  const b = menuItem('pm-call', `📞 Appeler ${u.name}`, () => startCall(u));
  const why = !canCallIn(S.me.zone) ? 'Pas de téléphone dans cette salle' : !canCallIn(u.zone) ? 'Pas de téléphone dans sa salle' : '';
  if (why) { b.disabled = true; b.title = why; b.textContent += ` (${why.toLowerCase()})`; }
  return b;
}
export function openHandMenu(x, y, u) {
  const menu = $('#personMenu');
  menu.replaceChildren();
  const title = document.createElement('div');
  title.className = 'pm-title'; title.textContent = `✋ ${u.name} demande de l'aide`;
  menu.append(title, menuItem('pm-join', `🚶 Rejoindre ${u.name}`, () => joinFromPanel(u.id)), callItem(u),
    menuItem('pm-msg', `💬 Écrire à ${u.name}`, () => openChat(dmKey(u))));
  menu.hidden = false;
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initPanel() {
  addEventListener('pointerdown', (e) => { if (!e.target.closest('#personMenu')) $('#personMenu').hidden = true; }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#personMenu').hidden = true; });
}
