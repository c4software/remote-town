// Téléphone : appel vocal entre deux personnes, où qu'elles soient dans l'espace (sauf dans
// les salles de classe), lancé depuis la liste des participants (clic droit), une main levée
// ou les contacts du téléphone. Sans réponse,
// l'appelant peut laisser un message vocal. Tout passe par les liaisons pair-à-pair : la
// voix par la copie du micro déjà en place (règle `call` de sendsAudio, world.js), les
// ordres par l'action `call`, le message par l'action `vmail`.
import { customRing, initMic, neighbourRing, ring, setCustomRing, stopRing } from './audio.js';
import { isAdmin, kick } from './admin.js';
import { drawAvatar } from './avatar.js';
import { chat, chatPage, chatTitle, chatsPage, dmKey, focusChat, unreadTotal } from './chat.js';
import { BODY_OPTIONS, CALL, CALL_MSG, CALL_PHASE, CHAT_KEY, HEAD_OPTIONS, PALETTE, PHONE, PHONE_VIEW, RING_FILE_MAX, RING_FILE_TYPES, RING_STYLES, STYLES } from './constantes.js';
import { $, ofName, toast } from './dom.js';
import { personalVolume, pushState, setPersonalVolume } from './media.js';
import { joinFromPanel } from './movement.js';
import { isTransmitting } from './panel.js';
import { setPipOn } from './pip.js';
import { openProfile, savePrefs, setLook } from './profile.js';
import { S, users } from './state.js';
import { MAP, canCallIn, hearsRing, ringVolume } from './world.js';

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
  clearTimeout(previewTimer);
  stopRing();
  call = next;
  if (next && ms) next.timer = setTimeout(onTimeout, ms);
  // Vu des autres : téléphone qui sonne, ou personne au téléphone (dessin, liste, sonnerie voisine)
  const shown = next?.phase === CALL_PHASE.IN ? PHONE.RING : [CALL_PHASE.OUT, CALL_PHASE.ON].includes(next?.phase) ? PHONE.CALL : null;
  if (S.me && (S.me.phone || null) !== shown) { S.me.phone = shown; pushState(); }
  render();
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

function close() {
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
  if (!canCallIn(S.me.zone)) return toast('📞 Pas de téléphone dans cette salle.');
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
  setCall({ peer: call.peer, name: call.name, phase: CALL_PHASE.AWAY, why, mine: true }, CALL.awayMs, close);
}

async function accept() {
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
  close();
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
    if (call || !canCallIn(S.me.zone)) { missedCall(u); return tell(peerId, CALL_MSG.BUSY); }
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
    close();
  }
}

// Mon correspondant a changé d'état (haut-parleur…) : l'écran de l'appel suit
export function phonePeerState(id) {
  if (call?.peer === id && call.phase === CALL_PHASE.ON) render();
}

// La personne en ligne (ou appelée) a quitté l'espace
export function phonePeerLeft(id) {
  rangAt.delete(id); missed.delete(id);
  dropRingFile(id); ringAsked.delete(id); ringSent.delete(id);
  if (call?.peer === id) close();
}

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

// En entrant dans une salle de classe : l'appel se termine
export function phoneZoneChange() {
  if (!call || canCallIn(S.me.zone) || ![CALL_PHASE.OUT, CALL_PHASE.IN, CALL_PHASE.ON].includes(call.phase)) return;
  toast('📞 Pas de téléphone dans cette salle : appel terminé.');
  hangUp();
}

