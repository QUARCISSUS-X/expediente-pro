// Riesgo de plazo y costo: simulación Monte Carlo sobre la red CPM del cronograma (PERT-Beta o triangular).
// Usa la misma red y las mismas pasadas del cronograma (schedule.ts); solo cambian las duraciones de cada iteración.
import { Calendario, pasadasCpm, redDePrograma, type PasadasCpm } from './schedule';
import type { Resultados } from './types';
import { difDias, num, redondear } from './util';

// ======================================================================= modelo

export type Distribucion = 'pert' | 'triangular';
export type ModoCosto = 'ninguno' | 'global' | 'partida';

/** Tres valores por actividad (vacío = se usa el ± % general sobre el cronograma o el presupuesto). */
export interface EstimacionActividad {
  optimista: number | null;
  probable: number | null;
  pesimista: number | null;
  costoOptimista: number | null;
  costoProbable: number | null;
  costoPesimista: number | null;
}

export interface ResumenRiesgo {
  fecha: string;
  huella: string;
  iteraciones: number;
  p50Dias: number;
  p80Dias: number;
  p90Dias: number;
  p50Fecha: string;
  p80Fecha: string;
  p90Fecha: string;
  p50Costo: number | null;
  p80Costo: number | null;
  p90Costo: number | null;
  probPlazo: number;
  probCosto: number | null;
}

export interface ConfigRiesgo {
  distribucion: Distribucion;
  iteraciones: number;
  semilla: number;
  optimistaPct: number; // % de reducción sobre la duración del cronograma
  pesimistaPct: number; // % de aumento
  costoModo: ModoCosto;
  costoOptimistaPct: number;
  costoPesimistaPct: number;
  estimaciones: Record<string, EstimacionActividad>;
  plazoMeta: string; // fecha contractual de término ('' = fin de la línea base o del cronograma)
  presupuestoMeta: number | null; // costo directo meta (null = costo directo contractual)
  resumen: ResumenRiesgo | null;
}

export function configRiesgoVacia(): ConfigRiesgo {
  return {
    distribucion: 'pert',
    iteraciones: 2000,
    semilla: 12345,
    optimistaPct: 15,
    pesimistaPct: 35,
    costoModo: 'global',
    costoOptimistaPct: 5,
    costoPesimistaPct: 15,
    estimaciones: {},
    plazoMeta: '',
    presupuestoMeta: null,
    resumen: null,
  };
}

export function normalizarConfigRiesgo(x: unknown): ConfigRiesgo {
  const v = configRiesgoVacia();
  const c = (x && typeof x === 'object' ? x : {}) as Partial<ConfigRiesgo>;
  return {
    distribucion: c.distribucion === 'triangular' ? 'triangular' : 'pert',
    iteraciones: Math.min(10000, Math.max(1000, Math.round(num(c.iteraciones, v.iteraciones)))),
    semilla: Math.round(num(c.semilla, v.semilla)),
    optimistaPct: num(c.optimistaPct, v.optimistaPct),
    pesimistaPct: num(c.pesimistaPct, v.pesimistaPct),
    costoModo: c.costoModo === 'ninguno' || c.costoModo === 'partida' ? c.costoModo : 'global',
    costoOptimistaPct: num(c.costoOptimistaPct, v.costoOptimistaPct),
    costoPesimistaPct: num(c.costoPesimistaPct, v.costoPesimistaPct),
    estimaciones: c.estimaciones && typeof c.estimaciones === 'object' ? c.estimaciones : {},
    plazoMeta: typeof c.plazoMeta === 'string' ? c.plazoMeta : '',
    presupuestoMeta: c.presupuestoMeta === null || c.presupuestoMeta === undefined ? null : num(c.presupuestoMeta),
    resumen: c.resumen ?? null,
  };
}

// ======================================================================= números aleatorios y distribuciones

/** Generador con semilla (mulberry32): mismas entradas y semilla → mismos resultados. */
export function generador(semilla: number): () => number {
  let a = semilla >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(u: () => number): number {
  let x = 0;
  while (x === 0) x = u();
  return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u());
}

