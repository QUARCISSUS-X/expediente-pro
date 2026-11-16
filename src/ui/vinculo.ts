// Archivos vinculados: un proyecto (o el banco) queda unido a un archivo en una carpeta del usuario (OneDrive, Dropbox,
// carpeta de red) y cada guardado se escribe también allí. En la app de escritorio se usa la ruta; en Chrome y Edge, la
// API de archivos del navegador (el permiso se pide de nuevo tras reiniciar). Sin ninguna de las dos, se descarga.
import { abrirDb, tx } from './almacen';
import { escritorio } from './escritorio';

export interface Vinculo {
  id: string; // id del proyecto o 'banco'
  nombre: string; // nombre del archivo
  ruta?: string; // app de escritorio
  manejador?: FileSystemFileHandle; // navegador (API de archivos)
  escrito: number; // fecha de modificación del archivo tras la última lectura o escritura (ms)
  sincronizado?: string; // banco: fecha del manifiesto del último .epdb leído o escrito
}

export interface FiltroArchivo {
  descripcion: string;
  extensiones: string[]; // sin punto: ['expediente', 'json']
  mime?: string;
}

type ConPermiso = FileSystemFileHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};
type VentanaArchivos = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>;
};

const ventana = () => (typeof window === 'undefined' ? null : (window as VentanaArchivos));

/** Verdadero si este entorno puede escribir en un archivo del usuario sin descargarlo. */
export const puedeVincular = () => !!escritorio?.archivos || !!ventana()?.showSaveFilePicker;

export class SinPermiso extends Error {
  constructor(nombre: string) {
    super(`Hace falta volver a permitir el acceso a ${nombre}.`);
    this.name = 'SinPermiso';
  }
}

// ------------------------------------------------------------ almacén de vínculos

export async function leerVinculo(id: string): Promise<Vinculo | null> {
  const db = await abrirDb();
  if (!db) return null;
  return (await tx<Vinculo | undefined>(db, 'readonly', (s) => s.get(id) as IDBRequest<Vinculo | undefined>, 'vinculos').catch(() => undefined)) ?? null;
}

async function guardarVinculo(v: Vinculo): Promise<Vinculo> {
  const db = await abrirDb();
  if (db) await tx(db, 'readwrite', (s) => s.put(v), 'vinculos');
  return v;
}

export async function desvincular(id: string): Promise<void> {
  const db = await abrirDb();
  if (db) await tx(db, 'readwrite', (s) => s.delete(id), 'vinculos');
}

// ------------------------------------------------------------ elegir

const tiposNavegador = (f: FiltroArchivo) => [{ description: f.descripcion, accept: { [f.mime || 'application/octet-stream']: f.extensiones.map((e) => `.${e}`) } }];

/** Elige dónde guardar y deja el vínculo hecho (sin escribir todavía). */
export async function vincularNuevo(id: string, sugerido: string, filtro: FiltroArchivo): Promise<Vinculo | null> {
  if (escritorio?.archivos) {
    const ruta = await escritorio.archivos.guardarComo(sugerido, [{ name: filtro.descripcion, extensions: filtro.extensiones }]);
    if (!ruta) return null;
    return guardarVinculo({ id, nombre: ruta.split(/[\\/]/).pop() || sugerido, ruta, escrito: 0 });
  }
  const w = ventana();
  if (!w?.showSaveFilePicker) return null;
  try {
    const manejador = await w.showSaveFilePicker({ suggestedName: sugerido, types: tiposNavegador(filtro) });
    return guardarVinculo({ id, nombre: manejador.name, manejador, escrito: 0 });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null;
    throw e;
  }
}

/** Elige un archivo existente para abrirlo y vincularlo. */
export async function vincularExistente(id: string, filtro: FiltroArchivo): Promise<{ vinculo: Vinculo; datos: Uint8Array } | null> {
  if (escritorio?.archivos) {
    const ruta = await escritorio.archivos.abrir([{ name: filtro.descripcion, extensions: filtro.extensiones }]);
    if (!ruta) return null;
    const v = await guardarVinculo({ id, nombre: ruta.split(/[\\/]/).pop() || ruta, ruta, escrito: 0 });
    const l = await leerArchivoVinculado(v);
    return { vinculo: await guardarVinculo({ ...v, escrito: l.modificado }), datos: l.datos };
  }
  const w = ventana();
  if (!w?.showOpenFilePicker) return null;
  try {
    const [manejador] = await w.showOpenFilePicker({ types: tiposNavegador(filtro), multiple: false });
    const f = await manejador.getFile();
    const v = await guardarVinculo({ id, nombre: manejador.name, manejador, escrito: f.lastModified });
    return { vinculo: v, datos: new Uint8Array(await f.arrayBuffer()) };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null;
    throw e;
  }
}

