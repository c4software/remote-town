// Tests de bout en bout : plusieurs participants dans des navigateurs Chrome sans interface.
// Lancer : npm run test:e2e            (tous les scénarios)
//          npm run test:e2e -- pupitre (seulement les scénarios dont le nom contient « pupitre »)
// Nécessite Chrome et un accès Internet (les relais Nostr publics servent à la mise en relation).
import { hears, join, launchBrowser, me, pathDone, place, seen, startServer, wait, waitPeers } from './helpers.mjs';

const scenarios = {
  async 'connexion, déplacements et chat'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    await place(a, 30, 10);
    await wait(800);
    t.check((await seen(b, 'Alice')).x === 30, 'Bob voit Alice se déplacer');
    await a.evaluate(() => document.querySelector('.chat-tabs [data-chan=global]').click());
    await a.type('#chatInput', 'bonjour à tous');
    await a.keyboard.press('Enter');
    await wait(1200);
    await b.evaluate(() => document.querySelector('.chat-tabs [data-chan=global]').click());
    t.check(await b.evaluate(() => document.querySelector('#messages').innerText.includes('bonjour à tous')), 'chat global reçu');
    await place(b, 45, 11);
    await wait(600);
    await a.click('.side-tabs [data-panel=people]');
    await a.click('#people li.join-row');
    await pathDone(a);
    const pa = await me(a);
    t.check(Math.abs(pa.x - 45) + Math.abs(pa.y - 11) === 1, 'clic sur un participant : on le rejoint');
  },

  async 'audio selon les zones'(t) {
    const [a, b, c] = [await join(t, 'Alice'), await join(t, 'Bob'), await join(t, 'Chloé')];
    await waitPeers([a, b, c]);
    await place(a, 18, 5); await place(b, 21, 5); await place(c, 68, 8);
    await wait(800);
    await a.keyboard.press('KeyM');
    await wait(1500);
    t.check(await hears(b, 'Alice'), 'micro de bureau : entendu dans le bureau');
    t.check(!(await hears(c, 'Alice')), 'micro de bureau : pas entendu ailleurs');
    await a.keyboard.press('KeyM');
    await place(a, 30, 10); await place(b, 31, 11);
    await wait(2500);
    t.check(!(await hears(b, 'Alice')), 'côte à côte, micro coupé : rien n\'est envoyé');
    await a.keyboard.press('KeyM');
    await wait(500);
    t.check(await hears(b, 'Alice'), 'côte à côte, micro ouvert : entendu');
    await a.keyboard.press('KeyM');
    await a.keyboard.down('KeyN');
    const vols = [];
    for (const x of [31, 33]) {
      await place(b, x, 10); await wait(600);
      vols.push(await b.evaluate(() => { const u = [...rt.users.values()].find((x) => x.name === 'Alice'); return rt.links.get(u.id)?.audioEl?.volume; }));
    }
    await a.keyboard.up('KeyN');
    t.check(vols[0] === 1 && vols[1] < 1, `N : volume progressif (${vols.map((v) => v?.toFixed(2)).join(' → ')})`);
  },

  async 'pupitre'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    await place(a, 6, 3); await place(b, 40, 11);
    await wait(600);
    await a.keyboard.press('KeyE');
    await wait(1500);
    t.check((await seen(b, 'Alice')).onAir, 'E près du pupitre : en direct');
    t.check(await hears(b, 'Alice'), 'entendu depuis le couloir');
    t.check(await b.$eval('#broadcast', (e) => !e.hidden), 'bandeau « en direct »');
    await a.keyboard.down('ArrowLeft'); await wait(200); await a.keyboard.up('ArrowLeft');
    await wait(1000);
    t.check(!(await seen(b, 'Alice')).onAir, 's\'éloigner rend la parole');
  },

  async 'chaises'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    await place(a, 17, 3);
    await a.keyboard.press('ArrowRight'); await wait(100);
    await a.keyboard.press('KeyE');
    await wait(800);
    t.check((await seen(b, 'Alice')).seated, 'E : assis, et vu assis par les autres');
    await place(b, 17, 4); await b.keyboard.press('ArrowRight'); await wait(100);
    await b.evaluate(() => rt.toggleSit()); await wait(400);
    const sb = await me(b);
    t.check(!(sb.seated && sb.x === 18 && sb.y === 3), 'chaise occupée : on ne s\'y assoit pas');
    await place(a, 20, 2); await place(b, 22, 2); await wait(500);
    await Promise.all([a.evaluate(() => rt.sitOn(21, 3)), b.evaluate(() => rt.sitOn(21, 3))]);
    await wait(1500);
    const both = [await me(a), await me(b)].filter((s) => s.seated && s.x === 21 && s.y === 3);
    t.check(both.length === 1, 'deux personnes en même temps : une seule reste assise');
  },

  async 'tableau blanc'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    await place(a, 64, 8); await place(b, 70, 8);
    await wait(500);
    t.check(await a.$eval('#boardBtn', (e) => e.hidden), 'pas de bouton loin du bureau du prof');
    await place(a, 68, 2); await wait(400);
    await a.click('#boardBtn'); await wait(800);
    t.check(await b.$eval('#board', (e) => !e.hidden), 'ouvert au bureau du prof : affiché chez l\'élève');
    const box = await a.$eval('#boardCanvas', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await a.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.5); await a.mouse.down();
    await a.mouse.move(box.x + box.w * 0.8, box.y + box.h * 0.5, { steps: 15 }); await a.mouse.up();
    await wait(1000);
    const ink = (p) => p.evaluate(() => { const d = document.querySelector('#boardCanvas').getContext('2d').getImageData(0, 0, 1600, 900).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] < 200) n++; return n; });
    t.check((await ink(b)) > 0, 'le tracé arrive chez l\'élève');
    await b.click('#boardMin'); await wait(300);
    t.check(await b.$eval('#board', (e) => e.classList.contains('pip')), 'mode PiP');
    const c = await join(t, 'Chloé');
    await waitPeers([a, b, c]);
    await wait(1200);
    await place(c, 72, 10); await wait(800);
    t.check((await ink(c)) > 0, 'arrivée en cours de route : le dessin existant est reçu');
  },

  async 'mains levées'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    await place(a, 30, 10); await place(b, 66, 10);
    await wait(600);
    await b.keyboard.press('KeyH'); await wait(800);
    t.check((await a.$$('#hands .hand-bubble')).length === 1, 'bulle de main levée');
    await a.click('#hands .hand-bubble');
    await pathDone(a);
    const pa = await me(a);
    t.check(Math.abs(pa.x - 66) + Math.abs(pa.y - 10) === 1, 'clic sur la bulle : on rejoint la personne');
  },

  async 'profil'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    await a.click('#mePill'); await wait(200);
    await a.click('#headChips [data-v=crown]'); await a.click('#bodyChips [data-v=cape]');
    await a.click('#joinSubmit'); await wait(1000);
    const look = (await seen(b, 'Alice')).look;
    t.check(look.head === 'crown' && look.body === 'cape', 'modification du personnage vue par les autres');
  },

  async 'reconnexion'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    await place(a, 33, 11);
    await a.evaluate(() => rt.relaunch());
    await waitPeers([a, b]);
    await b.waitForFunction(() => [...rt.users.values()].some((u) => u.name === 'Alice' && u.x === 33), { timeout: 30000 });
    t.check(true, '« Relancer la connexion » : on se retrouve, à la même place');
  },
};

// --- Lancement ---
const filter = process.argv[2] || '';
const server = await startServer(4300 + Math.floor(Math.random() * 500));
const browser = await launchBrowser();
let failed = 0;
for (const [name, run] of Object.entries(scenarios)) {
  if (!name.includes(filter)) continue;
  const t = { browser, url: server.url, room: `e2e-${Math.random().toString(36).slice(2, 8)}`, errors: [], results: [] };
  t.check = (ok, label) => t.results.push([!!ok, label]);
  try { await run(t); } catch (err) { t.results.push([false, `erreur : ${err.message.split('\n')[0]}`]); }
  for (const e of t.errors) t.results.push([false, `erreur de page — ${e}`]);
  console.log(`\n${name}`);
  for (const [ok, label] of t.results) { console.log(`  ${ok ? '✔' : '✘'} ${label}`); if (!ok) failed++; }
  for (const c of browser.browserContexts()) if (c !== browser.defaultBrowserContext()) await c.close();
}
await browser.close();
server.stop();
console.log(failed ? `\n${failed} vérification(s) en échec` : '\nTout est vert');
process.exit(failed ? 1 : 0);
