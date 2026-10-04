// Chat : groupes de discussion (« Tout le monde », la salle où l'on se trouve) et messages
// directs entre deux personnes. Il s'affiche dans le téléphone (phone.js) : ce module garde
// les messages, les envoie, les reçoit et les annonce ; les deux pages (liste, conversation)
// sont dans pages/chats.js et pages/chat.js.
import { drawAvatar } from './avatar.js';
import { CHAT_KEEP, CHAT_KEY, COLOR, NOTIF_MS, PHONE_VIEW } from './constantes.js';
import { $, cleanName, toast } from './dom.js';
import { renderMessages } from './pages/chat.js';
import { el } from './pages/ui.js';
import { openChat, phoneBadge, phoneRefresh } from './phone.js';
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
export const dmUser = (key) => [...users.values()].find((u) => !u.isMe && dmKey(u) === key);
const storeKey = (key) => (key === CHAT_KEY.ZONE ? chat.zoneId : key);
export const chatList = (key) => chatStore.get(storeKey(key)) || [];
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

export function sendChat(key, text) {
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
export const convTitle = (key) => (key === CHAT_KEY.GLOBAL ? 'Tout le monde' : key === CHAT_KEY.ZONE ? MAP.zoneById[chat.zoneId]?.name || 'Salle'
  : dmUser(key)?.name || chatList(key).find((m) => !myIds.has(m.from))?.name || key.slice(3));
function notify(key, msg) {
  msg = chatList(key).find((m) => m.id === msg.id) || msg;
  if (chat.open !== key && !myIds.has(msg.from)) {
    chat.unread[key] = (chat.unread[key] || 0) + 1;
    showNotif(key, msg);
  }
  renderChat();
}

// Notification d'un message reçu, façon téléphone : portrait de la personne, son nom, la
// conversation et le début du message. Un clic ouvre la conversation.
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function showNotif(key, msg) {
  const box = $('#notifs'), card = Object.assign(el('button', 'notif'), { type: 'button' });
  card.dataset.conv = key;
  const look = users.get(msg.from)?.look;
  let face;
  if (look) {
    face = Object.assign(el('canvas', 'notif-face'), { width: 32, height: 40 });
    drawAvatar(face.getContext('2d'), look, 16, 37, 'down');
  } else {
    face = el('div', 'notif-face msg-av', msg.name.slice(0, 1).toUpperCase());
    face.style.background = msg.color;
  }
  const body = el('div', 'notif-body'), head = el('div', 'notif-head');
  head.append(el('b', '', msg.name), el('small', '', key.startsWith(CHAT_KEY.DM) ? 'Message direct' : convTitle(key)), el('time', '', fmtTime(msg.ts)));
  body.append(head, el('div', 'notif-text', msg.text.slice(0, 140)));
  card.append(face, body);
  const close = () => { card.classList.add('leaving'); setTimeout(() => card.remove(), 200); };
  card.onclick = () => { card.remove(); openChat(key); };
  box.append(card);
  setTimeout(close, NOTIF_MS);
  while (box.children.length > 3) box.firstChild.remove();
}
// La conversation est ouverte : ses notifications encore affichées disparaissent
export function clearNotifs(key) {
  document.querySelectorAll('#notifs .notif').forEach((n) => { if (n.dataset.conv === key) n.remove(); });
}

export const unreadTotal = () => Object.values(chat.unread).reduce((n, v) => n + v, 0);

// Nouvel espace : les messages de l'ancien n'ont plus de sens
export function resetChat() {
  chatStore.clear();
  chat.unread = {};
  renderChat();
}

// Quelque chose a changé (message, zone, personnes) : conversation ouverte, liste et pastille
export function renderChat() {
  renderMessages();
  phoneRefresh(PHONE_VIEW.CHATS);
  phoneBadge();
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initChat() {}
