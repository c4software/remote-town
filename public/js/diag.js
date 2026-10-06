// Diagnostic réseau : un texte lisible (une information par ligne, jamais d'adresse IP)
// à demander à une personne qui se retrouve « seule » alors que la salle est pleine.
// Le bouton « 🩺 Diagnostic » le copie dans le presse-papiers et l'envoie à notre relais
// (POST /diag, journalisé côté serveur) quand l'application l'utilise.
import { $, toast } from './dom.js';
import { iceServers, linkTypes, netUrl, onBackupRelays } from './net.js';
import { S, users } from './state.js';
import { MAP } from './world.js';

const MAX_LOGS = 30;
const logs = []; // derniers messages de console mentionnant Trystero, depuis le démarrage
let lastText = ''; // dernier diagnostic produit (tests)
// Avertissements de notre relais quand il ignore nos messages (débit dépassé, voir
// relay/server.mjs) : des offres perdues, donc des personnes qu'on ne voit pas
const dropped = { n: 0, last: '' };

export function initDiag() {
  // Trystero signale ses soucis (relais injoignable, pair en erreur) par console.warn /
  // console.error : on les garde pour le diagnostic, sans rien changer à l'affichage
  for (const level of ['warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      const text = args.map(fmt).join(' ');
      if (/trystero/i.test(text)) {
        if (/débit dépassé/.test(text)) { dropped.n++; dropped.last = clock(); }
        logs.push(`${clock()} [${level}] ${text.slice(0, 300)}`);
        if (logs.length > MAX_LOGS) logs.shift();
      }
      orig(...args);
    };
  }
  $('#waitDiag').onclick = runDiag;
  $('#profileDiag').onclick = runDiag;
  $('#diagClose').onclick = () => { $('#diagBox').hidden = true; };
}

const fmt = (a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : safeJson(a));
const safeJson = (a) => { try { return JSON.stringify(a); } catch { return String(a); } };
const clock = () => new Date().toTimeString().slice(0, 8);

// Bouton (masqué pour l'instant) ou commande /diag du chat : produire, copier, envoyer
let running = false;
export async function runDiag() {
  if (running) return;
  running = true;
  toast('🩺 Diagnostic en cours (quelques secondes)…');
  try {
    const text = await diagnostic();
    const [copied, sent] = await Promise.all([copy(text), send(text)]);
    if (!copied) showText(text);
    toast(copied ? (sent ? '🩺 Diagnostic copié et envoyé' : '🩺 Diagnostic copié') : (sent ? '🩺 Diagnostic envoyé' : '🩺 Diagnostic prêt'));
  } finally {
    running = false;
  }
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// Presse-papiers refusé : fenêtre avec le texte sélectionné, à copier à la main
function showText(text) {
  const ta = $('#diagText');
  ta.value = text;
  $('#diagBox').hidden = false;
  ta.focus(); ta.select();
}

// Envoi à notre relais, seulement si l'application l'utilise (pages de NET_HOSTS)
async function send(text) {
  if (!netUrl()) return false;
  try {
    // text/plain : requête « simple », sans préflight CORS
    const res = await fetch(`${netUrl()}/diag`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: text, signal: AbortSignal.timeout(6000) });
    return res.ok;
  } catch { return false; }
}

// Toute adresse IP qui se glisserait dans une ligne (message d'erreur, URL…) est masquée
// IPv4 : sauf un numéro de version (« Chrome/141.0.0.0 », précédé d'une lettre et d'un « / »)
const IPV4 = /(?<![a-z]\/)\b(?:\d{1,3}\.){3}\d{1,3}\b/gi;
// IPv6 : au moins quatre groupes, ou un « :: » (une heure « 14:03:12 » n'en a que trois)
const IPV6 = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b|[0-9a-f:]*::[0-9a-f:.]+/gi;
const scrub = (s) => String(s).replace(IPV4, '[ip masquée]').replace(IPV6, '[ip masquée]');

