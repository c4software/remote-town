import * as trysteroModule from './vendor/trystero-nostr.js';
import {
  TILE, MAP_W, MAP_H, PROX_RADIUS, T, MAP, shade,
  tileAt, isBlocked, zoneAt, chairAt, zoneType, sendsAudio, sendsVideo, canShareIn, ROOM_TYPES,
  LECTERN, LECTERN_SPOTS, nearLectern, isOnAir,
} from './shared.js';

const $ = (s) => document.querySelector(s);
const STEP_MS = 140;
const SPRINT_MS = 65; // Maj maintenu : courir
const DASH_TILES = 3; // Espace : bond de 3 cases
const DASH_COOLDOWN = 450;
const TRAIL_MS = 260;
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
// Accessoires choisis sur l'écran de connexion
const DECOS = ['metal', 'unicorn', 'cap', 'shades', 'glasses', 'tophat', 'headphones', 'crown', 'scarf'];
const cleanDeco = (d) => (DECOS.includes(d) ? d : null);

// 🤘 imprimé sur le t-shirt (vue de face). X = main, K = doigts repliés,
// '.' = vide avec contour, ' ' = vide sans contour (entre les cornes)
const METAL = [
  '.X   X.',
  '.X   X.',
  '.X   X.',
  '.XKKKX.',
  '.XXXXXX',
  '.XXXXX.',
  '..XXX..',
];
function drawMetalPrint(r, look, o) {
  const light = parseInt(look.shirt.slice(1, 3), 16) > 200 && parseInt(look.shirt.slice(3, 5), 16) > 170;
  const fill = light ? '#ffffff' : '#ffcf5c';
  const line = shade(look.shirt, -70);
  const cell = (x, y) => METAL[y]?.[x] ?? '.';
  const x0 = -3, y0 = -17 + o;
  for (let y = -1; y <= METAL.length; y++) {
    for (let x = -1; x <= METAL[0].length; x++) {
      if (cell(x, y) !== '.') continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => 'XK'.includes(cell(x + dx, y + dy)));
      if (near) r(x0 + x, y0 + y, 1, 1, line);
    }
  }
  METAL.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === 'X') r(x0 + x, y0 + y, 1, 1, fill);
    if (c === 'K') r(x0 + x, y0 + y, 1, 1, shade(fill, -50));
  }));
}

// Serre-tête licorne : bandeau, oreilles, fleurs et corne dorée torsadée
// Autres accessoires. top = haut des cheveux, o = décalage vertical (assis, accroupi…)
// Repères : tête de x -7 à 6, yeux à y -24+o (face : x -4 et 2 ; profil : x -6 ou 4).
const frame = (r, x, y, w, h, c) => { r(x, y, w, 1, c); r(x, y + h - 1, w, 1, c); r(x, y, 1, h, c); r(x + w - 1, y, 1, h, c); };
// Accessoires qui dépassent au-dessus de la tête : on remonte l'étiquette du nom d'autant
const HAT_HEIGHT = { tophat: 8, crown: 5, unicorn: 6 };
const ACCESSORIES = {
  cap(r, dir, top) {
    const c = '#e63946', d = '#a4161a';
    r(-8, top - 1, 16, 5, c);
    r(-1, top - 2, 2, 1, d);
    if (dir === 'down') r(-8, top + 4, 16, 2, d);
    if (dir === 'up') r(-3, top + 4, 6, 1, d);
    if (dir === 'left') r(-12, top + 3, 6, 2, d);
    if (dir === 'right') r(6, top + 3, 6, 2, d);
  },
  shades(r, dir, top, o) {
    const k = '#14151f', shine = '#7f8ca8', y = -25 + o;
    if (dir === 'down') { r(-5, y, 4, 3, k); r(1, y, 4, 3, k); r(-1, y + 1, 2, 1, k); r(-4, y, 1, 1, shine); r(2, y, 1, 1, shine); }
    if (dir === 'left') { r(-7, y, 4, 3, k); r(-3, y, 7, 1, k); r(-6, y, 1, 1, shine); }
    if (dir === 'right') { r(3, y, 4, 3, k); r(-4, y, 7, 1, k); r(5, y, 1, 1, shine); }
  },
  glasses(r, dir, top, o) {
    const k = '#1d1e30', y = -25 + o;
    if (dir === 'down') { frame(r, -5, y, 4, 5, k); frame(r, 1, y, 4, 5, k); r(-1, y + 1, 2, 1, k); }
    if (dir === 'left') { frame(r, -7, y, 4, 5, k); r(-3, y + 1, 7, 1, k); }
    if (dir === 'right') { frame(r, 3, y, 4, 5, k); r(-4, y + 1, 7, 1, k); }
  },
  tophat(r, dir, top) {
    const k = '#1d1e30';
    r(-9, top + 1, 18, 2, k);
    r(-6, top - 8, 12, 9, k);
    r(-6, top - 1, 12, 2, '#c0392b');
    r(-5, top - 7, 1, 5, '#3a3d5c');
  },
  headphones(r, dir, top) {
    const band = '#2b2d42', cup = '#06d6a0';
    r(-7, top - 2, 14, 2, band);
    r(-8, top, 1, 6, band); r(7, top, 1, 6, band);
    if (dir === 'down' || dir === 'up') { r(-10, top + 5, 3, 6, cup); r(7, top + 5, 3, 6, cup); }
    if (dir === 'left') r(0, top + 5, 4, 6, cup);
    if (dir === 'right') r(-4, top + 5, 4, 6, cup);
  },
  crown(r, dir, top) {
    const g = '#ffcf5c', d = '#d9a21b';
    r(-6, top - 2, 12, 3, g);
    r(-6, top - 5, 2, 3, g); r(-1, top - 5, 2, 3, g); r(4, top - 5, 2, 3, g);
    r(-6, top, 12, 1, d);
    if (dir !== 'up') { r(-1, top - 1, 2, 1, '#ef476f'); r(-4, top - 1, 1, 1, '#118ab2'); r(3, top - 1, 1, 1, '#06d6a0'); }
  },
  scarf(r, dir, top, o) {
    const c = '#ef476f', w = '#fff3f5', y = -19 + o;
    r(-8, y, 16, 3, c);
    r(-8, y + 1, 16, 1, w);
    if (dir === 'down') { r(2, y + 3, 3, 6, c); r(2, y + 5, 3, 1, w); }
    if (dir === 'left') { r(1, y + 3, 3, 5, c); r(1, y + 5, 3, 1, w); }
    if (dir === 'right') { r(-4, y + 3, 3, 5, c); r(-4, y + 5, 3, 1, w); }
  },
};

