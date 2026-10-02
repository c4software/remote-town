// Dessin pixel-art des personnages et de leurs accessoires (tête et corps).
// Fonctions pures : elles dessinent dans le contexte canvas qu'on leur passe.
import { shade } from './world.js';

// Accessoires choisis sur l'écran de connexion : un pour la tête, un pour le corps
const HEADS = ['unicorn', 'cap', 'shades', 'glasses', 'tophat', 'headphones', 'crown', 'beanie', 'partyhat', 'catears', 'flower'];
const BODIES = ['metal', 'claude', 'codex', 'linux', 'windows', 'macos', 'scarf', 'tie', 'bowtie', 'backpack', 'cape', 'medal'];
export const cleanHead = (d) => (HEADS.includes(d) ? d : null);
export const cleanBody = (d) => (BODIES.includes(d) ? d : null);
// Ancien format (un seul accessoire « deco ») : rangé dans la bonne catégorie
export const lookHead = (l) => cleanHead(l?.head) ?? cleanHead(l?.deco);
export const lookBody = (l) => cleanBody(l?.body) ?? cleanBody(l?.deco);

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
// Logo Claude : l'étincelle orange à huit branches. C = orange, D = cœur plus sombre
const CLAUDE = [
  'C..C..C',
  '.C.C.C.',
  '..CDC..',
  'CCDDDCC',
  '..CDC..',
  '.C.C.C.',
  'C..C..C',
];
// Logo Codex : invite de terminal « >_ » blanche sur un pavé bleu-violet arrondi
const CODEX = [
  '.BBBBB.',
  'BBBBBBB',
  'BWBBBBB',
  'BBWBBBB',
  'BWBWWBB',
  'BBBBBBB',
  '.BBBBB.',
];
const PRINT_COLORS = { C: '#d97757', D: '#b85a3c', B: '#5b5bd6', W: '#ffffff' };
// Tux, le manchot de Linux : K = noir, W = ventre et yeux blancs, Y = bec et pattes
const LINUX = [
  '..KKK..',
  '.KWKWK.',
  '.KKYKK.',
  'KKWWWKK',
  'KWWWWWK',
  '.KWWWK.',
  '.YY.YY.',
];
const LINUX_COLORS = { K: '#1d1e30', W: '#ffffff', Y: '#ffb300' };
// Les quatre carreaux de Windows ; ' ' laisse voir le t-shirt entre eux
const WINDOWS = [
  'RRR GGG',
  'RRR GGG',
  'RRR GGG',
  '       ',
  'UUU YYY',
  'UUU YYY',
  'UUU YYY',
];
const WINDOWS_COLORS = { R: '#f25022', G: '#7fba00', U: '#00a4ef', Y: '#ffb900' };
// La pomme de macOS, croquée à droite, avec sa feuille ; ' ' évite un contour dans les creux
const MACOS = [
  '....L..',
  '...L...',
  '.AA AA.',
  'AAAAAAA',
  'AAAAA..',
  'AAAAAA.',
  '.AA AA.',
];
const MACOS_COLORS = { A: '#a3aab1', L: '#a3aab1' };

// Imprimé centré sur le t-shirt, cerné d'un contour plus foncé que le t-shirt
// pour rester lisible quelle que soit sa couleur
function drawPrint(r, look, o, grid, colors) {
  const line = shade(look.shirt, -70);
  const cell = (x, y) => grid[y]?.[x] ?? '.';
  const x0 = -3, y0 = -17 + o;
  for (let y = -1; y <= grid.length; y++) {
    for (let x = -1; x <= grid[0].length; x++) {
      if (cell(x, y) !== '.') continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => colors[cell(x + dx, y + dy)]);
      if (near) r(x0 + x, y0 + y, 1, 1, line);
    }
  }
  grid.forEach((row, y) => [...row].forEach((c, x) => {
    if (colors[c]) r(x0 + x, y0 + y, 1, 1, colors[c]);
  }));
}
// Sur un t-shirt orangé, l'étincelle orange disparaîtrait : on la passe en blanc
function drawClaudePrint(r, look, o) {
  const [red, green, blue] = [1, 3, 5].map((i) => parseInt(look.shirt.slice(i, i + 2), 16));
  const orange = red > 180 && green > 70 && green < 170 && blue < 130;
  drawPrint(r, look, o, CLAUDE, orange ? { C: '#ffffff', D: '#ffe3d6' } : PRINT_COLORS);
}
function drawMetalPrint(r, look, o) {
  const light = parseInt(look.shirt.slice(1, 3), 16) > 200 && parseInt(look.shirt.slice(3, 5), 16) > 170;
  const fill = light ? '#ffffff' : '#ffcf5c';
  drawPrint(r, look, o, METAL, { X: fill, K: shade(fill, -50) });
}

