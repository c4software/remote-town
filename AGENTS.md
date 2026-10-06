# AGENTS.md — faire évoluer Remote Town

Guide pour les agents (et les humains) qui modifient ce projet. À lire avant toute modification ; le [README](README.md) décrit le produit côté utilisateur.

## Le projet en bref

Bureau virtuel façon Gather Town : carte en pixel-art (canvas), personnages, audio et partage d'écran en WebRTC pair-à-pair, chat, tableau blanc. Publié sur GitHub Pages : https://c4software.github.io/remote-town/

Contraintes à respecter :

- **Aucune étape de build** : JavaScript en modules ES natifs, servis tels quels depuis `public/`.
- **Aucune dépendance à l'exécution**, hormis Trystero embarqué dans `public/vendor/` (bundle minifié, ne pas le modifier à la main). `puppeteer-core` n'est qu'une dépendance de développement pour les tests.
- **Aucun serveur applicatif** : `server.js` n'est qu'un serveur statique de développement. Tout l'état vit chez les participants.
- **Tout est en français** : interface, commentaires, messages de commit. Typographie française dans les textes affichés (« guillemets », espace avant `:`, élision « d'Alice » via `ofName()` de `dom.js`).
- Navigateur cible : Chrome / Edge sur ordinateur ; mobile supporté (sans partage d'écran).

## Architecture

```
public/index.html   structure de la page (écran du personnage, barre, panneaux)
public/style.css    styles (variables CSS dans :root, sections commentées)
public/js/main.js   point d'entrée
relay/              relais de mise en relation auto-hébergé (Node + ws, Docker), voir relay/README.md
tools/admin-key.mjs génère la clé d'administration (expulsion), voir « Modération »
```

Modules de `public/js/` :

| Module | Rôle |
| --- | --- |
| `main.js` | Appelle les `init…()` de chaque module, dans l'ordre |
| `debug.js` | `window.rt` avec `?debug` : en local, ou sur le site publié avec un jeton d'administration vérifié (`debugMode()` de `dom.js`, `S.isAdmin`) |
| `state.js` | État partagé : `S` (session), `users`, `keys`, `myIds` |
| `constantes.js` | Constantes et énumérations : vitesses, palettes, relais Nostr, clavier, et les listes de choix qui sont la seule source pour les écrans et la validation du réseau (`STYLES`, `HEAD_OPTIONS`, `BODY_OPTIONS`, `EMOTES`, `REACTIONS`, `RING_STYLES`), les énumérations (`PHONE`, `CALL_PHASE`, `CALL_MSG`, `PHONE_VIEW`, `CHAT_KEY`, `WB_MSG`) et les réglages du téléphone, du chat, du tableau, de la modération. Importe `world.js` (qui reste pur et garde ses propres constantes : carte, rayons, types de zone) |
| `world.js` | Carte, zones, mobilier, règles `sendsAudio` / `sendsVideo` / `sideBySide` / `isOnAir`. **Module pur** (ni DOM ni état), testé par `npm test` |
| `dom.js` | `$`, `toast`, `typing`, `ofName`, `isFirefox` |
| `avatar.js` | Dessin des personnages et accessoires (fonctions pures sur un contexte canvas) |
| `map-render.js` | Dessin de la carte, pré-calculé une fois |
| `render.js` | Boucle `requestAnimationFrame`, caméra, personnages, effets, étiquettes |
| `movement.js` | Pas à pas, trajets (BFS), chaises, pupitre, accroupi, dash, rejoindre quelqu'un, endurance (course limitée, `STAMINA` dans `constantes.js`) |
| `input.js` | Raccourcis clavier, toucher la carte (mobile : sur ordinateur, déplacement au clavier uniquement, le clic de souris ne déplace pas) |
| `net.js` | Connexion Trystero, messages reçus, présence, attente, reconnexion |
| `media.js` | Flux par pair (micro / écran), volume des voix, actions M / N / partage |
| `audio.js` | Micro, niveaux, bips du talkie, effet haut-parleur du pupitre |
| `profile.js` | Écran du personnage (connexion et modification), préférences locales |
| `rooms.js` | Nom de salle, lien d'invitation, espaces enregistrés (`rt-spaces`) |
| `hud.js` | Démarrage de l'app, changement de zone, barre du bas, aide |
| `panel.js` | Participants : qui parle (`isTransmitting`), `renderPeople()` (rafraîchit les contacts du téléphone et les mains levées), menu d'une main levée (rejoindre, appeler, écrire) |
| `chat.js` | Discussions : groupes « Tout le monde » et salle courante, messages directs entre deux personnes (`dm:<pseudo>`), historique, non-lus, notifications des messages reçus. Ses deux pages sont dans `pages/chats.js` et `pages/chat.js` |
| `social.js` | Réactions, main levée, bulles des mains levées, jingle du pupitre |
| `spaces.js` | Porte des espaces (couloir) : fenêtre de choix, espaces enregistrés, passage animé d'un espace à l'autre (`S.warp`), arrivée initiale par la porte (`firstArrival`), écriteau du nom de l'espace |
| `desks.js` | Noms des bureaux : chaque bureau (zones de type `desk` seulement) se renomme avec `E` sur son nom, écrit au sol à son entrée, à condition d'y être depuis 2 minutes (`DESK_RENAME_AFTER_MS`, `S.zoneAt` ; vérifié chez la personne qui renomme seulement) (`deskLabelAt` dans `world.js`, fenêtre `#deskName`). `zoneName(id)` est **le seul accès au nom affiché d'une zone** (carte, étiquette de zone, contacts, discussion de la salle, diagnostic) : ne plus lire `MAP.zoneById[…].name` ailleurs. Comme les messages du chat, le nom ne vit que chez les personnes connectées : action `zname`, donné à qui arrive (`syncDeskNamesTo`), remis à zéro en changeant d'espace (`resetDeskNames`). Chaque nom porte un numéro `rev` qui augmente à chaque renommage : le plus grand l'emporte, sans dépendre des horloges ; nom vide = nom d'origine |
| `phone.js` | Téléphone, la coque (bouton de la barre du bas) : ouverture et fermeture, navigation entre les pages (`PHONE_VIEW`), affichage d'ensemble, pastille ; voir « Téléphone » |
| `pages/` | Les pages du téléphone, **une par fichier**, chacune exportant sa fonction de page : `call.js` (écran de l'appel), `home.js`, `contacts.js`, `person.js` (fiche : appeler, écrire, rejoindre, volume, expulsion), `chats.js` (liste des conversations), `chat.js` (une conversation), `vmail.js` (messagerie vocale), `look.js` (personnage), `settings.js` (réglages). `ui.js` : icônes, boutons et portraits partagés |
| `call.js` | Appels : état de l'appel en cours (`call`), ordres `CALL_MSG`, phases `CALL_PHASE`, règles (salles de classe, pas d'appels à la suite, ne pas déranger), messages vocaux |
| `ring.js` | Sonnerie des téléphones voisins : volume selon la distance, fichier audio personnel envoyé à la demande (action `ringfile`) |
| `admin.js` | Modération : expulsion signée (fiche de la personne dans le téléphone, avec le jeton d'administration) |
| `emotes.js` | Émotes animées (travail, AFK…) : roue du clic droit, dessin au-dessus du nom. La machine à eau du couloir (`COOLER`, `nearCooler` dans `world.js`) donne l'émote café (`COOLER_EMOTE`) avec `E` à côté d'elle, ou en la touchant sur mobile (`coffeeBreak` dans `movement.js`, `S.coolerTarget`). Les places de repos (canapés, banc du couloir : `rest` sur la place, `restSeat` dans `world.js`) donnent la sieste (`REST_EMOTE`) tant qu'on y est assis (`syncRest` dans `movement.js`, à chaque `sendMove`). Absence : onglet quitté et aucune action depuis `AWAY_MS` (10 min), l'émote `AWAY_EMOTE` (« Travail ») se met d'office si aucune n'est choisie, et se retire au retour ou à la première action (`checkAway`, vérifié toutes les `AWAY_CHECK_MS`) |
| `board.js` | Tableau blanc (classe, bureau principal) : dessin, et écriture au clavier (outil « Texte » : une zone de saisie `#boardText` posée à l'endroit cliqué ; le texte est un élément de `strokes` avec `text`, renvoyé en entier à chaque frappe). Un tableau fermé (bouton, sortie de la salle, départ du propriétaire) survit **comme les messages du chat, ni plus ni moins** : son contenu est gardé en mémoire par les personnes connectées (`saveBoard`, par salle), demandé à une personne présente quand on arrive (action `wbsaved`, `fetchSavedBoards`), repris par le tableau rouvert dans la salle (`openBoard`, puis `sync`), jamais écrit dans le navigateur, perdu quand l'espace se vide et remis à zéro en changeant d'espace (`resetBoards`) |
| `teacher.js` | Bulle du prof : dans une salle de classe, la personne au bureau du prof (ou qui tient le tableau blanc : `teacherOf` dans `board.js`) reste visible. Quand elle sort de l'écran ou que le tableau en grand recouvre la carte (`boardLarge`), son portrait s'affiche en bas à gauche (`#teacher`), anneau vert quand elle parle ; un clic ouvre sa fiche. Rafraîchie toutes les `TEACHER_BUBBLE_MS` |
| `pip.js` | Vue en incrustation (Document Picture-in-Picture) : recopie du canevas principal recadrée autour de soi. `P`, ou automatique en changeant d'onglet si activé (action Media Session `enterpictureinpicture`, que Chrome n'accorde qu'aux pages utilisant le micro) ; réglage `S.pipOn`, désactivé par défaut (`pipAuto` dans `rt-prefs`), activé dans les réglages du téléphone (`phone.js`), fenêtre de 440 × 390. Onglet caché, la boucle de la page s'arrête : la fenêtre appelle `frame()` de `render.js` à sa place. Onglet caché pendant qu'on suit le partage d'écran de quelqu'un en grand (`focusedShare` de `videos.js`), la fenêtre montre ce partage (un élément `<video>` dans la fenêtre) à la place de la carte ; la carte revient au retour sur l'onglet |
| `videos.js` | Partages d'écran reçus, affichage en grand, projection |
| `diag.js` | Bouton « 🩺 Diagnostic » : rapport texte sur la connexion (page, navigateur, relais, liaisons par pair, test ICE, console Trystero), sans adresse IP, copié et envoyé à notre relais (`POST /diag`) |

### Règles qui gardent le code sain

1. **Pas d'effet de bord au chargement d'un module** : seulement des déclarations (`const`, `function`). Tout ce qui touche à la page (écouteurs, création d'éléments) va dans une fonction `initXxx()` exportée et appelée par `main.js`. Les modules s'importent mutuellement (cycles) : c'est sans risque tant que rien ne s'exécute au chargement ; sinon, erreur « Cannot access … before initialization ».
2. **État partagé** : une variable lue ou modifiée par plusieurs modules vit dans `S` (`state.js`) et s'écrit `S.xxx`. On mute `S`, on ne le réassigne jamais. Une variable utile à un seul module reste privée dans ce module. Ajouter un champ à `S` = le déclarer dans `state.js` avec un commentaire.
3. **Les règles « qui entend / voit qui » vivent dans `world.js`**, pas dans le code d'interface. Toute nouvelle règle s'accompagne d'un test dans `tests/world.test.js`.
4. **Les données reçues du réseau sont validées** (couleurs avec `COLOR`, positions avec `setPos`, listes blanches pour les accessoires et réactions, longueurs bornées). Un autre participant peut envoyer n'importe quoi.
5. **Respect du micro** : un micro coupé (`S.micOn === false`) ne doit jamais être entendu, quelle que soit la règle de proximité. Le `N` (`S.pttHeld`) et le pupitre sont des actions explicites.
6. Style : 2 espaces, apostrophes simples, points-virgules, fonctions courtes ; des commentaires qui expliquent le *pourquoi*, en français.

## Modèle réseau

- `net.js` rejoint une salle Trystero (`S.tr.joinRoom`) identifiée par `APP_ID` + nom de salle. Chaque participant est relié directement à tous les autres (maillage, pas d'hôte).
- **Mise en relation (signalisation)** : notre relais Nostr (`relay/`, adresse `NET_URL` dans `constantes.js`) est **le seul utilisé** tant qu'il répond ; les relais publics `RELAYS` ne servent qu'en secours (`relayUrls()` dans `net.js`). Les utiliser tous à la fois multipliait les offres pour une même personne (une par relais). Le secours se déclenche de deux façons : à l'arrivée, si la demande `/turn` de `prepareIce()` échoue (`netDown`) ; en cours de session, si notre relais reste fermé plus de 20 s (`RELAY_LOST_MS`, plus long qu'un redéploiement), auquel cas on rejoint la salle par les relais publics (`relayLost`, jusqu'au rechargement de la page). En secours, notre relais reste dans la liste pour retrouver ceux qui y sont encore. Limite connue : une personne qui, seule, ne joint pas notre relais ne voit pas celles qui n'utilisent que lui. Le relais n'accepte que les pages de `NET_HOSTS` (variable `ALLOWED_ORIGINS` côté serveur) ; depuis une autre page, relais publics seuls. Il faut garder `NET_HOSTS` et `ALLOWED_ORIGINS` (`relay/server.mjs`, `relay/docker-compose.yml`) en cohérence.
- **ICE** : `prepareIce()` demande `${netUrl()}/turn` (liste `iceServers`, repli silencieux), puis `iceServers()` y ajoute les STUN publics gratuits de `STUN_SERVERS` (`constantes.js`), le tout passé à Trystero dans `turnConfig`, concaténé à ses STUN par défaut. Un serveur TURN (coturn, service `remote-town-turn` de `relay/docker-compose.yml`) relaie les paires qui ne se joignent pas directement : `/turn` en donne l'adresse avec des identifiants temporaires quand il est activé (`TURN_HOST` dans le `.env` du serveur), une liste vide sinon ; voir « Serveur TURN » dans `relay/README.md`.
- **Diagnostic** : bouton « 🩺 Diagnostic » (`diag.js`, dans le bandeau d'attente et l'écran du personnage ; **boutons masqués pour l'instant** par l'attribut `hidden` dans `index.html` : le retirer pour les réafficher). On le lance en tapant **`/diag` dans le chat** (`chat.js`, jamais envoyé aux autres), ou `rt.diag()`. à demander à une personne qui se retrouve seule : il copie un rapport lisible (jamais d'adresse IP : seuls les types de candidats ICE sont gardés, et toute IP est masquée par sécurité) et l'envoie à notre relais, qui l'écrit dans son journal. Pour les lire : `ssh -p 1036 vbrosseau@94.130.59.245 'docker logs remote-town-relay 2>&1 | sed -n "/===== DIAGNOSTIC/,/===== FIN/p" | tail -200'`. Lecture : « aucun srflx » au test ICE = UDP bloqué (il faudrait un TURN) ; « Page modifiée le » ancienne = page en cache ; une personne « vue sans liaison » = fantôme. « Vus par les autres, pas par moi » autre que « personne » = maillage incomplet : ces personnes sont reliées à d'autres et pas à celle qui envoie le rapport (`missingPeers` dans `net.js`, d'après les annonces `seen` de chacun) ; constaté le 6 octobre 2026 dans une salle de 20, par intermittence et sans cause établie (ni le relais, ni un message ignoré). « Messages ignorés par le relais » autre que « aucun » = notre relais a jeté des messages de cette personne (plafond `MAX_RATE` de `relay/server.mjs`, qu'il signale par un `NOTICE`, écrit par Trystero dans la console) : des offres perdues, donc des personnes qui ne se voient pas ; à 200 messages par seconde, une salle de 50 le dépassait (plafond relevé à 4000). Badge « relais » dans la liste des participants quand une liaison passe par TURN (`linkTypes` / `checkLinks` dans `net.js`, `panel.js`) ; `?relay` force `iceTransportPolicy: 'relay'` pour vérifier un TURN ; `?net=https://…` avec `?debug` pointe vers un autre relais ; `NET=http://localhost:8090 npm run test:e2e -- connexion` fait passer les tests de bout en bout par un relais local (`cd relay && PORT=8090 ALLOWED_ORIGINS='http://localhost:*' node server.mjs`).
- Actions Trystero (dans `joinNet`) et charge utile :

| Action | Contenu | Envoyée |
| --- | --- | --- |
| `hello` | profil complet (`profile()`, dont `age` : depuis combien de temps on est connecté), `ask: true` pour demander le sien en retour | à chaque nouveau pair, et si un pair reste inconnu |
| `move` | `x, y, dir, seated, sitAt, crouch` (+ `dash`) | à chaque déplacement (`sendMove`) |
| `state` | `mic, ptt, sharing, onAir, hand, six` (« 67 » : 6 + 7 maintenus), `dab` (B maintenu), `emote` (liste `EMOTES`), téléphone : `phone` (`ring` : il sonne, `call` : en ligne), `ring` (sonnerie choisie, entendue des voisins) et `rv` (empreinte du fichier personnel), `call` (identifiant du correspondant), `spk` (haut-parleur) | à chaque changement (`pushState`) |
| `chat` | `{ channel, msg }` | canal `global` à tous, canal de zone aux personnes de la zone, canal `dm` à une seule personne (message direct) |
| `seen` | `[[id, nom], …]` : les personnes auxquelles on est relié (100 au plus) | à tous, toutes les 10 s (`SEEN_EVERY_S`) |
| `zname` | `[{ z, name, rev }]` : noms donnés aux bureaux (`z` : bureau seulement, `name` nettoyé et borné à `DESK_NAME_MAX`, `rev` : le plus grand l'emporte) | à tous au renommage, et à chaque personne qui arrive |
| `wbsaved` | requête : `{}` → `[{ z, strokes }]` (contenu des tableaux fermés gardés en mémoire) | à la première personne connue, à la connexion |
| `history` | requête : `{ channel }` → liste de messages (groupes seulement : `publicHistory`, jamais les messages directs) | en entrant dans une zone / à la connexion |
| `wb` | tableau blanc : `open`, `seg`, `txt` (bloc de texte entier : `id, c, w, p: [x, y], s`), `clear`, `close`, `sync` | par le propriétaire du tableau |
| `react` | `{ e }` (emoji de la liste `REACTIONS`) | à tous |
| `jingle` | `{}` (carillon d'annonce, joué seulement si l'auteur est au pupitre) | à tous, avec `J` au pupitre |
| `call` | `{ t }` : `ring`, `accept`, `decline`, `busy`, `cancel`, `end` | à la personne appelée / appelante seulement (`call.js`) |
| `vmail` | binaire (message vocal, 400 Ko au plus), métadonnée `{ type }` | à la personne qui a manqué l'appel |
| `ringfile` | `{ ask: true }`, ou binaire (sonnerie personnelle, 600 Ko au plus), métadonnée `{ type }` | demande : par un voisin qui entend sonner ; fichier : en réponse, à lui seul |
| `kick` | `{ target, ts, sig }` (expulsion signée, vérifiée par chacun) | à tous, par un administrateur |

- **Téléphone** (`phone.js`, `pages/`, `call.js`, `ring.js`) : il s'ouvre avec le bouton téléphone de la barre du bas (`#phoneBtn`, pastille : messages non lus et messages vocaux) et monte du bas de l'écran (`#phone`, animation `ph-up` / `ph-down`). Il remplace le panneau latéral : il n'y a plus ni liste des participants ni chat ailleurs. Pages (`PHONE_VIEW`) : accueil, contacts, fiche d'une personne (appeler, écrire, rejoindre, volume, expulsion pour les administrateurs), messages (liste des conversations puis conversation, fournies par `chat.js`), messagerie vocale, personnage, réglages. `Entrée` ouvre la discussion de la salle (`openChat`).
  - **Appel** : phases `CALL_PHASE`, ordres `CALL_MSG`. Pendant l'appel, chacun note l'autre dans le champ `call` de son participant ; `sendsAudio` (`world.js`) envoie alors le micro, même coupé (décrocher est une action explicite, comme le `N`). Dès la sonnerie, le canal du micro est préparé muet (`callPrep`, `applySenders`). Réglages dans `CALL` (`constantes.js`).
  - **Règles** : le téléphone marche partout, mais il reste discret dans les salles de classe (`phoneQuietIn` dans `world.js`, mêmes salles que le talkie) : le téléphone y est en silencieux (ni sonnerie ni tonalité chez soi : `ringHere` dans `call.js`, mention « En silencieux » sur l'écran d'appel), les autres n'y entendent ni la sonnerie d'un voisin (`ringVolume`), ni un appel sur haut-parleur (`speakerHolder` ; bouton désactivé sur l'écran d'appel, haut-parleur coupé en y entrant, `phoneZoneChange`). Un micro ouvert (`M`) reste entendu de la salle, appel ou non ; pas d'appels à la suite (`gapMs` : côté appelant, et côté appelé qui refuse sans sonner) ; « ne pas déranger » (`S.dnd`) renvoie l'appelant vers la messagerie sans que ça sonne.
  - **Message vocal** : sans réponse au bout de `ringMs`, refus ou personne occupée, l'appelant peut enregistrer un message (`MediaRecorder`, `vmailMs`), accepté par l'appelé seulement après un appel manqué de cette personne, un seul par appel, taille bornée ; les messages reçus ne vivent que dans la page.
  - **Vu des autres** (champs `phone`, `ring`, `call`, `spk` de `state`) : le personnage brandit un téléphone qui vibre quand ça sonne, le tient à l'oreille pendant l'appel (`drawPhone` dans `render.js`). Les personnes proches (4 cases, même zone) entendent sa sonnerie, celle qu'il a choisie, d'autant plus bas qu'elles sont loin (`ringVolume` dans `world.js`, `nearbyRing` / `neighbourRing`), au volume réglé pour cette personne. Un fichier audio personnel (`rt-ring-file`) est envoyé à la demande : le voisin qui l'entend sonner pour la première fois le demande (action `ringfile`, `ringSource` / `onRingFile`), le garde le temps de la session (`ringRev`, la taille du fichier, annoncée dans `state` : s'il change, il est redemandé) et entend le motif par défaut en attendant. Garde-fous : envoyé seulement pendant que ça sonne et à quelqu'un qui est à portée, une fois toutes les 10 s par personne ; accepté seulement s'il a été demandé, 600 Ko au plus, format audio connu (`RING_FILE_TYPES`) ; le réglage « Sonneries personnelles des autres » (`S.otherRings`) permet de s'en tenir au motif par défaut.
  - **Haut-parleur** (`S.me.speaker`, bouton pendant l'appel) : sans lui, personne d'autre n'entend l'appel. Avec, les personnes à portée (`PROX_RADIUS`, même zone) entendent les deux voix : `speakerHolder` (`world.js`) dit de quel téléphone sort la voix, `applySenders` envoie le micro en conséquence, le volume se mesure depuis ce téléphone (`distanceVolume`), et le correspondant est prévenu sur son écran d'appel.
  - **Sonneries** : `RING_STYLES` (`constantes.js`), motifs originaux synthétisés dans `RINGS` (`audio.js`), rendus en WAV comme le carillon ; réglage `S.ring` mémorisé dans `rt-prefs`.
  - **Personnage** : style, couleurs et accessoires modifiés dans le téléphone et appliqués tout de suite (`setLook` de `profile.js`) ; le nom y est seulement affiché, on ne change pas d'identité depuis le téléphone, à partir des mêmes listes que l'écran du personnage, qui reste celui de la connexion ; en session il ne s'ouvre plus que par la ligne « Écran complet (micro…) » de cette page. Le bouton de son personnage, dans la barre du bas, ouvre le téléphone sur cette page (`openLook`).
- **Discussions** (`chat.js`) : conversations `CHAT_KEY` (`global`, `zone`, `dm:<pseudo>`). La discussion de la salle n'existe que dans les pièces : dans le couloir (zone de type `open`, `zoneChat()`), `Entrée` ouvre « Tout le monde », la liste ne propose pas de discussion de salle, et une conversation de salle restée ouverte en sortant d'une pièce passe à « Tout le monde ». Un message reçu sur le canal du couloir (page pas à jour) est rangé dans « Tout le monde ». Les messages directs sont rangés par pseudo (unique dans l'espace, alors que l'identifiant change à chaque reconnexion), envoyés à la seule personne visée, et jamais servis par l'action `history`. La conversation ouverte garde ses éléments d'un affichage à l'autre pour ne pas perdre le texte en cours de saisie. Un message reçu hors de la conversation ouverte s'annonce par une notification façon téléphone (`#notifs`, `showNotif` : portrait de la personne, nom, conversation, début du texte, `NOTIF_MS`) ; un clic ouvre la conversation, qui retire ses notifications.
- **Volume par personne** : réglage personnel (0 à 1) par nom, mémorisé dans `rt-volumes` (`personalVolume` / `setPersonalVolume` dans `media.js`), multiplié au volume de distance du `N` sur l'élément `<audio>`, et appliqué au gain final de l'effet haut-parleur du pupitre (`L.fx.gain`, `audio.js`).
- **Pseudo fixe** : il se choisit à la connexion et ne se change plus une fois dans l'espace (ni dans le téléphone, ni sur l'écran du personnage rouvert en session : champ en lecture seule, `lockName` dans `profile.js`, et `applyProfile` garde le pseudo de la connexion). Seule exception : le renommage imposé quand il est déjà pris.
- **Pseudos uniques par espace** : `cleanName()` (`dom.js`) nettoie tout pseudo saisi ou reçu (caractères invisibles et de contrôle retirés, blancs ramenés à une espace, `trim`, 24 caractères) ; `sameName()` compare sans la casse. À chaque `hello`, `checkNameClash()` (`net.js`) compare les durées de connexion (`age`, relatif : indépendant des horloges) : le dernier arrivé doit changer (`forceRename()` dans `profile.js`, écran du personnage sans Annuler ni Échap) ; à moins de 1,5 s d'écart, l'identifiant départage. `S.joinedAt` repart à zéro en changeant d'espace.
- **Choix du micro** : `S.micDevice` (mémorisé dans `rt-prefs`, retour au micro par défaut s'il est débranché, dans `initMic`). En session, `switchMic()` (`media.js`) ouvre le nouveau micro puis remplace chaque copie envoyée (`S.room.replaceTrack`, même état actif / coupé), sans renégocier ; en cas d'échec, l'ancien micro est gardé.
- **Médias** : pour chaque pair, on crée au besoin une copie (`clone()`) de notre piste micro / écran, ajoutée une seule fois (`addStream`), puis activée ou coupée (`enabled`) selon `sendsAudio` / `sendsVideo` (`applySenders` dans `media.js`). Pas de renégociation : `N` est instantané. `updateRouting()` recalcule tout après chaque déplacement ou changement d'état.
- **Partage d'écran à beaucoup de monde** : un flux par spectateur, tous encodés et envoyés par la personne qui partage (le TURN n'y change rien : il retransmet, il ne redistribue pas). `tuneShare()` (`media.js`) répartit donc un débit total entre les spectateurs (`SHARE` dans `constantes.js` : débit par flux borné, images par seconde et hauteur de l'image qui baissent par paliers avec le nombre), appliqué sur chaque envoi (`setParameters`, sans renégocier) et recalculé quand le nombre de spectateurs change.
- **Changement d'espace** : `switchRoom(id)` (porte du couloir, `spaces.js`) quitte la salle et en rejoint une autre avec le même identifiant de pair ; le chat de l'ancien espace est vidé.
- **Arrivée** : tout le monde arrive devant la porte des espaces (`PORTAL_SPOT`). Au clic sur « Rejoindre l'espace », `profile.js` fait grandir le cercle noir `#cover` depuis le point cliqué et lance la musique (dans le geste de l'utilisateur, sinon le navigateur bloque le son) ; `connect()` attend la fin du cercle, puis `firstArrival()` reprend le même écran noir sur le canevas, retire `#cover` et fait sortir le personnage de la porte. Pendant l'écran noir, la classe `warping` du `body` masque l'interface (tout `#app` sauf le canevas) ; `warp-in` la fait revenir en fondu. C'est une animation CSS et non une `transition`, pour ne pas écraser les transitions propres des éléments (panneau latéral…). Toujours passer par `setWarp()` pour changer `S.warp`.
- **Reconnexion** : `rejoin()` (seul trop longtemps, retour du réseau) et `relaunch()` (bouton « Relancer la connexion », charge une instance neuve de Trystero). Les relais utilisés sont listés dans `constantes.js` (`RELAYS`).

## Modération

Volontairement absente de l'aide et du README.

- **Principe** : un ordre d'expulsion `{ target, ts }` est signé (ECDSA P-256, WebCrypto) avec le **jeton** de l'administrateur (clé privée) ; chaque navigateur le vérifie avec `ADMIN_KEY` (clé publique, `constantes.js`) avant de l'appliquer. Signature sur `remote-town-kick|<salle>|<cible>|<ts>` : un ordre ne vaut que pour une salle et une personne, et plus de 2 minutes après il est ignoré (pas de rejeu). Sans `ADMIN_KEY`, la fonction est inactive.
- **Effet** : la personne visée quitte la salle (`leaveRoom()` dans `net.js`, `S.kicked` empêche toute reconnexion automatique) et voit l'écran `#kicked` ; elle ne peut pas revenir dans cet espace avant 15 minutes depuis ce navigateur (`rt-kicked:<salle>`, vérifié par le formulaire et la porte des espaces). Les autres coupent la liaison (`dropPeer()`) et ignorent ce pair s'il se représente. L'expulsion est coopérative : une version modifiée de l'application pourrait passer outre, une nouvelle session (autre navigateur) aussi.
- **Jeton** : `node tools/admin-key.mjs` génère une paire de clés, écrit la clé publique dans `constantes.js` (à publier) et affiche dans la console le jeton et le lien d'activation, sans l'écrire nulle part (à lancer dans son propre terminal, à garder dans un gestionnaire de mots de passe, jamais dans le dépôt ; relancer l'outil change de clé et invalide l'ancien jeton). Activation dans un navigateur : ouvrir une fois `<site>#admin=<jeton>` ; le fragment n'est pas envoyé au serveur, il est mémorisé (`rt-admin`) puis retiré de l'adresse.
- **Jeton vérifié** (`checkAdmin`, `S.isAdmin`) : au chargement, le navigateur signe un message de test avec le jeton et le vérifie avec `ADMIN_KEY` ; un jeton invalide ou d'une autre clé ne débloque rien. Le jeton vérifié donne l'entrée « Expulser » et le mode débogage (`?debug`, `?net=…`) sur le site publié. Attention : la WebCrypto n'existe qu'en contexte sécurisé (HTTPS ou localhost).
- **Usage** : téléphone → Contacts → la personne → « Expulser … » → confirmation. Sans jeton, la fiche ne propose pas l'expulsion.
- **Tests** : scénario « expulsion » (clé jetable, `rt.setAdminTestKey`, `rt.loadAdminToken`).

## Recettes

**Ajouter un raccourci clavier** : `input.js` (dans le `keydown`, avant le traitement des directions ; utiliser `e.code`, qui ne dépend pas de la disposition AZERTY / QWERTY), l'aide dans `index.html` (`#help`) et le tableau « Commandes » du README.

**Ajouter un accessoire** : `avatar.js` — l'ajouter à `HEAD_OPTIONS` ou `BODY_OPTIONS` (identifiant et libellé : la seule liste, d'où sont construits les choix de l'écran du personnage et du téléphone, et la liste blanche du réseau), puis sa fonction de dessin dans `HEAD_ACC` ou `BODY_ACC` (`back` / `front` pour le corps), et `HAT_HEIGHT` s'il dépasse au-dessus de la tête. Vérifier le rendu dans les 4 directions, assis et accroupi (repères de coordonnées en commentaire dans `avatar.js`).

**Ajouter un message réseau** : déclarer l'action dans `joinNet()` (`net.js`), envoyer avec `broadcast(action, data)` (ou `S.net.action.send(data, { target })`), valider tout le contenu à la réception. Mettre à jour le tableau ci-dessus.

**Modifier la carte** : `world.js` (`build()` : sols, zones, mobilier via `obj()`), le dessin du mobilier dans `map-render.js` (`drawObject`). `npm test` vérifie que toutes les zones et chaises restent accessibles.

**Ajouter une route HTTP au relais** (`relay/server.mjs`, comme `/turn` et `/diag`) : vérifier l'origine (`allowed`), répondre avec les en-têtes CORS, borner la taille et la fréquence, ne rien écrire ailleurs que sur la sortie standard (conteneur en lecture seule), puis redéployer **seulement ce service** (voir `relay/README.md`).

**Filigrane** : `#watermark` (`index.html`, hors de `#app` pour rester visible pendant les transitions ; style à la fin de `style.css`), deux lignes en bas à gauche, toujours au-dessus de tout, sans capter les clics. À la suite de la seconde ligne, la version publiée (`#appVersion`, `showVersion` dans `hud.js`, `S.version`) : le dernier tag, écrit dans `public/version.json` par le workflow de déploiement (`git describe`), fichier absent du dépôt et en local (rien n'est alors affiché). Le diagnostic la reprend (« Version »).

**Ajouter une constante, une liste de choix ou une énumération** : dans `constantes.js`, jamais en dur dans un module ni dans `index.html` (les écrans construisent leurs choix depuis ces listes). Seules exceptions : `world.js` (module pur, qui ne peut pas importer `constantes.js`) et les données de dessin (pixel-art, icônes), qui restent près du code qui les dessine.

**Ajouter une page au téléphone** : un fichier dans `public/js/pages/` qui exporte la fonction de la page (elle renvoie un élément, construit avec `el` / `btn` de `pages/ui.js`), une entrée dans `PHONE_VIEW` (`constantes.js`), puis dans `phone.js` son titre et sa fonction dans `pageScreen()` ; un lien depuis `pages/home.js` si elle s'ouvre de l'accueil. Les imports y sont relatifs au dossier (`../state.js`).

**Ajouter un bouton à la barre du bas** : `index.html` (`#bar`), le branchement dans `hud.js` (`initHud`), le style dans `style.css`. Vérifier que la barre tient sur un téléphone de 360 px de large (boutons réduits sous 420 px).

## Tests et vérifications

```bash
npm run check      # syntaxe de tous les modules, dossier pages/ compris (aussi en CI)
npm test           # tests unitaires de world.js (aussi en CI, bloque le déploiement)
npm install        # une fois, pour puppeteer-core
npm run test:e2e   # scénarios de bout en bout (Chrome sans interface, plusieurs participants)
npm run test:e2e -- tableau   # un seul scénario (filtre sur le nom)
NET=http://localhost:8090 DIAG_LOG=/tmp/relay.log npm run test:e2e -- diagnostic   # avec un relais local (voir relay/README.md)
```

- Les tests de bout en bout (`tests/e2e/run.mjs`) démarrent leur propre serveur, ouvrent plusieurs Chrome avec un micro factice et pilotent les participants via `window.rt` (page ouverte avec `?debug`, voir `debug.js` ; sans jeton d'administration, le mode débogage n'existe qu'en local, sur `localhost` / `127.0.0.1`). Pour un nouveau comportement, ajouter un scénario ou une vérification `t.check(condition, 'libellé')`.
- `join()` attend la fin de l'arrivée par la porte (`rt.warp` nul, ~2 s) : avant, la position serait écrasée par la sortie de la porte. Tout le monde arrivant devant la porte, éloigner un participant (`place`) si le scénario a besoin de cette case libre.
- Ils passent par les relais Nostr publics : un échec de connexion ponctuel peut venir du réseau. Relancer avant de conclure.
- Le micro factice émet un bip périodique : pour savoir si quelqu'un est entendu, utiliser `hears()` (niveau maximal sur ~2,4 s), pas une mesure instantanée.
- Après une modification de `style.css`, vérifier que les accolades sont équilibrées : une accolade perdue dans un bloc `@media` a déjà rendu l'ancien panneau latéral invisible sur ordinateur (v1.19.0).
- Pour un changement visible, faire une capture avec Chrome sans interface (`page.screenshot`) et la regarder, sur ordinateur et en émulation mobile.

## Publier

1. `npm run check && npm test`, et les scénarios de bout en bout concernés.
2. `git status` : vérifier ce qui est indexé avant de commiter. Ne jamais mélanger dans un correctif des changements en cours (un correctif a déjà emporté par erreur la suppression d'`app.js`, cassant le site).
3. Commit en français (titre court, puis le détail), tag annoté `vX.Y.Z`, `git push --follow-tags`.
4. Le workflow GitHub Pages vérifie, teste et publie. En cas d'erreur 500 de GitHub au déploiement, relancer le workflow.
5. Vérifier le site en ligne. GitHub Pages met jusqu'à 10 minutes à servir les nouveaux fichiers (cache) : forcer le rechargement.

## Pièges connus

- **Audio** : ne pas faire passer tout l'audio par Web Audio ni utiliser la synthèse vocale pendant les échanges (une « annonce » carillon + voix a cassé le son et a été retirée). Le carillon seul est sans risque (`chime` dans `audio.js` : rendu une fois en WAV, joué par un élément `<audio>` comme les voix) : c'est le jingle `J` du pupitre. L'effet haut-parleur ne s'applique qu'à la voix diffusée depuis le pupitre, avec retour au son normal en cas de problème ; il est désactivé sous Firefox (`isFirefox` dans `dom.js`), où la voix du pupitre est entendue telle quelle.
- **Mobile** : pas de `getDisplayMedia` (bouton masqué) ; la barre du bas est déjà pleine ; l'aide clavier n'est utile que sur ordinateur.
- **Places assises** : `MAP.chairs` contient les chaises et chaque case des canapés et du banc du couloir (`world.js`). Pour une place orientée vers le haut, le dossier est redessiné par-dessus la personne assise (`drawChairBack`), sinon elle semble assise dans le mauvais sens.
- **Partage d'écran et tableau blanc** sont limités aux pièces (`canShareIn`, `boardZone`) ; le tableau ne s'ouvre qu'au bureau du prof (`TEACHER_AREAS` dans `board.js`).
- **Historique du chat et tableau fermé** : ils n'existent que chez les participants connectés ; ils disparaissent quand la salle se vide. Les messages directs ne vivent que chez les deux personnes.
- **Téléphone et tests** : il monte du bas de l'écran en ~0,4 s ; dans un scénario, attendre 500 ms après l'avoir ouvert avant de cliquer dedans (ou passer par `rt.openChat` / `rt.openPerson`).
- **Horloge décalée** : Trystero date ses abonnements (`since`) avec l'heure de l'ordinateur ; une horloge en avance fait filtrer par les relais toutes les réponses des autres (personne isolée, sans erreur). Notre relais ignore `since` / `until` ; les relais publics, non. Remède côté utilisateur : synchroniser l'horloge du système.
- **Relais Nostr publics** : certains refusent Trystero (preuve de travail exigée, « web of trust ») ou limitent par adresse IP (une salle pleine derrière le même réseau d'école dépassait leurs quotas : participants invisibles ou au compte-gouttes). D'où notre relais en tête et `RELAYS` réduit à ceux qui marchent ; avant d'en ajouter un, le tester avec plusieurs participants depuis la même IP.
