// Déplacements de mon personnage : pas à pas, trajets cliqués, chaises, pupitre,
// accroupi, dash, rejoindre quelqu'un. Chaque changement est diffusé par sendMove().
import { initMic } from './audio.js';
import { atTeacherDesk, boards } from './board.js';
import { openDeskName } from './desks.js';
import { phoneClose } from './phone.js';
import { COOLER_EMOTE, CROUCH_MS, DASH_COOLDOWN, DASH_TILES, DELTA, DIR_NAMES, HOP_MS, REST_EMOTE, SPRINT_MS, STAMINA, STEP_MS } from './constantes.js';
import { $, toast, typing } from './dom.js';
import { clearEmoteOnMove, setEmote } from './emotes.js';
import { onZoneChange } from './hud.js';
import { heldDir } from './input.js';
import { pushState, updateRouting } from './media.js';
import { broadcast } from './net.js';
import { openSpaces } from './spaces.js';
import { S, users } from './state.js';
import { COOLER, LECTERN_SPOTS, MAP_H, MAP_W, chairAt, deskLabelAt, isBlocked, isOnAir, nearCooler, nearLectern, nearPortal, restSeat, zoneAt } from './world.js';

// ============================================================
// Pas à pas et trajets
// ============================================================
// On peut traverser les gens : seuls les murs et le mobilier bloquent
const canWalk = (x, y) => !isBlocked(x, y);
// Course : Maj maintenue, et pas essoufflé·e
const running = () => S.sprinting && !S.exhausted && !S.me.crouch;
export const myStepMs = () => (S.me.crouch ? CROUCH_MS : running() ? SPRINT_MS : STEP_MS);

// Endurance : chaque pas de course en consomme, elle remonte quand on ne court plus
let lastRegenAt = 0;
let lastStepAt = 0;
function regenStamina(now) {
  const dt = lastRegenAt ? Math.min(now - lastRegenAt, 250) : 0;
  lastRegenAt = now;
  if (now - S.lastSprintAt < STAMINA.regenDelay) return;
  const walking = now - lastStepAt < 2 * STEP_MS; // on reprend son souffle moins vite en marchant
  const rate = STAMINA.regenPerS * (walking ? STAMINA.walkRegenFactor : 1);
  S.stamina = Math.min(STAMINA.max, S.stamina + (rate * dt) / 1000);
  if (S.exhausted && S.stamina >= STAMINA.recoverAt) S.exhausted = false;
}
function spendStamina(now) {
  S.lastSprintAt = now;
  S.stamina = Math.max(0, S.stamina - STAMINA.sprintCost);
  if (S.stamina === 0 && !S.exhausted) {
    S.exhausted = true;
    toast('😮‍💨 Essoufflé·e : reprenez votre souffle avant de recourir');
  }
}

// Canapés et banc du couloir : s'y asseoir affiche la sieste, se lever la retire (si on
// n'a pas choisi une autre émote entre-temps)
let resting = false;
function syncRest() {
  const on = !!S.me.seated && restSeat(S.me.x, S.me.y);
  if (on === resting) return;
  resting = on;
  if (on) setEmote(REST_EMOTE);
  else if (S.me.emote === REST_EMOTE) setEmote(null);
}

export function sendMove(extra) {
  syncRest();
  broadcast('move', { x: S.me.x, y: S.me.y, dir: S.me.dir, seated: !!S.me.seated, sitAt: S.me.sitAt || 0, crouch: !!S.me.crouch, ...extra });
}

