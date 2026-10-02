// Relais de mise en relation de Remote Town : un relais Nostr minimal pour Trystero.
//
// Les relais Nostr publics limitent par adresse IP : une salle pleine derrière le même
// réseau (école, entreprise) se faisait couper, et des participants ne se trouvaient
// jamais. Ce relais n'a pas de quota par IP et n'accepte que les pages de Remote Town.
//
// Trystero n'utilise que REQ / EVENT / CLOSE avec des annonces éphémères : rien n'est
// stocké, chaque événement est transmis aux abonnés dont le filtre correspond.
// Lancer : node server.mjs (PORT=8080 par défaut). Voir README.md.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8080;
// Pages autorisées (le site publié, l'instance de l'équipe et le serveur de développement)
const ALLOWED = [
  /^https:\/\/c4software\.github\.io$/,
  /^https:\/\/distance\.brosseau\.ovh$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
const MAX_MESSAGE = 64 * 1024;
const MAX_SUBS = 32;        // abonnements par connexion
const MAX_RATE = 200;       // messages par seconde et par connexion (rafales d'offres à l'arrivée), au-delà : ignorés
const PING_MS = 25000;      // garde la connexion ouverte derrière le reverse proxy

const allowed = (origin) => ALLOWED.some((re) => re.test(origin || ''));

const http = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Introuvable');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });
http.on('upgrade', (req, socket, head) => {
  const path = req.url.split('?')[0];
  if (path !== '/relay' || !allowed(req.headers.origin)) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});

// Abonnements de chaque connexion : id d'abonnement -> filtres
const subs = new Map();

wss.on('connection', (ws) => {
  subs.set(ws, new Map());
  ws.alive = true;
  ws.rate = { at: 0, n: 0 };
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw, isBinary) => { if (!isBinary) onMessage(ws, raw.toString()); });
  ws.on('close', () => subs.delete(ws));
  ws.on('error', () => ws.terminate());
});

function onMessage(ws, raw) {
  const now = Date.now();
  if (now - ws.rate.at > 1000) ws.rate = { at: now, n: 0 };
  if (++ws.rate.n > MAX_RATE) return;
  let msg;
  try { msg = JSON.parse(raw); } catch { return send(ws, ['NOTICE', 'JSON invalide']); }
  if (!Array.isArray(msg)) return;
  const [type, a, ...filters] = msg;
  const mine = subs.get(ws);
  if (!mine) return;
  if (type === 'REQ' && typeof a === 'string') {
    if (!mine.has(a) && mine.size >= MAX_SUBS) return send(ws, ['CLOSED', a, 'error: trop d\'abonnements']);
    mine.set(a, filters.filter((f) => f && typeof f === 'object'));
    send(ws, ['EOSE', a]); // rien n'est stocké : fin immédiate de l'historique
  } else if (type === 'CLOSE' && typeof a === 'string') {
    mine.delete(a);
  } else if (type === 'EVENT' && a && typeof a === 'object' && typeof a.id === 'string') {
    send(ws, ['OK', a.id, true, '']);
    for (const [peer, theirs] of subs) {
      for (const [id, fs] of theirs) if (fs.some((f) => matches(f, a))) send(peer, ['EVENT', id, a]);
    }
  }
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

// Filtre Nostr (NIP-01) : ids, authors, kinds, since, until et étiquettes « #x »
export function matches(f, ev) {
  if (f.ids && !f.ids.includes(ev.id)) return false;
  if (f.authors && !f.authors.includes(ev.pubkey)) return false;
  if (f.kinds && !f.kinds.includes(ev.kind)) return false;
  if (f.since && ev.created_at < f.since) return false;
  if (f.until && ev.created_at > f.until) return false;
  for (const [key, values] of Object.entries(f)) {
    if (key[0] !== '#' || !Array.isArray(values)) continue;
    const tag = key.slice(1);
    if (!(ev.tags || []).some((t) => t[0] === tag && values.includes(t[1]))) return false;
  }
  return true;
}

// Connexions mortes (réseau coupé sans fermeture propre) : fermées au ping suivant
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, PING_MS);

http.listen(PORT, () => console.log(`Relais Remote Town sur le port ${PORT}`));
