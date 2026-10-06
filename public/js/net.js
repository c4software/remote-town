// Réseau pair-à-pair (Trystero) : connexion à la salle, messages reçus des autres,
// présence, attente et reconnexion. Il n'y a pas d'hôte : chacun est relié à tous.
import { customRingRev, neighbourBeep, pttReaches } from './audio.js';
import { lookBody, lookHead } from './avatar.js';
import { dropBoardsOf, fetchSavedBoards, onBoardMsg, savedBoards, syncBoardsTo } from './board.js';
import { fetchHistory, onChat, publicHistory } from './chat.js';
import { APP_ID, COLOR, DIR_NAMES, NET_HOSTS, NET_URL, PHONE, REACTIONS, RELAYS, RING_STYLES, SEEN_EVERY_S, SEEN_FRESH_MS, STUN_SERVERS } from './constantes.js';
import { isBanned, onKick } from './admin.js';
import { onDeskNames, syncDeskNamesTo } from './desks.js';
import { reportRoom } from './directory.js';
import { $, cleanName, debugMode, sameName, toast } from './dom.js';
import { cleanEmote } from './emotes.js';
import { startApp } from './hud.js';
import { closeLink, onPeerStream, updateRouting } from './media.js';
import { resolveOverlap, startDash } from './movement.js';
import { renderPeople } from './panel.js';
import { onCallMsg, onVmail, phonePeerLeft, phonePeerState } from './call.js';
import { onRingFile } from './ring.js';
import { forceRename, look } from './profile.js';
import { shareLink } from './rooms.js';
import { addReaction, onJingle } from './social.js';
import { firstArrival } from './spaces.js';
import { S, myIds, users } from './state.js';
import { MAP, PORTAL_SPOT, isBlocked, zoneAt } from './world.js';

export const profile = () => ({ name: S.me.name, look: S.me.look, x: S.me.x, y: S.me.y, dir: S.me.dir, seated: S.me.seated, sitAt: S.me.sitAt || 0, crouch: !!S.me.crouch, onAir: !!S.me.onAir, hand: !!S.me.hand, six: !!S.me.sixSeven, dab: !!S.me.dab, emote: S.me.emote || null, age: Math.round(performance.now() - S.joinedAt), mic: S.micOn, ptt: S.pttHeld, sharing: S.sharing, ...phoneState() });

// On arrive par la porte des espaces, comme en changeant d'espace (firstArrival)
export function connect(name) {
  const [x, y] = PORTAL_SPOT;
  S.myId = S.tr.selfId;
  myIds.add(S.myId);
  S.me = {
    id: S.myId, isMe: true, name, look: { ...look }, x, y, rx: x, ry: y, dir: 'down',
    zone: zoneAt(x, y), seated: false, mic: false, ptt: false, sharing: false, walk: 0, level: 0,
  };
  users.set(S.myId, S.me);
  S.joinedAt = performance.now();
  joinNet(); // identifiants TURN déjà demandés au clic (prepareIce dans profile.js)
  reportRoom(); // annuaire des espaces : annoncé à l'arrivée, puis périodiquement (directory.js)
  addEventListener('pagehide', () => S.room?.leave());
  watchConnection();
  startApp();
  firstArrival();
}

// ============================================================
// Serveurs TURN : identifiants temporaires demandés au service réseau, gardés jusqu'à
// peu avant leur expiration. Sans réponse, on se connecte sans TURN (comme avant).
// ============================================================
// Service réseau : NET_URL depuis les pages de NET_HOSTS, ou ?net=… en mode débogage (tests
// en local avec un relais local). Exporté pour le diagnostic (diag.js), qui lui envoie son rapport.
export function netUrl() {
  const q = new URLSearchParams(location.search);
  if (debugMode() && q.get('net')) return q.get('net').replace(/\/$/, '');
  return NET_HOSTS.includes(location.hostname) ? NET_URL.replace(/\/$/, '') : '';
}
// Relais de mise en relation : le nôtre seul tant qu'il répond. Les relais publics ne
// servent qu'en secours, s'il est injoignable (netDown) : les utiliser tous à la fois
// multipliait les offres pour une même personne (une par relais). En secours, le nôtre reste
// dans la liste, pour retrouver ceux qui y sont encore dès qu'il revient.
let netDown = false;
export const onBackupRelays = () => netDown; // pour le diagnostic
const ownRelay = () => `${netUrl().replace(/^http/, 'ws')}/relay`;
const relayUrls = () => (!netUrl() ? RELAYS : netDown ? [ownRelay(), ...RELAYS] : [ownRelay()]);

