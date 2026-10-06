// Page du téléphone : les espaces actifs et le nombre de personnes dans chacun, pour les
// administrateurs seulement (annuaire des espaces, directory.js). Un clic conduit à l'espace,
// par la porte.
import { PHONE_VIEW, ROOMS } from '../constantes.js';
import { fetchRooms, roomNote, roomsSummary } from '../directory.js';
import { phoneRefresh, togglePhone } from '../phone.js';
import { roomName } from '../rooms.js';
import { goToSpace } from '../spaces.js';
import { S } from '../state.js';
import { el } from './ui.js';

// La liste est demandée au relais en ouvrant la page, puis gardée ROOMS.keepMs : la page se
// redessine souvent (chaque arrivée, chaque message), sans refaire la demande à chaque fois
let rooms = null, askedAt = 0, loading = false;
function load() {
  loading = true;
  fetchRooms().then((list) => {
    rooms = list; askedAt = Date.now(); loading = false;
    phoneRefresh(PHONE_VIEW.SPACES);
  });
}

function spaceRow(r) {
  const row = el('div', 'ph-item ph-space'), info = el('div', 'ph-info');
  info.append(el('b', '', roomName(r.room)), el('small', '', roomNote(r)));
  if (r.room !== S.roomId) info.onclick = () => { togglePhone(false); goToSpace(r.room); };
  else row.classList.add('here');
  row.append(info);
  return row;
}

export function spacesPage() {
  const page = el('div', 'ph-list');
  if (!loading && Date.now() - askedAt > ROOMS.keepMs) load();
  if (!rooms) page.append(el('small', 'ph-note', loading ? 'Chargement…' : 'Le relais ne répond pas'));
  else page.append(el('small', 'ph-note', roomsSummary(rooms)), ...rooms.map(spaceRow));
  return page;
}
