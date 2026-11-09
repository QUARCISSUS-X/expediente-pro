// Puente entre cada pestaña (la interfaz web) y la ventana de escritorio. Ver src/ui/escritorio.ts.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('expedienteEscritorio', {
  proyectoAbierto: (info) => ipcRenderer.send('ep:proyecto', info),
  enfocarSiAbierto: (id) => ipcRenderer.invoke('ep:enfocar-si-abierto', id),
  abrirEnPestanaNueva: (id) => ipcRenderer.send('ep:abrir-pestana', id),
  proyectoEliminado: (id) => ipcRenderer.send('ep:eliminado', id),
});
