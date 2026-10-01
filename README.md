# Remote Town

Un bureau virtuel façon Gather Town, en plus simple : pas de compte, pas de serveur. L'audio, le partage d'écran et le chat passent en WebRTC pair-à-pair.

**Démo : https://c4software.github.io/remote-town/**

![Remote Town : Alice parle à tout le monde depuis le pupitre, Léa et Camille l'écoutent dans le bureau principal, Bob lève la main au Bureau 1 à côté de Chloé, Hugo parle au talkie dans le couloir](docs/screenshot.png)

Choisissez une **salle** sur l'écran de connexion (ou ouvrez un lien `?room=nom`) : seules les personnes dans la même salle se retrouvent. Le bouton lien (sur l'écran de connexion et dans la barre du bas) copie le lien d'invitation, ou ouvre le partage natif sur mobile. Le nom, l'apparence et la dernière salle sont mémorisés dans le navigateur.

Fonctionne aussi sur mobile : on se déplace en touchant la carte, avec des boutons pour le dash et « parler à proximité ». Le partage d'écran n'existe pas sur les navigateurs mobiles.

## La carte

- **Bureau principal** (à gauche) : le micro (`M`) et le partage d'écran sont partagés avec les personnes présentes dans la salle. Pour parler **à tout le monde**, où que les gens soient, on se place au **pupitre** avec `E` (ou un clic dessus) : la voix et le partage d'écran sont alors diffusés à tous, avec un effet « haut-parleur » de sonorisation. `E` à nouveau ou s'éloigner du pupitre rend la parole.
- **10 bureaux de 4 places** (table, 4 chaises) : le micro (`M`) et le partage d'écran (fonction native de Chrome) ne sont reçus que par les personnes **dans le même bureau**.
- **Salle de classe** (au bout du couloir, 32 places) : micro et partage d'écran reçus par **toute la classe**.
- **Couloir** : ni micro ni partage, seulement le « N pour parler ».

Partout, **maintenez `N`** pour parler aux personnes à moins de 4 cases **dans la même zone** (les murs bloquent le son). Dans le couloir, deux personnes **côte à côte** (cases voisines) s'entendent directement, sans `N` ; pas dans les pièces, où le micro (`M`) décide.

## Personnage

À la connexion, on choisit le style (gars ou fille), les couleurs du haut, des cheveux et de la peau, et un accessoire : 🤘 t-shirt metal, 🦄 serre-tête licorne, 🧢 casquette, 🕶️ lunettes de soleil, 👓 lunettes, 🎩 haut-de-forme, 🎧 casque audio, 👑 couronne ou 🧣 écharpe. Tout est mémorisé dans le navigateur. Une fois dans l'espace, un clic sur son identité (en bas à gauche, ou sur sa ligne dans la liste des participants sur mobile) rouvre cet écran pour changer de nom ou d'apparence, ou réafficher l'aide.

On peut traverser les autres personnages, mais une chaise occupée est réservée : impossible de s'y asseoir à deux.

## Chat

Deux onglets : **la zone où vous êtes** (seules les personnes présentes le reçoivent) et **Tout le monde**. Sans serveur, l'historique vit chez les participants : en arrivant, on le récupère auprès des personnes déjà connectées. Quand tout le monde est parti, il disparaît.

## Attente et reconnexion

Il n'y a pas d'hôte : chacun est relié directement à tous les autres, et le départ d'une personne ne coupe pas les autres. Quand on se retrouve seul, un bandeau « En attente des autres participants… » s'affiche, et on retrouve automatiquement les autres dès leur retour. Si la connexion saute (réseau, onglet en veille), l'app rejoint la salle d'elle-même ; le bandeau propose aussi d'inviter ou de recharger.

## Commandes

| Touche | Action |
| --- | --- |
| Flèches / WASD (ZQSD en AZERTY), clic | Se déplacer |
| `Maj` maintenu | Courir |
| `Espace` | Dash : bond de 3 cases, avec traînée |
| `E` (ou clic sur une chaise / le pupitre) | S'asseoir / se lever ; au pupitre : parler à tout le monde |
| `C` | S'accroupir / se relever (on avance à pas de loup) |
| `1` … `6` (ou bouton 🙂) | Réactions 👍 ❤️ 😂 🎉 👏 😮 au-dessus du personnage |
| `H` (ou bouton ✋ de la barre) | Lever / baisser la main (✋ reste affichée). Les mains levées apparaissent en bulles en bas à droite : un clic emmène auprès de la personne |
| `N` maintenu | Talkie-walkie : parler à proximité (bips d'ouverture et de fin, personnage qui lève son talkie) |
| `M` | Couper ou ouvrir le micro |
| `Entrée` / `Échap` | Écrire dans le chat / quitter le champ |

## Comment ça marche

- La mise en relation WebRTC passe par des relais [Nostr](https://nostr.com) publics grâce à [Trystero](https://github.com/dmotz/trystero) (embarqué dans `public/vendor/`). Les relais ne voient que les messages de mise en relation (chiffrés), jamais l'audio, la vidéo ou le chat.
- Chaque participant est connecté à tous les autres (maillage). Ça tient pour quelques dizaines de personnes.
- Pour chaque pair, on envoie une copie de son micro et de son écran, activée ou coupée selon les règles de zone (`public/shared.js`). Il n'y a pas de renégociation, donc `N` répond tout de suite.
- Les règles sont appliquées par le navigateur de chacun : c'est fait pour une équipe de confiance, pas pour un espace public.
- Derrière certains réseaux d'entreprise (NAT strict), un serveur TURN est nécessaire : à configurer via `turnConfig` dans l'appel `joinRoom` de `public/app.js`.

## Développement local

```bash
npm start   # http://localhost:3000 (serveur statique, aucune dépendance)
```

Le déploiement sur GitHub Pages se fait automatiquement à chaque push sur `main` (`.github/workflows/pages.yml` publie le dossier `public/`).

## Structure

- `public/shared.js` : la carte, les zones et les règles de qui entend qui
- `public/app.js` : rendu canvas, déplacements, WebRTC, chat, interface
- `public/vendor/trystero-nostr.js` : Trystero 0.25.4 (licence MIT)
- `server.js` : petit serveur statique pour le développement local
