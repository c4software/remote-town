// Tests unitaires du monde (carte, zones, règles « qui entend / voit qui »).
// Lancer : npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAP, MAP_H, MAP_W, COOLER, LECTERN_SPOTS, PORTAL, PORTAL_SPOT, canCallIn, canTalkieIn, chairAt, deskLabelAt, hearsRing, ringVolume, speakerHolder, isBlocked, isOnAir, nearCooler, nearLectern, nearPortal, restSeat, sendsAudio, sendsVideo, sideBySide, zoneAt,
} from '../public/js/world.js';

let n = 0;
const at = (x, y, extra = {}) => ({ id: `u${n++}`, x, y, zone: zoneAt(x, y), ...extra });

test('les zones attendues existent', () => {
  const ids = MAP.zones.map((z) => z.id).sort();
  for (let i = 1; i <= 10; i++) assert.ok(ids.includes(`desk-${i}`), `desk-${i}`);
  assert.ok(ids.includes('main'));
  assert.ok(ids.includes('class'));
  assert.equal(zoneAt(30, 10), 'hall');
});

test('toutes les zones et toutes les chaises sont accessibles depuis le couloir', () => {
  const [sx, sy] = MAP.spawns[0];
  const seen = new Set([sy * MAP_W + sx]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * MAP_W + nx;
      if (!isBlocked(nx, ny) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  const zones = new Set([...seen].map((k) => zoneAt(k % MAP_W, Math.floor(k / MAP_W))));
  for (const z of MAP.zones) assert.ok(zones.has(z.id), `zone ${z.id} accessible`);
  for (const [k] of MAP.chairs) assert.ok(seen.has(k), `chaise ${k % MAP_W},${Math.floor(k / MAP_W)} accessible`);
  assert.ok(MAP_H > 0);
});

test('machine à eau : dans le couloir, accessible par une case voisine', () => {
  assert.ok(isBlocked(COOLER.x, COOLER.y), 'la machine occupe sa case');
  const around = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => [COOLER.x + dx, COOLER.y + dy]);
  assert.ok(around.every(([x, y]) => nearCooler(x, y)));
  assert.ok(around.some(([x, y]) => !isBlocked(x, y) && zoneAt(x, y) === 'hall'), 'une case voisine praticable, dans le couloir');
  assert.ok(!nearCooler(COOLER.x, COOLER.y) && !nearCooler(COOLER.x + 1, COOLER.y + 1) && !nearCooler(COOLER.x + 2, COOLER.y));
});

test('porte des espaces : dans le mur du couloir, la case devant est libre', () => {
  assert.ok(isBlocked(PORTAL.x, PORTAL.y), 'la porte est dans un mur');
  assert.equal(PORTAL_SPOT[1], PORTAL.y + 1);
  assert.ok(!isBlocked(...PORTAL_SPOT), 'case devant la porte praticable');
  assert.equal(zoneAt(...PORTAL_SPOT), 'hall');
  assert.ok(MAP.spawns.some(([x, y]) => x === PORTAL_SPOT[0] && y === PORTAL_SPOT[1]), 'case devant la porte reliée au couloir');
  assert.ok(nearPortal(PORTAL_SPOT[0] - 1, PORTAL_SPOT[1]) && nearPortal(PORTAL_SPOT[0] + 1, PORTAL_SPOT[1]));
  assert.ok(!nearPortal(PORTAL_SPOT[0], PORTAL_SPOT[1] + 1));
});

test('canapés : chaque case est une place assise, orientée', () => {
  for (let x = 5; x <= 8; x++) {
    assert.equal(chairAt(x, 15)?.dir, 'down', `canapé du haut, case ${x}`);
    assert.equal(chairAt(x, 19)?.dir, 'up', `canapé du bas, case ${x}`);
    assert.equal(isBlocked(x, 15), false);
  }
});

test('nom des bureaux : deux cases à l\'entrée de chaque bureau, praticables, sans chaise voisine', () => {
  const desks = MAP.zones.filter((z) => z.type === 'desk');
  assert.equal(desks.length, 10);
  for (const z of desks) {
    for (const x of [z.label.x - 1, z.label.x]) {
      assert.equal(deskLabelAt(x, z.label.y), z.id, `${z.id}, case ${x}`);
      assert.ok(!isBlocked(x, z.label.y), `${z.id} : case du nom praticable`);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(!chairAt(x + dx, z.label.y + dy), `${z.id} : pas de chaise à portée de E`);
    }
    assert.equal(deskLabelAt(z.label.x + 1, z.label.y), null);
    assert.equal(deskLabelAt(z.label.x - 2, z.label.y), null);
  }
  assert.equal(deskLabelAt(30, 10), null, 'couloir');
  assert.equal(deskLabelAt(7, 5), null, 'bureau principal');
});

test('places de repos : canapés et banc du couloir, pas les chaises', () => {
  for (let x = 5; x <= 8; x++) assert.ok(restSeat(x, 15) && restSeat(x, 19), `canapés, case ${x}`);
  for (let x = 23; x <= 25; x++) {
    assert.equal(chairAt(x, 12)?.dir, 'down', `banc, case ${x}`);
    assert.ok(restSeat(x, 12) && !isBlocked(x, 12) && zoneAt(x, 12) === 'hall');
  }
  const chair = [...MAP.chairs.values()].find((c) => c.kind === 'chair');
  assert.ok(chair && !restSeat(chair.x, chair.y), 'une chaise n\'est pas une place de repos');
  assert.ok(!restSeat(30, 10), 'une case vide non plus');
});

test('micro (M) : entendu seulement dans la même pièce', () => {
  const a = at(18, 5, { mic: true }), b = at(21, 5), c = at(27, 5);
  assert.equal(a.zone, 'desk-1');
  assert.equal(sendsAudio(a, b), true, 'même bureau');
  assert.equal(sendsAudio(a, c), false, 'bureau voisin');
  assert.equal(sendsAudio({ ...a, mic: false }, b), false, 'micro coupé');
});

test('N : à 4 cases maximum, et pas à travers les murs', () => {
  const a = at(30, 10, { ptt: true });
  assert.equal(sendsAudio(a, at(34, 10)), true, '4 cases');
  assert.equal(sendsAudio(a, at(35, 10)), false, '5 cases');
  assert.equal(sendsAudio(at(20, 9, { ptt: true }), at(20, 7)), false, 'autre zone derrière le mur');
});

test('N : pas de talkie dans la salle de classe ni au bureau principal', () => {
  const c = at(65, 10, { ptt: true }), m = at(5, 10, { ptt: true });
  assert.equal(c.zone, 'class');
  assert.equal(m.zone, 'main');
  assert.equal(canTalkieIn('class'), false);
  assert.equal(canTalkieIn('main'), false);
  assert.equal(canTalkieIn('hall'), true);
  assert.equal(canTalkieIn('desk-1'), true);
  assert.equal(sendsAudio(c, at(66, 10)), false, 'classe : N ignoré');
  assert.equal(sendsAudio(m, at(6, 10)), false, 'bureau principal : N ignoré');
  assert.equal(sendsAudio({ ...c, mic: true }, at(66, 10)), true, 'le micro (M) y marche toujours');
});

test('téléphone : on s\'entend où qu\'on soit, sauf depuis une salle de classe', () => {
  const a = at(30, 10), b = at(20, 5), c = at(31, 10);
  a.call = b.id; b.call = a.id;
  assert.equal(sendsAudio(a, b), true, 'couloir → bureau, micro coupé');
  assert.equal(sendsAudio(b, a), true, 'et dans l\'autre sens');
  assert.equal(sendsAudio(a, c), false, 'la personne d\'à côté n\'entend pas l\'appel');
  const k = at(65, 10, { call: b.id });
  assert.equal(canCallIn(k.zone), false);
  assert.equal(sendsAudio(k, b), false, 'pas de téléphone depuis la salle de classe');
});

test('sonnerie du téléphone : entendue à 4 cases, de plus en plus bas, dans la même zone', () => {
  const a = at(30, 10, { phone: 'ring' });
  assert.equal(hearsRing(a, at(34, 10)), true, '4 cases');
  assert.equal(hearsRing(a, at(35, 10)), false, '5 cases');
  assert.ok(ringVolume(a, at(31, 10)) > ringVolume(a, at(33, 10)), 'plus fort de près');
  assert.ok(ringVolume(a, at(34, 10)) > 0 && ringVolume(a, at(31, 10)) <= 0.6);
  assert.equal(hearsRing({ ...a, phone: 'call' }, at(31, 10)), false, 'en ligne : plus de sonnerie');
  assert.equal(hearsRing(at(20, 9, { phone: 'ring' }), at(20, 7)), false, 'autre zone derrière le mur');
  assert.equal(hearsRing(a, a), false, 'pas soi-même');
});

test('haut-parleur du téléphone : l\'appel s\'entend autour de la personne qui l\'active', () => {
  const a = at(30, 10), b = at(20, 5), nearA = at(32, 10), nearB = at(21, 5), far = at(45, 10);
  a.call = b.id; b.call = a.id;
  assert.equal(speakerHolder(a, b, nearA), null, 'sans haut-parleur : les voisins n\'entendent rien');
  assert.equal(sendsAudio(a, nearA), false);
  a.speaker = true;
  assert.equal(speakerHolder(a, b, nearA), a, 'sa propre voix, entendue par ses voisins');
  assert.equal(speakerHolder(b, a, nearA), a, 'la voix du correspondant sort de son téléphone');
  assert.equal(speakerHolder(b, a, far), null, 'pas plus loin que la portée');
  assert.equal(speakerHolder(b, a, nearB), null, 'les voisins du correspondant n\'entendent rien');
  assert.equal(speakerHolder(a, b, b), null, 'le correspondant est déjà en ligne');
  assert.equal(speakerHolder({ ...a, call: null }, b, nearA), null, 'hors appel : rien');
});

test('les deux grandes salles ont au moins 35 places assises', () => {
  const seats = (zone) => [...MAP.chairs.values()].filter((c) => zoneAt(c.x, c.y) === zone).length;
  assert.ok(seats('main') >= 35, `bureau principal : ${seats('main')} places`);
  assert.ok(seats('class') >= 35, `salle de classe : ${seats('class')} places`);
});

test('côte à côte dans le couloir : seulement si son micro est ouvert', () => {
  const b = at(31, 11);
  assert.equal(sideBySide(at(30, 10), b), true, 'diagonale');
  assert.equal(sendsAudio(at(30, 10, { mic: true }), b), true, 'micro ouvert');
  assert.equal(sendsAudio(at(30, 10, { mic: false }), b), false, 'micro coupé : personne ne vous entend');
  assert.equal(sendsAudio(at(30, 10, { mic: true }), at(32, 10)), false, 'à 2 cases');
  assert.equal(sideBySide(at(18, 3), at(18, 4)), false, 'pas dans les pièces');
});

test('pupitre : diffusion à tout le monde, vérifiée par la position', () => {
  const [x, y] = LECTERN_SPOTS[0];
  const speaker = at(x, y, { onAir: true });
  assert.equal(isOnAir(speaker), true);
  assert.equal(sendsAudio(speaker, at(66, 10)), true, 'entendu jusque dans la classe');
  assert.equal(isOnAir(at(5, 9, { onAir: true })), false, 'en direct annoncé hors du pupitre : ignoré');
  assert.ok(nearLectern(x, y + 2));
});

test('partage d\'écran : même pièce, ou tout le monde depuis le pupitre', () => {
  const a = at(18, 5, { sharing: true });
  assert.equal(sendsVideo(a, at(21, 5)), true);
  assert.equal(sendsVideo(a, at(30, 10)), false);
  assert.equal(sendsVideo(at(30, 10, { sharing: true }), at(31, 10)), false, 'pas de partage dans le couloir');
  const [x, y] = LECTERN_SPOTS[1];
  assert.equal(sendsVideo(at(x, y, { onAir: true, sharing: true }), at(66, 10)), true);
});
