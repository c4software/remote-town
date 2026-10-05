# Relais de mise en relation de Remote Town

Relais Nostr minimal utilisé par Trystero pour la signalisation WebRTC (qui se connecte à qui). Il ne transporte ni le son ni l'image, seulement de petits messages de mise en relation, et ne stocke rien.

**Pourquoi** : les relais Nostr publics limitent par adresse IP. Une salle pleine derrière le même réseau (école, entreprise) dépassait leurs quotas : des participants ne se trouvaient jamais, ou au compte-gouttes. Ce relais n'a pas de quota par IP. L'application n'utilise que lui tant qu'il répond ; les relais publics (`RELAYS` dans `public/js/constantes.js`) ne servent qu'en secours, s'il est injoignable à l'arrivée ou fermé plus de 20 s en cours de session.

## Fonctionnement

- `server.mjs` : serveur HTTP + WebSocket (`ws`). Seul `/relay` accepte les WebSocket, et seulement depuis les pages listées dans la variable d'environnement `ALLOWED_ORIGINS` (origines séparées par des virgules, `:*` = n'importe quel port ; défaut : `https://distance.brosseau.ovh,https://c4software.github.io`). `/health` répond `ok`, et `/turn` donne à l'application les serveurs TURN à utiliser (voir « Serveur TURN » ; liste vide s'il n'est pas activé). `POST /diag` reçoit le rapport du bouton « 🩺 Diagnostic » de l'application (texte brut) et l'écrit dans le journal, entre `===== DIAGNOSTIC <date> =====` et `===== FIN =====`.
- Messages Nostr gérés : `REQ`, `EVENT`, `CLOSE` (ceux qu'utilise Trystero). Chaque événement est transmis aux abonnés dont le filtre correspond. Les dates `since` / `until` des filtres sont **ignorées** : rien n'est stocké, et Trystero y met l'heure de l'ordinateur local ; une horloge en avance (53 s constatées) faisait filtrer toutes les réponses des autres, et la personne restait seule sans erreur.
- Garde-fous : messages de 64 Ko au plus, 32 abonnements et 200 messages par seconde par connexion, connexions mortes fermées par ping toutes les 25 s.

## Serveur TURN

Certaines paires de participants n'arrivent pas à se joindre directement (NAT strict d'un côté ou de l'autre) : la liaison reste en « connecting » une quinzaine de secondes puis échoue, et la personne est invisible, sans erreur. Un serveur TURN relaie alors le son et l'image de ces paires-là.

- Service `remote-town-turn` de `docker-compose.yml` : coturn, sur le réseau de l'hôte, port **3478 en UDP et en TCP**, relais sur les ports **UDP 49152 à 65535**. Ces ports doivent être ouverts dans le pare-feu du serveur ; vérifier de l'extérieur (`nc -vz 94.130.59.245 3478`).
- Identifiants temporaires : `/turn` signe un nom (date d'expiration + partie aléatoire) avec `TURN_SECRET`, le secret partagé avec coturn (`use-auth-secret`). Valables 24 h, parce que la page les garde pour toute la session.
- Fichier `.env` du dossier, **sur le serveur seulement** (ignoré par git) : `TURN_SECRET=…` (`openssl rand -hex 32`, obligatoire) et `TURN_HOST=relay.brosseau.ovh`. Sans `TURN_HOST`, coturn tourne mais `/turn` répond une liste vide : c'est l'interrupteur.
- Identifiants limités à `TURN_PER_MIN` par minute et par adresse (400 par défaut, comme les connexions : plusieurs classes derrière la même adresse arrivent dans la même minute). Au-delà, `/turn` répond une liste vide, sans erreur, pour que la page ne prenne pas le relais pour injoignable ; le refus est compté dans le journal (`turn`).
- Garde-fous de coturn : relais UDP seulement (`no-tcp-relay`), aucun relais vers les réseaux privés (conteneurs, hôte), 120 relais par identifiant (une page en garde une trentaine : 28 mesurés) et 15 000 au total (la plage compte 16 384 ports, soit environ 530 personnes en même temps), 400 Ko/s par relais, conteneur en lecture seule avec la seule capacité `NET_BIND_SERVICE` (exigée par le binaire de l'image).
- Vérifier : `?relay` dans l'adresse de l'application force le passage par le TURN ; le badge « relais » de la liste des participants signale les liaisons qui y passent ; `docker logs remote-town-turn`.

## Sécurité

Le relais ne stocke rien, n'a aucun secret et ne touche à aucun fichier : le risque principal est l'abus (s'en servir comme relais Nostr gratuit, ou le saturer). Le filtre par origine bloque les autres sites web, mais pas un script hors navigateur, qui peut annoncer n'importe quelle origine. D'où :

- **Abonnements précis seulement** : chaque filtre doit porter une liste « #x » de sujets (les salles), comme ceux de Trystero. Un filtre vide ou large, qui recevrait les messages de toutes les salles, est refusé (`CLOSED`).
- **Plafonds de connexions** : `MAX_CONNS` au total (1000 par défaut) et `MAX_PER_IP` par adresse (400 par défaut, de quoi accueillir une salle entière derrière la même IP). L'adresse réelle vient de l'en-tête `X-Real-IP` posé par Nginx Proxy Manager, seul à joindre le conteneur. Tous les compteurs par adresse (connexions, diagnostics, identifiants TURN) comptent une IPv4 telle quelle et une IPv6 par préfixe /64 (`ipKey`), parce qu'un même abonné dispose de tout un /64 ; une IPv4 présentée en IPv6 (`::ffff:1.2.3.4`) compte comme l'IPv4. Au-delà : refus 503.
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

Le service TURN se relance de la même façon, lui seul : `docker compose up -d remote-town-turn`.

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

Avec `NET=…`, le relais local est le seul utilisé. Pour vérifier le secours sur les relais publics, pointer vers un relais injoignable : `NET=http://localhost:1 npm run test:e2e -- connexion`.