// ============================================================
// Message vocal : enregistré chez l'appelant, envoyé d'un bloc
// ============================================================
function record() {
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

function sendRecording() {
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
  render();
}

function dropVmail(m) {
  m.audio?.pause();
  URL.revokeObjectURL(m.url);
  vmails.splice(vmails.indexOf(m), 1);
  render();
}

// ============================================================
// Affichage : un petit téléphone qui monte du bas de l'écran, par-dessus l'interface. Il
// s'ouvre avec le bouton téléphone de la barre du bas (pastille : messages non lus et messages
// vocaux), ou tout seul pour un appel. Hors appel : accueil, contacts (et fiche d'une
// personne), messages (groupes et messages directs, chat.js), messagerie vocale, personnage
// (mêmes listes que l'écran du personnage de profile.js, qui reste celui de la connexion) et
// réglages (sonnerie, ne pas déranger, incrustation).
// ============================================================
let open = false;   // téléphone déplié à la main (un appel le montre de toute façon)
let view = PHONE_VIEW.HOME;  // page affichée (PHONE_VIEW)
let personId = null; // fiche affichée (vue 'person')
let convKey = null;  // conversation affichée (vue 'chat')
let previewTimer = null, leaveTimer = null;

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
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  people: svg('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 4.5a4 4 0 0 1 0 7M19 21a7 7 0 0 0-2-4.9"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12z"/>'),
  mail: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m2 7 10 7 10-7"/>'),
  settings: svg('<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  pip: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1"/>'),
  speaker: svg('<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  walk: svg('<circle cx="13" cy="4" r="2"/><path d="m7 21 3-6 1-5-3 2v3M11 10l4 3 3 1M10 15l4 2 1 4"/>'),
  ban: svg('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
};
const el = (tag, cls, text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });
// Bouton avec icône et libellé (icônes : chaînes fixes ci-dessus)
function btn(cls, icon, label, fn) {
  const b = Object.assign(el('button', cls), { type: 'button', onclick: fn });
  b.innerHTML = ICONS[icon] || '';
  b.append(el('span', '', label));
  return b;
}
const miniAvatar = (look, cls) => {
  const c = Object.assign(el('canvas', cls), { width: 32, height: 40 });
  drawAvatar(c.getContext('2d'), look, 16, 37, 'down');
  return c;
};
const go = (v) => () => { view = v; render(); };
const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const statusText = () => ({
  [CALL_PHASE.OUT]: 'Appel en cours…',
  [CALL_PHASE.IN]: 'Appel entrant…',
  [CALL_PHASE.ON]: `En ligne · ${clock(performance.now() - call.since)}`,
  [CALL_PHASE.AWAY]: call.why,
  [CALL_PHASE.REC]: 'Message vocal…',
}[call.phase]);

// Haut-parleur : la conversation s'entend autour de moi (règle speakerHolder de world.js)
function toggleSpeaker() {
  S.me.speaker = !S.me.speaker;
  pushState();
  render();
}

function callScreen() {
  const body = el('div', `ph-body ph-${call.phase}`), screen = el('div', 'ph-screen'), actions = el('div', 'ph-actions');
  const peer = users.get(call.peer);
  if (peer?.look) screen.append(miniAvatar(peer.look, 'ph-avatar'));
  screen.append(el('div', 'ph-name', call.name), el('div', 'ph-status', statusText()));
  if (call.phase === CALL_PHASE.ON) {
    screen.append(el('small', '', S.me.speaker ? 'Haut-parleur : les personnes proches entendent l\'appel' : 'Votre micro est ouvert pour cette personne'));
    if (peer?.speaker) screen.append(el('small', 'ph-warn', `🔊 Haut-parleur activé chez ${call.name}`));
  }
  if (call.phase === CALL_PHASE.REC) {
    const bar = el('div', 'ph-bar');
    bar.style.animationDuration = `${CALL.vmailMs}ms`;
    screen.append(bar);
  }
  if (call.phase === CALL_PHASE.IN) actions.append(btn('ph-end', 'end', 'Refuser', hangUp), btn('ph-accept', 'call', 'Décrocher', accept));
  if (call.phase === CALL_PHASE.OUT) actions.append(btn('ph-end', 'end', 'Annuler', hangUp));
  if (call.phase === CALL_PHASE.ON) actions.append(btn(`ph-ghost ph-spk${S.me.speaker ? ' sel' : ''}`, 'speaker', 'Haut-parleur', toggleSpeaker), btn('ph-end', 'end', 'Raccrocher', hangUp));
  if (call.phase === CALL_PHASE.AWAY) actions.append(btn('ph-ghost', 'close', 'Fermer', close), btn('ph-accept ph-record', 'mic', 'Message', record));
  if (call.phase === CALL_PHASE.REC) actions.append(btn('ph-ghost', 'close', 'Annuler', close), btn('ph-accept ph-send', 'send', 'Envoyer', sendRecording));
  body.append(screen, actions);
  return body;
}

// Un message de la messagerie vocale : lecture / pause, suppression
function vmailRow(m) {
  const row = el('div', 'ph-item ph-vmail'), info = el('div', 'ph-info');
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

// Pourquoi on ne peut pas appeler cette personne ('' si on peut)
const noCall = (u) => (!canCallIn(S.me.zone) ? 'Pas de téléphone dans cette salle' : !canCallIn(u.zone) ? 'Pas de téléphone dans sa salle' : '');
const dial = (u) => { open = false; view = PHONE_VIEW.HOME; startCall(u); render(); };
const volumeLabel = (v) => `${v === 0 ? '🔇' : '🔉'} ${Math.round(v * 100)} %`;

// Une personne des contacts : un clic ouvre sa fiche, le combiné l'appelle
function contactRow(u) {
  const row = el('div', 'ph-item ph-contact'), info = el('div', 'ph-info');
  row.dataset.id = u.id;
  const marks = [u.hand && '✋', u.phone && '📞', isTransmitting(u) && '🎙️', u.sharing && '🖥️',
    u.link === 'relay' && 'relais', personalVolume(u) < 1 && volumeLabel(personalVolume(u))].filter(Boolean).join(' ');
  info.append(el('b', '', u.name), el('small', '', [MAP.zoneById[u.zone]?.name, marks].filter(Boolean).join(' · ')));
  info.onclick = () => { personId = u.id; view = PHONE_VIEW.PERSON; render(); };
  const b = btn('ph-mini ph-dial', 'call', '', () => dial(u));
  b.title = noCall(u) || `Appeler ${u.name}`;
  b.disabled = !!noCall(u);
  row.append(miniAvatar(u.look, 'ph-face'), info, b);
  return row;
}

// Fiche d'une personne : l'appeler, lui écrire, la rejoindre, régler son volume pour moi
// seul, et l'expulser pour les administrateurs (jeton, admin.js)
function personPage(u) {
  const page = el('div', 'ph-list ph-person');
  page.append(miniAvatar(u.look, 'ph-avatar'), el('div', 'ph-name', u.name), el('small', 'ph-note', MAP.zoneById[u.zone]?.name || ''));
  const callBtn = btn('ph-row ph-act-call', 'call', noCall(u) ? `Appeler (${noCall(u).toLowerCase()})` : 'Appeler', () => dial(u));
  callBtn.disabled = !!noCall(u);
  page.append(
    callBtn,
    btn('ph-row ph-act-msg', 'chat', 'Message', () => openChat(dmKey(u))),
    btn('ph-row ph-act-join', 'walk', 'Rejoindre', () => joinFromPanel(u.id)),
    el('div', 'ph-title', `Volume ${ofName(u.name)}`),
  );
  const row = el('div', 'ph-vol'), mute = Object.assign(el('button', 'ph-mini'), { type: 'button' });
  const range = Object.assign(el('input', ''), { type: 'range', min: 0, max: 100, step: 5 });
  range.setAttribute('aria-label', `Volume ${ofName(u.name)}`);
  const pct = el('span', '');
  let before = personalVolume(u) || 1; // volume rétabli après « couper »
  const show = (v) => {
    range.value = Math.round(v * 100);
    pct.textContent = `${Math.round(v * 100)} %`;
    mute.textContent = v === 0 ? '🔇' : v < 0.5 ? '🔈' : '🔊';
    mute.title = v === 0 ? 'Rétablir le son' : 'Couper le son';
  };
  const set = (v) => { setPersonalVolume(u, v); show(v); };
  range.oninput = () => set(range.value / 100);
  mute.onclick = () => {
    const v = personalVolume(u);
    if (v > 0) { before = v; set(0); } else set(before || 1);
  };
  show(personalVolume(u));
  row.append(mute, range, pct);
  page.append(row);
  if (isAdmin()) page.append(btn('ph-row ph-kick', 'ban', `Expulser ${u.name}`, () => { togglePhone(false); kick(u); }));
  return page;
}

// Réglages : sonnerie (motifs, ou un fichier audio à soi), « Ne pas déranger », incrustation
function previewRing() {
  if (call) return;
  ring('in', false);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { if (!call) stopRing(); }, 6000);
}
function pickRing(id) {
  if (id !== 'file') { S.ring = id; savePrefs(); pushState(); previewRing(); return render(); }
  const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'audio/*' });
  file.onchange = () => {
    const f = file.files[0];
    if (!f) return;
    if (!f.type.startsWith('audio/') || f.size > RING_FILE_MAX) return toast(`Sonnerie : un fichier audio de ${RING_FILE_MAX / 1000} Ko au plus.`);
    const reader = new FileReader();
    reader.onload = () => {
      if (!setCustomRing(reader.result)) return toast('Sonnerie : impossible de garder ce fichier dans le navigateur.');
      S.ring = 'file';
      savePrefs(); pushState(); previewRing(); render();
    };
    reader.readAsDataURL(f);
  };
  file.click();
}
function settingsPage() {
  const page = el('div', 'ph-list');
  page.append(el('div', 'ph-title', 'Sonnerie'));
  for (const r of RING_STYLES) {
    const b = btn(`ph-row ph-ring${S.ring === r.id ? ' sel' : ''}`, S.ring === r.id ? 'check' : '', r.label, () => pickRing(r.id));
    b.dataset.ring = r.id;
    page.append(b);
  }
  const others = btn(`ph-row ph-others${S.otherRings ? ' sel' : ''}`, S.otherRings ? 'check' : '', 'Sonneries personnelles des autres', () => { S.otherRings = !S.otherRings; savePrefs(); nearbyRing(); render(); });
  others.title = 'Entendre le fichier audio choisi par les personnes proches (sinon : la sonnerie par défaut)';
  others.setAttribute('aria-pressed', S.otherRings);
  page.append(others);
  page.append(el('div', 'ph-title', 'Appels'));
  const dnd = btn(`ph-row ph-dnd${S.dnd ? ' sel' : ''}`, 'moon', 'Ne pas déranger', () => { S.dnd = !S.dnd; savePrefs(); render(); });
  dnd.title = 'Les appels vont directement à la messagerie';
  dnd.setAttribute('aria-pressed', S.dnd);
  page.append(dnd);
  // Vue en incrustation (pip.js) : proposée seulement si le navigateur sait l'afficher
  if ('documentPictureInPicture' in window) {
    page.append(el('div', 'ph-title', 'Affichage'));
    const pip = btn(`ph-row ph-pip${S.pipOn ? ' sel' : ''}`, 'pip', 'Incrustation (onglet caché)', () => { setPipOn(!S.pipOn); savePrefs(); render(); });
    pip.title = 'Petite vue autour de son personnage, ouverte en changeant d\'onglet (aussi avec P)';
    pip.setAttribute('aria-pressed', S.pipOn);
    page.append(pip);
  }
  return page;
}

