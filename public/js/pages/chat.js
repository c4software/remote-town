// Page du téléphone : une conversation (groupe ou message direct).
import { chat, chatList, clearNotifs, convTitle, dmUser, fmtTime, sendChat } from '../chat.js';
import { CHAT_KEY } from '../constantes.js';
import { runDiag } from '../diag.js';
import { joinFromPanel } from '../movement.js';
import { S, myIds, users } from '../state.js';
import { el } from './ui.js';

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
export const focusChat = () => conv?.querySelector('#chatInput').focus();

// Messages de la conversation ouverte (appelé aussi par chat.js quand un message arrive)
export function renderMessages() {
  const box = conv?.querySelector('#messages');
  if (!box || !chat.open) return;
  const key = chat.open, list = chatList(key);
  delete chat.unread[key];
  clearNotifs(key);
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
