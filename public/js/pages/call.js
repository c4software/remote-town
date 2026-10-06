// Page du téléphone : l'écran de l'appel (ça sonne, en ligne, pas de réponse, message vocal).
// La logique des appels est dans ../call.js.
import { accept, call, endCall, hangUp, record, sendRecording } from '../call.js';
import { CALL, CALL_PHASE } from '../constantes.js';
import { pushState } from '../media.js';
import { renderPhone } from '../phone.js';
import { S, users } from '../state.js';
import { btn, el, miniAvatar } from './ui.js';
import { phoneQuietIn } from '../world.js';

const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
export const statusText = () => ({
  [CALL_PHASE.OUT]: 'Appel en cours…',
  [CALL_PHASE.IN]: 'Appel entrant…',
  [CALL_PHASE.ON]: `En ligne · ${clock(performance.now() - call.since)}`,
  [CALL_PHASE.AWAY]: call.why,
  [CALL_PHASE.REC]: 'Message vocal…',
}[call.phase]);

// Haut-parleur : la conversation s'entend autour de moi (règle speakerHolder de world.js)
function toggleSpeaker() {
  S.me.speaker = !S.me.speaker;
  pushState();
  renderPhone();
}

export function callScreen() {
  const body = el('div', `ph-body ph-${call.phase}`), screen = el('div', 'ph-screen'), actions = el('div', 'ph-actions');
  const peer = users.get(call.peer);
  if (peer?.look) screen.append(miniAvatar(peer.look, 'ph-avatar'));
  screen.append(el('div', 'ph-name', call.name), el('div', 'ph-status', statusText()));
  if ([CALL_PHASE.IN, CALL_PHASE.OUT].includes(call.phase) && phoneQuietIn(S.me.zone)) screen.append(el('small', 'ph-silent', '🔕 En silencieux dans cette salle'));
  if (call.phase === CALL_PHASE.ON) {
    const quiet = phoneQuietIn(S.me.zone);
    screen.append(el('small', '', S.me.speaker ? 'Haut-parleur : les personnes proches entendent l\'appel'
      : quiet ? 'Votre micro est ouvert pour cette personne · pas de haut-parleur dans cette salle' : 'Votre micro est ouvert pour cette personne'));
    if (peer?.speaker) screen.append(el('small', 'ph-warn', `🔊 Haut-parleur activé chez ${call.name}`));
  }
  if (call.phase === CALL_PHASE.REC) {
    const bar = el('div', 'ph-bar');
    bar.style.animationDuration = `${CALL.vmailMs}ms`;
    screen.append(bar);
  }
  if (call.phase === CALL_PHASE.IN) actions.append(btn('ph-end', 'end', 'Refuser', hangUp), btn('ph-accept', 'call', 'Décrocher', accept));
  if (call.phase === CALL_PHASE.OUT) actions.append(btn('ph-end', 'end', 'Annuler', hangUp));
  if (call.phase === CALL_PHASE.ON) {
    const spk = btn(`ph-ghost ph-spk${S.me.speaker ? ' sel' : ''}`, 'speaker', 'Haut-parleur', toggleSpeaker);
    spk.disabled = phoneQuietIn(S.me.zone); // salle de classe : l'appel reste privé
    actions.append(spk, btn('ph-end', 'end', 'Raccrocher', hangUp));
  }
  if (call.phase === CALL_PHASE.AWAY) actions.append(btn('ph-ghost', 'close', 'Fermer', endCall), btn('ph-accept ph-record', 'mic', 'Message', record));
  if (call.phase === CALL_PHASE.REC) actions.append(btn('ph-ghost', 'close', 'Annuler', endCall), btn('ph-accept ph-send', 'send', 'Envoyer', sendRecording));
  body.append(screen, actions);
  return body;
}