// Mon personnage : style, couleurs et accessoires, appliqués tout de suite et vus des autres
// (pas le nom). Mêmes listes que l'écran du personnage : STYLES, HEAD_OPTIONS, BODY_OPTIONS (avatar.js).
function lookPage() {
  const page = el('div', 'ph-list ph-look'), look = S.me.look;
  const pick = (part, v) => () => { setLook(part, v); render(); };
  // Le nom est affiché, pas modifiable ici : on ne change pas d'identité depuis le téléphone
  page.append(miniAvatar(look, 'ph-avatar'), el('div', 'ph-name', S.me.name));
  // Style et accessoires : listes déroulantes (une trentaine de choix, à l'étroit en puces)
  const select = (title, part, options) => {
    const sel = el('select', 'ph-select');
    sel.dataset.part = part;
    sel.setAttribute('aria-label', title);
    for (const [v, label] of options) sel.append(Object.assign(el('option', '', label), { value: v ?? '', selected: look[part] === v }));
    sel.onchange = () => { setLook(part, sel.value || null); render(); };
    page.append(el('div', 'ph-title', title), sel);
  };
  const swatches = (title, part) => {
    const box = el('div', 'ph-chips');
    box.dataset.part = part;
    for (const c of PALETTE[part]) {
      const b = Object.assign(el('button', `ph-sw${look[part] === c ? ' sel' : ''}`), { type: 'button', title: c, onclick: pick(part, c) });
      b.style.background = c;
      box.append(b);
    }
    page.append(el('div', 'ph-title', title), box);
  };
  const options = (list) => list.map((o) => [o.id, o.label]);
  select('Style', 'style', options(STYLES));
  swatches('Haut', 'shirt'); swatches('Cheveux', 'hair'); swatches('Peau', 'skin');
  select('Tête', 'head', [[null, 'Aucun'], ...options(HEAD_OPTIONS)]);
  select('Corps', 'body', [[null, 'Aucun'], ...options(BODY_OPTIONS)]);
  page.append(btn('ph-row ph-full', 'user', 'Écran complet (micro…)', () => { togglePhone(false); openProfile(); }));
  return page;
}