/** Vincula una ruta que llegó por doble clic en el archivo (app de escritorio). */
export function vincularRuta(id: string, ruta: string, modificado: number): Promise<Vinculo> {
  return guardarVinculo({ id, nombre: ruta.split(/[\\/]/).pop() || ruta, ruta, escrito: modificado });
}

// ------------------------------------------------------------ leer y escribir

async function permiso(v: Vinculo, pedir: boolean): Promise<void> {
  const m = v.manejador as ConPermiso | undefined;
  if (!m?.queryPermission) return;
  let estado = await m.queryPermission({ mode: 'readwrite' });
  if (estado !== 'granted' && pedir && m.requestPermission) estado = await m.requestPermission({ mode: 'readwrite' });
  if (estado !== 'granted') throw new SinPermiso(v.nombre);
}

/** Fecha de modificación del archivo (ms), o null si ya no existe o no hay permiso. */
export async function modificado(v: Vinculo): Promise<number | null> {
  try {
    if (v.ruta && escritorio?.archivos) return (await escritorio.archivos.info(v.ruta))?.modificado ?? null;
    if (v.manejador) {
      await permiso(v, false);
      return (await v.manejador.getFile()).lastModified;
    }
  } catch {
    return null;
  }
  return null;
}

export async function leerArchivoVinculado(v: Vinculo, pedirPermiso = false): Promise<{ datos: Uint8Array; modificado: number }> {
  if (v.ruta && escritorio?.archivos) {
    const r = await escritorio.archivos.leer(v.ruta);
    if (!r) throw new Error(`No se encontró ${v.nombre}.`);
    return r;
  }
  if (!v.manejador) throw new Error('Este vínculo se hizo en otro programa (la app de escritorio o el navegador).');
  await permiso(v, pedirPermiso);
  const f = await v.manejador.getFile();
  return { datos: new Uint8Array(await f.arrayBuffer()), modificado: f.lastModified };
}

/** Escribe el archivo vinculado y devuelve el vínculo con su nueva fecha. */
export async function escribirVinculo(v: Vinculo, datos: Uint8Array | string, pedirPermiso = false, extra: Partial<Vinculo> = {}): Promise<Vinculo> {
  const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos;
  let fecha = Date.now();
  if (v.ruta && escritorio?.archivos) {
    fecha = await escritorio.archivos.escribir(v.ruta, bytes);
  } else if (v.manejador) {
    await permiso(v, pedirPermiso);
    const w = await v.manejador.createWritable();
    await w.write(new Blob([bytes as BlobPart]));
    await w.close();
    fecha = (await v.manejador.getFile()).lastModified;
  } else {
    throw new Error('Este vínculo se hizo en otro programa (la app de escritorio o el navegador).');
  }
  return guardarVinculo({ ...v, ...extra, escrito: fecha });
}

/** Verdadero si el archivo cambió fuera del programa después de la última lectura o escritura (otra computadora). */
export async function cambioAfuera(v: Vinculo): Promise<boolean> {
  const m = await modificado(v);
  return m !== null && v.escrito > 0 && m > v.escrito + 1500;
}

export const marcarLeido = (v: Vinculo, fecha: number, extra: Partial<Vinculo> = {}) => guardarVinculo({ ...v, ...extra, escrito: fecha });

/** El mismo vínculo bajo otro id (por ejemplo, al crear el proyecto después de elegir el archivo). */
export const reasignar = (v: Vinculo, id: string) => guardarVinculo({ ...v, id });

/** Proyecto ya vinculado a esa ruta (para no duplicarlo al abrir el mismo archivo otra vez). */
export async function proyectoDeRuta(ruta: string): Promise<string | null> {
  const db = await abrirDb();
  if (!db) return null;
  const todos = (await tx<Vinculo[]>(db, 'readonly', (s) => s.getAll() as IDBRequest<Vinculo[]>, 'vinculos').catch(() => [])) ?? [];
  const norm = (x: string) => x.replace(/\\/g, '/').toLowerCase();
  return todos.find((v) => v.id !== 'banco' && v.ruta && norm(v.ruta) === norm(ruta))?.id ?? null;
}

// banco abierto con doble clic: la pantalla del banco lo toma y muestra la fusión
let bancoPendiente: { nombre: string; datos: Uint8Array } | null = null;
export const ponerBancoPendiente = (a: { nombre: string; datos: Uint8Array }) => { bancoPendiente = a; };
export function tomarBancoPendiente() {
  const a = bancoPendiente;
  bancoPendiente = null;
  return a;
}

/** Vincula un archivo que llegó a la web instalada por doble clic (API de lanzamiento de archivos de la PWA). */
export async function vincularManejador(id: string, manejador: FileSystemFileHandle): Promise<{ vinculo: Vinculo; datos: Uint8Array }> {
  const f = await manejador.getFile();
  const vinculo = await guardarVinculo({ id, nombre: manejador.name, manejador, escrito: f.lastModified });
  return { vinculo, datos: new Uint8Array(await f.arrayBuffer()) };
}
