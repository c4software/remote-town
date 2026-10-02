# Relais de mise en relation de Remote Town

Relais Nostr minimal utilisé par Trystero pour la signalisation WebRTC (qui se connecte à qui). Il ne transporte ni le son ni l'image, seulement de petits messages de mise en relation, et ne stocke rien.

**Pourquoi** : les relais Nostr publics limitent par adresse IP. Une salle pleine derrière le même réseau (école, entreprise) dépassait leurs quotas : des participants ne se trouvaient jamais, ou au compte-gouttes. Ce relais n'a pas de quota par IP. Les relais publics restent en secours (`RELAYS` dans `public/js/config.js`).

## Fonctionnement

- `server.mjs` : serveur HTTP + WebSocket (`ws`). Seul `/relay` accepte les WebSocket, et seulement depuis les pages de `ALLOWED` (site publié, instance de l'équipe, développement). `/health` répond `ok`.
- Messages Nostr gérés : `REQ`, `EVENT`, `CLOSE` (ceux qu'utilise Trystero). Chaque événement est transmis aux abonnés dont le filtre correspond.
- Garde-fous : messages de 64 Ko au plus, 32 abonnements et 200 messages par seconde par connexion, connexions mortes fermées par ping toutes les 25 s.

Pour l'activer dans l'application : `NET_URL` dans `public/js/config.js` = adresse publique du relais (`https://…`), qui sert `wss://…/relay`.

## Déploiement (serveur actuel)

Debian 12, Docker, Nginx Proxy Manager devant (réseau Docker `server_default`). Le conteneur n'a pas de port publié : le proxy le joint par son nom.

```bash
# depuis la racine du dépôt
rsync -av --exclude node_modules -e "ssh -p 1036" relay/ vbrosseau@94.130.59.245:remote-town-relay/
ssh -p 1036 vbrosseau@94.130.59.245 'cd ~/remote-town-relay && docker compose up -d --build'
```

Dans Nginx Proxy Manager, un « Proxy Host » : le domaine du relais → `http://remote-town-relay:8080`, **Websockets Support** activé, certificat Let's Encrypt avec « Force SSL ».

Vérifier : `curl https://<domaine>/health` répond `ok`, et `docker logs remote-town-relay`.

## Tester en local

```bash
cd relay && npm install && PORT=8090 node server.mjs
# dans un autre terminal, depuis la racine : scénarios de bout en bout à travers ce relais
NET=http://localhost:8090 npm run test:e2e -- connexion
```

Pour tester le relais **seul**, vider temporairement `RELAYS` dans `config.js` (sans le commiter).
