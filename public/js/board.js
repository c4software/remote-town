// Tableau blanc de la salle de classe et du bureau principal.
// Il s'ouvre au bureau du prof ; la personne qui l'ouvre dessine ou écrit au clavier, il s'affiche chez tous
// ceux de la pièce (grand format ou PiP). Chacun garde l'état des tableaux ; le
// propriétaire l'envoie aux nouveaux venus.
import { BOARD_COLORS, BOARD_ERASER, BOARD_FONT, BOARD_H, BOARD_LINE, BOARD_SAVE_MAX, BOARD_SIZES, BOARD_TEXT_LINES, BOARD_TEXT_MAX, BOARD_W, WB_MSG, boardFontPx } from './constantes.js';
import { $, ofName, toast } from './dom.js';
import { updateUI } from './hud.js';
import { broadcast } from './net.js';
import { S, users } from './state.js';
import { closeFocus, renderVideos } from './videos.js';
import { zoneType } from './world.js';

// zone -> { owner, strokes: Map(id -> { c, w, pts: [x, y, x, y…] }) } ; un texte tapé au clavier
// est un élément de la même liste (donc dans l'ordre du dessin : la gomme passe dessus), avec
// `text` et un seul point, son coin haut gauche
export const boards = new Map();
export const boardZone = (z) => ['class', 'main'].includes(zoneType(z));
export const boardPip = new Set(); // pièces dont on regarde le tableau en mode PiP (petite fenêtre)
// Bureau du prof : seul endroit d'où l'on peut ouvrir le tableau de la pièce
const TEACHER_AREAS = { class: { x0: 66, x1: 70, y0: 1, y1: 2 }, main: { x0: 6, x1: 9, y0: 1, y1: 1 } };
export const atTeacherDesk = () => {
  const a = S.me && TEACHER_AREAS[S.me.zone];
  return !!a && S.me.x >= a.x0 && S.me.x <= a.x1 && S.me.y >= a.y0 && S.me.y <= a.y1;
};
let boardShown = null;            // pièce dont le tableau est affiché en grand
const pen = { c: BOARD_COLORS[0], w: BOARD_SIZES[1], eraser: false, text: false };
let editing = null;               // texte en cours de saisie : { id, c, w, x, y, ta }, textTimer : envoi groupé
let textTimer = null;
let drawingStroke = null, pendingPts = [], strokeSeq = 0, flushTimer = null, boardDrawQueued = false;
const bcanvas = $('#boardCanvas');
const bctx = bcanvas.getContext('2d');
const clampN = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

function addSeg(b, d) {
  const id = String(d?.id || '').slice(0, 80);
  if (!b || !id) return;
  let st = b.strokes.get(id);
  if (!st) {
    const c = BOARD_COLORS.includes(d.c) || d.c === BOARD_ERASER.c ? d.c : BOARD_COLORS[0];
    st = { c, w: Math.max(1, Math.min(60, Number(d.w) || 4)), pts: [] };
    b.strokes.set(id, st);
  }
  const p = Array.isArray(d.p) ? d.p : [];
  for (let i = 0; i + 1 < p.length && st.pts.length < 40000; i += 2) st.pts.push(clampN(p[i], BOARD_W), clampN(p[i + 1], BOARD_H));
}

// Texte reçu ou saisi : remplace le bloc `id` ; vide, il disparaît
const cleanText = (s) => String(s ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, BOARD_TEXT_MAX)
  .split('\n').slice(0, BOARD_TEXT_LINES).join('\n');
function setText(b, d) {
  const id = String(d?.id || '').slice(0, 80);
  if (!b || !id) return;
  const text = cleanText(d.s);
  if (!text.trim()) return void b.strokes.delete(id);
  const p = Array.isArray(d.p) ? d.p : [];
  const st = b.strokes.get(id) || {};
  b.strokes.set(id, Object.assign(st, {
    c: BOARD_COLORS.includes(d.c) ? d.c : BOARD_COLORS[0], w: Math.max(1, Math.min(60, Number(d.w) || 4)),
    pts: [clampN(p[0], BOARD_W), clampN(p[1], BOARD_H)], text,
  }));
}
const addItem = (b, d) => (d?.s !== undefined ? setText(b, d) : addSeg(b, d));

