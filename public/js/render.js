// Rendu de la scène à chaque frame : caméra, personnages, effets, étiquettes.
import { sampleLevel } from './audio.js';
import { HAT_HEIGHT, drawAvatar } from './avatar.js';
import { CROUCH_MS, DELTA, HOP_MS, STAMINA, STEP_MS, TRAIL_MS, WORLD_H, WORLD_W } from './config.js';
import { $, typing } from './dom.js';
import { drawEmote } from './emotes.js';
import { drawChairBack } from './map-render.js';
import { links } from './media.js';
import { chairNearMe, myStepMs, step } from './movement.js';
import { isTransmitting } from './panel.js';
import { drawHandAndReactions, sixSevenPump } from './social.js';
import { drawPortalOpen, drawSpaceSign, drawWarpOverlay, warpPose } from './spaces.js';
import { S, users } from './state.js';
import { MAP, PROX_RADIUS, TILE, canTalkieIn, chairAt, isOnAir, nearLectern, nearPortal, sendsAudio, shade, sideBySide } from './world.js';

export const canvas = $('#world');
export const ctx = canvas.getContext('2d');

// Talkie levé près de la tête, avec des ondes radio qui s'échappent de l'antenne
function drawWalkie(u, cx, by, dir, now) {
  const side = dir === 'left' ? -1 : 1;
  const dark = shade(u.look.shirt, -35);
  const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const dx = cx + side * 9 - (side < 0 ? 4 : 0); // bord gauche de l'appareil
  const dy = by - 30;
  // bras levé + main
  r(side > 0 ? cx + 6 : cx - 9, by - 20, 3, 5, dark);
  r(dx, dy + 9, 4, 2, u.look.skin);
  // appareil
  r(dx, dy, 4, 9, '#2b2d42');
  r(dx + 1, dy + 2, 2, 2, '#7fd1ff');
  r(dx + 1, dy + 6, 2, 1, '#06d6a0');
  const ax = side > 0 ? dx + 3 : dx;
  r(ax, dy - 5, 1, 5, '#2b2d42');
  // ondes
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const phase = (now / 650 + i / 3) % 1;
    ctx.strokeStyle = `rgba(6,214,160,${0.85 * (1 - phase)})`;
    ctx.beginPath();
    const a0 = side > 0 ? -Math.PI / 3 : (2 * Math.PI) / 3;
    ctx.arc(ax + 0.5, dy - 5, 3 + phase * 9, a0, a0 + (2 * Math.PI) / 3);
    ctx.stroke();
  }
}

// Ondes de haut-parleur des deux côtés de l'orateur au pupitre
function drawSpeakerWaves(cx, cy, now) {
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const phase = (now / 800 + i / 3) % 1;
    ctx.strokeStyle = `rgba(255,207,92,${0.9 * (1 - phase)})`;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      const a0 = side > 0 ? -Math.PI / 4 : (3 * Math.PI) / 4;
      ctx.arc(cx, cy, 12 + phase * 14, a0, a0 + Math.PI / 2);
      ctx.stroke();
    }
  }
}

