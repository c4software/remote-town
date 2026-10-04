// Téléphone : appel vocal entre deux personnes, où qu'elles soient dans l'espace (sauf dans
// les salles de classe), lancé depuis la liste des participants (clic droit). Sans réponse,
// l'appelant peut laisser un message vocal. Tout passe par les liaisons pair-à-pair : la
// voix par la copie du micro déjà en place (règle `call` de sendsAudio, world.js), les
// ordres par l'action `call`, le message par l'action `vmail`.
import { initMic, ring, stopRing } from './audio.js';
import { drawAvatar } from './avatar.js';
import { CALL } from './config.js';
import { $, ofName, toast } from './dom.js';
import { updateRouting } from './media.js';
import { S, users } from './state.js';
import { canCallIn } from './world.js';

// Appel en cours : { peer, name, phase, mine, timer… }. Phases : 'out' (ça sonne chez
// l'autre), 'in' (on m'appelle), 'on' (en ligne), 'away' (pas de réponse : laisser un
// message ?), 'rec' (enregistrement du message).
let call = null;
let lastCallAt = -Infinity;  // mon dernier appel (pas d'appels à la suite)
const rangAt = new Map();    // id du pair -> son dernier appel reçu
const missed = new Map();    // id du pair -> appel manqué : un message vocal est accepté
const vmails = [];           // messages vocaux reçus : { id, name, url, at }
let vmailSeq = 0;

const tell = (id, t) => S.net?.call.send({ t }, { target: id }).catch(() => {});

// Remplace l'appel en cours (ou le termine avec null) ; `ms` : délai avant `onTimeout`
function setCall(next, ms, onTimeout) {
  clearTimeout(call?.timer);
  clearInterval(call?.tick);
  stopRing();
  call = next;
  if (next && ms) next.timer = setTimeout(onTimeout, ms);
  render();
  if (next?.phase === 'on') {
    // Durée de l'appel : seul le texte change (redessiner tout ferait rater des clics)
    next.since = performance.now();
    next.tick = setInterval(() => { const s = $('#phone .ph-status'); if (s) s.textContent = statusText(); }, 1000);
    $('#phone .ph-status').textContent = statusText();
  }
}

// En ligne : chacun note l'autre comme correspondant, c'est ce que lit sendsAudio
function link(peer, on) {
  S.me.call = on ? peer : null;
  const u = users.get(peer);
  if (u) u.call = on ? S.myId : null;
  updateRouting();
}

// Ça sonne : le canal du micro vers l'autre est créé tout de suite, muet (applySenders)
function prepare(u) {
  u.callPrep = true;
  updateRouting();
}

function close() {
  if (!call) return;
  if (call.phase === 'on') link(call.peer, false);
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
  if (!canCallIn(S.me.zone)) return toast('📞 Pas de téléphone dans cette salle.');
  const wait = Math.ceil((CALL.gapMs - (performance.now() - lastCallAt)) / 1000);
  if (wait > 0) return toast(`📞 Pas d'appels à la suite : réessayez dans ${wait} s.`);
  if (!S.micTrack && !(await initMic())) return;
  if (call || !users.has(u.id)) return;
  lastCallAt = performance.now();
  setCall({ peer: u.id, name: u.name, phase: 'out', mine: true }, CALL.ringMs, () => { tell(u.id, 'cancel'); away('Ne répond pas'); });
  tell(u.id, 'ring');
  ring('out');
  prepare(u);
}

// Pas de réponse, refus ou personne occupée : on propose de laisser un message
function away(why) {
  lastCallAt = performance.now();
  setCall({ peer: call.peer, name: call.name, phase: 'away', why, mine: true }, CALL.awayMs, close);
}

async function accept() {
  const c = call;
  if (!S.micTrack) await initMic(); // sans micro : on décroche quand même, pour écouter
  if (call !== c || c.phase !== 'in') return;
  tell(c.peer, 'accept');
  setCall({ peer: c.peer, name: c.name, phase: 'on' });
  link(c.peer, true);
}

// Raccrocher, annuler ou refuser, selon la phase
export function hangUp() {
  if (!call) return;
  if (call.phase === 'out') tell(call.peer, 'cancel');
  if (call.phase === 'in') { tell(call.peer, 'decline'); missed.set(call.peer, performance.now()); }
  if (call.phase === 'on') tell(call.peer, 'end');
  close();
}

// Ordres reçus : ignorés s'ils ne correspondent pas à l'appel en cours
export function onCallMsg(d, peerId) {
  const u = users.get(peerId);
  if (!u || u.isMe) return;
  const t = d?.t;
  if (t === 'ring') {
    const now = performance.now();
    // Appels à la suite d'une même personne : refusés sans sonner ni notifier
    if (now - (rangAt.get(peerId) ?? -Infinity) < CALL.gapMs) return tell(peerId, 'busy');
    rangAt.set(peerId, now);
    if (call || !canCallIn(S.me.zone)) { missedCall(u); return tell(peerId, 'busy'); }
    setCall({ peer: peerId, name: u.name, phase: 'in' }, CALL.ringMs + 5000, () => { missedCall(u); setCall(null); });
    ring('in');
    prepare(u);
    return;
  }
  if (call?.peer !== peerId) return;
  if (t === 'accept' && call.phase === 'out') {
    setCall({ peer: peerId, name: u.name, phase: 'on', mine: true });
    link(peerId, true);
  } else if ((t === 'decline' || t === 'busy') && call.phase === 'out') {
    away(t === 'decline' ? 'A refusé l\'appel' : 'N\'est pas disponible');
  } else if (t === 'cancel' && call.phase === 'in') {
    missedCall(u);
    setCall(null);
  } else if (t === 'end' && call.phase === 'on') {
    toast(`📞 ${u.name} a raccroché`);
    close();
  }
}

