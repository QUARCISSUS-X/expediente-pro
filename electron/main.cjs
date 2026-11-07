// Expediente Pro – app de escritorio (Electron).
// Una ventana con pestañas de proyectos arriba; cada pestaña es la misma interfaz web (dist/index.html)
// con su propio proyecto. Los módulos, archivos y pestañas también están en el menú, con atajos de teclado.
'use strict';

const { app, BrowserWindow, WebContentsView, Menu, ipcMain, protocol, dialog, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ALTO_BARRA = 38; // alto de la barra de pestañas, en px
const ORIGEN = 'app://expediente';
const RAIZ = path.join(__dirname, '..');
const URL_DEV = process.env.EXPEDIENTE_URL || ''; // p. ej. http://localhost:5173/ con «npm run dev»
const FONDO = '#20262a';
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const MODULOS = [
  ['proyectos', 'Panel de proyectos', 'CmdOrCtrl+1'],
  ['proyecto', 'Configuración general', 'CmdOrCtrl+2'],
  ['tdr', 'Términos de referencia', 'CmdOrCtrl+3'],
  null,
  ['presupuesto', 'Presupuesto, APU y metrados', 'CmdOrCtrl+4'],
  ['insumos', 'Relación de insumos', 'CmdOrCtrl+5'],
  ['gg', 'Gastos generales', 'CmdOrCtrl+6'],
  ['polinomica', 'Fórmula polinómica', 'CmdOrCtrl+7'],
  null,
  ['programa', 'Cronograma de ejecución', 'CmdOrCtrl+8'],
  ['cronogramas', 'Valorizado y calendarios', 'CmdOrCtrl+9'],
  null,
  ['documentos', 'Documentos', 'CmdOrCtrl+D'],
  ['validacion', 'Validación', 'F7'],
  ['exportar', 'Exportar entregables', 'CmdOrCtrl+E'],
];

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/** @type {BrowserWindow | null} */
let ventana = null;
/** @type {{ id: number, vista: WebContentsView, info: null | { id: string, nombre: string, codigo: string, guardando: boolean } }[]} */
const pestanas = [];
let activa = 0;
let sigId = 1;
let cerrando = false;
const cerradas = []; // proyectos de pestañas cerradas (para reabrirlas con Ctrl+Shift+T)

// ------------------------------------------------------------------ sesión (pestañas y tamaño de la ventana)

const archivoSesion = () => path.join(app.getPath('userData'), 'sesion.json');

function leerSesion() {
  try {
    return JSON.parse(fs.readFileSync(archivoSesion(), 'utf8'));
  } catch {
    return {};
  }
}

function guardarSesion() {
  if (!ventana || ventana.isDestroyed()) return;
  const abiertos = pestanas.filter((p) => p.info).map((p) => p.info.id);
  const act = pestanas.find((p) => p.id === activa);
  const datos = {
    pestanas: abiertos,
    activa: act && act.info ? act.info.id : null,
    ventana: { limites: ventana.getNormalBounds(), maximizada: ventana.isMaximized() },
  };
  try {
    fs.mkdirSync(path.dirname(archivoSesion()), { recursive: true });
    fs.writeFileSync(archivoSesion(), JSON.stringify(datos, null, 1));
  } catch {
    /* sin sesión guardada: se abre como la primera vez */
  }
}

// ------------------------------------------------------------------ pestañas

const urlApp = (consulta = '') => (URL_DEV ? URL_DEV.replace(/\/?$/, '/') : `${ORIGEN}/index.html`) + consulta;
const pestanaDe = (wc) => pestanas.find((p) => p.vista.webContents === wc);
const pestanaActiva = () => pestanas.find((p) => p.id === activa);
const consultaProyecto = (id) => `?proyecto=${encodeURIComponent(id)}`;
const deNuestraApp = (url) => url.startsWith(ORIGEN) || (!!URL_DEV && url.startsWith(URL_DEV));

function crearPestana(consulta = '', activar = true) {
  const vista = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-app.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  vista.setBackgroundColor('#edefeb');
  const p = { id: sigId++, vista, info: null };
  pestanas.push(p);
  ventana.contentView.addChildView(vista);
  const wc = vista.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (deNuestraApp(url)) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
  wc.on('render-process-gone', (_e, d) => {
    if (!cerrando && d.reason !== 'clean-exit') wc.reload();
  });
  void wc.loadURL(urlApp(consulta));
  ubicar();
  if (activar) activarPestana(p.id);
  else vista.setVisible(false);
  enviarEstado();
  return p;
}

function activarPestana(id) {
  const p = pestanas.find((x) => x.id === id);
  if (!p) return;
  activa = id;
  for (const x of pestanas) x.vista.setVisible(x.id === id);
  p.vista.webContents.focus();
  actualizarTitulo();
  enviarEstado();
  guardarSesion();
}

function guardarPestana(p) {
  const espera = new Promise((res) => setTimeout(res, 3000));
  const guardar = p.vista.webContents
    .executeJavaScript('window.__expedientePro ? window.__expedientePro.guardarYa() : null')
    .catch(() => null);
  return Promise.race([guardar, espera]);
}

async function cerrarPestana(id, { guardar = true } = {}) {
  const p = pestanas.find((x) => x.id === id);
  if (!p) return;
  if (pestanas.length === 1) {
    ventana.close(); // cerrar la última pestaña cierra la ventana (y guarda)
    return;
  }
  if (guardar) await guardarPestana(p);
  const i = pestanas.indexOf(p);
  if (i < 0) return;
  pestanas.splice(i, 1);
  if (guardar && p.info) cerradas.push(p.info.id);
  ventana.contentView.removeChildView(p.vista);
  p.vista.webContents.close();
  if (activa === id) activarPestana(pestanas[Math.min(i, pestanas.length - 1)].id);
  enviarEstado();
  guardarSesion();
}

function moverPestana(id, indice) {
  const i = pestanas.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [p] = pestanas.splice(i, 1);
  pestanas.splice(Math.max(0, Math.min(indice, pestanas.length)), 0, p);
  enviarEstado();
  guardarSesion();
}

function saltar(delta) {
  if (pestanas.length < 2) return;
  const i = pestanas.findIndex((x) => x.id === activa);
  activarPestana(pestanas[(i + delta + pestanas.length) % pestanas.length].id);
}

function abrirProyectoEnPestana(proyectoId) {
  const ya = pestanas.find((x) => x.info && x.info.id === proyectoId);
  if (ya) activarPestana(ya.id);
  else crearPestana(consultaProyecto(proyectoId));
}

function reabrirCerrada() {
  while (cerradas.length) {
    const id = cerradas.pop();
    if (!pestanas.some((x) => x.info && x.info.id === id)) return void crearPestana(consultaProyecto(id));
  }
}

function ubicar() {
  if (!ventana) return;
  const { width, height } = ventana.getContentBounds();
  for (const p of pestanas) p.vista.setBounds({ x: 0, y: ALTO_BARRA, width, height: Math.max(0, height - ALTO_BARRA) });
}

function enviarEstado() {
  if (!ventana || ventana.isDestroyed()) return;
  ventana.webContents.send('barra:estado', {
    activa,
    pestanas: pestanas.map((p) => ({
      id: p.id,
      nombre: p.info ? p.info.nombre : 'Abriendo…',
      codigo: p.info ? p.info.codigo : '',
      guardando: !!(p.info && p.info.guardando),
    })),
  });
}

function actualizarTitulo() {
  const p = pestanaActiva();
  if (ventana && !ventana.isDestroyed()) ventana.setTitle(p && p.info ? `${p.info.codigo ? `${p.info.codigo} · ` : ''}${p.info.nombre} — Expediente Pro` : 'Expediente Pro');
}

/** Envía un comando del menú a la pestaña activa, con gesto de usuario (para que pueda abrir selectores de archivos). */
function comando(c) {
  const p = pestanaActiva();
  if (!p) return;
  void p.vista.webContents
    .executeJavaScript(`window.__expedientePro && window.__expedientePro.comando(${JSON.stringify(c)})`, true)
    .catch(() => null);
}

async function listarProyectos() {
  const p = pestanaActiva() || pestanas[0];
  if (!p) return [];
  try {
    const l = await p.vista.webContents.executeJavaScript('window.__expedientePro ? window.__expedientePro.listar() : []');
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

const etiquetaMenu = (t) => String(t).replace(/&/g, '&&');

async function menuNuevaPestana(pos) {
  const abiertos = new Map(pestanas.filter((p) => p.info).map((p) => [p.info.id, p.id]));
  const lista = (await listarProyectos())
    .filter((x) => !x.archivado)
    .sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)))
    .slice(0, 20);
  const guardados = lista.map((x) => ({
    label: etiquetaMenu(`${x.codigo ? `${x.codigo} · ` : ''}${x.nombre}${abiertos.has(x.id) ? '   (abierto)' : ''}`),
    click: () => abrirProyectoEnPestana(x.id),
  }));
  const menu = Menu.buildFromTemplate([
    { label: 'Proyecto en blanco', click: () => crearPestana('?nuevo=blanco') },
    { label: 'Proyecto desde el ejemplo', click: () => crearPestana('?nuevo=ejemplo') },
    { type: 'separator' },
    { label: 'Abrir proyecto guardado', submenu: guardados.length ? guardados : [{ label: '(no hay proyectos guardados)', enabled: false }] },
    { label: 'Ir al panel de proyectos', click: () => comando({ tipo: 'ir', modulo: 'proyectos' }) },
  ]);
  menu.popup(pos ? { window: ventana, x: Math.round(pos.x), y: Math.round(pos.y) } : { window: ventana });
}

