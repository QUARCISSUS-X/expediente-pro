// Lean Construction en ejecución: rendimientos, frentes, carta balance, pérdidas, 5S.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { type Resultados } from '../types';
import { num, redondear } from '../util';
import { type CartaBalance, CATEGORIAS_CARTA, type Control, type GrupoTrabajo, type Inspeccion, type Medicion } from './modelo';

// ======================================================================= Lean: rendimientos

export interface RendimientoMedicion {
  medicion: Medicion;
  hh: number;
  hhUnidadReal: number | null;
  hhUnidadPlan: number;
  ip: number | null; // índice de productividad = HH/u plan ÷ HH/u real (mayor que 1 es mejor)
  rendimientoEquivalente: number | null; // und/día de la cuadrilla del APU
}

export interface RendimientoPartida {
  partidaId: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  hh: number;
  hhUnidadPlan: number;
  hhUnidadReal: number | null;
  ip: number | null;
  rendimientoApu: number;
  rendimientoReal: number | null;
  desviacionMo: number; // costo de MO real − presupuestado para lo producido (positivo = sobrecosto)
  mediciones: number;
}

function datosApu(r: Resultados, partidaId: string) {
  const apu = r.apus[partidaId];
  const mo = apu ? apu.items.filter((it) => it.insumo.tipo === 'MO' && !it.porcentaje) : [];
  const hhU = mo.reduce((s, it) => s + it.cantidad, 0);
  const costoMo = mo.reduce((s, it) => s + it.parcial, 0);
  return { hhU, costoHH: hhU > 0 ? costoMo / hhU : 0, rendimiento: num(apu?.rendimiento) };
}

export function rendimientoMedicion(r: Resultados, m: Medicion): RendimientoMedicion {
  const { hhU, rendimiento } = datosApu(r, m.partidaId);
  const hh = num(m.trabajadores) * num(m.horas);
  const real = num(m.cantidad) > 0 ? hh / num(m.cantidad) : null;
  const ip = real && real > 0 && hhU > 0 ? hhU / real : null;
  return { medicion: m, hh, hhUnidadReal: real, hhUnidadPlan: hhU, ip, rendimientoEquivalente: ip !== null && rendimiento > 0 ? rendimiento * ip : null };
}

export function rendimientosPorPartida(r: Resultados, c: Control): RendimientoPartida[] {
  const grupos = new Map<string, Medicion[]>();
  for (const m of c.mediciones) if (m.partidaId) grupos.set(m.partidaId, [...(grupos.get(m.partidaId) ?? []), m]);
  const hoja = new Map(r.hojas.map((h) => [h.partida.id, h.partida]));
  const res: RendimientoPartida[] = [];
  for (const [pid, ms] of grupos) {
    const p = hoja.get(pid);
    if (!p) continue;
    const { hhU, costoHH, rendimiento } = datosApu(r, pid);
    const cantidad = ms.reduce((s, m) => s + num(m.cantidad), 0);
    const hh = ms.reduce((s, m) => s + num(m.trabajadores) * num(m.horas), 0);
    const real = cantidad > 0 ? hh / cantidad : null;
    const ip = real && hhU > 0 ? hhU / real : null;
    res.push({
      partidaId: pid,
      codigo: p.codigo,
      descripcion: p.descripcion,
      unidad: p.unidad,
      cantidad,
      hh,
      hhUnidadPlan: hhU,
      hhUnidadReal: real,
      ip,
      rendimientoApu: rendimiento,
      rendimientoReal: ip !== null && rendimiento > 0 ? rendimiento * ip : null,
      desviacionMo: redondear((hh - hhU * cantidad) * costoHH),
      mediciones: ms.length,
    });
  }
  return res.sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
}

export function resumenCarta(x: Pick<CartaBalance, 'conteos'>) {
  const g: Record<GrupoTrabajo, number> = { TP: 0, TC: 0, TNC: 0 };
  for (const cat of CATEGORIAS_CARTA) g[cat.grupo] += num(x.conteos[cat.clave]);
  const total = g.TP + g.TC + g.TNC;
  const pct = (v: number) => (total ? (v / total) * 100 : 0);
  return { total, tp: pct(g.TP), tc: pct(g.TC), tnc: pct(g.TNC), conteos: g };
}

export function puntajeInspeccion(x: Pick<Inspeccion, 'items'>): number | null {
  const ev = x.items.filter((i) => i.resultado !== 'na');
  return ev.length ? (ev.filter((i) => i.resultado === 'si').length / ev.length) * 100 : null;
}