function drawUnicornHeadband(r, dir, top) {
  const hx = dir === 'left' ? -3 : dir === 'right' ? 2 : 0;
  r(-7, top + 2, 14, 2, '#f9a8d4');
  if (dir !== 'right') { r(-7, top - 2, 3, 3, '#ffffff'); r(-6, top - 1, 1, 2, '#f9a8d4'); }
  if (dir !== 'left') { r(4, top - 2, 3, 3, '#ffffff'); r(5, top - 1, 1, 2, '#f9a8d4'); }
  if (dir !== 'up') { r(hx - 5, top + 1, 2, 2, '#c4b5fd'); r(hx + 4, top + 1, 2, 2, '#86efac'); }
  [1, 2, 2, 3, 3, 4].forEach((w, i) => {
    r(hx - Math.floor(w / 2), top - 6 + i, w, 1, i % 2 ? '#fff1b8' : '#ffcf5c');
  });
}

function drawAvatar(ctx, look, cx, by, dir = 'down', walkFrame = 0, seated = false, lift = 0, crouch = false) {
  const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(cx + x), Math.round(by + y), w, h); };
  const sit = seated ? 4 : crouch ? 5 : 0;
  const bob = walkFrame ? -1 : 0;
  const o = sit + bob;

  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(cx, by - 1, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  by -= lift;

  const girl = look.style === 'girl';
  const dark = shade(look.shirt, -35);
  if (!seated && !crouch) {
    const l = walkFrame === 1 ? 2 : 0, rr = walkFrame === 2 ? 2 : 0;
    r(-5, -8, 4, 7 - l, '#2f3150'); r(1, -8, 4, 7 - rr, '#2f3150');
    r(-5, -2 - l, 4, 2, '#1b1c2e'); r(1, -2 - rr, 4, 2, '#1b1c2e');
    if (girl) { r(-6, -9, 12, 2, dark); r(-7, -7, 14, 2, dark); } // jupe
  }
  r(-7, -18 + o, 14, 11, look.shirt);
  r(-7, -9 + o, 14, 2, dark);
  if (crouch) { // genoux pliés devant le corps
    r(-7, -4, 5, 3, '#2f3150'); r(2, -4, 5, 3, '#2f3150');
    r(-6, -1, 4, 1, '#1b1c2e'); r(2, -1, 4, 1, '#1b1c2e');
  }
  if (dir === 'left' || dir === 'right') {
    r(dir === 'left' ? -2 : -1, -16 + o, 3, 8, dark);
    r(dir === 'left' ? -2 : -1, -9 + o, 3, 2, look.skin);
  } else {
    r(-9, -17 + o, 2, 8, dark); r(7, -17 + o, 2, 8, dark);
    r(-9, -10 + o, 2, 2, look.skin); r(7, -10 + o, 2, 2, look.skin);
  }
  // Cheveux longs (fille) : dans le dos et sur les épaules, dessinés avant la tête
  if (girl) {
    if (dir === 'down') { r(-8, -27 + o, 3, 10, look.hair); r(5, -27 + o, 3, 10, look.hair); }
    if (dir === 'left') r(1, -27 + o, 7, 11, look.hair);
    if (dir === 'right') r(-8, -27 + o, 7, 11, look.hair);
  }
  r(-7, -30 + o, 14, 12, look.skin);
  if (dir === 'up') {
    r(-7, -31 + o, 14, girl ? 15 : 11, look.hair);
    if (girl) r(-8, -27 + o, 16, 10, look.hair);
  } else {
    r(-7, -31 + o, 14, 5, look.hair);
    if (dir === 'down') { r(-7, -27 + o, 2, 4, look.hair); r(5, -27 + o, 2, 4, look.hair); }
    if (dir === 'left') r(1, -27 + o, 6, 6, look.hair);
    if (dir === 'right') r(-7, -27 + o, 6, 6, look.hair);
    const eye = '#1d1e30';
    if (dir === 'down') { r(-4, -24 + o, 2, 3, eye); r(2, -24 + o, 2, 3, eye); }
    if (dir === 'left') r(-6, -24 + o, 2, 3, eye);
    if (dir === 'right') r(4, -24 + o, 2, 3, eye);
    if (girl) { // cils
      if (dir === 'down') { r(-5, -25 + o, 1, 1, eye); r(4, -25 + o, 1, 1, eye); }
      if (dir === 'left') r(-7, -25 + o, 1, 1, eye);
      if (dir === 'right') r(6, -25 + o, 1, 1, eye);
    }
  }
  if (look.deco === 'metal' && dir === 'down') drawMetalPrint(r, look, o);
  if (look.deco === 'unicorn') drawUnicornHeadband(r, dir, -31 + o);
  if (ACCESSORIES[look.deco]) ACCESSORIES[look.deco](r, dir, -31 + o, o);
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

// Chaise tournée vers le haut (vue de dos) : son dossier est devant la personne
// assise, il est donc redessiné par-dessus l'avatar.
function drawChairBack(g, o) {
  if (o.kind !== 'chair' || o.dir !== 'up') return;
  const px = o.x * TILE, py = o.y * TILE;
  g.fillStyle = shade(o.color, -30);
  g.beginPath(); g.roundRect(px + 5, py + 14, 22, 13, 3); g.fill();
  g.fillStyle = shade(o.color, 12);
  g.beginPath(); g.roundRect(px + 7, py + 16, 18, 3, 1.5); g.fill();
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
      if (o.dir === 'down') rr(px + 5, py + 1, 22, 11, 3, back); // dossier derrière l'assise
      rr(px + 7, py + (o.dir === 'down' ? 9 : 7), 18, 16, 4, seat);
      rect(px + 9, py + 25, 2, 5, '#444'); rect(px + 21, py + 25, 2, 5, '#444');
      if (o.dir === 'right') rr(px + 4, py + 4, 5, 22, 2, back);
      if (o.dir === 'left') rr(px + 23, py + 4, 5, 22, 2, back);
      drawChairBack(g, o);
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
      // micro sur pied
      rect(px + 31, py - 6, 2, 11, '#2b2d42');
      rr(px + 29, py - 10, 6, 6, 3, '#4a4e69');
      rect(px + 30, py - 9, 4, 1, '#9aa0b8');
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
let nextDashAt = 0;
let sprinting = false;

const prefs = (() => { try { return JSON.parse(localStorage.getItem('rt-prefs')) || {}; } catch { return {}; } })();
const look = {
  shirt: prefs.look?.shirt || PALETTE.shirt[Math.floor(Math.random() * PALETTE.shirt.length)],
  hair: prefs.look?.hair || PALETTE.hair[0],
  skin: prefs.look?.skin || PALETTE.skin[1],
  deco: cleanDeco(prefs.look?.deco),
  style: prefs.look?.style === 'girl' ? 'girl' : 'boy',
};

// ============================================================
// Salles : chaque nom de salle est un espace séparé, partagé par lien
// ============================================================
const cleanRoom = (v) => String(v).toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'lobby';

function roomUrl(id) {
  const url = new URL(location.href);
  url.hash = '';
  if (id === 'lobby') url.searchParams.delete('room'); else url.searchParams.set('room', id);
  return url.toString();
}

async function shareLink(id) {
  const url = roomUrl(id);
  const label = id === 'lobby' ? 'l\'espace principal' : `la salle « ${id} »`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Remote Town', text: `Rejoins-moi dans ${label}`, url }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    if (!$('#app').hidden) return toast(`Lien de ${label} copié`);
    const btn = $('#copyLinkJoin');
    btn.classList.add('done');
    setTimeout(() => btn.classList.remove('done'), 1800);
  } catch {
    prompt('Copiez ce lien :', url);
  }
}

// ============================================================
// Écran d'accueil
// ============================================================
// Profil (nom, apparence, dernière salle) mémorisé dans le navigateur à chaque modification
const nameInput = $('#nameInput');
nameInput.value = prefs.name || '';
const roomInput = $('#roomInput');
roomInput.value = new URLSearchParams(location.search).get('room') ?? prefs.room ?? '';
function savePrefs() {
  try {
    localStorage.setItem('rt-prefs', JSON.stringify({ name: nameInput.value.trim(), look, room: roomInput.value.trim() }));
  } catch {}
}
const showRoomLink = () => { $('#roomLink').textContent = roomUrl(cleanRoom(roomInput.value)); };
nameInput.addEventListener('input', savePrefs);
roomInput.addEventListener('input', () => { showRoomLink(); savePrefs(); });
$('#copyLinkJoin').onclick = () => shareLink(cleanRoom(roomInput.value));
showRoomLink();
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
document.querySelectorAll('#decoChips button').forEach((b) => {
  b.classList.toggle('sel', (b.dataset.deco || null) === look.deco);
  b.onclick = () => {
    look.deco = cleanDeco(b.dataset.deco);
    document.querySelectorAll('#decoChips button').forEach((x) => x.classList.toggle('sel', x === b));
    drawPreview();
    savePrefs();
  };
});
drawPreview();
document.fonts?.ready.then(drawPreview);
savePrefs(); // garde la couleur tirée au hasard dès la première visite

// L'écran de connexion sert aussi à modifier son personnage une fois dans l'espace
let editingProfile = false;

function syncPickers() {
  document.querySelectorAll('.swatches').forEach((box) => {
    box.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.title === look[box.dataset.part]));
  });
  document.querySelectorAll('#styleChips button').forEach((b) => b.classList.toggle('sel', b.dataset.style === look.style));
  document.querySelectorAll('#decoChips button').forEach((b) => b.classList.toggle('sel', (b.dataset.deco || null) === look.deco));
  drawPreview();
}

