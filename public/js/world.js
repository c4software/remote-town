// Monde : carte, zones et règles « qui entend / voit qui ». Module pur (ni DOM ni état),
// testable seul avec Node.

export const TILE = 32;
export const MAP_W = 77;
export const MAP_H = 22;
export const PROX_RADIUS = 4; // rayon (en cases) du "N pour parler"

export const T = { WALL: 1, HALL: 2, ROOM: 3, MAIN: 4, CLASS: 5 };

const CARPETS = [
  '#9fbfe0', '#a9d8bd', '#efc6a8', '#cbb9e6', '#f2d797',
  '#f0b3c0', '#a7d6db', '#d4dba0', '#c4c8d8', '#e8b892',
];

// Porte des espaces (dans le mur du couloir) et la case devant elle, d'où l'on part
// et où l'on arrive en changeant d'espace
export const PORTAL = { x: 24, y: 8 };
export const PORTAL_SPOT = [24, 9];
export const nearPortal = (x, y) => y === PORTAL_SPOT[1] && Math.abs(x - PORTAL_SPOT[0]) <= 1;

function build() {
  const tiles = new Uint8Array(MAP_W * MAP_H).fill(T.WALL);
  const objects = [];
  const zones = [];
  const fill = (x, y, w, h, t) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) tiles[j * MAP_W + i] = t;
  };
  const obj = (kind, x, y, w = 1, h = 1, extra = {}) =>
    objects.push({ kind, x, y, w, h, block: true, ...extra });

  // --- Bureau principal (à gauche) ---
  fill(1, 1, 14, 20, T.MAIN);
  zones.push({ id: 'main', name: 'Bureau principal', type: 'main', x: 1, y: 1, w: 14, h: 20 });
  obj('screen', 4, 0, 8, 1, { block: false });
  obj('rug', 3, 1, 10, 3, { block: false, color: '#5b5fa8' });
  obj('lectern', 7, 2, 2, 1);
  for (const y of [5, 7, 9, 11]) {
    for (const x of [3, 4, 5, 6, 9, 10, 11, 12]) obj('chair', x, y, 1, 1, { block: false, dir: 'up', color: '#d9534f' });
  }
  obj('rug', 3, 15, 10, 5, { block: false, color: '#c98a5a' });
  // Canapés : chaque case est une place assise (voir chairs plus bas)
  obj('sofa', 5, 15, 4, 1, { dir: 'down', color: '#4f7fd1', block: false });
  obj('ctable', 6, 17, 2, 1);
  obj('sofa', 5, 19, 4, 1, { dir: 'up', color: '#4f7fd1', block: false });
  for (const [x, y] of [[1, 1], [14, 1], [1, 20], [14, 20], [1, 13], [14, 13]]) obj('plant', x, y);

  // --- Couloir ---
  fill(16, 9, 44, 4, T.HALL);
  fill(15, 10, 1, 2, T.HALL); // porte vers le bureau principal
  for (const [x, y] of [[16, 9], [16, 12], [59, 9], [59, 12], [32, 12], [50, 12]]) obj('plant', x, y);
  obj('cooler', 41, 12);
  obj('bench', 23, 12, 3, 1, { color: '#7d5a3c' });
  // Porte vers les autres espaces de travail, dans le mur entre les bureaux 1 et 2
  obj('portal', PORTAL.x, PORTAL.y, 1, 1, { block: false });

  // --- Salle de classe (au bout du couloir) ---
  fill(61, 1, 15, 20, T.CLASS);
  fill(60, 10, 1, 2, T.HALL); // porte depuis le couloir
  zones.push({ id: 'class', name: 'Salle de classe', type: 'class', x: 61, y: 1, w: 15, h: 20 });
  obj('blackboard', 64, 0, 9, 1, { block: false });
  obj('tdesk', 67, 3, 3, 1);
  obj('chair', 68, 2, 1, 1, { block: false, dir: 'down', color: '#2a9d8f' });
  for (const y of [6, 9, 12, 15]) {
    for (const x of [63, 66, 70, 73]) {
      obj('sdesk', x, y, 2, 1);
      obj('chair', x, y + 1, 1, 1, { block: false, dir: 'up', color: '#e9a23b' });
      obj('chair', x + 1, y + 1, 1, 1, { block: false, dir: 'up', color: '#e9a23b' });
    }
  }
  for (const [x, y] of [[61, 1], [75, 1], [61, 20], [75, 20], [75, 18]]) obj('plant', x, y);
  obj('shelf', 62, 19, 2, 1);

  // --- 10 bureaux de 4 ---
  for (let i = 0; i < 10; i++) {
    const top = i < 5;
    const rx = 16 + (i % 5) * 9;
    const ry = top ? 1 : 14;
    fill(rx, ry, 8, 7, T.ROOM);
    fill(rx + 3, top ? 8 : 13, 2, 1, T.HALL); // porte
    const id = `desk-${i + 1}`;
    zones.push({
      id, name: `Bureau ${i + 1}`, type: 'desk', x: rx, y: ry, w: 8, h: 7,
      carpet: CARPETS[i], label: { x: rx + 4, y: top ? ry + 6 : ry } ,
    });
    const ty = top ? ry + 2 : ry + 3;
    obj('rug', rx + 1, ty - 1, 6, 4, { block: false, color: shade(CARPETS[i], -18) });
    obj('table', rx + 3, ty, 2, 2);
    obj('chair', rx + 2, ty, 1, 1, { block: false, dir: 'right', color: '#3f51b5' });
    obj('chair', rx + 2, ty + 1, 1, 1, { block: false, dir: 'right', color: '#3f51b5' });
    obj('chair', rx + 5, ty, 1, 1, { block: false, dir: 'left', color: '#3f51b5' });
    obj('chair', rx + 5, ty + 1, 1, 1, { block: false, dir: 'left', color: '#3f51b5' });
    if (top) {
      obj('whiteboard', rx + 2, ry - 1, 4, 1, { block: false });
      obj('plant', rx, ry);
      obj('plant', rx + 7, ry);
    } else {
      obj('shelf', rx, ry, 2, 1);
      obj('plant', rx + 7, ry);
      obj('plant', rx, ry + 6);
      obj('plant', rx + 7, ry + 6);
    }
  }

  const blocked = new Uint8Array(MAP_W * MAP_H);
  for (let k = 0; k < tiles.length; k++) if (tiles[k] === T.WALL) blocked[k] = 1;
  for (const o of objects) {
    if (!o.block) continue;
    for (let j = o.y; j < o.y + o.h; j++) for (let i = o.x; i < o.x + o.w; i++) blocked[j * MAP_W + i] = 1;
  }

  const zoneGrid = new Array(MAP_W * MAP_H).fill(null);
  for (let k = 0; k < tiles.length; k++) if (tiles[k] !== T.WALL) zoneGrid[k] = 'hall';
  for (const z of zones) {
    for (let j = z.y; j < z.y + z.h; j++) for (let i = z.x; i < z.x + z.w; i++) zoneGrid[j * MAP_W + i] = z.id;
  }

  // Places assises : les chaises, et chaque case des canapés
  const chairs = new Map();
  for (const o of objects) {
    if (o.kind === 'chair') chairs.set(o.y * MAP_W + o.x, o);
    if (o.kind === 'sofa') {
      for (let i = 0; i < o.w; i++) chairs.set(o.y * MAP_W + o.x + i, { kind: 'sofa', x: o.x + i, y: o.y, dir: o.dir, color: o.color, sofa: o });
    }
  }

  const zoneById = { hall: { id: 'hall', name: 'Couloir', type: 'open' } };
  for (const z of zones) zoneById[z.id] = z;

  const spawns = [];
  for (let y = 9; y <= 12; y++) for (let x = 17; x <= 58; x++) if (!blocked[y * MAP_W + x]) spawns.push([x, y]);

  return { tiles, objects, zones, zoneById, blocked, zoneGrid, chairs, spawns };
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export const MAP = build();

