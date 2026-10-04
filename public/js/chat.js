// Chat : groupes de discussion (« Tout le monde », la salle où l'on se trouve) et messages
// directs entre deux personnes. Il s'affiche dans le téléphone (phone.js) : ce module garde
// les messages, les envoie, les reçoit, et fournit les deux pages (liste, conversation).
import { CHAT_KEEP, CHAT_KEY, COLOR, PHONE_VIEW } from './constantes.js';
import { runDiag } from './diag.js';
import { $, cleanName, toast } from './dom.js';
import { joinFromPanel } from './movement.js';
import { phoneBadge, phoneRefresh } from './phone.js';
import { S, myIds, users } from './state.js';
import { MAP } from './world.js';

// Conversations : 'global', 'zone' (la salle courante, chat.zoneId) ou 'dm:<pseudo>'.
// `open` : celle affichée dans le téléphone (aucune si le téléphone est replié ou ailleurs).
export const chat = { zoneId: null, open: null, unread: {} };
// Messages gardés par canal ('global', id de zone, 'dm:<pseudo>'). Sans serveur, l'historique
// d'une zone est demandé aux personnes déjà présentes quand on y entre ; les messages directs
// ne vivent que chez les deux personnes.
export const chatStore = new Map();
let msgSeq = 0;
// Messages directs rangés par pseudo (unique dans l'espace), car l'identifiant change à chaque reconnexion
export const dmKey = (u) => `${CHAT_KEY.DM}${u.name.toLocaleLowerCase('fr')}`;
const dmUser = (key) => [...users.values()].find((u) => !u.isMe && dmKey(u) === key);
const storeKey = (key) => (key === CHAT_KEY.ZONE ? chat.zoneId : key);
const chatList = (key) => chatStore.get(storeKey(key)) || [];
// Historique partagé à la demande (action `history`) : les groupes seulement, jamais les messages directs
export const publicHistory = (channel) => (channel === CHAT_KEY.GLOBAL || MAP.zoneById[channel] ? chatStore.get(channel) || [] : []);

function cleanMsg(m) {
  if (!m || typeof m.id !== 'string' || typeof m.text !== 'string') return null;
  const text = m.text.trim().slice(0, 1000);
  if (!text) return null;
  return {
    id: m.id.slice(0, 80), from: String(m.from).slice(0, 40), name: cleanName(m.name) || 'Invité',
    color: COLOR.test(m.color) ? m.color : '#6c63ff', text, ts: Number(m.ts) || Date.now(),
  };
}

function storeMsgs(channel, msgs) {
  const list = chatStore.get(channel) || [];
  const seen = new Set(list.map((m) => m.id));
  let added = 0;
  for (const raw of msgs) {
    const m = cleanMsg(raw);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id); list.push(m); added++;
  }
  if (!added) return 0;
  list.sort((a, b) => a.ts - b.ts);
  chatStore.set(channel, list.slice(-CHAT_KEEP));
  return added;
}

export async function fetchHistory(channel, targets) {
  if (!S.net || !targets.length) return;
  const results = await S.net.history.requestMany({ channel }, { targets, timeoutMs: 5000 }).catch(() => []);
  let added = 0;
  for (const r of results) if (r.status === 'fulfilled' && Array.isArray(r.value)) added += storeMsgs(channel, r.value);
  if (added) renderChat();
}

function sendChat(key, text) {
  if (!S.net) return toast('Reconnexion en cours, réessayez dans un instant.');
  const msg = { id: `${S.myId}-${(msgSeq++).toString(36)}`, from: S.myId, name: S.me.name, color: S.me.look.shirt, text, ts: Date.now() };
  if (key.startsWith(CHAT_KEY.DM)) {
    const u = dmUser(key);
    if (!u) return toast('Cette personne n\'est plus dans l\'espace.');
    S.net.chat.send({ channel: 'dm', msg }, { target: u.id }).catch(() => {});
    return received(key, msg);
  }
  const channel = storeKey(key);
  if (channel === CHAT_KEY.GLOBAL) S.net.chat.send({ channel, msg }).catch(() => {});
  else {
    const target = [...users.values()].filter((u) => !u.isMe && u.zone === channel).map((u) => u.id);
    if (target.length) S.net.chat.send({ channel, msg }, { target }).catch(() => {});
  }
  onChat(channel, msg, S.myId);
}

// Message reçu d'un autre participant (ou le mien, pour un groupe)
export function onChat(channel, msg, peerId) {
  if (typeof channel !== 'string') return;
  if (msg && peerId !== S.myId) msg = { ...msg, from: peerId }; // l'expéditeur réel, pas celui annoncé
  if (channel === 'dm') {
    const u = users.get(peerId);
    if (u && !u.isMe) received(dmKey(u), msg);
    return;
  }
  if (!(channel === CHAT_KEY.GLOBAL || MAP.zoneById[channel])) return;
  if (!storeMsgs(channel, [msg])) return;
  const key = channel === CHAT_KEY.GLOBAL ? CHAT_KEY.GLOBAL : channel === chat.zoneId ? CHAT_KEY.ZONE : null;
  if (key) notify(key, msg);
}
function received(key, msg) {
  if (storeMsgs(key, [msg])) notify(key, msg);
}
const convTitle = (key) => (key === CHAT_KEY.GLOBAL ? 'Tout le monde' : key === CHAT_KEY.ZONE ? MAP.zoneById[chat.zoneId]?.name || 'Salle'
  : dmUser(key)?.name || chatList(key).find((m) => !myIds.has(m.from))?.name || key.slice(3));
