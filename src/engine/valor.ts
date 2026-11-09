// Ingeniería de valor y Target Value Design: costo meta por título, alternativas con índice de valor y matriz
// de decisión ponderada, seguimiento de la brecha y aplicación de una alternativa aprobada al presupuesto.
import type { Apu, MetradoFila, Partida, Proyecto, Resultados } from './types';
import { num, redondear, uid } from './util';

export interface MetaTitulo {
  modo: 'monto' | 'reduccion';
  valor: number | null; // monto meta (costo directo) o % de reducción
}

export interface CriterioDecision {
  id: string;
  nombre: string;
  peso: number;
}

/** Cómo se lleva la alternativa al presupuesto (solo alternativas de una partida). */
export interface AplicacionAlternativa {
  modo: 'pu' | 'apu'; // precio unitario propio (subcontrato) o el APU de otra partida
  pu: number | null;
  apuDe: string; // partida de la que se copia el APU
  metrado: number | null; // nuevo metrado (vacío = el mismo)
  descripcion: string; // nueva descripción (vacío = la misma)
}

export interface RespaldoAlternativa {
  fecha: string;
  partida: Partida;
  apu: Apu | null;
  metrados: MetradoFila[];
  insumoCreado: string;
  costoAnterior: number; // costo directo de la partida antes de aplicar
}

export type EstadoAlternativa = 'propuesta' | 'aprobada' | 'rechazada' | 'aplicada';

export interface Alternativa {
  id: string;
  codigo: string;
  ambitoId: string; // partida o título del presupuesto
  descripcion: string;
  costo: number | null; // costo directo de la alternativa (si no se calcula con su aplicación)
  plazoDias: number | null; // variación de plazo (días; negativo = ahorra plazo)
  funcion: number; // puntaje de función 1–10
  ventajas: string;
  riesgos: string;
  puntajes: Record<string, number>; // criterio → 1..5
  estado: EstadoAlternativa;
  aplicacion: AplicacionAlternativa | null;
  respaldo: RespaldoAlternativa | null;
}

export interface SeguimientoBrecha {
  id: string;
  fecha: string;
  estimado: number;
  meta: number;
  nota: string;
}

export interface Valor {
  costoPermitido: number | null; // costo directo permitido (del precio del cliente menos margen)
  reduccionPct: number; // reducción general si no hay costo permitido
  metas: Record<string, MetaTitulo>; // por título de primer nivel
  criterios: CriterioDecision[];
  alternativas: Alternativa[];
  funcionActual: Record<string, number>; // ámbito → función de la solución actual
  puntajesActual: Record<string, Record<string, number>>; // ámbito → criterio → puntaje de la solución actual
  seguimiento: SeguimientoBrecha[];
}

export const CRITERIOS_POR_DEFECTO = (): CriterioDecision[] => [
  { id: 'crt_costo', nombre: 'Costo', peso: 35 },
  { id: 'crt_plazo', nombre: 'Plazo', peso: 20 },
  { id: 'crt_calidad', nombre: 'Calidad y durabilidad', peso: 25 },
  { id: 'crt_const', nombre: 'Constructibilidad', peso: 10 },
  { id: 'crt_mant', nombre: 'Mantenimiento', peso: 10 },
];

export const valorVacio = (): Valor => ({ costoPermitido: null, reduccionPct: 0, metas: {}, criterios: CRITERIOS_POR_DEFECTO(), alternativas: [], funcionActual: {}, puntajesActual: {}, seguimiento: [] });

export function normalizarValor(x: unknown): Valor {
  const v = (x && typeof x === 'object' ? x : {}) as Partial<Valor>;
  const o = <T,>(a: T | undefined, d: T) => (a && typeof a === 'object' ? a : d);
  return {
    costoPermitido: v.costoPermitido === null || v.costoPermitido === undefined ? null : num(v.costoPermitido),
    reduccionPct: num(v.reduccionPct),
    metas: o(v.metas, {}),
    criterios: Array.isArray(v.criterios) ? v.criterios : CRITERIOS_POR_DEFECTO(),
    alternativas: (Array.isArray(v.alternativas) ? v.alternativas : []).map((a) => ({ ...a, puntajes: o(a.puntajes, {}), aplicacion: a.aplicacion ?? null, respaldo: a.respaldo ?? null })),
    funcionActual: o(v.funcionActual, {}),
    puntajesActual: o(v.puntajesActual, {}),
    seguimiento: Array.isArray(v.seguimiento) ? v.seguimiento : [],
  };
}

// ======================================================================= costos

export const esPartida = (r: Resultados, id: string) => r.hojas.some((h) => h.partida.id === id);
export function costoActual(r: Resultados, ambitoId: string): number {
  return r.filas.find((f) => f.partida.id === ambitoId)?.parcial ?? 0;
}
export function nombreAmbito(r: Resultados, ambitoId: string): string {
  const f = r.filas.find((x) => x.partida.id === ambitoId);
  return f ? `${f.partida.codigo} ${f.partida.descripcion}` : '';
}

