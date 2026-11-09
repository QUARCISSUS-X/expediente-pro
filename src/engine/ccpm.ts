// Cadena crítica (CCPM, Goldratt): duraciones agresivas, colchón del proyecto, colchones de alimentación y gráfico de fiebre.
// Trabaja sobre la red del cronograma (schedule.ts) con las duraciones recortadas; no considera nivelación de recursos.
import { Calendario, construirRed, pasadasCpm, type RedCpm } from './schedule';
import type { Pred, Resultados } from './types';
import { num, redondear } from './util';
import type { LineaBase, Corte } from './control';

export type MetodoColchon = 'mitad' | 'rss';

export interface ConfigCcpm {
  recortePct: number; // % que se quita a cada duración (la seguridad)
  metodo: MetodoColchon; // 50 % de la seguridad retirada o raíz de la suma de cuadrados
}

export const configCcpmVacia = (): ConfigCcpm => ({ recortePct: 50, metodo: 'mitad' });
export function normalizarConfigCcpm(x: unknown): ConfigCcpm {
  const c = (x && typeof x === 'object' ? x : {}) as Partial<ConfigCcpm>;
  return { recortePct: Math.min(90, Math.max(0, num(c.recortePct, 50))), metodo: c.metodo === 'rss' ? 'rss' : 'mitad' };
}

export interface NodoCcpm {
  partidaId: string;
  codigo: string;
  descripcion: string;
  duracion: number;
  predecesoras: Pred[];
}

export interface ActividadCcpm {
  partidaId: string;
  codigo: string;
  descripcion: string;
  duracion: number; // del cronograma
  agresiva: number;
  seguridad: number; // duración − agresiva
  es: number; // inicio en la red agresiva (día laborable)
  ef: number;
  holgura: number;
  enCadena: boolean;
}

export interface ColchonAlimentacion {
  entrada: string; // última actividad de la cadena de alimentación
  alimenta: string; // actividad de la cadena crítica (vacío = fin del proyecto)
  cadena: string[]; // actividades de la cadena de alimentación (ids, en orden)
  tamano: number; // días laborables
  holgura: number; // holgura disponible en la red agresiva
  excede: boolean; // el colchón no cabe en la holgura: empujaría la cadena crítica
}

export interface Ccpm {
  config: ConfigCcpm;
  actividades: ActividadCcpm[];
  cadena: string[]; // ids de la cadena crítica en orden
  largoCadena: number; // duración agresiva del proyecto (días laborables)
  colchonProyecto: number;
  duracionCcpm: number; // cadena + colchón del proyecto
  duracionCpm: number; // cronograma original
  alimentacion: ColchonAlimentacion[];
}

export function tamanoColchon(seguridades: number[], metodo: MetodoColchon): number {
  if (metodo === 'rss') return Math.sqrt(seguridades.reduce((s, x) => s + x * x, 0));
  return 0.5 * seguridades.reduce((s, x) => s + x, 0);
}

export const duracionAgresiva = (d: number, recortePct: number) => (d <= 0 ? 0 : Math.max(1, Math.round(d * (1 - recortePct / 100))));

/** Predecesora que fija el inicio de la actividad (relación activa) en la red calculada. */
function predecesorasActivas(red: RedCpm, i: number, es: Float64Array, ef: Float64Array, dur: ArrayLike<number>): number[] {
  return red.preds[i]
    .filter((pr) => {
      const v = pr.tipo === 'CC' ? es[pr.i] + pr.desfase : pr.tipo === 'FF' ? ef[pr.i] + pr.desfase - dur[i] : ef[pr.i] + pr.desfase;
      return Math.abs(v - es[i]) < 1e-6;
    })
    .map((pr) => pr.i);
}