const inside = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
export const tileAt = (x, y) => (inside(x, y) ? MAP.tiles[y * MAP_W + x] : T.WALL);
export const isBlocked = (x, y) => !inside(x, y) || MAP.blocked[y * MAP_W + x] === 1;
export const zoneAt = (x, y) => (inside(x, y) ? MAP.zoneGrid[y * MAP_W + x] : null);
export const chairAt = (x, y) => (inside(x, y) ? MAP.chairs.get(y * MAP_W + x) : undefined);
export const zoneType = (id) => MAP.zoneById[id]?.type || 'open';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Pupitre du bureau principal : on s'y place (E) pour parler à tout le monde.
// L'orateur se tient derrière, face à la salle.
export const LECTERN = { x: 7, y: 2, w: 2 };
export const LECTERN_SPOTS = [[7, 1], [8, 1]];
const atLectern = (u) => LECTERN_SPOTS.some(([x, y]) => u.x === x && u.y === y);
export const nearLectern = (x, y) =>
  x >= LECTERN.x - 1 && x <= LECTERN.x + LECTERN.w && y >= LECTERN.y - 1 && y <= LECTERN.y + 1;
// En direct au pupitre (vérifié aussi par la position, pas seulement par l'état annoncé)
export const isOnAir = (u) => !!u?.onAir && atLectern(u);

