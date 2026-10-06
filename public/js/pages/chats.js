// Page du téléphone : la liste des conversations.
import { chat, chatList, chatStore, convTitle, zoneChat } from '../chat.js';
import { CHAT_KEY } from '../constantes.js';
import { openChat } from '../phone.js';
import { myIds } from '../state.js';
import { el } from './ui.js';

// Liste des conversations : les groupes (« Tout le monde », et la salle où l'on est), puis les messages directs (les plus récents d'abord)
export function chatsPage() {
  const page = el('div', 'ph-list ph-chats');
  const dms = [...chatStore.keys()].filter((k) => k.startsWith(CHAT_KEY.DM) && chatList(k).length)
    .sort((a, b) => chatList(b).at(-1).ts - chatList(a).at(-1).ts);
  const row = (key, icon) => {
    const b = Object.assign(el('button', 'ph-item ph-conv'), { type: 'button', onclick: () => openChat(key) });
    b.dataset.conv = key;
    const info = el('div', 'ph-info'), last = chatList(key).at(-1);
    info.append(el('b', '', `${icon} ${convTitle(key)}`), el('small', '', last ? `${myIds.has(last.from) ? 'Vous' : last.name} : ${last.text}` : 'Aucun message'));
    b.append(info);
    if (chat.unread[key]) b.append(el('i', 'badge', chat.unread[key]));
    return b;
  };
  page.append(el('div', 'ph-title', 'Groupes'), row(CHAT_KEY.GLOBAL, '🌍'));
  if (zoneChat()) page.append(row(CHAT_KEY.ZONE, '📍')); // pas de discussion propre au couloir
  page.append(el('div', 'ph-title', 'Messages directs'));
  if (dms.length) page.append(...dms.map((k) => row(k, '👤')));
  else page.append(el('small', 'ph-note', 'Pour écrire à quelqu\'un : Contacts, puis « Message ».'));
  return page;
}
