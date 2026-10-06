// Relais de mise en relation de Remote Town : un relais Nostr minimal pour Trystero.
//
// Les relais Nostr publics limitent par adresse IP : une salle pleine derrière le même
// réseau (école, entreprise) se faisait couper, et des participants ne se trouvaient
// jamais. Ce relais n'a pas de quota par IP et n'accepte que les pages de Remote Town.
//
// Trystero n'utilise que REQ / EVENT / CLOSE avec des annonces éphémères : rien n'est
// stocké, chaque événement est transmis aux abonnés dont le filtre correspond.
// Lancer : node server.mjs (PORT=8080 par défaut). Voir README.md.
import { createHmac, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8080;
// Pages autorisées, séparées par des virgules ; « * » à la place du port = n'importe quel port
// (tests en local : ALLOWED_ORIGINS=http://localhost:*)
const ALLOWED = (process.env.ALLOWED_ORIGINS || 'https://distance.brosseau.ovh,https://c4software.github.io').split(',')
  .map((o) => o.trim()).filter(Boolean)
  .map((o) => new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:\*$/, ':\\d+')}$`));
const MAX_MESSAGE = 64 * 1024;
const MAX_SUBS = 32;        // abonnements par connexion
// Messages par seconde et par connexion, au-delà : ignorés. Large : dans une salle de 50, une
// arrivée ou un rechargement envoie d'un coup une offre par personne et par annonce ; à 200,
// des offres étaient perdues et certaines personnes ne se voyaient pas
const MAX_RATE = Number(process.env.MAX_RATE) || 4000;
const RATE_NOTICE_MS = 10000; // au plus un avertissement « débit dépassé » par connexion sur cette durée
const PING_MS = 25000;      // garde la connexion ouverte derrière le reverse proxy
// Plafonds de connexions : une salle entière derrière la même IP (école, entreprise) doit
// passer, avec une marge pour les onglets en double et les reconnexions
const MAX_CONNS = Number(process.env.MAX_CONNS) || 1000;
const MAX_PER_IP = Number(process.env.MAX_PER_IP) || 400;
const MAX_TOPICS = 32;      // sujets (« #x ») par filtre
// Diagnostics (bouton « 🩺 Diagnostic » de l'application, POST /diag) : écrits dans le
// journal, bornés en taille et en fréquence par adresse pour ne pas l'inonder
const DIAG_MAX = 8 * 1024;
const DIAG_EVERY_MS = 60000;
// Serveur TURN (coturn, service remote-town-turn) : il relaie le son et l'image des paires
// qui n'arrivent pas à se joindre directement. TURN_SECRET est le secret partagé avec lui
// (static-auth-secret) ; sans lui ou sans TURN_HOST, /turn répond une liste vide.
const TURN_HOST = process.env.TURN_HOST || '';
const TURN_SECRET = process.env.TURN_SECRET || '';
// Durée des identifiants : la page les garde pour toute la session (Trystero les reçoit une
// fois, en rejoignant la salle), donc une journée de cours entière
const TURN_TTL = 24 * 3600;
// Identifiants TURN par minute et par adresse : une classe entière derrière la même adresse
// arrive dans la même minute (une demande par page). Au-delà : liste vide, pas d'erreur, pour
// que la page ne prenne pas le relais pour injoignable.
const TURN_PER_MIN = Number(process.env.TURN_PER_MIN) || 400;

const allowed = (origin) => ALLOWED.some((re) => re.test(origin || ''));
// Adresse réelle du client : transmise par Nginx Proxy Manager (seul à joindre le conteneur)
const clientIp = (req) => ipKey(String(req.headers['x-real-ip'] || req.socket.remoteAddress || '?').slice(0, 64));

// Clé des compteurs par adresse (connexions, diagnostics, identifiants TURN). IPv4 : l'adresse.
// IPv6 : le préfixe /64, parce qu'un même abonné dispose de tout un /64 et changerait
// d'adresse à chaque demande. Une IPv4 présentée en IPv6 (::ffff:1.2.3.4) compte comme l'IPv4.
export function ipKey(raw) {
  const ip = raw.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6) return ip;
  let [head, tail = ''] = ip.split('::');
  // Fin en notation IPv4 (::ffff:1.2.3.4) : ramenée à deux groupes hexadécimaux
  const v4 = (tail || head).match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  const hex = v4 ? `${((v4[1] << 8) | +v4[2]).toString(16)}:${((v4[3] << 8) | +v4[4]).toString(16)}` : '';
  if (v4) { if (ip.includes('::')) tail = tail.replace(v4[0], hex); else head = head.replace(v4[0], hex); }
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  const g = groups.map((x) => parseInt(x, 16) || 0);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}

// Compteurs, écrits dans le journal une fois par minute (docker logs remote-town-relay)
const stats = { msgIn: 0, msgOut: 0, refused: {} };
const RATE_NOTICE = 'débit dépassé : messages ignorés par le relais';
const refuse = (why) => { stats.refused[why] = (stats.refused[why] || 0) + 1; };
const perIp = new Map(); // ip -> connexions ouvertes
const diagAt = new Map(); // ip -> heure du dernier diagnostic reçu
const turnAsked = new Map(); // ip -> { at, n } : identifiants TURN donnés dans la minute

const http = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (req.url === '/diag') return onDiag(req, res);
  if (req.url === '/turn' && allowed(req.headers.origin)) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': req.headers.origin, Vary: 'Origin', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(turnAllowed(clientIp(req)) ? turnServers() : { iceServers: [] }));
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Introuvable');
});

// Identifiants TURN temporaires (« TURN REST API » de coturn, use-auth-secret) : le nom
// porte la date d'expiration, le mot de passe est sa signature avec le secret partagé.
// Une partie aléatoire dans le nom : le quota de coturn se compte par nom, donc par page.
function turnAllowed(ip) {
  if (!TURN_HOST || !TURN_SECRET) return true;
  const now = Date.now();
  for (const [k, v] of turnAsked) if (now - v.at > 60000) turnAsked.delete(k);
  const mine = turnAsked.get(ip) || { at: now, n: 0 };
  turnAsked.set(ip, mine);
  if (++mine.n <= TURN_PER_MIN) return true;
  refuse('turn');
  return false;
}
function turnServers() {
  if (!TURN_HOST || !TURN_SECRET) return { iceServers: [] };
  const username = `${Math.floor(Date.now() / 1000) + TURN_TTL}:${randomBytes(6).toString('hex')}`;
  const credential = createHmac('sha1', TURN_SECRET).update(username).digest('base64');
  // UDP d'abord ; TCP pour les réseaux qui bloquent l'UDP
  const urls = [`turn:${TURN_HOST}:3478?transport=udp`, `turn:${TURN_HOST}:3478?transport=tcp`];
  return { iceServers: [{ urls, username, credential }], ttl: TURN_TTL };
}

// Diagnostic envoyé par l'application : un bloc délimité dans le journal, lisible avec
// docker logs. L'adresse du client ne sert qu'au compteur, elle n'est pas écrite.
function onDiag(req, res) {
  const origin = req.headers.origin;
  if (!allowed(origin)) { refuse('origine'); res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Origine refusée'); }
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600',
  };
  const reply = (code, text) => { res.writeHead(code, headers); res.end(text); };
  if (req.method === 'OPTIONS') return reply(204, '');
  if (req.method !== 'POST') return reply(405, 'Méthode non autorisée');
  const ip = clientIp(req);
  const now = Date.now();
  for (const [k, at] of diagAt) if (now - at > DIAG_EVERY_MS) diagAt.delete(k);
  if (diagAt.has(ip)) { refuse('diagnostic'); return reply(429, 'Un diagnostic par minute'); }
  if (Number(req.headers['content-length']) > DIAG_MAX) { req.resume(); return reply(413, 'Diagnostic trop long'); }
  const chunks = []; let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > DIAG_MAX) { if (!res.writableEnded) reply(413, 'Diagnostic trop long'); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    diagAt.set(ip, now);
    // Texte brut seulement : caractères de contrôle retirés (sauf retours à la ligne et
    // tabulations), et les délimiteurs du bloc ne peuvent pas être imités
    const text = Buffer.concat(chunks).toString('utf8').replace(/[^\P{C}\n\t]/gu, '').replace(/={5,}/g, '-----').trim();
    console.log(`===== DIAGNOSTIC ${new Date(now).toISOString()} =====\n${text}\n===== FIN =====`);
    reply(200, 'merci');
  });
}

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });
http.on('upgrade', (req, socket, head) => {
  const path = req.url.split('?')[0];
  if (path !== '/relay' || !allowed(req.headers.origin)) {
    refuse('origine');
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  const ip = clientIp(req);
  if (wss.clients.size >= MAX_CONNS || (perIp.get(ip) || 0) >= MAX_PER_IP) {
    refuse('plafond');
    socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.ip = ip;
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    wss.emit('connection', ws);
  });
});

// Abonnements de chaque connexion : id d'abonnement -> filtres
const subs = new Map();

wss.on('connection', (ws) => {
  subs.set(ws, new Map());
  ws.alive = true;
  ws.rate = { at: 0, n: 0 };
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw, isBinary) => { if (!isBinary) onMessage(ws, raw.toString()); });
  ws.on('close', () => {
    subs.delete(ws);
    const n = (perIp.get(ws.ip) || 1) - 1;
    if (n > 0) perIp.set(ws.ip, n); else perIp.delete(ws.ip);
  });
  ws.on('error', () => ws.terminate());
});

function onMessage(ws, raw) {
  const now = Date.now();
  if (now - ws.rate.at > 1000) ws.rate = { at: now, n: 0 };
  if (++ws.rate.n > MAX_RATE) {
    refuse('débit');
    // La personne est prévenue : Trystero l'écrit dans sa console, reprise par le diagnostic
    // de l'application (un refus silencieux a déjà rendu des personnes invisibles)
    if (now - (ws.noticeAt || 0) > RATE_NOTICE_MS) { ws.noticeAt = now; send(ws, ['NOTICE', RATE_NOTICE]); }
    return;
  }
  stats.msgIn++;
  let msg;
  try { msg = JSON.parse(raw); } catch { return send(ws, ['NOTICE', 'JSON invalide']); }
  if (!Array.isArray(msg)) return;
  const [type, a, ...filters] = msg;
  const mine = subs.get(ws);
  if (!mine) return;
  if (type === 'REQ' && typeof a === 'string' && a.length <= 64) {
    if (!mine.has(a) && mine.size >= MAX_SUBS) { refuse('abonnements'); return send(ws, ['CLOSED', a, 'error: trop d\'abonnements']); }
    // Seulement des abonnements à des sujets précis (les salles), comme ceux de Trystero :
    // un filtre large recevrait les messages de toutes les salles
    if (!filters.length || !filters.every(precise)) { refuse('filtre large'); return send(ws, ['CLOSED', a, 'error: filtre « #x » requis']); }
    mine.set(a, filters);
    send(ws, ['EOSE', a]); // rien n'est stocké : fin immédiate de l'historique
  } else if (type === 'CLOSE' && typeof a === 'string') {
    mine.delete(a);
  } else if (type === 'EVENT' && a && typeof a === 'object' && typeof a.id === 'string' && a.id.length <= 128) {
    send(ws, ['OK', a.id, true, '']);
    for (const [peer, theirs] of subs) {
      for (const [id, fs] of theirs) if (fs.some((f) => matches(f, a))) send(peer, ['EVENT', id, a]);
    }
  }
}

function send(ws, msg) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
  stats.msgOut++;
}

// Filtre accepté : un objet avec une liste « #x » de sujets (chaînes courtes), non vide
const precise = (f) => f && typeof f === 'object' && Array.isArray(f['#x']) && f['#x'].length > 0
  && f['#x'].length <= MAX_TOPICS && f['#x'].every((t) => typeof t === 'string' && t.length <= 128);

// Filtre Nostr (NIP-01) : ids, authors, kinds et étiquettes « #x ».
// since / until sont volontairement ignorés : rien n'est stocké, seuls des événements en
// direct sont transmis, et Trystero met dans since l'heure de l'ordinateur local. Une
// horloge en avance (53 s constatées) faisait filtrer toutes les réponses des autres : la
// personne restait seule, sans erreur.
export function matches(f, ev) {
  if (f.ids && !f.ids.includes(ev.id)) return false;
  if (f.authors && !f.authors.includes(ev.pubkey)) return false;
  if (f.kinds && !f.kinds.includes(ev.kind)) return false;
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

// Journal : une ligne par minute quand il y a de l'activité ou des refus
setInterval(() => {
  const refused = Object.entries(stats.refused).map(([k, v]) => `${k}=${v}`).join(' ');
  if (!wss.clients.size && !stats.msgIn && !refused) return;
  console.log(`${new Date().toISOString()} connexions=${wss.clients.size} ip=${perIp.size} reçus=${stats.msgIn} envoyés=${stats.msgOut}${refused ? ` refus: ${refused}` : ''}`);
  Object.assign(stats, { msgIn: 0, msgOut: 0, refused: {} });
}, 60000);

// Arrêt propre (docker stop) : sinon Node, processus n° 1 du conteneur, ignore SIGTERM
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    for (const ws of wss.clients) ws.close(1001, 'redémarrage');
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

http.listen(PORT, () => console.log(`Relais Remote Town sur le port ${PORT}`));
