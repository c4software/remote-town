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
    // Sur ordinateur, un clic de souris sur la carte ne déplace pas (clavier uniquement)
    const tile = (x, y) => a.evaluate(([x, y]) => ({ x: (x * 32 + 16 - rt.cam.x) * rt.cam.zoom, y: (y * 32 + 16 - rt.cam.y) * rt.cam.zoom }), [x, y]);
    const far = await tile(34, 10);
    await a.mouse.click(far.x, far.y);
    await wait(1500);
    t.check((await me(a)).x === 30, 'clic de souris sur la carte : pas de déplacement');
    await a.keyboard.press('KeyV');
    await wait(500);
    t.check(await b.evaluate(() => [...rt.users.values()].some((u) => u.name === 'Alice' && u.jumpAt > 0)), 'V : Bob voit Alice sauter');
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

  async '67'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    const alice67 = () => b.evaluate(() => !![...rt.users.values()].find((u) => u.name === 'Alice').sixSeven);
    await a.keyboard.down('Digit6'); await a.keyboard.down('Digit7');
    await wait(1500);
    t.check(await alice67(), '6 + 7 maintenus : Bob voit le « 67 » d\'Alice');
    t.check(await a.evaluate(() => !rt.me.reacts?.length), '6 + 7 : pas de réaction 😮');
    await a.keyboard.up('Digit7');
    await wait(600);
    t.check(!(await alice67()), 'touche relâchée : le « 67 » s\'arrête');
    // Dab : B maintenu
    const aliceDab = () => b.evaluate(() => !![...rt.users.values()].find((u) => u.name === 'Alice').dab);
    await a.keyboard.down('KeyB');
    await wait(1200);
    t.check(await aliceDab(), 'B maintenu : Bob voit le dab d\'Alice');
    await a.keyboard.up('KeyB');
    await wait(800);
    t.check(!(await aliceDab()), 'B relâché : le dab s\'arrête');
    await a.keyboard.up('Digit6');
    await a.keyboard.press('Digit6');
    await wait(600);
    t.check(await b.evaluate(() => [...rt.users.values()].find((u) => u.name === 'Alice').reacts?.some((r) => r.e === '😮')), '6 seul : réaction 😮');
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
    // Changement de micro en pleine conversation : on reste entendu
    await a.click('#mePill'); await wait(300);
    const mics = await a.$$eval('#micSelect option', (o) => o.map((x) => x.value).filter(Boolean));
    if (mics.length) await a.select('#micSelect', mics.at(-1));
    await wait(1200);
    await a.click('#profileCancel'); await wait(500);
    t.check(mics.length > 0 && await hears(b, 'Alice'), 'changement de micro : toujours entendu dans le bureau');
    // Volume personnel : Bob coupe Alice depuis le menu du clic droit, puis rétablit
    const aliceId = await a.evaluate(() => rt.me.id);
    const aliceVolume = () => b.evaluate((id) => rt.links.get(id)?.audioEl?.volume, aliceId);
    await b.click('.side-tabs [data-panel=people]');
    await b.click(`#people li[data-id="${aliceId}"]`, { button: 'right' });
    t.check(await b.$eval('#personMenu', (e) => !e.hidden && e.textContent.includes('Alice')), 'clic droit : menu « Volume d\'Alice »');
    await b.click('#personMenu .pm-vol button');
    await wait(300);
    t.check(await aliceVolume() === 0, 'son d\'Alice coupé pour Bob');
    t.check(await b.$eval(`#people li[data-id="${aliceId}"] .p-vol`, (e) => e.textContent.includes('0 %')), 'badge « 🔇 0 % » dans la liste');
    t.check(await b.evaluate(() => JSON.parse(localStorage.getItem('rt-volumes')).Alice === 0), 'réglage mémorisé');
    await b.click(`#people li[data-id="${aliceId}"] .p-vol`);
    await b.click('#personMenu .pm-vol button');
    await wait(300);
    t.check(await aliceVolume() === 1, 'son d\'Alice rétabli');
    t.check(!(await hears(c, 'Alice')), 'changement de micro : toujours pas entendu ailleurs');
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

  async 'émotes'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    await place(a, 30, 10);
    await wait(600);
    const aliceEmote = () => b.evaluate(() => [...rt.users.values()].find((u) => u.name === 'Alice').emote || null);
    // Clic droit maintenu, on glisse vers le haut (Travail) et on relâche
    await a.mouse.move(500, 400);
    await a.mouse.down({ button: 'right' });
    t.check(await a.evaluate(() => !document.querySelector('#emoteWheel').hidden), 'clic droit maintenu : la roue s\'ouvre');
    await a.mouse.move(500, 330, { steps: 4 });
    await a.mouse.up({ button: 'right' });
    await wait(800);
    t.check(await aliceEmote() === 'work', 'glisser vers une émote et relâcher : Bob la voit');
    // Clic droit bref : la roue reste ouverte, on clique sur Café
    await a.mouse.click(500, 400, { button: 'right' });
    await wait(200);
    await a.click('#emoteWheel [data-emote=coffee]');
    await wait(800);
    t.check(await aliceEmote() === 'coffee', 'clic droit bref puis clic : émote changée');
    await a.keyboard.down('ArrowDown'); await wait(250); await a.keyboard.up('ArrowDown');
    await wait(800);
    t.check(await aliceEmote() === null, 'se déplacer retire l\'émote');
  },

  async 'porte des espaces'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    const other = `${t.room}-b`;
    const c = await join({ ...t, room: other }, 'Chloé');
    await waitPeers([a, b]);
    t.check((await me(b)).x !== 24 || (await me(b)).y !== 9 || (await me(a)).x !== 24 || (await me(a)).y !== 9, 'arrivée par la porte : on ne se superpose pas');
    await place(c, 30, 10); // libère la case devant la porte
    await place(a, 24, 9);
    await wait(600);
    await a.keyboard.press('KeyE');
    await wait(300);
    t.check(await a.$eval('#spaces', (e) => !e.hidden), 'E devant la porte : la fenêtre des espaces s\'ouvre');
    t.check(await a.$eval('#spacesInput', (e) => e.value === ''), 'le « e » ne s\'écrit pas dans le champ');
    await a.type('#spacesInput', other);
    await a.keyboard.press('Enter');
    await waitPeers([a, c], 2);
    await wait(1500);
    const names = (p) => p.evaluate(() => [...rt.users.values()].map((u) => u.name).sort().join(','));
    t.check(await names(a) === 'Alice,Chloé', 'Alice arrive dans l\'autre espace et voit Chloé');
    t.check(await names(b) === 'Bob', 'Bob ne voit plus Alice');
    const seenByC = await seen(c, 'Alice');
    t.check(seenByC?.x === 24 && seenByC?.y === 9, 'Alice ressort devant la porte');
    t.check(await a.evaluate((o) => location.search.includes(`room=${o}`) && JSON.parse(localStorage.getItem('rt-spaces'))[0] === o, other), 'lien et liste des espaces mis à jour');
  },

  async 'expulsion'(t) {
    // Clé jetable pour le test : publique chez tous, jeton (privée) chez Alice seulement
    const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = await crypto.subtle.exportKey('jwk', publicKey);
    const priv = await crypto.subtle.exportKey('jwk', privateKey);
    const token = Buffer.from(JSON.stringify({ x: priv.x, y: priv.y, d: priv.d })).toString('base64url');
    const [a, b, c] = [await join(t, 'Alice'), await join(t, 'Bob'), await join(t, 'Chloé')];
    await waitPeers([a, b, c]);
    for (const p of [a, b, c]) await p.evaluate((k) => rt.setAdminTestKey(k), { x: pub.x, y: pub.y });
    await a.evaluate((tk) => rt.loadAdminToken(tk), token);
    // Sans jeton, le clic droit dans la liste ne propose rien
    await c.click('.side-tabs [data-panel=people]');
    await c.click('#people li[data-id]:not(.me-row)', { button: 'right' });
    t.check(await c.$eval('#personMenu', (e) => !e.hidden && !e.querySelector('.pm-kick')), 'sans jeton : volume seulement, pas d\'expulsion');
    // Alice expulse Bob : clic droit sur sa ligne, puis confirmation
    await a.click('.side-tabs [data-panel=people]');
    const bobId = await b.evaluate(() => rt.me.id);
    a.once('dialog', (d) => d.accept());
    await a.click(`#people li[data-id="${bobId}"]`, { button: 'right' });
    t.check(await a.$eval('#personMenu .pm-kick', (e) => e.textContent.includes('Bob')), 'avec jeton : menu « Expulser Bob »');
    await a.click('#personMenu .pm-kick');
    await wait(1500);
    t.check(await b.$eval('#kicked', (e) => !e.hidden), 'Bob voit l\'écran d\'expulsion');
    t.check(await b.evaluate(() => rt.users.size === 1), 'Bob ne voit plus personne');
    t.check(await b.evaluate(() => Number(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('rt-kicked:')))) > Date.now()), 'Bob ne peut pas revenir tout de suite');
    t.check(!(await seen(c, 'Bob')), 'Chloé ne voit plus Bob');
    t.check(!(await seen(a, 'Bob')), 'Alice ne voit plus Bob');
    t.check(!!(await seen(c, 'Alice')), 'Chloé voit toujours Alice');
  },

  async 'pseudos en double'(t) {
    const a = await join(t, 'Alice');
    await wait(1500); // Alice est bien la première arrivée
    const b = await join(t, 'alice'); // même pseudo, autre casse
    await waitPeers([a, b]);
    await b.waitForFunction(() => !document.querySelector('#join').hidden, { timeout: 15000 }).catch(() => {});
    const forced = () => b.evaluate(() => ({
      open: !document.querySelector('#join').hidden,
      cancel: !document.querySelector('#profileCancel').hidden,
      text: document.querySelector('#joinSub').textContent,
    }));
    const f = await forced();
    t.check(f.open && !f.cancel && f.text.includes('déjà pris'), 'le dernier arrivé doit changer de pseudo (pas d\'Annuler)');
    t.check(await a.$eval('#join', (e) => e.hidden), 'la première arrivée garde son pseudo');
    await b.keyboard.press('Escape');
    await wait(300);
    t.check((await forced()).open, 'Échap ne ferme pas l\'écran');
    await b.$eval('#nameInput', (e) => { e.value = ''; });
    await b.type('#nameInput', 'ALICE');
    await b.click('#joinSubmit');
    await wait(300);
    t.check((await forced()).open, '« ALICE » refusé (casse non prise en compte)');
    // Caractère invisible et espaces en trop : nettoyés, donc toujours un doublon
    await b.$eval('#nameInput', (e) => { e.value = '  Al\u200Bice\u00A0 '; });
    await b.click('#joinSubmit');
    await wait(300);
    t.check((await forced()).open && await b.$eval('#nameInput', (e) => e.value === 'Alice'), '« Al(invisible)ice » nettoyé en « Alice » et refusé');
    await b.$eval('#nameInput', (e) => { e.value = ''; });
    await b.type('#nameInput', 'Alice 2');
    await b.click('#joinSubmit');
    await wait(1200);
    t.check(!(await forced()).open, 'pseudo libre accepté : l\'écran se ferme');
    t.check(!!(await seen(a, 'Alice 2')), 'Alice voit « Alice 2 »');
  },

  async 'fatigue'(t) {
    const a = await join(t, 'Alice');
    await place(a, 17, 10);
    await wait(300);
    const st = () => a.evaluate(() => rt.stamina);
    // Course d'un bout à l'autre du couloir, puis retour : l'endurance s'épuise
    await a.keyboard.down('Shift');
    await a.keyboard.down('ArrowRight'); await wait(3200); await a.keyboard.up('ArrowRight');
    const half = await st();
    t.check(half.value < 60 && !half.exhausted, `courir vide l'endurance (${Math.round(half.value)} après un aller)`);
    // Retour : on guette l'essoufflement pendant la course
    await a.keyboard.down('ArrowLeft');
    const out = await a.evaluate(() => new Promise((res) => {
      const t0 = performance.now();
      const tick = () => (rt.stamina.exhausted ? res(true) : performance.now() - t0 > 3500 ? res(false) : setTimeout(tick, 50));
      tick();
    }));
    t.check(out, 'aller-retour en courant : essoufflé·e');
    // Essoufflé·e : Maj ne fait plus courir (un pas de marche dure 140 ms au lieu de 65)
    const x0 = (await me(a)).x;
    await wait(1000);
    const moved = x0 - (await me(a)).x;
    await a.keyboard.up('ArrowLeft');
    t.check(moved > 0 && moved <= 8, `essoufflé·e : on marche au lieu de courir (${moved} cases en 1 s)`);
    await a.keyboard.up('Shift');
    await wait(3000);
    const rest = await st();
    t.check(!rest.exhausted && rest.value >= 40, `au repos : souffle repris (${Math.round(rest.value)})`);
  },

  async 'toucher sur mobile'(t) {
    // Sur écran tactile, toucher la carte déplace toujours le personnage (pas de clavier)
    const m = await join(t, 'Mobile', { viewport: { width: 390, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
    await place(m, 30, 10);
    await wait(500);
    const p = await m.evaluate(() => ({ x: (32 * 32 + 16 - rt.cam.x) * rt.cam.zoom, y: (10 * 32 + 16 - rt.cam.y) * rt.cam.zoom }));
    await m.touchscreen.tap(p.x, p.y);
    await pathDone(m);
    t.check((await me(m)).x === 32, 'toucher la carte : on s\'y rend');
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
    // Compte les carillons réellement lus (fichier WAV joué par un élément <audio>)
    const spyChime = (p) => p.evaluate(() => {
      window.chimesPlayed = 0;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        const r = play.call(this);
        if (this.src.startsWith('blob:')) r.then(() => window.chimesPlayed++, () => {});
        return r;
      };
    });
    await spyChime(a); await spyChime(b);
    await a.keyboard.press('KeyJ');
    await wait(800);
    t.check(await a.evaluate(() => window.chimesPlayed === 1), 'J au pupitre : Alice entend son propre jingle');
    t.check(await b.evaluate(() => window.chimesPlayed === 1), 'J au pupitre : Bob entend le jingle');
    const jingleAt = () => b.evaluate(() => [...rt.users.values()].find((u) => u.name === 'Alice').jingleAt || 0);
    const firstJingle = await jingleAt();
    t.check(firstJingle > 0, 'J au pupitre : Bob reçoit le jingle');
    t.check(await hears(b, 'Alice'), 'après le jingle, la voix passe toujours');
    await a.keyboard.down('ArrowLeft'); await wait(200); await a.keyboard.up('ArrowLeft');
    await wait(1000);
    t.check(!(await seen(b, 'Alice')).onAir, 's\'éloigner rend la parole');
    await wait(2500); // passe le délai entre deux jingles
    await a.keyboard.press('KeyJ');
    await wait(800);
    t.check(await jingleAt() === firstJingle, 'J loin du pupitre : pas de jingle');
  },

  async 'écran du pupitre'(t) {
    const [a, b, c] = [await join(t, 'Alice'), await join(t, 'Bob'), await join(t, 'Chloé')];
    await waitPeers([a, b, c]);
    await place(a, 6, 3); await place(b, 40, 11); await place(c, 10, 8);
    await wait(600);
    await a.keyboard.press('KeyE');
    await wait(800);
    await a.click('#shareBtn');
    await wait(3500);
    const state = (p) => p.evaluate(() => ({ pip: !document.querySelector('#airPip').hidden && !!document.querySelector('#airPip .air-card'), focus: !document.querySelector('#focus').hidden }));
    const sb = await state(b), sc = await state(c);
    t.check(sb.pip && !sb.focus, 'écran diffusé : en PiP dans le couloir');
    t.check(sc.pip && !sc.focus, 'écran diffusé : en PiP aussi dans le bureau principal (pas d\'ouverture automatique)');
    await b.click('#airPip .air-card');
    await wait(300);
    const big = await state(b);
    t.check(big.focus && !big.pip, 'clic : affiché en grand');
    await b.click('#focus button');
    await wait(300);
    const back = await state(b);
    t.check(back.pip && !back.focus, 'fermer le grand format : retour en PiP');
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
    await place(a, 6, 14); await a.keyboard.press('ArrowDown'); await wait(100);
    await a.keyboard.press('KeyE'); await wait(800);
    const sofa = await seen(b, 'Alice');
    t.check(sofa.seated && sofa.x === 6 && sofa.y === 15, 'E près d\'un canapé : assis sur le canapé');
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
    // Aide réaffichée depuis l'écran du personnage, puis fermée avec la croix
    await a.click('#mePill'); await wait(200);
    await a.click('#profileHelp'); await wait(200);
    t.check(await a.$eval('#help', (e) => !e.hidden), 'aide réaffichée depuis l\'écran du personnage');
    await a.click('#help .help-close'); await wait(200);
    t.check(await a.$eval('#help', (e) => e.hidden), 'la croix ferme l\'aide');
  },

  // Avec NET=http://localhost:8090 et DIAG_LOG=<sortie du relais local>, vérifie aussi
  // que le relais a journalisé le diagnostic (sinon, seulement le texte produit)
  async 'diagnostic'(t) {
    const a = await join(t, 'Alice');
    await a.browserContext().overridePermissions(t.url, ['clipboard-read', 'clipboard-write']);
    await a.waitForFunction(() => !document.querySelector('#waiting').hidden, { timeout: 15000 }); // seule depuis 3 s
    await a.bringToFront(); // le presse-papiers exige une page au premier plan
    // Commande /diag dans le chat (les boutons sont masqués)
    await a.evaluate(() => document.querySelector('.chat-tabs [data-chan=global]')?.click());
    await a.click('#chatInput');
    await a.type('#chatInput', '/diag');
    await a.keyboard.press('Enter');
    await a.waitForFunction(() => rt.lastDiag.length > 0, { timeout: 20000 });
    await wait(500);
    const text = await a.evaluate(() => rt.lastDiag);
    const toasts = await a.evaluate(() => document.querySelector('#toasts').innerText);
    // Presse-papiers refusé (Chrome sans interface) : la fenêtre de secours montre le texte
    const shown = await a.evaluate(() => !document.querySelector('#diagBox').hidden && document.querySelector('#diagText').value === rt.lastDiag);
    for (const h of ['Page modifiée le', 'Navigateur', 'Salle : ', 'Nom : Alice', 'Relais de mise en relation', 'Personnes vues : 0', 'Liaisons WebRTC', 'Test ICE', 'Micro : ', 'Console Trystero']) {
      t.check(text.includes(h), `diagnostic : rubrique « ${h.trim()} »`);
    }
    // Pas d'adresse IP (un numéro de version « Chrome/141.0.0.0 » n'en est pas une)
    t.check(!/(?<![a-z]\/)\b(?:\d{1,3}\.){3}\d{1,3}\b/i.test(text), 'diagnostic : aucune adresse IPv4');
    t.check(!/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b|::[0-9a-f]/i.test(text), 'diagnostic : aucune adresse IPv6');
    t.check(/host [1-9]/.test(text), 'diagnostic : test ICE avec des candidats host');
    t.check(toasts.includes('Diagnostic copié') || shown, 'diagnostic copié, ou affiché à copier à la main');
    await a.evaluate(() => document.querySelector('#diagClose').click());
    if (process.env.NET && process.env.DIAG_LOG) {
      t.check(toasts.includes('envoyé'), 'diagnostic envoyé au relais (toast)');
      const log = (await import('node:fs')).readFileSync(process.env.DIAG_LOG, 'utf8');
      const block = log.split('===== DIAGNOSTIC').at(-1) || '';
      t.check(block.includes('Nom : Alice') && block.includes('===== FIN ====='), 'diagnostic journalisé par le relais');
    }
    await a.click('#mePill'); await wait(200);
    t.check(await a.$eval('#messages', (e) => !e.innerText.includes('/diag')), '/diag n\'est pas envoyé comme message');
    t.check(await a.$eval('#waitDiag', (e) => e.offsetParent === null) && await a.$eval('#profileDiag', (e) => e.offsetParent === null), 'boutons Diagnostic masqués');
  },

  async 'incrustation'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    await place(b, 27, 10); // Bob s'approche : il doit apparaître dans la vue d'Alice
    t.check(await a.evaluate(() => !rt.pipOn), 'ouverture automatique désactivée par défaut');
    await a.keyboard.press('KeyP');
    await a.waitForFunction(() => documentPictureInPicture.window, { timeout: 5000 });
    await wait(500);
    const shot = await a.evaluate(() => documentPictureInPicture.window.document.querySelector('canvas').toDataURL());
    t.check(shot.length > 5000, 'P ouvre la vue en incrustation, dessinée');
    if (process.env.SHOT) (await import('node:fs')).writeFileSync(process.env.SHOT, Buffer.from(shot.split(',')[1], 'base64'));
    // Onglet caché : la boucle de la page s'arrête, la vue doit continuer à suivre Bob
    const other = await a.browserContext().newPage();
    await other.bringToFront();
    await a.waitForFunction(() => document.hidden, { timeout: 5000 });
    await place(b, 25, 11);
    await a.waitForFunction(() => [...rt.users.values()].some((u) => u.name === 'Bob' && u.rx === 25 && u.ry === 11), { timeout: 10000 });
    const shot2 = await a.evaluate(() => documentPictureInPicture.window.document.querySelector('canvas').toDataURL());
    t.check(shot2 !== shot, 'onglet caché : la vue continue de suivre les déplacements');
    await a.bringToFront();
    await other.close();
    await a.keyboard.press('KeyP');
    await wait(300);
    t.check(await a.evaluate(() => !documentPictureInPicture.window), 'P la referme');
    await a.click('#mePill');
    await a.click('#pipChips [data-pip="on"]');
    t.check(await a.evaluate(() => rt.pipOn && JSON.parse(localStorage.getItem('rt-prefs')).pipAuto === true), 'activable dans le profil, mémorisé');
    await a.click('#pipChips [data-pip="off"]');
    t.check(await a.evaluate(() => !rt.pipOn && JSON.parse(localStorage.getItem('rt-prefs')).pipAuto === false), 'puis désactivable');
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
