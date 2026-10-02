// Panneau latéral : onglets Chat / Participants et liste des participants.
import { isAdmin, kick } from './admin.js';
import { drawAvatar } from './avatar.js';
import { renderChat } from './chat.js';
import { $, ofName } from './dom.js';
import { personalVolume, setPersonalVolume } from './media.js';
import { joinFromPanel } from './movement.js';
import { openProfile } from './profile.js';
import { renderHands } from './social.js';
import { S, users } from './state.js';
import { EMOTES, emoteIcon } from './emotes.js';
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
    li.dataset.id = u.id; // clic droit des administrateurs (admin.js)
    const c = document.createElement('canvas'); c.width = 32; c.height = 40; c.style.width = '24px'; c.style.height = '30px';
    drawAvatar(c.getContext('2d'), u.look, 16, 37, 'down');
    const info = document.createElement('div'); info.className = 'p-info';
    const n = document.createElement('div'); n.className = 'p-name'; n.textContent = u.isMe ? `${u.name} (vous)` : u.name;
    const z = document.createElement('div'); z.className = 'p-zone'; z.textContent = MAP.zoneById[u.zone]?.name || '';
    info.append(n, z);
    const icons = document.createElement('div'); icons.className = 'p-icons';
    icons.innerHTML = (u.emote ? `<span class="p-hand" title="${EMOTES.find((x) => x.id === u.emote).label}">${emoteIcon(u.emote)}</span>` : '')
      + (u.link === 'relay' ? '<span class="p-link" title="Connexion relayée par le serveur TURN (connexion directe impossible)">relais</span>' : '')
      + (!u.isMe && personalVolume(u) < 1 ? `<button type="button" class="p-vol" title="Volume baissé : régler">${personalVolume(u) ? '🔉' : '🔇'} ${Math.round(personalVolume(u) * 100)} %</button>` : '')
      + (u.hand ? '<span class="p-hand">✋</span>' : '') + (isTransmitting(u) ? ICON_MIC : '') + (u.sharing ? ICON_SCREEN : '');
    li.append(c, info, icons);
    icons.querySelector('.p-vol')?.addEventListener('click', (e) => {
      e.stopPropagation(); // sinon le clic sur la ligne emmène auprès de la personne
      const r = e.currentTarget.getBoundingClientRect();
      openPersonMenu(r.left, r.bottom + 4, u);
    });
    if (u.isMe) { li.className = 'me-row'; li.title = 'Modifier mon personnage'; li.onclick = openProfile; }
    else { li.className = 'join-row'; li.title = `Rejoindre ${u.name}`; li.onclick = () => joinFromPanel(u.id); }
    ul.append(li);
  }
  $('#peopleCount').textContent = users.size;
  renderHands();
}

// Branchement des événements de la page (appelé une fois par main.js)
// ============================================================
// Menu d'une personne (clic droit, ou appui long sur mobile, dans la liste) : son volume
// pour moi seul, et « Expulser » pour les administrateurs (jeton, admin.js)
// ============================================================
function openPersonMenu(x, y, u) {
  const menu = $('#personMenu');
  menu.replaceChildren();
  const title = document.createElement('div');
  title.className = 'pm-title'; title.textContent = `Volume ${ofName(u.name)}`;
  const row = document.createElement('div'); row.className = 'pm-vol';
  const mute = document.createElement('button'); mute.type = 'button';
  const range = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 100, step: 5 });
  range.setAttribute('aria-label', title.textContent);
  const pct = document.createElement('span');
  let before = personalVolume(u) || 1; // volume rétabli après « couper »
  const show = (v) => {
    range.value = Math.round(v * 100);
    pct.textContent = `${Math.round(v * 100)} %`;
    mute.textContent = v === 0 ? '🔇' : v < 0.5 ? '🔈' : '🔊';
    mute.title = v === 0 ? 'Rétablir le son' : 'Couper le son';
  };
  const set = (v) => { setPersonalVolume(u, v); show(v); };
  range.oninput = () => set(range.value / 100);
  range.onchange = renderPeople; // badge « 🔉 40 % » dans la liste
  mute.onclick = () => {
    const v = personalVolume(u);
    if (v > 0) { before = v; set(0); } else set(before || 1);
    renderPeople();
  };
  show(personalVolume(u));
  row.append(mute, range, pct);
  menu.append(title, row);
  if (isAdmin()) {
    const k = document.createElement('button');
    k.type = 'button'; k.className = 'pm-kick'; k.textContent = `🚫 Expulser ${u.name}`;
    k.onclick = () => { menu.hidden = true; kick(u); };
    menu.append(k);
  }
  menu.hidden = false;
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
}

export function initPanel() {
  $('#people').addEventListener('contextmenu', (e) => {
    const li = e.target.closest('li[data-id]');
    const u = li && users.get(li.dataset.id);
    if (!u || u.isMe) return;
    e.preventDefault();
    openPersonMenu(e.clientX, e.clientY, u);
  });
  addEventListener('pointerdown', (e) => { if (!e.target.closest('#personMenu, .p-vol')) $('#personMenu').hidden = true; }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#personMenu').hidden = true; });
  document.querySelectorAll('.side-tabs [data-panel]').forEach((b) => (b.onclick = () => showPanel(b.dataset.panel)));
  $('.side-close').onclick = () => { $('#sidebar').classList.add('closed'); renderChat(); };
  $('#chatBtn').onclick = () => showPanel('chat');
  $('#peopleBtn').onclick = () => showPanel('people');
}
