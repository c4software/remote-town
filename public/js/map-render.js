// Rendu de la carte (sols, murs, mobilier), pré-calculé une fois dans un canvas hors écran.
import { WORLD_H, WORLD_W } from './config.js';
import { MAP, MAP_H, MAP_W, T, TILE, shade, tileAt, zoneAt } from './world.js';

const MS = 2; // résolution du canvas de la carte
export function renderMap() {
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
  return c;
}

// Chaise tournée vers le haut (vue de dos) : son dossier est devant la personne
// assise, il est donc redessiné par-dessus l'avatar.
export function drawChairBack(g, o) {
  if (o.dir !== 'up') return;
  const px = o.x * TILE, py = o.y * TILE;
  if (o.kind === 'sofa') { // la partie du dossier (et l'accoudoir) de cette place du canapé
    const s = o.sofa, d = shade(o.color, -35), sx = s.x * TILE, sw = s.w * TILE;
    g.fillStyle = d;
    g.fillRect(Math.max(px, sx + 2), py + 22, Math.min(px + TILE, sx + sw - 2) - Math.max(px, sx + 2), 9);
    if (o.x === s.x) { g.beginPath(); g.roundRect(sx, py + 6, 7, 22, 3); g.fill(); }
    if (o.x === s.x + s.w - 1) { g.beginPath(); g.roundRect(sx + sw - 7, py + 6, 7, 22, 3); g.fill(); }
    return;
  }
  if (o.kind !== 'chair') return;
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
