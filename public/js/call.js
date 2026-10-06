// Appels du téléphone : appel vocal entre deux personnes, où qu'elles soient dans l'espace
// (sauf dans les salles de classe), et message vocal quand l'autre ne répond pas. Tout passe
// par les liaisons pair-à-pair : la voix par la copie du micro déjà en place (règle `call` de
// sendsAudio, world.js), les ordres par l'action `call`, le message par l'action `vmail`.
// L'affichage est dans phone.js (coque) et pages/call.js (écran de l'appel).
import { initMic, ring, stopRing } from './audio.js';
import { CALL, CALL_MSG, CALL_PHASE, PHONE } from './constantes.js';
import { $, ofName, toast } from './dom.js';
import { pushState } from './media.js';
import { renderPhone } from './phone.js';
import { statusText } from './pages/call.js';
import { stopPreview } from './pages/settings.js';
import { forgetRing } from './ring.js';
import { S, users } from './state.js';
import { phoneQuietIn } from './world.js';

// Appel en cours : { peer, name, phase, mine, timer… }. Phases : 'out' (ça sonne chez
// l'autre), 'in' (on m'appelle), 'on' (en ligne), 'away' (pas de réponse : laisser un
// message ?), 'rec' (enregistrement du message).
export let call = null;
let lastCallAt = -Infinity;  // mon dernier appel (pas d'appels à la suite)
const rangAt = new Map();    // id du pair -> son dernier appel reçu
const missed = new Map();    // id du pair -> appel manqué : un message vocal est accepté
export const vmails = [];    // messages vocaux reçus : { id, name, url, at }
let vmailSeq = 0;

const tell = (id, t) => S.net?.call.send({ t }, { target: id }).catch(() => {});

// Remplace l'appel en cours (ou le termine avec null) ; `ms` : délai avant `onTimeout`
function setCall(next, ms, onTimeout) {
  clearTimeout(call?.timer);
  clearInterval(call?.tick);
  stopPreview();
  stopRing();
  call = next;
  if (next && ms) next.timer = setTimeout(onTimeout, ms);
  // Vu des autres : téléphone qui sonne, ou personne au téléphone (dessin, liste, sonnerie voisine)
  const shown = next?.phase === CALL_PHASE.IN ? PHONE.RING : [CALL_PHASE.OUT, CALL_PHASE.ON].includes(next?.phase) ? PHONE.CALL : null;
  if (S.me && (S.me.phone || null) !== shown) { S.me.phone = shown; pushState(); }
  renderPhone();
  if (next?.phase === CALL_PHASE.ON) {
    // Durée de l'appel : seul le texte change (redessiner tout ferait rater des clics)
    next.since = performance.now();
    next.tick = setInterval(() => { const s = $('#phone .ph-status'); if (s) s.textContent = statusText(); }, 1000);
    $('#phone .ph-status').textContent = statusText();
  }
}

// En ligne : chacun note l'autre comme correspondant, c'est ce que lit sendsAudio
function link(peer, on) {
  S.me.call = on ? peer : null;
  if (!on) S.me.speaker = false;
  const u = users.get(peer);
  if (u) u.call = on ? S.myId : null;
  pushState();
}

// Ça sonne : le canal du micro vers l'autre est créé tout de suite, muet (applySenders)
function prepare(u) {
  u.callPrep = true;
  pushState();
}

export function endCall() {
  if (!call) return;
  if (call.phase === CALL_PHASE.ON) link(call.peer, false);
  if (call.mine) lastCallAt = performance.now();
  if (call.rec?.state === 'recording') call.rec.stop(); // message abandonné (keep est faux)
  setCall(null);
}

function missedCall(u) {
  missed.set(u.id, performance.now());
  toast(`📞 Appel manqué ${ofName(u.name)}`);
}

export async function startCall(u) {
  if (call) return toast('📞 Un appel est déjà en cours.');
  const wait = Math.ceil((CALL.gapMs - (performance.now() - lastCallAt)) / 1000);
  if (wait > 0) return toast(`📞 Pas d'appels à la suite : réessayez dans ${wait} s.`);
  if (!S.micTrack && !(await initMic())) return;
  if (call || !users.has(u.id)) return;
  lastCallAt = performance.now();
  setCall({ peer: u.id, name: u.name, phase: CALL_PHASE.OUT, mine: true }, CALL.ringMs, () => { tell(u.id, CALL_MSG.CANCEL); away('Ne répond pas'); });
  tell(u.id, CALL_MSG.RING);
  ring('out');
  prepare(u);
}

// Pas de réponse, refus ou personne occupée : on propose de laisser un message
function away(why) {
  lastCallAt = performance.now();
  setCall({ peer: call.peer, name: call.name, phase: CALL_PHASE.AWAY, why, mine: true }, CALL.awayMs, endCall);
}

export async function accept() {
  const c = call;
  if (!S.micTrack) await initMic(); // sans micro : on décroche quand même, pour écouter
  if (call !== c || c.phase !== CALL_PHASE.IN) return;
  tell(c.peer, CALL_MSG.ACCEPT);
  setCall({ peer: c.peer, name: c.name, phase: CALL_PHASE.ON });
  link(c.peer, true);
}

// Raccrocher, annuler ou refuser, selon la phase
export function hangUp() {
  if (!call) return;
  if (call.phase === CALL_PHASE.OUT) tell(call.peer, CALL_MSG.CANCEL);
  if (call.phase === CALL_PHASE.IN) { tell(call.peer, CALL_MSG.DECLINE); missed.set(call.peer, performance.now()); }
  if (call.phase === CALL_PHASE.ON) tell(call.peer, CALL_MSG.END);
  endCall();
}

