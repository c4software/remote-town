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
```

Modules de `public/js/` :

| Module | Rôle |
| --- | --- |
| `main.js` | Appelle les `init…()` de chaque module, dans l'ordre ; expose `window.rt` avec `?debug` |
| `state.js` | État partagé : `S` (session), `users`, `keys`, `myIds` |
| `config.js` | Constantes : vitesses, palettes, relais Nostr, clavier |
| `world.js` | Carte, zones, mobilier, règles `sendsAudio` / `sendsVideo` / `sideBySide` / `isOnAir`. **Module pur** (ni DOM ni état), testé par `npm test` |
| `dom.js` | `$`, `toast`, `typing`, `ofName` |
| `avatar.js` | Dessin des personnages et accessoires (fonctions pures sur un contexte canvas) |
| `map-render.js` | Dessin de la carte, pré-calculé une fois |
| `render.js` | Boucle `requestAnimationFrame`, caméra, personnages, effets, étiquettes |
| `movement.js` | Pas à pas, trajets (BFS), chaises, pupitre, accroupi, dash, rejoindre quelqu'un |
| `input.js` | Raccourcis clavier, clic sur la carte |
| `net.js` | Connexion Trystero, messages reçus, présence, attente, reconnexion |
| `media.js` | Flux par pair (micro / écran), volume des voix, actions M / N / partage |
| `audio.js` | Micro, niveaux, bips du talkie, effet haut-parleur du pupitre |
| `profile.js` | Écran du personnage (connexion et modification), préférences locales |
| `rooms.js` | Nom de salle, lien d'invitation, espaces enregistrés (`rt-spaces`) |
| `hud.js` | Démarrage de l'app, changement de zone, barre du bas, aide |
| `panel.js` | Panneau latéral, liste des participants |
| `chat.js` | Chat de zone et global, historique |
| `social.js` | Réactions, main levée, bulles des mains levées, jingle du pupitre |
| `spaces.js` | Porte des espaces (couloir) : fenêtre de choix, espaces enregistrés, passage animé d'un espace à l'autre (`S.warp`), arrivée initiale par la porte (`firstArrival`), écriteau du nom de l'espace |
| `emotes.js` | Émotes animées (travail, AFK…) : roue du clic droit, dessin au-dessus du nom |
| `board.js` | Tableau blanc (classe, bureau principal) |
| `videos.js` | Partages d'écran reçus, affichage en grand, projection |

### Règles qui gardent le code sain

1. **Pas d'effet de bord au chargement d'un module** : seulement des déclarations (`const`, `function`). Tout ce qui touche à la page (écouteurs, création d'éléments) va dans une fonction `initXxx()` exportée et appelée par `main.js`. Les modules s'importent mutuellement (cycles) : c'est sans risque tant que rien ne s'exécute au chargement ; sinon, erreur « Cannot access … before initialization ».
2. **État partagé** : une variable lue ou modifiée par plusieurs modules vit dans `S` (`state.js`) et s'écrit `S.xxx`. On mute `S`, on ne le réassigne jamais. Une variable utile à un seul module reste privée dans ce module. Ajouter un champ à `S` = le déclarer dans `state.js` avec un commentaire.
3. **Les règles « qui entend / voit qui » vivent dans `world.js`**, pas dans le code d'interface. Toute nouvelle règle s'accompagne d'un test dans `tests/world.test.js`.
4. **Les données reçues du réseau sont validées** (couleurs avec `COLOR`, positions avec `setPos`, listes blanches pour les accessoires et réactions, longueurs bornées). Un autre participant peut envoyer n'importe quoi.
5. **Respect du micro** : un micro coupé (`S.micOn === false`) ne doit jamais être entendu, quelle que soit la règle de proximité. Le `N` (`S.pttHeld`) et le pupitre sont des actions explicites.
6. Style : 2 espaces, apostrophes simples, points-virgules, fonctions courtes ; des commentaires qui expliquent le *pourquoi*, en français.

## Modèle réseau

- `net.js` rejoint une salle Trystero (`S.tr.joinRoom`) identifiée par `APP_ID` + nom de salle. Chaque participant est relié directement à tous les autres (maillage, pas d'hôte).
- Actions Trystero (dans `joinNet`) et charge utile :

| Action | Contenu | Envoyée |
| --- | --- | --- |
| `hello` | profil complet (`profile()`), `ask: true` pour demander le sien en retour | à chaque nouveau pair, et si un pair reste inconnu |
| `move` | `x, y, dir, seated, sitAt, crouch` (+ `dash`) | à chaque déplacement (`sendMove`) |
| `state` | `mic, ptt, sharing, onAir, hand, six` (« 67 » : 6 + 7 maintenus), `emote` (liste `EMOTES`) | à chaque changement (`pushState`) |
| `chat` | `{ channel, msg }` | canal `global` à tous, canal de zone aux personnes de la zone |
| `history` | requête : `{ channel }` → liste de messages | en entrant dans une zone / à la connexion |
| `wb` | tableau blanc : `open`, `seg`, `clear`, `close`, `sync` | par le propriétaire du tableau |
| `react` | `{ e }` (emoji de la liste `REACTIONS`) | à tous |
| `jingle` | `{}` (carillon d'annonce, joué seulement si l'auteur est au pupitre) | à tous, avec `J` au pupitre |

- **Médias** : pour chaque pair, on crée au besoin une copie (`clone()`) de notre piste micro / écran, ajoutée une seule fois (`addStream`), puis activée ou coupée (`enabled`) selon `sendsAudio` / `sendsVideo` (`applySenders` dans `media.js`). Pas de renégociation : `N` est instantané. `updateRouting()` recalcule tout après chaque déplacement ou changement d'état.
- **Changement d'espace** : `switchRoom(id)` (porte du couloir, `spaces.js`) quitte la salle et en rejoint une autre avec le même identifiant de pair ; le chat de l'ancien espace est vidé.
- **Arrivée** : tout le monde arrive devant la porte des espaces (`PORTAL_SPOT`). Au clic sur « Rejoindre l'espace », `profile.js` fait grandir le cercle noir `#cover` depuis le point cliqué et lance la musique (dans le geste de l'utilisateur, sinon le navigateur bloque le son) ; `connect()` attend la fin du cercle, puis `firstArrival()` reprend le même écran noir sur le canevas, retire `#cover` et fait sortir le personnage de la porte.
- **Reconnexion** : `rejoin()` (seul trop longtemps, retour du réseau) et `relaunch()` (bouton « Relancer la connexion », charge une instance neuve de Trystero). Les relais utilisés sont listés dans `config.js` (`RELAYS`).

