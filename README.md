# Remote Town

Un bureau virtuel façon Gather Town, en plus simple : pas de compte, pas de serveur. L'audio, le partage d'écran et le chat passent en WebRTC pair-à-pair.

**Démo : https://c4software.github.io/remote-town/**

![Remote Town : Alice parle à tout le monde depuis le pupitre, Léa et Camille l'écoutent dans le bureau principal, Bob lève la main au Bureau 1 à côté de Chloé, Hugo parle au talkie dans le couloir](docs/screenshot.png)

Choisissez une **salle** sur l'écran de connexion (ou ouvrez un lien `?room=nom`) : seules les personnes dans la même salle se retrouvent. Le bouton lien (sur l'écran de connexion et dans la barre du bas) copie le lien d'invitation, ou ouvre le partage natif sur mobile. Le nom, l'apparence et la dernière salle sont mémorisés dans le navigateur.

Fonctionne aussi sur mobile : on se déplace en touchant la carte, avec des boutons pour le dash et « parler à proximité ». Le partage d'écran n'existe pas sur les navigateurs mobiles.

## La carte

- **Bureau principal** (à gauche) : le micro (`M`) et le partage d'écran sont partagés avec les personnes présentes dans la salle. Pour parler **à tout le monde**, où que les gens soient, on se place au **pupitre** avec `E` (ou un clic dessus) : la voix est alors diffusée à tous, avec un effet « haut-parleur » de sonorisation, et son partage d'écran apparaît chez chacun en petite fenêtre (PiP) : un clic l'agrandit. `E` à nouveau ou s'éloigner du pupitre rend la parole.
- **10 bureaux de 4 places** (table, 4 chaises) : le micro (`M`) et le partage d'écran (fonction native de Chrome) ne sont reçus que par les personnes **dans le même bureau**.
- **Salle de classe** (au bout du couloir, 32 places) : micro et partage d'écran reçus par **toute la classe**.
- **Tableau blanc** (salle de classe et bureau principal) : il s'ouvre uniquement depuis le **bureau du prof** (derrière le bureau de l'enseignant dans la classe, derrière le pupitre dans le bureau principal), avec le bouton tableau de la barre. La personne qui l'ouvre le pilote : elle seule dessine (couleurs, épaisseurs, gomme, tout effacer) et le ferme. Il s'affiche chez toutes les personnes de la pièce, y compris celles qui arrivent ensuite ; chacune peut le passer en **mode PiP** (petite fenêtre flottante, toujours à jour) tant qu'il est ouvert. Il se ferme quand le prof quitte la pièce.
- **Projection** : dans ces deux pièces, un partage d'écran s'ouvre automatiquement en grand chez les personnes présentes.
- **Couloir** : pas de partage d'écran ; on parle avec `N` (à proximité) ou, micro ouvert, aux personnes juste à côté.

Partout, **maintenez `N`** pour parler aux personnes à moins de 4 cases **dans la même zone** (les murs bloquent le son) ; le volume baisse avec la distance. Dans le couloir, avec le micro ouvert (`M`), les personnes **côte à côte** (cases voisines) vous entendent directement, sans `N`. Micro coupé, personne ne vous entend. Pas dans les pièces, où `M` parle à toute la pièce.

## Personnage

À la connexion, on choisit le style (gars ou fille), les couleurs du haut, des cheveux et de la peau, et deux accessoires combinables : un pour la **tête** (🧢 casquette, 🧶 bonnet, 🎩 haut-de-forme, 🥳 chapeau de fête, 👑 couronne, 🦄 licorne, 🐱 oreilles de chat, 🌸 fleur, 🎧 casque audio, 👓 lunettes, 🕶️ lunettes de soleil) et un pour le **corps** (🤘 t-shirt metal, 👔 cravate, 🎀 nœud papillon, 🧣 écharpe, 🏅 médaille, 🎒 sac à dos, 🦸 cape). Tout est mémorisé dans le navigateur. Une fois dans l'espace, un clic sur son identité (en bas à gauche, ou sur sa ligne dans la liste des participants sur mobile) rouvre cet écran pour changer de nom ou d'apparence, ou réafficher l'aide.

On s'assoit sur les chaises et sur les canapés du coin salon (`E` ou clic). On peut traverser les autres personnages, mais une place occupée est réservée : impossible de s'y asseoir à deux.

## Chat

Un clic sur un nom, dans le chat ou dans la liste des participants, emmène auprès de la personne.

Deux onglets : **la zone où vous êtes** (seules les personnes présentes le reçoivent) et **Tout le monde**. Sans serveur, l'historique vit chez les participants : en arrivant, on le récupère auprès des personnes déjà connectées. Quand tout le monde est parti, il disparaît.

## Attente et reconnexion

