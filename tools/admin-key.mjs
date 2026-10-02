// Génère la clé d'administration de Remote Town (expulsion, voir public/js/admin.js).
//   node tools/admin-key.mjs
// - écrit la clé PUBLIQUE dans public/js/config.js (ADMIN_KEY), à commiter et publier ;
// - affiche le JETON (clé privée) et le lien d'activation dans la console, sans l'écrire
//   nulle part : à copier dans un gestionnaire de mots de passe, jamais dans le dépôt.
// Relancer l'outil change de clé : l'ancien jeton ne fonctionne plus.
import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG = new URL('../public/js/config.js', import.meta.url);
const SITE = 'https://distance.brosseau.ovh/';

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('jwk', publicKey);
const priv = await crypto.subtle.exportKey('jwk', privateKey);

const config = readFileSync(CONFIG, 'utf8');
const line = `export const ADMIN_KEY = { x: '${pub.x}', y: '${pub.y}' };`;
const updated = config.replace(/^export const ADMIN_KEY = .*;$/m, line);
if (updated === config && !config.includes(line)) throw new Error('ADMIN_KEY introuvable dans config.js');
writeFileSync(CONFIG, updated);

const token = Buffer.from(JSON.stringify({ x: priv.x, y: priv.y, d: priv.d })).toString('base64url');
console.log('Clé publique écrite dans public/js/config.js : à commiter et publier.\n');
console.log('Jeton d\'administration (à garder secret, ne le partager qu\'avec les administrateurs) :');
console.log(`  ${token}\n`);
console.log('Lien d\'activation, à ouvrir une fois dans chaque navigateur d\'administrateur :');
console.log(`  ${SITE}#admin=${token}`);
