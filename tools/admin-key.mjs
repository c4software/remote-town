// Génère la clé d'administration de Remote Town (expulsion, voir public/js/admin.js).
//   node tools/admin-key.mjs
// - écrit la clé PUBLIQUE dans public/js/constantes.js (ADMIN_KEY) et dans
//   relay/docker-compose.yml (annuaire des espaces du relais), à commiter et publier ;
// - affiche le JETON (clé privée), les étapes et le lien d'activation dans la console, sans
//   l'écrire nulle part : à copier dans un gestionnaire de mots de passe, jamais dans le dépôt.
// Relancer l'outil change de clé : l'ancien jeton ne fonctionne plus.
import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG = new URL('../public/js/constantes.js', import.meta.url);
const SITE = 'https://distance.brosseau.ovh/';

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('jwk', publicKey);
const priv = await crypto.subtle.exportKey('jwk', privateKey);

const config = readFileSync(CONFIG, 'utf8');
const line = `export const ADMIN_KEY = { x: '${pub.x}', y: '${pub.y}' };`;
const updated = config.replace(/^export const ADMIN_KEY = .*;$/m, line);
if (updated === config && !config.includes(line)) throw new Error('ADMIN_KEY introuvable dans constantes.js');
writeFileSync(CONFIG, updated);
// La même clé pour le relais, qui réserve l'annuaire des espaces (/rooms) aux administrateurs
const COMPOSE = new URL('../relay/docker-compose.yml', import.meta.url);
const compose = readFileSync(COMPOSE, 'utf8');
if (!/^(\s*- ADMIN_KEY=).*$/m.test(compose)) throw new Error('ADMIN_KEY introuvable dans relay/docker-compose.yml');
writeFileSync(COMPOSE, compose.replace(/^(\s*- ADMIN_KEY=).*$/m, `$1${pub.x}.${pub.y}`));

const token = Buffer.from(JSON.stringify({ x: priv.x, y: priv.y, d: priv.d })).toString('base64url');
console.log(`Nouvelle clé d'administration générée.

Jeton (secret : à garder dans un gestionnaire de mots de passe, à ne partager qu'avec
les administrateurs, jamais dans le dépôt) :
  ${token}

Étapes :
  1. Publier la clé publique, écrite dans public/js/constantes.js et relay/docker-compose.yml :
       git add public/js/constantes.js relay/docker-compose.yml && git commit -m "Nouvelle clé d'administration" && git push
     puis redéployer le relais (relay/README.md) : sans cela, l'annuaire des espaces refuse le nouveau jeton.
     Le nouveau jeton ne fonctionne qu'une fois le site publié (jusqu'à 10 min de cache
     GitHub Pages) ; à ce moment-là, l'ancien jeton cesse de fonctionner.
  2. Ouvrir une fois ce lien dans chaque navigateur d'administrateur :
       ${SITE}#admin=${token}
     Message attendu : « Jeton d'administration enregistré dans ce navigateur ».`);