Il n'y a pas d'hôte : chacun est relié directement à tous les autres, et le départ d'une personne ne coupe pas les autres. Quand on se retrouve seul, un bandeau « En attente des autres participants… » s'affiche, et on retrouve automatiquement les autres dès leur retour. Si la connexion saute (réseau, onglet en veille), l'app rejoint la salle d'elle-même ; le bandeau propose aussi d'inviter ou de relancer la connexion.

## Commandes

| Touche | Action |
| --- | --- |
| Flèches / WASD (ZQSD en AZERTY), clic | Se déplacer |
| `Maj` maintenu | Courir |
| `Espace` | Dash : bond de 3 cases, avec traînée |
| `E` (ou clic sur une chaise / le pupitre) | S'asseoir / se lever ; au pupitre : parler à tout le monde |
| `C` | S'accroupir / se relever (on avance à pas de loup) |
| `V` | Sauter |
| `1` … `6` (ou bouton 🙂) | Réactions 👍 ❤️ 😂 🎉 👏 😮 au-dessus du personnage |
| `H` (ou bouton ✋ de la barre) | Lever / baisser la main (✋ reste affichée). Les mains levées apparaissent en bulles en bas à droite : un clic emmène auprès de la personne |
| `N` maintenu | Talkie-walkie : parler à proximité (bips d'ouverture et de fin, personnage qui lève son talkie) |
| `M` | Couper ou ouvrir le micro |
| `Entrée` / `Échap` | Écrire dans le chat / quitter le champ |

## Comment ça marche

- La mise en relation WebRTC passe par des relais [Nostr](https://nostr.com) publics grâce à [Trystero](https://github.com/dmotz/trystero) (embarqué dans `public/vendor/`). Les relais ne voient que les messages de mise en relation (chiffrés), jamais l'audio, la vidéo ou le chat.
- Chaque participant est connecté à tous les autres (maillage). Ça tient pour quelques dizaines de personnes.
- Pour chaque pair, on envoie une copie de son micro et de son écran, activée ou coupée selon les règles de zone (`public/js/world.js`). Il n'y a pas de renégociation, donc `N` répond tout de suite.
- Les règles sont appliquées par le navigateur de chacun : c'est fait pour une équipe de confiance, pas pour un espace public.
- Derrière certains réseaux d'entreprise (NAT strict), un serveur TURN est nécessaire : à configurer via `turnConfig` dans l'appel `joinRoom` de `public/js/net.js`.

## Développement

```bash
npm start          # http://localhost:3000 (serveur statique, aucune dépendance)
npm run check      # vérifie la syntaxe de tous les modules
npm test           # tests unitaires des règles du monde (Node, sans dépendance)
npm install        # une fois, pour les tests de bout en bout (puppeteer-core)
npm run test:e2e   # scénarios à plusieurs navigateurs Chrome (nécessite Chrome et Internet)
npm run test:e2e -- pupitre   # un seul scénario
```

Ouvrir la page avec `?debug` expose `window.rt` dans la console (participants, position, `rt.walkTo(x, y)`, `rt.place(x, y)`, `rt.relaunch()`…), utilisé par les tests de bout en bout.

Le déploiement sur GitHub Pages se fait automatiquement à chaque push sur `main` (`.github/workflows/pages.yml`) : vérification de la syntaxe, tests unitaires, puis publication du dossier `public/`.

## Structure

```
public/
  index.html, style.css
  vendor/trystero-nostr.js   Trystero 0.25.4 (licence MIT), réseau pair-à-pair
  js/
    main.js        point d'entrée : branche les modules, accès ?debug
    state.js       état partagé (S, users, keys, myIds)
    config.js      constantes (vitesses, palettes, relais, clavier)
    world.js       carte, zones, règles « qui entend / voit qui » (module pur)
    dom.js         utilitaires d'interface ($, toast…)
    avatar.js      dessin des personnages et accessoires
    map-render.js  dessin de la carte
    render.js      boucle et rendu de la scène
    movement.js    déplacements, chaises, pupitre, dash, rejoindre quelqu'un
    input.js       clavier et souris
    net.js         connexion, messages reçus, présence, reconnexion
    media.js       flux micro / écran par pair, micro, N, partage
    audio.js       micro, niveaux, bips, effet haut-parleur
    profile.js     écran du personnage
    rooms.js       salles et liens d'invitation
    hud.js         démarrage, changement de zone, barre du bas, aide
    panel.js       panneau latéral et participants
    chat.js        chat de zone et global
    social.js      réactions, main levée, bulles
    board.js       tableau blanc
    videos.js      partages d'écran reçus, projection
tests/
  world.test.js    tests unitaires (npm test)
  e2e/             tests de bout en bout (npm run test:e2e)
server.js          serveur statique de développement
AGENTS.md          guide pour faire évoluer le projet
```
