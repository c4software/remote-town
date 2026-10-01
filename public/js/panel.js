// Panneau latéral : onglets Chat / Participants et liste des participants.
import { drawAvatar } from './avatar.js';
import { renderChat } from './chat.js';
import { $ } from './dom.js';
import { joinFromPanel } from './movement.js';
import { openProfile } from './profile.js';
import { renderHands } from './social.js';
import { S, users } from './state.js';
import { MAP, ROOM_TYPES, isOnAir, sideBySide, zoneType } from './world.js';

export function showPanel(name) {
  const sb = $('#sidebar');
  if (!sb.classList.contains('closed') && S.activePanel === name) { sb.classList.add('closed'); renderChat(); return; }
  sb.classList.remove('closed');
  S.activePanel = name;
  document.querySelectorAll('.side-tabs [data-panel]').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.dataset.panel !== name));
  renderChat();
  if (name === 'chat') $('#chatInput').focus();
}

const ICON_MIC = '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/></svg>';
const ICON_SCREEN = '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';
const besideSomeone = (u) => !!u.mic && [...users.values()].some((v) => sideBySide(u, v));
export function isTransmitting(u) {
  return u.ptt || isOnAir(u) || (u.mic && ROOM_TYPES.includes(zoneType(u.zone)))
    || ((!u.isMe || !!S.micTrack) && besideSomeone(u));
}
export function renderPeople() {
  if (!S.me) return;
  const ul = $('#people');
  ul.replaceChildren();
  const list = [...users.values()].sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : a.name.localeCompare(b.name)));
  for (const u of list) {
    const li = document.createElement('li');
    const c = document.createElement('canvas'); c.width = 32; c.height = 40; c.style.width = '24px'; c.style.height = '30px';
    drawAvatar(c.getContext('2d'), u.look, 16, 37, 'down');
    const info = document.createElement('div'); info.className = 'p-info';
    const n = document.createElement('div'); n.className = 'p-name'; n.textContent = u.isMe ? `${u.name} (vous)` : u.name;
    const z = document.createElement('div'); z.className = 'p-zone'; z.textContent = MAP.zoneById[u.zone]?.name || '';
    info.append(n, z);
    const icons = document.createElement('div'); icons.className = 'p-icons';
    icons.innerHTML = (u.hand ? '<span class="p-hand">✋</span>' : '') + (isTransmitting(u) ? ICON_MIC : '') + (u.sharing ? ICON_SCREEN : '');
    li.append(c, info, icons);
    if (u.isMe) { li.className = 'me-row'; li.title = 'Modifier mon personnage'; li.onclick = openProfile; }
    else { li.className = 'join-row'; li.title = `Rejoindre ${u.name}`; li.onclick = () => joinFromPanel(u.id); }
    ul.append(li);
  }
  $('#peopleCount').textContent = users.size;
  renderHands();
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initPanel() {
  document.querySelectorAll('.side-tabs [data-panel]').forEach((b) => (b.onclick = () => showPanel(b.dataset.panel)));
  $('.side-close').onclick = () => { $('#sidebar').classList.add('closed'); renderChat(); };
  $('#chatBtn').onclick = () => showPanel('chat');
  $('#peopleBtn').onclick = () => showPanel('people');
}
