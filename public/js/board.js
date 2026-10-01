// Tableau blanc de la salle de classe et du bureau principal.
// Il s'ouvre au bureau du prof ; la personne qui l'ouvre dessine, il s'affiche chez tous
// ceux de la pièce (grand format ou PiP). Chacun garde l'état des tableaux ; le
// propriétaire l'envoie aux nouveaux venus.
import { $, ofName, toast } from './dom.js';
import { updateUI } from './hud.js';
import { broadcast } from './net.js';
import { S, users } from './state.js';
import { closeFocus } from './videos.js';
import { zoneType } from './world.js';

const BOARD_W = 1600, BOARD_H = 900;
const BOARD_COLORS = ['#1d1e30', '#e63946', '#118ab2', '#2a9d8f', '#f4a261'];
const BOARD_SIZES = [4, 9, 18];
const ERASER = { c: '#ffffff', w: 40 };
export const boards = new Map(); // zone -> { owner, strokes: Map(id -> { c, w, pts: [x, y, x, y…] }) }
export const boardZone = (z) => ['class', 'main'].includes(zoneType(z));
export const boardPip = new Set(); // pièces dont on regarde le tableau en mode PiP (petite fenêtre)
// Bureau du prof : seul endroit d'où l'on peut ouvrir le tableau de la pièce
const TEACHER_AREAS = { class: { x0: 66, x1: 70, y0: 1, y1: 2 }, main: { x0: 6, x1: 9, y0: 1, y1: 1 } };
export const atTeacherDesk = () => {
  const a = S.me && TEACHER_AREAS[S.me.zone];
  return !!a && S.me.x >= a.x0 && S.me.x <= a.x1 && S.me.y >= a.y0 && S.me.y <= a.y1;
};
let boardShown = null;            // pièce dont le tableau est affiché en grand
const pen = { c: BOARD_COLORS[0], w: BOARD_SIZES[1], eraser: false };
let drawingStroke = null, pendingPts = [], strokeSeq = 0, flushTimer = null, boardDrawQueued = false;
const bcanvas = $('#boardCanvas');
const bctx = bcanvas.getContext('2d');
const clampN = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

function addSeg(b, d) {
  const id = String(d?.id || '').slice(0, 80);
  if (!b || !id) return;
  let st = b.strokes.get(id);
  if (!st) {
    const c = BOARD_COLORS.includes(d.c) || d.c === ERASER.c ? d.c : BOARD_COLORS[0];
    st = { c, w: Math.max(1, Math.min(60, Number(d.w) || 4)), pts: [] };
    b.strokes.set(id, st);
  }
  const p = Array.isArray(d.p) ? d.p : [];
  for (let i = 0; i + 1 < p.length && st.pts.length < 40000; i += 2) st.pts.push(clampN(p[i], BOARD_W), clampN(p[i + 1], BOARD_H));
}

export function onBoardMsg(d, { peerId }) {
  const z = String(d?.z || '');
  if (!boardZone(z) || !users.has(peerId)) return;
  const b = boards.get(z);
  if (d.t === 'open') { boards.set(z, { owner: peerId, strokes: new Map() }); boardPip.delete(z); }
  else if (d.t === 'sync' && Array.isArray(d.strokes)) {
    const nb = { owner: peerId, strokes: new Map() };
    for (const st of d.strokes.slice(-5000)) addSeg(nb, st);
    boards.set(z, nb);
  } else if (b?.owner !== peerId) return; // seul le propriétaire modifie son tableau
  else if (d.t === 'seg') addSeg(b, d);
  else if (d.t === 'clear') b.strokes.clear();
  else if (d.t === 'close') boards.delete(z);
  refreshBoard();
}

export function syncBoardsTo(peerId) {
  for (const [z, b] of boards) {
    if (b.owner !== S.myId) continue;
    const strokes = [...b.strokes].map(([id, st]) => ({ id, c: st.c, w: st.w, p: st.pts }));
    S.net?.wb.send({ t: 'sync', z, strokes }, { target: peerId }).catch(() => {});
  }
}

export function dropBoardsOf(id) {
  let changed = false;
  for (const [z, b] of boards) if (b.owner === id) { boards.delete(z); changed = true; }
  if (changed) refreshBoard();
}

function openBoard() {
  if (!S.me || !boardZone(S.me.zone) || boards.has(S.me.zone)) return;
  if (!atTeacherDesk()) return toast('Le tableau blanc s\'ouvre depuis le bureau du prof.');
  boards.set(S.me.zone, { owner: S.myId, strokes: new Map() });
  broadcast('wb', { t: 'open', z: S.me.zone });
  boardPip.delete(S.me.zone);
  refreshBoard();
}

export function closeMyBoard(z) {
  if (boards.get(z)?.owner !== S.myId) return;
  boards.delete(z);
  broadcast('wb', { t: 'close', z });
  refreshBoard();
}

// Grand format ↔ mode PiP (petite fenêtre flottante, toujours à jour)
function togglePip() {
  if (!boardShown) return;
  if (boardPip.has(boardShown)) boardPip.delete(boardShown); else boardPip.add(boardShown);
  refreshBoard();
}

// Le tableau de ma pièce est toujours visible tant qu'il est ouvert : en grand ou en PiP
export function refreshBoard() {
  if (!S.me) return;
  const b = boards.get(S.me.zone);
  boardShown = b ? S.me.zone : null;
  const pip = !!b && boardPip.has(S.me.zone);
  const ov = $('#board');
  ov.hidden = !boardShown;
  ov.classList.toggle('pip', pip);
  $('#boardMin').textContent = pip ? 'Agrandir' : 'Mode PiP';
  if (b) {
    const owner = users.get(b.owner);
    const mine = b.owner === S.myId;
    $('#boardTitle').textContent = mine ? 'Votre tableau blanc' : `Tableau blanc ${ofName(owner?.name || '…')}`;
    ov.classList.toggle('owner', mine);
    renderPenTools();
  }
  if (boardShown) { if (S.focusKey && !pip) closeFocus(); fitBoard(); scheduleBoardDraw(); }
  updateUI();
}

