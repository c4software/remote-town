// Chat : canal de la zone courante et canal « Tout le monde ».
import { COLOR } from './config.js';
import { runDiag } from './diag.js';
import { $, cleanName, toast } from './dom.js';
import { joinFromPanel } from './movement.js';
import { S, myIds, users } from './state.js';
import { MAP } from './world.js';

export const chat = { tab: 'zone', zoneId: null, unread: { zone: 0, global: 0 } };
// Messages gardés par canal ('global' ou id de zone). Sans serveur, l'historique
// d'une zone est demandé aux personnes déjà présentes quand on y entre.
export const chatStore = new Map();
const KEEP = 300;
let msgSeq = 0;
const chatList = (key) => chatStore.get(key === 'global' ? 'global' : chat.zoneId) || [];

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
  chatStore.set(channel, list.slice(-KEEP));
  return added;
}

export async function fetchHistory(channel, targets) {
  if (!S.net || !targets.length) return;
  const results = await S.net.history.requestMany({ channel }, { targets, timeoutMs: 5000 }).catch(() => []);
  let added = 0;
  for (const r of results) if (r.status === 'fulfilled' && Array.isArray(r.value)) added += storeMsgs(channel, r.value);
  if (added) renderChat();
}

function sendChat(text) {
  if (!S.net) return toast('Reconnexion en cours, réessayez dans un instant.');
  const channel = chat.tab === 'global' ? 'global' : S.me.zone;
  const msg = { id: `${S.myId}-${(msgSeq++).toString(36)}`, from: S.myId, name: S.me.name, color: S.me.look.shirt, text, ts: Date.now() };
  if (channel === 'global') S.net.chat.send({ channel, msg }).catch(() => {});
  else {
    const target = [...users.values()].filter((u) => !u.isMe && u.zone === channel).map((u) => u.id);
    if (target.length) S.net.chat.send({ channel, msg }, { target }).catch(() => {});
  }
  onChat(channel, msg, S.myId);
}

export function onChat(channel, msg, peerId) {
  if (typeof channel !== 'string' || !(channel === 'global' || MAP.zoneById[channel])) return;
  if (msg && peerId !== S.myId) msg = { ...msg, from: peerId }; // l'expéditeur réel, pas celui annoncé
  if (!storeMsgs(channel, [msg])) return;
  const key = channel === 'global' ? 'global' : channel === chat.zoneId ? 'zone' : null;
  if (!key) return;
  msg = chatList(key).find((m) => m.id === msg.id) || msg;
  const visible = !$('#sidebar').classList.contains('closed') && chat.tab === key && S.activePanel === 'chat';
  if (!visible && !myIds.has(msg.from)) chat.unread[key]++;
  if (!visible && !myIds.has(msg.from) && $('#sidebar').classList.contains('closed')) {
    toast(`💬 ${msg.name} (${key === 'global' ? 'tout le monde' : MAP.zoneById[channel].name}) : ${msg.text.slice(0, 80)}`);
  }
  renderChat();
}

const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export function renderChat() {
  const box = $('#messages');
  const list = chatList(chat.tab);
  const sidebarOpen = !$('#sidebar').classList.contains('closed');
  if (sidebarOpen && S.activePanel === 'chat') chat.unread[chat.tab] = 0;
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.replaceChildren();
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'msg-empty';
    p.textContent = chat.tab === 'global'
      ? 'Aucun message. Ce canal est lu par tout le monde.'
      : `Aucun message dans « ${MAP.zoneById[chat.zoneId]?.name} ». Seules les personnes présentes ici le verront.`;
    box.append(p);
  }
  for (const m of list) {
    const row = document.createElement('div'); row.className = 'msg';
    const av = document.createElement('div'); av.className = 'msg-av';
    av.style.background = m.color; av.textContent = m.name.slice(0, 1).toUpperCase();
    const body = document.createElement('div'); body.className = 'msg-body';
    const head = document.createElement('div'); head.className = 'msg-head';
    const b = document.createElement('b'); b.textContent = myIds.has(m.from) ? `${m.name} (vous)` : m.name;
    if (!myIds.has(m.from) && users.has(m.from)) {
      b.className = 'join-link'; b.title = `Rejoindre ${m.name}`;
      b.onclick = () => joinFromPanel(m.from);
    }
    const t = document.createElement('time'); t.textContent = fmtTime(m.ts);
    head.append(b, t);
    const text = document.createElement('div'); text.className = 'msg-text'; text.textContent = m.text;
    body.append(head, text);
    row.append(av, body);
    box.append(row);
  }
  if (stick || list.at(-1)?.from === S.myId) box.scrollTop = box.scrollHeight;
  $('#zoneChanName').textContent = MAP.zoneById[chat.zoneId]?.name || 'Zone';
  document.querySelectorAll('.chat-tabs button').forEach((btn) => {
    const k = btn.dataset.chan;
    btn.classList.toggle('active', k === chat.tab);
    const badge = btn.querySelector('.badge');
    badge.hidden = !chat.unread[k];
    badge.textContent = chat.unread[k];
  });
  const total = chat.unread.zone + chat.unread.global;
  const cb = $('#chatBtn .badge');
  cb.hidden = !total || (sidebarOpen && S.activePanel === 'chat');
  cb.textContent = total;
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initChat() {
  document.querySelectorAll('.chat-tabs button').forEach((btn) => {
    btn.onclick = () => { chat.tab = btn.dataset.chan; renderChat(); $('#chatInput').focus(); };
  });
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    // Commande /diag : diagnostic de la connexion (diag.js), jamais envoyée aux autres
    if (text.toLowerCase() === '/diag') return runDiag();
    sendChat(text);
  });
}
