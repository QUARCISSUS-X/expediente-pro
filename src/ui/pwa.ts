// Web instalable (PWA): registra el service worker (public/sw.js) solo cuando la página se sirve por http(s).
// En la app de escritorio (app://) y en la extensión del navegador no hace nada.
export function registrarPwa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol) || location.hostname === 'localhost' && import.meta.env?.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