let ice = null; // { servers, until }
let iceLoading = null; // demande en cours (une seule à la fois)
const validIce = (s) => s && (typeof s.urls === 'string' || Array.isArray(s.urls));
// La même demande dit si notre relais répond (netDown), avant de choisir les relais
export function prepareIce() {
  if (!netUrl() || (!netDown && ice && Date.now() < ice.until)) return Promise.resolve();
  iceLoading ||= (async () => {
    try {
      const res = await fetch(`${netUrl()}/turn`, { signal: AbortSignal.timeout(4000) });
      const d = await res.json();
      const servers = (Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers]).filter(validIce);
      if (servers.length) ice = { servers, until: Date.now() + (Number(d.ttl) || 3600) * 1000 * 0.8 };
      netDown = relayLost; // il répond : nôtre seul, sauf s'il a déjà lâché pendant la session
    } catch { netDown = true; }
    iceLoading = null;
  })();
  return iceLoading;
}

// Serveurs ICE passés à Trystero (ajoutés à ses STUN par défaut) : ceux de /turn, puis
// nos STUN publics de secours s'ils n'y figurent pas déjà
export function iceServers() {
  const got = ice?.servers || [];
  const urls = new Set(got.flatMap((s) => s.urls));
  return got.concat(STUN_SERVERS.filter((s) => !urls.has(s.urls)));
}

