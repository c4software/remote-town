// Interface autour de la carte : démarrage de l'app, changement de zone, barre du bas, aide.
import { drawAvatar } from './avatar.js';
import { zoneName } from './desks.js';
import { atTeacherDesk, boardPip, boards, closeMyBoard, refreshBoard } from './board.js';
import { chat, fetchHistory, renderChat } from './chat.js';
import { REACTIONS } from './constantes.js';
import { $, toast } from './dom.js';
import { renderMap } from './map-render.js';
import { setPtt, stopShare, toggleMic, toggleShare } from './media.js';
import { dash } from './movement.js';
import { renderPeople } from './panel.js';
import { phoneZoneChange } from './call.js';
import { loop } from './render.js';
import { shareLink } from './rooms.js';
import { sendReaction, toggleHand } from './social.js';
import { S, users } from './state.js';
import { MAP, canShareIn, canTalkieIn, isOnAir, zoneType } from './world.js';

export function showHelp() {
  try { localStorage.removeItem('rt-help'); } catch {}
  $('#help').hidden = false;
  $('#help').classList.add('forced');
  syncHelpBtn();
}

// L'icône « ? » de la barre n'apparaît que lorsque l'aide est fermée (ou masquée sur petit écran)
function syncHelpBtn() {
  const help = $('#help');
  $('#helpBtn').hidden = !help.hidden && getComputedStyle(help).display !== 'none';
}

export function startApp() {
  $('#join').hidden = true;
  $('#app').hidden = false;
  $('#meName').textContent = S.me.name;
  drawAvatar($('#meAvatar').getContext('2d'), S.me.look, 16, 37, 'down');
  chat.zoneId = S.me.zone;
  S.mapCanvas = renderMap();
  document.fonts?.ready.then(() => { S.mapCanvas = renderMap(); });
  onZoneChange(true);
  renderChat(); renderPeople(); updateUI();
  syncHelpBtn();
  requestAnimationFrame(loop);
}

// ============================================================
// Interface (barre du bas, zone, annonces)
// ============================================================
let lastZoneToast = null;
export function onZoneChange(initial = false) {
  const z = MAP.zoneById[S.me.zone];
  S.zoneAt = performance.now();
  chat.zoneId = S.me.zone;
  delete chat.unread.zone;
  if (!initial) fetchHistory(S.me.zone, [...users.values()].filter((u) => !u.isMe && u.zone === S.me.zone).map((u) => u.id));
  if (S.sharing && !canShareIn(S.me.zone)) stopShare();
  if (S.pttHeld && !canTalkieIn(S.me.zone)) setPtt(false); // on range le talkie en entrant
  phoneZoneChange();
  for (const [z, b] of boards) if (b.owner === S.myId && z !== S.me.zone) closeMyBoard(z);
  refreshBoard();
  renderZoneTag();
  if (!initial && lastZoneToast !== S.me.zone && z.type !== 'open') toast(`Vous entrez dans ${zoneName(z.id)}`);
  lastZoneToast = S.me.zone;
  renderChat();
}

// Étiquette de la zone où l'on se trouve (aussi quand son bureau est renommé, desks.js)
export function renderZoneTag() {
  const z = MAP.zoneById[S.me.zone];
  const tag = $('#zoneTag');
  tag.className = z.type;
  const hint = z.type === 'desk' ? 'micro & écran partagés avec le bureau'
    : z.type === 'class' ? 'micro & écran partagés avec toute la classe'
    : z.type === 'main' ? 'micro partagé avec la salle · pupitre (E) : parler à tout le monde'
    : 'micro (M) : personnes juste à côté · N maintenu : à proximité';
  tag.innerHTML = '<span class="dot"></span>';
  tag.append(zoneName(z.id), Object.assign(document.createElement('small'), { textContent: `· ${hint}` }));
  $('#meZone').textContent = zoneName(z.id);
}

export function updateUI() {
  if (!S.me) return;
  const bb = $('#boardBtn');
  // Visible au bureau du prof (pour l'ouvrir) ou quand un tableau est ouvert (grand format / PiP)
  bb.hidden = !boards.has(S.me.zone) && !atTeacherDesk();
  bb.classList.toggle('active', boards.has(S.me.zone));
  bb.title = !boards.has(S.me.zone) ? 'Ouvrir le tableau blanc' : boardPip.has(S.me.zone) ? 'Agrandir le tableau blanc' : 'Tableau blanc en mode PiP';
  const zt = zoneType(S.me.zone);
  const mic = $('#micBtn');
  mic.classList.toggle('active', S.micOn && zt !== 'open');
  mic.classList.toggle('standby', S.micOn && zt === 'open');
  mic.title = !S.micOn ? 'Micro coupé (M)' : zt === 'open' ? 'Micro ouvert : entendu par les personnes juste à côté (M)' : 'Micro ouvert (M)';
  const share = $('#shareBtn');
  share.disabled = !canShareIn(S.me.zone) && !S.sharing;
  share.classList.toggle('active', S.sharing);
  share.title = S.sharing ? 'Arrêter le partage' : canShareIn(S.me.zone) ? "Partager l'écran" : "Partage d'écran : dans un bureau, la classe ou le bureau principal";
  $('#pttBtn').classList.toggle('active', S.pttHeld);

  const speakers = [...users.values()].filter(isOnAir);
  const bc = $('#broadcast');
  bc.hidden = !speakers.length;
  if (speakers.length) {
    const names = speakers.map((u) => (u.isMe ? 'Vous' : u.name)).join(', ');
    bc.textContent = `📢 ${names} — en direct depuis le pupitre`;
  }
}

// Branchement des événements de la page (appelé une fois par main.js)
// Version publiée, à côté du filigrane : le dernier tag, écrit dans version.json par le
// déploiement (.github/workflows). En local le fichier n'existe pas : rien n'est affiché.
async function showVersion() {
  try {
    const { version } = await (await fetch('version.json', { cache: 'no-store' })).json();
    if (!/^v\d+\.\d+\.\d+$/.test(version)) return;
    S.version = version;
    $('#appVersion').textContent = ` · ${version}`;
  } catch {}
}

export function initHud() {
  showVersion();
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
  $('#inviteBtn').onclick = () => shareLink(S.roomId);
  $('#dashBtn').onclick = () => dash();
  if (!navigator.mediaDevices?.getDisplayMedia) $('#shareBtn').hidden = true; // mobiles : pas de partage d'écran
  $('#shareBtn').onclick = toggleShare;
  const pttBtn = $('#pttBtn');
  pttBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); pttBtn.setPointerCapture(e.pointerId); setPtt(true); });
  pttBtn.addEventListener('pointerup', () => setPtt(false));
  pttBtn.addEventListener('pointercancel', () => setPtt(false));
  $('#help .help-close').onclick = () => { $('#help').hidden = true; $('#help').classList.remove('forced'); try { localStorage.setItem('rt-help', '1'); } catch {} syncHelpBtn(); };
  $('#helpBtn').onclick = showHelp;
  addEventListener('resize', syncHelpBtn);
  try { if (localStorage.getItem('rt-help')) $('#help').hidden = true; } catch {}
}
