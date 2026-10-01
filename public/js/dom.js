// Petits utilitaires d'interface : sélection d'élément, notifications, élision du français.
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