export function onBoardMsg(d, { peerId }) {
  const z = String(d?.z || '');
  if (!boardZone(z) || !users.has(peerId)) return;
  const b = boards.get(z);
  if (d.t === WB_MSG.OPEN) { boards.set(z, { owner: peerId, strokes: new Map() }); boardPip.delete(z); }
  else if (d.t === WB_MSG.SYNC && Array.isArray(d.strokes)) {
    const nb = { owner: peerId, strokes: new Map() };
    for (const st of d.strokes.slice(-5000)) addItem(nb, st);
    boards.set(z, nb);
  } else if (b?.owner !== peerId) return; // seul le propriétaire modifie son tableau
  else if (d.t === WB_MSG.SEG) addSeg(b, d);
  else if (d.t === WB_MSG.TEXT) setText(b, d);
  else if (d.t === WB_MSG.CLEAR) b.strokes.clear();
  else if (d.t === WB_MSG.CLOSE) boards.delete(z);
  refreshBoard();
}

// Contenu d'un tableau tel qu'il s'envoie (synchronisation) et s'enregistre
const boardItems = (b) => [...b.strokes].map(([id, st]) => ({ id, c: st.c, w: st.w, p: st.pts, ...(st.text !== undefined && { s: st.text }) }));

export function syncBoardsTo(peerId) {
  for (const [z, b] of boards) {
    if (b.owner !== S.myId) continue;
    S.net?.wb.send({ t: WB_MSG.SYNC, z, strokes: boardItems(b) }, { target: peerId }).catch(() => {});
  }
}

// ============================================================
// Mon tableau est enregistré quand il se ferme (bouton « Fermer », sortie de la salle,
// reconnexion, page quittée) et retrouvé à la réouverture : traits et textes. Gardé par
// espace et par salle, en mémoire et dans le navigateur (« rt-boards », si la taille le permet).
// ============================================================
const saved = new Map(); // « espace:salle » -> contenu (boardItems)
const savedKey = (z) => `${S.roomId}:${z}`;
function loadSaved() {
  if (saved.loaded) return;
  saved.loaded = true;
  try {
    for (const [k, items] of Object.entries(JSON.parse(localStorage.getItem('rt-boards')) || {})) if (Array.isArray(items)) saved.set(k, items);
  } catch {}
}
function saveBoard(z, b) {
  loadSaved();
  const items = boardItems(b);
  if (items.length) saved.set(savedKey(z), items); else saved.delete(savedKey(z));
  try {
    const text = JSON.stringify(Object.fromEntries(saved));
    if (text.length <= BOARD_SAVE_MAX) localStorage.setItem('rt-boards', text);
  } catch {} // trop gros ou stockage indisponible : gardé en mémoire seulement
}
function saveMyBoards() {
  for (const [z, b] of boards) if (b.owner === S.myId) saveBoard(z, b);
}

export function dropBoardsOf(id) {
  let changed = false;
  if (id === S.myId) saveMyBoards(); // reconnexion sous un nouvel identifiant : on garde le contenu
  for (const [z, b] of boards) if (b.owner === id) { boards.delete(z); changed = true; }
  if (changed) refreshBoard();
}

function openBoard() {
  if (!S.me || !boardZone(S.me.zone) || boards.has(S.me.zone)) return;
  if (!atTeacherDesk()) return toast('Le tableau blanc s\'ouvre depuis le bureau du prof.');
  const z = S.me.zone, b = { owner: S.myId, strokes: new Map() };
  loadSaved();
  for (const item of (saved.get(savedKey(z)) || []).slice(-5000)) addItem(b, item); // contenu enregistré, revalidé
  boards.set(z, b);
  broadcast('wb', { t: WB_MSG.OPEN, z });
  if (b.strokes.size) broadcast('wb', { t: WB_MSG.SYNC, z, strokes: boardItems(b) });
  boardPip.delete(z);
  refreshBoard();
}

