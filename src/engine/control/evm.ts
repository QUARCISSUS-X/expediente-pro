// Valor ganado (PMBOK) y Earned Schedule: PV, EV, AC, SPI, CPI, EAC, ES, SPI(t), IEAC(t).
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { Calendario } from '../schedule';
import { type Resultados } from '../types';
import { num, redondear, sumarDias } from '../util';
import { type Valor } from '../valor';
import { calendarioDe, laborables } from './fechas';
import { type Control, type LineaBase, type PartidaBase } from './modelo';

// ======================================================================= valor ganado

export interface PuntoEvm {
  corteId: string;
  fecha: string;
  nombre: string;
  pv: number;
  ev: number;
  ac: number | null;
  pvPct: number;
  evPct: number;
  sv: number;
  cv: number | null;
  spi: number;
  cpi: number | null;
  eac: number | null;
  etc: number | null;
  vac: number | null;
  tcpi: number | null;
  finEstimado: string;
  // Earned Schedule (en días laborables desde el inicio de la línea base)
  es: number; // cronograma ganado: tiempo en que el plan alcanzaba el EV actual
  at: number; // tiempo real transcurrido al corte
  spiT: number | null; // SPI(t) = ES / AT
  svT: number; // SV(t) = ES − AT (días laborables; negativo = atraso)
  ieacT: number | null; // duración estimada IEAC(t) = PD / SPI(t), en días laborables
  finEstimadoES: string; // fecha de término según IEAC(t)
}

export interface AvancePartida {
  base: PartidaBase;
  ejecutado: number; // metrado acumulado
  avancePct: number;
  ev: number;
  pv: number;
  spi: number | null;
  excedente: number; // metrado ejecutado por encima del metrado base
}

export interface Evm {
  bac: number;
  pd: number; // duración planificada en días laborables
  pvDias: number[]; // PV acumulado al final de cada día laborable de la línea base
  puntos: PuntoEvm[];
  ultimo: PuntoEvm | null;
  partidas: AvancePartida[];
  curvaPlan: { fecha: string; pv: number; pct: number }[];
}

/** Valor planificado acumulado de una partida a la fecha (distribución uniforme en sus días laborables). */
export function pvPartida(cal: Calendario, b: PartidaBase, fecha: string): number {
  if (fecha < b.inicio) return 0;
  if (fecha >= b.fin) return b.parcial;
  const total = laborables(cal, b.inicio, b.fin) || 1;
  return (b.parcial * laborables(cal, b.inicio, fecha)) / total;
}

export function pvALaFecha(r: Resultados, lb: LineaBase, fecha: string): number {
  const cal = calendarioDe(r, lb.inicio);
  return lb.partidas.reduce((s, b) => s + pvPartida(cal, b, fecha), 0);
}

/** Cronograma ganado: tiempo (en días, con fracción) en que la curva PV alcanza el valor ganado.
 * pvDias[k] es el PV acumulado al final del día k+1. ES = C + (EV − PV_C) / (PV_C+1 − PV_C). */
export function cronogramaGanado(pvDias: number[], ev: number): number {
  if (!pvDias.length || ev <= 0) return 0;
  if (ev >= pvDias[pvDias.length - 1] - 1e-9) return pvDias.length;
  let c = 0; // días completos en que PV ≤ EV
  while (c < pvDias.length && pvDias[c] <= ev + 1e-9) c++;
  const ant = c === 0 ? 0 : pvDias[c - 1];
  const sig = pvDias[c];
  return sig > ant ? c + (ev - ant) / (sig - ant) : c;
}

/** PV acumulado al final de cada día laborable de la línea base. */
export function curvaPvDiaria(r: Resultados, lb: LineaBase): { fechas: string[]; pv: number[] } {
  const cal = calendarioDe(r, lb.inicio);
  const pd = laborables(cal, lb.inicio, lb.fin);
  const fechas: string[] = [];
  for (let i = 0; i < pd; i++) fechas.push(cal.fecha(i));
  return { fechas, pv: fechas.map((f) => lb.partidas.reduce((s, b) => s + pvPartida(cal, b, f), 0)) };
}

export const cortesOrdenados = (c: Control) => [...c.cortes].sort((a, b) => a.fecha.localeCompare(b.fecha));