// Deux personnes sur des cases voisines (diagonales comprises) d'un espace ouvert.
// Le micro (M) doit être ouvert pour être entendu. Pas dans les pièces, où M parle à toute la pièce.
export const sideBySide = (a, b) => !!a && !!b && a.id !== b.id && a.zone === b.zone
  && zoneType(a.zone) === 'open' && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;

// Est-ce que `s` (émetteur) doit envoyer son micro à `r` (récepteur) ?
export function sendsAudio(s, r) {
  if (!s || !r || s.id === r.id) return false;
  if (isOnAir(s)) return true; // pupitre : tout le monde entend
  // Téléphone : `call` est l'identifiant de la personne en ligne (phone.js), où qu'elle soit
  if (s.call && s.call === r.id && canCallIn(s.zone)) return true;
  // N : parler à proximité, uniquement dans la même zone (les murs bloquent le son)
  if (s.ptt && canTalkieIn(s.zone) && s.zone === r.zone && dist(s, r) <= PROX_RADIUS) return true;
  // Côte à côte dans un espace ouvert (couloir) : on s'entend sans N, si son micro (M) est ouvert
  if (s.mic && sideBySide(s, r)) return true;
  // M : micro partagé avec les personnes de la même pièce
  return !!s.mic && ROOM_TYPES.includes(zoneType(s.zone)) && s.zone === r.zone;
}

// Est-ce que `s` doit envoyer son partage d'écran à `r` ?
export function sendsVideo(s, r) {
  if (!s || !r || s.id === r.id || !s.sharing) return false;
  if (isOnAir(s)) return true;
  return ROOM_TYPES.includes(zoneType(s.zone)) && s.zone === r.zone;
}

// Zones où le micro (M) et le partage d'écran fonctionnent
export const ROOM_TYPES = ['desk', 'class', 'main'];
export const canShareIn = (zoneId) => ROOM_TYPES.includes(zoneType(zoneId));
// Pas de talkie-walkie (N) dans les deux salles de classe : la salle de classe et le bureau principal
export const NO_TALKIE_TYPES = ['class', 'main'];
export const canTalkieIn = (zoneId) => !NO_TALKIE_TYPES.includes(zoneType(zoneId));
// Le téléphone (phone.js) suit la même règle : ni appel lancé, ni appel reçu dans ces salles
export const canCallIn = canTalkieIn;
// Téléphone qui sonne (`phone: 'ring'`, phone.js) : les personnes proches l'entendent aussi,
// dans la même zone, d'autant plus bas qu'elles sont loin (0 : pas entendu)
export const RING_RADIUS = 4;
export function ringVolume(s, r) {
  if (!s || !r || s.id === r.id || s.phone !== 'ring' || s.zone !== r.zone || !canCallIn(s.zone)) return 0;
  const d = dist(s, r);
  return d > RING_RADIUS ? 0 : Math.max(0.1, Math.min(0.6, 0.6 - ((d - 1) / (RING_RADIUS - 1)) * 0.5));
}
export const hearsRing = (s, r) => ringVolume(s, r) > 0;

// Haut-parleur du téléphone (`speaker`) : la conversation s'entend autour de la personne qui
// l'a activé, dans sa zone. Renvoie la personne dont le téléphone porte la voix de `s` jusqu'à
// `r` (`s` qui parle fort, ou son correspondant `partner` qui a mis le haut-parleur), sinon null.
const nearPhone = (holder, r) => holder.zone === r.zone && canCallIn(holder.zone) && dist(holder, r) <= PROX_RADIUS;
export function speakerHolder(s, partner, r) {
  if (!s?.call || !r || s.id === r.id || s.call === r.id) return null;
  if (s.speaker && nearPhone(s, r)) return s;
  if (partner && partner.id === s.call && partner.call === s.id && partner.speaker && nearPhone(partner, r)) return partner;
  return null;
}
