// Last Planner System: plan maestro, fases, lookahead, restricciones, plan semanal, PPC.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { todasLasRestricciones } from '../integracion';
import { type Resultados } from '../types';
import { num, redondear, sumarDias, uid } from '../util';
import { calendarioDe, hoyIso, lunesDe, retrocederLaborables } from './fechas';
import { type Compromiso, type CompromisoFase, type Control, type Hito } from './modelo';

// ======================================================================= Last Planner

export interface FilaLookahead {
  partidaId: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  inicio: string;
  fin: string;
  critica: boolean;
  semanas: number[]; // metrado previsto por semana de la ventana
  restriccionesAbiertas: number;
  restriccionesVencidas: number;
  lista: boolean;
}

/** Ventana de N semanas desde un lunes: actividades del cronograma y su estado de restricciones. */
export function lookahead(r: Resultados, c: Control, desde: string, nSemanas: number, hoy = hoyIso()): { lunes: string[]; filas: FilaLookahead[] } {
  const lunes = Array.from({ length: nSemanas }, (_, i) => sumarDias(lunesDe(desde), 7 * i));
  const finVentana = sumarDias(lunes[lunes.length - 1], 6);
  const prog = r.programa;
  const filas: FilaLookahead[] = [];
  const todas = todasLasRestricciones(r, c, hoy); // registradas + automáticas (kanban, calidad, RFI)
  for (const a of prog.actividades) {
    if (!a.inicio || a.fin < lunes[0] || a.inicio > finVentana) continue;
    const semanas = lunes.map((l) => {
      const fin = sumarDias(l, 6);
      let dias = 0;
      for (let d = a.es; d < a.ef; d++) {
        const f = prog.diaFecha[d];
        if (f && f >= l && f <= fin) dias++;
      }
      return a.duracion > 0 ? redondear((a.metrado * dias) / a.duracion, 2) : 0;
    });
    const rs = todas.filter((x) => x.partidaId === a.partidaId && !x.liberada);
    filas.push({
      partidaId: a.partidaId,
      codigo: a.codigo,
      descripcion: a.descripcion,
      unidad: a.unidad,
      inicio: a.inicio,
      fin: a.fin,
      critica: a.critica,
      semanas,
      restriccionesAbiertas: rs.length,
      restriccionesVencidas: rs.filter((x) => x.fechaRequerida && x.fechaRequerida < hoy).length,
      lista: rs.length === 0,
    });
  }
  return { lunes, filas };
}

/** Compromisos propuestos para la semana: actividades activas y sin restricciones abiertas. */
export function compromisosSugeridos(r: Resultados, c: Control, lunes: string): Compromiso[] {
  const { filas } = lookahead(r, c, lunes, 1);
  return filas
    .filter((f) => f.lista && f.semanas[0] > 0)
    .map((f) => ({
      id: uid('cmp'),
      partidaId: f.partidaId,
      descripcion: f.descripcion,
      responsable: '',
      frenteId: c.frentes.find((x) => x.partidas.includes(f.partidaId))?.id ?? '',
      metrado: f.semanas[0],
      cumplido: null,
      causa: '',
      nota: '',
    }));
}

export interface PpcSemana {
  semanaId: string;
  lunes: string;
  total: number;
  evaluados: number;
  cumplidos: number;
  ppc: number | null; // %
}

export function calcularPpc(c: Control): { semanas: PpcSemana[]; promedio: number | null; ultimo: PpcSemana | null } {
  const semanas = [...c.semanas]
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((s) => {
      const ev = s.compromisos.filter((x) => x.cumplido !== null && x.cumplido !== undefined);
      const ok = ev.filter((x) => x.cumplido === true).length;
      return { semanaId: s.id, lunes: s.inicio, total: s.compromisos.length, evaluados: ev.length, cumplidos: ok, ppc: ev.length ? (ok / ev.length) * 100 : null };
    });
  const conDato = semanas.filter((s) => s.ppc !== null);
  const totEv = conDato.reduce((a, s) => a + s.evaluados, 0);
  const totOk = conDato.reduce((a, s) => a + s.cumplidos, 0);
  return { semanas, promedio: totEv ? (totOk / totEv) * 100 : null, ultimo: conDato[conDato.length - 1] ?? null };
}

