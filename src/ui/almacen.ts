// Almacén local de proyectos (IndexedDB del navegador, con respaldo en localStorage).
// Cada proyecto se guarda por separado con su información general, costos, metrados, cronogramas y documentos.
import type { Proyecto, Resultados } from '../engine/types';
import { conEsquema, migrarProyecto } from '../io/migrar';

export interface ResumenProyecto {
  nombre: string;
  codigo: string;
  cliente: string;
  proyectista: string;
  modo: 'privado' | 'publico';
  moneda: string;
  total: number;
  costoDirecto: number;
  plazoDias: number;
  partidas: number;
  errores: number;
  advertencias: number;
}

export interface RegistroProyecto {
  id: string;
  creado: string; // ISO
  actualizado: string; // ISO
  archivado: boolean;
  eliminado?: string; // ISO: está en la papelera desde esa fecha (se borra solo a los DIAS_PAPELERA días)
  resumen: ResumenProyecto;
  proyecto: Proyecto;
}

export const DIAS_PAPELERA = 30;

export interface Respaldo {
  formato: 'expediente-pro-respaldo';
  version: 1;
  fecha: string;
  proyectos: RegistroProyecto[];
}

const DB = 'expediente-pro';
const STORE = 'proyectos';
const COPIAS = 'copias'; // puntos de restauración (solo con IndexedDB)
const MAX_AUTOMATICAS = 12;
const CLAVE_ULTIMO = 'expediente-pro:ultimo';
const CLAVE_V1 = 'expediente-pro:proyecto';
const PREFIJO_LS = 'expediente-pro:p:';

