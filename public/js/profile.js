// Écran du personnage : connexion (nom, salle, apparence) et modification en cours de session.
// Le profil est mémorisé dans le navigateur (localStorage « rt-prefs »).
import { banMinutesLeft } from './admin.js';
import { customRing, initMic, portalMusic, sampleLevel } from './audio.js';
import { drawAvatar, lookBody, lookHead } from './avatar.js';
import { BODY_OPTIONS, HEAD_OPTIONS, PALETTE, RING_STYLES, STYLES } from './constantes.js';
import { $, cleanName, sameName, toast } from './dom.js';
import { showHelp } from './hud.js';
import { switchMic } from './media.js';
import { connect, prepareIce, profile } from './net.js';
import { renderPeople } from './panel.js';
import { openLook } from './phone.js';
import { canvas } from './render.js';
import { cleanRoom, rememberSpace, roomName, roomUrl, shareLink } from './rooms.js';
import { S, keys, users } from './state.js';

const prefs = (() => { try { return JSON.parse(localStorage.getItem('rt-prefs')) || {}; } catch { return {}; } })();
export const look = {
  shirt: prefs.look?.shirt || PALETTE.shirt[Math.floor(Math.random() * PALETTE.shirt.length)],
  hair: prefs.look?.hair || PALETTE.hair[0],
  skin: prefs.look?.skin || PALETTE.skin[1],
  head: lookHead(prefs.look),
  body: lookBody(prefs.look),
  style: prefs.look?.style === 'girl' ? 'girl' : 'boy',
};

// ============================================================
// Écran d'accueil
// ============================================================
// Profil (nom, apparence, dernière salle) mémorisé dans le navigateur à chaque modification
const nameInput = $('#nameInput');
const roomInput = $('#roomInput');
export function savePrefs() {
  try {
    localStorage.setItem('rt-prefs', JSON.stringify({ name: cleanName(nameInput.value), look, room: roomInput.value.trim(), mic: S.micDevice, pipAuto: S.pipOn, ring: S.ring, dnd: S.dnd, otherRings: S.otherRings }));
  } catch {}
}
const showRoomLink = () => { $('#roomLink').textContent = roomUrl(cleanRoom(roomInput.value)); };
// Aperçu : immobile et de face. Changer de vêtement lui fait faire un tour sur
// lui-même, qui finit de face (les imprimés des t-shirts ne se voient que de face) ;
// un clic le fait sauter.
const TURN = [['left', 450], ['up', 450], ['right', 450], ['down', 450]];
const TURN_MS = TURN.reduce((t, [, ms]) => t + ms, 0);
const WALK = [1, 2]; // mêmes pas que sur la carte
const HOP_MS = 380, HOP_HEIGHT = 5;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let turnAt = -Infinity, hopAt = -Infinity, previewLoop = 0;
function previewPose(now) {
  let t = now - turnAt;
  const turning = t < TURN_MS;
  const [dir] = turning ? TURN.find(([, ms]) => (t -= ms) < 0) : ['down'];
  const k = (now - hopAt) / HOP_MS;
  const lift = k < 1 ? Math.sin(Math.PI * k) * HOP_HEIGHT : 0;
  return { dir, lift, step: turning ? WALK[Math.floor(now / 200) % WALK.length] : 0, busy: turning || k < 1 };
}
// Renvoie vrai tant qu'une animation est en cours
function drawPreview() {
  const c = $('#preview'), g = c.getContext('2d');
  const { dir, step, lift, busy } = previewPose(performance.now());
  g.clearRect(0, 0, c.width, c.height);
  g.save(); g.scale(3, 3); drawAvatar(g, look, 16, 45, dir, step, false, lift); g.restore();
  return busy;
}
function animatePreview() {
  previewLoop = drawPreview() && !$('#join').hidden ? requestAnimationFrame(animatePreview) : 0;
}
function playPreview(move) {
  if (move === 'turn') {
    if (calm()) return drawPreview();
    turnAt = performance.now();
  } else hopAt = performance.now();
  if (!previewLoop) previewLoop = requestAnimationFrame(animatePreview);
}

// L'écran de connexion sert aussi à modifier son personnage une fois dans l'espace
function syncPickers() {
  document.querySelectorAll('.swatches').forEach((box) => {
    box.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.title === look[box.dataset.part]));
  });
  for (const part of ['style', 'head', 'body']) {
    document.querySelectorAll(`#${part}Chips button`).forEach((b) => b.classList.toggle('sel', (b.dataset.v || null) === look[part]));
  }
  drawPreview();
}

// Salle mémorisée pour la prochaine visite (après un passage par la porte des espaces)
export function rememberRoom(id) {
  roomInput.value = id === 'lobby' ? '' : id;
  showRoomLink();
  savePrefs();
}

