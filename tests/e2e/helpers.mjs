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

export async function launchBrowser() {
  const executablePath = CHROMES.find((p) => existsSync(p));
  if (!executablePath) throw new Error('Chrome introuvable : définissez CHROME_PATH');
  return puppeteer.launch({
    executablePath,
    headless: 'new',
    // micro factice (bip périodique) et autorisations accordées d'office
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
}

// Ouvre un participant dans un contexte isolé (son propre localStorage) et le connecte à `room`
export async function join(ctx, name, { viewport = { width: 1300, height: 820 }, setup } = {}) {
  const page = await (await ctx.browser.createBrowserContext()).newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (e) => ctx.errors.push(`${name} : ${e.message}`));
  await page.goto(`${ctx.url}?debug&room=${ctx.room}`);
  await page.type('#nameInput', name);
  if (setup) await setup(page);
  await page.click('.btn-primary');
  await page.waitForFunction(() => window.rt?.me);
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
