// Respaldo completo (.epdb con los proyectos, sus versiones y el banco) y recordatorio periódico para la extensión
// del navegador, cuyos datos se borran al desinstalarla.
import { escribirEpdb } from '../io/banco';
import { respaldoCompleto, todasLasCopias } from './almacen';
import { leerBanco } from './bancoAlmacen';
import { descargar } from './estado';

const CLAVE_ULTIMO = 'expediente-pro:ultimo-respaldo';
const CLAVE_POSPUESTO = 'expediente-pro:respaldo-pospuesto';
const CLAVE_INICIO = 'expediente-pro:primer-uso';
export const DIAS_RECORDATORIO = 14;

const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

/** Descarga el respaldo completo y anota la fecha. Devuelve cuántos proyectos y versiones lleva. */
export async function descargarRespaldo(): Promise<{ proyectos: number; copias: number }> {
  const r = await respaldoCompleto();
  const copias = (await todasLasCopias()).filter((c) => r.proyectos.some((x) => x.id === c.proyectoId));
  descargar(`Respaldo_Expediente_Pro_${new Date().toISOString().slice(0, 10)}.epdb`, await escribirEpdb({ banco: await leerBanco(), proyectos: r.proyectos, copias }), 'application/zip');
  escribir(CLAVE_ULTIMO, new Date().toISOString());
  return { proyectos: r.proyectos.length, copias: copias.length };
}

export const esExtension = () => typeof location !== 'undefined' && /-extension:$/.test(location.protocol);

const dias = (iso: string | null, ahora: number) => (iso ? (ahora - Date.parse(iso)) / 86400000 : Infinity);

/** Verdadero si conviene recordar el respaldo: en la extensión, sin respaldo en los últimos 14 días (ni recordatorio pospuesto). */
export function tocaRecordarRespaldo(ahora = Date.now()): boolean {
  if (!esExtension()) return false;
  if (!leer(CLAVE_INICIO)) escribir(CLAVE_INICIO, new Date(ahora).toISOString());
  const desde = Math.min(dias(leer(CLAVE_ULTIMO), ahora), dias(leer(CLAVE_INICIO), ahora));
  return desde >= DIAS_RECORDATORIO && dias(leer(CLAVE_POSPUESTO), ahora) >= 7;
}

export const posponerRespaldo = () => escribir(CLAVE_POSPUESTO, new Date().toISOString());
export const ultimoRespaldo = () => leer(CLAVE_ULTIMO);
