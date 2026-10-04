// Flux WebRTC par pair : micro et écran envoyés selon les règles de zone (world.js),
// voix reçues (volume, effet), et actions micro / N / partage d'écran.
import { isBanned } from './admin.js';
import { initMic, makeAnalyser, setSpeakerFx, walkieBeep } from './audio.js';
import { WALKIE_BEEP_GAP } from './config.js';
import { $, toast } from './dom.js';
import { updateUI } from './hud.js';
import { broadcast } from './net.js';
import { renderPeople } from './panel.js';
import { S, users } from './state.js';
import { renderVideos } from './videos.js';
import { PROX_RADIUS, ROOM_TYPES, canShareIn, canTalkieIn, isOnAir, sendsAudio, sendsVideo, sideBySide, zoneType } from './world.js';

// ============================================================
// Médias : pour chaque pair, une copie de notre micro / écran
// qu'on active ou coupe selon les règles de zone (sans renégocier)
// ============================================================
export const links = new Map(); // id du pair -> { micOut, screenOut, audioEl, analyser, videoStream }
const link = (id) => { if (!links.has(id)) links.set(id, {}); return links.get(id); };

export function onPeerStream(stream, peerId) {
  if (isBanned(peerId)) return; // expulsé : on n'écoute plus ses flux
  const L = link(peerId);
  if (stream.getAudioTracks().length) {
    L.audioEl?.remove();
    const el = document.createElement('audio');
    el.autoplay = true; el.srcObject = stream;
    $('#audios').append(el);
    el.play().catch(() => {});
    L.audioEl = el;
    L.audioStream = stream;
    L.fx = null;
    L.analyser = makeAnalyser(stream);
    setSpeakerFx(L, isOnAir(users.get(peerId)));
  } else {
    L.videoStream = stream;
    renderVideos();
  }
}

export function closeLink(id) {
  const L = links.get(id);
  if (!L) return;
  links.delete(id);
  setSpeakerFx(L, false);
  L.audioEl?.remove();
  L.micOut?.getTracks().forEach((t) => t.stop());
  L.screenOut?.getTracks().forEach((t) => t.stop());
  renderVideos();
}

function addOut(track, kind, peerId) {
  if (!S.room) { track.stop(); return null; }
  const out = new MediaStream([track]);
  Promise.allSettled(S.room.addStream(out, { target: peerId, metadata: { kind } }));
  return out;
}

// Choisit, pour un pair, si on lui envoie notre micro / écran
function applySenders(u) {
  const L = link(u.id);
  const a = !!S.micTrack && sendsAudio(S.me, u);
  // Côte à côte, ou téléphone qui sonne (callPrep, phone.js) : canal préparé à l'avance mais
  // muet, pour que M ou « Décrocher » soit instantané
  if ((a || (S.micTrack && (sideBySide(S.me, u) || u.callPrep))) && !L.micOut) L.micOut = addOut(S.micTrack.clone(), 'mic', u.id);
  if (L.micOut) L.micOut.getTracks()[0].enabled = a;
  const v = !!S.screenTrack && sendsVideo(S.me, u);
  if (v && !L.screenOut) {
    const t = S.screenTrack.clone();
    t.contentHint = 'detail';
    L.screenOut = addOut(t, 'screen', u.id);
  }
  if (L.screenOut) L.screenOut.getTracks()[0].enabled = v;
}

// Côte à côte avec le micro coupé : notification à chaque rencontre
let besideIds = new Set();
const besideToastAt = new Map();
function notifyBeside() {
  const now = new Set([...users.values()].filter((u) => !u.isMe && sideBySide(S.me, u)).map((u) => u.id));
  for (const id of now) {
    if (besideIds.has(id) || performance.now() - (besideToastAt.get(id) || -1e9) < 10000) continue;
    besideToastAt.set(id, performance.now());
    const u = users.get(id);
    // Micro ouvert : rien à signaler. Micro coupé : on prévient qu'on ne sera pas entendu.
    if (!S.micTrack || !S.micOn) toast(`🔇 Votre micro est coupé : ${u.name} ne vous entendra pas (M pour l'ouvrir)`);
  }
  besideIds = now;
}

// Volume d'une voix : progressif pour le N (plein à 1 case, 25 % au bord de la portée),
// plein pour toutes les autres raisons (micro de pièce, pupitre, côte à côte)
function distanceVolume(u) {
  if (!S.me || sendsAudio({ ...u, ptt: false }, S.me)) return 1;
  const d = Math.hypot(u.x - S.me.x, u.y - S.me.y);
  return Math.max(0.25, Math.min(1, 1 - ((d - 1) / (PROX_RADIUS - 1)) * 0.75));
}

// Volume personnel de chaque voix (0 à 1), réglé dans la liste des participants.
// Mémorisé par nom (les identifiants changent à chaque connexion) dans « rt-volumes ».
let volumes = null;
function loadVolumes() {
  if (!volumes) {
    try { volumes = JSON.parse(localStorage.getItem('rt-volumes')) || {}; } catch { volumes = {}; }
  }
  return volumes;
}
export function personalVolume(u) {
  const v = Number(loadVolumes()[u?.name]);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}
