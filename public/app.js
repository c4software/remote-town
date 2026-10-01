import { joinRoom, selfId } from './vendor/trystero-nostr.js';
import {
  TILE, MAP_W, MAP_H, PROX_RADIUS, T, MAP, shade,
  tileAt, isBlocked, zoneAt, chairAt, zoneType, sendsAudio, sendsVideo, canShareIn, ROOM_TYPES,
} from './shared.js';

const $ = (s) => document.querySelector(s);
const STEP_MS = 140;
const DASH_MS = 65; // Maj maintenu : sprint
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

const PALETTE = {
  shirt: ['#6c63ff', '#06d6a0', '#ef476f', '#ffd166', '#118ab2', '#f78c6b', '#9b5de5', '#2b2d42'],
  hair: ['#3b2a20', '#1c1c1c', '#8d5524', '#e6b85c', '#c0392b', '#d9d9d9', '#5e4bd8', '#f4a6c1'],
  skin: ['#f8d9c0', '#f1c7a4', '#d9a179', '#b07a53', '#8a5a3b', '#5c3a26'],
};

// ============================================================
// Dessin des avatars
// ============================================================
function drawAvatar(ctx, look, cx, by, dir = 'down', walkFrame = 0, seated = false) {
  const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(cx + x), Math.round(by + y), w, h); };
  const sit = seated ? 4 : 0;
  const bob = walkFrame ? -1 : 0;
  const o = sit + bob;

  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(cx, by - 1, 9, 3, 0, 0, Math.PI * 2); ctx.fill();

  if (!seated) {
    const l = walkFrame === 1 ? 2 : 0, rr = walkFrame === 2 ? 2 : 0;
    r(-5, -8, 4, 7 - l, '#2f3150'); r(1, -8, 4, 7 - rr, '#2f3150');
    r(-5, -2 - l, 4, 2, '#1b1c2e'); r(1, -2 - rr, 4, 2, '#1b1c2e');
  }
  const dark = shade(look.shirt, -35);
  r(-7, -18 + o, 14, 11, look.shirt);
  r(-7, -9 + o, 14, 2, dark);
  if (dir === 'left' || dir === 'right') {
    r(dir === 'left' ? -2 : -1, -16 + o, 3, 8, dark);
    r(dir === 'left' ? -2 : -1, -9 + o, 3, 2, look.skin);
  } else {
    r(-9, -17 + o, 2, 8, dark); r(7, -17 + o, 2, 8, dark);
    r(-9, -10 + o, 2, 2, look.skin); r(7, -10 + o, 2, 2, look.skin);
  }
  r(-7, -30 + o, 14, 12, look.skin);
  if (dir === 'up') {
    r(-7, -31 + o, 14, 11, look.hair);
  } else {
    r(-7, -31 + o, 14, 5, look.hair);
    if (dir === 'down') { r(-7, -27 + o, 2, 4, look.hair); r(5, -27 + o, 2, 4, look.hair); }
    if (dir === 'left') r(1, -27 + o, 6, 6, look.hair);
    if (dir === 'right') r(-7, -27 + o, 6, 6, look.hair);
    const eye = '#1d1e30';
    if (dir === 'down') { r(-4, -24 + o, 2, 3, eye); r(2, -24 + o, 2, 3, eye); }
    if (dir === 'left') r(-6, -24 + o, 2, 3, eye);
    if (dir === 'right') r(4, -24 + o, 2, 3, eye);
  }
}

// ============================================================
// Rendu de la carte (pré-calculée dans un canvas hors écran)
// ============================================================
const MS = 2; // résolution du canvas de la carte
function renderMap() {
  const c = document.createElement('canvas');
  c.width = WORLD_W * MS; c.height = WORLD_H * MS;
  const g = c.getContext('2d');
  g.scale(MS, MS);
  const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

  // Sols
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tileAt(x, y), px = x * TILE, py = y * TILE;
      if (t === T.HALL) {
        rect(px, py, TILE, TILE, '#c9a274');
        for (let k = 0; k < 4; k++) {
          rect(px, py + k * 8 + 7, TILE, 1, '#b38c5e');
          const seam = ((x * 7 + k * 13 + y * 3) % 4) * 8 + 4;
          rect(px + seam, py + k * 8, 1, 7, '#b8925f');
        }
      } else if (t === T.MAIN) {
        rect(px, py, TILE, TILE, (x + y) % 2 ? '#dfe3ef' : '#d2d7e6');
        rect(px, py, TILE, 1, 'rgba(255,255,255,.5)');
      } else if (t === T.CLASS) {
        rect(px, py, TILE, TILE, '#e6cfa2');
        for (let k = 0; k < 2; k++) {
          rect(px + k * 16 + 15, py, 1, TILE, '#d4b98a');
          const seam = ((x * 5 + k * 11 + y * 7) % 4) * 8 + 2;
          rect(px + k * 16, py + seam, 15, 1, '#d9c193');
        }
      } else if (t === T.ROOM) {
        const z = MAP.zoneById[zoneAt(x, y)];
        rect(px, py, TILE, TILE, z.carpet);
        g.fillStyle = shade(z.carpet, -10);
        for (let k = 0; k < 6; k++) g.fillRect(px + ((x * 11 + k * 17 + y * 5) % 30), py + ((y * 13 + k * 7 + x) % 30), 2, 2);
      }
    }
  }

  // Murs (vue 3/4 : face avant si le sol est en dessous)
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (tileAt(x, y) !== T.WALL) continue;
      const px = x * TILE, py = y * TILE;
      const below = y + 1 < MAP_H && tileAt(x, y + 1) !== T.WALL;
      if (below) {
        rect(px, py, TILE, 8, '#3d4270');
        rect(px, py + 8, TILE, 21, '#efe5d6');
        rect(px, py + 8, TILE, 2, '#fff8ec');
        rect(px, py + 27, TILE, 5, '#b7a68e');
      } else {
        rect(px, py, TILE, TILE, '#3d4270');
        rect(px + 2, py + 2, TILE - 4, TILE - 4, '#454a7c');
      }
    }
  }

  // Objets : tapis d'abord, puis le reste trié par profondeur
  const objs = [...MAP.objects].sort((a, b) => (a.kind === 'rug' ? -1 : 0) - (b.kind === 'rug' ? -1 : 0) || a.y + a.h - (b.y + b.h));
  for (const o of objs) drawObject(g, o);

  // Libellés des bureaux
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 9px "DM Sans", sans-serif';
  for (const z of MAP.zones) {
    if (z.type !== 'desk') continue;
    const tx = z.label.x * TILE, ty = z.label.y * TILE + 16;
    const w = g.measureText(z.name).width + 12;
    g.fillStyle = 'rgba(32,37,64,.55)';
    g.beginPath(); g.roundRect(tx - w / 2, ty - 7, w, 14, 7); g.fill();
    g.fillStyle = '#fff'; g.fillText(z.name, tx, ty + 0.5);
  }
  g.font = '700 11px "DM Sans", sans-serif';
  g.fillStyle = 'rgba(61,66,112,.55)';
  g.textAlign = 'center';
  g.fillText('BUREAU PRINCIPAL', 8 * TILE, 14 * TILE);
  g.fillStyle = 'rgba(122,81,52,.5)';
  g.fillText('SALLE DE CLASSE', 68.5 * TILE, 19 * TILE);
  return c;
}