export function calcularCcpm(nodos: NodoCcpm[], config: ConfigCcpm, duracionCpm?: number): Ccpm {
  const red = construirRed(nodos.map((n) => ({ id: n.partidaId, codigo: n.codigo, predecesoras: n.predecesoras })));
  const ag = nodos.map((n) => duracionAgresiva(n.duracion, config.recortePct));
  const seg = nodos.map((n, i) => Math.max(0, n.duracion - ag[i]));
  const res = pasadasCpm(red, ag);
  const holg = (i: number) => res.ls[i] - res.es[i];
  // cadena crítica: desde la actividad que termina al final, hacia atrás por relaciones activas sin holgura
  const cadena: number[] = [];
  let actual = -1;
  for (const i of red.orden) if (Math.abs(res.ef[i] - res.fin) < 1e-6 && holg(i) <= 1e-6 && (actual < 0 || res.es[i] > res.es[actual])) actual = i;
  const enCadena = new Set<number>();
  while (actual >= 0 && !enCadena.has(actual)) {
    cadena.unshift(actual);
    enCadena.add(actual);
    const act = predecesorasActivas(red, actual, res.es, res.ef, ag).filter((b) => holg(b) <= 1e-6);
    actual = act.length ? act.reduce((a, b) => (res.ef[b] > res.ef[a] ? b : a)) : -1;
  }
  const colchonProyecto = tamanoColchon(cadena.map((i) => seg[i]), config.metodo);
  // sucesores para detectar los puntos de alimentación
  const suc: number[][] = nodos.map(() => []);
  red.preds.forEach((ps, i) => ps.forEach((pr) => suc[pr.i].push(i)));
  const alimentacion: ColchonAlimentacion[] = [];
  for (let f = 0; f < nodos.length; f++) {
    if (enCadena.has(f)) continue;
    const destinoCadena = suc[f].find((s) => enCadena.has(s));
    const terminal = suc[f].length === 0;
    if (destinoCadena === undefined && !terminal) continue;
    // cadena de alimentación: hacia atrás por la relación activa más larga, solo con actividades fuera de la cadena crítica
    const ruta: number[] = [];
    let k = f;
    const vistos = new Set<number>();
    while (k >= 0 && !enCadena.has(k) && !vistos.has(k)) {
      ruta.unshift(k);
      vistos.add(k);
      const act = predecesorasActivas(red, k, res.es, res.ef, ag).filter((b) => !enCadena.has(b));
      k = act.length ? act.reduce((a, b) => (res.ef[b] > res.ef[a] ? b : a)) : -1;
    }
    const tamano = tamanoColchon(ruta.map((i) => seg[i]), config.metodo);
    alimentacion.push({
      entrada: nodos[f].partidaId,
      alimenta: destinoCadena === undefined ? '' : nodos[destinoCadena].partidaId,
      cadena: ruta.map((i) => nodos[i].partidaId),
      tamano: redondear(tamano, 1),
      holgura: holg(f),
      excede: tamano > holg(f) + 1e-6,
    });
  }
  return {
    config,
    actividades: nodos.map((n, i) => ({
      partidaId: n.partidaId,
      codigo: n.codigo,
      descripcion: n.descripcion,
      duracion: n.duracion,
      agresiva: ag[i],
      seguridad: seg[i],
      es: res.es[i],
      ef: res.ef[i],
      holgura: holg(i),
      enCadena: enCadena.has(i),
    })),
    cadena: cadena.map((i) => nodos[i].partidaId),
    largoCadena: res.fin,
    colchonProyecto: redondear(colchonProyecto, 1),
    duracionCcpm: redondear(res.fin + colchonProyecto, 1),
    duracionCpm: duracionCpm ?? pasadasCpm(red, nodos.map((n) => n.duracion)).fin,
    alimentacion,
  };
}

export function ccpmDePrograma(r: Resultados, config: ConfigCcpm): Ccpm {
  return calcularCcpm(
    r.programa.actividades.map((a) => ({ partidaId: a.partidaId, codigo: a.codigo, descripcion: a.descripcion, duracion: a.duracion, predecesoras: a.predecesoras })),
    config,
    r.programa.diasLaborables,
  );
}

