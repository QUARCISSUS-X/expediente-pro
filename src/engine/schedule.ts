// Programación: calendario, CPM, periodos y cronogramas derivados.
import type {
  ActividadCalc, ApuCalc, Desembolso, FilaCronograma, FilaPresupuesto, Periodo, Pie, Programa, Proyecto, Valorizado,
} from './types';
import { diaSemana, difDias, fechaAIso, isoAFecha, mesAnio, num, redondear, sumarDias } from './util';

export class Calendario {
  private fechas: string[] = [];
  private cursor: string;
  private laborables: Set<number>;
  private feriados: Set<string>;
  constructor(public inicio: string, laborables: number[], feriados: string[]) {
    this.cursor = inicio;
    this.laborables = new Set(laborables.length ? laborables : [1, 2, 3, 4, 5, 6]);
    this.feriados = new Set(feriados);
  }
  esLaborable(iso: string): boolean {
    return this.laborables.has(diaSemana(iso)) && !this.feriados.has(iso);
  }
  /** fecha del día laborable i (0 = primer día laborable desde el inicio) */
  fecha(i: number): string {
    let guard = 0;
    while (this.fechas.length <= i && guard++ < 100000) {
      if (this.esLaborable(this.cursor)) this.fechas.push(this.cursor);
      this.cursor = sumarDias(this.cursor, 1);
    }
    return this.fechas[Math.max(0, i)];
  }
  laborablesEntre(desde: string, hasta: string): number {
    let n = 0;
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) if (this.esLaborable(d)) n++;
    return n;
  }
}

export function calcularPrograma(p: Proyecto, filas: FilaPresupuesto[], apus: Record<string, ApuCalc>): Programa {
  const errores: string[] = [];
  const hojas = filas.filter((f) => !f.esTitulo && f.metrado > 0);
  const ids = new Set(hojas.map((h) => h.partida.id));
  const act = new Map<string, ActividadCalc>();
  for (const h of hojas) {
    const cfg = p.programa[h.partida.id] ?? { predecesoras: [] };
    const rend = num(apus[h.partida.id]?.rendimiento);
    const cuad = Math.max(1, num(cfg.cuadrillas, 1));
    let dur: number;
    if (cfg.duracionManual !== null && cfg.duracionManual !== undefined && (cfg.duracionManual as unknown) !== '' && num(cfg.duracionManual) > 0) dur = Math.ceil(num(cfg.duracionManual));
    else if (rend > 0) dur = Math.max(1, Math.ceil(h.metrado / (rend * cuad) - 1e-9));
    else dur = 1;
    const preds = (cfg.predecesoras || []).filter((x) => {
      if (!ids.has(x.id)) {
        errores.push(`La partida ${h.partida.codigo} tiene una predecesora que no existe o no tiene metrado.`);
        return false;
      }
      if (x.id === h.partida.id) {
        errores.push(`La partida ${h.partida.codigo} no puede ser su propia predecesora.`);
        return false;
      }
      return true;
    });
    act.set(h.partida.id, {
      partidaId: h.partida.id,
      codigo: h.partida.codigo,
      descripcion: h.partida.descripcion,
      unidad: h.partida.unidad,
      metrado: h.metrado,
      rendimiento: rend,
      cuadrillas: cuad,
      duracion: dur,
      es: 0,
      ef: dur,
      ls: 0,
      lf: 0,
      holgura: 0,
      critica: false,
      inicio: '',
      fin: '',
      predecesoras: preds,
      parcial: h.parcial,
    });
  }

  // orden topológico
  const orden: ActividadCalc[] = [];
  const estado = new Map<string, number>();
  const visitar = (a: ActividadCalc, pila: string[]): void => {
    const e = estado.get(a.partidaId);
    if (e === 2) return;
    if (e === 1) {
      errores.push(`Hay un ciclo en las precedencias: ${[...pila, a.codigo].join(' → ')}.`);
      return;
    }
    estado.set(a.partidaId, 1);
    for (const pr of a.predecesoras) {
      const b = act.get(pr.id);
      if (b) visitar(b, [...pila, a.codigo]);
    }
    estado.set(a.partidaId, 2);
    orden.push(a);
  };
  for (const a of act.values()) visitar(a, []);

  // pasada hacia adelante
  for (const a of orden) {
    let es = 0;
    for (const pr of a.predecesoras) {
      const b = act.get(pr.id);
      if (!b) continue;
      const lag = num(pr.desfase);
      if (pr.tipo === 'CC') es = Math.max(es, b.es + lag);
      else if (pr.tipo === 'FF') es = Math.max(es, b.ef + lag - a.duracion);
      else es = Math.max(es, b.ef + lag);
    }
    a.es = Math.max(0, es);
    a.ef = a.es + a.duracion;
  }
  const fin = orden.reduce((m, a) => Math.max(m, a.ef), 0);
  // pasada hacia atrás
  for (const a of orden) a.lf = fin;
  for (let i = orden.length - 1; i >= 0; i--) {
    const a = orden[i];
    a.ls = a.lf - a.duracion;
    for (const pr of a.predecesoras) {
      const b = act.get(pr.id);
      if (!b) continue;
      const lag = num(pr.desfase);
      if (pr.tipo === 'CC') b.lf = Math.min(b.lf, a.ls - lag + b.duracion);
      else if (pr.tipo === 'FF') b.lf = Math.min(b.lf, a.lf - lag);
      else b.lf = Math.min(b.lf, a.ls - lag);
    }
  }
  const cal = new Calendario(p.meta.fechaInicio, p.meta.diasLaborables, p.meta.feriados);
  for (const a of orden) {
    a.ls = a.lf - a.duracion;
    a.holgura = a.ls - a.es;
    a.critica = a.holgura <= 0;
    a.inicio = cal.fecha(a.es);
    a.fin = cal.fecha(a.ef - 1);
  }
  const actividades = hojas.map((h) => act.get(h.partida.id)!).filter(Boolean);
  const diaFecha: string[] = [];
  for (let i = 0; i < fin; i++) diaFecha.push(cal.fecha(i));
  const inicio = p.meta.fechaInicio;
  const fechaFin = fin > 0 ? cal.fecha(fin - 1) : inicio;
  const plazoDias = fin > 0 ? difDias(inicio, fechaFin) + 1 : 0;
  const periodos = construirPeriodos(p, inicio, fechaFin, cal);
  return {
    actividades,
    diasLaborables: fin,
    plazoDias,
    plazoMeses: redondear(plazoDias / 30, 2),
    inicio,
    fin: fechaFin,
    periodos,
    diaFecha,
    errores,
  };
}

