// Page du téléphone : la messagerie vocale (messages reçus après un appel manqué).
import { dropVmail, vmails } from '../call.js';
import { ofName } from '../dom.js';
import { renderPhone } from '../phone.js';
import { btn, el } from './ui.js';

// Un message de la messagerie vocale : lecture / pause, suppression
function vmailRow(m) {
  const row = el('div', 'ph-item ph-vmail'), info = el('div', 'ph-info');
  const hour = m.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  info.append(el('b', '', m.name), el('small', '', hour));
  m.audio ??= Object.assign(new Audio(m.url), { onplay: renderPhone, onpause: renderPhone, onended: renderPhone });
  const playing = !m.audio.paused && !m.audio.ended;
  const play = btn('ph-mini', playing ? 'pause' : 'play', '', () => (playing ? m.audio.pause() : m.audio.play().catch(() => {})));
  play.title = playing ? 'Pause' : `Écouter le message ${ofName(m.name)}`;
  const del = btn('ph-mini', 'trash', '', () => dropVmail(m));
  del.title = 'Supprimer';
  row.append(info, play, del, m.audio);
  return row;
}

export function vmailPage() {
  const page = el('div', 'ph-list');
  page.append(...(vmails.length ? vmails.map(vmailRow) : [el('small', 'ph-note', 'Aucun message')]));
  return page;
}
