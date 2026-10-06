// Noms des bureaux : chacun des dix bureaux peut être renommé par les personnes qui s'y
// trouvent (E sur son nom, à l'entrée). Comme les messages du chat, le nom ne vit que chez
// les personnes connectées : il est donné à celles qui arrivent, perdu quand l'espace se
// vide et remis à zéro en changeant d'espace.
import { renderChat } from './chat.js';
import { DESK_NAME_MAX } from './constantes.js';
import { $, cleanName, toast } from './dom.js';
import { renderZoneTag } from './hud.js';
import { renderMap } from './map-render.js';
import { broadcast } from './net.js';
import { renderPeople } from './panel.js';
import { canvas } from './render.js';
import { S, keys, users } from './state.js';
import { MAP, zoneType } from './world.js';

// id du bureau -> { name, rev }. `rev` augmente à chaque renommage : le plus récent
// l'emporte chez tout le monde, sans dépendre des horloges. Un nom vide = nom d'origine.
const names = new Map();
let editing = null; // bureau en cours de renommage (fenêtre ouverte)

// Nom affiché d'une zone : celui choisi pour un bureau, sinon celui de la carte
export const zoneName = (id) => names.get(id)?.name || MAP.zoneById[id]?.name || '';

// Enregistre un nom reçu ou saisi, après validation ; dit s'il change quelque chose
function apply(z, name, rev) {
  if (typeof z !== 'string' || !MAP.zoneById[z] || zoneType(z) !== 'desk') return false;
  name = cleanName(name).slice(0, DESK_NAME_MAX).trim();
  rev = Math.floor(Number(rev));
  if (!(rev > 0) || rev > 1e9) return false;
  const cur = names.get(z);
  // Deux renommages simultanés (même rev) : l'ordre des noms départage, pareil chez tous
  if (cur && (rev < cur.rev || (rev === cur.rev && name <= cur.name))) return false;
  names.set(z, { name, rev });
  return true;
}

// La carte porte les noms (pré-rendue), comme l'étiquette de zone et les listes
function refresh() {
  if (!S.me) return;
  S.mapCanvas = renderMap();
  renderZoneTag();
  renderChat(); renderPeople();
}

// Action `zname` : liste de { z, name, rev }
export function onDeskNames(list, peerId) {
  if (!users.has(peerId) || !Array.isArray(list)) return;
  let changed = false;
  for (const d of list.slice(0, 20)) {
    if (!apply(d?.z, d?.name, d?.rev)) continue;
    changed = true;
    if (d.z === S.me?.zone) toast(`🏷️ ${users.get(peerId).name} a renommé le bureau : « ${zoneName(d.z)} »`);
  }
  if (changed) refresh();
}

// À une personne qui arrive : les noms en cours
export function syncDeskNamesTo(peerId) {
  if (names.size) S.net?.zname.send([...names].map(([z, n]) => ({ z, ...n })), { target: peerId }).catch(() => {});
}

export function resetDeskNames() {
  names.clear();
  if (S.me) S.mapCanvas = renderMap();
}

function rename(z, name) {
  const rev = (names.get(z)?.rev || 0) + 1;
  if (cleanName(name).slice(0, DESK_NAME_MAX).trim() === (names.get(z)?.name || '') || !apply(z, name, rev)) return;
  broadcast('zname', [{ z, ...names.get(z) }]);
  refresh();
  toast(`🏷️ Bureau renommé : « ${zoneName(z)} »`);
}

// ============================================================
// Fenêtre de renommage (E sur le nom du bureau)
// ============================================================
export const deskNameOpen = () => !$('#deskName').hidden;

export function openDeskName(z) {
  if (!S.me || S.warp || zoneType(z) !== 'desk') return;
  editing = z;
  keys.clear();
  $('#deskNameCurrent').textContent = zoneName(z);
  const input = $('#deskNameInput');
  input.value = names.get(z)?.name || '';
  input.placeholder = MAP.zoneById[z].name;
  $('#deskName').hidden = false;
  input.focus(); input.select();
}

function closeDeskName() {
  editing = null;
  $('#deskName').hidden = true;
  document.activeElement?.blur();
  canvas.focus?.();
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initDesks() {
  const input = $('#deskNameInput');
  input.maxLength = DESK_NAME_MAX;
  $('#deskNameForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (editing) rename(editing, input.value);
    closeDeskName();
  });
  $('#deskNameClose').onclick = closeDeskName;
  $('#deskName').addEventListener('pointerdown', (e) => { if (e.target.id === 'deskName') closeDeskName(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && deskNameOpen()) closeDeskName(); });
}
