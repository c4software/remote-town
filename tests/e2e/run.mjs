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
    // Discussions du téléphone : groupe « Tout le monde », puis message direct
    await a.click('#phoneBtn'); await wait(500); await a.click('#phone .ph-nav-chats'); await a.click('#phone .ph-conv[data-conv=global]');
    await a.type('#chatInput', 'bonjour à tous');
    await a.keyboard.press('Enter');
    await wait(1200);
    t.check(await b.$eval('#phoneBtn .badge', (e) => !e.hidden && e.textContent === '1'), 'message non lu : pastille sur le bouton du téléphone');
    t.check(await b.$eval('#notifs .notif', (e) => e.textContent.includes('Alice') && e.textContent.includes('bonjour à tous') && !!e.querySelector('canvas')), 'notification du message : portrait, nom et texte');
    await b.click('#notifs .notif');
    await wait(500);
    t.check(await b.evaluate(() => document.querySelector('#messages').innerText.includes('bonjour à tous')), 'clic sur la notification : la conversation s\'ouvre (chat global reçu)');
    t.check(await b.$('#notifs .notif') === null, 'notification retirée');
    t.check(await b.$eval('#phoneBtn .badge', (e) => e.hidden), 'conversation ouverte : plus de pastille');
    const c = await join(t, 'Chloé');
    await waitPeers([a, b, c]);
    await b.click('#phone .ph-back'); await b.click('#phone .ph-back'); await b.click('#phone .ph-nav-contacts');
    await b.evaluate(() => [...document.querySelectorAll('#phone .ph-contact')].find((r) => r.textContent.includes('Alice')).querySelector('.ph-info').click());
    await b.click('#phone .ph-act-msg');
    await b.type('#chatInput', 'juste pour toi');
    await b.keyboard.press('Enter');
    await wait(1200);
    const dms = (page) => page.evaluate(() => { rt.openChat('dm:bob'); return document.querySelector('#messages').innerText; });
    t.check((await dms(a)).includes('juste pour toi'), 'message direct reçu par Alice');
    t.check(!(await c.evaluate(() => { rt.openChat('dm:bob'); const t = document.querySelector('#messages').innerText; rt.openChat('global'); return t + document.querySelector('#messages').innerText; })).includes('juste pour toi'), 'message direct : pas vu par Chloé');
    await c.close();
    await waitPeers([a, b]);
    await place(b, 45, 11);
    await wait(600);
    await a.click('#phone .ph-back'); await a.click('#phone .ph-back'); await a.click('#phone .ph-nav-contacts');
    await a.click('#phone .ph-contact .ph-info');
    await a.click('#phone .ph-act-join');
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
    await a.click('#mePill'); await wait(500); await a.click('#phone .ph-full'); await wait(300);
    const mics = await a.$$eval('#micSelect option', (o) => o.map((x) => x.value).filter(Boolean));
    if (mics.length) await a.select('#micSelect', mics.at(-1));
    await wait(1200);
    await a.click('#profileCancel'); await wait(500);
    t.check(mics.length > 0, `changement de micro : ${mics.length} micro(s) proposé(s)`);
    t.check(await hears(b, 'Alice'), 'changement de micro : toujours entendu dans le bureau');
    // Volume personnel : Bob coupe Alice depuis le menu du clic droit, puis rétablit
    const aliceId = await a.evaluate(() => rt.me.id);
    const aliceVolume = () => b.evaluate((id) => rt.links.get(id)?.audioEl?.volume, aliceId);
    await b.evaluate((id) => rt.openPerson(id), aliceId);
    await wait(500);
    t.check(await b.$eval('#phone .ph-person', (e) => e.textContent.includes('Volume d\'Alice')), 'fiche d\'Alice dans le téléphone : « Volume d\'Alice »');
    await b.click('#phone .ph-vol button');
    await wait(300);
    t.check(await aliceVolume() === 0, 'son d\'Alice coupé pour Bob');
    await b.click('#phone .ph-back');
    t.check(await b.$eval(`#phone .ph-contact[data-id="${aliceId}"]`, (e) => e.textContent.includes('0 %')), 'rappel « 🔇 0 % » dans les contacts');
    t.check(await b.evaluate(() => JSON.parse(localStorage.getItem('rt-volumes')).Alice === 0), 'réglage mémorisé');
    await b.click(`#phone .ph-contact[data-id="${aliceId}"] .ph-info`);
    await b.click('#phone .ph-vol button');
    await wait(300);
    await b.click('#phone .ph-close');
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

  async 'téléphone'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    // Loin l'une de l'autre, micros coupés : seul le téléphone peut les relier
    await place(a, 30, 10); await place(b, 20, 5);
    await wait(500);
    // Appel depuis la fiche de la personne, dans les contacts du téléphone
    const call = async (page, name) => {
      await page.evaluate((name) => rt.openPerson([...rt.users.values()].find((u) => u.name === name).id), name);
      await wait(500); // le téléphone monte du bas de l'écran
      await page.click('#phone .ph-act-call');
    };
    // Son réellement reçu, mesuré sur la liaison (énergie audio décodée pendant 2 s) : en
    // conversation à deux sens, l'indicateur de niveau lu par hears() reste parfois muet
    const energy = (page) => page.evaluate(async () => {
      let e = 0;
      for (const pc of Object.values(rt.room.getPeers())) (await pc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'audio') e += r.totalAudioEnergy || 0; });
      return e;
    });
    const gets = async (page) => { const e0 = await energy(page); await wait(2000); return (await energy(page)) - e0 > 0.01; };
    const has = (page, sel) => page.$eval('#phone', (e, sel) => !e.hidden && !!e.querySelector(sel), sel);
    // Téléphone replié : un bouton ; déplié : contacts, messagerie, réglages
    t.check(await a.$eval('#phone', (e) => e.hidden) && await a.$eval('#bar #phoneBtn', (e) => !e.hidden), 'hors appel : téléphone replié, bouton dans la barre');
    await a.click('#phoneBtn'); await wait(500); await a.click('#phone .ph-nav-settings');
    t.check(await a.$$eval('#phone .ph-ring', (o) => o.map((x) => x.dataset.ring).join()) === 'ip,bell,beeps,chime,file', 'réglages : choix de la sonnerie');
    await a.click('#phone .ph-ring[data-ring="bell"]');
    t.check(await a.evaluate(() => JSON.parse(localStorage.getItem('rt-prefs')).ring) === 'bell', 'sonnerie choisie mémorisée');
    await a.click('#phone .ph-back'); await a.click('#phone .ph-nav-contacts');
    t.check(await a.$$eval('#phone .ph-contact', (o) => o.map((x) => x.querySelector('b').textContent).join()) === 'Bob', 'contacts : Bob');
    await a.click('#phone .ph-back'); await a.click('#phone .ph-nav-profile');
    await a.click('#phone .ph-chips[data-part="shirt"] .ph-sw:nth-child(3)');
    await a.select('#phone .ph-select[data-part="head"]', 'cap');
    await wait(600);
    t.check(await a.evaluate(() => rt.me.look.shirt === '#ef476f' && rt.me.look.head === 'cap'), '« Mon personnage » dans le téléphone : couleur et accessoire appliqués');
    const lb = await seen(b, 'Alice');
    t.check(lb.look.shirt === '#ef476f' && lb.look.head === 'cap', 'Bob voit le nouveau personnage d\'Alice');
    t.check(await a.$eval('#phone .ph-look', (e) => !e.querySelector('input') && e.querySelector('.ph-name').textContent === 'Alice'), 'le nom est affiché, pas modifiable dans le téléphone');
    await a.click('#phone .ph-close');
    await call(a, 'Bob');
    await wait(1000);
    t.check(await has(a, '.ph-out'), 'Alice : appel en cours vers Bob');
    t.check(await has(b, '.ph-in .ph-accept'), 'Bob : ça sonne, il peut décrocher');
    const shown = (page, who) => page.evaluate((who) => [...rt.users.values()].find((x) => x.name === who).phone ?? null, who);
    t.check(await shown(a, 'Bob') === 'ring' && await shown(b, 'Alice') === 'call', 'vu des autres : le téléphone de Bob sonne, Alice est au téléphone');
    await b.click('#phone .ph-accept');
    await wait(2500);
    t.check(await has(a, '.ph-on') && await has(b, '.ph-on'), 'en ligne des deux côtés');
    t.check(await gets(b), 'Bob entend Alice au téléphone');
    t.check(await gets(a), 'Alice entend Bob au téléphone');
    // Haut-parleur : annoncé aux autres, et signalé à la personne en ligne
    await a.click('#phone .ph-spk');
    await wait(800);
    t.check(await a.evaluate(() => rt.me.speaker === true) && await b.evaluate(() => [...rt.users.values()].find((x) => x.name === 'Alice').speaker === true), 'haut-parleur activé par Alice, vu de Bob');
    t.check(await has(b, '.ph-warn'), 'Bob est prévenu que le haut-parleur est activé chez Alice');
    await a.click('#phone .ph-end');
    await wait(1000);
    t.check(await a.evaluate(() => !rt.me.speaker), 'fin de l\'appel : haut-parleur coupé');
    t.check(await b.$eval('#phone', (e) => e.hidden), 'Alice raccroche : l\'appel se ferme chez Bob');
    t.check(await shown(a, 'Bob') === null && await shown(b, 'Alice') === null, 'plus personne au téléphone');
    t.check(!(await gets(b)), 'après avoir raccroché : plus rien n\'est envoyé');
    await call(a, 'Bob');
    await wait(500);
    t.check(await a.$eval('#phone', (e) => e.hidden) && await b.$eval('#phone', (e) => e.hidden), 'pas d\'appels à la suite : le rappel immédiat est refusé');
    // Bob appelle Alice, qui refuse : il laisse un message vocal
    await call(b, 'Alice');
    await wait(1000);
    await a.click('#phone .ph-end');
    await wait(800);
    t.check(await has(b, '.ph-away .ph-record'), 'appel refusé : Bob peut laisser un message');
    await b.click('#phone .ph-record');
    await wait(2000);
    await b.click('#phone .ph-send');
    await wait(1500);
    t.check(await a.$eval('#phoneBtn .badge', (e) => !e.hidden && e.textContent === '1'), 'pastille « 1 message » sur le bouton du téléphone');
    await a.click('#phoneBtn'); await wait(500); await a.click('#phone .ph-nav-vmail');
    const dur = await a.evaluate(() => new Promise((res) => {
      const au = document.querySelector('#phone .ph-vmail audio');
      if (!au) return res(-1);
      au.onloadedmetadata = () => res(1); au.onerror = () => res(0);
      if (au.readyState >= 1) res(1);
      setTimeout(() => res(0), 3000);
    }));
    t.check(dur === 1, 'Alice reçoit le message vocal, lisible');
    // Ne pas déranger : l'appel va droit à la messagerie, sans sonner
    await a.click('#phone .ph-back'); await a.click('#phone .ph-nav-settings'); await a.click('#phone .ph-dnd'); await a.click('#phone .ph-close');
    const c = await join(t, 'Chloé');
    await waitPeers([a, b, c]);
    await place(c, 34, 10); await wait(500);
    await c.click('#phoneBtn'); await wait(500); await c.click('#phone .ph-nav-contacts');
    await c.click('#phone .ph-contact:first-child .ph-dial');
    await wait(1200);
    t.check(await has(c, '.ph-away .ph-record') && await a.$eval('#phone', (e) => e.hidden), 'ne pas déranger : appel depuis les contacts renvoyé vers la messagerie, sans sonner');
    await c.click('#phone .ph-ghost');
    // Dans une salle de classe : pas de téléphone
    await place(b, 65, 10);
    await wait(500);
    await call(b, 'Alice');
    await wait(500);
    t.check(await b.$eval('#phone', (e) => !e.querySelector('.ph-out')), 'depuis la salle de classe : appel impossible');
  },

  async 'sonnerie personnelle'(t) {
    // Un petit fichier WAV (0,5 s de 880 Hz) comme sonnerie de Bob
    const { writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const n = 4000, wav = Buffer.alloc(44 + n * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 880 * i) / 8000)), 44 + i * 2);
    const file = `${tmpdir()}/rt-sonnerie-${Date.now()}.wav`;
    writeFileSync(file, wav);
    const [a, b, c] = [await join(t, 'Alice'), await join(t, 'Bob'), await join(t, 'Chloé')];
    await waitPeers([a, b, c]);
    await place(a, 45, 10); await place(b, 30, 10); await place(c, 32, 10);
    await wait(500);
    await b.click('#phoneBtn'); await wait(500); await b.click('#phone .ph-nav-settings');
    const [chooser] = await Promise.all([b.waitForFileChooser(), b.click('#phone .ph-ring[data-ring=file]')]);
    await chooser.accept([file]);
    await wait(800);
    t.check(await b.evaluate(() => JSON.parse(localStorage.getItem('rt-prefs')).ring === 'file' && localStorage.getItem('rt-ring-file').startsWith('data:audio')), 'Bob choisit un fichier audio comme sonnerie');
    await b.click('#phone .ph-close');
    await a.evaluate(() => rt.openPerson([...rt.users.values()].find((u) => u.name === 'Bob').id));
    await wait(500);
    await a.click('#phone .ph-act-call');
    await wait(2500);
    const near = await c.evaluate(() => rt.nearRing);
    t.check(near?.custom === true && near.volume > 0, `Chloé, à 2 cases, entend la sonnerie personnelle de Bob (volume ${near?.volume?.toFixed(2)})`);
    t.check(await a.evaluate(() => rt.nearRing) === null, 'Alice, loin, n\'entend pas la sonnerie de Bob');
    await place(c, 34, 10); await wait(500);
    const far = await c.evaluate(() => rt.nearRing);
    t.check(far?.volume > 0 && far.volume < near.volume, `plus loin : moins fort (${far?.volume?.toFixed(2)})`);
    // Réglage « Sonneries personnelles des autres » coupé : retour au motif par défaut
    await c.click('#phoneBtn'); await wait(500); await c.click('#phone .ph-nav-settings'); await c.click('#phone .ph-others');
    await wait(500);
    const plain = await c.evaluate(() => rt.nearRing);
    t.check(plain?.custom === false && plain.key === 'ip', 'réglage coupé : Chloé entend la sonnerie par défaut');
    await a.click('#phone .ph-end');
    await wait(800);
    t.check(await c.evaluate(() => rt.nearRing) === null, 'appel annulé : la sonnerie s\'arrête chez Chloé');
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
    const bobId = await b.evaluate(() => rt.me.id);
    await c.evaluate((id) => rt.openPerson(id), bobId);
    await wait(500);
    t.check(await c.$eval('#phone', (e) => !e.hidden && !e.querySelector('.ph-kick')), 'sans jeton : fiche sans expulsion');
    // Alice expulse Bob : sa fiche dans le téléphone, puis confirmation
    a.once('dialog', (d) => d.accept());
    await a.evaluate((id) => rt.openPerson(id), bobId);
    await wait(500);
    t.check(await a.$eval('#phone .ph-kick', (e) => e.textContent.includes('Bob')), 'avec jeton : « Expulser Bob » dans sa fiche');
    await a.click('#phone .ph-kick');
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
    // Effet haut-parleur : appliqué sous Chrome, pas sous Firefox (voix entendue telle quelle)
    const fxOf = (p) => p.evaluate(() => { const u = [...rt.users.values()].find((x) => x.name === 'Alice'); const L = rt.links.get(u.id); return { fx: !!L?.fx, muted: !!L?.audioEl?.muted }; });
    const f = await join(t, 'Fanny', { setup: (page) => page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0') });
    await place(f, 42, 11);
    await wait(2500);
    const [fxB, fxF] = [await fxOf(b), await fxOf(f)];
    t.check(fxB.fx && fxB.muted, 'voix du pupitre : effet haut-parleur sous Chrome');
    t.check(!fxF.fx && !fxF.muted && await hears(f, 'Alice'), 'voix du pupitre sous Firefox : sans effet, entendue');
    await f.close();
    await waitPeers([a, b]);
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
    // Débit du partage plafonné et réparti entre les spectateurs (2 ici : 2 Mbit/s chacun au plus)
    const caps = await a.evaluate(() => Object.values(rt.room.getPeers()).flatMap((pc) => pc.getSenders())
      .filter((s) => s.track?.kind === 'video').map((s) => s.getParameters().encodings[0]?.maxBitrate));
    t.check(caps.length === 2 && caps.every((c) => c === 2000000), 'partage d\'écran : débit plafonné pour chaque spectateur');
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
    // Bulle du prof : visible pour l'élève du fond, pas pour celui qui voit déjà le prof, ni pour le prof
    const bubble = (p) => p.$eval('#teacher', (e) => (e.hidden ? null : e.textContent));
    await place(b, 70, 19); await wait(600);
    t.check(await bubble(b) === 'Alice', 'élève au fond de la classe : le prof apparaît dans une bulle');
    await place(b, 70, 6); await wait(600);
    t.check(await bubble(b) === null && await bubble(a) === null, 'prof visible à l\'écran : pas de bulle (ni pour le prof)');
    await place(b, 70, 8); await wait(300);
    await a.click('#boardBtn'); await wait(800);
    t.check(await bubble(b) === 'Alice' && await bubble(a) === null, 'tableau en grand : le prof en bulle pour l\'élève');
    t.check(await b.$eval('#board', (e) => !e.hidden), 'ouvert au bureau du prof : affiché chez l\'élève');
    const box = await a.$eval('#boardCanvas', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await a.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.5); await a.mouse.down();
    await a.mouse.move(box.x + box.w * 0.8, box.y + box.h * 0.5, { steps: 15 }); await a.mouse.up();
    await wait(1000);
    const ink = (p) => p.evaluate(() => { const d = document.querySelector('#boardCanvas').getContext('2d').getImageData(0, 0, 1600, 900).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] < 200) n++; return n; });
    t.check((await ink(b)) > 0, 'le tracé arrive chez l\'élève');
    // Écriture au clavier : outil « Texte », clic sur le tableau, puis on tape
    const texts = (p) => p.evaluate(() => [...rt.boards.get('class').strokes.values()].filter((s) => s.text !== undefined).map((s) => s.text));
    await a.click('#penTools .text-tool');
    await a.mouse.click(box.x + box.w * 0.2, box.y + box.h * 0.2);
    await a.keyboard.type('Bonjour');
    await a.keyboard.press('Enter');
    await a.keyboard.type('la classe');
    await wait(600);
    t.check((await texts(b)).join() === 'Bonjour\nla classe', 'texte tapé au clavier : il apparaît chez l\'élève pendant la saisie');
    t.check((await me(a)).zone === 'class' && await a.evaluate(() => !document.querySelector('#chatInput')?.value), 'taper ne déplace pas le personnage et n\'écrit pas dans le chat');
    // Fenêtre redimensionnée pendant la saisie (clavier d'une tablette, par exemple) : la zone
    // de saisie suit le tableau au lieu de se fermer
    await a.setViewport({ width: 1100, height: 700 });
    await wait(500);
    t.check(await a.evaluate(() => document.activeElement?.id === 'boardText'), 'redimensionnement : la saisie continue');
    await a.setViewport({ width: 1300, height: 820 });
    await wait(500);
    await a.keyboard.press('Escape');
    await wait(300);
    t.check(await a.$('#boardText') === null && (await texts(a)).length === 1, 'Échap termine la saisie, le texte reste');
    await a.mouse.click(box.x + box.w * 0.2 + 10, box.y + box.h * 0.2 + 10);
    await a.keyboard.press('End');
    await a.keyboard.type(' !');
    await a.keyboard.press('Escape');
    await wait(500);
    const edited = await texts(b);
    t.check(edited.join() === 'Bonjour\nla classe !', `un clic sur le texte le reprend (${JSON.stringify(edited)})`);
    await b.click('#boardMin'); await wait(300);
    t.check(await b.$eval('#board', (e) => e.classList.contains('pip')), 'mode PiP');
    const c = await join(t, 'Chloé');
    await waitPeers([a, b, c]);
    await wait(1200);
    await place(c, 72, 10); await wait(800);
    t.check((await ink(c)) > 0, 'arrivée en cours de route : le dessin existant est reçu');
    // Fermer le tableau l'enregistre : rouvert, on retrouve les traits et le texte
    const items = (p) => p.evaluate(() => { const b = rt.boards.get('class'); return b ? [...b.strokes.values()].map((s) => (s.text !== undefined ? 'texte' : 'trait')).sort().join() : null; });
    await a.click('#boardClose'); await wait(800);
    t.check(await items(b) === null, 'tableau fermé : il disparaît chez l\'élève');
    await a.click('#boardBtn'); await wait(1000);
    t.check(await items(a) === 'texte,trait' && await items(b) === 'texte,trait' && (await texts(c)).join() === 'Bonjour\nla classe !', 'tableau rouvert : traits et texte retrouvés, chez le prof et les élèves');
    // Quitter la salle le garde aussi ; rien n'est écrit dans le navigateur (comme le chat)
    await place(a, 30, 10); await wait(800);
    t.check(await items(b) === null && await a.evaluate(() => localStorage.getItem('rt-boards') === null), 'sortie de la salle : tableau fermé, rien dans le stockage du navigateur');
    await place(a, 68, 2); await wait(500);
    await a.click('#boardBtn'); await wait(1000);
    t.check(await items(a) === 'texte,trait' && await items(b) === 'texte,trait', 'retour dans la salle : tableau retrouvé');
    // Comme l'historique du chat : le prof recharge sa page, les autres ont gardé son tableau
    await a.click('#boardClose'); await wait(600);
    await a.reload();
    await a.$eval('#nameInput', (e) => { e.value = ''; });
    await a.type('#nameInput', 'Alice');
    await a.click('.btn-primary');
    await a.waitForFunction(() => window.rt?.me && !rt.warp);
    await waitPeers([a, b, c]);
    await wait(2500);
    await place(a, 68, 2); await wait(500);
    await a.click('#boardBtn'); await wait(1200);
    t.check(await items(a) === 'texte,trait' && await items(b) === 'texte,trait', 'prof reconnecté : le tableau gardé par les autres est retrouvé');
  },

  async 'mains levées'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    await place(a, 30, 10); await place(b, 66, 10);
    await wait(600);
    await b.keyboard.press('KeyH'); await wait(800);
    t.check((await a.$$('#hands .hand-bubble')).length === 1, 'bulle de main levée');
    await a.click('#hands .hand-bubble');
    t.check(await a.$eval('#personMenu', (e) => !e.hidden && !!e.querySelector('.pm-join') && !!e.querySelector('.pm-call')), 'clic sur la bulle : rejoindre ou appeler');
    await a.click('#personMenu .pm-join');
    await pathDone(a);
    const pa = await me(a);
    t.check(Math.abs(pa.x - 66) + Math.abs(pa.y - 10) === 1, 'clic sur la bulle : on rejoint la personne');
  },

  async 'profil'(t) {
    const [a, b] = [await join(t, 'Alice'), await join(t, 'Bob')];
    await waitPeers([a, b]);
    // Son personnage, dans la barre du bas : le téléphone s'ouvre sur la page « Personnage »
    await a.click('#mePill'); await wait(500);
    t.check(await a.$eval('#phone', (e) => !e.hidden && !!e.querySelector('.ph-look')) && await a.$eval('#join', (e) => e.hidden), 'bouton du personnage : téléphone ouvert sur « Personnage »');
    await a.click('#phone .ph-close'); await wait(400);
    await a.click('#mePill'); await wait(500); await a.click('#phone .ph-full'); await wait(300);
    await a.click('#headChips [data-v=crown]'); await a.click('#bodyChips [data-v=cape]');
    await a.click('#joinSubmit'); await wait(1000);
    const look = (await seen(b, 'Alice')).look;
    t.check(look.head === 'crown' && look.body === 'cape', 'modification du personnage vue par les autres');
    // Pas de changement de pseudo une fois dans l'espace : champ verrouillé, et ignoré même forcé
    await a.click('#mePill'); await wait(500); await a.click('#phone .ph-full'); await wait(300);
    t.check(await a.$eval('#nameInput', (e) => e.readOnly && e.value === 'Alice'), 'écran du personnage en session : pseudo verrouillé');
    await a.$eval('#nameInput', (e) => { e.readOnly = false; e.value = 'Zoé'; });
    await a.click('#joinSubmit'); await wait(1000);
    t.check(await a.evaluate(() => rt.me.name) === 'Alice' && !!(await seen(b, 'Alice')), 'pseudo inchangé même en contournant le verrou');
    // Aide réaffichée depuis l'écran du personnage, puis fermée avec la croix
    await a.click('#mePill'); await wait(500); await a.click('#phone .ph-full'); await wait(300);
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
    await a.evaluate(() => rt.openChat('global'));
    await wait(500);
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
    t.check(await a.$eval('#messages', (e) => !e.innerText.includes('/diag')), '/diag n\'est pas envoyé comme message');
    await a.click('#mePill'); await wait(500); await a.click('#phone .ph-full'); await wait(300);
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
    await a.click('#phoneBtn'); await wait(500); await a.click('#phone .ph-nav-settings');
    await a.click('#phone .ph-pip');
    t.check(await a.evaluate(() => rt.pipOn && JSON.parse(localStorage.getItem('rt-prefs')).pipAuto === true), 'activable dans les réglages du téléphone, mémorisé');
    await a.click('#phone .ph-pip');
    t.check(await a.evaluate(() => !rt.pipOn && JSON.parse(localStorage.getItem('rt-prefs')).pipAuto === false), 'puis désactivable');
    // Partage d'écran suivi en grand : onglet quitté, la vue montre le partage et non la carte
    await a.click('#phone .ph-close').catch(() => {});
    await a.keyboard.press('Escape');
    await place(a, 10, 8); await place(b, 9, 8);
    await wait(600);
    await b.click('#shareBtn');
    await a.waitForFunction(() => !document.querySelector('#focus').hidden, { timeout: 10000 });
    await a.keyboard.press('KeyP');
    await a.waitForFunction(() => documentPictureInPicture.window, { timeout: 5000 });
    await wait(500);
    const pipView = () => a.evaluate(() => {
      const d = documentPictureInPicture.window.document, v = d.querySelector('video');
      return { video: v.style.display !== 'none' && v.videoWidth > 0, map: d.querySelector('canvas').style.display !== 'none', label: d.querySelector('div').textContent };
    });
    t.check((await pipView()).map, 'partage en grand, onglet visible : la vue garde la carte');
    const away = await a.browserContext().newPage();
    await away.bringToFront();
    await a.waitForFunction(() => document.hidden, { timeout: 5000 });
    await wait(2500);
    const pv = await pipView();
    t.check(pv.video && !pv.map && pv.label.includes('Bob'), 'onglet quitté : la vue montre le partage suivi en grand');
    await a.bringToFront();
    await away.close();
    await wait(500);
    t.check((await pipView()).map, 'retour sur l\'onglet : la carte revient dans la vue');
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