// ------------------------------------------------------------------ mensajes de las páginas

ipcMain.on('ep:proyecto', (e, info) => {
  const p = pestanaDe(e.sender);
  if (!p || !info || typeof info.id !== 'string') return;
  // el mismo proyecto no se edita en dos pestañas: se activa la que ya lo tenía y se cierra esta
  const otra = pestanas.find((x) => x !== p && x.info && x.info.id === info.id);
  if (otra) {
    activarPestana(otra.id);
    if (pestanas.length > 1) void cerrarPestana(p.id, { guardar: false });
    return;
  }
  p.info = { id: info.id, nombre: String(info.nombre || 'Proyecto'), codigo: String(info.codigo || ''), guardando: !!info.guardando };
  if (p.id === activa) actualizarTitulo();
  enviarEstado();
  guardarSesion();
});

ipcMain.handle('ep:enfocar-si-abierto', (e, id) => {
  const otra = pestanas.find((x) => x.vista.webContents !== e.sender && x.info && x.info.id === id);
  if (otra) activarPestana(otra.id);
  return !!otra;
});

ipcMain.on('ep:abrir-pestana', (_e, id) => {
  if (typeof id === 'string') abrirProyectoEnPestana(id);
});

ipcMain.on('ep:eliminado', (e, id) => {
  // sin guardar: guardar volvería a crear el proyecto eliminado
  for (const p of pestanas.filter((x) => x.vista.webContents !== e.sender && x.info && x.info.id === id)) void cerrarPestana(p.id, { guardar: false });
});

