// Bitácora de cambios del proyecto: cada edición con etiqueta queda con su fecha (se guardan las últimas 500).
import type { EntradaBitacora, Proyecto } from './types';

export const MAX_BITACORA = 500;
const JUNTAR_MS = 2 * 60_000; // ediciones seguidas con la misma etiqueta en menos de 2 minutos se cuentan juntas

/** Anota un cambio en la bitácora del proyecto (modifica el borrador de immer o el objeto dado). */
export function anotarBitacora(p: Pick<Proyecto, 'bitacora'>, texto: string, ahora = new Date()): void {
  const t = texto.trim();
  if (!t) return;
  const lista = (p.bitacora ??= []);
  const ultima = lista[lista.length - 1];
  if (ultima && ultima.texto === t && ahora.getTime() - new Date(ultima.fecha).getTime() < JUNTAR_MS) {
    ultima.fecha = ahora.toISOString();
    ultima.veces = (ultima.veces ?? 1) + 1;
    return;
  }
  lista.push({ fecha: ahora.toISOString(), texto: t });
  if (lista.length > MAX_BITACORA) lista.splice(0, lista.length - MAX_BITACORA);
}

/** Entradas de la bitácora entre dos fechas ISO (incluidas), de la más reciente a la más antigua. */
export function bitacoraEntre(p: Pick<Proyecto, 'bitacora'>, desde = '', hasta = '9999'): EntradaBitacora[] {
  return (p.bitacora ?? []).filter((e) => e.fecha.slice(0, 10) >= desde && e.fecha.slice(0, 10) <= hasta).reverse();
}
