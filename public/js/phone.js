// Téléphone : la coque. Un petit téléphone qui monte du bas de l'écran, par-dessus
// l'interface, ouvert par le bouton de la barre du bas ou par un appel ; ce module tient la
// navigation entre les pages et l'affichage d'ensemble. Le reste est réparti :
//   call.js         appels et messages vocaux
//   ring.js         sonnerie des téléphones voisins
//   pages/          une page par fichier (appel, accueil, contacts, fiche, conversations,
//                   conversation, messagerie vocale, personnage, réglages) et pages/ui.js
//   chat.js         discussions (messages, envoi, réception, notifications)
import { stopRing } from './audio.js';
import { call, startCall, vmails } from './call.js';
import { chat, convTitle, unreadTotal } from './chat.js';
import { CHAT_KEY, PHONE_VIEW } from './constantes.js';
import { $ } from './dom.js';
import { callScreen } from './pages/call.js';
import { chatPage, focusChat } from './pages/chat.js';
import { chatsPage } from './pages/chats.js';
import { contactsPage } from './pages/contacts.js';
import { homePage } from './pages/home.js';
import { lookPage } from './pages/look.js';
import { personPage } from './pages/person.js';
import { settingsPage } from './pages/settings.js';
import { btn, el } from './pages/ui.js';
import { vmailPage } from './pages/vmail.js';
import { S, users } from './state.js';

// ============================================================
// Affichage : un petit téléphone qui monte du bas de l'écran, par-dessus l'interface. Il
// s'ouvre avec le bouton téléphone de la barre du bas (pastille : messages non lus et messages
// vocaux), ou tout seul pour un appel. Hors appel : accueil, contacts (et fiche d'une
// personne), messages (groupes et messages directs, chat.js), messagerie vocale, personnage
// (mêmes listes que l'écran du personnage de profile.js, qui reste celui de la connexion) et
// réglages (sonnerie, ne pas déranger, incrustation).
// ============================================================
let open = false;   // téléphone déplié à la main (un appel le montre de toute façon)
let view = PHONE_VIEW.HOME;  // page affichée (PHONE_VIEW)
let personId = null; // fiche affichée (vue 'person')
let convKey = null;  // conversation affichée (vue 'chat')
let leaveTimer = null;

export const go = (v) => () => { view = v; renderPhone(); };
// Appeler quelqu'un : le téléphone se replie sur l'accueil, l'écran de l'appel prend la place
export const dial = (u) => { open = false; view = PHONE_VIEW.HOME; startCall(u); renderPhone(); };

const PARENT = { [PHONE_VIEW.PERSON]: PHONE_VIEW.CONTACTS, [PHONE_VIEW.CHAT]: PHONE_VIEW.CHATS }; // page précédente (sinon : l'accueil)
function pageScreen() {
  const body = el('div', 'ph-body'), head = el('div', 'ph-head');
  const person = view === PHONE_VIEW.PERSON ? users.get(personId) : null;
  if (view === PHONE_VIEW.PERSON && !person) view = PHONE_VIEW.CONTACTS; // la personne est partie
  const V = PHONE_VIEW;
  const title = {
    [V.HOME]: 'Téléphone', [V.CONTACTS]: 'Contacts', [V.PERSON]: 'Contact', [V.CHATS]: 'Messages', [V.CHAT]: view === V.CHAT ? convTitle(convKey) : '',
    [V.VMAIL]: 'Messagerie vocale', [V.SETTINGS]: 'Réglages', [V.LOOK]: 'Personnage',
  }[view];
  const back = btn('ph-mini ph-back', 'back', '', go(PARENT[view] || PHONE_VIEW.HOME));
  back.title = 'Retour';
  back.style.visibility = view === PHONE_VIEW.HOME ? 'hidden' : '';
  const shut = btn('ph-mini ph-close', 'close', '', () => togglePhone(false));
  shut.title = 'Replier le téléphone';
  head.append(back, el('b', '', title), shut);
  const page = {
    [V.HOME]: homePage, [V.CONTACTS]: contactsPage, [V.PERSON]: () => personPage(person), [V.CHATS]: chatsPage,
    [V.CHAT]: () => chatPage(convKey), [V.VMAIL]: vmailPage, [V.LOOK]: lookPage, [V.SETTINGS]: settingsPage,
  }[view];
  body.append(head, page());
  return body;
}

export function togglePhone(on = !open) {
  open = on;
  if (!on) { view = PHONE_VIEW.HOME; if (!call) stopRing(); }
  renderPhone();
}
// Replie le téléphone (sur mobile seulement : il masque la carte quand on rejoint quelqu'un)
export function phoneClose(mobileOnly = false) {
  if (open && (!mobileOnly || innerWidth <= 560)) togglePhone(false);
}

// Ouvre une conversation ('global', 'zone' ou 'dm:<pseudo>') et place le curseur dans la saisie
export function openChat(key = CHAT_KEY.ZONE) {
  if (call) return;
  open = true; view = PHONE_VIEW.CHAT; convKey = key;
  renderPhone();
  focusChat();
}
// Bouton de son personnage, dans la barre du bas : le téléphone s'ouvre sur « Personnage »
export function openLook() {
  if (call) return;
  open = true; view = PHONE_VIEW.LOOK;
  renderPhone();
}
export function openPerson(id) {
  if (call || !users.has(id)) return;
  open = true; view = PHONE_VIEW.PERSON; personId = id;
  renderPhone();
}

// Quelque chose a changé ailleurs (participants, messages) : la page affichée suit
export function phoneRefresh(kind) {
  if (!open || call) return;
  if (kind === view || view === PHONE_VIEW.HOME) renderPhone();
  else if (kind === PHONE_VIEW.CONTACTS && view === PHONE_VIEW.PERSON && !users.has(personId)) renderPhone();
}

// Pastille du bouton de la barre : messages non lus et messages vocaux reçus
export function phoneBadge() {
  const b = $('#phoneBtn'), badge = b.querySelector('.badge'), n = unreadTotal() + vmails.length;
  badge.textContent = n || '';
  badge.hidden = !n;
  b.classList.toggle('dnd', S.dnd);
  b.classList.toggle('active', open || !!call);
  b.title = S.dnd ? 'Téléphone (ne pas déranger)' : 'Téléphone : contacts, messages, réglages';
}

export function renderPhone() {
  const box = $('#phone'), shown = !!call || open;
  if (!(shown && !call && view === PHONE_VIEW.CHAT)) chat.open = null; // plus de conversation à l'écran
  const top = box.querySelector('.ph-list')?.scrollTop || 0; // redessiné : on garde le défilement
  box.replaceChildren(el('div', 'ph-notch'), call ? callScreen() : pageScreen());
  if (top && box.querySelector('.ph-list')) box.querySelector('.ph-list').scrollTop = top;
  // Il monte du bas de l'écran, et y redescend avant de disparaître
  clearTimeout(leaveTimer);
  if (shown) { box.classList.remove('leaving'); box.hidden = false; }
  else if (!box.hidden) {
    box.classList.add('leaving');
    leaveTimer = setTimeout(() => { box.classList.remove('leaving'); box.hidden = true; }, 220);
  }
  phoneBadge();
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initPhone() {
  $('#phoneBtn').onclick = () => { if (!call) togglePhone(); };
  renderPhone();
}