function drawObject(g, o) {
  const px = o.x * TILE, py = o.y * TILE, w = o.w * TILE, h = o.h * TILE;
  const rect = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  const rr = (x, y, ww, hh, rad, col) => { g.fillStyle = col; g.beginPath(); g.roundRect(x, y, ww, hh, rad); g.fill(); };
  switch (o.kind) {
    case 'rug':
      rr(px + 2, py + 2, w - 4, h - 4, 10, o.color);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect(px + 6, py + 6, w - 12, h - 12, 7); g.stroke();
      break;
    case 'table': {
      rr(px + 1, py + 4, w - 2, h - 2, 6, '#7a5134');
      rr(px + 1, py + 1, w - 2, h - 6, 6, '#b5824f');
      rr(px + 4, py + 4, w - 8, 3, 2, 'rgba(255,255,255,.18)');
      // 4 ordinateurs portables
      for (const [lx, ly, side] of [[4, 10, 1], [4, 38, 1], [42, 10, -1], [42, 38, -1]]) {
        rr(px + lx + (side > 0 ? 0 : 10), py + ly, 8, 12, 1, '#2b2f45');
        rr(px + lx + (side > 0 ? 7 : 1), py + ly - 2, 10, 16, 1, '#cfd3e3');
        rect(px + lx + (side > 0 ? 9 : 3), py + ly, 6, 12, '#7fd1ff');
      }
      break;
    }
    case 'chair': {
      const seat = o.color, back = shade(o.color, -40);
      rr(px + 7, py + 9, 18, 16, 4, seat);
      rect(px + 9, py + 25, 2, 5, '#444'); rect(px + 21, py + 25, 2, 5, '#444');
      if (o.dir === 'right') rr(px + 4, py + 4, 5, 22, 2, back);
      if (o.dir === 'left') rr(px + 23, py + 4, 5, 22, 2, back);
      if (o.dir === 'up') rr(px + 6, py + 21, 20, 6, 2, back);
      break;
    }
    case 'plant':
      g.fillStyle = '#c56a3c';
      g.beginPath(); g.moveTo(px + 9, py + 20); g.lineTo(px + 23, py + 20); g.lineTo(px + 21, py + 31); g.lineTo(px + 11, py + 31); g.fill();
      rect(px + 8, py + 19, 16, 3, '#a8562e');
      for (const [cx, cy, rad, col] of [[16, 12, 9, '#2f8f46'], [10, 14, 6, '#3fa95a'], [22, 14, 6, '#3fa95a'], [16, 7, 6, '#55c06e']]) {
        g.fillStyle = col; g.beginPath(); g.arc(px + cx, py + cy, rad, 0, Math.PI * 2); g.fill();
      }
      break;
    case 'whiteboard':
      rr(px + 4, py + 9, w - 8, 18, 2, '#9aa0b8');
      rect(px + 6, py + 11, w - 12, 14, '#ffffff');
      g.strokeStyle = '#4f7fd1'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(px + 12, py + 20); g.lineTo(px + 24, py + 15); g.lineTo(px + 34, py + 19); g.lineTo(px + 46, py + 14); g.stroke();
      g.strokeStyle = '#ef476f';
      g.beginPath(); g.moveTo(px + 60, py + 15); g.lineTo(px + 100, py + 15); g.moveTo(px + 60, py + 20); g.lineTo(px + 90, py + 20); g.stroke();
      break;
    case 'screen':
      rr(px + 2, py + 6, w - 4, 24, 3, '#1d2036');
      rect(px + 5, py + 9, w - 10, 18, '#2f6fde');
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.beginPath(); g.moveTo(px + 5, py + 9); g.lineTo(px + 80, py + 9); g.lineTo(px + 40, py + 27); g.lineTo(px + 5, py + 27); g.fill();
      break;
    case 'lectern':
      rr(px + 14, py + 4, w - 28, 26, 3, '#7a5134');
      rect(px + 16, py + 4, w - 32, 5, '#b5824f');
      break;
    case 'sofa': {
      const d = shade(o.color, -35);
      rr(px + 2, py + 6, w - 4, 24, 6, o.color);
      if (o.dir === 'down') rr(px + 2, py + 2, w - 4, 10, 5, d);
      else rr(px + 2, py + 22, w - 4, 9, 5, d);
      rr(px, py + 6, 7, 22, 3, d); rr(px + w - 7, py + 6, 7, 22, 3, d);
      break;
    }
    case 'ctable':
      rr(px + 4, py + 8, w - 8, 18, 5, '#7a5134');
      rr(px + 4, py + 6, w - 8, 16, 5, '#a8764a');
      rr(px + 26, py + 10, 8, 6, 2, '#fff');
      break;
    case 'bench':
      rr(px + 2, py + 10, w - 4, 14, 4, o.color);
      rr(px + 2, py + 8, w - 4, 6, 3, shade(o.color, 25));
      break;
    case 'shelf':
      rr(px + 2, py + 2, w - 4, 28, 3, '#7a5134');
      for (let k = 0; k < 2; k++) {
        rect(px + 4, py + 4 + k * 13, w - 8, 11, '#5a3a24');
        const cols = ['#ef476f', '#ffd166', '#118ab2', '#06d6a0', '#9b5de5', '#f78c6b'];
        for (let b = 0; b < 9; b++) rect(px + 6 + b * 6, py + 6 + k * 13 + (b % 3), 4, 9 - (b % 3), cols[(b + k * 2) % cols.length]);
      }
      break;
    case 'blackboard':
      rr(px + 2, py + 6, w - 4, 23, 2, '#7a5134');
      rect(px + 5, py + 9, w - 10, 17, '#2f5d46');
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(px + 14, py + 14); g.lineTo(px + 70, py + 14);
      g.moveTo(px + 14, py + 19); g.lineTo(px + 52, py + 19);
      g.moveTo(px + 150, py + 21); g.lineTo(px + 165, py + 12); g.lineTo(px + 180, py + 21);
      g.stroke();
      g.fillStyle = '#fff'; g.font = '700 7px "DM Sans", sans-serif'; g.textAlign = 'left';
      g.fillText('a² + b² = c²', px + 90, py + 20);
      rect(px + 20, py + 26, 10, 2, '#f4f1e8');
      break;
    case 'tdesk':
      rr(px + 1, py + 4, w - 2, 26, 4, '#6b4529');
      rr(px + 1, py + 2, w - 2, 20, 4, '#a8764a');
      rr(px + 10, py + 6, 18, 12, 1, '#cfd3e3');
      rect(px + 12, py + 8, 14, 8, '#7fd1ff');
      rr(px + 60, py + 8, 14, 10, 2, '#f4f1e8');
      g.fillStyle = '#ef476f'; g.beginPath(); g.arc(px + 48, py + 12, 4, 0, Math.PI * 2); g.fill();
      break;
    case 'sdesk':
      rr(px + 2, py + 8, w - 4, 20, 3, '#7a5134');
      rr(px + 2, py + 6, w - 4, 16, 3, '#c49460');
      rect(px + 8, py + 10, 12, 8, '#f4f1e8');
      rect(px + 40, py + 10, 12, 8, '#f4f1e8');
      rect(px + 22, py + 12, 8, 2, '#4f7fd1');
      break;
    case 'cooler':
      rr(px + 9, py + 10, 14, 20, 3, '#e8ecf5');
      rr(px + 10, py + 1, 12, 11, 4, '#7fd1ff');
      rect(px + 13, py + 16, 6, 3, '#4f7fd1');
      break;
  }
}

