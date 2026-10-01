// Salles : nom de salle normalisé, lien d'invitation (copie ou partage natif).
import { $, toast } from './dom.js';

export const cleanRoom = (v) => String(v).toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'lobby';

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
