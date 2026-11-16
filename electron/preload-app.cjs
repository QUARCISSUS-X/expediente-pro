// Puente entre cada pestaña (la interfaz web) y la ventana de escritorio. Ver src/ui/escritorio.ts.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('expedienteEscritorio', {
  proyectoAbierto: (info) => ipcRenderer.send('ep:proyecto', info),
  enfocarSiAbierto: (id) => ipcRenderer.invoke('ep:enfocar-si-abierto', id),
  abrirEnPestanaNueva: (id) => ipcRenderer.send('ep:abrir-pestana', id),
  proyectoEliminado: (id) => ipcRenderer.send('ep:eliminado', id),
  // 2.12: archivos en carpetas del usuario (el proceso principal solo acepta rutas elegidas en un diálogo o abiertas con doble clic)
  archivos: {
    guardarComo: (sugerido, filtros) => ipcRenderer.invoke('ep:archivo-guardar-como', sugerido, filtros),
    abrir: (filtros) => ipcRenderer.invoke('ep:archivo-abrir', filtros),
    leer: (ruta) => ipcRenderer.invoke('ep:archivo-leer', ruta),
    escribir: (ruta, datos) => ipcRenderer.invoke('ep:archivo-escribir', ruta, datos),
    info: (ruta) => ipcRenderer.invoke('ep:archivo-info', ruta),
  },
});