// ============================================================
// État global
// ============================================================
const users = new Map(); // id -> utilisateur (moi inclus)
let myId = null;
let me = null;
let micStream = null, micTrack = null, screenStream = null, screenTrack = null;
let micOn = false, pttHeld = false, sharing = false;
let audioCtx = null;
let localAnalyser = null;
let path = null;
let nextStepAt = 0;
const keys = new Set();
let dashing = false;

const prefs = (() => { try { return JSON.parse(localStorage.getItem('rt-prefs')) || {}; } catch { return {}; } })();
const look = {
  shirt: prefs.look?.shirt || PALETTE.shirt[Math.floor(Math.random() * PALETTE.shirt.length)],
  hair: prefs.look?.hair || PALETTE.hair[0],
  skin: prefs.look?.skin || PALETTE.skin[1],
};

// ============================================================
// Écran d'accueil
// ============================================================
const nameInput = $('#nameInput');
nameInput.value = prefs.name || '';
function drawPreview() {
  const c = $('#preview'), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.save(); g.scale(3, 3); drawAvatar(g, look, 16, 37, 'down'); g.restore();
}
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
    };
    box.append(b);
  }
});
drawPreview();
document.fonts?.ready.then(drawPreview);

$('#joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  try { localStorage.setItem('rt-prefs', JSON.stringify({ name, look })); } catch {}
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await initMic();
  connect(name);
});

async function initMic() {
  if (micTrack) return true;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    micTrack = micStream.getAudioTracks()[0];
    localAnalyser = makeAnalyser(micStream);
    return true;
  } catch (err) {
    console.warn('Micro indisponible', err);
    toast('Micro indisponible : vous pourrez écouter mais pas parler.');
    return false;
  }
}

function makeAnalyser(stream) {
  if (!audioCtx) return null;
  try {
    const src = audioCtx.createMediaStreamSource(stream);
    const an = audioCtx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    return { an, buf: new Uint8Array(an.fftSize), level: 0 };
  } catch { return null; }
}
function sampleLevel(a) {
  if (!a) return 0;
  a.an.getByteTimeDomainData(a.buf);
  let sum = 0;
  for (const v of a.buf) { const d = (v - 128) / 128; sum += d * d; }
  a.level = Math.sqrt(sum / a.buf.length);
  return a.level;
}

// ============================================================
// Mise en relation pair-à-pair, sans serveur
// (Trystero : la signalisation WebRTC passe par des relais Nostr publics)
// ============================================================
const APP_ID = 'remote-town-c4software';
const ROOM_ID = new URLSearchParams(location.search).get('room') || 'lobby';
const COLOR = /^#[0-9a-f]{6}$/i;
const DIR_NAMES = ['up', 'down', 'left', 'right'];
let room = null;
let net = null;
let joinedAt = 0;

const profile = () => ({ name: me.name, look: me.look, x: me.x, y: me.y, dir: me.dir, mic: micOn, ptt: pttHeld, sharing });