// ?relay : n'utiliser que le serveur TURN (pour vérifier qu'il fonctionne)
function joinNet() {
  const relayOnly = new URLSearchParams(location.search).has('relay');
  S.room = S.tr.joinRoom({
    appId: APP_ID, relayConfig: { urls: relayUrls() }, turnConfig: iceServers(),
    ...(relayOnly && { rtcConfig: { iceTransportPolicy: 'relay' } }),
  }, S.roomId);
  S.net = {
    hello: S.room.makeAction('hello', { onMessage: onHello }),
    move: S.room.makeAction('move', { onMessage: onRemoteMove }),
    state: S.room.makeAction('state', { onMessage: onRemoteState }),
    chat: S.room.makeAction('chat', { onMessage: (d, { peerId }) => users.has(peerId) && onChat(d?.channel, d?.msg, peerId) }),
    wb: S.room.makeAction('wb', { onMessage: onBoardMsg }),
    react: S.room.makeAction('react', {
      onMessage: (d, { peerId }) => { const u = users.get(peerId); if (u && REACTIONS.includes(d?.e)) addReaction(u, d.e); },
    }),
    kick: S.room.makeAction('kick', { onMessage: (d) => onKick(d) }),
    call: S.room.makeAction('call', { onMessage: (d, { peerId }) => onCallMsg(d, peerId) }),
    ringfile: S.room.makeAction('ringfile', { onMessage: (d, { peerId, metadata }) => onRingFile(d, peerId, metadata) }),
    vmail: S.room.makeAction('vmail', { onMessage: (d, { peerId, metadata }) => onVmail(d, peerId, metadata) }),
    jingle: S.room.makeAction('jingle', { onMessage: (d, { peerId }) => users.has(peerId) && onJingle(users.get(peerId)) }),
    seen: S.room.makeAction('seen', { onMessage: (d, { peerId }) => onSeen(d, peerId) }),
    zname: S.room.makeAction('zname', { onMessage: (d, { peerId }) => onDeskNames(d, peerId) }),
    wbsaved: S.room.makeAction('wbsaved', { kind: 'request', onRequest: () => savedBoards() }),
    history: S.room.makeAction('history', { kind: 'request', onRequest: (d) => publicHistory(String(d?.channel)) }),
  };
  S.room.onPeerJoin = (id) => {
    if (isBanned(id)) return dropPeer(id); // expulsé de cet espace : on ne le reprend pas
    helloAsked.set(id, performance.now());
    S.net.hello.send(profile(), { target: id }).catch(() => {});
  };
  S.room.onPeerLeave = onPeerLeave;
  S.room.onPeerStream = onPeerStream;
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
// Notre relais a lâché en cours de session : on reste sur les relais de secours jusqu'au
// rechargement de la page (sinon, aller-retour sans fin s'il répond en HTTP mais pas en WebSocket)
let relayLost = false;
const RELAY_LOST_MS = 20000; // plus long qu'un redéploiement du relais (quelques secondes)

const relaysUp = () => {
  try { return Object.values(S.tr.getRelaySockets()).some((s) => s.readyState === 1); } catch { return true; }
};

// Quitte la salle : chaque pair est retiré, la liaison Trystero fermée. Renvoie la fin du départ
// (2 s au plus), qu'attendent ceux qui rejoignent une salle aussitôt après (rejoin, switchRoom)
function dropRoom() {
  for (const id of [...users.keys()]) if (id !== S.myId) onPeerLeave(id, true);
  const old = S.room;
  S.room = null; S.net = null;
  return Promise.race([Promise.resolve(old?.leave()).catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
}

export async function relaunch() {
  if (rejoining || S.kicked) return;
  rejoining = true;
  lastRejoin = performance.now();
  const btn = $('#waitRetry');
  btn.disabled = true; btn.textContent = 'Reconnexion…';
  dropRoom();
  try {
    S.tr = await import(`../vendor/trystero-nostr.js?instance=${Date.now()}`);
  } catch {
    toast('Impossible de relancer la connexion : vérifiez votre réseau.');
  }
  if (S.tr.selfId !== S.myId) {
    dropBoardsOf(S.myId);
    users.delete(S.myId);
    S.myId = S.me.id = S.tr.selfId;
    myIds.add(S.myId);
    users.set(S.myId, S.me);
    helloAsked.clear();
  }
  relaysDownSince = 0;
  connected = true;
  await prepareIce();
  joinNet();
  rejoining = false;
  btn.disabled = false;
  renderPeople(); updatePresence();
}

export async function rejoin() {
  if (rejoining || !S.room) return;
  rejoining = true;
  lastRejoin = performance.now();
  await dropRoom();
  await prepareIce();
  joinNet();
  rejoining = false;
  updatePresence();
}

// Changement d'espace (porte du couloir) : on quitte la salle et on en rejoint une
// autre, avec la même identité et la même apparence
export async function switchRoom(id) {
  rejoining = true;
  lastRejoin = performance.now();
  await dropRoom();
  S.roomId = id;
  S.joinedAt = performance.now(); // nouvel arrivant dans cet espace (pseudos en double : checkNameClash)
  helloAsked.clear();
  aloneSince = 0;
  await prepareIce();
  joinNet();
  reportRoom();
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

// Diagnostic affiché dans la liste des participants : la connexion avec chaque
// personne est-elle directe, ou relayée par le serveur TURN ?
let ticks = 0;

// Recoupement des présences. Le maillage peut rester incomplet sans que rien ne le montre :
// deux personnes reliées à toutes les autres, mais pas entre elles. Chacun annonce donc à
// intervalles réguliers les personnes auxquelles il est relié (action `seen`) ; on en déduit
// celles que les autres voient et pas nous, pour le diagnostic.
const seenBy = new Map();       // id du pair -> { at, list: Map(id -> nom) }
const missingSince = new Map(); // id d'une personne vue par d'autres et pas par moi -> depuis quand
function sendSeen() {
  const list = [...users.values()].filter((u) => !u.isMe).slice(0, 100).map((u) => [u.id, u.name]);
  if (list.length) broadcast('seen', list);
}
function onSeen(d, peerId) {
  if (!users.has(peerId) || !Array.isArray(d)) return;
  const list = new Map();
  for (const e of d.slice(0, 100)) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || e[0].length > 40) continue;
    list.set(e[0], cleanName(e[1]) || 'Invité');
  }
  seenBy.set(peerId, { at: performance.now(), list });
}
// Personnes que d'autres voient et pas moi : [{ name, by (combien les voient), ms (depuis) }]
export function missingPeers() {
  const now = performance.now(), found = new Map();
  for (const [from, s] of seenBy) {
    if (now - s.at > SEEN_FRESH_MS || !users.has(from)) { seenBy.delete(from); continue; }
    for (const [id, name] of s.list) {
      if (id === S.myId || myIds.has(id) || users.has(id) || isBanned(id)) continue;
      const f = found.get(id) || { name, by: 0 };
      f.by++; found.set(id, f);
    }
  }
  for (const id of missingSince.keys()) if (!found.has(id)) missingSince.delete(id);
  for (const id of found.keys()) if (!missingSince.has(id)) missingSince.set(id, now);
  return [...found].map(([id, f]) => ({ ...f, ms: now - missingSince.get(id) }));
}
// Types (host / srflx / relay…) de la paire de candidats retenue pour une liaison,
// [local, distant], ou null tant qu'aucune paire n'est choisie. Jamais d'adresse.
export async function linkTypes(pc) {
  if (!pc?.getStats) return null;
  const stats = await pc.getStats();
  let pair = null;
  stats.forEach((s) => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId); });
  if (!pair) stats.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
  if (!pair) return null;
  return [stats.get(pair.localCandidateId)?.candidateType, stats.get(pair.remoteCandidateId)?.candidateType];
}
async function checkLinks() {
  for (const [id, pc] of Object.entries(S.room?.getPeers?.() || {})) {
    const u = users.get(id);
    if (!u) continue;
    try {
      const types = await linkTypes(pc);
      if (!types) continue;
      const link = types.includes('relay') ? 'relay' : 'direct';
      if (u.link !== link) { u.link = link; renderPeople(); }
    } catch {}
  }
}