// Accessoires de tête. top = haut des cheveux, o = décalage vertical (assis, accroupi…)
// Repères : tête de x -7 à 6, yeux à y -24+o (face : x -4 et 2 ; profil : x -6 ou 4).
const frame = (r, x, y, w, h, c) => { r(x, y, w, 1, c); r(x, y + h - 1, w, 1, c); r(x, y, 1, h, c); r(x + w - 1, y, 1, h, c); };
// Accessoires qui dépassent au-dessus de la tête : on remonte l'étiquette du nom d'autant
export const HAT_HEIGHT = { tophat: 8, crown: 5, unicorn: 6, partyhat: 10, beanie: 3, catears: 3 };
const HEAD_ACC = {
  unicorn: (r, dir, top) => drawUnicornHeadband(r, dir, top),
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
  beanie(r, dir, top) {
    const c = '#2a9d8f', l = '#52b69a';
    r(-8, top - 1, 16, 5, c);
    r(-8, top + 3, 16, 2, l);
    r(-4, top - 1, 1, 4, l); r(3, top - 1, 1, 4, l);
    r(-2, top - 4, 4, 3, '#ffffff'); r(-1, top - 5, 2, 1, '#ffffff');
  },
  partyhat(r, dir, top) {
    [2, 2, 4, 4, 6, 6, 8, 8].forEach((w, i) => r(-w / 2, top - 8 + i, w, 1, Math.floor(i / 2) % 2 ? '#ffd166' : '#ef476f'));
    r(-1, top - 10, 2, 2, '#06d6a0');
  },
  catears(r, dir, top) {
    const k = '#f4f4f6', p = '#f9a8d4';
    r(-7, top - 3, 1, 1, k); r(-7, top - 2, 2, 1, k); r(-7, top - 1, 3, 2, k); r(-6, top - 1, 1, 1, p);
    r(6, top - 3, 1, 1, k); r(5, top - 2, 2, 1, k); r(4, top - 1, 3, 2, k); r(5, top - 1, 1, 1, p);
  },
  flower(r, dir, top) {
    const x = dir === 'right' ? -5 : 4, p = '#f78fb3';
    r(x - 1, top + 1, 3, 1, p); r(x, top, 1, 3, p);
    r(x, top + 1, 1, 1, '#ffd166');
    r(x + 2, top + 2, 1, 1, '#3fa95a');
  },
};