function connect(name) {
  const [x, y] = MAP.spawns[Math.floor(Math.random() * MAP.spawns.length)];
  myId = selfId;
  me = {
    id: myId, isMe: true, name, look: { ...look }, x, y, rx: x, ry: y, dir: 'down',
    zone: zoneAt(x, y), mic: false, ptt: false, sharing: false, walk: 0, level: 0,
  };
  users.set(myId, me);
  joinedAt = performance.now();

  room = joinRoom({ appId: APP_ID }, ROOM_ID);
  net = {
    hello: room.makeAction('hello', { onMessage: onHello }),
    move: room.makeAction('move', { onMessage: onRemoteMove }),
    state: room.makeAction('state', { onMessage: onRemoteState }),
    chat: room.makeAction('chat', { onMessage: (d, { peerId }) => users.has(peerId) && onChat(d?.channel, d?.msg, peerId) }),
    history: room.makeAction('history', { kind: 'request', onRequest: (d) => chatStore.get(String(d?.channel)) || [] }),
  };
  room.onPeerJoin = (id) => net.hello.send(profile(), { target: id }).catch(() => {});
  room.onPeerLeave = onPeerLeave;
  room.onPeerStream = onPeerStream;
  addEventListener('pagehide', () => room.leave());
  startApp();
}

function broadcast(action, data) { net?.[action].send(data).catch(() => {}); }

// Applique une position reçue ; refuse les cases bloquées ou hors carte
function setPos(u, d) {
  const x = d?.x | 0, y = d?.y | 0;
  if (isBlocked(x, y)) return false;
  u.x = x; u.y = y;
  u.dir = DIR_NAMES.includes(d.dir) ? d.dir : u.dir || 'down';
  u.zone = zoneAt(x, y);
  return true;
}

function onHello(d, { peerId }) {
  const known = users.get(peerId);
  const u = known || { id: peerId, walk: 0, level: 0 };
  u.name = String(d?.name || '').trim().slice(0, 24) || 'Invité';
  u.look = {
    shirt: COLOR.test(d?.look?.shirt) ? d.look.shirt : '#6c63ff',
    hair: COLOR.test(d?.look?.hair) ? d.look.hair : '#3b2a20',
    skin: COLOR.test(d?.look?.skin) ? d.look.skin : '#f1c7a4',
  };
  if (!setPos(u, d) && !known) setPos(u, { x: MAP.spawns[0][0], y: MAP.spawns[0][1] });
  u.rx = u.x; u.ry = u.y;
  Object.assign(u, { mic: !!d?.mic, ptt: !!d?.ptt, sharing: !!d?.sharing });
  users.set(peerId, u);
  if (!known) {
    if (performance.now() - joinedAt > 5000) toast(`${u.name} a rejoint l'espace`);
    if (!globalHistoryLoaded) { globalHistoryLoaded = true; fetchHistory('global', [peerId]); }
    if (u.zone === me.zone) fetchHistory(me.zone, [peerId]);
  }
  renderPeople(); updateRouting();
}

function onRemoteMove(d, { peerId }) {
  const u = users.get(peerId);
  if (!u) return;
  const prevZone = u.zone;
  if (!setPos(u, d)) return;
  if (Math.abs(u.rx - u.x) > 3 || Math.abs(u.ry - u.y) > 3) { u.rx = u.x; u.ry = u.y; }
  updateRouting();
  if (u.zone !== prevZone) renderPeople();
}

function onRemoteState(d, { peerId }) {
  const u = users.get(peerId);
  if (!u) return;
  Object.assign(u, { mic: !!d?.mic, ptt: !!d?.ptt, sharing: !!d?.sharing });
  updateRouting(); renderPeople();
}

function onPeerLeave(id) {
  const u = users.get(id);
  users.delete(id);
  closeLink(id);
  if (u) toast(`${u.name} est parti·e`);
  renderPeople(); updateRouting();
}

function startApp() {
  $('#join').hidden = true;
  $('#app').hidden = false;
  $('#meName').textContent = me.name;
  drawAvatar($('#meAvatar').getContext('2d'), me.look, 16, 37, 'down');
  chat.zoneId = me.zone;
  if (innerWidth < 900) $('#sidebar').classList.add('closed');
  mapCanvas = renderMap();
  document.fonts?.ready.then(() => { mapCanvas = renderMap(); });
  onZoneChange(true);
  renderChat(); renderPeople(); updateUI();
  requestAnimationFrame(loop);
  setTimeout(() => {
    if (users.size === 1) toast('Personne pour l\'instant : partagez le lien pour inviter vos collègues.');
  }, 8000);
}

// ============================================================
// Médias : pour chaque pair, une copie de notre micro / écran
// qu'on active ou coupe selon les règles de zone (sans renégocier)
// ============================================================
const links = new Map(); // id du pair -> { micOut, screenOut, audioEl, analyser, videoStream }
const link = (id) => { if (!links.has(id)) links.set(id, {}); return links.get(id); };

function onPeerStream(stream, peerId) {
  const L = link(peerId);
  if (stream.getAudioTracks().length) {
    L.audioEl?.remove();
    const el = document.createElement('audio');
    el.autoplay = true; el.srcObject = stream;
    $('#audios').append(el);
    el.play().catch(() => {});
    L.audioEl = el;
    L.analyser = makeAnalyser(stream);
  } else {
    L.videoStream = stream;
    renderVideos();
  }
}

function closeLink(id) {
  const L = links.get(id);
  if (!L) return;
  links.delete(id);
  L.audioEl?.remove();
  L.micOut?.getTracks().forEach((t) => t.stop());
  L.screenOut?.getTracks().forEach((t) => t.stop());
  renderVideos();
}

function addOut(track, kind, peerId) {
  const out = new MediaStream([track]);
  Promise.allSettled(room.addStream(out, { target: peerId, metadata: { kind } }));
  return out;
}

// Choisit, pour un pair, si on lui envoie notre micro / écran
function applySenders(u) {
  const L = link(u.id);
  const a = !!micTrack && sendsAudio(me, u);
  if (a && !L.micOut) L.micOut = addOut(micTrack.clone(), 'mic', u.id);
  if (L.micOut) L.micOut.getTracks()[0].enabled = a;
  const v = !!screenTrack && sendsVideo(me, u);
  if (v && !L.screenOut) {
    const t = screenTrack.clone();
    t.contentHint = 'detail';
    L.screenOut = addOut(t, 'screen', u.id);
  }
  if (L.screenOut) L.screenOut.getTracks()[0].enabled = v;
}

