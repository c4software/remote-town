// Sonnerie des téléphones voisins : on entend sonner le téléphone d'une personne proche, avec
// la sonnerie qu'elle a choisie. Son fichier audio personnel nous est envoyé à la demande
// (action `ringfile`), avec garde-fous. Règles de distance : ringVolume / hearsRing (world.js).
import { customRing, neighbourRing } from './audio.js';
import { call } from './call.js';
import { CALL, RING_FILE_MAX, RING_FILE_TYPES } from './constantes.js';
import { personalVolume } from './media.js';
import { S, users } from './state.js';
import { hearsRing, ringVolume } from './world.js';

// Le téléphone d'une personne proche sonne : on entend sa sonnerie, d'autant plus bas qu'elle
// est loin (sauf si on est soi-même au téléphone). Recalculé à chaque déplacement ou changement d'état (updateRouting).
export function nearbyRing() {
  let best = null, vol = 0;
  if (!call && S.me) for (const u of users.values()) { const v = ringVolume(u, S.me); if (v > vol) { vol = v; best = u; } }
  // Le volume réglé pour cette personne vaut aussi pour sa sonnerie
  neighbourRing(best ? best.ring : null, best ? vol * personalVolume(best) : 0, best ? ringSource(best) : null);
}

// Sonnerie personnelle (fichier audio) d'un voisin : demandée la première fois qu'on l'entend
// sonner, gardée le temps de la session. Tant qu'elle n'est pas arrivée : motif par défaut.
const ringFiles = new Map(); // id du pair -> { rev, url }
const ringAsked = new Map(); // id du pair -> dernière demande
const ringSent = new Map();  // id du pair -> dernier envoi de la mienne
function ringSource(u) {
  if (u.ring !== 'file' || !S.otherRings) return null;
  const got = ringFiles.get(u.id);
  if (got && got.rev === u.ringRev) return got.url;
  const now = performance.now();
  if (now - (ringAsked.get(u.id) ?? -Infinity) > CALL.ringFileGapMs) {
    ringAsked.set(u.id, now);
    S.net?.ringfile.send({ ask: true }, { target: u.id }).catch(() => {});
  }
  return null;
}
export async function onRingFile(d, peerId, meta) {
  const u = users.get(peerId), now = performance.now();
  if (!u || u.isMe) return;
  if (d?.ask) {
    // On me demande ma sonnerie : seulement si mon téléphone sonne et que la personne l'entend
    if (S.ring !== 'file' || !customRing() || !hearsRing(S.me, u) || now - (ringSent.get(peerId) ?? -Infinity) < CALL.ringFileGapMs) return;
    ringSent.set(peerId, now);
    const blob = await (await fetch(customRing())).blob().catch(() => null);
    if (!blob?.size || blob.size > RING_FILE_MAX) return;
    S.net?.ringfile.send(await blob.arrayBuffer(), { target: peerId, metadata: { type: blob.type } }).catch(() => {});
    return;
  }
  // Fichier reçu : seulement si je l'ai demandé, taille bornée, format audio connu
  if (!ringAsked.has(peerId) || u.ring !== 'file' || !S.otherRings) return;
  if (!(d instanceof ArrayBuffer || ArrayBuffer.isView(d)) || !d.byteLength || d.byteLength > RING_FILE_MAX || !RING_FILE_TYPES.test(meta?.type)) return;
  dropRingFile(peerId);
  ringFiles.set(peerId, { rev: u.ringRev, url: URL.createObjectURL(new Blob([d], { type: meta.type })) });
  nearbyRing();
}
function dropRingFile(id) {
  const got = ringFiles.get(id);
  if (got) URL.revokeObjectURL(got.url);
  ringFiles.delete(id);
}
// La personne est partie : plus rien à garder d'elle
export function forgetRing(id) {
  dropRingFile(id); ringAsked.delete(id); ringSent.delete(id);
}