function openProfile() {
  if (!me) return;
  editingProfile = true;
  Object.assign(look, me.look);
  nameInput.value = me.name;
  syncPickers();
  $('#joinSub').textContent = 'Modifiez votre personnage : les autres verront le changement tout de suite.';
  $('#roomField').hidden = true;
  $('#joinNote').hidden = true;
  $('#joinSubmit').textContent = 'Enregistrer';
  $('#profileActions').hidden = false;
  $('#join').hidden = false;
  $('#reactMenu').hidden = true;
  keys.clear();
}

function closeProfile(restore = true) {
  if (restore) { Object.assign(look, me.look); nameInput.value = me.name; savePrefs(); }
  editingProfile = false;
  $('#join').hidden = true;
  canvas.focus?.();
}

function applyProfile() {
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();
  me.name = name;
  me.look = { ...look };
  savePrefs();
  $('#meName').textContent = me.name;
  const mc = $('#meAvatar').getContext('2d');
  mc.clearRect(0, 0, mc.canvas.width, mc.canvas.height);
  drawAvatar(mc, me.look, 16, 37, 'down');
  net?.hello.send(profile()).catch(() => {}); // les autres mettent à jour nom et apparence
  renderPeople();
  closeProfile(false);
}

function showHelp() {
  try { localStorage.removeItem('rt-help'); } catch {}
  $('#help').hidden = false;
  $('#help').classList.add('forced');
}

$('#profileCancel').onclick = () => closeProfile();
$('#profileHelp').onclick = () => { closeProfile(); showHelp(); };
$('#mePill').onclick = openProfile;
$('#mePill').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfile(); } };

$('#joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (editingProfile) return applyProfile();
  const name = nameInput.value.trim();
  if (!name) return;
  savePrefs();
  ROOM_ID = cleanRoom(roomInput.value);
  history.replaceState(null, '', roomUrl(ROOM_ID));
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
// Relais Nostr choisis pour leur fiabilité (la sélection automatique de Trystero
// en incluait des morts ou lents, d'où des participants qui ne se voyaient pas)
const RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://nostr.oxtr.dev',
  'wss://relay.nostr.net',
  'wss://relay.snort.social',
  'wss://relay.damus.io',
  'wss://offchain.pub',
  'wss://nostr.bitcoiner.social',
];
let ROOM_ID = 'lobby';
const COLOR = /^#[0-9a-f]{6}$/i;
const DIR_NAMES = ['up', 'down', 'left', 'right'];
let room = null;
let net = null;
let joinedAt = 0;

const profile = () => ({ name: me.name, look: me.look, x: me.x, y: me.y, dir: me.dir, seated: me.seated, sitAt: me.sitAt || 0, crouch: !!me.crouch, onAir: !!me.onAir, hand: !!me.hand, mic: micOn, ptt: pttHeld, sharing });

