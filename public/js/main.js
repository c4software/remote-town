// Point d'entrée : branche les événements de chaque module, dans l'ordre.
// Les modules ne font rien au chargement (hormis déclarer constantes et fonctions) :
// tout ce qui touche à la page est dans leur fonction init…(), appelée ici.
import { initAdmin } from './admin.js';
import { initBoard } from './board.js';
import { initChat } from './chat.js';
import { initDebug } from './debug.js';
import { initDesks } from './desks.js';
import { initDiag } from './diag.js';
import { initDirectory } from './directory.js';
import { initEmotes } from './emotes.js';
import { initHud } from './hud.js';
import { initInput } from './input.js';
import { initPanel } from './panel.js';
import { initPhone } from './phone.js';
import { initPip } from './pip.js';
import { initProfile } from './profile.js';
import { initSpaces } from './spaces.js';
import { initTeacher } from './teacher.js';
import { initVideos } from './videos.js';

initProfile(); // écran de connexion : la connexion démarre quand on le valide
initHud();
initPanel();
initChat();
initBoard();
initVideos();
initInput();
initEmotes();
initSpaces();
initDesks();
initPip();
initPhone();
initTeacher();
initDiag();
initDirectory();
initAdmin();
initDebug(); // en local ; sur le site publié, après vérification du jeton (admin.js)
