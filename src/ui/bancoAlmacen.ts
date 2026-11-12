// Almacén del banco de datos en el navegador (IndexedDB, almacén `banco`, fuera de los proyectos) con puntos de restauración.
// Sin IndexedDB usa localStorage. Mientras no se guarde nada, el banco es el inicial (catálogo y biblioteca del programa).
import { type Banco, bancoInicial, normalizarBanco, resumenBanco, type Tabla } from '../engine/banco';
import { abrirDb, tx } from './almacen';

const CLAVE_LS = 'expediente-pro:banco';
const MAX_PUNTOS = 10;

export interface PuntoBanco {
  id: string;
  fecha: string;
  nota: string;
  conteos: Record<Tabla, number>;
  banco: Banco;
}

let cache: Banco | null = null;
const avisos = new Set<(b: Banco) => void>();

export async function leerBanco(): Promise<Banco> {
  if (cache) return cache;
  const db = await abrirDb();
  let crudo: unknown = null;
  if (db) crudo = (await tx<{ banco: unknown } | undefined>(db, 'readonly', (s) => s.get('banco') as IDBRequest<{ banco: unknown } | undefined>, 'banco'))?.banco ?? null;
  else {
    try { const t = localStorage.getItem(CLAVE_LS); crudo = t ? JSON.parse(t) : null; } catch { crudo = null; }
  }
  cache = crudo ? normalizarBanco(crudo) : bancoInicial();
  return cache;
}

/** Guarda el banco. Con `nota`, el banco anterior queda antes como punto de restauración. */
export async function guardarBanco(b: Banco, nota?: string): Promise<void> {
  const db = await abrirDb();
  if (nota) await crearPunto(await leerBanco(), nota);
  if (db) await tx(db, 'readwrite', (s) => s.put({ id: 'banco', banco: b, actualizado: new Date().toISOString() }), 'banco');
  else localStorage.setItem(CLAVE_LS, JSON.stringify(b));
  cache = b;
  for (const f of avisos) f(b);
}

/** Avisa cuando el banco cambia (para refrescar las pantallas que lo muestran). */
export function alCambiarBanco(f: (b: Banco) => void): () => void {
  avisos.add(f);
  return () => avisos.delete(f);
}

async function crearPunto(b: Banco, nota: string): Promise<void> {
  const db = await abrirDb();
  if (!db) return;
  const p: PuntoBanco = { id: `bp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, fecha: new Date().toISOString(), nota, conteos: resumenBanco(b), banco: b };
  await tx(db, 'readwrite', (s) => s.put(p), 'banco-puntos');
  for (const v of (await listarPuntos()).slice(MAX_PUNTOS)) await tx(db, 'readwrite', (s) => s.delete(v.id), 'banco-puntos');
}

export async function listarPuntos(): Promise<PuntoBanco[]> {
  const db = await abrirDb();
  if (!db) return [];
  const l = await tx<PuntoBanco[]>(db, 'readonly', (s) => s.getAll() as IDBRequest<PuntoBanco[]>, 'banco-puntos');
  return l.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Vuelve a un punto de restauración (el banco actual queda a su vez como punto). */
export async function restaurarPunto(p: PuntoBanco): Promise<void> {
  await guardarBanco(normalizarBanco(p.banco), `Antes de volver al punto del ${new Date(p.fecha).toLocaleString('es-PE')}`);
}