// Accessoires du corps : `back` est dessiné derrière le personnage, `front` devant
const BODY_ACC = {
  metal: { front: (r, dir, o, look) => dir === 'down' && drawMetalPrint(r, look, o) },
  claude: { front: (r, dir, o, look) => dir === 'down' && drawClaudePrint(r, look, o) },
  codex: { front: (r, dir, o, look) => dir === 'down' && drawPrint(r, look, o, CODEX, PRINT_COLORS) },
  linux: { front: (r, dir, o, look) => dir === 'down' && drawPrint(r, look, o, LINUX, LINUX_COLORS) },
  windows: { front: (r, dir, o, look) => dir === 'down' && drawPrint(r, look, o, WINDOWS, WINDOWS_COLORS) },
  macos: { front: (r, dir, o, look) => dir === 'down' && drawPrint(r, look, o, MACOS, MACOS_COLORS) },
  scarf: {
    front(r, dir, o) {
      const c = '#ef476f', w = '#fff3f5', y = -19 + o;
      r(-8, y, 16, 3, c);
      r(-8, y + 1, 16, 1, w);
      if (dir === 'down') { r(2, y + 3, 3, 6, c); r(2, y + 5, 3, 1, w); }
      if (dir === 'left') { r(1, y + 3, 3, 5, c); r(1, y + 5, 3, 1, w); }
      if (dir === 'right') { r(-4, y + 3, 3, 5, c); r(-4, y + 5, 3, 1, w); }
    },
  },
  tie: {
    front(r, dir, o, look) {
      const reddish = parseInt(look.shirt.slice(1, 3), 16) > 200 && parseInt(look.shirt.slice(3, 5), 16) < 120;
      const c = reddish ? '#1d3557' : '#e63946';
      if (dir === 'down') { r(-1, -18 + o, 2, 2, shade(c, -35)); r(-1, -16 + o, 2, 3, c); r(-2, -13 + o, 4, 3, c); r(-1, -10 + o, 2, 1, c); }
      if (dir === 'left') r(-7, -17 + o, 1, 6, c);
      if (dir === 'right') r(6, -17 + o, 1, 6, c);
    },
  },
  bowtie: {
    front(r, dir, o) {
      const c = '#7b2cbf';
      if (dir === 'down') { r(-4, -18 + o, 3, 3, c); r(1, -18 + o, 3, 3, c); r(-1, -17 + o, 2, 2, shade(c, -35)); }
      if (dir === 'left') r(-7, -18 + o, 2, 3, c);
      if (dir === 'right') r(5, -18 + o, 2, 3, c);
    },
  },
  medal: {
    front(r, dir, o) {
      const blue = '#118ab2', gold = '#ffcf5c';
      if (dir === 'down') {
        r(-3, -18 + o, 1, 2, blue); r(-2, -16 + o, 1, 2, blue); r(2, -18 + o, 1, 2, blue); r(1, -16 + o, 1, 2, blue);
        r(-2, -14 + o, 4, 4, gold); r(-1, -13 + o, 2, 2, '#d9a21b');
      }
      if (dir === 'left') r(-7, -14 + o, 2, 3, gold);
      if (dir === 'right') r(5, -14 + o, 2, 3, gold);
    },
  },
  backpack: {
    back(r, dir, o) {
      const pack = '#f4a261', d = '#c97a3d';
      if (dir === 'left') { r(5, -17 + o, 4, 9, pack); r(5, -17 + o, 4, 2, d); }
      if (dir === 'right') { r(-9, -17 + o, 4, 9, pack); r(-9, -17 + o, 4, 2, d); }
    },
    front(r, dir, o) {
      const pack = '#f4a261', d = '#c97a3d', strap = '#6b4423';
      if (dir === 'down') { r(-6, -18 + o, 2, 8, strap); r(4, -18 + o, 2, 8, strap); }
      if (dir === 'up') { r(-6, -17 + o, 12, 9, pack); r(-6, -17 + o, 12, 3, d); r(-3, -12 + o, 6, 3, d); r(-1, -11 + o, 2, 1, '#ffd166'); }
      if (dir === 'left') r(1, -17 + o, 1, 7, strap);
      if (dir === 'right') r(-2, -17 + o, 1, 7, strap);
    },
  },
  cape: {
    back(r, dir, o) {
      const c = '#c1121f';
      if (dir === 'down') { r(-10, -18 + o, 3, 15, c); r(7, -18 + o, 3, 15, c); }
      if (dir === 'left') r(2, -18 + o, 7, 15, c);
      if (dir === 'right') r(-9, -18 + o, 7, 15, c);
    },
    front(r, dir, o) {
      const c = '#c1121f', d = '#8d0b16', gold = '#ffcf5c';
      if (dir === 'up') { r(-8, -18 + o, 16, 15, c); r(-4, -16 + o, 1, 12, d); r(3, -16 + o, 1, 12, d); }
      if (dir === 'down') { r(-2, -18 + o, 1, 1, gold); r(1, -18 + o, 1, 1, gold); }
      if (dir === 'left') r(-6, -18 + o, 1, 1, gold);
      if (dir === 'right') r(5, -18 + o, 1, 1, gold);
    },
  },
};

// Serre-tête licorne : bandeau, oreilles, fleurs et corne dorée torsadée
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

// « 67 » : paumes vers le ciel, les mains montent et descendent en alternance
// comme une balance. Les mains vont de y -16 à -10 (épaules à -17).
function drawPumpArms(r, dir, o, pump, dark, skin) {
  const hand = (sx, palmX, a) => {
    const hy = -13 + a + o;
    r(sx, -17 + o, 2, hy + 17 - o, dark);
    r(palmX, hy, 4, 2, skin);
  };
  if (dir === 'left' || dir === 'right') {
    const ax = dir === 'left' ? -2 : -1;
    hand(ax, dir === 'left' ? ax - 3 : ax + 1, pump);
  } else {
    hand(-9, -11, pump);
    hand(7, 7, -pump);
  }
}

// pump : décalage vertical des mains pendant le « 67 » (null = bras au repos)
export function drawAvatar(ctx, look, cx, by, dir = 'down', walkFrame = 0, seated = false, lift = 0, crouch = false, pump = null) {
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
  BODY_ACC[look.body]?.back?.(r, dir, o, look);
  r(-7, -18 + o, 14, 11, look.shirt);
  r(-7, -9 + o, 14, 2, dark);
  if (crouch) { // genoux pliés devant le corps
    r(-7, -4, 5, 3, '#2f3150'); r(2, -4, 5, 3, '#2f3150');
    r(-6, -1, 4, 1, '#1b1c2e'); r(2, -1, 4, 1, '#1b1c2e');
  }
  if (pump !== null) drawPumpArms(r, dir, o, pump, dark, look.skin);
  else if (dir === 'left' || dir === 'right') {
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
    if (look.face === 'question' && dir === 'down') { // air interrogatif : sourcil levé, bouche en « o »
      r(-5, -26 + o, 3, 1, eye); r(2, -25 + o, 3, 1, eye);
      r(-1, -21 + o, 2, 2, '#8a4a3a');
    }
  }
  BODY_ACC[look.body]?.front?.(r, dir, o, look);
  HEAD_ACC[look.head]?.(r, dir, -31 + o, o);
}