export function setPersonalVolume(u, v) {
  const all = loadVolumes();
  if (v >= 1) delete all[u.name]; else all[u.name] = Math.max(0, Math.round(v * 100) / 100);
  try { localStorage.setItem('rt-volumes', JSON.stringify(all)); } catch {}
  updateRouting();
}

export function updateRouting() {
  if (!S.me) return;
  notifyBeside();
  for (const u of users.values()) if (!u.isMe) applySenders(u);
  for (const [id, L] of links) {
    const u = users.get(id);
    setSpeakerFx(L, isOnAir(u));
    if (!L.audioEl || !u) continue;
    L.audioEl.volume = distanceVolume(u) * personalVolume(u);
    if (L.fx?.gain) L.fx.gain.gain.value = personalVolume(u); // pupitre (effet haut-parleur) : plein volume, sauf réglage personnel
  }
  renderVideos();
  updateUI();
}

// ============================================================
// Micro, N pour parler, partage d'écran
// ============================================================
// Changement de micro en cours de session : chaque copie envoyée aux autres est
// remplacée (même état actif / coupé), sans renégocier. En cas d'échec, on garde l'ancien.
export async function switchMic(deviceId) {
  if (deviceId === S.micDevice && S.micTrack) return true;
  const prev = { device: S.micDevice, stream: S.micStream, track: S.micTrack, analyser: S.localAnalyser };
  S.micDevice = deviceId;
  if (!prev.track) return true; // pas encore de micro : il sera ouvert avec ce choix
  S.micTrack = null;
  if (!(await initMic())) {
    Object.assign(S, { micDevice: prev.device, micStream: prev.stream, micTrack: prev.track, localAnalyser: prev.analyser });
    return false;
  }
  for (const [id, L] of links) {
    const old = L.micOut?.getTracks()[0];
    if (!old) continue;
    const next = S.micTrack.clone();
    next.enabled = old.enabled;
    await Promise.allSettled([].concat(S.room?.replaceTrack(old, next, { target: id, metadata: { kind: 'mic' } }) || []));
    L.micOut.removeTrack(old); L.micOut.addTrack(next);
    old.stop();
  }
  prev.stream?.getTracks().forEach((t) => t.stop());
  updateRouting();
  return true;
}

export function pushState() {
  S.me.mic = S.micOn; S.me.ptt = S.pttHeld; S.me.sharing = S.sharing;
  broadcast('state', { mic: S.micOn, ptt: S.pttHeld, sharing: S.sharing, onAir: !!S.me.onAir, hand: !!S.me.hand, six: !!S.me.sixSeven, dab: !!S.me.dab, emote: S.me.emote || null });
  updateRouting();
  renderPeople();
}

export async function toggleMic() {
  if (!S.micTrack && !(await initMic())) return;
  S.micOn = !S.micOn;
  if (S.micOn && !ROOM_TYPES.includes(zoneType(S.me.zone))) toast('Micro ouvert : ici, seules les personnes juste à côté vous entendent. Maintenez N pour parler plus loin.');
  pushState();
}

// Bips du talkie : entendus seulement par la personne qui appuie, et une seule fois en cas d'appuis répétés (chaque appui relance le délai : tant qu'on
// martèle N, on reste muet). Le bip de fin ne suit que si celui d'ouverture a été joué.
let lastPttAt = -Infinity, beeped = false;
function pttBeep(on) {
  if (on) {
    const now = performance.now();
    beeped = now - lastPttAt >= WALKIE_BEEP_GAP;
    lastPttAt = now;
  }
  if (beeped) walkieBeep(on ? 'start' : 'end', 0.25);
}

export async function setPtt(on) {
  if (on === S.pttHeld) return;
  if (on && !canTalkieIn(S.me.zone)) return toast('Pas de talkie-walkie dans cette salle : ouvrez votre micro (M) pour parler.');
  if (on && !S.micTrack && !(await initMic())) return;
  S.pttHeld = on;
  if (on) S.me.pttAt = performance.now();
  pttBeep(on);
  pushState();
}

export async function toggleShare() {
  if (S.sharing) return stopShare();
  if (!canShareIn(S.me.zone)) return toast('Le partage d\'écran est disponible dans les bureaux, la classe et le bureau principal.');
  try {
    S.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
  } catch { return; }
  S.screenTrack = S.screenStream.getVideoTracks()[0];
  S.screenTrack.contentHint = 'detail';
  S.screenTrack.onended = stopShare;
  S.sharing = true;
  pushState();
}

export function stopShare() {
  if (!S.sharing) return;
  S.screenStream?.getTracks().forEach((t) => t.stop());
  S.screenStream = S.screenTrack = null;
  for (const [id, L] of links) {
    if (!L.screenOut) continue;
    S.room?.removeStream(L.screenOut, { target: id });
    L.screenOut.getTracks().forEach((t) => t.stop());
    L.screenOut = null;
  }
  S.sharing = false;
  pushState();
}