function construirPeriodos(p: Proyecto, inicio: string, fin: string, cal: Calendario): Periodo[] {
  const out: Periodo[] = [];
  if (!inicio) return out;
  if (p.meta.periodo === 'mes') {
    let desde = inicio;
    let n = 1;
    while (desde <= fin || n === 1) {
      const f = isoAFecha(desde);
      const ultimo = fechaAIso(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)));
      const hasta = ultimo;
      out.push({ n, etiqueta: mesAnio(desde), inicio: desde, fin: hasta, diasLaborables: cal.laborablesEntre(desde, hasta) });
      desde = sumarDias(hasta, 1);
      n++;
      if (n > 600) break;
    }
  } else {
    let n = 1;
    let desde = inicio;
    while (desde <= fin || n === 1) {
      const hasta = sumarDias(desde, 29);
      out.push({ n, etiqueta: `Mes ${n}`, inicio: desde, fin: hasta, diasLaborables: cal.laborablesEntre(desde, hasta) });
      desde = sumarDias(hasta, 1);
      n++;
      if (n > 600) break;
    }
  }
  return out;
}

export function periodoDeFecha(periodos: Periodo[], iso: string): number {
  // devuelve índice 0..n-1, -1 si es anterior al inicio
  if (!periodos.length || iso < periodos[0].inicio) return -1;
  for (let i = 0; i < periodos.length; i++) if (iso <= periodos[i].fin) return i;
  return periodos.length - 1;
}

/** Ajusta el redondeo de una serie para que sume exactamente el total. */
function cuadrar(valores: number[], total: number, dec = 2): number[] {
  const r = valores.map((v) => redondear(v, dec));
  const dif = redondear(total - r.reduce((a, b) => a + b, 0), dec);
  if (dif !== 0) {
    let idx = -1;
    for (let i = r.length - 1; i >= 0; i--) if (r[i] !== 0) { idx = i; break; }
    if (idx < 0) idx = r.length - 1;
    if (idx >= 0) r[idx] = redondear(r[idx] + dif, dec);
  }
  return r;
}

export function calcularValorizado(prog: Programa, pie: Pie): Valorizado {
  const P = prog.periodos.length;
  const diaPeriodo = prog.diaFecha.map((f) => Math.max(0, periodoDeFecha(prog.periodos, f)));
  const filas: FilaCronograma[] = prog.actividades.map((a) => {
    const v = new Array(P).fill(0);
    for (let d = a.es; d < a.ef; d++) v[diaPeriodo[d] ?? P - 1] += a.parcial / a.duracion;
    return { clave: a.partidaId, codigo: a.codigo, descripcion: a.descripcion, unidad: a.unidad, total: a.parcial, valores: cuadrar(v, a.parcial) };
  });
  const cd = new Array(P).fill(0);
  for (const f of filas) f.valores.forEach((v, i) => (cd[i] += v));
  const cdR = cd.map((x) => redondear(x, 2));
  const totalCD = redondear(cdR.reduce((a, b) => a + b, 0), 2);
  const prop = (monto: number) => cuadrar(cdR.map((x) => (totalCD > 0 ? (monto * x) / totalCD : 0)), monto);
  const gg = prop(pie.gg);
  const utilidad = prop(pie.utilidad);
  const subtotal = cdR.map((x, i) => redondear(x + gg[i] + utilidad[i], 2));
  const igv = prop(pie.igv);
  const total = subtotal.map((x, i) => redondear(x + igv[i], 2));
  const avancePct = cdR.map((x) => (totalCD > 0 ? redondear((x / totalCD) * 100, 2) : 0));
  const acumuladoPct: number[] = [];
  const acumulado: number[] = [];
  let ac = 0;
  let acm = 0;
  cdR.forEach((x, i) => {
    ac += x;
    acm += total[i];
    acumuladoPct.push(totalCD > 0 ? redondear((ac / totalCD) * 100, 2) : 0);
    acumulado.push(redondear(acm, 2));
  });
  return { filas, cd: cdR, gg, utilidad, subtotal, igv, total, avancePct, acumuladoPct, acumulado };
}

