// Outils des tests de bout en bout : serveur statique, navigateurs Chrome, participants.
// Les participants sont pilotés via window.rt (page ouverte avec ?debug, voir public/js/main.js).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROMES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startServer(port) {
  const proc = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  await wait(400);
  return { url: `http://localhost:${port}/`, stop: () => proc.kill() };
}

// Relais local (relay/server.mjs, après « npm install » dans relay/) pour un scénario qui a besoin
// du nôtre ; `env` complète sa configuration
export async function startRelay(port, env = {}) {
  const proc = spawn(process.execPath, ['relay/server.mjs'], { env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: 'http://localhost:*', ...env }, stdio: 'ignore' });
  await wait(600);
  return { url: `http://localhost:${port}`, stop: () => proc.kill() };
}

// Clé d'administration jetable : la partie publique (à donner à tous avec rt.setAdminTestKey) et
// le jeton, la clé privée (à charger chez l'administrateur avec rt.loadAdminToken)
export async function adminKeys() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', publicKey);
  const priv = await crypto.subtle.exportKey('jwk', privateKey);
  return { pub: { x: pub.x, y: pub.y }, token: Buffer.from(JSON.stringify({ x: priv.x, y: priv.y, d: priv.d })).toString('base64url') };
}

export async function launchBrowser() {
  const executablePath = CHROMES.find((p) => existsSync(p));
  if (!executablePath) throw new Error('Chrome introuvable : définissez CHROME_PATH');
  return puppeteer.launch({
    executablePath,
    headless: 'new',
    // micro factice (bip périodique), autorisations accordées d'office, écran partagé choisi automatiquement
    args: [
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  });
}

// Ouvre un participant dans un contexte isolé (son propre localStorage) et le connecte à `room`
export async function join(ctx, name, { viewport = { width: 1300, height: 820 }, setup } = {}) {
  const page = await (await ctx.browser.createBrowserContext()).newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (e) => ctx.errors.push(`${name} : ${e.message}`));
  // NET=http://localhost:8090 : passer par un relais (relay/, PORT=8090 node server.mjs) lancé à part
  // (ou ctx.net : relais lancé par le scénario lui-même, voir startRelay)
  const base = ctx.net || process.env.NET;
  const net = base ? `&net=${encodeURIComponent(base)}` : '';
  await page.goto(`${ctx.url}?debug&room=${ctx.room}${net}`);
  await page.type('#nameInput', name);
  if (setup) await setup(page);
  await page.click('.btn-primary');
  await page.waitForFunction(() => window.rt?.me && !rt.warp); // arrivée par la porte terminée
  await page.evaluate(() => { document.querySelector('#help').hidden = true; });
  return page;
}

export const waitPeers = (pages, n = pages.length) =>
  Promise.all(pages.map((p) => p.waitForFunction((n) => rt.users.size === n, { timeout: 60000 }, n)));

// Niveau sonore maximal reçu de `who` pendant ~2,4 s (le micro factice émet un bip périodique)
export const hears = (page, who) => page.evaluate(async (who) => {
  let max = 0;
  for (let i = 0; i < 30; i++) {
    const u = [...rt.users.values()].find((x) => x.name === who);
    max = Math.max(max, u?.level || 0);
    await new Promise((r) => setTimeout(r, 80));
  }
  return max > 0.02;
}, who);

export const me = (page) => page.evaluate(() => ({ x: rt.me.x, y: rt.me.y, dir: rt.me.dir, seated: !!rt.me.seated, zone: rt.me.zone }));
export const seen = (page, name) => page.evaluate((name) => {
  const u = [...rt.users.values()].find((x) => x.name === name);
  return u && { x: u.x, y: u.y, seated: !!u.seated, onAir: !!u.onAir, hand: !!u.hand, look: u.look };
}, name);
export const place = (page, x, y) => page.evaluate(([x, y]) => rt.place(x, y), [x, y]);
export const pathDone = (page) => page.waitForFunction(() => !rt.path?.length, { timeout: 30000 });

// Ce que `page` sait de la personne `name` : un de ses champs (null si vide, ou personne inconnue)
export const peer = (page, name, field) => page.evaluate(([name, field]) => [...rt.users.values()].find((u) => u.name === name)?.[field] || null, [name, field]);

// Volume auquel `page` entend la voix de `name` (élément <audio> de la liaison)
export const voiceVolume = (page, name) => page.evaluate((name) => rt.links.get([...rt.users.values()].find((u) => u.name === name)?.id)?.audioEl?.volume, name);

// Position à l'écran (pixels) du centre de la case (x, y), pour cliquer ou toucher la carte
export const tile = (page, x, y) => page.evaluate(([x, y]) => ({ x: (x * 32 + 16 - rt.cam.x) * rt.cam.zoom, y: (y * 32 + 16 - rt.cam.y) * rt.cam.zoom }), [x, y]);

// Le téléphone monte du bas de l'écran en ~0,4 s : on attend avant de cliquer dedans
const PHONE_UP_MS = 500;

// Ouvre le téléphone, sur une page de l'accueil si `nav` est donné (contacts, chats, settings, vmail…)
export async function openPhone(page, nav) {
  await page.click('#phoneBtn');
  await wait(PHONE_UP_MS);
  if (nav) await page.click(`#phone .ph-nav-${nav}`);
}

// Ouvre la fiche de `name` dans le téléphone
export async function openPerson(page, name) {
  await page.evaluate((name) => rt.openPerson([...rt.users.values()].find((u) => u.name === name).id), name);
  await wait(PHONE_UP_MS);
}

// Ouvre l'écran complet du personnage : bouton de la barre, puis « Écran complet » dans le téléphone
export async function openProfile(page) {
  await page.click('#mePill');
  await wait(PHONE_UP_MS);
  await page.click('#phone .ph-full');
  await wait(300);
}

// Réessaie `probe` jusqu'à ce qu'elle soit vraie (5 s au plus), pour vérifier un effet attendu sans
// attente fixe : t.check(await until(…), 'libellé'). Réservé aux effets : « rien ne se passe » se
// vérifie après un wait(), sinon la vérification passerait avant que l'effet ait pu arriver.
export async function until(probe, ms = 5000) {
  for (const end = Date.now() + ms; ;) {
    if (await Promise.resolve().then(probe).catch(() => false)) return true;
    if (Date.now() > end) return false;
    await wait(100);
  }
}

// Quitte l'onglet de `page` (un autre passe devant, la page devient cachée) ; renvoie la fonction
// qui y revient
export async function leaveTab(page) {
  const other = await page.browserContext().newPage();
  await other.bringToFront();
  await page.waitForFunction(() => document.hidden, { timeout: 5000 });
  return async () => { await page.bringToFront(); await other.close(); };
}
