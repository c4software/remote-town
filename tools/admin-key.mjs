// Génère la clé d'administration de Remote Town (expulsion, voir public/js/admin.js).
//   node tools/admin-key.mjs
// - écrit la clé PUBLIQUE dans public/js/config.js (ADMIN_KEY), à commiter et publier ;
// - écrit le JETON (clé privée) dans ~/.remote-town-admin-token (lisible par vous seul),
//   jamais affiché ni versionné. Lien à ouvrir une fois : <adresse du site>#admin=<jeton>
// Relancer l'outil change de clé : l'ancien jeton ne fonctionne plus.
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG = new URL('../public/js/config.js', import.meta.url);
const TOKEN_FILE = join(homedir(), '.remote-town-admin-token');

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('jwk', publicKey);
const priv = await crypto.subtle.exportKey('jwk', privateKey);

const config = readFileSync(CONFIG, 'utf8');
const line = `export const ADMIN_KEY = { x: '${pub.x}', y: '${pub.y}' };`;
const updated = config.replace(/^export const ADMIN_KEY = .*;$/m, line);
if (updated === config && !config.includes(line)) throw new Error('ADMIN_KEY introuvable dans config.js');
writeFileSync(CONFIG, updated);

const token = Buffer.from(JSON.stringify({ x: priv.x, y: priv.y, d: priv.d })).toString('base64url');
writeFileSync(TOKEN_FILE, `${token}\n`, { mode: 0o600 });
chmodSync(TOKEN_FILE, 0o600);

console.log('Clé publique écrite dans public/js/config.js (à commiter et publier).');
console.log(`Jeton écrit dans ${TOKEN_FILE} (ne le partagez qu'avec les administrateurs).`);
console.log('Pour l\'activer dans un navigateur : ouvrir une fois <adresse du site>#admin=<contenu du fichier>');
