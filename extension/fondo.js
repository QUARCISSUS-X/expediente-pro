// Fondo de la extensión: abre Expediente Pro en una pestaña al pulsar su botón o al instalarla.
const api = globalThis.browser ?? globalThis.chrome;
const abrir = () => api.tabs.create({ url: api.runtime.getURL('index.html') });
api.action.onClicked.addListener(abrir);
api.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') abrir();
});