function connect(name) {
  const [x, y] = MAP.spawns[Math.floor(Math.random() * MAP.spawns.length)];
  myId = tr.selfId;
  myIds.add(myId);
  me = {
    id: myId, isMe: true, name, look: { ...look }, x, y, rx: x, ry: y, dir: 'down',
    zone: zoneAt(x, y), seated: false, mic: false, ptt: false, sharing: false, walk: 0, level: 0,
  };
  users.set(myId, me);
  joinedAt = performance.now();
  joinNet();
  addEventListener('pagehide', () => room?.leave());
  watchConnection();
  startApp();
}

function joinNet() {
  room = tr.joinRoom({ appId: APP_ID, relayConfig: { urls: RELAYS } }, ROOM_ID);
  net = {
    hello: room.makeAction('hello', { onMessage: onHello }),
    move: room.makeAction('move', { onMessage: onRemoteMove }),
    state: room.makeAction('state', { onMessage: onRemoteState }),
    chat: room.makeAction('chat', { onMessage: (d, { peerId }) => users.has(peerId) && onChat(d?.channel, d?.msg, peerId) }),
    react: room.makeAction('react', {
      onMessage: (d, { peerId }) => { const u = users.get(peerId); if (u && REACTIONS.includes(d?.e)) addReaction(u, d.e); },
    }),
    history: room.makeAction('history', { kind: 'request', onRequest: (d) => chatStore.get(String(d?.channel)) || [] }),
  };
  room.onPeerJoin = (id) => { helloAsked.set(id, performance.now()); net.hello.send(profile(), { target: id }).catch(() => {}); };
  room.onPeerLeave = onPeerLeave;
  room.onPeerStream = onPeerStream;
}

// ============================================================
// Attente et reconnexion. Il n'y a pas d'hôte : chacun est relié à tous.
// Si on se retrouve seul (tout le monde est parti, ou notre connexion a
// sauté), on attend et on rejoint la salle à nouveau automatiquement.
// ============================================================
let rejoining = false;
let lastRejoin = 0;
let aloneSince = 0; // 0 = pas seul
const helloAsked = new Map(); // id du pair -> dernière présentation envoyée
let connected = true;
let relaysDownSince = 0;
// Module Trystero courant : « Relancer la connexion » en charge une instance neuve,
// car Trystero abandonne définitivement un relais après ~2 min d'échecs.
let tr = trysteroModule;
const myIds = new Set(); // nos identifiants successifs (un par instance de Trystero)

const relaysUp = () => {
  try { return Object.values(tr.getRelaySockets()).some((s) => s.readyState === 1); } catch { return true; }
};

async function relaunch() {
  if (rejoining) return;
  rejoining = true;
  lastRejoin = performance.now();
  const btn = $('#waitRetry');
  btn.disabled = true; btn.textContent = 'Reconnexion…';
  for (const id of [...users.keys()]) if (id !== myId) onPeerLeave(id, true);
  room?.leave().catch(() => {});
  room = null; net = null;
  try {
    tr = await import(`./vendor/trystero-nostr.js?instance=${Date.now()}`);
  } catch {
    toast('Impossible de relancer la connexion : vérifiez votre réseau.');
  }
  if (tr.selfId !== myId) {
    users.delete(myId);
    myId = me.id = tr.selfId;
    myIds.add(myId);
    users.set(myId, me);
    helloAsked.clear();
  }
  relaysDownSince = 0;
  connected = true;
  joinNet();
  rejoining = false;
  btn.disabled = false;
  renderPeople(); updatePresence();
}

async function rejoin() {
  if (rejoining || !room) return;
  rejoining = true;
  lastRejoin = performance.now();
  for (const id of [...users.keys()]) if (id !== myId) onPeerLeave(id, true);
  const old = room;
  room = null; net = null;
  await Promise.race([old.leave().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
  joinNet();
  rejoining = false;
  updatePresence();
}

function updatePresence() {
  const alone = users.size <= 1;
  if (!alone) aloneSince = 0;
  else if (!aloneSince) aloneSince = performance.now();
  const box = $('#waiting');
  // On laisse quelques secondes aux connexions pour s'établir avant d'afficher l'attente
  const show = !connected || (alone && performance.now() - aloneSince > 3000);
  box.hidden = !show;
  box.classList.toggle('offline', !connected);
  $('#waiting .w-text').textContent = !connected
    ? 'Connexion aux relais perdue.'
    : 'En attente des autres participants… Vous serez reconnecté·e dès leur retour.';
  if (!rejoining) $('#waitRetry').textContent = connected ? 'Relancer' : 'Relancer la connexion';
}

function watchConnection() {
  setInterval(() => {
    // Relais tous injoignables depuis plus de 8 s (le temps qu'ils s'ouvrent au démarrage)
    if (relaysUp()) relaysDownSince = 0;
    else if (!relaysDownSince) relaysDownSince = performance.now();
    connected = navigator.onLine && (!relaysDownSince || performance.now() - relaysDownSince < 8000);
    updatePresence();
    // Seul depuis un moment : on rejoint la salle (sans effet si elle est vraiment vide)
    if (users.size <= 1 && aloneSince && performance.now() - aloneSince > 8000 && performance.now() - lastRejoin > 30000) rejoin();
    // Pair connecté mais jamais présenté (message perdu) : on se représente et on lui demande de faire pareil
    for (const id of Object.keys(room?.getPeers?.() || {})) {
      if (users.has(id) || performance.now() - (helloAsked.get(id) || 0) < 2000) continue;
      helloAsked.set(id, performance.now());
      net?.hello.send({ ...profile(), ask: true }, { target: id }).catch(() => {});
    }
  }, 1000);
  addEventListener('online', () => setTimeout(rejoin, 1000));
  addEventListener('offline', () => { connected = false; updatePresence(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && users.size <= 1 && performance.now() - lastRejoin > 5000) rejoin();
  });
  $('#waitInvite').onclick = () => shareLink(ROOM_ID);
  $('#waitRetry').onclick = relaunch;
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
    deco: cleanDeco(d?.look?.deco),
    style: d?.look?.style === 'girl' ? 'girl' : 'boy',
  };
  if (!setPos(u, d) && !known) setPos(u, { x: MAP.spawns[0][0], y: MAP.spawns[0][1] });
  u.rx = u.x; u.ry = u.y;
  u.seated = !!d?.seated;
  u.sitAt = Number(d?.sitAt) || 0;
  u.crouch = !!d?.crouch;
  if (d?.ask) net?.hello.send(profile(), { target: peerId }).catch(() => {});
  Object.assign(u, { mic: !!d?.mic, ptt: !!d?.ptt, sharing: !!d?.sharing, onAir: !!d?.onAir, hand: !!d?.hand });
  users.set(peerId, u);
  resolveOverlap(u);
  if (!known) {
    if (performance.now() - joinedAt > 5000) toast(`${u.name} a rejoint l'espace`);
    if (!globalHistoryLoaded) { globalHistoryLoaded = true; fetchHistory('global', [peerId]); }
    if (u.zone === me.zone) fetchHistory(me.zone, [peerId]);
  }
  renderPeople(); updateRouting(); updatePresence();
}

function onRemoteMove(d, { peerId }) {
  const u = users.get(peerId);
  if (!u) return;
  const prevZone = u.zone;
  if (!setPos(u, d)) return;
  u.seated = !!d.seated;
  u.sitAt = Number(d.sitAt) || 0;
  u.crouch = !!d.crouch;
  if (d.dash) startDash(u);
  if (Math.abs(u.rx - u.x) > 3 || Math.abs(u.ry - u.y) > 3) { u.rx = u.x; u.ry = u.y; }
  resolveOverlap(u);
  updateRouting();
  if (u.zone !== prevZone) renderPeople();
}

function onRemoteState(d, { peerId }) {
  const u = users.get(peerId);
  if (!u) return;
  const wasTalking = pttReaches(u);
  if (d?.ptt && !u.ptt) u.pttAt = performance.now();
  if (d?.hand && !u.hand) { u.handAt = performance.now(); if (u.zone === me.zone) toast(`✋ ${u.name} lève la main`); }
  Object.assign(u, { mic: !!d?.mic, ptt: !!d?.ptt, sharing: !!d?.sharing, onAir: !!d?.onAir, hand: !!d?.hand });
  const talking = pttReaches(u);
  if (talking && !wasTalking) walkieBeep('start', 0.12);
  if (wasTalking && !talking) walkieBeep('end', 0.12);
  updateRouting(); renderPeople();
}

function onPeerLeave(id, silent = false) {
  const u = users.get(id);
  users.delete(id);
  closeLink(id);
  if (u && !silent) toast(`${u.name} est parti·e`);
  renderPeople(); updateRouting(); updatePresence();
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
    L.audioStream = stream;
    L.fx = null;
    L.analyser = makeAnalyser(stream);
    setSpeakerFx(L, isOnAir(users.get(peerId)));
  } else {
    L.videoStream = stream;
    renderVideos();
  }
}

