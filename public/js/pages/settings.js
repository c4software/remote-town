// Page du téléphone : les réglages.
import { ring, setCustomRing, stopRing } from '../audio.js';
import { call } from '../call.js';
import { RING_FILE_MAX, RING_STYLES } from '../constantes.js';
import { toast } from '../dom.js';
import { pushState } from '../media.js';
import { renderPhone } from '../phone.js';
import { setPipOn } from '../pip.js';
import { savePrefs } from '../profile.js';
import { nearbyRing } from '../ring.js';
import { S } from '../state.js';
import { btn, el } from './ui.js';

// Réglages : sonnerie (motifs, ou un fichier audio à soi), « Ne pas déranger », incrustation
let previewTimer = null;
// Un appel arrive : l'écoute d'une sonnerie n'a plus à s'arrêter d'elle-même
export const stopPreview = () => clearTimeout(previewTimer);
function previewRing() {
  if (call) return;
  ring('in', false);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { if (!call) stopRing(); }, 6000);
}
function pickRing(id) {
  if (id !== 'file') { S.ring = id; savePrefs(); pushState(); previewRing(); return renderPhone(); }
  const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'audio/*' });
  file.onchange = () => {
    const f = file.files[0];
    if (!f) return;
    if (!f.type.startsWith('audio/') || f.size > RING_FILE_MAX) return toast(`Sonnerie : un fichier audio de ${RING_FILE_MAX / 1000} Ko au plus.`);
    const reader = new FileReader();
    reader.onload = () => {
      if (!setCustomRing(reader.result)) return toast('Sonnerie : impossible de garder ce fichier dans le navigateur.');
      S.ring = 'file';
      savePrefs(); pushState(); previewRing(); renderPhone();
    };
    reader.readAsDataURL(f);
  };
  file.click();
}
export function settingsPage() {
  const page = el('div', 'ph-list');
  page.append(el('div', 'ph-title', 'Sonnerie'));
  for (const r of RING_STYLES) {
    const b = btn(`ph-row ph-ring${S.ring === r.id ? ' sel' : ''}`, S.ring === r.id ? 'check' : '', r.label, () => pickRing(r.id));
    b.dataset.ring = r.id;
    page.append(b);
  }
  const others = btn(`ph-row ph-others${S.otherRings ? ' sel' : ''}`, S.otherRings ? 'check' : '', 'Sonneries personnelles des autres', () => { S.otherRings = !S.otherRings; savePrefs(); nearbyRing(); renderPhone(); });
  others.title = 'Entendre le fichier audio choisi par les personnes proches (sinon : la sonnerie par défaut)';
  others.setAttribute('aria-pressed', S.otherRings);
  page.append(others);
  page.append(el('div', 'ph-title', 'Appels'));
  const dnd = btn(`ph-row ph-dnd${S.dnd ? ' sel' : ''}`, 'moon', 'Ne pas déranger', () => { S.dnd = !S.dnd; savePrefs(); renderPhone(); });
  dnd.title = 'Les appels vont directement à la messagerie';
  dnd.setAttribute('aria-pressed', S.dnd);
  page.append(dnd);
  // Vue en incrustation (pip.js) : proposée seulement si le navigateur sait l'afficher
  if ('documentPictureInPicture' in window) {
    page.append(el('div', 'ph-title', 'Affichage'));
    const pip = btn(`ph-row ph-pip${S.pipOn ? ' sel' : ''}`, 'pip', 'Incrustation (onglet caché)', () => { setPipOn(!S.pipOn); savePrefs(); renderPhone(); });
    pip.title = 'Petite vue autour de son personnage, ouverte en changeant d\'onglet (aussi avec P)';
    pip.setAttribute('aria-pressed', S.pipOn);
    page.append(pip);
  }
  return page;
}
