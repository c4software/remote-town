// Vue en incrustation (Document Picture-in-Picture, Chrome / Edge) : un petit morceau de la
// carte autour de son personnage, pour voir qui s'approche depuis un autre onglet. Si un
// partage d'écran est affiché en grand, c'est lui qu'elle montre une fois l'onglet quitté.
// Ouverte avec P, ou automatiquement en changeant d'onglet si on l'a activé dans l'écran du
// personnage (action « enterpictureinpicture » de Media Session, réservée par Chrome aux pages
// qui utilisent le micro).
import { toast } from './dom.js';
import { canvas, frame } from './render.js';
import { roomName } from './rooms.js';
import { S, users } from './state.js';
import { focusedShare } from './videos.js';
import { TILE } from './world.js';

const supported = () => 'documentPictureInPicture' in window;
const VIEW_TILES = 9; // largeur de la vue, en cases (le personnage au centre)
let win = null;       // fenêtre ouverte
let auto = false;     // ouverte par le changement d'onglet : refermée au retour

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
  if (!supported()) return toast("La vue en incrustation n'est pas disponible dans ce navigateur (Chrome ou Edge sur ordinateur).");
  if (win) closePip(); else openPip(false);
}

function closePip() {
  win?.close();
  win = null;
}

async function openPip(isAuto) {
  if (win || !S.me || S.kicked) return;
  try {
    // preferInitialWindowPlacement : toujours cette taille, sans reprendre celle de la dernière fois
    win = await documentPictureInPicture.requestWindow({ width: 440, height: 390, preferInitialWindowPlacement: true });
  } catch { win = null; return; }
  auto = isAuto;
  const doc = win.document;
  doc.title = 'Remote Town';
  doc.body.style.cssText = 'margin:0;background:#191d33;overflow:hidden';
  const c = doc.createElement('canvas');
  c.style.cssText = 'display:block;width:100vw;height:100vh';
  // Partage d'écran suivi en grand : une vraie vidéo dans la fenêtre (nette, et toujours
  // lue puisque visible), avec le nom de la personne en bas
  const video = doc.createElement('video');
  video.autoplay = true; video.muted = true; video.playsInline = true;
  video.style.cssText = 'display:none;width:100vw;height:100vh;object-fit:contain;background:#0d1020';
  const label = doc.createElement('div');
  label.style.cssText = 'display:none;position:fixed;left:0;right:0;bottom:0;padding:4px 8px;background:rgba(20,23,45,.8);color:#fff;font:600 12px "DM Sans",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  doc.body.append(c, video, label);
  const w = win;
  w.addEventListener('pagehide', () => { if (win === w) win = null; });
  // La boucle de rendu de la page s'arrête quand l'onglet est caché : la fenêtre, toujours
  // visible, fait alors avancer les images de la carte principale à sa place
  const tick = (now) => {
    if (win !== w) return;
    if (!S.me || S.kicked) return closePip();
    if (document.hidden) frame(now);
    // Onglet quitté pendant qu'on regarde un partage en grand : la fenêtre le montre à la
    // place de la carte. Onglet visible, le partage y est déjà : la carte reste utile ici.
    const share = document.hidden ? focusedShare() : null;
    if (video.srcObject !== (share?.stream || null)) {
      video.srcObject = share?.stream || null;
      if (share) video.play().catch(() => {});
      c.style.display = share ? 'none' : 'block';
      video.style.display = share ? 'block' : 'none';
      label.style.display = share ? 'block' : 'none';
    }
    if (share) label.textContent = share.name;
    else draw(c, w);
    w.requestAnimationFrame(tick);
  };
  w.requestAnimationFrame(tick);
}

// Recopie la carte principale déjà dessinée (personnages, noms, émotes compris), recadrée
// autour de soi. Près des bords de la carte, la caméra est bloquée : on n'est plus centré.
function draw(c, w) {
  const dpr = w.devicePixelRatio || 1;
  const W = w.innerWidth, H = w.innerHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#191d33';
  g.fillRect(0, 0, c.width, c.height);
  // Zone source, en pixels du canevas principal, aux proportions de la fenêtre
  const k = canvas.width / (canvas.clientWidth || 1); // densité du canevas principal
  let sw = Math.min(canvas.width, VIEW_TILES * TILE * S.cam.zoom * k);
  let sh = sw * H / W;
  if (sh > canvas.height) { sh = canvas.height; sw = sh * W / H; }
  const mx = (S.me.rx * TILE + TILE / 2 - S.cam.x) * S.cam.zoom * k;
  const my = (S.me.ry * TILE + TILE / 2 - S.cam.y) * S.cam.zoom * k;
  const sx = Math.max(0, Math.min(canvas.width - sw, mx - sw / 2));
  const sy = Math.max(0, Math.min(canvas.height - sh, my - sh / 2));
  g.imageSmoothingEnabled = true;
  g.drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);

  // Bandeau du bas : espace, nombre de personnes, état du micro
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = 'rgba(20,23,45,.8)';
  g.fillRect(0, H - 22, W, 22);
  g.font = '600 12px "DM Sans", sans-serif';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = '#fff';
  const n = users.size;
  g.fillText(`${roomName(S.roomId)} · ${n} personne${n > 1 ? 's' : ''}`, 8, H - 11);
  g.textAlign = 'right';
  g.fillStyle = S.micOn ? '#06d6a0' : '#a3a8c7';
  g.fillText(S.micOn ? '🎙️ Micro ouvert' : '🔇 Micro coupé', W - 8, H - 11);
}

// Branchement (appelé une fois par main.js)
export function initPip() {
  if (!supported()) return;
  syncAuto();
  // Au retour sur l'onglet, la vue ouverte automatiquement n'est plus utile
  document.addEventListener('visibilitychange', () => { if (!document.hidden && auto) closePip(); });
}