function closeLink(id) {
  const L = links.get(id);
  if (!L) return;
  links.delete(id);
  setSpeakerFx(L, false);
  L.audioEl?.remove();
  L.micOut?.getTracks().forEach((t) => t.stop());
  L.screenOut?.getTracks().forEach((t) => t.stop());
  renderVideos();
}

function addOut(track, kind, peerId) {
  if (!room) { track.stop(); return null; }
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
  for (const [id, L] of links) setSpeakerFx(L, isOnAir(users.get(id)));
  renderVideos();
  updateUI();
}

// ============================================================
// Micro, N pour parler, partage d'écran
// ============================================================
function pushState() {
  me.mic = micOn; me.ptt = pttHeld; me.sharing = sharing;
  broadcast('state', { mic: micOn, ptt: pttHeld, sharing, onAir: !!me.onAir, hand: !!me.hand });
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
  if (on) me.pttAt = performance.now();
  walkieBeep(on ? 'start' : 'end', 0.25);
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
    room?.removeStream(L.screenOut, { target: id });
    L.screenOut.getTracks().forEach((t) => t.stop());
    L.screenOut = null;
  }
  sharing = false;
  pushState();
}

// ============================================================
// Talkie-walkie : bips d'ouverture / fin de N et dessin de l'appareil
// ============================================================
// N d'un autre participant qui nous parvient (sans compter son micro de bureau)
const pttReaches = (u) => !!me && sendsAudio({ ...u, mic: false }, me);

function walkieBeep(kind, volume) {
  if (!audioCtx) return;
  audioCtx.resume?.();
  const t0 = audioCtx.currentTime + 0.01;
  const out = audioCtx.createGain();
  out.gain.value = volume;
  out.connect(audioCtx.destination);
  // Deux tons courts : montant à l'ouverture, descendant à la fin
  const notes = kind === 'start' ? [[1300, 0, 0.06], [1850, 0.075, 0.08]] : [[1850, 0, 0.05], [1150, 0.065, 0.09]];
  for (const [freq, at, dur] of notes) {
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0, t0 + at);
    env.gain.linearRampToValueAtTime(0.3, t0 + at + 0.005);
    env.gain.setValueAtTime(0.3, t0 + at + dur - 0.01);
    env.gain.linearRampToValueAtTime(0, t0 + at + dur);
    osc.connect(env).connect(out);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.02);
  }
  if (kind === 'end') {
    // Petit souffle radio (squelch) après le bip de fin
    const len = Math.floor(audioCtx.sampleRate * 0.14);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    const band = audioCtx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 2200; band.Q.value = 0.8;
    const ng = audioCtx.createGain();
    ng.gain.value = 0.18;
    noise.connect(band).connect(ng).connect(out);
    noise.start(t0 + 0.17);
  }
}

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

// ============================================================
// Pupitre : effet « haut-parleur » sur la voix diffusée à tout le monde.
// Seulement pendant la diffusion : la voix passe alors par Web Audio (filtre
// de sonorisation, légère saturation, écho de salle) et l'élément <audio> est coupé.
// Si Web Audio n'est pas disponible, on garde le son normal.
// ============================================================
let roomImpulse = null;
function getRoomImpulse() {
  if (roomImpulse) return roomImpulse;
  const len = Math.floor(audioCtx.sampleRate * 0.7);
  roomImpulse = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = roomImpulse.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return roomImpulse;
}

