// Tests unitaires du monde (carte, zones, règles « qui entend / voit qui »).
// Lancer : npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAP, MAP_H, MAP_W, LECTERN_SPOTS, isBlocked, isOnAir, nearLectern, sendsAudio, sendsVideo, sideBySide, zoneAt,
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