// ============================================================
// Choix du micro. Les noms des micros ne sont connus qu'une fois l'accès au micro
// accordé : avant, on affiche « Micro 1, 2… ». En session, le changement est immédiat.
// ============================================================
async function renderMics() {
  const sel = $('#micSelect');
  let mics = [];
  try { mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default'); } catch {}
  sel.replaceChildren(new Option('Micro par défaut', ''));
  mics.forEach((d, i) => sel.append(new Option(d.label || `Micro ${i + 1}`, d.deviceId)));
  sel.value = mics.some((d) => d.deviceId === S.micDevice) ? S.micDevice : '';
}

async function onMicChange() {
  const id = $('#micSelect').value;
  if (!(await switchMic(id))) { toast('Ce micro est indisponible : on garde le précédent.'); $('#micSelect').value = S.micDevice; return; }
  savePrefs();
  if (S.micTrack) toast(`🎙️ Micro : ${$('#micSelect').selectedOptions[0]?.textContent}`);
  meterMic();
}

// Niveau du micro à côté de la liste, tant que l'écran du personnage est ouvert
let meterLoop = 0;
function meterMic() {
  if (meterLoop) return;
  const bar = $('#micLevel b');
  const tick = () => {
    if ($('#join').hidden || !S.localAnalyser) { meterLoop = 0; bar.style.width = '0'; return; }
    bar.style.width = `${Math.min(100, sampleLevel(S.localAnalyser) * 400)}%`;
    meterLoop = requestAnimationFrame(tick);
  };
  meterLoop = requestAnimationFrame(tick);
}

// Pseudo choisi à la connexion, puis fixe : on ne change pas d'identité une fois dans
// l'espace. Seule exception : il est déjà pris (forceRename), il faut alors en changer.
function lockName(on) {
  nameInput.readOnly = on;
  nameInput.title = on ? 'Le pseudo se choisit à la connexion : il ne se change pas dans l\'espace' : '';
}

export function openProfile() {
  if (!S.me) return;
  S.editingProfile = true;
  $('#profileCancel').hidden = $('#profileHelp').hidden = false;
  Object.assign(look, S.me.look);
  nameInput.value = S.me.name;
  lockName(true); // une fois dans l'espace, on ne change plus de pseudo
  syncPickers();
  $('#joinSub').textContent = 'Modifiez votre personnage : les autres verront le changement tout de suite.';
  $('#roomField').hidden = true;
  $('#joinNote').hidden = true;
  $('#joinSubmit').textContent = 'Enregistrer';
  $('#profileActions').hidden = false;
  $('#join').hidden = false;
  renderMics().then(meterMic);
  $('#reactMenu').hidden = true;
  keys.clear();
}

// Pseudo déjà pris dans l'espace (net.js) : l'écran du personnage s'ouvre et ne se ferme
// qu'avec un pseudo libre (ni Annuler, ni Échap)
export function forceRename(taken) {
  if (S.renameForced) return;
  S.renameForced = taken;
  openProfile();
  $('#joinSub').textContent = `Le pseudo « ${taken} » est déjà pris dans cet espace : choisissez-en un autre pour continuer.`;
  $('#profileCancel').hidden = $('#profileHelp').hidden = true;
  lockName(false);
  nameInput.focus(); nameInput.select();
}

export function closeProfile(restore = true) {
  if (S.renameForced) return;
  if (restore) { Object.assign(look, S.me.look); nameInput.value = S.me.name; savePrefs(); }
  S.editingProfile = false;
  lockName(false); // l'écran fermé : le champ redevient libre pour une prochaine connexion
  $('#join').hidden = true;
  canvas.focus?.();
}

function applyProfile() {
  // Pseudo verrouillé (pas de renommage imposé) : celui de la connexion est gardé quoi qu'il arrive
  const name = S.renameForced ? cleanName(nameInput.value) : S.me.name;
  nameInput.value = name; // l'utilisateur voit le pseudo tel qu'il sera affiché
  if (!name) return nameInput.focus();
  const clash = [...users.values()].find((u) => !u.isMe && sameName(u.name, name));
  if (clash) {
    toast(`Le pseudo « ${clash.name} » est déjà pris dans cet espace : choisissez-en un autre.`);
    nameInput.focus(); nameInput.select();
    return;
  }
  S.renameForced = null;
  S.me.name = name;
  S.me.look = { ...look };
  publishProfile();
  closeProfile(false);
}

// Mon nom et mon apparence ont changé : mémorisés, affichés (barre du bas, liste) et envoyés
function publishProfile() {
  savePrefs();
  $('#meName').textContent = S.me.name;
  const mc = $('#meAvatar').getContext('2d');
  mc.clearRect(0, 0, mc.canvas.width, mc.canvas.height);
  drawAvatar(mc, S.me.look, 16, 37, 'down');
  S.net?.hello.send(profile()).catch(() => {}); // les autres mettent à jour nom et apparence
  renderPeople();
}

// Modification directe depuis le téléphone (phone.js), appliquée tout de suite. Les valeurs
// viennent des mêmes listes que l'écran du personnage (PALETTE, puces d'accessoires).
export function setLook(part, value) {
  look[part] = value;
  S.me.look = { ...look };
  publishProfile();
}

const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

// Cercle noir qui grandit depuis (x, y) et recouvre l'écran ; l'arrivée par la porte
// (firstArrival, même écran noir) prend le relais et le retire
function coverFrom([x, y], name) {
  const el = $('#cover');
  el.style.setProperty('--x', `${x}px`);
  el.style.setProperty('--y', `${y}px`);
  $('#coverName').textContent = name;
  el.classList.remove('grow');
  el.hidden = false;
  el.getBoundingClientRect(); // applique l'état de départ avant la transition
  el.classList.add('grow');
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initProfile() {
  // Téléphone (phone.js) : sonnerie et « ne pas déranger », réglés dans le téléphone lui-même
  S.ring = RING_STYLES.some((x) => x.id === prefs.ring) && (prefs.ring !== 'file' || customRing()) ? prefs.ring : 'ip';
  S.dnd = prefs.dnd === true;
  S.otherRings = prefs.otherRings !== false;
  S.micDevice = typeof prefs.mic === 'string' ? prefs.mic : '';
  renderMics();
  $('#micSelect').addEventListener('change', onMicChange);
  navigator.mediaDevices?.addEventListener?.('devicechange', renderMics);
  // Vue en incrustation (pip.js) : désactivée par défaut, réglée dans le téléphone (phone.js).
  // « pipAuto » et non plus « pip », enregistré activé par la v2.28.0
  S.pipOn = prefs.pipAuto === true;
  nameInput.value = prefs.name || '';
  roomInput.value = new URLSearchParams(location.search).get('room') ?? prefs.room ?? '';
  nameInput.addEventListener('input', savePrefs);
  roomInput.addEventListener('input', () => { showRoomLink(); savePrefs(); });
  $('#copyLinkJoin').onclick = () => shareLink(cleanRoom(roomInput.value));
  showRoomLink();
  // Clic sur un choix (couleur ou puce) : appliqué, marqué, aperçu rejoué (`move`) ou redessiné
  const pick = (box, b, part, value, move) => () => {
    look[part] = value;
    box.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
    if (move) playPreview(move); else drawPreview();
    savePrefs();
  };
  document.querySelectorAll('.swatches').forEach((box) => {
    const part = box.dataset.part;
    for (const col of PALETTE[part]) {
      const b = document.createElement('button');
      b.type = 'button'; b.style.background = col; b.title = col;
      if (col === look[part]) b.classList.add('sel');
      b.onclick = pick(box, b, part, col, part === 'shirt' && 'turn');
      box.append(b);
    }
  });
  // Puces du style et des accessoires, construites depuis les listes d'avatar.js
  const chips = (id, part, options, move) => {
    const box = $(id);
    for (const o of options) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: o.label });
      b.dataset.v = o.id ?? '';
      b.classList.toggle('sel', o.id === look[part]);
      b.onclick = pick(box, b, part, o.id, move);
      box.append(b);
    }
  };
  const none = { id: null, label: 'Aucun' };
  chips('#styleChips', 'style', STYLES);
  chips('#headChips', 'head', [none, ...HEAD_OPTIONS], 'turn');
  chips('#bodyChips', 'body', [none, ...BODY_OPTIONS], 'turn');
  drawPreview();
  $('#preview').onclick = () => playPreview('hop');
  document.fonts?.ready.then(drawPreview);
  savePrefs(); // garde la couleur tirée au hasard dès la première visite

  $('#profileCancel').onclick = () => closeProfile();
  $('#profileHelp').onclick = () => { closeProfile(); showHelp(); };
  // Son personnage, dans la barre du bas : il ouvre la page « Personnage » du téléphone (l'écran
  // complet reste accessible depuis cette page, pour le micro)
  $('#mePill').onclick = openLook;
  $('#mePill').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLook(); } };

  // Point de départ du cercle noir : là où l'on a cliqué (sinon le centre du bouton)
  let clickAt = null;
  $('#joinSubmit').addEventListener('pointerdown', (e) => { clickAt = [e.clientX, e.clientY]; });
  $('#joinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (S.editingProfile) return applyProfile();
    const name = cleanName(nameInput.value);
    nameInput.value = name; // l'utilisateur voit le pseudo tel qu'il sera affiché
    if (!name) return;
    savePrefs();
    const left = banMinutesLeft(cleanRoom(roomInput.value));
    if (left) return toast(`🚫 Vous avez été retiré·e de cet espace : retour possible dans ${left} min.`);
    S.roomId = cleanRoom(roomInput.value);
    coverFrom(clickAt || center($('#joinSubmit')), roomName(S.roomId));
    portalMusic(); // dans le geste de l'utilisateur : le navigateur autorise le son
    history.replaceState(null, '', roomUrl(S.roomId));
    rememberSpace(S.roomId);
    S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // On attend que le cercle noir ait recouvert l'écran (et l'accord pour le micro)
    await Promise.all([initMic(), prepareIce(), new Promise((r) => setTimeout(r, 800))]);
    connect(name);
  });
}