/** Gamma(forma ≥ 1, escala 1) por el método de Marsaglia y Tsang. */
function gamma(forma: number, u: () => number): number {
  const d = forma - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let guard = 0; guard < 1000; guard++) {
    let x: number;
    let v: number;
    do {
      x = normal(u);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const w = u();
    if (w < 1 - 0.0331 * x ** 4 || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d;
}

export function muestraTriangular(a: number, m: number, b: number, u: () => number): number {
  if (b <= a) return m;
  const p = u();
  const fc = (m - a) / (b - a);
  return p < fc ? a + Math.sqrt(p * (b - a) * (m - a)) : b - Math.sqrt((1 - p) * (b - a) * (b - m));
}

/** PERT-Beta: α = 1 + 4(m − a)/(b − a), β = 1 + 4(b − m)/(b − a); media (a + 4m + b) / 6. */
export function muestraPert(a: number, m: number, b: number, u: () => number): number {
  if (b <= a) return m;
  const al = 1 + (4 * (m - a)) / (b - a);
  const be = 1 + (4 * (b - m)) / (b - a);
  const x = gamma(al, u);
  const y = gamma(be, u);
  return a + ((b - a) * x) / (x + y);
}

export const mediaPert = (a: number, m: number, b: number) => (a + 4 * m + b) / 6;
export const mediaTriangular = (a: number, m: number, b: number) => (a + m + b) / 3;

// ======================================================================= estadística

export interface Estadistica {
  n: number;
  media: number;
  desviacion: number;
  min: number;
  max: number;
  p10: number;
  p50: number;
  p80: number;
  p90: number;
  histograma: { desde: number; hasta: number; n: number }[];
  acumulada: { x: number; pct: number }[]; // curva S de probabilidad
}

/** Percentil por interpolación lineal sobre datos ordenados (p en 0..100). */
export function percentil(ordenados: ArrayLike<number>, p: number): number {
  const n = ordenados.length;
  if (!n) return 0;
  const h = ((n - 1) * p) / 100;
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (h - lo);
}

export function estadistica(valores: ArrayLike<number>, clases = 24): Estadistica {
  const v = Float64Array.from(valores).sort();
  const n = v.length;
  if (!n) return { n: 0, media: 0, desviacion: 0, min: 0, max: 0, p10: 0, p50: 0, p80: 0, p90: 0, histograma: [], acumulada: [] };
  let s = 0;
  for (const x of v) s += x;
  const media = s / n;
  let q = 0;
  for (const x of v) q += (x - media) ** 2;
  const min = v[0];
  const max = v[n - 1];
  const k = max > min ? clases : 1;
  const ancho = max > min ? (max - min) / k : 1;
  const histograma = Array.from({ length: k }, (_, i) => ({ desde: min + ancho * i, hasta: min + ancho * (i + 1), n: 0 }));
  for (const x of v) histograma[Math.min(k - 1, Math.floor((x - min) / ancho))].n++;
  const acumulada: Estadistica['acumulada'] = [];
  const pasos = Math.min(n, 60);
  for (let i = 0; i <= pasos; i++) {
    const idx = Math.min(n - 1, Math.round(((n - 1) * i) / pasos));
    acumulada.push({ x: v[idx], pct: ((idx + 1) / n) * 100 });
  }
  return { n, media, desviacion: n > 1 ? Math.sqrt(q / (n - 1)) : 0, min, max, p10: percentil(v, 10), p50: percentil(v, 50), p80: percentil(v, 80), p90: percentil(v, 90), histograma, acumulada };
}

// ======================================================================= simulación

export interface EntradaActividad {
  partidaId: string;
  codigo: string;
  descripcion: string;
  duracion: number; // del cronograma
  o: number;
  m: number;
  p: number;
  costo: number; // parcial del presupuesto (costo directo)
  co: number;
  cm: number;
  cp: number;
  propia: boolean; // tiene tres valores propios
}

export interface EntradaSimulacion {
  config: ConfigRiesgo;
  actividades: EntradaActividad[];
  inicio: string;
  deterministaDias: number;
  deterministaCosto: number;
  metaFecha: string;
  metaDias: number;
  metaCosto: number;
  huella: string;
}

function huellaDe(x: unknown): string {
  const t = JSON.stringify(x);
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Prepara la simulación con el cronograma y el presupuesto actuales. */
export function entradaSimulacion(r: Resultados, cfg: ConfigRiesgo, base?: { fin: string; costoDirecto: number } | null): EntradaSimulacion {
  const prog = r.programa;
  const kO = Math.max(0, 1 - num(cfg.optimistaPct) / 100);
  const kP = 1 + Math.max(0, num(cfg.pesimistaPct)) / 100;
  const cO = Math.max(0, 1 - num(cfg.costoOptimistaPct) / 100);
  const cP = 1 + Math.max(0, num(cfg.costoPesimistaPct)) / 100;
  const vacio = (v: number | null | undefined) => v === null || v === undefined || (v as unknown) === '' || !isFinite(Number(v));
  const actividades: EntradaActividad[] = prog.actividades.map((a) => {
    const e = cfg.estimaciones[a.partidaId];
    const propia = !!e && !vacio(e.optimista) && !vacio(e.pesimista);
    const m = e && !vacio(e.probable) ? num(e.probable) : a.duracion;
    let o = propia ? num(e!.optimista) : a.duracion * kO;
    let p = propia ? num(e!.pesimista) : a.duracion * kP;
    o = Math.max(0, Math.min(o, m));
    p = Math.max(p, m);
    const cm = cfg.costoModo === 'partida' && e && !vacio(e.costoProbable) ? num(e.costoProbable) : a.parcial;
    let co = cm;
    let cp = cm;
    if (cfg.costoModo === 'global') {
      co = a.parcial * cO;
      cp = a.parcial * cP;
    } else if (cfg.costoModo === 'partida') {
      co = e && !vacio(e.costoOptimista) ? num(e.costoOptimista) : a.parcial * cO;
      cp = e && !vacio(e.costoPesimista) ? num(e.costoPesimista) : a.parcial * cP;
    }
    co = Math.min(co, cm);
    cp = Math.max(cp, cm);
    return { partidaId: a.partidaId, codigo: a.codigo, descripcion: a.descripcion, duracion: a.duracion, o, m, p, costo: a.parcial, co, cm, cp, propia };
  });
  const cal = new Calendario(prog.inicio, r.proyecto.meta.diasLaborables, r.proyecto.meta.feriados);
  const metaFecha = cfg.plazoMeta || base?.fin || prog.fin;
  const metaDias = metaFecha && prog.inicio ? cal.laborablesEntre(prog.inicio, metaFecha) : prog.diasLaborables;
  const metaCosto = cfg.presupuestoMeta !== null && cfg.presupuestoMeta > 0 ? cfg.presupuestoMeta : base?.costoDirecto ?? r.pie.costoDirecto;
  const { resumen: _r, ...sinResumen } = cfg;
  void _r;
  return {
    config: cfg,
    actividades,
    inicio: prog.inicio,
    deterministaDias: prog.diasLaborables,
    deterministaCosto: r.pie.costoDirecto,
    metaFecha,
    metaDias,
    metaCosto,
    huella: huellaDe([sinResumen, actividades.map((a) => [a.partidaId, a.duracion, redondear(a.costo)]), metaFecha, metaCosto, prog.actividades.map((a) => a.predecesoras)]),
  };
}

export interface ResultadoRiesgo {
  iteraciones: number;
  plazo: Estadistica; // días laborables
  costo: Estadistica | null; // costo directo
  fechas: { p50: string; p80: string; p90: string; media: string };
  plazoCalendario: { p50: number; p80: number; p90: number };
  probPlazo: number; // %
  probCosto: number | null;
  probAmbos: number | null;
  criticidad: { partidaId: string; codigo: string; descripcion: string; indice: number; duracionMedia: number }[];
  entrada: EntradaSimulacion;
}

/** Simulación por bloques: avanzar(n) corre n iteraciones, para no congelar la interfaz. */
export class Simulacion {
  readonly total: number;
  hechas = 0;
  private u: () => number;
  private red;
  private dur: Float64Array;
  private trabajo: PasadasCpm | undefined;
  private plazos: Float64Array;
  private costos: Float64Array;
  private criticas: Int32Array;
  private sumaDur: Float64Array;
  private conCosto: boolean;
  constructor(private r: Resultados, readonly entrada: EntradaSimulacion) {
    this.total = entrada.config.iteraciones;
    this.u = generador(entrada.config.semilla);
    this.red = redDePrograma(r.programa);
    const n = entrada.actividades.length;
    this.dur = new Float64Array(n);
    this.plazos = new Float64Array(this.total);
    this.costos = new Float64Array(this.total);
    this.criticas = new Int32Array(n);
    this.sumaDur = new Float64Array(n);
    this.conCosto = entrada.config.costoModo !== 'ninguno';
  }
  get terminado() {
    return this.hechas >= this.total;
  }
  get progreso() {
    return this.total ? this.hechas / this.total : 1;
  }
  avanzar(n: number): void {
    const acts = this.entrada.actividades;
    const pert = this.entrada.config.distribucion === 'pert';
    const muestra = pert ? muestraPert : muestraTriangular;
    const fin = Math.min(this.total, this.hechas + n);
    for (let it = this.hechas; it < fin; it++) {
      let costo = 0;
      for (let i = 0; i < acts.length; i++) {
        const a = acts[i];
        const d = muestra(a.o, a.m, a.p, this.u);
        this.dur[i] = d;
        this.sumaDur[i] += d;
        if (this.conCosto) costo += muestra(a.co, a.cm, a.cp, this.u);
      }
      const res = pasadasCpm(this.red, this.dur, this.trabajo);
      this.trabajo = res;
      this.plazos[it] = res.fin;
      this.costos[it] = costo;
      for (let i = 0; i < acts.length; i++) if (res.ls[i] - res.es[i] <= 1e-6) this.criticas[i]++;
    }
    this.hechas = fin;
  }
  resultado(): ResultadoRiesgo {
    const n = this.hechas;
    const e = this.entrada;
    const plazos = this.plazos.subarray(0, n);
    const costos = this.costos.subarray(0, n);
    const cal = new Calendario(e.inicio, this.r.proyecto.meta.diasLaborables, this.r.proyecto.meta.feriados);
    const fechaDe = (dias: number) => (dias > 0 ? cal.fecha(Math.max(0, Math.ceil(dias - 1e-9) - 1)) : e.inicio);
    const plazo = estadistica(plazos);
    const costo = this.conCosto ? estadistica(costos) : null;
    let okP = 0;
    let okC = 0;
    let okA = 0;
    for (let i = 0; i < n; i++) {
      const p = plazos[i] <= e.metaDias + 1e-9;
      const c = costos[i] <= e.metaCosto + 1e-6;
      if (p) okP++;
      if (c) okC++;
      if (p && c) okA++;
    }
    const cal2 = (dias: number) => difDias(e.inicio, fechaDe(dias)) + 1;
    return {
      iteraciones: n,
      plazo,
      costo,
      fechas: { p50: fechaDe(plazo.p50), p80: fechaDe(plazo.p80), p90: fechaDe(plazo.p90), media: fechaDe(plazo.media) },
      plazoCalendario: { p50: cal2(plazo.p50), p80: cal2(plazo.p80), p90: cal2(plazo.p90) },
      probPlazo: n ? (okP / n) * 100 : 0,
      probCosto: this.conCosto && n ? (okC / n) * 100 : null,
      probAmbos: this.conCosto && n ? (okA / n) * 100 : null,
      criticidad: e.actividades
        .map((a, i) => ({ partidaId: a.partidaId, codigo: a.codigo, descripcion: a.descripcion, indice: n ? (this.criticas[i] / n) * 100 : 0, duracionMedia: n ? this.sumaDur[i] / n : a.m }))
        .sort((x, y) => y.indice - x.indice || x.codigo.localeCompare(y.codigo, 'es', { numeric: true })),
      entrada: e,
    };
  }
}

/** Corre la simulación completa (para pruebas, el informe en Excel y el tablero). */
export function simularRiesgo(r: Resultados, cfg: ConfigRiesgo, base?: { fin: string; costoDirecto: number } | null): ResultadoRiesgo {
  const s = new Simulacion(r, entradaSimulacion(r, cfg, base));
  s.avanzar(s.total);
  return s.resultado();
}

export function resumirRiesgo(x: ResultadoRiesgo, fecha: string): ResumenRiesgo {
  return {
    fecha,
    huella: x.entrada.huella,
    iteraciones: x.iteraciones,
    p50Dias: x.plazo.p50,
    p80Dias: x.plazo.p80,
    p90Dias: x.plazo.p90,
    p50Fecha: x.fechas.p50,
    p80Fecha: x.fechas.p80,
    p90Fecha: x.fechas.p90,
    p50Costo: x.costo ? redondear(x.costo.p50) : null,
    p80Costo: x.costo ? redondear(x.costo.p80) : null,
    p90Costo: x.costo ? redondear(x.costo.p90) : null,
    probPlazo: x.probPlazo,
    probCosto: x.probCosto,
  };
}
