// Page du téléphone : les contacts, c'est-à-dire les autres personnes de l'espace.
import { zoneName } from '../desks.js';
import { personalVolume } from '../media.js';
import { isTransmitting } from '../panel.js';
import { dial, openPerson } from '../phone.js';
import { users } from '../state.js';
import { btn, el, miniAvatar, volumeLabel } from './ui.js';

// Une personne des contacts : un clic ouvre sa fiche, le combiné l'appelle
function contactRow(u) {
  const row = el('div', 'ph-item ph-contact'), info = el('div', 'ph-info');
  row.dataset.id = u.id;
  const marks = [u.hand && '✋', u.phone && '📞', isTransmitting(u) && '🎙️', u.sharing && '🖥️',
    u.link === 'relay' && 'relais', personalVolume(u) < 1 && volumeLabel(personalVolume(u))].filter(Boolean).join(' ');
  info.append(el('b', '', u.name), el('small', '', [zoneName(u.zone), marks].filter(Boolean).join(' · ')));
  info.onclick = () => openPerson(u.id);
  const b = btn('ph-mini ph-dial', 'call', '', () => dial(u));
  b.title = `Appeler ${u.name}`;
  row.append(miniAvatar(u.look, 'ph-face'), info, b);
  return row;
}

export function contactsPage() {
  const page = el('div', 'ph-list');
  const others = [...users.values()].filter((u) => !u.isMe).sort((a, b) => a.name.localeCompare(b.name));
  page.append(...(others.length ? others.map(contactRow) : [el('small', 'ph-note', 'Personne d\'autre dans cet espace')]));
  return page;
}