// La personne en ligne (ou appelée) a quitté l'espace
export function phonePeerLeft(id) {
  rangAt.delete(id); missed.delete(id);
  if (call?.peer === id) close();
}

// En entrant dans une salle de classe : l'appel se termine
export function phoneZoneChange() {
  if (!call || canCallIn(S.me.zone) || !['out', 'in', 'on'].includes(call.phase)) return;
  toast('📞 Pas de téléphone dans cette salle : appel terminé.');
  hangUp();
}

// ============================================================
// Message vocal : enregistré chez l'appelant, envoyé d'un bloc
// ============================================================
function record() {
  if (!S.micTrack || !window.MediaRecorder) return toast('Enregistrement impossible sur ce navigateur.');
  const c = { peer: call.peer, name: call.name, phase: 'rec', mine: true, keep: false };
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

function sendRecording() {
  if (call?.phase !== 'rec') return;
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
  render();
}

function dropVmail(m) {
  m.audio?.pause();
  URL.revokeObjectURL(m.url);
  vmails.splice(vmails.indexOf(m), 1);
  render();
}

// ============================================================
// Affichage : un petit téléphone en bas de l'écran, par-dessus l'interface. Son écran
// montre l'appel en cours (personnage, nom, état), puis la messagerie (messages reçus).
// ============================================================
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const HANDSET = '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>';
const ICONS = {
  call: svg(HANDSET),
  end: svg(`<g transform="rotate(135 12 12)">${HANDSET}</g>`),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/>'),
  send: svg('<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  play: svg('<path d="M7 4v16l13-8z"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
};
const el = (tag, cls, text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });
// Bouton rond avec son libellé dessous (icônes : chaînes fixes ci-dessus)
function btn(cls, icon, label, fn) {
  const b = Object.assign(el('button', cls), { type: 'button', onclick: fn });
  b.innerHTML = ICONS[icon];
  b.append(el('span', '', label));
  return b;
}
const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const statusText = () => ({
  out: 'Appel en cours…',
  in: 'Appel entrant…',
  on: `En ligne · ${clock(performance.now() - call.since)}`,
  away: call.why,
  rec: 'Message vocal…',
}[call.phase]);

function callScreen() {
  const body = el('div', `ph-body ph-${call.phase}`), screen = el('div', 'ph-screen'), actions = el('div', 'ph-actions');
  const look = users.get(call.peer)?.look;
  if (look) {
    const c = Object.assign(el('canvas', 'ph-avatar'), { width: 32, height: 40 });
    drawAvatar(c.getContext('2d'), look, 16, 37, 'down');
    screen.append(c);
  }
  screen.append(el('div', 'ph-name', call.name), el('div', 'ph-status', statusText()));
  if (call.phase === 'on') screen.append(el('small', '', 'Votre micro est ouvert pour cette personne'));
  if (call.phase === 'rec') {
    const bar = el('div', 'ph-bar');
    bar.style.animationDuration = `${CALL.vmailMs}ms`;
    screen.append(bar);
  }
  if (call.phase === 'in') actions.append(btn('ph-end', 'end', 'Refuser', hangUp), btn('ph-accept', 'call', 'Décrocher', accept));
  if (call.phase === 'out') actions.append(btn('ph-end', 'end', 'Annuler', hangUp));
  if (call.phase === 'on') actions.append(btn('ph-end', 'end', 'Raccrocher', hangUp));
  if (call.phase === 'away') actions.append(btn('ph-ghost', 'close', 'Fermer', close), btn('ph-accept ph-record', 'mic', 'Message', record));
  if (call.phase === 'rec') actions.append(btn('ph-ghost', 'close', 'Annuler', close), btn('ph-accept ph-send', 'send', 'Envoyer', sendRecording));
  body.append(screen, actions);
  return body;
}

// Un message de la messagerie : lecture / pause, suppression
function vmailRow(m) {
  const row = el('div', 'ph-vmail'), info = el('div', 'ph-vm-info');
  const hour = m.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  info.append(el('b', '', m.name), el('small', '', hour));
  m.audio ??= Object.assign(new Audio(m.url), { onplay: render, onpause: render, onended: render });
  const playing = !m.audio.paused && !m.audio.ended;
  const play = btn('ph-mini', playing ? 'pause' : 'play', '', () => (playing ? m.audio.pause() : m.audio.play().catch(() => {})));
  play.title = playing ? 'Pause' : `Écouter le message ${ofName(m.name)}`;
  const del = btn('ph-mini', 'trash', '', () => dropVmail(m));
  del.title = 'Supprimer';
  row.append(info, play, del, m.audio);
  return row;
}

function render() {
  const box = $('#phone');
  box.replaceChildren(el('div', 'ph-notch'));
  if (call) box.append(callScreen());
  if (vmails.length) {
    const list = el('div', 'ph-vmails');
    list.append(el('div', 'ph-title', 'Messagerie'), ...vmails.map(vmailRow));
    box.append(list);
  }
  box.hidden = !call && !vmails.length;
}