function updateRouting() {
  if (!me) return;
  for (const u of users.values()) if (!u.isMe) applySenders(u);
  renderVideos();
  updateUI();
}

// ============================================================
// Micro, N pour parler, partage d'écran
// ============================================================
function pushState() {
  me.mic = micOn; me.ptt = pttHeld; me.sharing = sharing;
  broadcast('state', { mic: micOn, ptt: pttHeld, sharing });
  updateRouting();
  renderPeople();
}

async function toggleMic() {
  if (!micTrack && !(await initMic())) return;
  micOn = !micOn;
  if (micOn && !ROOM_TYPES.includes(zoneType(me.zone))) toast('Micro activé : il s\'ouvrira dans un bureau ou la classe. Ici, maintenez N pour parler.');
  pushState();
}

async function setPtt(on) {
  if (on === pttHeld) return;
  if (on && !micTrack && !(await initMic())) return;
  pttHeld = on;
  pushState();
}

async function toggleShare() {
  if (sharing) return stopShare();
  if (!canShareIn(me.zone)) return toast('Le partage d\'écran est disponible dans les bureaux, la classe et le bureau principal.');
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
  } catch { return; }
  screenTrack = screenStream.getVideoTracks()[0];
  screenTrack.contentHint = 'detail';
  screenTrack.onended = stopShare;
  sharing = true;
  pushState();
}

function stopShare() {
  if (!sharing) return;
  screenStream?.getTracks().forEach((t) => t.stop());
  screenStream = screenTrack = null;
  for (const [id, L] of links) {
    if (!L.screenOut) continue;
    room.removeStream(L.screenOut, { target: id });
    L.screenOut.getTracks().forEach((t) => t.stop());
    L.screenOut = null;
  }
  sharing = false;
  pushState();
}

// ============================================================
// Vidéos des partages d'écran
// ============================================================
let focusKey = null;
function renderVideos() {
  if (!me) return;
  const box = $('#videos');
  const want = new Map();
  if (sharing && screenStream) want.set('me', { stream: screenStream, name: 'Votre écran' });
  for (const u of users.values()) {
    if (u.id === myId || !sendsVideo(u, me)) continue;
    const L = links.get(u.id);
    if (L?.videoStream) want.set(String(u.id), { stream: L.videoStream, name: `Écran de ${u.name}` });
  }
  for (const el of [...box.children]) if (!want.has(el.dataset.key)) el.remove();
  for (const [key, v] of want) {
    let el = box.querySelector(`[data-key="${key}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'vtile'; el.dataset.key = key;
      const video = document.createElement('video');
      video.autoplay = true; video.playsInline = true; video.muted = true;
      const label = document.createElement('span');
      el.append(video, label);
      el.onclick = () => openFocus(key);
      box.append(el);
    }
    const video = el.querySelector('video');
    if (video.srcObject !== v.stream) video.srcObject = v.stream;
    el.querySelector('span').textContent = v.name;
  }
  if (focusKey && !want.has(focusKey)) closeFocus();
  else if (focusKey) {
    const v = want.get(focusKey);
    const fv = $('#focus video');
    if (fv.srcObject !== v.stream) fv.srcObject = v.stream;
  }
}
function openFocus(key) {
  const tile = $(`#videos [data-key="${key}"]`);
  if (!tile) return;
  focusKey = key;
  $('#focus video').srcObject = tile.querySelector('video').srcObject;
  $('#focus .focus-name').textContent = tile.querySelector('span').textContent;
  $('#focus').hidden = false;
}
function closeFocus() {
  focusKey = null;
  $('#focus').hidden = true;
  $('#focus video').srcObject = null;
}
$('#focus button').onclick = closeFocus;

// ============================================================
// Chat (zone courante + tout le monde)
// ============================================================
const chat = { tab: 'zone', zoneId: null, unread: { zone: 0, global: 0 } };
// Messages gardés par canal ('global' ou id de zone). Sans serveur, l'historique
// d'une zone est demandé aux personnes déjà présentes quand on y entre.
const chatStore = new Map();
const KEEP = 300;
let globalHistoryLoaded = false;
let msgSeq = 0;
const chatList = (key) => chatStore.get(key === 'global' ? 'global' : chat.zoneId) || [];

function cleanMsg(m) {
  if (!m || typeof m.id !== 'string' || typeof m.text !== 'string') return null;
  const text = m.text.trim().slice(0, 1000);
  if (!text) return null;
  return {
    id: m.id.slice(0, 80), from: String(m.from).slice(0, 40), name: String(m.name || 'Invité').slice(0, 24),
    color: COLOR.test(m.color) ? m.color : '#6c63ff', text, ts: Number(m.ts) || Date.now(),
  };
}

function storeMsgs(channel, msgs) {
  const list = chatStore.get(channel) || [];
  const seen = new Set(list.map((m) => m.id));
  let added = 0;
  for (const raw of msgs) {
    const m = cleanMsg(raw);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id); list.push(m); added++;
  }
  if (!added) return 0;
  list.sort((a, b) => a.ts - b.ts);
  chatStore.set(channel, list.slice(-KEEP));
  return added;
}

async function fetchHistory(channel, targets) {
  if (!net || !targets.length) return;
  const results = await net.history.requestMany({ channel }, { targets, timeoutMs: 5000 }).catch(() => []);
  let added = 0;
  for (const r of results) if (r.status === 'fulfilled' && Array.isArray(r.value)) added += storeMsgs(channel, r.value);
  if (added) renderChat();
}

function sendChat(text) {
  const channel = chat.tab === 'global' ? 'global' : me.zone;
  const msg = { id: `${myId}-${(msgSeq++).toString(36)}`, from: myId, name: me.name, color: me.look.shirt, text, ts: Date.now() };
  if (channel === 'global') net.chat.send({ channel, msg }).catch(() => {});
  else {
    const target = [...users.values()].filter((u) => !u.isMe && u.zone === channel).map((u) => u.id);
    if (target.length) net.chat.send({ channel, msg }, { target }).catch(() => {});
  }
  onChat(channel, msg, myId);
}

function onChat(channel, msg, peerId) {
  if (typeof channel !== 'string' || !(channel === 'global' || MAP.zoneById[channel])) return;
  if (msg && peerId !== myId) msg = { ...msg, from: peerId }; // l'expéditeur réel, pas celui annoncé
  if (!storeMsgs(channel, [msg])) return;
  const key = channel === 'global' ? 'global' : channel === chat.zoneId ? 'zone' : null;
  if (!key) return;
  msg = chatList(key).find((m) => m.id === msg.id) || msg;
  const visible = !$('#sidebar').classList.contains('closed') && chat.tab === key && activePanel === 'chat';
  if (!visible && msg.from !== myId) chat.unread[key]++;
  if (!visible && msg.from !== myId && $('#sidebar').classList.contains('closed')) {
    toast(`💬 ${msg.name} (${key === 'global' ? 'tout le monde' : MAP.zoneById[channel].name}) : ${msg.text.slice(0, 80)}`);
  }
  renderChat();
}

const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function renderChat() {
  const box = $('#messages');
  const list = chatList(chat.tab);
  const sidebarOpen = !$('#sidebar').classList.contains('closed');
  if (sidebarOpen && activePanel === 'chat') chat.unread[chat.tab] = 0;
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.replaceChildren();
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'msg-empty';
    p.textContent = chat.tab === 'global'
      ? 'Aucun message. Ce canal est lu par tout le monde.'
      : `Aucun message dans « ${MAP.zoneById[chat.zoneId]?.name} ». Seules les personnes présentes ici le verront.`;
    box.append(p);
  }
  for (const m of list) {
    const row = document.createElement('div'); row.className = 'msg';
    const av = document.createElement('div'); av.className = 'msg-av';
    av.style.background = m.color; av.textContent = m.name.slice(0, 1).toUpperCase();
    const body = document.createElement('div'); body.className = 'msg-body';
    const head = document.createElement('div'); head.className = 'msg-head';
    const b = document.createElement('b'); b.textContent = m.from === myId ? `${m.name} (vous)` : m.name;
    const t = document.createElement('time'); t.textContent = fmtTime(m.ts);
    head.append(b, t);
    const text = document.createElement('div'); text.className = 'msg-text'; text.textContent = m.text;
    body.append(head, text);
    row.append(av, body);
    box.append(row);
  }
  if (stick || list.at(-1)?.from === myId) box.scrollTop = box.scrollHeight;
  $('#zoneChanName').textContent = MAP.zoneById[chat.zoneId]?.name || 'Zone';
  document.querySelectorAll('.chat-tabs button').forEach((btn) => {
    const k = btn.dataset.chan;
    btn.classList.toggle('active', k === chat.tab);
    const badge = btn.querySelector('.badge');
    badge.hidden = !chat.unread[k];
    badge.textContent = chat.unread[k];
  });
  const total = chat.unread.zone + chat.unread.global;
  const cb = $('#chatBtn .badge');
  cb.hidden = !total || (sidebarOpen && activePanel === 'chat');
  cb.textContent = total;
}
document.querySelectorAll('.chat-tabs button').forEach((btn) => {
  btn.onclick = () => { chat.tab = btn.dataset.chan; renderChat(); $('#chatInput').focus(); };
});
$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text) return;
  sendChat(text);
  input.value = '';
});