function homePage() {
  const page = el('div', 'ph-list');
  const others = users.size - 1, unread = unreadTotal();
  const row = (cls, icon, label, count, v) => {
    const b = btn(`ph-row ${cls}`, icon, label, go(v));
    if (count) b.append(el('i', 'badge', count));
    return b;
  };
  page.append(
    row('ph-nav-contacts', 'people', `Contacts${others > 0 ? ` (${others})` : ''}`, 0, PHONE_VIEW.CONTACTS),
    row('ph-nav-chats', 'chat', 'Messages', unread, PHONE_VIEW.CHATS),
    row('ph-nav-vmail', 'mail', 'Messagerie vocale', vmails.length, PHONE_VIEW.VMAIL),
    row('ph-nav-profile', 'user', 'Mon personnage', 0, PHONE_VIEW.LOOK),
    row('ph-nav-settings', 'settings', 'Réglages', 0, PHONE_VIEW.SETTINGS),
  );
  if (S.dnd) page.append(el('small', 'ph-note', '🌙 Ne pas déranger : les appels vont à la messagerie'));
  return page;
}

const PARENT = { [PHONE_VIEW.PERSON]: PHONE_VIEW.CONTACTS, [PHONE_VIEW.CHAT]: PHONE_VIEW.CHATS }; // page précédente (sinon : l'accueil)
function pageScreen() {
  const body = el('div', 'ph-body'), head = el('div', 'ph-head');
  const person = view === PHONE_VIEW.PERSON ? users.get(personId) : null;
  if (view === PHONE_VIEW.PERSON && !person) view = PHONE_VIEW.CONTACTS; // la personne est partie
  const V = PHONE_VIEW;
  const title = {
    [V.HOME]: 'Téléphone', [V.CONTACTS]: 'Contacts', [V.PERSON]: 'Contact', [V.CHATS]: 'Messages', [V.CHAT]: view === V.CHAT ? chatTitle(convKey) : '',
    [V.VMAIL]: 'Messagerie vocale', [V.SETTINGS]: 'Réglages', [V.LOOK]: 'Personnage',
  }[view];
  const back = btn('ph-mini ph-back', 'back', '', go(PARENT[view] || PHONE_VIEW.HOME));
  back.title = 'Retour';
  back.style.visibility = view === PHONE_VIEW.HOME ? 'hidden' : '';
  const shut = btn('ph-mini ph-close', 'close', '', () => togglePhone(false));
  shut.title = 'Replier le téléphone';
  head.append(back, el('b', '', title), shut);
  const list = el('div', 'ph-list');
  if (view === PHONE_VIEW.CONTACTS) {
    const others = [...users.values()].filter((u) => !u.isMe).sort((a, b) => a.name.localeCompare(b.name));
    list.append(...(others.length ? others.map(contactRow) : [el('small', 'ph-note', 'Personne d\'autre dans cet espace')]));
  }
  if (view === PHONE_VIEW.VMAIL) list.append(...(vmails.length ? vmails.map(vmailRow) : [el('small', 'ph-note', 'Aucun message')]));
  const page = {
    [V.HOME]: homePage, [V.SETTINGS]: settingsPage, [V.LOOK]: lookPage, [V.PERSON]: () => personPage(person),
    [V.CHATS]: () => chatsPage(openChat), [V.CHAT]: () => chatPage(convKey),
  }[view];
  body.append(head, page ? page() : list);
  return body;
}