## Recettes

**Ajouter un raccourci clavier** : `input.js` (dans le `keydown`, avant le traitement des directions ; utiliser `e.code`, qui ne dépend pas de la disposition AZERTY / QWERTY), l'aide dans `index.html` (`#help`) et le tableau « Commandes » du README.

**Ajouter un accessoire** : `avatar.js` — l'ajouter à `HEADS` ou `BODIES`, puis sa fonction de dessin dans `HEAD_ACC` ou `BODY_ACC` (`back` / `front` pour le corps), et `HAT_HEIGHT` s'il dépasse au-dessus de la tête. Ajouter la puce dans `index.html` (`#headChips` / `#bodyChips`, attribut `data-v`). Vérifier le rendu dans les 4 directions, assis et accroupi (repères de coordonnées en commentaire dans `avatar.js`).

**Ajouter un message réseau** : déclarer l'action dans `joinNet()` (`net.js`), envoyer avec `broadcast(action, data)` (ou `S.net.action.send(data, { target })`), valider tout le contenu à la réception. Mettre à jour le tableau ci-dessus.

**Modifier la carte** : `world.js` (`build()` : sols, zones, mobilier via `obj()`), le dessin du mobilier dans `map-render.js` (`drawObject`). `npm test` vérifie que toutes les zones et chaises restent accessibles.

