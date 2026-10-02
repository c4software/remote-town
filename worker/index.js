// Service réseau de Remote Town (Cloudflare Worker, offre gratuite). Deux rôles :
//
// - /turn : identifiants TURN temporaires. Le serveur TURN relaie le son et l'image
//   quand deux participants ne peuvent pas se connecter directement (réseau
//   d'entreprise, 4G…). Ses clés restent secrètes ici (TURN_KEY_ID, TURN_KEY_API_TOKEN).
//
// - /relay : relais Nostr minimal pour la mise en relation (signalisation WebRTC) de
//   Trystero. Les relais publics limitent par adresse IP : une salle pleine derrière
//   le même réseau (école, entreprise) se faisait couper. Ici, pas de quota par IP.
//   Trystero n'utilise que REQ / EVENT / CLOSE avec des annonces éphémères : rien n'est
//   stocké, chaque événement est transmis aux abonnés dont le filtre correspond.

// Pages autorisées (le site publié, l'instance de test et le serveur de développement)
const ALLOWED = [
  /^https:\/\/c4software\.github\.io$/,
  /^https:\/\/distance\.brosseau\.ovh$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
const TURN_TTL = 24 * 3600; // une journée de travail ; la page en redemande avant l'expiration
const TURN_API = 'https://rtc.live.cloudflare.com/v1/turn/keys';

const allowedOrigin = (req) => {
  const origin = req.headers.get('Origin') || '';
  return ALLOWED.some((re) => re.test(origin)) ? origin : null;
};

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    const origin = allowedOrigin(req);
    if (!origin) return new Response('Origine non autorisée', { status: 403 });
    if (pathname === '/relay') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
      // Un seul relais pour toutes les salles : le trafic de signalisation est faible
      return env.RELAY.get(env.RELAY.idFromName('global')).fetch(req);
    }
    if (pathname === '/turn') return turn(req, env, origin);
    return new Response('Introuvable', { status: 404 });
  },
};

async function turn(req, env, origin) {
  const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
  if (req.method !== 'GET') return new Response('Méthode non autorisée', { status: 405, headers: cors });
  const res = await fetch(`${TURN_API}/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TURN_TTL }),
  });
  if (!res.ok) return new Response('Serveur TURN indisponible', { status: 502, headers: cors });
  const data = await res.json();
  const list = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
  // Les navigateurs refusent le port 53 : on retire ces adresses (recommandation de Cloudflare)
  const iceServers = list.filter(Boolean).map((s) => ({
    ...s,
    urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)),
  })).filter((s) => s.urls.length);
  return Response.json({ iceServers, ttl: TURN_TTL }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
}

// ============================================================
// Relais Nostr (Durable Object, API WebSocket « hibernation » : pas de coût au repos).
// Les abonnements de chaque connexion sont gardés dans son attachement, qui survit
// à l'hibernation.
// ============================================================
const MAX_MESSAGE = 64 * 1024;
const MAX_SUBS = 32;

export class Relay {
  constructor(ctx) { this.ctx = ctx; }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ subs: {} });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return notice(ws, 'message refusé');
    let msg;
    try { msg = JSON.parse(raw); } catch { return notice(ws, 'JSON invalide'); }
    if (!Array.isArray(msg)) return;
    const [type, a, ...filters] = msg;
    const state = ws.deserializeAttachment() || { subs: {} };
    if (type === 'REQ' && typeof a === 'string') {
      if (!(a in state.subs) && Object.keys(state.subs).length >= MAX_SUBS) return ws.send(JSON.stringify(['CLOSED', a, 'error: trop d\'abonnements']));
      state.subs[a] = filters.filter((f) => f && typeof f === 'object');
      ws.serializeAttachment(state);
      ws.send(JSON.stringify(['EOSE', a])); // rien n'est stocké : fin immédiate de l'historique
    } else if (type === 'CLOSE' && typeof a === 'string') {
      delete state.subs[a];
      ws.serializeAttachment(state);
    } else if (type === 'EVENT' && a && typeof a === 'object' && typeof a.id === 'string') {
      ws.send(JSON.stringify(['OK', a.id, true, '']));
      for (const peer of this.ctx.getWebSockets()) {
        const subs = peer.deserializeAttachment()?.subs || {};
        for (const [id, fs] of Object.entries(subs)) {
          if (fs.some((f) => matches(f, a))) { try { peer.send(JSON.stringify(['EVENT', id, a])); } catch {} }
        }
      }
    }
  }

  webSocketClose(ws, code) { try { ws.close(code, 'fermé'); } catch {} }
  webSocketError(ws) { try { ws.close(1011, 'erreur'); } catch {} }
}

const notice = (ws, text) => { try { ws.send(JSON.stringify(['NOTICE', text])); } catch {} };

// Filtre Nostr (NIP-01) : ids, authors, kinds, since, until et étiquettes « #x »
function matches(f, ev) {
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
