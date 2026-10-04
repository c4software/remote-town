// Émotes (statuts animés, en boucle) choisies dans une roue au clic droit maintenu :
// travail, AFK, sieste, café, réflexion. Partagées dans le message `state` (champ `emote`),
// dessinées au-dessus de l'étiquette du nom. Se déplacer retire l'émote.
import { EMOTES } from './constantes.js';
import { $ } from './dom.js';
import { pushState } from './media.js';
import { renderPeople } from './panel.js';
import { canvas, ctx } from './render.js';
import { S } from './state.js';

const IDS = EMOTES.map((e) => e.id);
export const cleanEmote = (e) => (IDS.includes(e) ? e : null);
export const emoteIcon = (e) => EMOTES.find((x) => x.id === e)?.icon || '';

export function setEmote(e) {
  if (!S.me) return;
  e = cleanEmote(e);
  if (e === (S.me.emote || null)) return;
  S.me.emote = e;
  S.me.emoteAt = performance.now();
  pushState();
}

// Appelé quand je change de case (pas, dash) : on n'est plus au café ni en sieste
export function clearEmoteOnMove() {
  if (S.me?.emote) setEmote(null);
}

// ============================================================
// Roue du clic droit. Maintenu : on glisse vers une émote et on relâche.
// Clic droit bref (ou appui long sur écran tactile) : la roue reste ouverte et
// on clique sur une émote. Le centre retire l'émote en cours.
// ============================================================
const RADIUS = 72, DEAD_ZONE = 28, HOLD_MS = 280;
let wheel = null; // { x, y, hold, openedAt, hot }

function openWheel(x, y, hold) {
  if (!S.me || S.editingProfile) return;
  const m = 112; // rayon du rond (voir #emoteWheel::before)
  x = Math.min(Math.max(x, m), innerWidth - m);
  y = Math.min(Math.max(y, m), innerHeight - m);
  wheel = { x, y, hold, openedAt: performance.now(), hot: null };
  const el = $('#emoteWheel');
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  const center = el.querySelector('.ew-center');
  center.textContent = S.me.emote ? '✕' : '';
  center.title = S.me.emote ? "Retirer l'émote" : '';
  center.disabled = !S.me.emote;
  el.hidden = false;
  highlight(null);
}

function closeWheel() {
  wheel = null;
  $('#emoteWheel').hidden = true;
}

function choose(e) {
  setEmote(e === (S.me.emote || '') ? null : e);
  closeWheel();
}

// Émote visée selon l'angle du pointeur ; '' = centre (retirer), null = rien
function aimed(px, py) {
  const dx = px - wheel.x, dy = py - wheel.y;
  if (Math.hypot(dx, dy) < DEAD_ZONE) return S.me.emote ? '' : null;
  const a = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360; // 0° en haut
  return EMOTES[Math.round(a / (360 / EMOTES.length)) % EMOTES.length].id;
}

function highlight(id) {
  if (!wheel) return;
  wheel.hot = id;
  $('#emoteWheel').querySelectorAll('[data-emote]').forEach((b) => b.classList.toggle('hot', b.dataset.emote === id));
}

function buildWheel() {
  const el = $('#emoteWheel');
  EMOTES.forEach((e, i) => {
    const a = (i * 360 / EMOTES.length - 90) * Math.PI / 180;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.emote = e.id;
    b.style.left = `${Math.cos(a) * RADIUS}px`; b.style.top = `${Math.sin(a) * RADIUS}px`;
    b.textContent = e.icon;
    b.title = e.label; b.setAttribute('aria-label', e.label);
    el.append(b);
  });
  const c = document.createElement('button');
  c.type = 'button'; c.className = 'ew-center'; c.dataset.emote = '';
  el.append(c);
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-emote]');
    if (b && !b.disabled) choose(b.dataset.emote);
  });
  el.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initEmotes() {
  buildWheel();
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2 && e.pointerType === 'mouse') openWheel(e.clientX, e.clientY, true);
  });
  // Clic droit : pas de menu du navigateur. Appui long sur écran tactile : la roue
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!wheel) openWheel(e.clientX, e.clientY, false);
  });
  addEventListener('pointermove', (e) => { if (wheel && e.pointerType === 'mouse') highlight(aimed(e.clientX, e.clientY)); });
  addEventListener('pointerup', (e) => {
    if (!wheel?.hold || e.button !== 2) return;
    wheel.hold = false;
    if (wheel.hot !== null) choose(wheel.hot);
    else if (performance.now() - wheel.openedAt > HOLD_MS) closeWheel();
  });
  addEventListener('pointerdown', (e) => {
    if (wheel && !wheel.hold && !e.target.closest('#emoteWheel')) closeWheel();
  }, true);
  addEventListener('keydown', (e) => { if (wheel && e.key === 'Escape') closeWheel(); });
  addEventListener('blur', closeWheel);
}