export interface ItemPareto {
  clave: string;
  valor: number;
  pct: number;
  acumuladoPct: number;
}

export function pareto(datos: Record<string, number>): ItemPareto[] {
  const items = Object.entries(datos)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = items.reduce((s, [, v]) => s + v, 0);
  let acc = 0;
  return items.map(([clave, valor]) => {
    acc += valor;
    return { clave, valor, pct: total ? (valor / total) * 100 : 0, acumuladoPct: total ? (acc / total) * 100 : 0 };
  });
}

export function causasNoCumplimiento(c: Control): ItemPareto[] {
  const d: Record<string, number> = {};
  for (const s of c.semanas) for (const x of s.compromisos) if (x.cumplido === false) d[x.causa || 'Sin causa registrada'] = (d[x.causa || 'Sin causa registrada'] ?? 0) + 1;
  return pareto(d);
}

export function resumenRestricciones(c: Control, hoy = hoyIso()) {
  const total = c.restricciones.length;
  const liberadas = c.restricciones.filter((x) => x.liberada);
  const abiertas = total - liberadas.length;
  const vencidas = c.restricciones.filter((x) => !x.liberada && x.fechaRequerida && x.fechaRequerida < hoy).length;
  const aTiempo = liberadas.filter((x) => !x.fechaRequerida || !x.fechaLiberacion || x.fechaLiberacion <= x.fechaRequerida).length;
  const porTipo: Record<string, number> = {};
  for (const x of c.restricciones) porTipo[x.tipo || 'Otros'] = (porTipo[x.tipo || 'Otros'] ?? 0) + 1;
  return { total, liberadas: liberadas.length, abiertas, vencidas, liberadasATiempoPct: liberadas.length ? (aTiempo / liberadas.length) * 100 : null, porTipo };
}

/** Programación hacia atrás (pull) de los compromisos de un hito. */
export function programarFase(r: Resultados, c: Control, hitoId: string): (CompromisoFase & { inicio: string; fin: string })[] {
  const hito = c.hitos.find((h) => h.id === hitoId);
  if (!hito || !hito.fecha) return [];
  const cal = calendarioDe(r, sumarDias(hito.fecha, -800));
  const lista = c.fases.filter((f) => f.hitoId === hitoId).sort((a, b) => a.orden - b.orden);
  const res: (CompromisoFase & { inicio: string; fin: string })[] = [];
  let fin = sumarDias(hito.fecha, -1);
  for (const f of lista) {
    const finReal = retrocederLaborables(cal, fin, 1);
    const inicio = retrocederLaborables(cal, finReal, Math.max(1, Math.round(num(f.duracion, 1))));
    res.push({ ...f, inicio, fin: finReal });
    fin = sumarDias(inicio, -1);
  }
  return res;
}

/** Hitos sugeridos: fin de cada título de primer nivel del presupuesto y fin de obra. */
export function hitosDesdeCronograma(r: Resultados): Hito[] {
  const titulos = r.filas.filter((f) => f.esTitulo && f.nivel === 1);
  const hitos: Hito[] = [];
  for (const t of titulos) {
    const pref = t.partida.codigo + '.';
    const acts = r.programa.actividades.filter((a) => a.codigo.startsWith(pref));
    if (!acts.length) continue;
    const ult = acts.reduce((a, b) => (b.fin > a.fin ? b : a));
    hitos.push({ id: uid('hito'), nombre: `Fin de ${t.partida.descripcion.toLowerCase()}`, fecha: ult.fin, partidaId: ult.partidaId, cumplido: false, fechaReal: '' });
  }
  if (r.programa.fin) hitos.push({ id: uid('hito'), nombre: 'Fin de obra', fecha: r.programa.fin, partidaId: '', cumplido: false, fechaReal: '' });
  return hitos;
}
