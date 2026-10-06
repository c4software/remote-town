// Petits utilitaires d'affichage partagés par les pages du téléphone : icônes, boutons,
// portraits, et ce qui empêche d'appeler quelqu'un.
import { drawAvatar } from '../avatar.js';

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const HANDSET = '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>';
const ICONS = {
  call: svg(HANDSET),
  end: svg(`<g transform="rotate(135 12 12)">${HANDSET}</g>`),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/>'),
  send: svg('<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  play: svg('<path d="M7 4v16l13-8z"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  people: svg('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 4.5a4 4 0 0 1 0 7M19 21a7 7 0 0 0-2-4.9"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12z"/>'),
  mail: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m2 7 10 7 10-7"/>'),
  settings: svg('<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  pip: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1"/>'),
  speaker: svg('<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  walk: svg('<circle cx="13" cy="4" r="2"/><path d="m7 21 3-6 1-5-3 2v3M11 10l4 3 3 1M10 15l4 2 1 4"/>'),
  door: svg('<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14.5 12.5h0"/>'),
  ban: svg('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
};
export const el = (tag, cls, text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });
// Bouton avec icône et libellé (icônes : chaînes fixes ci-dessus)
export function btn(cls, icon, label, fn) {
  const b = Object.assign(el('button', cls), { type: 'button', onclick: fn });
  b.innerHTML = ICONS[icon] || '';
  b.append(el('span', '', label));
  return b;
}
export const miniAvatar = (look, cls) => {
  const c = Object.assign(el('canvas', cls), { width: 32, height: 40 });
  drawAvatar(c.getContext('2d'), look, 16, 37, 'down');
  return c;
};

export const volumeLabel = (v) => `${v === 0 ? '🔇' : '🔉'} ${Math.round(v * 100)} %`;
