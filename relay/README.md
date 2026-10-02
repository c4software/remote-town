# Relais de mise en relation de Remote Town

Relais Nostr minimal utilisé par Trystero pour la signalisation WebRTC (qui se connecte à qui). Il ne transporte ni le son ni l'image, seulement de petits messages de mise en relation, et ne stocke rien.

**Pourquoi** : les relais Nostr publics limitent par adresse IP. Une salle pleine derrière le même réseau (école, entreprise) dépassait leurs quotas : des participants ne se trouvaient jamais, ou au compte-gouttes. Ce relais n'a pas de quota par IP. Les relais publics restent en secours (`RELAYS` dans `public/js/config.js`).

## Fonctionnement

- `server.mjs` : serveur HTTP + WebSocket (`ws`). Seul `/relay` accepte les WebSocket, et seulement depuis les pages listées dans la variable d'environnement `ALLOWED_ORIGINS` (origines séparées par des virgules, `:*` = n'importe quel port ; défaut : `https://distance.brosseau.ovh,https://c4software.github.io`). `/health` répond `ok`, et `/turn` une liste vide de serveurs TURN (l'application en demande au même service ; aucun TURN n'est hébergé ici). `POST /diag` reçoit le rapport du bouton « 🩺 Diagnostic » de l'application (texte brut) et l'écrit dans le journal, entre `===== DIAGNOSTIC <date> =====` et `===== FIN =====`.
- Messages Nostr gérés : `REQ`, `EVENT`, `CLOSE` (ceux qu'utilise Trystero). Chaque événement est transmis aux abonnés dont le filtre correspond. Les dates `since` / `until` des filtres sont **ignorées** : rien n'est stocké, et Trystero y met l'heure de l'ordinateur local ; une horloge en avance (53 s constatées) faisait filtrer toutes les réponses des autres, et la personne restait seule sans erreur.
- Garde-fous : messages de 64 Ko au plus, 32 abonnements et 200 messages par seconde par connexion, connexions mortes fermées par ping toutes les 25 s.

## Sécurité

Le relais ne stocke rien, n'a aucun secret et ne touche à aucun fichier : le risque principal est l'abus (s'en servir comme relais Nostr gratuit, ou le saturer). Le filtre par origine bloque les autres sites web, mais pas un script hors navigateur, qui peut annoncer n'importe quelle origine. D'où :

- **Abonnements précis seulement** : chaque filtre doit porter une liste « #x » de sujets (les salles), comme ceux de Trystero. Un filtre vide ou large, qui recevrait les messages de toutes les salles, est refusé (`CLOSED`).
- **Plafonds de connexions** : `MAX_CONNS` au total (1000 par défaut) et `MAX_PER_IP` par adresse (150 par défaut, de quoi accueillir une salle entière derrière la même IP). L'adresse réelle vient de l'en-tête `X-Real-IP` posé par Nginx Proxy Manager, seul à joindre le conteneur. Au-delà : refus 503.
- **Conteneur durci** (`docker-compose.yml`) : système de fichiers en lecture seule, aucune capacité Linux, pas d'élévation de privilèges, 128 Mo et 64 processus au plus, utilisateur non-root, aucun port publié.
- **Diagnostics** (`POST /diag`) : origine autorisée seulement (403 sinon), 8 Ko au plus (413), un par minute et par adresse (429). Le texte est écrit tel quel dans le journal (caractères de contrôle retirés), sans l'adresse du client, qui ne sert qu'au compteur en mémoire. L'application n'y met aucune adresse IP. Pour les lire :

  ```bash
  ssh -p 1036 vbrosseau@94.130.59.245 'docker logs remote-town-relay 2>&1 | sed -n "/===== DIAGNOSTIC/,/===== FIN/p" | tail -200'
  ```

- **Journal** (`docker logs remote-town-relay`) : une ligne par minute quand il y a de l'activité, avec connexions, adresses, messages reçus et envoyés, et les refus par motif (origine, plafond, débit, abonnements, filtre large).

L'accès aux salles n'est pas protégé (qui connaît le nom d'une salle peut y entrer) : c'est le principe de l'application, que le relais ne change pas.

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
# le scénario « diagnostic » vérifie aussi le bloc journalisé si on lui donne la sortie du relais
# (relais lancé avec … node server.mjs > /tmp/relay.log) : DIAG_LOG=/tmp/relay.log NET=http://localhost:8090 npm run test:e2e -- diagnostic
```

Pour tester le relais **seul**, vider temporairement `RELAYS` dans `config.js` (sans le commiter). Pour vérifier le secours sur les relais publics, pointer vers un relais injoignable : `NET=http://localhost:1 npm run test:e2e -- connexion`.