export function closeMyBoard(z) {
  const b = boards.get(z);
  if (b?.owner !== S.myId) return;
  endText(); // texte en cours de saisie : validé avant l'enregistrement
  saveBoard(z, b);
  boards.delete(z);
  broadcast('wb', { t: WB_MSG.CLOSE, z });
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
  if (editing && (b?.owner !== S.myId || boardPip.has(S.me.zone))) endText();
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
  renderVideos(); // l'écran du pupitre en PiP se place sous le tableau en PiP
  updateUI();
}

function fitBoard() {
  const wrap = $('#boardWrap');
  const k = Math.min(wrap.clientWidth / BOARD_W, wrap.clientHeight / BOARD_H);
  bcanvas.style.width = `${Math.floor(BOARD_W * k)}px`;
  bcanvas.style.height = `${Math.floor(BOARD_H * k)}px`;
  placeText(); // la zone de saisie suit le tableau (fenêtre redimensionnée, clavier d'une tablette…)
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
  for (const [id, st] of b.strokes) {
    if (!st.pts.length) continue;
    if (st.text !== undefined) {
      if (id === editing?.id) continue; // en cours de saisie : c'est la zone de saisie qu'on voit
      const px = boardFontPx(st.w);
      bctx.font = `${px}px ${BOARD_FONT}`; bctx.fillStyle = st.c; bctx.textBaseline = 'top';
      st.text.split('\n').forEach((line, i) => bctx.fillText(line, st.pts[0], st.pts[1] + (i * BOARD_LINE + (BOARD_LINE - 1) / 2) * px));
      continue;
    }
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
  broadcast('wb', { t: WB_MSG.SEG, z: boardShown, ...drawingStroke, p: pendingPts });
  pendingPts = [];
}

// --- Écriture au clavier (propriétaire uniquement) : outil « Texte », puis un clic sur le
// tableau pose une zone de saisie à cet endroit (ou reprend le texte cliqué). On tape ; les
// autres voient le texte apparaître. Échap, ou un clic ailleurs, termine. ---
function textAt(b, x, y) {
  let hit = null;
  for (const [id, st] of b.strokes) {
    if (st.text === undefined) continue;
    const px = boardFontPx(st.w), lines = st.text.split('\n');
    bctx.font = `${px}px ${BOARD_FONT}`;
    const w = Math.max(...lines.map((l) => bctx.measureText(l).width));
    if (x >= st.pts[0] && x <= st.pts[0] + w && y >= st.pts[1] && y <= st.pts[1] + lines.length * px * BOARD_LINE) hit = { id, st };
  }
  return hit;
}
function startText(e) {
  endText();
  const b = boards.get(boardShown), [px, py] = boardPoint(e), hit = textAt(b, px, py);
  const ed = hit ? { id: hit.id, c: hit.st.c, w: hit.st.w, x: hit.st.pts[0], y: hit.st.pts[1] }
    : { id: `${S.myId}-${strokeSeq++}`, c: pen.c, w: pen.w, x: px, y: py };
  const ta = ed.ta = Object.assign(document.createElement('textarea'), { id: 'boardText', maxLength: BOARD_TEXT_MAX, wrap: 'off', spellcheck: false, value: hit?.st.text || '' });
  ta.setAttribute('aria-label', 'Texte du tableau');
  ta.oninput = () => {
    setText(boards.get(boardShown), { id: ed.id, c: ed.c, w: ed.w, p: [ed.x, ed.y], s: ta.value });
    textTimer ??= setTimeout(sendText, 120);
  };
  ta.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') endText(); };
  ta.onblur = endText;
  editing = ed;
  placeText();
  $('#board').append(ta);
  scheduleBoardDraw();
  ta.focus();
}
// Zone de saisie placée en pixels d'écran sur le tableau : recalculée quand il change de taille
function placeText() {
  if (!editing) return;
  const r = bcanvas.getBoundingClientRect(), k = r.width / BOARD_W, ed = editing;
  Object.assign(ed.ta.style, {
    left: `${r.left + ed.x * k}px`, top: `${r.top + ed.y * k}px`, width: `${r.right - (r.left + ed.x * k)}px`, height: `${r.bottom - (r.top + ed.y * k)}px`,
    font: `${boardFontPx(ed.w) * k}px/${BOARD_LINE} ${BOARD_FONT}`, color: ed.c,
  });
}
function sendText() {
  clearTimeout(textTimer); textTimer = null;
  if (!editing || boards.get(boardShown)?.owner !== S.myId) return;
  broadcast('wb', { t: WB_MSG.TEXT, z: boardShown, id: editing.id, c: editing.c, w: editing.w, p: [editing.x, editing.y], s: cleanText(editing.ta.value) });
}
function endText() {
  if (!editing) return;
  sendText();
  const { ta } = editing;
  editing = null;
  ta.onblur = null;
  ta.remove();
  scheduleBoardDraw();
}

function renderPenTools() {
  const box = $('#penTools');
  if (box.childElementCount) {
    box.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('sel', !pen.eraser && b.dataset.c === pen.c));
    box.querySelectorAll('[data-w]').forEach((b) => b.classList.toggle('sel', Number(b.dataset.w) === pen.w));
    box.querySelector('.eraser').classList.toggle('sel', pen.eraser);
    box.querySelector('.text-tool').classList.toggle('sel', pen.text);
    $('#board').classList.toggle('text', pen.text);
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
  er.onclick = () => { pen.eraser = !pen.eraser; pen.text = false; renderPenTools(); };
  const tx = document.createElement('button');
  tx.type = 'button'; tx.className = 'text-tool'; tx.textContent = 'Texte'; tx.title = 'Écrire au clavier : cliquer sur le tableau, puis taper';
  tx.onclick = () => { pen.text = !pen.text; pen.eraser = false; renderPenTools(); };
  const clr = document.createElement('button');
  clr.type = 'button'; clr.className = 'clear'; clr.textContent = 'Tout effacer';
  clr.onclick = () => { const b = boards.get(boardShown); if (b?.owner !== S.myId) return; b.strokes.clear(); broadcast('wb', { t: WB_MSG.CLEAR, z: boardShown }); scheduleBoardDraw(); };
  box.append(tx, er, clr);
  renderPenTools();
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initBoard() {
  addEventListener('pagehide', () => { endText(); saveMyBoards(); }); // page rechargée ou fermée
  bcanvas.addEventListener('pointerdown', (e) => {
    if (boardPip.has(boardShown)) return togglePip(); // en PiP, un clic agrandit
    if (boards.get(boardShown)?.owner !== S.myId) return;
    e.preventDefault();
    if (pen.text) return startText(e);
    bcanvas.setPointerCapture(e.pointerId);
    drawingStroke = { id: `${S.myId}-${strokeSeq++}`, c: pen.eraser ? BOARD_ERASER.c : pen.c, w: pen.eraser ? BOARD_ERASER.w : pen.w };
    addBoardPoint(e);
  });
  // Outil texte : le clic ne doit pas reprendre le focus à la zone de saisie qu'il vient de poser
  bcanvas.addEventListener('mousedown', (e) => { if (pen.text) e.preventDefault(); });
  bcanvas.addEventListener('pointermove', (e) => { if (drawingStroke) addBoardPoint(e); });
  for (const ev of ['pointerup', 'pointercancel']) bcanvas.addEventListener(ev, () => { if (!drawingStroke) return; flushStroke(); drawingStroke = null; });

  $('#boardBtn').onclick = () => (boardShown ? togglePip() : openBoard());
  $('#boardMin').onclick = togglePip;
  $('#boardClose').onclick = () => closeMyBoard(boardShown);
  addEventListener('resize', () => { if (boardShown) fitBoard(); });
}