**Ajouter un bouton à la barre du bas** : `index.html` (`#bar`), le branchement dans `hud.js` (`initHud`), le style dans `style.css`. Vérifier que la barre tient sur un téléphone de 360 px de large (boutons réduits sous 420 px).

## Tests et vérifications

```bash
npm run check      # syntaxe de tous les modules (aussi en CI)
npm test           # tests unitaires de world.js (aussi en CI, bloque le déploiement)
npm install        # une fois, pour puppeteer-core
npm run test:e2e   # scénarios de bout en bout (Chrome sans interface, plusieurs participants)
npm run test:e2e -- tableau   # un seul scénario (filtre sur le nom)
```

- Les tests de bout en bout (`tests/e2e/run.mjs`) démarrent leur propre serveur, ouvrent plusieurs Chrome avec un micro factice et pilotent les participants via `window.rt` (page ouverte avec `?debug`, voir `main.js`). Pour un nouveau comportement, ajouter un scénario ou une vérification `t.check(condition, 'libellé')`.
- `join()` attend la fin de l'arrivée par la porte (`rt.warp` nul, ~2 s) : avant, la position serait écrasée par la sortie de la porte. Tout le monde arrivant devant la porte, éloigner un participant (`place`) si le scénario a besoin de cette case libre.
- Ils passent par les relais Nostr publics : un échec de connexion ponctuel peut venir du réseau. Relancer avant de conclure.
- Le micro factice émet un bip périodique : pour savoir si quelqu'un est entendu, utiliser `hears()` (niveau maximal sur ~2,4 s), pas une mesure instantanée.
- Après une modification de `style.css`, vérifier que les accolades sont équilibrées : une accolade perdue dans un bloc `@media` a déjà rendu le panneau latéral invisible sur ordinateur (v1.19.0).
- Pour un changement visible, faire une capture avec Chrome sans interface (`page.screenshot`) et la regarder, sur ordinateur et en émulation mobile.

## Publier

1. `npm run check && npm test`, et les scénarios de bout en bout concernés.
2. `git status` : vérifier ce qui est indexé avant de commiter. Ne jamais mélanger dans un correctif des changements en cours (un correctif a déjà emporté par erreur la suppression d'`app.js`, cassant le site).
3. Commit en français (titre court, puis le détail), tag annoté `vX.Y.Z`, `git push --follow-tags`.
4. Le workflow GitHub Pages vérifie, teste et publie. En cas d'erreur 500 de GitHub au déploiement, relancer le workflow.
5. Vérifier le site en ligne. GitHub Pages met jusqu'à 10 minutes à servir les nouveaux fichiers (cache) : forcer le rechargement.

## Pièges connus

- **Audio** : ne pas faire passer tout l'audio par Web Audio ni utiliser la synthèse vocale pendant les échanges (une « annonce » carillon + voix a cassé le son et a été retirée). Le carillon seul est sans risque (`chime` dans `audio.js` : rendu une fois en WAV, joué par un élément `<audio>` comme les voix) : c'est le jingle `J` du pupitre. L'effet haut-parleur ne s'applique qu'à la voix diffusée depuis le pupitre, avec retour au son normal en cas de problème.
- **Mobile** : pas de `getDisplayMedia` (bouton masqué) ; la barre du bas est déjà pleine ; l'aide clavier n'est utile que sur ordinateur.
- **Places assises** : `MAP.chairs` contient les chaises et chaque case des canapés (`world.js`). Pour une place orientée vers le haut, le dossier est redessiné par-dessus la personne assise (`drawChairBack`), sinon elle semble assise dans le mauvais sens.
- **Partage d'écran et tableau blanc** sont limités aux pièces (`canShareIn`, `boardZone`) ; le tableau ne s'ouvre qu'au bureau du prof (`TEACHER_AREAS` dans `board.js`).
- **Historique du chat** : il n'existe que chez les participants connectés ; il disparaît quand la salle se vide.
