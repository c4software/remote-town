// Annuaire des espaces (statistiques) : chaque page annonce à notre relais l'espace où elle se
// trouve et le nombre de personnes qu'elle y voit, à l'arrivée puis toutes les ROOMS.reportMs.
// Le relais garde ce compte en mémoire seulement (relay/server.mjs, POST /room). Rien n'est
// envoyé ailleurs : sans notre relais (page hors de NET_HOSTS), pas d'annonce.
// La liste (GET /rooms) n'est donnée qu'aux administrateurs, sur une demande signée avec leur
// jeton : le nom d'un espace suffit à y entrer, il n'est donc pas public. Elle s'affiche dans
// le téléphone (pages/spaces.js, entrée « Espaces actifs » de l'accueil).
import { signAdmin } from './admin.js';
import { ROOMS } from './constantes.js';
import { netUrl } from './net.js';
import { cleanRoom } from './rooms.js';
import { S, users } from './state.js';

const TIMEOUT_MS = 4000;

// Annonce de mon espace. En texte brut : pas de demande préalable (CORS) à chaque envoi.
// Sans réponse du relais, tant pis : aucune erreur, aucune nouvelle tentative avant la suivante.
export function reportRoom() {
  if (!netUrl() || !S.room || S.kicked) return Promise.resolve(false);
  return fetch(`${netUrl()}/room`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({ room: S.roomId, count: users.size }),
  }).then((res) => res.ok, () => false);
}

// Liste des espaces actifs, du plus peuplé au moins peuplé : [{ room, count, peak }], ou null
// (pas administrateur, pas de relais, relais muet). Si le relais refuse, il donne son heure :
// la demande est refaite une fois avec elle (ordinateur dont l'horloge est décalée).
export async function fetchRooms() {
  if (!canListRooms()) return null;
  const ask = async (ts) => {
    const sig = await signAdmin(`remote-town-rooms|${ts}`);
    return sig ? fetch(`${netUrl()}/rooms`, { headers: { Authorization: `RemoteTown ${ts}.${sig}` }, signal: AbortSignal.timeout(TIMEOUT_MS) }) : null;
  };
  try {
    let res = await ask(Date.now());
    if (res?.status === 403) {
      const now = Number((await res.json()).now);
      if (Number.isFinite(now)) res = await ask(now);
    }
    if (!res?.ok) return null;
    const d = await res.json();
    const people = (v) => Math.max(0, Math.min(ROOMS.peopleMax, Math.round(Number(v) || 0)));
    return (Array.isArray(d?.rooms) ? d.rooms : []).slice(0, ROOMS.listMax)
      .filter((r) => typeof r?.room === 'string' && r.room === cleanRoom(r.room))
      .map((r) => ({ room: r.room, count: people(r.count), peak: people(r.peak) }));
  } catch { return null; }
}

// Textes de la page « Espaces actifs » du téléphone
const people = (n) => `${n} personne${n > 1 ? 's' : ''}`;
export const roomNote = (r) => [people(r.count), r.peak > r.count && `pic ${r.peak}`, r.room === S.roomId && 'vous êtes ici'].filter(Boolean).join(' · ');
export const roomsSummary = (rooms) => `${rooms.length} espace${rooms.length > 1 ? 's' : ''} · ${people(rooms.reduce((n, r) => n + r.count, 0))}`;
// Faut-il proposer la liste ? Administrateur, et notre relais utilisé
export const canListRooms = () => S.isAdmin && !!netUrl();

// Branchement (appelé une fois par main.js) : l'annonce périodique
export function initDirectory() {
  setInterval(reportRoom, ROOMS.reportMs);
}