// Ordres reçus : ignorés s'ils ne correspondent pas à l'appel en cours
export function onCallMsg(d, peerId) {
  const u = users.get(peerId);
  if (!u || u.isMe) return;
  const t = d?.t;
  if (t === CALL_MSG.RING) {
    const now = performance.now();
    // Appels à la suite d'une même personne : refusés sans sonner ni notifier
    if (now - (rangAt.get(peerId) ?? -Infinity) < CALL.gapMs) return tell(peerId, CALL_MSG.BUSY);
    rangAt.set(peerId, now);
    // Ne pas déranger : droit à la messagerie, sans sonner ni notifier
    if (S.dnd) { missed.set(peerId, now); return tell(peerId, CALL_MSG.BUSY); }
    if (call) { missedCall(u); return tell(peerId, CALL_MSG.BUSY); }
    setCall({ peer: peerId, name: u.name, phase: CALL_PHASE.IN }, CALL.ringMs + 5000, () => { missedCall(u); setCall(null); });
    ring('in');
    prepare(u);
    return;
  }
  if (call?.peer !== peerId) return;
  if (t === CALL_MSG.ACCEPT && call.phase === CALL_PHASE.OUT) {
    setCall({ peer: peerId, name: u.name, phase: CALL_PHASE.ON, mine: true });
    link(peerId, true);
  } else if ((t === CALL_MSG.DECLINE || t === CALL_MSG.BUSY) && call.phase === CALL_PHASE.OUT) {
    away(t === CALL_MSG.DECLINE ? 'A refusé l\'appel' : 'N\'est pas disponible');
  } else if (t === CALL_MSG.CANCEL && call.phase === CALL_PHASE.IN) {
    missedCall(u);
    setCall(null);
  } else if (t === CALL_MSG.END && call.phase === CALL_PHASE.ON) {
    toast(`📞 ${u.name} a raccroché`);
    endCall();
  }
}

// Mon correspondant a changé d'état (haut-parleur…) : l'écran de l'appel suit
export function phonePeerState(id) {
  if (call?.peer === id && call.phase === CALL_PHASE.ON) renderPhone();
}

// La personne en ligne (ou appelée) a quitté l'espace
export function phonePeerLeft(id) {
  rangAt.delete(id); missed.delete(id);
  forgetRing(id);
  if (call?.peer === id) endCall();
}

// En entrant dans une salle de classe : l'appel continue, mais le haut-parleur se coupe
// (les autres ne doivent pas l'entendre, voir phoneQuietIn dans world.js)
export function phoneZoneChange() {
  if (!call) return;
  if (S.me.speaker && phoneQuietIn(S.me.zone)) {
    S.me.speaker = false;
    toast('📞 Pas de haut-parleur dans cette salle : l\'appel continue pour vous seul·e.');
    pushState();
  }
  renderPhone(); // le bouton du haut-parleur suit la salle
}

// ============================================================
// Message vocal : enregistré chez l'appelant, envoyé d'un bloc
// ============================================================
export function record() {
  if (!S.micTrack || !window.MediaRecorder) return toast('Enregistrement impossible sur ce navigateur.');
  const c = { peer: call.peer, name: call.name, phase: CALL_PHASE.REC, mine: true, keep: false };
  const chunks = [];
  try {
    c.rec = new MediaRecorder(new MediaStream([S.micTrack.clone()]), { audioBitsPerSecond: 24000 });
  } catch { return toast('Enregistrement impossible sur ce navigateur.'); }
  c.rec.ondataavailable = (e) => chunks.push(e.data);
  c.rec.onstop = () => {
    c.rec.stream.getTracks().forEach((t) => t.stop());
    if (c.keep) sendVmail(c, new Blob(chunks, { type: c.rec.mimeType }));
  };
  setCall(c, CALL.vmailMs, sendRecording);
  c.rec.start();
}

export function sendRecording() {
  if (call?.phase !== CALL_PHASE.REC) return;
  call.keep = true;
  call.rec.stop();
  setCall(null);
}

async function sendVmail(c, blob) {
  if (!blob.size || blob.size > CALL.vmailBytes || !users.has(c.peer)) return toast('📨 Le message n\'a pas pu être envoyé.');
  S.net?.vmail.send(await blob.arrayBuffer(), { target: c.peer, metadata: { type: blob.type } }).catch(() => {});
  toast(`📨 Message envoyé à ${c.name}`);
}

// Message reçu : un seul par appel manqué, taille bornée, type audio connu
export function onVmail(data, peerId, meta) {
  const u = users.get(peerId), at = missed.get(peerId);
  if (!u || at === undefined || performance.now() - at > CALL.awayMs + CALL.vmailMs + 15000) return;
  if (!(data instanceof ArrayBuffer || ArrayBuffer.isView(data)) || !data.byteLength || data.byteLength > CALL.vmailBytes) return;
  missed.delete(peerId);
  const type = /^audio\/(webm|ogg|mp4)(;\s?codecs=[\w.]+)?$/.test(meta?.type) ? meta.type : 'audio/webm';
  vmails.push({ id: ++vmailSeq, name: u.name, url: URL.createObjectURL(new Blob([data], { type })), at: new Date() });
  while (vmails.length > CALL.vmailKeep) dropVmail(vmails[0]);
  toast(`📨 Message vocal ${ofName(u.name)}`);
  renderPhone();
}

export function dropVmail(m) {
  m.audio?.pause();
  URL.revokeObjectURL(m.url);
  vmails.splice(vmails.indexOf(m), 1);
  renderPhone();
}
