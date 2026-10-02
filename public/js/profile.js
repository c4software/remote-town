// Écran du personnage : connexion (nom, salle, apparence) et modification en cours de session.
// Le profil est mémorisé dans le navigateur (localStorage « rt-prefs »).
import { initMic } from './audio.js';
import { cleanBody, cleanHead, drawAvatar, lookBody, lookHead } from './avatar.js';
import { PALETTE } from './config.js';
import { $ } from './dom.js';
import { showHelp } from './hud.js';
import { connect, profile } from './net.js';
import { renderPeople } from './panel.js';
import { canvas } from './render.js';
import { cleanRoom, roomUrl, shareLink } from './rooms.js';
import { S, keys } from './state.js';

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
function savePrefs() {
  try {
    localStorage.setItem('rt-prefs', JSON.stringify({ name: nameInput.value.trim(), look, room: roomInput.value.trim() }));
  } catch {}
}
const showRoomLink = () => { $('#roomLink').textContent = roomUrl(cleanRoom(roomInput.value)); };
// Aperçu animé : le personnage marche sur place et fait un tour sur lui-même,
// en restant surtout de face (les imprimés des t-shirts ne se voient que de face)
const PREVIEW_TURN = [['down', 2400], ['left', 700], ['up', 700], ['right', 700]];
const PREVIEW_CYCLE = PREVIEW_TURN.reduce((t, [, ms]) => t + ms, 0);
const WALK = [1, 2]; // mêmes pas que sur la carte
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let previewLoop = 0;
function previewPose(now) {
  if (calm()) return { dir: 'down', step: 0 };
  let t = now % PREVIEW_CYCLE;
  const [dir] = PREVIEW_TURN.find(([, ms]) => (t -= ms) < 0);
  return { dir, step: WALK[Math.floor(now / 200) % WALK.length] };
}
function drawPreview() {
  const c = $('#preview'), g = c.getContext('2d');
  const { dir, step } = previewPose(performance.now());
  g.clearRect(0, 0, c.width, c.height);
  g.save(); g.scale(3, 3); drawAvatar(g, look, 16, 37, dir, step); g.restore();
}
// Tourne tant que l'écran du personnage est affiché, s'arrête tout seul ensuite
function animatePreview() {
  if ($('#join').hidden) { previewLoop = 0; return; }
  drawPreview();
  previewLoop = requestAnimationFrame(animatePreview);
}
function startPreview() {
  if (!previewLoop && !calm()) previewLoop = requestAnimationFrame(animatePreview);
}

// L'écran de connexion sert aussi à modifier son personnage une fois dans l'espace
function syncPickers() {
  document.querySelectorAll('.swatches').forEach((box) => {
    box.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.title === look[box.dataset.part]));
  });
  document.querySelectorAll('#styleChips button').forEach((b) => b.classList.toggle('sel', b.dataset.style === look.style));
  for (const part of ['head', 'body']) {
    document.querySelectorAll(`#${part}Chips button`).forEach((b) => b.classList.toggle('sel', (b.dataset.v || null) === look[part]));
  }
  drawPreview();
}

export function openProfile() {
  if (!S.me) return;
  S.editingProfile = true;
  Object.assign(look, S.me.look);
  nameInput.value = S.me.name;
  syncPickers();
  $('#joinSub').textContent = 'Modifiez votre personnage : les autres verront le changement tout de suite.';
  $('#roomField').hidden = true;
  $('#joinNote').hidden = true;
  $('#joinSubmit').textContent = 'Enregistrer';
  $('#profileActions').hidden = false;
  $('#join').hidden = false;
  startPreview();
  $('#reactMenu').hidden = true;
  keys.clear();
}

export function closeProfile(restore = true) {
  if (restore) { Object.assign(look, S.me.look); nameInput.value = S.me.name; savePrefs(); }
  S.editingProfile = false;
  $('#join').hidden = true;
  canvas.focus?.();
}

function applyProfile() {
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();
  S.me.name = name;
  S.me.look = { ...look };
  savePrefs();
  $('#meName').textContent = S.me.name;
  const mc = $('#meAvatar').getContext('2d');
  mc.clearRect(0, 0, mc.canvas.width, mc.canvas.height);
  drawAvatar(mc, S.me.look, 16, 37, 'down');
  S.net?.hello.send(profile()).catch(() => {}); // les autres mettent à jour nom et apparence
  renderPeople();
  closeProfile(false);
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initProfile() {
  nameInput.value = prefs.name || '';
  roomInput.value = new URLSearchParams(location.search).get('room') ?? prefs.room ?? '';
  nameInput.addEventListener('input', savePrefs);
  roomInput.addEventListener('input', () => { showRoomLink(); savePrefs(); });
  $('#copyLinkJoin').onclick = () => shareLink(cleanRoom(roomInput.value));
  showRoomLink();
  document.querySelectorAll('.swatches').forEach((box) => {
    const part = box.dataset.part;
    for (const col of PALETTE[part]) {
      const b = document.createElement('button');
      b.type = 'button'; b.style.background = col; b.title = col;
      if (col === look[part]) b.classList.add('sel');
      b.onclick = () => {
        look[part] = col;
        box.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
        drawPreview();
        savePrefs();
      };
      box.append(b);
    }
  });
  document.querySelectorAll('#styleChips button').forEach((b) => {
    b.classList.toggle('sel', b.dataset.style === look.style);
    b.onclick = () => {
      look.style = b.dataset.style;
      document.querySelectorAll('#styleChips button').forEach((x) => x.classList.toggle('sel', x === b));
      drawPreview();
      savePrefs();
    };
  });
  for (const [part, clean] of [['head', cleanHead], ['body', cleanBody]]) {
    document.querySelectorAll(`#${part}Chips button`).forEach((b) => {
      b.classList.toggle('sel', (b.dataset.v || null) === look[part]);
      b.onclick = () => {
        look[part] = clean(b.dataset.v);
        document.querySelectorAll(`#${part}Chips button`).forEach((x) => x.classList.toggle('sel', x === b));
        drawPreview();
        savePrefs();
      };
    });
  }
  drawPreview();
  startPreview();
  document.fonts?.ready.then(drawPreview);
  savePrefs(); // garde la couleur tirée au hasard dès la première visite

  $('#profileCancel').onclick = () => closeProfile();
  $('#profileHelp').onclick = () => { closeProfile(); showHelp(); };
  $('#mePill').onclick = openProfile;
  $('#mePill').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfile(); } };

  $('#joinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (S.editingProfile) return applyProfile();
    const name = nameInput.value.trim();
    if (!name) return;
    savePrefs();
    S.roomId = cleanRoom(roomInput.value);
    history.replaceState(null, '', roomUrl(S.roomId));
    S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await initMic();
    connect(name);
  });
}
