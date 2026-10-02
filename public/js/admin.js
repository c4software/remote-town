// Modération : expulser quelqu'un de l'espace (menu du clic droit dans la liste des
// participants, construit par panel.js : l'entrée n'apparaît qu'avec un jeton).
// Sans serveur central, chaque navigateur doit pouvoir vérifier que l'ordre vient bien
// d'un administrateur : l'ordre est signé (ECDSA P-256) avec une clé privée, le « jeton »,
// que seul l'administrateur possède ; l'application ne contient que la clé publique
// (ADMIN_KEY dans config.js, générée par tools/admin-key.mjs).
//
// Le jeton se charge une fois avec un lien …#admin=<jeton> (le fragment n'est jamais envoyé
// au serveur), puis reste dans le navigateur (localStorage « rt-admin »). Volontairement
// absent de l'aide.
//
// L'expulsion est coopérative : la personne visée quitte l'espace, et les autres coupent leur
// liaison avec elle et l'ignorent. Elle ne peut pas revenir dans cet espace avant BAN_MS
// depuis ce navigateur ; une version modifiée de l'application pourrait passer outre.
import { ADMIN_KEY } from './config.js';
import { initDebug } from './debug.js';
import { $, toast } from './dom.js';
import { broadcast, dropPeer, leaveRoom } from './net.js';
import { S, users } from './state.js';

const BAN_MS = 15 * 60000;   // retour impossible pendant 15 min dans le même espace
const MAX_AGE_MS = 2 * 60000; // un ordre plus vieux (ou rejoué) est ignoré
const banned = new Set();    // pairs expulsés de cet espace : ignorés s'ils se représentent

const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};
const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const payload = (room, target, ts) => new TextEncoder().encode(`remote-town-kick|${room}|${target}|${ts}`);

// Clé publique : celle de config.js, ou (tests de bout en bout, ?debug) celle de setTestKey()
let publicKey = null;
let testKey = null;
export function setTestKey(jwk) { testKey = jwk; publicKey = null; S.isAdmin = false; }
async function verifyKey() {
  const jwk = testKey || ADMIN_KEY;
  if (!jwk?.x || !jwk?.y) return null;
  publicKey ||= await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, ALGO, false, ['verify']).catch(() => null);
  return publicKey;
}

// Jeton (clé privée) de ce navigateur, s'il y en a un
let privateKey = null;
async function signKey() {
  if (privateKey) return privateKey;
  let token = null;
  try { token = localStorage.getItem('rt-admin'); } catch {}
  if (!token) return null;
  try {
    const jwk = JSON.parse(new TextDecoder().decode(b64u.dec(token)));
    privateKey = await crypto.subtle.importKey('jwk', { ...jwk, kty: 'EC', crv: 'P-256', ext: true }, ALGO, false, ['sign']);
  } catch { privateKey = null; }
  return privateKey;
}
// Jeton vérifié : on signe un message de test et on le vérifie avec la clé publique de
// l'application. Un jeton invalide (ou d'une autre clé) ne débloque rien.
async function checkAdmin() {
  const key = await signKey();
  const pub = await verifyKey();
  let ok = false;
  if (key && pub) {
    try {
      const msg = new TextEncoder().encode('remote-town-admin-check');
      ok = await crypto.subtle.verify(SIGN, pub, await crypto.subtle.sign(SIGN, key, msg), msg);
    } catch {}
  }
  S.isAdmin = ok;
  if (ok) initDebug(); // ?debug sur le site publié
  return ok;
}
export const isAdmin = () => S.isAdmin;

// Mémorise un jeton (lien #admin=…, ou tests en ?debug) et le charge
export function loadToken(token) {
  try { localStorage.setItem('rt-admin', token); } catch {}
  privateKey = null;
  return checkAdmin();
}

export async function kick(u) {
  const key = await signKey();
  if (!S.isAdmin || !key || !u || u.isMe || !S.room) return;
  if (!confirm(`Expulser ${u.name} de l'espace ?`)) return;
  const ts = Date.now();
  const sig = b64u.enc(await crypto.subtle.sign(SIGN, key, payload(S.roomId, u.id, ts)));
  broadcast('kick', { target: u.id, ts, sig });
  removePeer(u.id);
  toast(`🚫 ${u.name} a été expulsé·e de l'espace`);
}

// Ordre reçu : vérifié (signature, espace, âge) avant d'être appliqué
export async function onKick(d) {
  const target = typeof d?.target === 'string' ? d.target.slice(0, 64) : '';
  const ts = Number(d?.ts);
  if (!target || typeof d?.sig !== 'string' || d.sig.length > 200 || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_AGE_MS) return;
  const key = await verifyKey();
  if (!key) return;
  let ok = false;
  try { ok = await crypto.subtle.verify(SIGN, key, b64u.dec(d.sig), payload(S.roomId, target, ts)); } catch {}
  if (!ok) return;
  if (target === S.myId) return expelled();
  const u = users.get(target);
  removePeer(target);
  if (u) toast(`🚫 ${u.name} a été expulsé·e de l'espace`);
}

// Un autre participant expulsé : on coupe la liaison et on l'ignore désormais
function removePeer(id) {
  banned.add(id);
  dropPeer(id);
}
export const isBanned = (id) => banned.has(id);

// C'est moi : on quitte l'espace, et on ne peut pas y revenir tout de suite
function expelled() {
  $('#kickedText').textContent = `Un administrateur vous a retiré·e de cet espace. Vous pourrez y revenir dans ${BAN_MS / 60000} minutes.`;
  try { localStorage.setItem(`rt-kicked:${S.roomId}`, String(Date.now() + BAN_MS)); } catch {}
  leaveRoom();
  $('#kicked').hidden = false;
}

// Encore exclu de cet espace ? Renvoie les minutes restantes (0 = libre)
export function banMinutesLeft(room) {
  let until = 0;
  try { until = Number(localStorage.getItem(`rt-kicked:${room}`)) || 0; } catch {}
  return Math.max(0, Math.ceil((until - Date.now()) / 60000));
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initAdmin() {
  // Lien …#admin=<jeton> : mémorisé puis retiré de l'adresse (pas de jeton dans l'historique)
  const m = /(?:^#|&)admin=([\w-]+)/.exec(location.hash);
  if (m) {
    loadToken(m[1]).then((k) => toast(k ? '🔑 Jeton d\'administration enregistré dans ce navigateur' : '🔑 Jeton d\'administration invalide'));
    history.replaceState(null, '', location.pathname + location.search);
  } else checkAdmin();
}
