# Relais de mise en relation de Remote Town

Relais Nostr minimal utilisé par Trystero pour la signalisation WebRTC (qui se connecte à qui). Il ne transporte ni le son ni l'image, seulement de petits messages de mise en relation, et ne stocke rien.

**Pourquoi** : les relais Nostr publics limitent par adresse IP. Une salle pleine derrière le même réseau (école, entreprise) dépassait leurs quotas : des participants ne se trouvaient jamais, ou au compte-gouttes. Ce relais n'a pas de quota par IP. Les relais publics restent en secours (`RELAYS` dans `public/js/config.js`).

## Fonctionnement

- `server.mjs` : serveur HTTP + WebSocket (`ws`). Seul `/relay` accepte les WebSocket, et seulement depuis les pages listées dans la variable d'environnement `ALLOWED_ORIGINS` (origines séparées par des virgules, `:*` = n'importe quel port ; défaut : `https://distance.brosseau.ovh,https://c4software.github.io`). `/health` répond `ok`, et `/turn` une liste vide de serveurs TURN (l'application en demande au même service ; aucun TURN n'est hébergé ici).
- Messages Nostr gérés : `REQ`, `EVENT`, `CLOSE` (ceux qu'utilise Trystero). Chaque événement est transmis aux abonnés dont le filtre correspond.
- Garde-fous : messages de 64 Ko au plus, 32 abonnements et 200 messages par seconde par connexion, connexions mortes fermées par ping toutes les 25 s.

Pour l'activer dans l'application : `NET_URL` dans `public/js/config.js` = adresse publique du relais (`https://…`), qui sert `wss://…/relay`, et `NET_HOSTS` = les pages qui l'utilisent (les mêmes que `ALLOWED_ORIGINS`). Depuis une autre page, l'application n'utilise que les relais publics.

## Déploiement (serveur actuel)

Le relais vit dans le projet Compose `~/server` du serveur (Debian 12, Docker, Nginx Proxy Manager devant), dans `~/server/services/remote-town-relay/` (copie de ce dossier, sans `node_modules`), inclus dans `~/server/docker-compose.yml` par une directive `include`. Le conteneur n'a pas de port publié : le proxy le joint par son nom sur le réseau du projet (`server_default`). Les origines autorisées sont dans `docker-compose.yml` (`ALLOWED_ORIGINS`).

Redéployer **seulement ce service** après une modification de `relay/` :

```bash
# depuis la racine du dépôt
rsync -a --exclude node_modules -e "ssh -p 1036" relay/ vbrosseau@94.130.59.245:server/services/remote-town-relay/
ssh -p 1036 vbrosseau@94.130.59.245 'cd ~/server && docker compose up -d --build remote-town-relay'
```

Dans Nginx Proxy Manager, un « Proxy Host » : `relay.brosseau.ovh` → `http://remote-town-relay:8080`, **Websockets Support** activé, certificat Let's Encrypt avec « Force SSL ».

Vérifier : `curl https://relay.brosseau.ovh/health` répond `ok`, `docker logs remote-town-relay`, et l'ouverture WebSocket selon l'origine (101 pour une page autorisée, 403 sinon) :

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://distance.brosseau.ovh' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' https://relay.brosseau.ovh/relay
```

## Tester en local

```bash
cd relay && npm install && PORT=8090 ALLOWED_ORIGINS='http://localhost:*' node server.mjs
# dans un autre terminal, depuis la racine : scénarios de bout en bout à travers ce relais
NET=http://localhost:8090 npm run test:e2e -- connexion
```

Pour tester le relais **seul**, vider temporairement `RELAYS` dans `config.js` (sans le commiter). Pour vérifier le secours sur les relais publics, pointer vers un relais injoignable : `NET=http://localhost:1 npm run test:e2e -- connexion`.