export const nuevoId = () => `prj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function resumir(p: Proyecto, r?: Resultados): ResumenProyecto {
  return {
    nombre: p.meta.nombre || 'Proyecto sin nombre',
    codigo: p.meta.codigo || '',
    cliente: p.entidades?.cliente?.nombre || '',
    proyectista: p.entidades?.proyectista?.nombre || '',
    modo: p.meta.modo,
    moneda: p.meta.moneda,
    total: r?.pie.total ?? 0,
    costoDirecto: r?.pie.costoDirecto ?? 0,
    plazoDias: r?.programa.plazoDias ?? 0,
    partidas: p.partidas.filter((x) => !x.titulo).length,
    errores: r?.resumenValidacion.errores ?? 0,
    advertencias: r?.resumenValidacion.advertencias ?? 0,
  };
}

// ------------------------------------------------------------ IndexedDB

let dbPromesa: Promise<IDBDatabase | null> | null = null;

function abrirDb(): Promise<IDBDatabase | null> {
  if (dbPromesa) return dbPromesa;
  dbPromesa = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(COPIAS)) db.createObjectStore(COPIAS, { keyPath: 'id' }).createIndex('proyectoId', 'proyectoId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromesa;
}

function tx<T>(db: IDBDatabase, modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>, almacen = STORE): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(almacen, modo);
    const req = f(t.objectStore(almacen));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ------------------------------------------------------------ respaldo en localStorage

function lsListar(): RegistroProyecto[] {
  const out: RegistroProyecto[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIJO_LS)) continue;
      const t = localStorage.getItem(k);
      if (t) out.push(JSON.parse(t));
    }
  } catch {
    /* sin almacenamiento */
  }
  return out;
}

// ------------------------------------------------------------ API

export async function modoAlmacen(): Promise<'indexeddb' | 'localstorage'> {
  return (await abrirDb()) ? 'indexeddb' : 'localstorage';
}

async function todos(): Promise<RegistroProyecto[]> {
  const db = await abrirDb();
  return db ? await tx<RegistroProyecto[]>(db, 'readonly', (s) => s.getAll() as IDBRequest<RegistroProyecto[]>) : lsListar();
}

/** Proyectos activos y archivados (sin los de la papelera). */
export async function listarProyectos(): Promise<RegistroProyecto[]> {
  return (await todos()).filter((x) => !x.eliminado).sort((a, b) => b.actualizado.localeCompare(a.actualizado));
}

/** Lee un proyecto (migrado). Los de la papelera no se abren: primero se restauran. */
export async function leerProyecto(id: string): Promise<RegistroProyecto | null> {
  const r = await leerSinMigrar(id).catch(() => null);
  if (!r || r.eliminado) return null;
  return { ...r, proyecto: migrarProyecto(r.proyecto) };
}

export async function guardarRegistro(reg: RegistroProyecto): Promise<void> {
  const db = await abrirDb();
  if (db) {
    await tx(db, 'readwrite', (s) => s.put(reg));
    return;
  }
  localStorage.setItem(PREFIJO_LS + reg.id, JSON.stringify(reg));
}

export async function guardarProyecto(id: string, p: Proyecto, r?: Resultados, extra: Partial<RegistroProyecto> = {}): Promise<RegistroProyecto> {
  const previo = await leerSinMigrar(id);
  const ahora = new Date().toISOString();
  // primer cambio del día: el estado anterior queda como punto de restauración automático
  if (previo && diaLocal(previo.actualizado) !== diaLocal(ahora) && previo.proyecto !== p) {
    await crearCopia(previo, `Antes de los cambios del ${diaLocal(ahora).split('-').reverse().join('/')}`, true).catch(() => undefined);
  }
  const reg: RegistroProyecto = {
    id,
    creado: previo?.creado ?? ahora,
    actualizado: ahora,
    archivado: previo?.archivado ?? false,
    ...(previo?.eliminado ? { eliminado: previo.eliminado } : {}),
    resumen: resumir(p, r),
    proyecto: conEsquema(p),
    ...extra,
  };
  await guardarRegistro(reg);
  return reg;
}

async function leerSinMigrar(id: string): Promise<RegistroProyecto | null> {
  const db = await abrirDb();
  if (db) return (await tx<RegistroProyecto | undefined>(db, 'readonly', (s) => s.get(id) as IDBRequest<RegistroProyecto | undefined>)) ?? null;
  try {
    const t = localStorage.getItem(PREFIJO_LS + id);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

export async function crearProyecto(p: Proyecto, r?: Resultados): Promise<RegistroProyecto> {
  return guardarProyecto(nuevoId(), p, r);
}

export async function duplicarProyecto(id: string): Promise<RegistroProyecto | null> {
  const r = await leerProyecto(id);
  if (!r) return null;
  const copia: Proyecto = JSON.parse(JSON.stringify(r.proyecto));
  copia.meta.nombre = `${copia.meta.nombre} (copia)`;
  const ahora = new Date().toISOString();
  const reg: RegistroProyecto = { id: nuevoId(), creado: ahora, actualizado: ahora, archivado: false, resumen: { ...r.resumen, nombre: copia.meta.nombre }, proyecto: copia };
  await guardarRegistro(reg);
  return reg;
}

export async function archivarProyecto(id: string, archivado: boolean): Promise<void> {
  const r = await leerSinMigrar(id);
  if (!r) return;
  await guardarRegistro({ ...r, archivado });
}

/** Manda el proyecto a la papelera; se borra solo a los DIAS_PAPELERA días. */
export async function eliminarProyecto(id: string): Promise<void> {
  const r = await leerSinMigrar(id);
  if (r) await guardarRegistro({ ...r, eliminado: new Date().toISOString() });
  if (ultimoAbierto() === id) recordarUltimo(null);
}

/** Proyectos de la papelera (antes borra los que cumplieron el plazo). */
export async function listarPapelera(ahora = new Date()): Promise<RegistroProyecto[]> {
  const lista = (await todos()).filter((x) => x.eliminado);
  const vivos: RegistroProyecto[] = [];
  for (const x of lista) {
    if (diasEnPapelera(x, ahora) >= DIAS_PAPELERA) await eliminarDefinitivo(x.id);
    else vivos.push(x);
  }
  return vivos.sort((a, b) => b.eliminado!.localeCompare(a.eliminado!));
}

export const diasEnPapelera = (x: Pick<RegistroProyecto, 'eliminado'>, ahora = new Date()) => (x.eliminado ? Math.floor((ahora.getTime() - new Date(x.eliminado).getTime()) / 86_400_000) : 0);

export async function restaurarDePapelera(id: string): Promise<void> {
  const r = await leerSinMigrar(id);
  if (!r) return;
  const { eliminado: _e, ...resto } = r;
  await guardarRegistro(resto);
}

/** Borra el proyecto y sus versiones sin pasar por la papelera. */
export async function eliminarDefinitivo(id: string): Promise<void> {
  const db = await abrirDb();
  if (db) await tx(db, 'readwrite', (s) => s.delete(id));
  else localStorage.removeItem(PREFIJO_LS + id);
  for (const c of await listarCopias(id)) await eliminarCopia(c.id);
  if (ultimoAbierto() === id) recordarUltimo(null);
}

export function ultimoAbierto(): string | null {
  try {
    return localStorage.getItem(CLAVE_ULTIMO);
  } catch {
    return null;
  }
}

export function recordarUltimo(id: string | null) {
  try {
    if (id) localStorage.setItem(CLAVE_ULTIMO, id);
    else localStorage.removeItem(CLAVE_ULTIMO);
  } catch {
    /* sin almacenamiento */
  }
}

/** Proyecto guardado por la versión 1 (un solo proyecto en localStorage). */
export function proyectoV1(): Proyecto | null {
  try {
    const t = localStorage.getItem(CLAVE_V1);
    return t ? migrarProyecto(JSON.parse(t)) : null;
  } catch {
    return null;
  }
}

export function olvidarV1() {
  try {
    localStorage.removeItem(CLAVE_V1);
  } catch {
    /* sin almacenamiento */
  }
}

export async function respaldoCompleto(): Promise<Respaldo> {
  const lista = (await todos()).filter((x) => !x.eliminado);
  return { formato: 'expediente-pro-respaldo', version: 1, fecha: new Date().toISOString(), proyectos: lista };
}

/** Restaura un respaldo: los proyectos con un id ya existente se agregan como copia. */
export async function restaurarRespaldo(r: Respaldo): Promise<number> {
  if (r?.formato !== 'expediente-pro-respaldo' || !Array.isArray(r.proyectos)) throw new Error('El archivo no es un respaldo de Expediente Pro.');
  const existentes = new Set((await todos()).map((x) => x.id));
  let n = 0;
  for (const reg of r.proyectos) {
    const id = existentes.has(reg.id) ? nuevoId() : reg.id;
    await guardarRegistro({ ...reg, id, proyecto: migrarProyecto(reg.proyecto) });
    n++;
  }
  return n;
}

// ------------------------------------------------------------ puntos de restauración

/** Copia fechada de un proyecto. Las automáticas se crean con el primer cambio de cada día. */
export interface CopiaProyecto {
  id: string;
  proyectoId: string;
  fecha: string; // ISO
  nota: string;
  automatica: boolean;
  resumen: ResumenProyecto;
  proyecto: Proyecto;
}

const diaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function listarCopias(proyectoId: string): Promise<CopiaProyecto[]> {
  const db = await abrirDb();
  if (!db) return [];
  const lista = await tx<CopiaProyecto[]>(db, 'readonly', (s) => s.index('proyectoId').getAll(proyectoId) as IDBRequest<CopiaProyecto[]>, COPIAS);
  return lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export async function crearCopia(reg: Pick<RegistroProyecto, 'id' | 'resumen' | 'proyecto'>, nota: string, automatica = false): Promise<CopiaProyecto | null> {
  const db = await abrirDb();
  if (!db) return null;
  const copia: CopiaProyecto = { id: `cop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, proyectoId: reg.id, fecha: new Date().toISOString(), nota, automatica, resumen: reg.resumen, proyecto: reg.proyecto };
  await tx(db, 'readwrite', (s) => s.put(copia), COPIAS);
  if (automatica) {
    const viejas = (await listarCopias(reg.id)).filter((c) => c.automatica).slice(MAX_AUTOMATICAS);
    for (const c of viejas) await eliminarCopia(c.id);
  }
  return copia;
}

export async function eliminarCopia(id: string): Promise<void> {
  const db = await abrirDb();
  if (db) await tx(db, 'readwrite', (s) => s.delete(id), COPIAS);
}

// ------------------------------------------------------------ aviso entre pestañas del navegador

let canalAbierto: BroadcastChannel | null | undefined;
const abrirCanal = () => (canalAbierto === undefined ? (canalAbierto = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('expediente-pro') : null) : canalAbierto);
const ESTA_PESTANA = Math.random().toString(36).slice(2);

/** Avisa a las demás pestañas que este proyecto se guardó aquí. */
export function avisarGuardado(id: string) {
  abrirCanal()?.postMessage({ id, de: ESTA_PESTANA });
}

/** Llama a `f` cuando OTRA pestaña guarda el proyecto indicado. Devuelve la función para dejar de escuchar. */
export function alGuardarEnOtraPestana(id: string, f: () => void): () => void {
  const canal = abrirCanal();
  if (!canal) return () => undefined;
  const oir = (e: MessageEvent) => { if (e.data?.id === id && e.data?.de !== ESTA_PESTANA) f(); };
  canal.addEventListener('message', oir);
  return () => canal.removeEventListener('message', oir);
}