// Le rapport lui-même : lisible par un humain, une information par ligne
export async function diagnostic() {
  const lines = ['Diagnostic Remote Town'];
  const add = (label, value) => lines.push(`${label} : ${value}`);
  const q = new URLSearchParams(location.search);
  add('Date', new Date().toLocaleString('fr-FR'));
  add('Page', `${location.origin}${location.pathname}${q.has('room') ? `?room=${q.get('room')}` : ''}`);
  add('Page modifiée le', document.lastModified); // une vieille date = page servie depuis le cache
  add('Navigateur', navigator.userAgent);
  const c = navigator.connection;
  add('Réseau', `${navigator.onLine ? 'en ligne' : 'hors ligne'}${c ? ` (${[c.type, c.effectiveType].filter(Boolean).join(', ') || 'type inconnu'})` : ''}`);
  add('Salle', S.roomId);
  add('Nom', S.me?.name || '(pas encore connecté·e)');
  add('Connecté·e depuis', S.joinedAt ? duration(performance.now() - S.joinedAt) : '—');
  add('Zone', MAP.zoneById[S.me?.zone]?.name || S.me?.zone || '—');
  add('Notre relais', !netUrl() ? 'non utilisé (relais publics seuls)' : onBackupRelays() ? 'injoignable : relais publics en secours' : 'utilisé seul');

  lines.push('Relais de mise en relation :');
  let sockets = {};
  try { sockets = S.tr.getRelaySockets(); } catch {}
  const ours = netUrl() ? `${netUrl().replace(/^http/, 'ws')}/relay` : '';
  for (const [url, ws] of Object.entries(sockets)) lines.push(`  - ${url} : ${WS_STATE[ws?.readyState] || 'inconnu'}${url === ours ? ' (le nôtre)' : ''}`);
  if (!Object.keys(sockets).length) lines.push('  - aucun');

  add('Messages ignorés par le relais', dropped.n ? `${dropped.n} avertissement${dropped.n > 1 ? 's' : ''} (débit dépassé), le dernier à ${dropped.last}` : 'aucun');

  const others = [...users.values()].filter((u) => !u.isMe);
  add('Personnes vues', `${others.length}${others.length ? ` (${others.map((u) => u.name).join(', ')})` : ''}`);
  const peers = Object.entries(S.room?.getPeers?.() || {});
  lines.push(`Liaisons WebRTC (${peers.length}) :`);
  for (const [id, pc] of peers) {
    const name = users.get(id)?.name || `pair inconnu ${id.slice(0, 6)}`;
    let types = null;
    try { types = await linkTypes(pc); } catch {}
    lines.push(`  - ${name} : ${pc.connectionState} / ICE ${pc.iceConnectionState}${types ? `, ${types[0] || '?'} → ${types[1] || '?'}` : ', aucune paire choisie'}`);
  }
  // Fantômes : annoncés (hello reçu) mais sans liaison WebRTC vivante
  const ghosts = others.filter((u) => !peers.some(([id]) => id === u.id));
  if (ghosts.length) add('Vus sans liaison (fantômes)', ghosts.map((u) => u.name).join(', '));

  const ice = await iceTest();
  add('Test ICE (4 s)', `host ${ice.host}, srflx ${ice.srflx}, relay ${ice.relay}${ice.srflx ? '' : ' — aucun srflx : UDP probablement bloqué'}`);
  for (const e of ice.errors) lines.push(`  - erreur ICE ${e}`);

  add('Micro', !S.micStream ? 'absent' : S.micOn ? 'ouvert' : 'coupé');
  lines.push(`Console Trystero (${logs.length} message${logs.length > 1 ? 's' : ''}) :`);
  for (const l of logs) lines.push(`  ${l}`);
  lastText = lines.map(scrub).join('\n');
  return lastText;
}

const WS_STATE = ['en cours', 'connecté', 'fermeture', 'fermé'];

const duration = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

// Test ICE autonome : une connexion jetable avec les mêmes serveurs que l'application ;
// on compte les candidats par type. Sans srflx, le STUN (UDP) ne passe pas : il faudrait
// un TURN (TCP / TLS) pour ce réseau.
async function iceTest() {
  const out = { host: 0, srflx: 0, relay: 0, errors: [] };
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.createDataChannel('diag');
    pc.onicecandidate = (e) => { const t = e.candidate?.type; if (t) out[t] = (out[t] || 0) + 1; };
    pc.onicecandidateerror = (e) => { if (out.errors.length < 6) out.errors.push(`${e.errorCode} ${e.errorText || ''}`.trim()); };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((r) => {
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') r(); };
      setTimeout(r, 4000);
    });
  } catch (e) {
    out.errors.push(`test impossible : ${e.message}`);
  }
  pc?.close();
  return out;
}

export const lastDiag = () => lastText;
