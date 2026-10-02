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