// ============================================================
// Dessin des émotes, en pixels écran au-dessus de l'étiquette du nom.
// Renvoie la hauteur où dessiner la suite (main levée, réactions).
// ============================================================
const P = 2; // taille d'un « pixel » des petits dessins

export function drawEmote(u, sx, top, now) {
  const draw = DRAW[u.emote];
  if (!draw) return top;
  const t = now - (u.emoteAt || 0);
  const pop = Math.min(1, t / 180); // apparition
  ctx.save();
  ctx.translate(Math.round(sx), Math.round(top));
  ctx.scale(pop, pop);
  const h = draw(t);
  ctx.restore();
  return top - h * pop - 4;
}

const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * P, y * P, w * P, h * P); };

// Bulle blanche à pointe, de largeur w et hauteur h (en pixels écran), posée sur y = 0
function bubble(w, h) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(16,33,58,.55)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(-w / 2, -h - 5, w, h, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4, -5.5); ctx.lineTo(0, 0); ctx.lineTo(4, -5.5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(0, 0); ctx.lineTo(4, -5); ctx.stroke();
  ctx.translate(0, -5 - h / 2); // origine au centre de la bulle
}

const DRAW = {
  // Ordinateur portable : des lignes de code s'écrivent, puis l'écran repart à zéro
  work(t) {
    bubble(40, 32);
    px(-8, -6, 16, 10, '#2b2d42');
    px(-7, -5, 14, 8, '#1d3557');
    const lines = [[6, '#06d6a0'], [9, '#ffd166'], [4, '#f78fb3'], [7, '#06d6a0']];
    let typed = Math.floor(t / 90) % 34;
    lines.forEach(([len, c], i) => {
      const n = Math.min(len, Math.max(0, typed));
      typed -= len;
      if (n) px(-6 + (i === 2 ? 2 : 0), -4 + i * 2, n, 1, c);
    });
    px(-10, 4, 20, 2, '#8d99ae');
    px(-2, 4, 4, 1, '#5c677d');
    return 37;
  },
  // Horloge dont l'aiguille tourne, à côté de « AFK »
  afk(t) {
    bubble(54, 26);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-14, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const a = t / 300;
    ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-14 + Math.sin(a) * 5, -Math.cos(a) * 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-14 + Math.sin(a / 12) * 3, -Math.cos(a / 12) * 3); ctx.stroke();
    ctx.fillStyle = '#10213a'; ctx.font = '800 12px "DM Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('AFK', 8, 1);
    return 31;
  },
  // Des « Z » qui montent en grossissant et s'effacent
  sleep(t) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = '#10213a';
    for (let i = 0; i < 3; i++) {
      const k = ((t / 2100) + i / 3) % 1;
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.font = `800 ${Math.round(9 + k * 10)}px "DM Sans", sans-serif`;
      const x = -6 + k * 16 + Math.sin(k * 7) * 2, y = -4 - k * 26;
      ctx.strokeText('Z', x, y);
      ctx.fillStyle = '#c7d2fe'; ctx.fillText('Z', x, y);
    }
    ctx.globalAlpha = 1;
    return 34;
  },
  // Tasse fumante : la vapeur monte en ondulant
  coffee(t) {
    bubble(34, 34);
    const mug = '#e76f51', dark = '#b5523a';
    px(-5, -1, 9, 7, mug);
    px(-4, -1, 7, 1, '#6b3e26');
    px(4, 0, 2, 1, mug); px(5, 1, 1, 3, mug); px(4, 4, 2, 1, mug);
    px(-5, 5, 9, 1, dark);
    px(-7, 6, 13, 1, '#d6ccc2');
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const k = ((t / 1400) + j / 3 + i * 0.17) % 1;
        ctx.globalAlpha = 0.85 * (1 - k);
        px(-3 + i * 3 + Math.round(Math.sin(k * 6 + i) * 0.8), -3 - Math.round(k * 7), 1, 1, '#9aa5b1');
      }
    }
    ctx.globalAlpha = 1;
    return 39;
  },
  // Bulle de pensée : nuage, petites bulles vers la tête, trois points qui s'allument
  think(t) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(16,33,58,.55)'; ctx.lineWidth = 1;
    const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
    dot(-2, -2, 2); dot(-6, -7, 3);
    const cy = -22;
    ctx.beginPath();
    for (const [x, y, r] of [[-12, 0, 8], [-4, -5, 9], [7, -4, 9], [13, 1, 7], [3, 4, 8], [-8, 4, 7]]) {
      ctx.moveTo(x + r, cy + y); ctx.arc(x, cy + y, r, 0, Math.PI * 2);
    }
    ctx.stroke(); ctx.fill();
    const lit = Math.floor(t / 380) % 4;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < lit ? '#7b2cbf' : '#d8d3e8';
      ctx.beginPath(); ctx.arc(-6 + i * 6, cy, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    return 37;
  },
};