export function calcularEvm(r: Resultados, c: Control): Evm | null {
  const lb = c.lineaBase;
  if (!lb) return null;
  const cal = calendarioDe(r, lb.inicio);
  const bac = lb.partidas.reduce((s, b) => s + b.parcial, 0);
  const cortes = cortesOrdenados(c);
  const { pv: pvDias } = curvaPvDiaria(r, lb);
  const pd = pvDias.length;
  const acum: Record<string, number> = {};
  let acAcum = 0;
  let acConocido = true;
  const puntos: PuntoEvm[] = [];
  for (const k of cortes) {
    for (const [id, m] of Object.entries(k.metrados)) acum[id] = (acum[id] ?? 0) + num(m);
    if (k.costoReal === null || k.costoReal === undefined || (k.costoReal as unknown) === '') acConocido = false;
    else acAcum += num(k.costoReal);
    let ev = 0;
    let pv = 0;
    for (const b of lb.partidas) {
      const ej = Math.min(acum[b.id] ?? 0, b.metrado);
      ev += ej * b.pu;
      pv += pvPartida(cal, b, k.fecha);
    }
    const ac = acConocido ? acAcum : null;
    const spi = pv > 0 ? ev / pv : ev > 0 ? 1 : 0;
    const cpi = ac !== null && ac > 0 ? ev / ac : null;
    const eac = cpi ? bac / cpi : null;
    const plazoEst = spi > 0 ? Math.round(lb.plazoDias / spi) : lb.plazoDias;
    const es = cronogramaGanado(pvDias, ev);
    const at = laborables(cal, lb.inicio, k.fecha);
    const spiT = at > 0 ? es / at : null;
    const ieacT = spiT && spiT > 0 ? pd / spiT : null;
    puntos.push({
      corteId: k.id,
      fecha: k.fecha,
      nombre: k.nombre,
      pv: redondear(pv),
      ev: redondear(ev),
      ac: ac === null ? null : redondear(ac),
      pvPct: bac > 0 ? (pv / bac) * 100 : 0,
      evPct: bac > 0 ? (ev / bac) * 100 : 0,
      sv: redondear(ev - pv),
      cv: ac === null ? null : redondear(ev - ac),
      spi,
      cpi,
      eac: eac === null ? null : redondear(eac),
      etc: eac === null || ac === null ? null : redondear(eac - ac),
      vac: eac === null ? null : redondear(bac - eac),
      tcpi: ac !== null && bac - ac !== 0 ? (bac - ev) / (bac - ac) : null,
      finEstimado: sumarDias(lb.inicio, Math.max(0, plazoEst - 1)),
      es,
      at,
      spiT,
      svT: es - at,
      ieacT,
      finEstimadoES: ieacT === null ? '' : cal.fecha(Math.max(0, Math.ceil(ieacT - 1e-9) - 1)),
    });
  }
  const ultimo = puntos[puntos.length - 1] ?? null;
  const fechaUlt = ultimo?.fecha ?? lb.inicio;
  const partidas: AvancePartida[] = lb.partidas.map((b) => {
    const ej = acum[b.id] ?? 0;
    const ev = Math.min(ej, b.metrado) * b.pu;
    const pv = ultimo ? pvPartida(cal, b, fechaUlt) : 0;
    return {
      base: b,
      ejecutado: ej,
      avancePct: b.metrado > 0 ? Math.min(100, (ej / b.metrado) * 100) : 0,
      ev: redondear(ev),
      pv: redondear(pv),
      spi: pv > 0 ? ev / pv : null,
      excedente: Math.max(0, ej - b.metrado),
    };
  });
  // curva planificada: un punto por semana
  const curvaPlan: Evm['curvaPlan'] = [];
  for (let f = lb.inicio, i = 0; i < 400; f = sumarDias(f, 7), i++) {
    const fecha = f > lb.fin ? lb.fin : f;
    const pv = lb.partidas.reduce((s, b) => s + pvPartida(cal, b, fecha), 0);
    curvaPlan.push({ fecha, pv, pct: bac > 0 ? (pv / bac) * 100 : 0 });
    if (fecha >= lb.fin) break;
  }
  return { bac: redondear(bac), pd, pvDias, puntos, ultimo, partidas, curvaPlan };
}

/** Metrado acumulado ejecutado por partida hasta la fecha (incluida). */
export function ejecutadoHasta(c: Control, fecha: string): Record<string, number> {
  const acum: Record<string, number> = {};
  for (const k of c.cortes) if (k.fecha <= fecha) for (const [id, m] of Object.entries(k.metrados)) acum[id] = (acum[id] ?? 0) + num(m);
  return acum;
}
