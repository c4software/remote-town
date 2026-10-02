// Petits utilitaires d'interface : sélection d'élément, notifications, élision du français.
import { S } from './state.js';

export const $ = (s) => document.querySelector(s);

// « d'Alice », « de Bob »
export const ofName = (name) => (/^[aeiouyhàâéèêëîïôöùûü]/i.test(name) ? `d'${name}` : `de ${name}`);

export function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3500);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}
export const typing = () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

// Mode débogage (?debug : window.rt, ?net=…) : en local (serveur des tests), ou sur le site
// publié seulement avec un jeton d'administration vérifié (S.isAdmin, admin.js) : il permet
// de se téléporter, de changer de relais…
export const debugMode = () => new URLSearchParams(location.search).has('debug')
  && (['localhost', '127.0.0.1'].includes(location.hostname) || S.isAdmin);

// Pseudo nettoyé (saisi, ou reçu d'un autre participant) : sans caractères invisibles ni de
// contrôle (qui permettraient « Alice » + caractère invisible), tous les blancs (insécables…)
// ramenés à une espace simple, sans espace en trop ni au début ni à la fin, 24 caractères.
export const cleanName = (n) => String(n ?? '')
  .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g, '')
  .replace(/\s+/g, ' ').trim().slice(0, 24).trim();

// Deux pseudos identiques, sans tenir compte de la casse (après nettoyage)
export const sameName = (a, b) => cleanName(a).toLocaleLowerCase('fr') === cleanName(b).toLocaleLowerCase('fr');