function togglePhone(on = !open) {
  open = on;
  if (!on) { view = PHONE_VIEW.HOME; if (!call) stopRing(); }
  render();
}
// Replie le téléphone (sur mobile seulement : il masque la carte quand on rejoint quelqu'un)
export function phoneClose(mobileOnly = false) {
  if (open && (!mobileOnly || innerWidth <= 560)) togglePhone(false);
}

// Ouvre une conversation ('global', 'zone' ou 'dm:<pseudo>') et place le curseur dans la saisie
export function openChat(key = CHAT_KEY.ZONE) {
  if (call) return;
  open = true; view = PHONE_VIEW.CHAT; convKey = key;
  render();
  focusChat();
}
export function openPerson(id) {
  if (call || !users.has(id)) return;
  open = true; view = PHONE_VIEW.PERSON; personId = id;
  render();
}

// Quelque chose a changé ailleurs (participants, messages) : la page affichée suit
export function phoneRefresh(kind) {
  if (!open || call) return;
  if (kind === view || view === PHONE_VIEW.HOME) render();
  else if (kind === PHONE_VIEW.CONTACTS && view === PHONE_VIEW.PERSON && !users.has(personId)) render();
}

// Pastille du bouton de la barre : messages non lus et messages vocaux reçus
export function phoneBadge() {
  const b = $('#phoneBtn'), badge = b.querySelector('.badge'), n = unreadTotal() + vmails.length;
  badge.textContent = n || '';
  badge.hidden = !n;
  b.classList.toggle('dnd', S.dnd);
  b.classList.toggle('active', open || !!call);
  b.title = S.dnd ? 'Téléphone (ne pas déranger)' : 'Téléphone : contacts, messages, réglages';
}

function render() {
  const box = $('#phone'), shown = !!call || open;
  if (!(shown && !call && view === PHONE_VIEW.CHAT)) chat.open = null; // plus de conversation à l'écran
  const top = box.querySelector('.ph-list')?.scrollTop || 0; // redessiné : on garde le défilement
  box.replaceChildren(el('div', 'ph-notch'), call ? callScreen() : pageScreen());
  if (top && box.querySelector('.ph-list')) box.querySelector('.ph-list').scrollTop = top;
  // Il monte du bas de l'écran, et y redescend avant de disparaître
  clearTimeout(leaveTimer);
  if (shown) { box.classList.remove('leaving'); box.hidden = false; }
  else if (!box.hidden) {
    box.classList.add('leaving');
    leaveTimer = setTimeout(() => { box.classList.remove('leaving'); box.hidden = true; }, 220);
  }
  phoneBadge();
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initPhone() {
  $('#phoneBtn').onclick = () => { if (!call) togglePhone(); };
  render();
}