interface OpcionesDistribucion {
  tipos: ('MO' | 'MAT' | 'EQ' | 'SC')[];
  conPrevio: boolean;
  anticipacion?: (codigo: string) => number;
}

/** Distribuye cantidades de insumos (por día laborable de cada actividad) en los periodos. */
export function distribuirInsumos(
  prog: Programa,
  apus: Record<string, ApuCalc>,
  op: OpcionesDistribucion,
): { filas: FilaCronograma[]; diario: Map<string, number[]> } {
  const P = prog.periodos.length;
  const L = op.conPrevio ? P + 1 : P;
  const acum = new Map<string, FilaCronograma>();
  const diario = new Map<string, number[]>();
  const precios = new Map<string, number>();
  for (const a of prog.actividades) {
    const apu = apus[a.partidaId];
    if (!apu) continue;
    for (const it of apu.items) {
      if (it.porcentaje !== null || !op.tipos.includes(it.insumo.tipo)) continue;
      const total = a.metrado * it.cantidad;
      if (total === 0) continue;
      const porDia = total / a.duracion;
      let fila = acum.get(it.insumo.codigo);
      if (!fila) {
        fila = { clave: it.insumo.codigo, codigo: it.insumo.codigo, descripcion: it.insumo.descripcion, unidad: it.insumo.unidad, total: 0, valores: new Array(L).fill(0), montos: new Array(L).fill(0) };
        acum.set(it.insumo.codigo, fila);
        diario.set(it.insumo.codigo, new Array(prog.diasLaborables).fill(0));
      }
      const serie = diario.get(it.insumo.codigo)!;
      const ant = op.anticipacion ? op.anticipacion(it.insumo.codigo) : 0;
      for (let d = a.es; d < a.ef; d++) {
        serie[d] += porDia;
        const fecha = ant > 0 ? sumarDias(prog.diaFecha[d], -ant) : prog.diaFecha[d];
        let idx = periodoDeFecha(prog.periodos, fecha);
        if (op.conPrevio) idx = idx + 1; // -1 -> 0 (previo)
        else idx = Math.max(0, idx);
        fila.valores[idx] += porDia;
        fila.montos![idx] += porDia * it.insumo.precio;
      }
      fila.total += total;
      precios.set(it.insumo.codigo, it.insumo.precio);
    }
  }
  const filas = [...acum.values()].map((f) => {
    const total = redondear(f.total, 2);
    const valores = cuadrar(f.valores, total);
    const precio = precios.get(f.codigo) ?? 0;
    return { ...f, total, valores, montos: valores.map((v) => redondear(v * precio, 2)) };
  });
  filas.sort((a, b) => a.descripcion.localeCompare(b.descripcion));
  return { filas, diario };
}

export function calcularDesembolsos(p: Proyecto, prog: Programa, val: Valorizado, pie: Pie): Desembolso[] {
  const adD = redondear((pie.total * num(p.meta.adelantoDirectoPct)) / 100, 2);
  const adM = redondear((pie.total * num(p.meta.adelantoMaterialesPct)) / 100, 2);
  const out: Desembolso[] = [];
  let acum = 0;
  if (adD + adM > 0) {
    acum = redondear(adD + adM, 2);
    out.push({ periodo: 'Adelantos', valorizacion: 0, adelantoDirecto: adD, adelantoMateriales: adM, amortizacion: 0, neto: acum, acumulado: acum });
  }
  const amort = val.total.map((v) => (pie.total > 0 ? ((adD + adM) * v) / pie.total : 0));
  const amortR = cuadrar(amort, adD + adM);
  prog.periodos.forEach((per, i) => {
    const v = val.total[i] ?? 0;
    const neto = redondear(v - amortR[i], 2);
    acum = redondear(acum + neto, 2);
    out.push({ periodo: per.etiqueta, valorizacion: v, adelantoDirecto: 0, adelantoMateriales: 0, amortizacion: amortR[i], neto, acumulado: acum });
  });
  return out;
}