// ============================================================
// Panneau latéral & participants
// ============================================================
let activePanel = 'chat';
function showPanel(name) {
  const sb = $('#sidebar');
  if (!sb.classList.contains('closed') && activePanel === name) { sb.classList.add('closed'); renderChat(); return; }
  sb.classList.remove('closed');
  activePanel = name;
  document.querySelectorAll('.side-tabs [data-panel]').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.dataset.panel !== name));
  renderChat();
  if (name === 'chat') $('#chatInput').focus();
}
document.querySelectorAll('.side-tabs [data-panel]').forEach((b) => (b.onclick = () => showPanel(b.dataset.panel)));
$('.side-close').onclick = () => { $('#sidebar').classList.add('closed'); renderChat(); };
$('#chatBtn').onclick = () => showPanel('chat');
$('#peopleBtn').onclick = () => showPanel('people');

const ICON_MIC = '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/></svg>';
const ICON_SCREEN = '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';
function isTransmitting(u) {
  return u.ptt || (u.mic && ROOM_TYPES.includes(zoneType(u.zone)));
}
function renderPeople() {
  if (!me) return;
  const ul = $('#people');
  ul.replaceChildren();
  const list = [...users.values()].sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : a.name.localeCompare(b.name)));
  for (const u of list) {
    const li = document.createElement('li');
    const c = document.createElement('canvas'); c.width = 32; c.height = 40; c.style.width = '24px'; c.style.height = '30px';
    drawAvatar(c.getContext('2d'), u.look, 16, 37, 'down');
    const info = document.createElement('div'); info.className = 'p-info';
    const n = document.createElement('div'); n.className = 'p-name'; n.textContent = u.isMe ? `${u.name} (vous)` : u.name;
    const z = document.createElement('div'); z.className = 'p-zone'; z.textContent = MAP.zoneById[u.zone]?.name || '';
    info.append(n, z);
    const icons = document.createElement('div'); icons.className = 'p-icons';
    icons.innerHTML = (isTransmitting(u) ? ICON_MIC : '') + (u.sharing ? ICON_SCREEN : '');
    li.append(c, info, icons);
    ul.append(li);
  }
  $('#peopleCount').textContent = users.size;
}

