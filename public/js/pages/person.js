// Page du téléphone : la fiche d'une personne.
import { isAdmin, kick } from '../admin.js';
import { dmKey } from '../chat.js';
import { zoneName } from '../desks.js';
import { ofName } from '../dom.js';
import { personalVolume, setPersonalVolume } from '../media.js';
import { joinFromPanel } from '../movement.js';
import { dial, openChat, togglePhone } from '../phone.js';
import { btn, el, miniAvatar, noCall } from './ui.js';

// Fiche d'une personne : l'appeler, lui écrire, la rejoindre, régler son volume pour moi
// seul, et l'expulser pour les administrateurs (jeton, admin.js)
export function personPage(u) {
  const page = el('div', 'ph-list ph-person');
  page.append(miniAvatar(u.look, 'ph-avatar'), el('div', 'ph-name', u.name), el('small', 'ph-note', zoneName(u.zone)));
  const callBtn = btn('ph-row ph-act-call', 'call', noCall(u) ? `Appeler (${noCall(u).toLowerCase()})` : 'Appeler', () => dial(u));
  callBtn.disabled = !!noCall(u);
  page.append(
    callBtn,
    btn('ph-row ph-act-msg', 'chat', 'Message', () => openChat(dmKey(u))),
    btn('ph-row ph-act-join', 'walk', 'Rejoindre', () => joinFromPanel(u.id)),
    el('div', 'ph-title', `Volume ${ofName(u.name)}`),
  );
  const row = el('div', 'ph-vol'), mute = Object.assign(el('button', 'ph-mini'), { type: 'button' });
  const range = Object.assign(el('input', ''), { type: 'range', min: 0, max: 100, step: 5 });
  range.setAttribute('aria-label', `Volume ${ofName(u.name)}`);
  const pct = el('span', '');
  let before = personalVolume(u) || 1; // volume rétabli après « couper »
  const show = (v) => {
    range.value = Math.round(v * 100);
    pct.textContent = `${Math.round(v * 100)} %`;
    mute.textContent = v === 0 ? '🔇' : v < 0.5 ? '🔈' : '🔊';
    mute.title = v === 0 ? 'Rétablir le son' : 'Couper le son';
  };
  const set = (v) => { setPersonalVolume(u, v); show(v); };
  range.oninput = () => set(range.value / 100);
  mute.onclick = () => {
    const v = personalVolume(u);
    if (v > 0) { before = v; set(0); } else set(before || 1);
  };
  show(personalVolume(u));
  row.append(mute, range, pct);
  page.append(row);
  if (isAdmin()) page.append(btn('ph-row ph-kick', 'ban', `Expulser ${u.name}`, () => { togglePhone(false); kick(u); }));
  return page;
}