// Plus court chemin (BFS sur la grille), sans la case de départ
export function bfs(sx, sy, tx, ty) {
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

// Appelé à chaque frame : avance d'une case (clavier ou trajet) quand c'est l'heure
export function step(now) {
  regenStamina(now);
  if (now < S.nextStepAt || S.warp) return;
  let dir = typing() ? null : heldDir();
  if (dir) S.path = null;
  else if (S.path?.length) {
    const [nx, ny] = S.path[0];
    dir = nx > S.me.x ? 'right' : nx < S.me.x ? 'left' : ny > S.me.y ? 'down' : 'up';
  }
  if (!dir) return;
  if (heldDir()) { S.sitTarget = null; S.airTarget = false; S.portalTarget = false; S.coolerTarget = false; joinTarget = null; }
  const [dx, dy] = DELTA[dir];
  const nx = S.me.x + dx, ny = S.me.y + dy;
  const changed = S.me.dir !== dir || S.me.seated;
  S.me.dir = dir;
  S.me.seated = false;
  if (!canWalk(nx, ny)) {
    S.path = null;
    if (changed) sendMove();
    return;
  }
  S.me.x = nx; S.me.y = ny;
  clearEmoteOnMove();
  if (S.path) S.path.shift();
  if (running()) spendStamina(now);
  lastStepAt = now;
  S.nextStepAt = now + myStepMs();
  // Arrivé sur la chaise cliquée : on s'assoit
  if (S.sitTarget && !S.path?.length && S.sitTarget[0] === nx && S.sitTarget[1] === ny && !chairBusy(nx, ny)) {
    S.sitTarget = null;
    sitDown();
  }
  sendMove();
  onMyMove();
  if (joinTarget && !S.path?.length) faceUser(joinTarget);
  if (S.portalTarget && !S.path?.length) { S.portalTarget = false; if (nearPortal(nx, ny)) openSpaces(); }
  if (S.airTarget && !S.path?.length) { S.airTarget = false; if (LECTERN_SPOTS.some(([x, y]) => x === nx && y === ny)) startOnAir(); }
  if (S.coolerTarget && !S.path?.length) { S.coolerTarget = false; if (nearCooler(nx, ny)) coffeeBreak(true); }
}

// Après chacun de mes déplacements : zone, pupitre, bureau du prof, routage audio
export function onMyMove() {
  // Quitter sa place derrière le pupitre rend la parole
  if (S.me.onAir && !LECTERN_SPOTS.some(([x, y]) => x === S.me.x && y === S.me.y)) stopOnAir();
  const prevZone = S.me.zone;
  S.me.zone = zoneAt(S.me.x, S.me.y);
  if (S.me.zone !== prevZone) onZoneChange();
  notifyTeacherDesk();
  updateRouting();
}

// ============================================================
// Chaises : E pour s'asseoir / se lever, ou clic sur une chaise
// ============================================================
const someoneAt = (x, y, pred) => [...users.values()].some((u) => !u.isMe && u.x === x && u.y === y && pred(u));
// Une chaise où quelqu'un est assis est réservée
export const chairBusy = (x, y) => someoneAt(x, y, (u) => u.seated);

// Chaise sous soi, sinon devant soi, sinon sur les côtés
export function chairNearMe() {
  const free = (x, y) => chairAt(x, y) && !chairBusy(x, y);
  if (free(S.me.x, S.me.y)) return [S.me.x, S.me.y];
  for (const d of [S.me.dir, ...DIR_NAMES.filter((n) => n !== S.me.dir)]) {
    const [dx, dy] = DELTA[d];
    if (free(S.me.x + dx, S.me.y + dy)) return [S.me.x + dx, S.me.y + dy];
  }
  return null;
}

// Assis sur la place de sa case, tourné comme elle
function sitDown() {
  S.me.dir = chairAt(S.me.x, S.me.y).dir;
  S.me.seated = true;
  S.me.crouch = false;
  S.me.sitAt = Date.now();
}

export function sitOn(x, y) {
  const moved = x !== S.me.x || y !== S.me.y;
  S.path = null;
  S.me.x = x; S.me.y = y;
  sitDown();
  S.nextStepAt = performance.now() + STEP_MS;
  sendMove();
  if (moved) onMyMove();
}

export function toggleSit() {
  if (!S.me || typing()) return;
  if (S.me.seated) { S.me.seated = false; sendMove(); return; }
  const c = chairNearMe();
  if (c) sitOn(...c);
}

// Quelqu'un d'autre sur ma case (en sortant de la porte des espaces) : un pas de côté
export function stepAsideIfTaken() {
  if (!someoneAt(S.me.x, S.me.y, () => true)) return;
  if (moveAside()) onMyMove();
}

// Deux personnes assises sur la même chaise au même moment : la première arrivée
// (ou, à égalité, l'identifiant le plus petit) garde la place ; l'autre se lève à côté.
export function resolveOverlap(u) {
  if (!S.me?.seated || !u.seated || u.isMe || u.x !== S.me.x || u.y !== S.me.y) return;
  const iLose = S.me.sitAt > u.sitAt || (S.me.sitAt === u.sitAt && S.myId > u.id);
  if (!iLose) return;
  S.me.seated = false;
  S.path = null;
  moveAside();
  sendMove();
  onMyMove();
  toast(`${u.name} s'est assis·e ici juste avant vous`);
}

// Un pas de côté, vers la case libre la plus proche : faux s'il n'y en a pas
function moveAside() {
  const spot = nearestFree(S.me.x, S.me.y);
  if (spot) { S.me.x = spot[0]; S.me.y = spot[1]; }
  return !!spot;
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

// ============================================================
// Machine à eau : E à côté d'elle (ou la toucher) pour la pause café, E à nouveau pour la finir
// ============================================================
export function coffeeBreak(on = S.me.emote !== COOLER_EMOTE) {
  // On se tourne vers la machine ; l'émote part au premier pas, comme les autres
  const dir = COOLER.x > S.me.x ? 'right' : COOLER.x < S.me.x ? 'left' : COOLER.y > S.me.y ? 'down' : 'up';
  if (on && S.me.dir !== dir) { S.me.dir = dir; sendMove(); }
  setEmote(on ? COOLER_EMOTE : null);
}

// ============================================================
// Pupitre : E (ou clic dessus) pour parler à tout le monde
// ============================================================
export function freeLecternSpot() {
  const taken = (x, y) => someoneAt(x, y, (u) => isOnAir(u));
  if (LECTERN_SPOTS.some(([x, y]) => x === S.me.x && y === S.me.y) && !taken(S.me.x, S.me.y)) return [S.me.x, S.me.y];
  return LECTERN_SPOTS.find(([x, y]) => !taken(x, y)) || null;
}

export async function startOnAir() {
  const spot = freeLecternSpot();
  if (!spot) return toast('Quelqu\'un est déjà au pupitre');
  if (!S.micTrack && !(await initMic())) return;
  S.path = null; S.sitTarget = null; S.airTarget = false;
  const moved = spot[0] !== S.me.x || spot[1] !== S.me.y;
  S.me.x = spot[0]; S.me.y = spot[1];
  S.me.dir = 'down';
  S.me.seated = false; S.me.crouch = false;
  S.me.onAir = true;
  S.nextStepAt = performance.now() + STEP_MS;
  sendMove();
  if (moved) onMyMove();
  pushState();
  toast('📢 Vous parlez à tout le monde. E pour rendre la parole.');
}

export function stopOnAir() {
  if (!S.me.onAir) return;
  S.me.onAir = false;
  pushState();
}

// E : rendre la parole, prendre la parole au pupitre, ou s'asseoir / se lever
export function interact() {
  if (!S.me || typing()) return;
  if (S.me.onAir) return stopOnAir();
  if (nearLectern(S.me.x, S.me.y) && !S.me.seated) return startOnAir();
  if (nearPortal(S.me.x, S.me.y) && !S.me.seated) return openSpaces();
  if (nearCooler(S.me.x, S.me.y) && !S.me.seated) return coffeeBreak();
  const desk = deskLabelAt(S.me.x, S.me.y);
  if (desk && !S.me.seated && !chairNearMe()) return openDeskName(desk);
  toggleSit();
}

// ============================================================
// Accroupi (C), saut (V) et dash (Espace)
// ============================================================
export function toggleCrouch() {
  if (!S.me || typing()) return;
  S.me.crouch = !S.me.crouch;
  if (S.me.crouch) S.me.seated = false;
  sendMove();
}

// Saut sur place (même bond qu'en levant le talkie), vu par tout le monde
export function jump() {
  const now = performance.now();
  if (!S.me || typing() || S.me.seated || now - (S.me.jumpAt || 0) < HOP_MS + 80) return;
  S.me.jumpAt = now;
  sendMove({ jump: true });
}

// Bond de quelques cases dans la direction regardée (ou tenue)
export function dash() {
  const now = performance.now();
  if (now < S.nextDashAt || typing()) return;
  const dir = heldDir() || S.me.dir;
  const [dx, dy] = DELTA[dir];
  let n = 0;
  while (n < DASH_TILES && canWalk(S.me.x + dx * (n + 1), S.me.y + dy * (n + 1))) n++;
  S.me.dir = dir;
  if (!n) return;
  S.nextDashAt = now + DASH_COOLDOWN;
  S.path = null; S.sitTarget = null; S.me.seated = false; S.me.crouch = false;
  startDash(S.me);
  S.me.x += dx * n; S.me.y += dy * n;
  clearEmoteOnMove();
  S.nextStepAt = now + 120;
  sendMove({ dash: true });
  onMyMove();
}

// Démarre l'effet visuel du dash (traînée + poussière), pour moi comme pour les autres
export function startDash(u) {
  u.dashing = true;
  u.trail = u.trail || [];
  u.dust = { x: u.rx, y: u.ry, dir: u.dir, t: performance.now() };
}

// ============================================================
// Rejoindre quelqu'un (bulle de main levée, nom dans le chat ou la liste)
// ============================================================
let joinTarget = null; // id de la personne qu'on rejoint

// Marche jusqu'à la case libre la plus proche de la personne (à côté d'elle)
export function goToUser(id) {
  const u = users.get(id);
  if (!u || !S.me) return;
  let best = null;
  for (const [dx, dy] of Object.values(DELTA)) {
    const x = u.x + dx, y = u.y + dy;
    if (!canWalk(x, y) || (chairAt(x, y) && chairBusy(x, y))) continue;
    const p = x === S.me.x && y === S.me.y ? [] : bfs(S.me.x, S.me.y, x, y);
    if (p && (!best || p.length < best.length)) best = p;
  }
  if (S.me.seated) { S.me.seated = false; sendMove(); }
  S.sitTarget = null; S.airTarget = false;
  joinTarget = id;
  S.path = best ?? bfs(S.me.x, S.me.y, u.x, u.y);
  if (!S.path?.length) faceUser(id);
  else toast(`En route vers ${u.name}`);
}

// Depuis le chat ou la liste : sur téléphone, le panneau recouvre la carte, on le ferme
export function joinFromPanel(id) {
  phoneClose(true); // sur mobile, le téléphone masque la carte
  goToUser(id);
}

function faceUser(id) {
  joinTarget = null;
  const u = users.get(id);
  if (!u) return;
  const dx = u.x - S.me.x, dy = u.y - S.me.y;
  if (!dx && !dy) return;
  S.me.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  sendMove();
}

// ============================================================
// Bureau du prof : notification en y arrivant
// ============================================================
let wasAtDesk = false;
function notifyTeacherDesk() {
  const at = atTeacherDesk();
  if (at && !wasAtDesk && !boards.has(S.me.zone)) toast('📋 Bureau du prof : le bouton tableau de la barre ouvre le tableau blanc pour toute la pièce.');
  wasAtDesk = at;
}
