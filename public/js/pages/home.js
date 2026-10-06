// Page du téléphone : l'accueil, qui mène aux autres pages.
import { vmails } from '../call.js';
import { unreadTotal } from '../chat.js';
import { PHONE_VIEW } from '../constantes.js';
import { canListRooms } from '../directory.js';
import { go } from '../phone.js';
import { S, users } from '../state.js';
import { btn, el } from './ui.js';

export function homePage() {
  const page = el('div', 'ph-list');
  const others = users.size - 1, unread = unreadTotal();
  const row = (cls, icon, label, count, v) => {
    const b = btn(`ph-row ${cls}`, icon, label, go(v));
    if (count) b.append(el('i', 'badge', count));
    return b;
  };
  page.append(
    row('ph-nav-contacts', 'people', `Contacts${others > 0 ? ` (${others})` : ''}`, 0, PHONE_VIEW.CONTACTS),
    row('ph-nav-chats', 'chat', 'Messages', unread, PHONE_VIEW.CHATS),
    row('ph-nav-vmail', 'mail', 'Messagerie vocale', vmails.length, PHONE_VIEW.VMAIL),
    row('ph-nav-profile', 'user', 'Mon personnage', 0, PHONE_VIEW.LOOK),
    row('ph-nav-settings', 'settings', 'Réglages', 0, PHONE_VIEW.SETTINGS),
  );
  // Administrateurs : les espaces actifs et le nombre de personnes (annuaire des espaces)
  if (canListRooms()) page.append(row('ph-nav-spaces', 'door', 'Espaces actifs', 0, PHONE_VIEW.SPACES));
  if (S.dnd) page.append(el('small', 'ph-note', '🌙 Ne pas déranger : les appels vont à la messagerie'));
  return page;
}
