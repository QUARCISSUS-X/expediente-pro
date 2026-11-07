// Puente de la barra de pestañas (pestanas.html) con la ventana.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('barra', {
  alEstado: (cb) => ipcRenderer.on('barra:estado', (_e, estado) => cb(estado)),
  pedirEstado: () => ipcRenderer.send('barra:lista'),
  seleccionar: (id) => ipcRenderer.send('barra:seleccionar', id),
  cerrar: (id) => ipcRenderer.send('barra:cerrar', id),
  nueva: (pos) => ipcRenderer.send('barra:nueva', pos),
  mover: (id, indice) => ipcRenderer.send('barra:mover', { id, indice }),
});
