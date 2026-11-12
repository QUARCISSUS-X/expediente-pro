// Programación: calendario, CPM, periodos y cronogramas derivados.
import type {
  ActividadCalc, ApuCalc, Desembolso, FilaCronograma, FilaPresupuesto, Periodo, Pie, Pred, Programa, Proyecto, TipoPred, Valorizado,
} from './types';
import { diaSemana, difDias, fechaAIso, isoAFecha, mesAnio, num, redondear, sumarDias } from './util';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export class Calendario {
  private fechas: string[] = [];
  private cursor: string;
  private laborables: Set<number>;
  private feriados: Set<string>;
  private acum = new Map<string, number>();
  private cursorAcum = '';
  private nAcum = 0;
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
  /** Días laborables en [desde, hasta]. Usa un acumulado en caché: después de la primera consulta cuesta O(1). */
  laborablesEntre(desde: string, hasta: string): number {
    if (hasta < desde) return 0;
    if (desde < this.inicio || !ISO.test(desde) || !ISO.test(hasta)) {
      let n = 0;
      for (let d = desde, g = 0; d <= hasta && g < 200000; d = sumarDias(d, 1), g++) if (this.esLaborable(d)) n++;
      return n;
    }
    return this.acumHasta(hasta) - this.acumHasta(desde) + (this.esLaborable(desde) ? 1 : 0);
  }
  /** Laborables en [inicio, iso] (iso ≥ inicio). */
  private acumHasta(iso: string): number {
    const v = this.acum.get(iso);
    if (v !== undefined) return v;
    if (this.cursorAcum === '') this.cursorAcum = this.inicio;
    let g = 0;
    while (this.cursorAcum <= iso && g++ < 200000) {
      if (this.esLaborable(this.cursorAcum)) this.nAcum++;
      this.acum.set(this.cursorAcum, this.nAcum);
      this.cursorAcum = sumarDias(this.cursorAcum, 1);
    }
    return this.acum.get(iso) ?? this.nAcum;
  }
}

// ------------------------------------------------------------------ red CPM reutilizable

/** Red de precedencias por índices: orden topológico y predecesoras con tipo y desfase. */
export interface RedCpm {
  ids: string[];
  preds: { i: number; tipo: TipoPred; desfase: number }[][];
  orden: number[]; // índices en orden topológico
}

/** Arma la red y su orden topológico; los ciclos se informan en errores y se cortan. */
export function construirRed(nodos: { id: string; codigo?: string; predecesoras: Pred[] }[], errores: string[] = []): RedCpm {
  const idx = new Map(nodos.map((n, i) => [n.id, i]));
  const preds = nodos.map((n) => n.predecesoras.filter((x) => idx.has(x.id) && x.id !== n.id).map((x) => ({ i: idx.get(x.id)!, tipo: x.tipo, desfase: num(x.desfase) })));
  const orden: number[] = [];
  const estado = new Uint8Array(nodos.length);
  const visitar = (i: number, pila: number[]): void => {
    if (estado[i] === 2) return;
    if (estado[i] === 1) {
      errores.push(`Hay un ciclo en las precedencias: ${[...pila, i].map((k) => nodos[k].codigo ?? nodos[k].id).join(' → ')}.`);
      return;
    }
    estado[i] = 1;
    for (const pr of preds[i]) visitar(pr.i, [...pila, i]);
    estado[i] = 2;
    orden.push(i);
  };
  for (let i = 0; i < nodos.length; i++) visitar(i, []);
  // las aristas que cerraban un ciclo no se usan en las pasadas
  const pos = new Int32Array(nodos.length);
  orden.forEach((i, k) => (pos[i] = k));
  return { ids: nodos.map((n) => n.id), preds: preds.map((ps, i) => ps.filter((pr) => pos[pr.i] < pos[i])), orden };
}

/** Red de las actividades del cronograma calculado (mismas predecesoras y desfases). */
export function redDePrograma(prog: Programa): RedCpm {
  return construirRed(prog.actividades.map((a) => ({ id: a.partidaId, codigo: a.codigo, predecesoras: a.predecesoras })));
}

export interface PasadasCpm {
  es: Float64Array;
  ef: Float64Array;
  ls: Float64Array;
  lf: Float64Array;
  fin: number;
}

