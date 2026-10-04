// Salles : nom de salle normalisé, lien d'invitation (copie ou partage natif).
import { SPACES_MAX } from './constantes.js';
import { $, toast } from './dom.js';

export const cleanRoom = (v) => String(v).toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'lobby';

export const roomName = (id) => (id === 'lobby' ? 'Espace principal' : id);

// Espaces de travail déjà visités, du plus récent au plus ancien (localStorage « rt-spaces »)
const SPACES_KEY = 'rt-spaces';
export function savedSpaces() {
  try {
    const list = JSON.parse(localStorage.getItem(SPACES_KEY));
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string' && id === cleanRoom(id)) : [];
  } catch { return []; }
}
function saveSpaces(list) {
  try { localStorage.setItem(SPACES_KEY, JSON.stringify(list.slice(0, SPACES_MAX))); } catch {}
}
export const rememberSpace = (id) => saveSpaces([id, ...savedSpaces().filter((x) => x !== id)]);
export const forgetSpace = (id) => saveSpaces(savedSpaces().filter((x) => x !== id));

export function roomUrl(id) {
  const url = new URL(location.href);
  url.hash = '';
  if (id === 'lobby') url.searchParams.delete('room'); else url.searchParams.set('room', id);
  return url.toString();
}

export async function shareLink(id) {
  const url = roomUrl(id);
  const label = id === 'lobby' ? 'l\'espace principal' : `la salle « ${id} »`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Remote Town', text: `Rejoins-moi dans ${label}`, url }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    if (!$('#app').hidden) return toast(`Lien de ${label} copié`);
    const btn = $('#copyLinkJoin');
    btn.classList.add('done');
    setTimeout(() => btn.classList.remove('done'), 1800);
  } catch {
    prompt('Copiez ce lien :', url);
  }
}