// ============================================================
// Interface (barre du bas, zone, annonces)
// ============================================================
let lastZoneToast = null;
function onZoneChange(initial = false) {
  const z = MAP.zoneById[me.zone];
  chat.zoneId = me.zone;
  chat.unread.zone = 0;
  if (!initial) fetchHistory(me.zone, [...users.values()].filter((u) => !u.isMe && u.zone === me.zone).map((u) => u.id));
  if (sharing && !canShareIn(me.zone)) stopShare();
  const tag = $('#zoneTag');
  tag.className = z.type;
  const hint = z.type === 'desk' ? 'micro & écran partagés avec le bureau'
    : z.type === 'class' ? 'micro & écran partagés avec toute la classe'
    : z.type === 'main' ? 'micro & écran diffusés à tout le monde'
    : 'maintenez N pour parler à proximité';
  tag.innerHTML = '<span class="dot"></span>';
  tag.append(z.name, Object.assign(document.createElement('small'), { textContent: `· ${hint}` }));
  $('#meZone').textContent = z.name;
  if (!initial && lastZoneToast !== me.zone && z.type !== 'open') toast(`Vous entrez dans ${z.name}`);
  lastZoneToast = me.zone;
  renderChat();
}

function updateUI() {
  if (!me) return;
  const zt = zoneType(me.zone);
  const mic = $('#micBtn');
  mic.classList.toggle('active', micOn && zt !== 'open');
  mic.classList.toggle('standby', micOn && zt === 'open');
  mic.title = !micOn ? 'Micro coupé (M)' : zt === 'open' ? 'Micro en attente : actif dans les bureaux (M)' : 'Micro ouvert (M)';
  const share = $('#shareBtn');
  share.disabled = !canShareIn(me.zone) && !sharing;
  share.classList.toggle('active', sharing);
  share.title = sharing ? 'Arrêter le partage' : canShareIn(me.zone) ? "Partager l'écran" : "Partage d'écran : dans un bureau, la classe ou le bureau principal";
  $('#pttBtn').classList.toggle('active', pttHeld);

  const speakers = [...users.values()].filter((u) => u.mic && zoneType(u.zone) === 'main');
  const bc = $('#broadcast');
  bc.hidden = !speakers.length;
  if (speakers.length) {
    const names = speakers.map((u) => (u.isMe ? 'Vous' : u.name)).join(', ');
    bc.textContent = `📢 ${names} — en direct du bureau principal`;
  }
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3500);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}

$('#micBtn').onclick = toggleMic;
$('#shareBtn').onclick = toggleShare;
const pttBtn = $('#pttBtn');
pttBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); pttBtn.setPointerCapture(e.pointerId); setPtt(true); });
pttBtn.addEventListener('pointerup', () => setPtt(false));
pttBtn.addEventListener('pointercancel', () => setPtt(false));
$('.help-close').onclick = () => { $('#help').hidden = true; try { localStorage.setItem('rt-help', '1'); } catch {} };
try { if (localStorage.getItem('rt-help')) $('#help').hidden = true; } catch {}

// ============================================================
// Clavier, souris, déplacements
// ============================================================
const DIRS = {
  // e.code = position physique : WASD en QWERTY = ZQSD en AZERTY
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const typing = () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

addEventListener('keydown', (e) => {
  if (e.key === 'Shift') dashing = true;
  if (!me) return;
  if (e.key === 'Escape') {
    if (focusKey) closeFocus();
    document.activeElement?.blur();
    return;
  }
  if (typing()) return;
  if (e.code === 'Enter') { e.preventDefault(); if ($('#sidebar').classList.contains('closed') || activePanel !== 'chat') showPanel('chat'); else $('#chatInput').focus(); return; }
  if (e.code === 'KeyN') { e.preventDefault(); if (!e.repeat) setPtt(true); return; }
  if (e.key.toLowerCase() === 'm' && !e.repeat) { toggleMic(); return; }
  if (DIRS[e.code]) { e.preventDefault(); keys.add(DIRS[e.code]); path = null; }
});
addEventListener('keyup', (e) => {
  if (e.key === 'Shift') dashing = false;
  if (e.code === 'KeyN') setPtt(false);
  if (DIRS[e.code]) keys.delete(DIRS[e.code]);
});
addEventListener('blur', () => { keys.clear(); dashing = false; if (me) setPtt(false); });
$('#chatInput').addEventListener('focus', () => keys.clear());

function heldDir() {
  const order = ['up', 'down', 'left', 'right'];
  return [...keys].reverse().find((d) => order.includes(d));
}

function bfs(sx, sy, tx, ty) {
  if (isBlocked(tx, ty)) return null;
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  const start = sy * MAP_W + sx, goal = ty * MAP_W + tx;
  prev[start] = start;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    if (cur === goal) break;
    const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
    for (const [dx, dy] of Object.values(DELTA)) {
      const nx = cx + dx, ny = cy + dy;
      if (isBlocked(nx, ny)) continue;
      const k = ny * MAP_W + nx;
      if (prev[k] !== -1) continue;
      prev[k] = cur; q.push(k);
    }
  }
  if (prev[goal] === -1) return null;
  const out = [];
  for (let k = goal; k !== start; k = prev[k]) out.unshift([k % MAP_W, (k / MAP_W) | 0]);
  return out;
}

const canvas = $('#world');
const ctx = canvas.getContext('2d');
let mapCanvas = null;
let cam = { x: 0, y: 0, zoom: 2 };

canvas.addEventListener('click', (e) => {
  if (!me) return;
  document.activeElement?.blur();
  const tx = Math.floor((e.clientX / cam.zoom + cam.x) / TILE);
  const ty = Math.floor((e.clientY / cam.zoom + cam.y) / TILE);
  path = bfs(me.x, me.y, tx, ty);
});

function onMyMove() {
  const prevZone = me.zone;
  me.zone = zoneAt(me.x, me.y);
  if (me.zone !== prevZone) onZoneChange();
  updateRouting();
}

function step(now) {
  if (now < nextStepAt) return;
  let dir = typing() ? null : heldDir();
  if (dir) path = null;
  else if (path?.length) {
    const [nx, ny] = path[0];
    dir = nx > me.x ? 'right' : nx < me.x ? 'left' : ny > me.y ? 'down' : 'up';
  }
  if (!dir) return;
  const [dx, dy] = DELTA[dir];
  const nx = me.x + dx, ny = me.y + dy;
  const turned = me.dir !== dir;
  me.dir = dir;
  if (isBlocked(nx, ny)) {
    path = null;
    if (turned) broadcast('move', { x: me.x, y: me.y, dir });
    return;
  }
  me.x = nx; me.y = ny;
  if (path) path.shift();
  nextStepAt = now + (dashing ? DASH_MS : STEP_MS);
  broadcast('move', { x: nx, y: ny, dir });
  onMyMove();
}

