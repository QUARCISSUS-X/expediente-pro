// Migraciones numeradas del archivo de proyecto: cada una lleva el esquema N al N + 1. Para agregar una:
// crear `NN-nombre.ts` con `nombre` y `aplicar(datos)`, sumarla a MIGRACIONES y subir ESQUEMA_ACTUAL.
import * as m01 from './01-entidades';
import * as m02 from './02-bitacora';
import * as m03 from './03-presupuesto-avanzado';

type Datos = Record<string, unknown>;
export interface Migracion {
  desde: number;
  nombre: string;
  aplicar: (p: Datos) => Datos;
}

export const MIGRACIONES: Migracion[] = [
  { desde: 1, ...m01 },
  { desde: 2, ...m02 },
  { desde: 3, ...m03 },
];

/** Esquema que escribe esta versión del programa (2.7 → 3, 2.9 → 4). */
export const ESQUEMA_ACTUAL = MIGRACIONES.length + 1;

/** Esquema de un archivo leído: el declarado, o 1 (versión 1.x) / 2 (versiones 2.0 a 2.6). */
export function esquemaDe(p: Datos): number {
  if (typeof p.esquema === 'number' && Number.isFinite(p.esquema)) return p.esquema;
  return p.entidades && p.responsables ? 2 : 1;
}

/** Aplica en orden las migraciones pendientes. Un archivo de un esquema más nuevo se deja como está. */
export function migrar(p: Datos): { datos: Datos; desde: number; aplicadas: string[] } {
  const desde = esquemaDe(p);
  let datos = p;
  const aplicadas: string[] = [];
  for (const m of MIGRACIONES) {
    if (m.desde < desde) continue;
    datos = m.aplicar(datos);
    aplicadas.push(m.nombre);
  }
  return { datos: { ...datos, esquema: Math.max(desde, ESQUEMA_ACTUAL) }, desde, aplicadas };
}