function watchConnection() {
  setInterval(() => {
    // Relais tous injoignables depuis plus de 8 s (le temps qu'ils s'ouvrent au démarrage)
    if (relaysUp()) relaysDownSince = 0;
    else if (!relaysDownSince) relaysDownSince = performance.now();
    connected = navigator.onLine && (!relaysDownSince || performance.now() - relaysDownSince < 8000);
    // Notre relais, seul utilisé, ne revient pas : on rejoint la salle par les relais de secours
    if (netUrl() && !netDown && navigator.onLine && relaysDownSince && performance.now() - relaysDownSince > RELAY_LOST_MS) {
      relayLost = netDown = true;
      rejoin();
    }
    if (ice && Date.now() > ice.until) prepareIce(); // pour les prochaines connexions
    if (++ticks % 5 === 0) checkLinks();
    if (ticks % SEEN_EVERY_S === 0) sendSeen();
    updatePresence();
    // Seul depuis un moment : on rejoint la salle (sans effet si elle est vraiment vide)
    if (users.size <= 1 && aloneSince && performance.now() - aloneSince > 8000 && performance.now() - lastRejoin > 30000) rejoin();
    // Pair connecté mais jamais présenté (message perdu) : on se représente et on lui demande de faire pareil
    for (const id of Object.keys(S.room?.getPeers?.() || {})) {
      if (users.has(id) || performance.now() - (helloAsked.get(id) || 0) < 2000) continue;
      helloAsked.set(id, performance.now());
      S.net?.hello.send({ ...profile(), ask: true }, { target: id }).catch(() => {});
    }
  }, 1000);
  addEventListener('online', () => setTimeout(rejoin, 1000));
  addEventListener('offline', () => { connected = false; updatePresence(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && users.size <= 1 && performance.now() - lastRejoin > 5000) rejoin();
  });
  $('#waitInvite').onclick = () => shareLink(S.roomId);
  $('#waitRetry').onclick = relaunch;
}

// Téléphone (phone.js), vu des autres : `phone` (qui sonne / au téléphone), `ring` (sonnerie
// choisie, entendue des voisins), `call` (correspondant), `spk` (haut-parleur)
export const phoneState = () => ({
  phone: S.me.phone || null, ring: S.ring, rv: S.ring === 'file' ? customRingRev() : 0, call: S.me.call || null, spk: !!S.me.speaker,
});
const remotePhone = (d, peerId) => ({
  phone: Object.values(PHONE).includes(d?.phone) ? d.phone : null,
  ring: RING_STYLES.some((r) => r.id === d?.ring) ? d.ring : 'ip',
  ringRev: Number(d?.rv) || 0, // empreinte de son fichier de sonnerie personnel
  // Mon correspondant : c'est notre appel qui fait foi, pas ce qu'il annonce
  call: S.me?.call === peerId ? S.myId : typeof d?.call === 'string' ? d.call.slice(0, 40) : null,
  speaker: !!d?.spk,
});
export function broadcast(action, data) { S.net?.[action].send(data).catch(() => {}); }

// Applique une position reçue ; refuse les cases bloquées ou hors carte
function setPos(u, d) {
  const x = d?.x | 0, y = d?.y | 0;
  if (isBlocked(x, y)) return false;
  u.x = x; u.y = y;
  u.dir = DIR_NAMES.includes(d.dir) ? d.dir : u.dir || 'down';
  u.zone = zoneAt(x, y);
  return true;
}

// État annoncé par un participant, reçu dans `hello` comme dans `state` : la seule liste de ses champs
function applyState(u, d, peerId) {
  if (d?.six && !u.sixSeven) u.sixSevenAt = performance.now();
  Object.assign(u, { mic: !!d?.mic, ptt: !!d?.ptt, sharing: !!d?.sharing, onAir: !!d?.onAir, hand: !!d?.hand, sixSeven: !!d?.six, dab: !!d?.dab, ...remotePhone(d, peerId) });
  receiveEmote(u, d?.emote);
}