// ============================================================
// Boucle de rendu
// ============================================================
let lastT = performance.now();
let lastLevels = 0;
function loop(now) {
  const dt = Math.min(100, now - lastT);
  lastT = now;
  step(now);
  for (const u of users.values()) {
    const moving = u.rx !== u.x || u.ry !== u.y;
    // Les autres peuvent sprinter : on accélère l'interpolation quand on prend du retard
    const lag = Math.max(Math.abs(u.x - u.rx), Math.abs(u.y - u.ry));
    const speed = (dt / STEP_MS) * (u.isMe ? (dashing ? STEP_MS / DASH_MS : 1) : Math.max(1, lag * 1.8));
    u.rx += Math.sign(u.x - u.rx) * Math.min(speed, Math.abs(u.x - u.rx));
    u.ry += Math.sign(u.y - u.ry) * Math.min(speed, Math.abs(u.y - u.ry));
    u.walk = moving ? u.walk + dt : 0;
  }
  if (now - lastLevels > 80) {
    lastLevels = now;
    me.level = isTransmitting(me) ? sampleLevel(localAnalyser) : 0;
    for (const [id, L] of links) {
      const u = users.get(id);
      if (u) u.level = sendsAudio(u, me) ? sampleLevel(L.analyser) : 0;
    }
  }
  draw();
  requestAnimationFrame(loop);
}

function draw() {
  const dpr = devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const zoom = Math.max(1, Math.min(2.5, Math.round((H / (13 * TILE)) * 4) / 4));
  const vw = W / zoom, vh = H / zoom;
  const fx = me.rx * TILE + TILE / 2, fy = me.ry * TILE + TILE / 2;
  cam = {
    zoom,
    x: WORLD_W <= vw ? (WORLD_W - vw) / 2 : Math.max(0, Math.min(WORLD_W - vw, fx - vw / 2)),
    y: WORLD_H <= vh ? (WORLD_H - vh) / 2 : Math.max(0, Math.min(WORLD_H - vh, fy - vh / 2)),
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#191d33';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -cam.x * zoom * dpr, -cam.y * zoom * dpr);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mapCanvas, 0, 0, WORLD_W, WORLD_H);

  // Assombrit tout ce qui est hors de la zone privée courante
  const z = MAP.zoneById[me.zone];
  if (z && z.type !== 'open') {
    ctx.fillStyle = 'rgba(20,23,45,.45)';
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.rect(z.x * TILE, (z.y - 1) * TILE, z.w * TILE, (z.h + 1) * TILE);
    ctx.fill('evenodd');
  }

  // Cercle de proximité quand N est maintenu
  if (pttHeld) {
    ctx.fillStyle = 'rgba(6,214,160,.12)';
    ctx.strokeStyle = 'rgba(6,214,160,.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(fx, fy, (PROX_RADIUS + 0.5) * TILE, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Chemin cliqué
  if (path?.length) {
    const [tx, ty] = path.at(-1);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.strokeRect(tx * TILE + 4, ty * TILE + 4, TILE - 8, TILE - 8);
  }

  const list = [...users.values()].sort((a, b) => a.ry - b.ry || (a.isMe ? 1 : -1));
  for (const u of list) {
    const cx = u.rx * TILE + TILE / 2, by = u.ry * TILE + TILE - 2;
    const moving = u.walk > 0;
    const chair = !moving ? chairAt(u.x, u.y) : null;
    const dir = chair ? chair.dir : u.dir;
    const frame = moving ? 1 + (Math.floor(u.walk / 120) % 2) : 0;
    if (u.level > 0.04) {
      ctx.fillStyle = 'rgba(6,214,160,.35)';
      ctx.beginPath(); ctx.ellipse(cx, by - 1, 13 + u.level * 20, 5 + u.level * 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    drawAvatar(ctx, u.look, cx, by + (chair ? -4 : 0), dir, frame, !!chair);
    if (u.level > 0.04) {
      ctx.strokeStyle = '#06d6a0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(cx - 9, by - 33 + (chair ? 0 : 0), 18, 16, 4); ctx.stroke();
    }
  }

  // Étiquettes (nom) en coordonnées écran, nettes à tout zoom
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = '600 12px "DM Sans", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const u of list) {
    const sx = (u.rx * TILE + TILE / 2 - cam.x) * zoom;
    const sy = (u.ry * TILE - cam.y) * zoom - 6 * zoom;
    const tx = isTransmitting(u);
    const inRange = pttHeld && !u.isMe && sendsAudio(me, u);
    const label = u.name;
    const tw = ctx.measureText(label).width;
    const extra = (tx ? 14 : 0) + (u.sharing ? 14 : 0);
    const w = tw + 16 + extra, h = 20;
    ctx.fillStyle = inRange ? 'rgba(6,214,160,.95)' : 'rgba(32,37,64,.88)';
    ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - h, w, h, 10); ctx.fill();
    let ix = sx - w / 2 + 10;
    if (tx) {
      ctx.fillStyle = u.level > 0.04 ? '#06d6a0' : '#8ef0d3';
      ctx.beginPath(); ctx.arc(ix + 2, sy - h / 2, 4, 0, Math.PI * 2); ctx.fill();
      ix += 14;
    }
    if (u.sharing) {
      ctx.fillStyle = '#ffcf5c';
      ctx.fillRect(ix - 3, sy - h / 2 - 4, 10, 7);
      ix += 14;
    }
    ctx.fillStyle = inRange ? '#10213a' : '#fff';
    ctx.fillText(label, ix + tw / 2 - 2, sy - h / 2 + 0.5);
  }
}

// Accès de débogage : ouvrir la page avec ?debug
if (new URLSearchParams(location.search).has('debug')) {
  window.rt = { users, links, get room() { return room; }, get me() { return me; }, walkTo: (x, y) => (path = bfs(me.x, me.y, x, y)) };
}