// Images fantômes derrière l'avatar + petit nuage de poussière au départ
function drawDashFx(u, now) {
  if (u.dust) {
    const k = (now - u.dust.t) / 350;
    if (k >= 1) u.dust = null;
    else {
      const [dx, dy] = DELTA[u.dust.dir];
      const cx = u.dust.x * TILE + TILE / 2, cy = u.dust.y * TILE + TILE - 4;
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - k)})`;
      for (const [ox, oy, r] of [[-6, 0, 4], [6, 0, 4], [0, -3, 5]]) {
        ctx.beginPath();
        ctx.arc(cx + ox * (1 + k) - dx * 10 * k, cy + oy * (1 + k) - dy * 10 * k, r * (0.6 + k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (!u.trail?.length) return;
  for (let i = 0; i < u.trail.length; i += 2) {
    const g = u.trail[i];
    const a = 0.4 * (1 - (now - g.t) / TRAIL_MS);
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    drawAvatar(ctx, u.look, g.x * TILE + TILE / 2, g.y * TILE + TILE - 2, g.dir, 1, false);
  }
  ctx.globalAlpha = 1;
}

// ============================================================
// Boucle de rendu
// ============================================================
let lastT = performance.now();
let lastLevels = 0;
export function loop(now) {
  frame(now);
  requestAnimationFrame(loop);
}

// Une image : déplacements, niveaux des voix, dessin. Aussi appelée par la fenêtre
// d'incrustation (pip.js) quand l'onglet est caché, car cette boucle s'arrête alors
export function frame(now) {
  const dt = Math.min(100, now - lastT);
  lastT = now;
  step(now);
  for (const u of users.values()) {
    const moving = u.rx !== u.x || u.ry !== u.y;
    // Rattrape plus vite si on a pris du retard ; très vite pendant un dash
    const lag = Math.max(Math.abs(u.x - u.rx), Math.abs(u.y - u.ry));
    const speed = u.dashing ? dt / 30
      : u.isMe ? dt / myStepMs()
      : u.crouch ? dt / CROUCH_MS
      : (dt / STEP_MS) * Math.max(1, lag * 1.8);
    u.rx += Math.sign(u.x - u.rx) * Math.min(speed, Math.abs(u.x - u.rx));
    u.ry += Math.sign(u.y - u.ry) * Math.min(speed, Math.abs(u.y - u.ry));
    u.walk = moving ? u.walk + dt : 0;
    if (u.dashing) {
      u.trail.push({ x: u.rx, y: u.ry, dir: u.dir, t: now });
      if (u.rx === u.x && u.ry === u.y) u.dashing = false;
    }
    if (u.trail?.length) u.trail = u.trail.filter((g) => now - g.t < TRAIL_MS);
  }
  sampleLevels(now);
  draw();
}

// Niveaux des voix (halo vert), au plus toutes les 80 ms
function sampleLevels(now) {
  if (now - lastLevels <= 80) return;
  lastLevels = now;
  S.me.level = isTransmitting(S.me) ? sampleLevel(S.localAnalyser) : 0;
  for (const [id, L] of links) {
    const u = users.get(id);
    if (u) u.level = sendsAudio(u, S.me) ? sampleLevel(L.analyser) : 0;
  }
}

function draw() {
  const dpr = devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const zoom = Math.max(1, Math.min(2.5, Math.round(Math.min(H / (13 * TILE), W / (11 * TILE)) * 4) / 4));
  const vw = W / zoom, vh = H / zoom;
  const fx = S.me.rx * TILE + TILE / 2, fy = S.me.ry * TILE + TILE / 2;
  S.cam = {
    zoom,
    x: WORLD_W <= vw ? (WORLD_W - vw) / 2 : Math.max(0, Math.min(WORLD_W - vw, fx - vw / 2)),
    y: WORLD_H <= vh ? (WORLD_H - vh) / 2 : Math.max(0, Math.min(WORLD_H - vh, fy - vh / 2)),
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#191d33';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -S.cam.x * zoom * dpr, -S.cam.y * zoom * dpr);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(S.mapCanvas, 0, 0, WORLD_W, WORLD_H);

  // Assombrit tout ce qui est hors de la zone privée courante
  const z = MAP.zoneById[S.me.zone];
  if (z && z.type !== 'open') {
    ctx.fillStyle = 'rgba(20,23,45,.45)';
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.rect(z.x * TILE, (z.y - 1) * TILE, z.w * TILE, (z.h + 1) * TILE);
    ctx.fill('evenodd');
  }

  // Trait vert entre moi et les personnes côte à côte
  for (const u of users.values()) {
    if (u.isMe || !sideBySide(S.me, u) || !(sendsAudio(S.me, u) || sendsAudio(u, S.me))) continue;
    ctx.strokeStyle = 'rgba(6,214,160,.85)'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(fx, fy + 6); ctx.lineTo(u.rx * TILE + TILE / 2, u.ry * TILE + TILE / 2 + 6); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Cercle de proximité quand N est maintenu
  if (S.pttHeld) {
    ctx.fillStyle = 'rgba(6,214,160,.12)';
    ctx.strokeStyle = 'rgba(6,214,160,.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(fx, fy, (PROX_RADIUS + 0.5) * TILE, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Chemin cliqué
  if (S.path?.length) {
    const [tx, ty] = S.path.at(-1);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.strokeRect(tx * TILE + 4, ty * TILE + 4, TILE - 8, TILE - 8);
  }

  const list = [...users.values()].sort((a, b) => a.ry - b.ry || (a.isMe ? 1 : -1));
  const now = performance.now();
  drawPortalOpen(now);
  for (const u of list) drawDashFx(u, now);
  for (const u of list) {
    const cx = u.rx * TILE + TILE / 2, by = u.ry * TILE + TILE - 2;
    const moving = u.walk > 0;
    const chair = u.seated && !moving ? chairAt(u.x, u.y) : null;
    const dir = chair ? chair.dir : u.dir;
    const frame = moving ? 1 + (Math.floor(u.walk / 120) % 2) : 0;
    if (u.level > 0.04) {
      ctx.fillStyle = 'rgba(6,214,160,.35)';
      ctx.beginPath(); ctx.ellipse(cx, by - 1, 13 + u.level * 20, 5 + u.level * 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Petit bond : en levant le talkie (N) ou en sautant (V)
    const hopAt = Math.max(u.ptt ? u.pttAt || 0 : 0, u.jumpAt || 0);
    const k = (now - hopAt) / HOP_MS;
    const lift = k < 1 ? Math.sin(Math.PI * k) * 4 : 0;
    const crouched = !!u.crouch && !chair;
    // Sieste : yeux fermés ; AFK : personnage estompé
    const look = u.emote === 'sleep' ? { ...u.look, face: 'sleep' } : u.look;
    const pose = warpPose(u, now); // passage de la porte des espaces
    ctx.globalAlpha = (u.emote === 'afk' ? 0.55 : 1) * (pose ? pose.alpha : 1);
    drawAvatar(ctx, look, cx, by + (chair ? -4 : 0) + (pose ? pose.dy : 0), dir, frame, !!chair, lift, crouched, sixSevenPump(u, now), !!u.dab);
    ctx.globalAlpha = 1;
    if (chair) drawChairBack(ctx, chair);
    if (u.ptt && canTalkieIn(u.zone)) drawWalkie(u, cx, by - lift + (crouched ? 5 : 0), dir, now);
    if (isOnAir(u)) drawSpeakerWaves(cx, by - 24, now);
    if (u.level > 0.04) {
      ctx.strokeStyle = '#06d6a0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(cx - 9, by - 33 + (chair ? 0 : 0), 18, 16, 4); ctx.stroke();
    }
  }

  // Étiquettes (nom) en coordonnées écran, nettes à tout zoom
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSpaceSign(zoom);
  ctx.font = '600 12px "DM Sans", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const u of list) {
    if (u.isMe && S.warp) continue;
    const sx = (u.rx * TILE + TILE / 2 - S.cam.x) * zoom;
    const sy = (u.ry * TILE - S.cam.y) * zoom - (6 + (HAT_HEIGHT[u.look?.head] || 0)) * zoom;
    const tx = isTransmitting(u);
    const inRange = !u.isMe && ((S.pttHeld && sendsAudio(S.me, u)) || (sideBySide(S.me, u) && sendsAudio(S.me, u)));
    const onAir = isOnAir(u);
    const label = onAir ? `📢 ${u.name}` : u.name;
    const tw = ctx.measureText(label).width;
    const extra = (tx && !onAir ? 14 : 0) + (u.sharing ? 14 : 0);
    const w = tw + 16 + extra, h = 20;
    ctx.fillStyle = onAir ? '#ffcf5c' : inRange ? 'rgba(6,214,160,.95)' : 'rgba(32,37,64,.88)';
    ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - h, w, h, 10); ctx.fill();
    let ix = sx - w / 2 + 10;
    if (tx && !onAir) {
      ctx.fillStyle = u.level > 0.04 ? '#06d6a0' : '#8ef0d3';
      ctx.beginPath(); ctx.arc(ix + 2, sy - h / 2, 4, 0, Math.PI * 2); ctx.fill();
      ix += 14;
    }
    if (u.sharing) {
      ctx.fillStyle = '#ffcf5c';
      ctx.fillRect(ix - 3, sy - h / 2 - 4, 10, 7);
      ix += 14;
    }
    ctx.fillStyle = inRange || onAir ? '#10213a' : '#fff';
    ctx.fillText(label, ix + tw / 2 - 2, sy - h / 2 + 0.5);
    drawHandAndReactions(u, sx, drawEmote(u, sx, sy - h - 2, now), now);
    ctx.font = '600 12px "DM Sans", sans-serif';
  }
  drawStamina(zoom);
  drawSitHint(zoom);
  drawWarpOverlay(now, zoom);
}

// Jauge d'endurance sous ses pieds, seulement quand elle n'est pas pleine : verte, puis
// jaune, rouge (et clignotante) quand on est essoufflé·e
function drawStamina(zoom) {
  if (S.stamina >= STAMINA.max || S.warp) return;
  const k = S.stamina / STAMINA.max;
  const w = 40, h = 6;
  const sx = (S.me.rx * TILE + TILE / 2 - S.cam.x) * zoom - w / 2;
  const sy = ((S.me.ry + 1) * TILE - S.cam.y) * zoom - 1;
  ctx.fillStyle = 'rgba(20,23,45,.75)';
  ctx.beginPath(); ctx.roundRect(sx - 1, sy - 1, w + 2, h + 2, 3); ctx.fill();
  const blink = S.exhausted && Math.floor(performance.now() / 250) % 2;
  ctx.fillStyle = S.exhausted ? (blink ? '#ef476f' : '#a4161a') : k > 0.5 ? '#06d6a0' : '#ffd166';
  if (k > 0) { ctx.beginPath(); ctx.roundRect(sx, sy, w * k, h, 2); ctx.fill(); }
}

// Petit indice sous ses pieds quand une chaise est à portée (clavier uniquement)
const coarse = matchMedia('(pointer: coarse)');
function drawSitHint(zoom) {
  if (coarse.matches || S.me.walk > 0 || typing() || S.warp) return;
  const text = S.me.onAir ? 'Rendre la parole'
    : S.me.seated ? 'Se lever'
    : nearLectern(S.me.x, S.me.y) ? 'Prendre la parole (tout le monde)'
    : nearPortal(S.me.x, S.me.y) ? "Changer d'espace de travail"
    : chairNearMe() ? "S'asseoir" : null;
  if (!text) return;
  const sx = (S.me.rx * TILE + TILE / 2 - S.cam.x) * zoom;
  const sy = ((S.me.ry + 1) * TILE - S.cam.y) * zoom + 6;
  ctx.font = '600 12px "DM Sans", sans-serif';
  const tw = ctx.measureText(text).width;
  const w = tw + 38, h = 22;
  ctx.fillStyle = 'rgba(32,37,64,.92)';
  ctx.beginPath(); ctx.roundRect(sx - w / 2, sy, w, h, 11); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.roundRect(sx - w / 2 + 5, sy + 4, 16, 14, 4); ctx.fill();
  ctx.fillStyle = '#202540'; ctx.font = '700 10px "DM Sans", sans-serif';
  ctx.fillText('E', sx - w / 2 + 13, sy + h / 2 + 0.5);
  ctx.fillStyle = '#fff'; ctx.font = '600 12px "DM Sans", sans-serif';
  ctx.fillText(text, sx - w / 2 + 27 + tw / 2, sy + h / 2 + 0.5);
}