/** Costo directo de la alternativa: con su aplicación (PU o APU de otra partida × metrado) o el monto ingresado. */
export function costoAlternativa(r: Resultados, a: Alternativa): number | null {
  const fila = r.hojas.find((h) => h.partida.id === a.ambitoId);
  if (a.aplicacion && fila) {
    const met = a.aplicacion.metrado !== null && a.aplicacion.metrado !== undefined && (a.aplicacion.metrado as unknown) !== '' ? num(a.aplicacion.metrado) : fila.metrado;
    const pu = a.aplicacion.modo === 'pu' ? num(a.aplicacion.pu) : num(r.apus[a.aplicacion.apuDe]?.pu);
    return redondear(pu * met, 2);
  }
  return a.costo === null || a.costo === undefined ? null : num(a.costo);
}

/** Índice de valor relativo = (función alt. ÷ función actual) ÷ (costo alt. ÷ costo actual). Mayor que 1: más valor. */
export function indiceValor(r: Resultados, v: Valor, a: Alternativa): number | null {
  const c0 = costoActual(r, a.ambitoId);
  const c1 = costoAlternativa(r, a);
  const f0 = num(v.funcionActual[a.ambitoId], 5) || 5;
  if (!c0 || !c1 || c1 <= 0) return null;
  return num(a.funcion) / f0 / (c1 / c0);
}

export function puntajePonderado(criterios: CriterioDecision[], puntajes: Record<string, number> | undefined): number | null {
  const tot = criterios.reduce((s, k) => s + Math.max(0, num(k.peso)), 0);
  if (!tot || !puntajes) return null;
  let s = 0;
  let algun = false;
  for (const k of criterios) {
    const p = puntajes[k.id];
    if (p === undefined || p === null) continue;
    algun = true;
    s += Math.max(0, num(k.peso)) * num(p);
  }
  return algun ? s / tot : null;
}

/** Título de primer nivel al que pertenece un ámbito (por el código). */
export function tituloDe(r: Resultados, ambitoId: string): string {
  const f = r.filas.find((x) => x.partida.id === ambitoId);
  if (!f) return '';
  const raiz = f.partida.codigo.split('.')[0];
  return r.filas.find((x) => x.esTitulo && x.nivel === 1 && x.partida.codigo === raiz)?.partida.id ?? '';
}

export interface FilaMeta {
  tituloId: string;
  codigo: string;
  descripcion: string;
  estimado: number; // costo directo actual del título
  meta: number;
  ahorroAprobado: number; // alternativas aprobadas aún no aplicadas
  estimadoConAprobadas: number;
  brecha: number; // estimado con aprobadas − meta (positivo = falta reducir)
  brechaPct: number | null;
  alternativas: number;
}

export interface ResumenMetas {
  filas: FilaMeta[];
  estimado: number;
  meta: number;
  estimadoConAprobadas: number;
  brecha: number;
  brechaPct: number | null;
  ahorroAplicado: number;
}

export function calcularMetas(r: Resultados, v: Valor): ResumenMetas {
  const titulos = r.filas.filter((f) => f.esTitulo && f.nivel === 1);
  const cd = r.pie.costoDirecto;
  const ahorroDe = (a: Alternativa) => {
    const c = costoAlternativa(r, a);
    return c === null ? 0 : costoActual(r, a.ambitoId) - c;
  };
  const filas: FilaMeta[] = titulos.map((t) => {
    const estimado = t.parcial;
    const m = v.metas[t.partida.id];
    let meta: number;
    if (m && m.valor !== null && m.valor !== undefined && (m.valor as unknown) !== '') meta = m.modo === 'monto' ? num(m.valor) : estimado * (1 - num(m.valor) / 100);
    else if (v.costoPermitido && v.costoPermitido > 0 && cd > 0) meta = (v.costoPermitido * estimado) / cd;
    else meta = estimado * (1 - num(v.reduccionPct) / 100);
    const alts = v.alternativas.filter((a) => tituloDe(r, a.ambitoId) === t.partida.id);
    // ahorro de las aprobadas: la mejor por ámbito (no se suman alternativas del mismo elemento)
    const porAmbito = new Map<string, number>();
    for (const a of alts.filter((x) => x.estado === 'aprobada')) porAmbito.set(a.ambitoId, Math.max(porAmbito.get(a.ambitoId) ?? -Infinity, ahorroDe(a)));
    const ahorro = [...porAmbito.values()].reduce((s, x) => s + x, 0);
    const conAprob = estimado - ahorro;
    return {
      tituloId: t.partida.id,
      codigo: t.partida.codigo,
      descripcion: t.partida.descripcion,
      estimado: redondear(estimado),
      meta: redondear(meta),
      ahorroAprobado: redondear(ahorro),
      estimadoConAprobadas: redondear(conAprob),
      brecha: redondear(conAprob - meta),
      brechaPct: meta > 0 ? ((conAprob - meta) / meta) * 100 : null,
      alternativas: alts.length,
    };
  });
  const s = (f: (x: FilaMeta) => number) => redondear(filas.reduce((a, x) => a + f(x), 0));
  const meta = s((x) => x.meta);
  const ahorroAplicado = v.alternativas.filter((a) => a.estado === 'aplicada' && a.respaldo).reduce((acc, a) => acc + respaldoCosto(r, a), 0);
  return { filas, estimado: s((x) => x.estimado), meta, estimadoConAprobadas: s((x) => x.estimadoConAprobadas), brecha: s((x) => x.brecha), brechaPct: meta > 0 ? (s((x) => x.brecha) / meta) * 100 : null, ahorroAplicado: redondear(ahorroAplicado) };
}