ipcMain.on('barra:lista', () => enviarEstado());
ipcMain.on('barra:seleccionar', (_e, id) => activarPestana(id));
ipcMain.on('barra:cerrar', (_e, id) => void cerrarPestana(id));
ipcMain.on('barra:nueva', (_e, pos) => void menuNuevaPestana(pos));
ipcMain.on('barra:mover', (_e, d) => d && moverPestana(d.id, d.indice));

// ------------------------------------------------------------------ menú de la ventana

function construirMenu() {
  const wcActiva = () => {
    const p = pestanaActiva();
    return p ? p.vista.webContents : null;
  };
  const enPagina = (accion) => () => {
    const wc = wcActiva();
    if (wc) wc[accion]();
  };
  const zoom = (delta) => () => {
    const wc = wcActiva();
    if (!wc) return;
    wc.setZoomLevel(delta === 0 ? 0 : Math.max(-3, Math.min(4, wc.getZoomLevel() + delta)));
  };
  // registerAccelerator:false = el atajo se muestra en el menú pero lo atiende la página (no interfiere con los campos)
  const plantilla = [
    {
      label: '&Archivo',
      submenu: [
        { label: 'Pestaña nueva…', accelerator: 'CmdOrCtrl+T', click: () => void menuNuevaPestana() },
        { label: 'Proyecto en blanco (pestaña nueva)', accelerator: 'CmdOrCtrl+N', click: () => crearPestana('?nuevo=blanco') },
        { label: 'Proyecto desde el ejemplo (pestaña nueva)', click: () => crearPestana('?nuevo=ejemplo') },
        { label: 'Importar archivos de un expediente…', accelerator: 'CmdOrCtrl+O', click: () => comando({ tipo: 'importar' }) },
        { type: 'separator' },
        { label: 'Guardar una copia (.json)', accelerator: 'CmdOrCtrl+S', registerAccelerator: false, click: () => comando({ tipo: 'guardar' }) },
        { label: 'Exportar entregables', click: () => comando({ tipo: 'ir', modulo: 'exportar' }) },
        { type: 'separator' },
        { label: 'Cerrar pestaña', accelerator: 'CmdOrCtrl+W', click: () => void cerrarPestana(activa) },
        { label: 'Salir', accelerator: 'Alt+F4', click: () => ventana && ventana.close() },
      ],
    },
    {
      label: '&Editar',
      submenu: [
        { label: 'Deshacer', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: () => comando({ tipo: 'deshacer' }) },
        { label: 'Rehacer', accelerator: 'CmdOrCtrl+Y', registerAccelerator: false, click: () => comando({ tipo: 'rehacer' }) },
        { type: 'separator' },
        { label: 'Cortar', accelerator: 'CmdOrCtrl+X', registerAccelerator: false, click: enPagina('cut') },
        { label: 'Copiar', accelerator: 'CmdOrCtrl+C', registerAccelerator: false, click: enPagina('copy') },
        { label: 'Pegar', accelerator: 'CmdOrCtrl+V', registerAccelerator: false, click: enPagina('paste') },
        { label: 'Seleccionar todo', accelerator: 'CmdOrCtrl+A', registerAccelerator: false, click: enPagina('selectAll') },
        { type: 'separator' },
        { label: 'Buscar partidas e insumos…', accelerator: 'CmdOrCtrl+F', registerAccelerator: false, click: () => comando({ tipo: 'buscar' }) },
      ],
    },
    {
      label: '&Módulos',
      submenu: MODULOS.map((m) => (m ? { label: m[1], accelerator: m[2], click: () => comando({ tipo: 'ir', modulo: m[0] }) } : { type: 'separator' })),
    },
    {
      label: '&Pestañas',
      submenu: [
        { label: 'Pestaña nueva…', accelerator: 'CmdOrCtrl+T', registerAccelerator: false, click: () => void menuNuevaPestana() },
        { label: 'Reabrir pestaña cerrada', accelerator: 'CmdOrCtrl+Shift+T', click: reabrirCerrada },
        { label: 'Cerrar pestaña', accelerator: 'CmdOrCtrl+W', registerAccelerator: false, click: () => void cerrarPestana(activa) },
        { type: 'separator' },
        { label: 'Pestaña siguiente', accelerator: 'Ctrl+Tab', click: () => saltar(1) },
        { label: 'Pestaña anterior', accelerator: 'Ctrl+Shift+Tab', click: () => saltar(-1) },
        { label: 'Pestaña siguiente', accelerator: 'Ctrl+PageDown', visible: false, click: () => saltar(1) },
        { label: 'Pestaña anterior', accelerator: 'Ctrl+PageUp', visible: false, click: () => saltar(-1) },
      ],
    },
    {
      label: '&Ver',
      submenu: [
        {
          label: 'Recargar pestaña',
          accelerator: 'CmdOrCtrl+R',
          click: async () => {
            const p = pestanaActiva();
            if (!p) return;
            await guardarPestana(p);
            p.vista.webContents.reload();
          },
        },
        { type: 'separator' },
        { label: 'Acercar', accelerator: 'CmdOrCtrl+Plus', click: zoom(0.5) },
        { label: 'Acercar', accelerator: 'CmdOrCtrl+=', visible: false, click: zoom(0.5) },
        { label: 'Alejar', accelerator: 'CmdOrCtrl+-', click: zoom(-0.5) },
        { label: 'Tamaño normal', accelerator: 'CmdOrCtrl+0', click: zoom(0) },
        { type: 'separator' },
        { label: 'Pantalla completa', accelerator: 'F11', click: () => ventana && ventana.setFullScreen(!ventana.isFullScreen()) },
        { label: 'Herramientas de desarrollo', accelerator: 'F12', click: () => { const wc = wcActiva(); if (wc) wc.openDevTools({ mode: 'detach' }); } },
      ],
    },
    {
      label: 'A&yuda',
      submenu: [
        { label: 'Atajos de teclado', click: () => comando({ tipo: 'atajos' }) },
        { label: 'Guía de uso', accelerator: 'F1', click: abrirGuia },
        { type: 'separator' },
        { label: 'Acerca de Expediente Pro', click: acercaDe },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

function abrirGuia() {
  const guia = new BrowserWindow({
    width: 980,
    height: 860,
    parent: ventana || undefined,
    title: 'Expediente Pro – Guía de uso',
    icon: path.join(__dirname, 'icono.png'),
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  guia.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  void guia.loadURL(`${ORIGEN}/docs/guia.html`);
}

function acercaDe() {
  void dialog.showMessageBox(ventana, {
    type: 'info',
    title: 'Acerca de Expediente Pro',
    message: `Expediente Pro ${app.getVersion()}`,
    detail:
      'Costos, presupuestos, cronogramas y documentos de expedientes y cotizaciones de obra.\n\n' +
      'Los proyectos se guardan en esta computadora, separados de los del navegador. ' +
      'Para pasar proyectos entre la web y la app use Respaldo y Restaurar respaldo en el panel de proyectos.\n\n' +
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
    buttons: ['Aceptar'],
  });
}

// ------------------------------------------------------------------ ventana

function crearVentana() {
  const ses = leerSesion();
  const lim = ses.ventana && ses.ventana.limites;
  ventana = new BrowserWindow({
    width: lim ? lim.width : 1440,
    height: lim ? lim.height : 900,
    x: lim ? lim.x : undefined,
    y: lim ? lim.y : undefined,
    minWidth: 900,
    minHeight: 560,
    title: 'Expediente Pro',
    backgroundColor: FONDO,
    icon: path.join(__dirname, 'icono.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-barra.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  if (ses.ventana && ses.ventana.maximizada) ventana.maximize();
  void ventana.loadFile(path.join(__dirname, 'pestanas.html'));
  ventana.webContents.on('did-finish-load', enviarEstado);
  ventana.once('ready-to-show', () => ventana.show());
  for (const ev of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) ventana.on(ev, ubicar);
  ventana.on('resized', guardarSesion);
  ventana.on('moved', guardarSesion);

  ventana.on('close', (e) => {
    if (cerrando) return;
    e.preventDefault();
    cerrando = true;
    guardarSesion();
    void Promise.all(pestanas.map(guardarPestana)).finally(() => ventana && !ventana.isDestroyed() && ventana.destroy());
  });

  // pestañas de la sesión anterior
  const previas = Array.isArray(ses.pestanas) ? ses.pestanas.filter((x) => typeof x === 'string') : [];
  if (previas.length) {
    for (const id of previas) crearPestana(consultaProyecto(id), false);
    const i = Math.max(0, previas.indexOf(ses.activa));
    activarPestana(pestanas[i].id);
  } else {
    crearPestana('');
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!ventana) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.focus();
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('pe.expedientepro.app');

    // la interfaz se sirve desde app://expediente (origen fijo: los proyectos quedan en IndexedDB de ese origen)
    protocol.handle('app', async (req) => {
      const u = new URL(req.url);
      let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
      const base = rel.startsWith('docs/') ? RAIZ : path.join(RAIZ, 'dist');
      const ruta = path.normalize(path.join(base, rel));
      if (!ruta.startsWith(base)) return new Response('No permitido', { status: 403 });
      try {
        const datos = await fs.promises.readFile(ruta);
        return new Response(datos, { headers: { 'content-type': TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream' } });
      } catch {
        return new Response('No encontrado', { status: 404 });
      }
    });

    // descargas (Excel, Word, PDF, ZIP…): diálogo «Guardar como» en la carpeta Descargas
    session.defaultSession.on('will-download', (_e, item) => {
      item.setSaveDialogOptions({ title: 'Guardar archivo', defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
    });

    construirMenu();
    crearVentana();
  });

  app.on('window-all-closed', () => app.quit());
}