function setSpeakerFx(L, on) {
  if (!L?.audioEl) return;
  const ready = audioCtx && audioCtx.state === 'running' && L.audioStream;
  if (on && ready && !L.fx) {
    try {
      const src = audioCtx.createMediaStreamSource(L.audioStream);
      const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
      const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
      const mid = audioCtx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1800; mid.gain.value = 6; mid.Q.value = 0.9;
      const shaper = audioCtx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
      shaper.curve = curve;
      const dry = audioCtx.createGain(); dry.gain.value = 0.7;
      const verb = audioCtx.createConvolver(); verb.buffer = getRoomImpulse();
      const wet = audioCtx.createGain(); wet.gain.value = 0.22;
      src.connect(hp).connect(lp).connect(mid).connect(shaper);
      shaper.connect(dry).connect(audioCtx.destination);
      shaper.connect(verb).connect(wet).connect(audioCtx.destination);
      L.fx = { src, out: [dry, wet] };
      L.audioEl.muted = true;
    } catch {
      L.fx = null;
      L.audioEl.muted = false;
    }
  } else if (!on && L.fx) {
    try { L.fx.src.disconnect(); L.fx.out.forEach((n) => n.disconnect()); } catch {}
    L.fx = null;
    L.audioEl.muted = false;
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

// ============================================================
// Réactions (1 à 6) et main levée (H)
// ============================================================
const REACTIONS = ['👍', '❤️', '😂', '🎉', '👏', '😮'];
const REACT_MS = 3000;
let lastReactAt = 0;

function addReaction(u, e) {
  u.reacts = [...(u.reacts || []), { e, t: performance.now() }].slice(-5);
}

function sendReaction(e) {
  if (!me || !REACTIONS.includes(e) || performance.now() - lastReactAt < 250) return;
  lastReactAt = performance.now();
  addReaction(me, e);
  broadcast('react', { e });
}

function toggleHand() {
  if (!me) return;
  me.hand = !me.hand;
  if (me.hand) me.handAt = performance.now();
  pushState();
  renderHandBtn();
}

// Au-dessus de l'étiquette : la main levée (fixe) puis les réactions qui montent et s'effacent
function drawHandAndReactions(u, sx, top, now) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  let base = top;
  if (u.hand) {
    const k = Math.min(1, (now - (u.handAt || 0)) / 250);
    const size = 20 * (k < 1 ? 0.5 + 0.7 * k : 1);
    ctx.save();
    ctx.translate(sx, base);
    ctx.rotate(Math.sin(now / 220) * 0.18);
    ctx.font = `${size}px sans-serif`;
    ctx.fillText('✋', 0, 0);
    ctx.restore();
    base -= 24;
  }
  if (u.reacts?.length) {
    u.reacts = u.reacts.filter((r) => now - r.t < REACT_MS);
    u.reacts.forEach((r, i) => {
      const age = (now - r.t) / REACT_MS;
      const pop = age < 0.07 ? 0.4 + (age / 0.07) * 0.9 : age < 0.12 ? 1.3 - ((age - 0.07) / 0.05) * 0.3 : 1;
      ctx.globalAlpha = age > 0.7 ? (1 - age) / 0.3 : 1;
      ctx.font = `${Math.round(24 * pop)}px sans-serif`;
      ctx.fillText(r.e, sx + Math.sin(r.t + i) * 10, base - age * 36);
    });
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = 'middle';
}

function renderHandBtn() {
  const b = $('#handBtn');
  b.classList.toggle('active', !!me?.hand);
  b.title = me?.hand ? 'Baisser la main (H)' : 'Lever la main (H)';
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
  if (!net) return toast('Reconnexion en cours, réessayez dans un instant.');
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
  if (!visible && !myIds.has(msg.from)) chat.unread[key]++;
  if (!visible && !myIds.has(msg.from) && $('#sidebar').classList.contains('closed')) {
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
    const b = document.createElement('b'); b.textContent = myIds.has(m.from) ? `${m.name} (vous)` : m.name;
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
  return u.ptt || isOnAir(u) || (u.mic && ROOM_TYPES.includes(zoneType(u.zone)));
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
    icons.innerHTML = (u.hand ? '<span class="p-hand">✋</span>' : '') + (isTransmitting(u) ? ICON_MIC : '') + (u.sharing ? ICON_SCREEN : '');
    li.append(c, info, icons);
    if (u.isMe) { li.className = 'me-row'; li.title = 'Modifier mon personnage'; li.onclick = openProfile; }
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
    : z.type === 'main' ? 'micro partagé avec la salle · pupitre (E) : parler à tout le monde'
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

  const speakers = [...users.values()].filter(isOnAir);
  const bc = $('#broadcast');
  bc.hidden = !speakers.length;
  if (speakers.length) {
    const names = speakers.map((u) => (u.isMe ? 'Vous' : u.name)).join(', ');
    bc.textContent = `📢 ${names} — en direct depuis le pupitre`;
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
REACTIONS.forEach((e, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = e; b.title = `${e} (touche ${i + 1})`;
  b.onclick = () => { sendReaction(e); $('#reactMenu').hidden = true; };
  $('#reactMenu .r-emojis').append(b);
});
$('#reactBtn').onclick = (e) => { e.stopPropagation(); $('#reactMenu').hidden = !$('#reactMenu').hidden; };
$('#handBtn').onclick = toggleHand;
addEventListener('pointerdown', (e) => { if (!e.target.closest('#reactMenu, #reactBtn')) $('#reactMenu').hidden = true; });
$('#inviteBtn').onclick = () => shareLink(ROOM_ID);
$('#dashBtn').onclick = () => dash();
if (!navigator.mediaDevices?.getDisplayMedia) $('#shareBtn').hidden = true; // mobiles : pas de partage d'écran
$('#shareBtn').onclick = toggleShare;
const pttBtn = $('#pttBtn');
pttBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); pttBtn.setPointerCapture(e.pointerId); setPtt(true); });
pttBtn.addEventListener('pointerup', () => setPtt(false));
pttBtn.addEventListener('pointercancel', () => setPtt(false));
$('.help-close').onclick = () => { $('#help').hidden = true; $('#help').classList.remove('forced'); try { localStorage.setItem('rt-help', '1'); } catch {} };
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
  if (e.key === 'Shift') sprinting = true;
  if (!me) return;
  if (editingProfile) { if (e.key === 'Escape') closeProfile(); return; }
  if (e.key === 'Escape') {
    if (focusKey) closeFocus();
    document.activeElement?.blur();
    return;
  }
  if (typing()) return;
  if (e.code === 'Enter') { e.preventDefault(); if ($('#sidebar').classList.contains('closed') || activePanel !== 'chat') showPanel('chat'); else $('#chatInput').focus(); return; }
  if (e.code === 'KeyN') { e.preventDefault(); if (!e.repeat) setPtt(true); return; }
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) dash(); return; }
  if (e.code === 'KeyE') { if (!e.repeat) interact(); return; }
  if (e.code === 'KeyC') { if (!e.repeat) toggleCrouch(); return; }
  if (e.code === 'KeyH') { if (!e.repeat) toggleHand(); return; }
  const n = /^(Digit|Numpad)([1-6])$/.exec(e.code);
  if (n) { if (!e.repeat) sendReaction(REACTIONS[n[2] - 1]); return; }
  if (e.key.toLowerCase() === 'm' && !e.repeat) { toggleMic(); return; }
  if (DIRS[e.code]) {
    e.preventDefault();
    keys.add(DIRS[e.code]); path = null;
    if (!e.repeat && (me.dir !== DIRS[e.code] || me.seated)) { me.dir = DIRS[e.code]; me.seated = false; sendMove(); }
  }
});
addEventListener('keyup', (e) => {
  if (e.key === 'Shift') sprinting = false;
  if (e.code === 'Space' && !typing()) e.preventDefault(); // évite d'« appuyer » sur le bouton qui a le focus
  if (e.code === 'KeyN') setPtt(false);
  if (DIRS[e.code]) keys.delete(DIRS[e.code]);
});
addEventListener('blur', () => { keys.clear(); sprinting = false; if (me) setPtt(false); });
$('#chatInput').addEventListener('focus', () => keys.clear());

