// Histograma semanal de horas-hombre y horas-máquina, plan vs. real.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { type Resultados } from '../types';
import { num, redondear } from '../util';
import { lunesDe } from './fechas';
import { type Control } from './modelo';

// ======================================================================= recursos por semana

export interface SemanaRecursos {
  lunes: string;
  hhPlan: number;
  hhReal: number;
  hmPlan: number; // horas-máquina de equipos
  trabajadoresPlan: number; // promedio diario
  trabajadoresReal: number;
  diasLaborables: number;
}

export function recursosSemanales(r: Resultados, c: Control): SemanaRecursos[] {
  const prog = r.programa;
  if (!prog.diaFecha.length) return [];
  const jornada = num(r.proyecto.meta.jornadaHoras, 8) || 8;
  const semanas = new Map<string, SemanaRecursos>();
  const sem = (lunes: string) => {
    let s = semanas.get(lunes);
    if (!s) semanas.set(lunes, (s = { lunes, hhPlan: 0, hhReal: 0, hmPlan: 0, trabajadoresPlan: 0, trabajadoresReal: 0, diasLaborables: 0 }));
    return s;
  };
  const diasPorSemana = new Map<string, number>();
  for (const d of prog.diaFecha) diasPorSemana.set(lunesDe(d), (diasPorSemana.get(lunesDe(d)) ?? 0) + 1);
  for (const a of prog.actividades) {
    const apu = r.apus[a.partidaId];
    if (!apu || a.duracion <= 0) continue;
    const hhU = apu.items.filter((it) => it.insumo.tipo === 'MO' && !it.porcentaje).reduce((s, it) => s + it.cantidad, 0);
    const hmU = apu.items.filter((it) => it.insumo.tipo === 'EQ' && !it.porcentaje && /^h/i.test(it.insumo.unidad)).reduce((s, it) => s + it.cantidad, 0);
    const hhDia = (hhU * a.metrado) / a.duracion;
    const hmDia = (hmU * a.metrado) / a.duracion;
    for (let d = a.es; d < a.ef; d++) {
      const f = prog.diaFecha[d];
      if (!f) continue;
      const s = sem(lunesDe(f));
      s.hhPlan += hhDia;
      s.hmPlan += hmDia;
    }
  }
  for (const m of c.mediciones) if (m.fecha) sem(lunesDe(m.fecha)).hhReal += num(m.trabajadores) * num(m.horas);
  return [...semanas.values()]
    .sort((a, b) => a.lunes.localeCompare(b.lunes))
    .map((s) => {
      const dl = diasPorSemana.get(s.lunes) ?? 0;
      return {
        ...s,
        hhPlan: redondear(s.hhPlan, 1),
        hhReal: redondear(s.hhReal, 1),
        hmPlan: redondear(s.hmPlan, 1),
        diasLaborables: dl,
        trabajadoresPlan: dl > 0 ? redondear(s.hhPlan / (jornada * dl), 1) : 0,
        trabajadoresReal: dl > 0 ? redondear(s.hhReal / (jornada * dl), 1) : 0,
      };
    });
}
