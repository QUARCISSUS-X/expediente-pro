// Utilidades de fechas y días laborables del control.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { Calendario } from '../schedule';
import { type Resultados } from '../types';
import { diaSemana, sumarDias } from '../util';

// ======================================================================= utilidades de fechas

export const hoyIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Lunes de la semana de la fecha. */
export function lunesDe(iso: string): string {
  const d = diaSemana(iso); // 0 = domingo
  return sumarDias(iso, d === 0 ? -6 : 1 - d);
}

export const mesDe = (iso: string) => iso.slice(0, 7);

export const calendarioDe = (r: Resultados, inicio: string) => new Calendario(inicio, r.proyecto.meta.diasLaborables, r.proyecto.meta.feriados);

/** Días laborables en [desde, hasta], ambos incluidos. */
export function laborables(cal: Calendario, desde: string, hasta: string): number {
  if (!desde || !hasta || hasta < desde) return 0;
  return cal.laborablesEntre(desde, hasta);
}

/** Retrocede n días laborables desde la fecha (la fecha cuenta como el primero si es laborable). */
export function retrocederLaborables(cal: Calendario, desde: string, n: number): string {
  let d = desde;
  let guard = 0;
  while (!cal.esLaborable(d) && guard++ < 400) d = sumarDias(d, -1);
  let k = 1;
  while (k < n && guard++ < 5000) {
    d = sumarDias(d, -1);
    if (cal.esLaborable(d)) k++;
  }
  return d;
}