function heldDir() {
  const order = ['up', 'down', 'left', 'right'];
  return [...keys].reverse().find((d) => order.includes(d));
}

function bfs(sx, sy, tx, ty) {
  if (!canWalk(tx, ty)) return null;
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
      if (!canWalk(nx, ny)) continue;
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
  airTarget = false;
  if (ty === LECTERN.y && tx >= LECTERN.x && tx < LECTERN.x + LECTERN.w) {
    if (me.onAir) return stopOnAir();
    const spot = freeLecternSpot();
    if (!spot) return toast('Quelqu\'un est déjà au pupitre');
    if (spot[0] === me.x && spot[1] === me.y) return startOnAir();
    sitTarget = null; airTarget = true;
    path = bfs(me.x, me.y, spot[0], spot[1]);
    return;
  }
  if (chairAt(tx, ty) && chairBusy(tx, ty)) { path = sitTarget = null; return toast('Cette chaise est déjà prise'); }
  sitTarget = chairAt(tx, ty) ? [tx, ty] : null;
  if (sitTarget && tx === me.x && ty === me.y) { sitTarget = null; return sitOn(tx, ty); }
  path = bfs(me.x, me.y, tx, ty);
});

// ============================================================
// Chaises : E pour s'asseoir / se lever, ou clic sur une chaise
// ============================================================
let sitTarget = null;
let airTarget = false;

// ============================================================
// Pupitre : E (ou clic dessus) pour parler à tout le monde
// ============================================================
function freeLecternSpot() {
  const taken = (x, y) => someoneAt(x, y, (u) => isOnAir(u));
  if (LECTERN_SPOTS.some(([x, y]) => x === me.x && y === me.y) && !taken(me.x, me.y)) return [me.x, me.y];
  return LECTERN_SPOTS.find(([x, y]) => !taken(x, y)) || null;
}

async function startOnAir() {
  const spot = freeLecternSpot();
  if (!spot) return toast('Quelqu\'un est déjà au pupitre');
  if (!micTrack && !(await initMic())) return;
  path = null; sitTarget = null; airTarget = false;
  const moved = spot[0] !== me.x || spot[1] !== me.y;
  me.x = spot[0]; me.y = spot[1];
  me.dir = 'down';
  me.seated = false; me.crouch = false;
  me.onAir = true;
  nextStepAt = performance.now() + STEP_MS;
  sendMove();
  if (moved) onMyMove();
  pushState();
  toast('📢 Vous parlez à tout le monde. E pour rendre la parole.');
}

function stopOnAir() {
  if (!me.onAir) return;
  me.onAir = false;
  pushState();
}

function interact() {
  if (!me || typing()) return;
  if (me.onAir) return stopOnAir();
  if (nearLectern(me.x, me.y) && !me.seated) return startOnAir();
  toggleSit();
}
const someoneAt = (x, y, pred) => [...users.values()].some((u) => !u.isMe && u.x === x && u.y === y && pred(u));
// On peut traverser les gens ; seule une chaise où quelqu'un est assis est réservée
const chairBusy = (x, y) => someoneAt(x, y, (u) => u.seated);
const canWalk = (x, y) => !isBlocked(x, y);

// Chaise sous soi, sinon devant soi, sinon sur les côtés
function chairNearMe() {
  const free = (x, y) => chairAt(x, y) && !chairBusy(x, y);
  if (free(me.x, me.y)) return [me.x, me.y];
  for (const d of [me.dir, ...DIR_NAMES.filter((n) => n !== me.dir)]) {
    const [dx, dy] = DELTA[d];
    if (free(me.x + dx, me.y + dy)) return [me.x + dx, me.y + dy];
  }
  return null;
}

function sitOn(x, y) {
  const moved = x !== me.x || y !== me.y;
  path = null;
  me.x = x; me.y = y;
  me.dir = chairAt(x, y).dir;
  me.seated = true;
  me.crouch = false;
  me.sitAt = Date.now();
  nextStepAt = performance.now() + STEP_MS;
  sendMove();
  if (moved) onMyMove();
}

function toggleSit() {
  if (!me || typing()) return;
  if (me.seated) { me.seated = false; sendMove(); return; }
  const c = chairNearMe();
  if (c) sitOn(...c);
}

// C : s'accroupir / se relever. Accroupi, on avance à pas de loup.
const CROUCH_MS = 260;
const myStepMs = () => (me.crouch ? CROUCH_MS : sprinting ? SPRINT_MS : STEP_MS);
function toggleCrouch() {
  if (!me || typing()) return;
  me.crouch = !me.crouch;
  if (me.crouch) me.seated = false;
  sendMove();
}

function sendMove(extra) {
  broadcast('move', { x: me.x, y: me.y, dir: me.dir, seated: !!me.seated, sitAt: me.sitAt || 0, crouch: !!me.crouch, ...extra });
}

