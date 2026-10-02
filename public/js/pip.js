// Mini-carte en incrustation (Document Picture-in-Picture, Chrome / Edge) : toute la carte
// en petit, avec les participants, pour garder un œil sur l'espace depuis un autre onglet.
// Ouverte automatiquement en changeant d'onglet (action « enterpictureinpicture » de Media
// Session, réservée par Chrome aux pages qui utilisent le micro), ou avec P.
import { WORLD_H, WORLD_W } from './config.js';
import { toast } from './dom.js';
import { sampleLevels } from './render.js';
import { roomName } from './rooms.js';
import { S, users } from './state.js';
import { TILE, isOnAir } from './world.js';

const supported = () => 'documentPictureInPicture' in window;
const HEADER = 22; // bandeau du haut : nom de l'espace, nombre de personnes, micro
let win = null;    // fenêtre ouverte
let auto = false;  // ouverte par le changement d'onglet : refermée au retour

// Seul le navigateur décide d'ouvrir la fenêtre automatiquement : on lui indique seulement
// si on le souhaite (gestionnaire présent) ou non
function syncAuto() {
  try {
    navigator.mediaSession?.setActionHandler('enterpictureinpicture', S.pipOn && supported() ? () => openPip(true) : null);
  } catch {} // action inconnue du navigateur
}

export function setPipOn(on) {
  S.pipOn = on;
  syncAuto();
  if (!on && auto) closePip();
}

export function togglePip() {
  if (!supported()) return toast("La mini-carte n'est pas disponible dans ce navigateur (Chrome ou Edge sur ordinateur).");
  if (win) closePip(); else openPip(false);
}

function closePip() {
  win?.close();
  win = null;
}

async function openPip(isAuto) {
  if (win || !S.me || S.kicked) return;
  try {
    win = await documentPictureInPicture.requestWindow({ width: 560, height: Math.round(560 * WORLD_H / WORLD_W) + HEADER });
  } catch { win = null; return; }
  auto = isAuto;
  const doc = win.document;
  doc.title = 'Remote Town';
  doc.body.style.cssText = 'margin:0;background:#191d33;overflow:hidden';
  const c = doc.createElement('canvas');
  c.style.cssText = 'display:block;width:100vw;height:100vh';
  doc.body.append(c);
  const w = win;
  w.addEventListener('pagehide', () => { if (win === w) win = null; });
  // La boucle de rendu de la page s'arrête quand l'onglet est caché : celle de la fenêtre continue
  const tick = (now) => {
    if (win !== w) return;
    if (!S.me || S.kicked) return closePip();
    sampleLevels(now);
    draw(c, w);
    w.requestAnimationFrame(tick);
  };
  w.requestAnimationFrame(tick);
}

function draw(c, w) {
  const dpr = w.devicePixelRatio || 1;
  const W = w.innerWidth, H = w.innerHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#191d33';
  g.fillRect(0, 0, W, H);

  // Bandeau : espace, nombre de personnes, état du micro
  g.font = '600 12px "DM Sans", sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = '#fff';
  const n = users.size;
  g.fillText(`${roomName(S.roomId)} · ${n} personne${n > 1 ? 's' : ''}`, 8, HEADER / 2);
  g.textAlign = 'right';
  g.fillStyle = S.micOn ? '#06d6a0' : '#a3a8c7';
  g.fillText(S.micOn ? '🎙️ Micro ouvert' : '🔇 Micro coupé', W - 8, HEADER / 2);

  // Carte entière, centrée
  const k = Math.min(W / WORLD_W, (H - HEADER) / WORLD_H);
  const ox = (W - WORLD_W * k) / 2, oy = HEADER + (H - HEADER - WORLD_H * k) / 2;
  g.imageSmoothingEnabled = true;
  if (S.mapCanvas) g.drawImage(S.mapCanvas, ox, oy, WORLD_W * k, WORLD_H * k);

  // Participants : pastille à la couleur du haut, halo quand on les entend, nom au-dessus
  const r = Math.max(3, TILE * k * 0.45);
  const list = [...users.values()].sort((a, b) => (a.isMe ? 1 : 0) - (b.isMe ? 1 : 0));
  for (const u of list) {
    const x = ox + (u.x + 0.5) * TILE * k, y = oy + (u.y + 0.5) * TILE * k;
    if (u.level > 0.04 || isOnAir(u)) {
      g.fillStyle = isOnAir(u) ? 'rgba(255,207,92,.5)' : 'rgba(6,214,160,.5)';
      g.beginPath(); g.arc(x, y, r + 3 + (u.level || 0) * 8, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = u.emote === 'afk' ? 0.5 : 1;
    g.fillStyle = u.look?.shirt || '#6c63ff';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.lineWidth = u.isMe ? 2 : 1;
    g.strokeStyle = u.isMe ? '#fff' : 'rgba(20,23,45,.9)';
    g.stroke();
    g.globalAlpha = 1;
    g.font = '600 10px "DM Sans", sans-serif';
    g.textAlign = 'center';
    const label = `${u.hand ? '✋ ' : ''}${u.name}`;
    const tw = g.measureText(label).width;
    g.fillStyle = 'rgba(32,37,64,.85)';
    g.beginPath(); g.roundRect(x - tw / 2 - 4, y - r - 15, tw + 8, 13, 6); g.fill();
    g.fillStyle = '#fff';
    g.fillText(label, x, y - r - 8);
  }
}

// Branchement (appelé une fois par main.js)
export function initPip() {
  if (!supported()) return;
  syncAuto();
  // Au retour sur l'onglet, la mini-carte ouverte automatiquement n'est plus utile
  document.addEventListener('visibilitychange', () => { if (!document.hidden && auto) closePip(); });
}