function notify(key, msg) {
  msg = chatList(key).find((m) => m.id === msg.id) || msg;
  if (chat.open !== key && !myIds.has(msg.from)) {
    chat.unread[key] = (chat.unread[key] || 0) + 1;
    toast(`💬 ${msg.name}${key.startsWith(CHAT_KEY.DM) ? '' : ` (${convTitle(key).toLowerCase()})`} : ${msg.text.slice(0, 80)}`);
  }
  renderChat();
}

export const unreadTotal = () => Object.values(chat.unread).reduce((n, v) => n + v, 0);

// Nouvel espace : les messages de l'ancien n'ont plus de sens
export function resetChat() {
  chatStore.clear();
  chat.unread = {};
  renderChat();
}

// ============================================================
// Pages du téléphone
// ============================================================
const el = (tag, cls, text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// Liste des conversations : les deux groupes, puis les messages directs (les plus récents d'abord)
export function chatsPage(openConv) {
  const page = el('div', 'ph-list ph-chats');
  const dms = [...chatStore.keys()].filter((k) => k.startsWith(CHAT_KEY.DM) && chatList(k).length)
    .sort((a, b) => chatList(b).at(-1).ts - chatList(a).at(-1).ts);
  const row = (key, icon) => {
    const b = Object.assign(el('button', 'ph-item ph-conv'), { type: 'button', onclick: () => openConv(key) });
    b.dataset.conv = key;
    const info = el('div', 'ph-info'), last = chatList(key).at(-1);
    info.append(el('b', '', `${icon} ${convTitle(key)}`), el('small', '', last ? `${myIds.has(last.from) ? 'Vous' : last.name} : ${last.text}` : 'Aucun message'));
    b.append(info);
    if (chat.unread[key]) b.append(el('i', 'badge', chat.unread[key]));
    return b;
  };
  page.append(el('div', 'ph-title', 'Groupes'), row(CHAT_KEY.GLOBAL, '🌍'), row(CHAT_KEY.ZONE, '📍'));
  page.append(el('div', 'ph-title', 'Messages directs'));
  if (dms.length) page.append(...dms.map((k) => row(k, '👤')));
  else page.append(el('small', 'ph-note', 'Pour écrire à quelqu\'un : Contacts, puis « Message ».'));
  return page;
}

// Conversation : éléments gardés d'un affichage à l'autre, pour ne pas perdre le texte en
// cours de saisie quand un message arrive
let conv = null;
function convEl() {
  if (conv) return conv;
  conv = el('div', 'ph-chat');
  const form = Object.assign(el('form', ''), { id: 'chatForm', autocomplete: 'off' });
  const input = Object.assign(el('input', ''), { id: 'chatInput', maxLength: 1000, placeholder: 'Message…' });
  const send = Object.assign(el('button', ''), { type: 'submit' });
  send.setAttribute('aria-label', 'Envoyer');
  send.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 11.5 21 3l-8.5 18-2-7.5z"/></svg>';
  input.addEventListener('keydown', (e) => e.stopPropagation()); // pas de raccourcis du jeu en écrivant
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !chat.open) return;
    input.value = '';
    // Commande /diag : diagnostic de la connexion (diag.js), jamais envoyée aux autres
    if (text.toLowerCase() === '/diag') return runDiag();
    sendChat(chat.open, text);
  });
  form.append(input, send);
  conv.append(Object.assign(el('div', ''), { id: 'messages' }), form);
  return conv;
}
export function chatPage(key) {
  if (chat.open !== key) convEl().querySelector('#chatInput').value = '';
  chat.open = key;
  const page = convEl();
  renderMessages();
  return page;
}
export const chatTitle = convTitle;
export const focusChat = () => conv?.querySelector('#chatInput').focus();

function renderMessages() {
  const box = conv?.querySelector('#messages');
  if (!box || !chat.open) return;
  const key = chat.open, list = chatList(key);
  delete chat.unread[key];
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.replaceChildren();
  if (!list.length) {
    box.append(el('div', 'msg-empty', key === CHAT_KEY.GLOBAL ? 'Aucun message. Ce groupe est lu par tout le monde.'
      : key === CHAT_KEY.ZONE ? `Aucun message dans « ${convTitle(key)} ». Seules les personnes présentes ici le verront.`
      : `Aucun message. Seul·e ${convTitle(key)} verra ce que vous écrivez ici.`));
  }
  for (const m of list) {
    const row = el('div', 'msg'), av = el('div', 'msg-av', m.name.slice(0, 1).toUpperCase());
    av.style.background = m.color;
    const body = el('div', 'msg-body'), head = el('div', 'msg-head');
    const b = el('b', '', myIds.has(m.from) ? `${m.name} (vous)` : m.name);
    if (!myIds.has(m.from) && users.has(m.from)) {
      b.className = 'join-link'; b.title = `Rejoindre ${m.name}`;
      b.onclick = () => joinFromPanel(m.from);
    }
    head.append(b, el('time', '', fmtTime(m.ts)));
    body.append(head, el('div', 'msg-text', m.text));
    row.append(av, body);
    box.append(row);
  }
  if (stick || list.at(-1)?.from === S.myId) box.scrollTop = box.scrollHeight;
  const input = conv.querySelector('#chatInput');
  input.disabled = key.startsWith(CHAT_KEY.DM) && !dmUser(key);
  input.placeholder = input.disabled ? 'Personne partie' : 'Message…';
}

// Quelque chose a changé (message, zone, personnes) : conversation ouverte, liste et pastille
export function renderChat() {
  renderMessages();
  phoneRefresh(PHONE_VIEW.CHATS);
  phoneBadge();
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initChat() {}