/** Pasadas hacia adelante y hacia atrás del método de la ruta crítica (FC, CC y FF con desfase). */
export function pasadasCpm(red: RedCpm, dur: ArrayLike<number>, sal?: PasadasCpm): PasadasCpm {
  const n = red.ids.length;
  const o = sal ?? { es: new Float64Array(n), ef: new Float64Array(n), ls: new Float64Array(n), lf: new Float64Array(n), fin: 0 };
  const { es, ef, ls, lf, preds, orden } = { ...o, preds: red.preds, orden: red.orden };
  for (const a of orden) {
    let e = 0;
    for (const pr of preds[a]) {
      const b = pr.i;
      if (pr.tipo === 'CC') e = Math.max(e, es[b] + pr.desfase);
      else if (pr.tipo === 'FF') e = Math.max(e, ef[b] + pr.desfase - dur[a]);
      else e = Math.max(e, ef[b] + pr.desfase);
    }
    es[a] = Math.max(0, e);
    ef[a] = es[a] + dur[a];
  }
  let fin = 0;
  for (const a of orden) fin = Math.max(fin, ef[a]);
  for (const a of orden) lf[a] = fin;
  for (let k = orden.length - 1; k >= 0; k--) {
    const a = orden[k];
    ls[a] = lf[a] - dur[a];
    for (const pr of preds[a]) {
      const b = pr.i;
      if (pr.tipo === 'CC') lf[b] = Math.min(lf[b], ls[a] - pr.desfase + dur[b]);
      else if (pr.tipo === 'FF') lf[b] = Math.min(lf[b], lf[a] - pr.desfase);
      else lf[b] = Math.min(lf[b], ls[a] - pr.desfase);
    }
  }
  for (let a = 0; a < n; a++) ls[a] = lf[a] - dur[a];
  o.fin = fin;
  return o;
}

// Cronograma incremental: la red CPM, sus pasadas y las fechas se reutilizan mientras no cambien las duraciones,
// las precedencias (p.programa, por referencia) ni el calendario. Solo lo usa recalcular() (ver engine/index.ts).
interface CpmEnCache {
  firma: string;
  cal: string;
  erroresRed: string[];
  es: Float64Array;
  ef: Float64Array;
  lf: Float64Array;
  fin: number;
  fechas: { inicio: string; fin: string }[];
  diaFecha: string[];
  periodos: Periodo[];
}
const cacheCpm = new WeakMap<Proyecto['programa'], CpmEnCache>();

export function calcularPrograma(p: Proyecto, filas: FilaPresupuesto[], apus: Record<string, ApuCalc>, incremental = false): Programa {
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

  // red CPM (orden topológico + pasadas hacia adelante y atrás), compartida con Monte Carlo y cadena crítica
  const lista = [...act.values()];
  const firma = lista.map((a) => `${a.partidaId}:${a.duracion}`).join('|');
  const claveCal = `${p.meta.fechaInicio}|${p.meta.diasLaborables.join(',')}|${p.meta.feriados.join(',')}|${p.meta.periodo}`;
  let c = incremental ? cacheCpm.get(p.programa) : undefined;
  if (!c || c.firma !== firma || c.cal !== claveCal) {
    const erroresRed: string[] = [];
    const red = construirRed(lista.map((a) => ({ id: a.partidaId, codigo: a.codigo, predecesoras: a.predecesoras })), erroresRed);
    const res = pasadasCpm(red, lista.map((a) => a.duracion));
    const cal = new Calendario(p.meta.fechaInicio, p.meta.diasLaborables, p.meta.feriados);
    const fechas = lista.map((a, i) => ({ inicio: cal.fecha(res.es[i]), fin: cal.fecha(res.ef[i] - 1) }));
    const diaFecha: string[] = [];
    for (let i = 0; i < res.fin; i++) diaFecha.push(cal.fecha(i));
    const fechaFin = res.fin > 0 ? cal.fecha(res.fin - 1) : p.meta.fechaInicio;
    c = { firma, cal: claveCal, erroresRed, es: res.es, ef: res.ef, lf: res.lf, fin: res.fin, fechas, diaFecha, periodos: construirPeriodos(p, p.meta.fechaInicio, fechaFin, cal) };
    if (incremental) cacheCpm.set(p.programa, c);
  }
  errores.push(...c.erroresRed);
  lista.forEach((a, i) => {
    a.es = c.es[i];
    a.ef = c.ef[i];
    a.lf = c.lf[i];
    a.ls = a.lf - a.duracion;
    a.holgura = a.ls - a.es;
    a.critica = a.holgura <= 0;
    a.inicio = c.fechas[i].inicio;
    a.fin = c.fechas[i].fin;
  });
  const fin = c.fin;
  const actividades = hojas.map((h) => act.get(h.partida.id)!).filter(Boolean);
  const diaFecha = [...c.diaFecha];
  const inicio = p.meta.fechaInicio;
  const fechaFin = fin > 0 ? c.diaFecha[fin - 1] : inicio;
  const plazoDias = fin > 0 ? difDias(inicio, fechaFin) + 1 : 0;
  const periodos = c.periodos.map((x) => ({ ...x }));
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