/** Ahorro de una alternativa ya aplicada, estimado con el costo de la partida antes de aplicarla. */
function respaldoCosto(r: Resultados, a: Alternativa): number {
  const ant = a.respaldo?.costoAnterior;
  return ant === undefined || ant === null ? 0 : ant - costoActual(r, a.ambitoId);
}

// ======================================================================= aplicar y deshacer

const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Lleva la alternativa al presupuesto (sobre el proyecto en edición). Guarda un respaldo para deshacerla. */
export function aplicarAlternativa(p: Proyecto, a: Alternativa, costoAnterior: number, fecha: string): string | null {
  const ap = a.aplicacion;
  if (!ap) return 'La alternativa no indica cómo llevarla al presupuesto.';
  const pt = p.partidas.find((x) => x.id === a.ambitoId && !x.titulo);
  if (!pt) return 'Solo se aplican alternativas de una partida del presupuesto.';
  if (ap.modo === 'apu' && !p.apus[ap.apuDe]) return 'La partida de la que se copiaría el APU no existe.';
  if (ap.modo === 'pu' && !(num(ap.pu) > 0)) return 'Indique el precio unitario de la alternativa.';
  const respaldo: RespaldoAlternativa = {
    fecha,
    partida: clonar(pt),
    apu: p.apus[pt.id] ? clonar(p.apus[pt.id]) : null,
    metrados: clonar(p.metrados.filter((m) => m.partidaId === pt.id)),
    insumoCreado: '',
    costoAnterior,
  };
  if (ap.modo === 'pu') {
    let codigo = `VE-${a.codigo || a.id.slice(-4)}`.replace(/\s+/g, '');
    while (p.insumos.some((i) => i.codigo === codigo)) codigo += '´';
    p.insumos.push({ codigo, descripcion: `Alternativa ${a.codigo}: ${a.descripcion}`.slice(0, 200), unidad: pt.unidad, tipo: 'SC', precio: redondear(num(ap.pu), 2), iu: '39', fuente: 'Ingeniería de valor' });
    respaldo.insumoCreado = codigo;
    p.apus[pt.id] = { rendimiento: p.apus[pt.id]?.rendimiento ?? 1, jornada: p.apus[pt.id]?.jornada ?? null, items: [{ insumo: codigo, cantidad: 1 }] };
  } else {
    const fuente = p.apus[ap.apuDe];
    p.apus[pt.id] = clonar(fuente);
  }
  if (ap.metrado !== null && ap.metrado !== undefined && (ap.metrado as unknown) !== '') {
    p.metrados = p.metrados.filter((m) => m.partidaId !== pt.id);
    p.metrados.push({ id: uid('met'), partidaId: pt.id, descripcion: `Metrado de la alternativa ${a.codigo}`, cantidad: num(ap.metrado) });
  }
  if (ap.descripcion?.trim()) pt.descripcion = ap.descripcion.trim();
  const alt = (p.control as { valor?: Valor } | undefined)?.valor?.alternativas.find((x) => x.id === a.id);
  if (alt) {
    alt.respaldo = respaldo;
    alt.estado = 'aplicada';
  }
  return null;
}

/** Devuelve la partida, su APU y sus metrados a como estaban antes de aplicar la alternativa. */
export function deshacerAlternativa(p: Proyecto, altId: string): string | null {
  const alt = (p.control as { valor?: Valor } | undefined)?.valor?.alternativas.find((x) => x.id === altId);
  if (!alt?.respaldo) return 'La alternativa no tiene un respaldo para deshacer.';
  const rs = alt.respaldo;
  const i = p.partidas.findIndex((x) => x.id === rs.partida.id);
  if (i >= 0) p.partidas[i] = clonar(rs.partida);
  if (rs.apu) p.apus[rs.partida.id] = clonar(rs.apu);
  else delete p.apus[rs.partida.id];
  p.metrados = [...p.metrados.filter((m) => m.partidaId !== rs.partida.id), ...clonar(rs.metrados)];
  if (rs.insumoCreado && !Object.values(p.apus).some((x) => x.items.some((it) => it.insumo === rs.insumoCreado))) p.insumos = p.insumos.filter((x) => x.codigo !== rs.insumoCreado);
  alt.respaldo = null;
  alt.estado = 'aprobada';
  return null;
}