// Deux personnes assises sur la même chaise au même moment : la première arrivée
// (ou, à égalité, l'identifiant le plus petit) garde la place ; l'autre se lève à côté.
function resolveOverlap(u) {
  if (!me?.seated || !u.seated || u.isMe || u.x !== me.x || u.y !== me.y) return;
  const iLose = me.sitAt > u.sitAt || (me.sitAt === u.sitAt && myId > u.id);
  if (!iLose) return;
  const wasSeated = me.seated;
  me.seated = false;
  path = null;
  const spot = nearestFree(me.x, me.y);
  if (spot) { me.x = spot[0]; me.y = spot[1]; }
  sendMove();
  onMyMove();
  if (wasSeated) toast(`${u.name} s'est assis·e ici juste avant vous`);
}

// Case libre la plus proche (de préférence pas une chaise)
function nearestFree(sx, sy) {
  const seen = new Set([sy * MAP_W + sx]);
  const q = [[sx, sy]];
  let fallback = null;
  for (let i = 0; i < q.length && i < 400; i++) {
    const [x, y] = q[i];
    if (i > 0 && canWalk(x, y) && !someoneAt(x, y, () => true)) {
      if (!chairAt(x, y)) return [x, y];
      fallback ||= [x, y];
    }
    for (const [dx, dy] of Object.values(DELTA)) {
      const nx = x + dx, ny = y + dy, k = ny * MAP_W + nx;
      if (!isBlocked(nx, ny) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  return fallback;
}

// Espace : bond de quelques cases dans la direction regardée (ou tenue)
function dash() {
  const now = performance.now();
  if (now < nextDashAt || typing()) return;
  const dir = heldDir() || me.dir;
  const [dx, dy] = DELTA[dir];
  let n = 0;
  while (n < DASH_TILES && canWalk(me.x + dx * (n + 1), me.y + dy * (n + 1))) n++;
  me.dir = dir;
  if (!n) return;
  nextDashAt = now + DASH_COOLDOWN;
  path = null; sitTarget = null; me.seated = false; me.crouch = false;
  startDash(me);
  me.x += dx * n; me.y += dy * n;
  nextStepAt = now + 120;
  sendMove({ dash: true });
  onMyMove();
}

function startDash(u) {
  u.dashing = true;
  u.trail = u.trail || [];
  u.dust = { x: u.rx, y: u.ry, dir: u.dir, t: performance.now() };
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

function onMyMove() {
  // Quitter sa place derrière le pupitre rend la parole
  if (me.onAir && !LECTERN_SPOTS.some(([x, y]) => x === me.x && y === me.y)) stopOnAir();
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
  if (heldDir()) { sitTarget = null; airTarget = false; }
  const [dx, dy] = DELTA[dir];
  const nx = me.x + dx, ny = me.y + dy;
  const changed = me.dir !== dir || me.seated;
  me.dir = dir;
  me.seated = false;
  if (!canWalk(nx, ny)) {
    path = null;
    if (changed) sendMove();
    return;
  }
  me.x = nx; me.y = ny;
  if (path) path.shift();
  nextStepAt = now + myStepMs();
  // Arrivé sur la chaise cliquée : on s'assoit
  if (sitTarget && !path?.length && sitTarget[0] === nx && sitTarget[1] === ny && !chairBusy(nx, ny)) {
    sitTarget = null;
    me.dir = chairAt(nx, ny).dir;
    me.seated = true;
    me.crouch = false;
    me.sitAt = Date.now();
  }
  sendMove();
  onMyMove();
  if (airTarget && !path?.length) { airTarget = false; if (LECTERN_SPOTS.some(([x, y]) => x === nx && y === ny)) startOnAir(); }
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
  const zoom = Math.max(1, Math.min(2.5, Math.round(Math.min(H / (13 * TILE), W / (11 * TILE)) * 4) / 4));
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
  const now = performance.now();
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
    // Petit saut quand on appuie sur N
    const k = u.ptt && u.pttAt ? (now - u.pttAt) / 220 : 1;
    const lift = k < 1 ? Math.sin(Math.PI * k) * 4 : 0;
    const crouched = !!u.crouch && !chair;
    drawAvatar(ctx, u.look, cx, by + (chair ? -4 : 0), dir, frame, !!chair, lift, crouched);
    if (chair) drawChairBack(ctx, chair);
    if (u.ptt) drawWalkie(u, cx, by - lift + (crouched ? 5 : 0), dir, now);
    if (isOnAir(u)) drawSpeakerWaves(cx, by - 24, now);
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
    const sy = (u.ry * TILE - cam.y) * zoom - (6 + (HAT_HEIGHT[u.look?.deco] || 0)) * zoom;
    const tx = isTransmitting(u);
    const inRange = pttHeld && !u.isMe && sendsAudio(me, u);
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
    drawHandAndReactions(u, sx, sy - h - 4, now);
    ctx.font = '600 12px "DM Sans", sans-serif';
  }
  drawSitHint(zoom);
}

// Petit indice sous ses pieds quand une chaise est à portée (clavier uniquement)
const coarse = matchMedia('(pointer: coarse)');
function drawSitHint(zoom) {
  if (coarse.matches || me.walk > 0 || typing()) return;
  const text = me.onAir ? 'Rendre la parole'
    : me.seated ? 'Se lever'
    : nearLectern(me.x, me.y) ? 'Prendre la parole (tout le monde)'
    : chairNearMe() ? "S'asseoir" : null;
  if (!text) return;
  const sx = (me.rx * TILE + TILE / 2 - cam.x) * zoom;
  const sy = ((me.ry + 1) * TILE - cam.y) * zoom + 6;
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

// Accès de débogage : ouvrir la page avec ?debug
if (new URLSearchParams(location.search).has('debug')) {
  window.rt = { users, links, get room() { return room; }, get path() { return path; }, get cam() { return cam; }, get me() { return me; }, sitOn: (x, y) => sitOn(x, y), toggleSit: () => toggleSit(), rejoin: () => rejoin(), relaunch: () => relaunch(), get tr() { return tr; }, place: (x, y) => { me.x = me.rx = x; me.y = me.ry = y; sendMove(); onMyMove(); }, walkTo: (x, y) => (path = bfs(me.x, me.y, x, y)) };
}