function onHello(d, { peerId }) {
  if (isBanned(peerId)) return dropPeer(peerId);
  const known = users.get(peerId);
  const u = known || { id: peerId, walk: 0, level: 0 };
  u.name = cleanName(d?.name) || 'Invité';
  u.look = {
    shirt: COLOR.test(d?.look?.shirt) ? d.look.shirt : '#6c63ff',
    hair: COLOR.test(d?.look?.hair) ? d.look.hair : '#3b2a20',
    skin: COLOR.test(d?.look?.skin) ? d.look.skin : '#f1c7a4',
    head: lookHead(d?.look),
    body: lookBody(d?.look),
    style: d?.look?.style === 'girl' ? 'girl' : 'boy',
  };
  if (!setPos(u, d) && !known) setPos(u, { x: MAP.spawns[0][0], y: MAP.spawns[0][1] });
  u.rx = u.x; u.ry = u.y;
  u.seated = !!d?.seated;
  u.sitAt = Number(d?.sitAt) || 0;
  u.crouch = !!d?.crouch;
  if (d?.ask) S.net?.hello.send(profile(), { target: peerId }).catch(() => {});
  applyState(u, d, peerId);
  users.set(peerId, u);
  checkNameClash(u, Number(d?.age));
  resolveOverlap(u);
  if (!known) {
    syncBoardsTo(peerId);
    syncDeskNamesTo(peerId);
    if (performance.now() - S.joinedAt > 5000) toast(`${u.name} a rejoint l'espace`);
    if (!S.globalHistoryLoaded) { S.globalHistoryLoaded = true; fetchHistory('global', [peerId]); }
    fetchSavedBoards(peerId); // tableaux fermés gardés par les autres (une fois)
    if (u.zone === S.me.zone) fetchHistory(S.me.zone, [peerId]);
  }
  renderPeople(); updateRouting(); updatePresence();
}

// Émote reçue (liste blanche) ; l'heure de départ sert à l'animation d'apparition
function receiveEmote(u, e) {
  e = cleanEmote(e);
  if (e !== (u.emote || null)) u.emoteAt = performance.now();
  u.emote = e;
}


// Pseudos uniques dans l'espace (sans tenir compte de la casse) : c'est le dernier arrivé qui
// change. Chacun annonce depuis combien de temps il est connecté (age, durée relative : ne
// dépend pas des horloges, parfois décalées) ; à peu près en même temps, l'identifiant départage.
function checkNameClash(u, age) {
  if (!S.me || !sameName(u.name, S.me.name)) return;
  const mine = performance.now() - S.joinedAt;
  const theirs = Number.isFinite(age) && age >= 0 ? age : 0;
  const iAmNewer = Math.abs(mine - theirs) < 1500 ? S.myId > u.id : mine < theirs;
  if (iAmNewer) forceRename(u.name);
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
  if (d.jump) u.jumpAt = performance.now();
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
  if (d?.hand && !u.hand) { u.handAt = performance.now(); if (u.zone === S.me.zone) toast(`✋ ${u.name} lève la main`); }
  applyState(u, d, peerId);
  const talking = pttReaches(u);
  if (talking !== wasTalking) neighbourBeep(u, talking);
  phonePeerState(peerId);
  updateRouting(); renderPeople();
}

// Personne expulsée (admin.js) : retirée tout de suite, sans annonce. Elle quitte la salle
// d'elle-même et Trystero ferme alors la liaison proprement ; la fermer nous-mêmes tout de
// suite fait échouer son nettoyage (removeTrack sur une connexion fermée). On ne la ferme
// de force que si elle est encore ouverte après 5 s (version modifiée qui ne part pas).
export function dropPeer(id) {
  if (users.has(id)) onPeerLeave(id, true);
  setTimeout(() => {
    const pc = S.room?.getPeers?.()[id];
    if (pc && pc.connectionState !== 'closed') try { pc.close(); } catch {}
  }, 5000);
}

// Expulsé·e : on quitte la salle pour de bon (pas de reconnexion automatique)
export function leaveRoom() {
  S.kicked = true;
  dropRoom();
}

function onPeerLeave(id, silent = false) {
  const u = users.get(id);
  users.delete(id);
  dropBoardsOf(id);
  closeLink(id);
  phonePeerLeft(id);
  if (u && !silent) toast(`${u.name} est parti·e`);
  renderPeople(); updateRouting(); updatePresence();
}
