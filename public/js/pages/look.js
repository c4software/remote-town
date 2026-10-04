// Page du téléphone : mon personnage.
import { BODY_OPTIONS, HEAD_OPTIONS, PALETTE, STYLES } from '../constantes.js';
import { renderPhone, togglePhone } from '../phone.js';
import { openProfile, setLook } from '../profile.js';
import { S } from '../state.js';
import { btn, el, miniAvatar } from './ui.js';

// Mon personnage : style, couleurs et accessoires, appliqués tout de suite et vus des autres
// (pas le nom). Mêmes listes que l'écran du personnage : STYLES, HEAD_OPTIONS, BODY_OPTIONS (avatar.js).
export function lookPage() {
  const page = el('div', 'ph-list ph-look'), look = S.me.look;
  const pick = (part, v) => () => { setLook(part, v); renderPhone(); };
  // Le nom est affiché, pas modifiable ici : on ne change pas d'identité depuis le téléphone
  page.append(miniAvatar(look, 'ph-avatar'), el('div', 'ph-name', S.me.name));
  // Style et accessoires : listes déroulantes (une trentaine de choix, à l'étroit en puces)
  const select = (title, part, options) => {
    const sel = el('select', 'ph-select');
    sel.dataset.part = part;
    sel.setAttribute('aria-label', title);
    for (const [v, label] of options) sel.append(Object.assign(el('option', '', label), { value: v ?? '', selected: look[part] === v }));
    sel.onchange = () => { setLook(part, sel.value || null); renderPhone(); };
    page.append(el('div', 'ph-title', title), sel);
  };
  const swatches = (title, part) => {
    const box = el('div', 'ph-chips');
    box.dataset.part = part;
    for (const c of PALETTE[part]) {
      const b = Object.assign(el('button', `ph-sw${look[part] === c ? ' sel' : ''}`), { type: 'button', title: c, onclick: pick(part, c) });
      b.style.background = c;
      box.append(b);
    }
    page.append(el('div', 'ph-title', title), box);
  };
  const options = (list) => list.map((o) => [o.id, o.label]);
  select('Style', 'style', options(STYLES));
  swatches('Haut', 'shirt'); swatches('Cheveux', 'hair'); swatches('Peau', 'skin');
  select('Tête', 'head', [[null, 'Aucun'], ...options(HEAD_OPTIONS)]);
  select('Corps', 'body', [[null, 'Aucun'], ...options(BODY_OPTIONS)]);
  page.append(btn('ph-row ph-full', 'user', 'Écran complet (micro…)', () => { togglePhone(false); openProfile(); }));
  return page;
}
