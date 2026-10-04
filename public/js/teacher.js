// Bulle du prof : dans une salle de classe, la personne au bureau du prof (ou qui tient le
// tableau blanc) reste visible de tout le monde. Quand elle sort de l'écran (on est au fond de
// la salle) ou que le tableau en grand recouvre la carte, son portrait s'affiche dans une
// bulle en bas à gauche ; l'anneau passe au vert quand elle parle. Un clic ouvre sa fiche.
import { drawAvatar } from './avatar.js';
import { boardLarge, teacherOf } from './board.js';
import { TEACHER_BUBBLE_MS } from './constantes.js';
import { $ } from './dom.js';
import { openPerson } from './phone.js';
import { canvas } from './render.js';
import { S } from './state.js';
import { TILE } from './world.js';

let shownId = null, shownLook = '';

// La personne est-elle dans la partie visible de la carte ? (le milieu de son personnage)
function onScreen(u) {
  const { x, y, zoom } = S.cam;
  const sx = (u.rx * TILE + TILE / 2 - x) * zoom, sy = (u.ry * TILE + TILE / 2 - y) * zoom;
  return sx >= 0 && sx <= canvas.clientWidth && sy >= 0 && sy <= canvas.clientHeight;
}

function update() {
  const box = $('#teacher');
  const u = S.me && !S.warp ? teacherOf(S.me.zone) : null;
  const show = !!u && !u.isMe && (boardLarge() || !onScreen(u));
  box.hidden = !show;
  if (!show) { shownId = null; return; }
  const look = JSON.stringify(u.look);
  if (u.id !== shownId || look !== shownLook) {
    shownId = u.id; shownLook = look;
    const g = box.querySelector('canvas').getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, 78, 78);
    g.imageSmoothingEnabled = false;
    g.scale(3, 3);
    drawAvatar(g, u.look, 13, 41, 'down');
    box.querySelector('span').textContent = u.name;
    box.title = `${u.name}, au bureau du prof : voir sa fiche`;
  }
  box.classList.toggle('talking', u.level > 0.04);
}

// Branchement des événements de la page (appelé une fois par main.js)
export function initTeacher() {
  const box = $('#teacher');
  box.append(Object.assign(document.createElement('canvas'), { width: 78, height: 78 }), document.createElement('span'));
  box.onclick = () => { if (shownId) openPerson(shownId); };
  setInterval(update, TEACHER_BUBBLE_MS);
}