function fitBoard() {
  const wrap = $('#boardWrap');
  const k = Math.min(wrap.clientWidth / BOARD_W, wrap.clientHeight / BOARD_H);
  bcanvas.style.width = `${Math.floor(BOARD_W * k)}px`;
  bcanvas.style.height = `${Math.floor(BOARD_H * k)}px`;
}

function scheduleBoardDraw() {
  if (boardDrawQueued) return;
  boardDrawQueued = true;
  requestAnimationFrame(() => { boardDrawQueued = false; drawBoard(); });
}

function drawBoard() {
  bctx.fillStyle = '#ffffff';
  bctx.fillRect(0, 0, BOARD_W, BOARD_H);
  const b = boards.get(boardShown);
  if (!b) return;
  bctx.lineCap = 'round'; bctx.lineJoin = 'round';
  for (const st of b.strokes.values()) {
    if (!st.pts.length) continue;
    bctx.strokeStyle = st.c; bctx.fillStyle = st.c; bctx.lineWidth = st.w;
    if (st.pts.length === 2) { bctx.beginPath(); bctx.arc(st.pts[0], st.pts[1], st.w / 2, 0, Math.PI * 2); bctx.fill(); continue; }
    bctx.beginPath();
    bctx.moveTo(st.pts[0], st.pts[1]);
    for (let i = 2; i < st.pts.length; i += 2) bctx.lineTo(st.pts[i], st.pts[i + 1]);
    bctx.stroke();
  }
}

// --- Dessin (propriétaire uniquement) ---
function boardPoint(e) {
  const r = bcanvas.getBoundingClientRect();
  return [clampN(((e.clientX - r.left) / r.width) * BOARD_W, BOARD_W), clampN(((e.clientY - r.top) / r.height) * BOARD_H, BOARD_H)];
}
function addBoardPoint(e) {
  const [x, y] = boardPoint(e);
  addSeg(boards.get(boardShown), { ...drawingStroke, p: [x, y] });
  pendingPts.push(x, y);
  scheduleBoardDraw();
  flushTimer ??= setTimeout(flushStroke, 60);
}
function flushStroke() {
  clearTimeout(flushTimer); flushTimer = null;
  if (!drawingStroke || !pendingPts.length) return;
  broadcast('wb', { t: 'seg', z: boardShown, ...drawingStroke, p: pendingPts });
  pendingPts = [];
}

function renderPenTools() {
  const box = $('#penTools');
  if (box.childElementCount) {
    box.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('sel', !pen.eraser && b.dataset.c === pen.c));
    box.querySelectorAll('[data-w]').forEach((b) => b.classList.toggle('sel', Number(b.dataset.w) === pen.w));
    box.querySelector('.eraser').classList.toggle('sel', pen.eraser);
    return;
  }
  for (const c of BOARD_COLORS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.c = c; b.className = 'pen-color'; b.style.background = c; b.title = 'Couleur';
    b.onclick = () => { pen.c = c; pen.eraser = false; renderPenTools(); };
    box.append(b);
  }
  BOARD_SIZES.forEach((w, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.w = w; b.className = 'pen-size'; b.title = ['Fin', 'Moyen', 'Épais'][i];
    b.innerHTML = `<i style="width:${4 + i * 4}px;height:${4 + i * 4}px"></i>`;
    b.onclick = () => { pen.w = w; pen.eraser = false; renderPenTools(); };
    box.append(b);
  });
  const er = document.createElement('button');
  er.type = 'button'; er.className = 'eraser'; er.textContent = 'Gomme';
  er.onclick = () => { pen.eraser = !pen.eraser; renderPenTools(); };
  const clr = document.createElement('button');
  clr.type = 'button'; clr.className = 'clear'; clr.textContent = 'Tout effacer';
  clr.onclick = () => { const b = boards.get(boardShown); if (b?.owner !== S.myId) return; b.strokes.clear(); broadcast('wb', { t: 'clear', z: boardShown }); scheduleBoardDraw(); };
  box.append(er, clr);
  renderPenTools();
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initBoard() {
  bcanvas.addEventListener('pointerdown', (e) => {
    if (boardPip.has(boardShown)) return togglePip(); // en PiP, un clic agrandit
    if (boards.get(boardShown)?.owner !== S.myId) return;
    e.preventDefault();
    bcanvas.setPointerCapture(e.pointerId);
    drawingStroke = { id: `${S.myId}-${strokeSeq++}`, c: pen.eraser ? ERASER.c : pen.c, w: pen.eraser ? ERASER.w : pen.w };
    addBoardPoint(e);
  });
  bcanvas.addEventListener('pointermove', (e) => { if (drawingStroke) addBoardPoint(e); });
  for (const ev of ['pointerup', 'pointercancel']) bcanvas.addEventListener(ev, () => { if (!drawingStroke) return; flushStroke(); drawingStroke = null; });

  $('#boardBtn').onclick = () => (boardShown ? togglePip() : openBoard());
  $('#boardMin').onclick = togglePip;
  $('#boardClose').onclick = () => closeMyBoard(boardShown);
  addEventListener('resize', () => { if (boardShown) fitBoard(); });
}