// ======================================================================= gráfico de fiebre

export type ZonaFiebre = 'verde' | 'amarillo' | 'rojo';
/** Límites de zona: amarillo desde 10 % + 0.6 × avance, rojo desde 30 % + 0.6 × avance. */
export const limiteAmarillo = (avancePct: number) => 10 + 0.6 * avancePct;
export const limiteRojo = (avancePct: number) => 30 + 0.6 * avancePct;
export function zonaFiebre(avancePct: number, consumoPct: number): ZonaFiebre {
  if (consumoPct >= limiteRojo(avancePct)) return 'rojo';
  if (consumoPct >= limiteAmarillo(avancePct)) return 'amarillo';
  return 'verde';
}

export interface PuntoFiebre {
  corteId: string;
  nombre: string;
  fecha: string;
  dia: number; // días laborables transcurridos
  avancePct: number; // % de la cadena crítica completada
  atraso: number; // días laborables de atraso de la cadena (negativo = adelanto)
  consumoPct: number; // % del colchón del proyecto consumido
  zona: ZonaFiebre;
}

/** % planificado de la cadena completada en el día t (cada actividad avanza en forma lineal en su duración agresiva). */
export function avancePlanCadena(x: Ccpm, t: number): number {
  const acts = x.actividades.filter((a) => a.enCadena);
  const total = acts.reduce((s, a) => s + a.agresiva, 0);
  if (!total) return 0;
  const hecho = acts.reduce((s, a) => s + Math.max(0, Math.min(a.agresiva, t - a.es)), 0);
  return (hecho / total) * 100;
}

/** Día en que el plan agresivo alcanzaba el avance dado (inversa de la curva de la cadena). */
export function diaPlanParaAvance(x: Ccpm, pct: number): number {
  if (pct <= 0) return 0;
  let lo = 0;
  let hi = x.largoCadena;
  if (avancePlanCadena(x, hi) <= pct + 1e-9) return hi;
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (avancePlanCadena(x, m) < pct) lo = m;
    else hi = m;
  }
  return hi;
}

/** Puntos del gráfico de fiebre con los cortes de avance (metrado ejecutado contra la línea base). */
export function puntosFiebre(r: Resultados, x: Ccpm, lb: LineaBase | null, cortes: Corte[]): PuntoFiebre[] {
  if (!lb || !x.cadena.length) return [];
  const base = new Map(lb.partidas.map((b) => [b.id, b]));
  const cal = new Calendario(lb.inicio, r.proyecto.meta.diasLaborables, r.proyecto.meta.feriados);
  const cadena = x.actividades.filter((a) => a.enCadena);
  const total = cadena.reduce((s, a) => s + a.agresiva, 0) || 1;
  const acum: Record<string, number> = {};
  return [...cortes]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((k) => {
      for (const [id, m] of Object.entries(k.metrados)) acum[id] = (acum[id] ?? 0) + num(m);
      const avance = (cadena.reduce((s, a) => {
        const b = base.get(a.partidaId);
        const f = b && b.metrado > 0 ? Math.min(1, (acum[a.partidaId] ?? 0) / b.metrado) : 0;
        return s + f * a.agresiva;
      }, 0) / total) * 100;
      const dia = k.fecha >= lb.inicio ? cal.laborablesEntre(lb.inicio, k.fecha) : 0;
      const atraso = dia - diaPlanParaAvance(x, avance);
      const consumo = x.colchonProyecto > 0 ? (Math.max(0, atraso) / x.colchonProyecto) * 100 : atraso > 0 ? 100 : 0;
      return { corteId: k.id, nombre: k.nombre, fecha: k.fecha, dia, avancePct: avance, atraso, consumoPct: consumo, zona: zonaFiebre(avance, consumo) };
    });
}
