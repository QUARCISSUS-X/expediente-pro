// Control de proyectos durante la ejecución: línea base, valor ganado, valorizaciones, cambios, riesgos,
// cuaderno de obra, Last Planner System, Lean Construction (rendimientos y frentes) y Six Sigma.
// Todo se guarda en Proyecto.control y se calcula sobre el presupuesto y el cronograma del expediente.
import { Calendario } from './schedule';
import type { Resultados } from './types';
import { diaSemana, difDias, num, redondear, sumarDias, uid } from './util';

// ======================================================================= modelo

export interface PartidaBase {
  id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  metrado: number;
  pu: number;
  parcial: number;
  inicio: string;
  fin: string;
  duracion: number; // días laborables
  hhUnidad: number; // horas-hombre por unidad (APU)
  costoHH: number; // costo de mano de obra por hora-hombre (APU)
}

export interface LineaBase {
  fecha: string; // cuándo se congeló
  nota: string;
  inicio: string;
  fin: string;
  plazoDias: number;
  costoDirecto: number;
  gg: number;
  utilidad: number;
  subtotal: number;
  total: number;
  partidas: PartidaBase[];
}

/** Corte de control (normalmente semanal): metrado ejecutado en el periodo y costo real. */
export interface Corte {
  id: string;
  fecha: string; // fecha de corte (fin del periodo)
  nombre: string;
  metrados: Record<string, number>; // partidaId → metrado ejecutado EN el periodo
  costoReal: number | null; // costo real del periodo (AC); vacío = sin dato
  nota: string;
}

export type TipoCambio = 'adicional' | 'deductivo' | 'ampliacion' | 'otro';
export type EstadoCambio = 'propuesto' | 'aprobado' | 'rechazado';
export interface Cambio {
  id: string;
  numero: string;
  tipo: TipoCambio;
  fecha: string;
  descripcion: string;
  causa: string;
  monto: number; // sin IGV
  plazoDias: number; // días calendario
  estado: EstadoCambio;
}

export type RespuestaRiesgo = 'evitar' | 'mitigar' | 'transferir' | 'aceptar';
export interface Riesgo {
  id: string;
  descripcion: string;
  categoria: string;
  probabilidad: number; // 1..5
  impacto: number; // 1..5
  respuesta: RespuestaRiesgo;
  accion: string;
  responsable: string;
  contingencia: number;
  estado: 'abierto' | 'cerrado';
}

export type TipoRegistro = 'asiento' | 'rfi' | 'acta' | 'ocurrencia';
export interface RegistroObra {
  id: string;
  tipo: TipoRegistro;
  numero: string;
  fecha: string;
  asunto: string;
  detalle: string;
  autor: string;
  destinatario: string;
  fechaLimite: string;
  respuesta: string;
  fechaRespuesta: string;
  estado: 'abierto' | 'respondido' | 'cerrado';
}

// ---------------------------------------------------------------- Last Planner

export interface Hito {
  id: string;
  nombre: string;
  fecha: string;
  partidaId: string;
  cumplido: boolean;
  fechaReal: string;
}

/** Compromiso de la planificación por fases (pull): se programa hacia atrás desde el hito. */
export interface CompromisoFase {
  id: string;
  hitoId: string;
  orden: number; // 1 = justo antes del hito
  actividad: string;
  especialidad: string;
  responsable: string;
  duracion: number; // días laborables
}

export const TIPOS_RESTRICCION = ['Materiales', 'Diseño / planos', 'Permisos', 'Mano de obra', 'Equipos', 'Prerrequisito', 'Espacio / acceso', 'Seguridad', 'Información del cliente', 'Otros'] as const;
export interface Restriccion {
  id: string;
  partidaId: string;
  tipo: string;
  descripcion: string;
  responsable: string;
  fechaRequerida: string;
  fechaLiberacion: string;
  liberada: boolean;
}

export const CAUSAS_NO_CUMPLIMIENTO = [
  'Materiales',
  'Mano de obra',
  'Equipos',
  'Diseño / información',
  'Actividad previa',
  'Permisos',
  'Clima',
  'Programación',
  'Subcontratista',
  'Cambios del cliente',
  'Seguridad',
  'Otros',
] as const;

export interface Compromiso {
  id: string;
  partidaId: string;
  descripcion: string;
  responsable: string;
  frenteId: string;
  metrado: number | null;
  cumplido: boolean | null; // null = aún sin evaluar
  causa: string;
  nota: string;
}

export interface SemanaLps {
  id: string;
  inicio: string; // lunes
  compromisos: Compromiso[];
}

// ---------------------------------------------------------------- Lean

export interface Frente {
  id: string;
  nombre: string;
  ubicacion: string;
  responsable: string;
  estado: 'activo' | 'pausado' | 'cerrado';
  partidas: string[];
  nota: string;
}

/** Medición de producción de una cuadrilla: qué se hizo y con cuántas horas-hombre. */
export interface Medicion {
  id: string;
  fecha: string;
  frenteId: string;
  partidaId: string;
  cantidad: number;
  trabajadores: number;
  horas: number;
  nota: string;
}

export type GrupoTrabajo = 'TP' | 'TC' | 'TNC';
export const CATEGORIAS_CARTA: { clave: string; grupo: GrupoTrabajo; texto: string }[] = [
  { clave: 'productivo', grupo: 'TP', texto: 'Trabajo productivo' },
  { clave: 'transporte', grupo: 'TC', texto: 'Transporte de materiales' },
  { clave: 'instrucciones', grupo: 'TC', texto: 'Instrucciones / lectura de planos' },
  { clave: 'mediciones', grupo: 'TC', texto: 'Mediciones y trazos' },
  { clave: 'limpieza', grupo: 'TC', texto: 'Limpieza' },
  { clave: 'preparacion', grupo: 'TC', texto: 'Preparación y herramientas' },
  { clave: 'otrosTC', grupo: 'TC', texto: 'Otros contributorios' },
  { clave: 'esperas', grupo: 'TNC', texto: 'Esperas' },
  { clave: 'viajes', grupo: 'TNC', texto: 'Desplazamientos sin carga' },
  { clave: 'ocio', grupo: 'TNC', texto: 'Tiempo ocioso' },
  { clave: 'retrabajo', grupo: 'TNC', texto: 'Retrabajos' },
  { clave: 'necesidades', grupo: 'TNC', texto: 'Necesidades personales' },
  { clave: 'otrosTNC', grupo: 'TNC', texto: 'Otros no contributorios' },
];

export interface CartaBalance {
  id: string;
  fecha: string;
  tipo: 'carta' | 'nga'; // carta balance de una cuadrilla o nivel general de actividad del frente
  frenteId: string;
  partidaId: string;
  cuadrilla: string;
  conteos: Record<string, number>;
  nota: string;
}

export const TIPOS_PERDIDA = ['Esperas', 'Transporte', 'Movimientos innecesarios', 'Sobreprocesamiento', 'Inventario en exceso', 'Sobreproducción', 'Defectos / retrabajos', 'Talento no aprovechado'] as const;
export interface Perdida {
  id: string;
  fecha: string;
  frenteId: string;
  partidaId: string;
  tipo: string;
  descripcion: string;
  horas: number;
  costo: number;
}

export interface ItemInspeccion {
  texto: string;
  resultado: 'si' | 'no' | 'na';
  nota: string;
}
export interface Inspeccion {
  id: string;
  fecha: string;
  plantilla: '5s' | 'frente';
  frenteId: string;
  responsable: string;
  items: ItemInspeccion[];
  nota: string;
}

export const PLANTILLAS_INSPECCION: Record<Inspeccion['plantilla'], { nombre: string; items: string[] }> = {
  '5s': {
    nombre: '5S del frente de trabajo',
    items: [
      'Seiri (clasificar): en el frente solo hay los materiales y herramientas que se usan',
      'Seiri: los desmontes y sobrantes se retiraron o están identificados',
      'Seiton (ordenar): materiales y herramientas tienen un lugar definido y señalizado',
      'Seiton: las vías de circulación y accesos están libres',
      'Seiso (limpiar): el frente está limpio y sin desperdicios regados',
      'Seiso: equipos y herramientas limpios y en buen estado',
      'Seiketsu (estandarizar): los estándares de orden están visibles y se cumplen',
      'Seiketsu: los residuos se segregan según su tipo',
      'Shitsuke (disciplina): el personal mantiene el orden sin que se lo pidan',
      'Shitsuke: se corrigieron las observaciones de la inspección anterior',
    ],
  },
  frente: {
    nombre: 'Liberación del frente de trabajo',
    items: [
      'Actividad previa terminada y recibida',
      'Planos y especificaciones vigentes en el frente',
      'Materiales completos para la semana',
      'Equipos y herramientas operativos',
      'Cuadrilla completa y con inducción',
      'Permisos de trabajo vigentes (PETAR, altura, caliente, etc.)',
      'Equipos de protección personal completos',
      'Accesos y señalización adecuados',
      'Topografía / trazos verificados',
      'Riesgos del frente identificados (IPERC)',
    ],
  },
};

// ---------------------------------------------------------------- Six Sigma

export const CATEGORIAS_6M = ['Mano de obra', 'Método', 'Materiales', 'Máquinas', 'Medición', 'Medio ambiente'] as const;
export interface Ishikawa {
  id: string;
  problema: string;
  causas: Record<string, string>; // categoría 6M → causas, una por línea
  raiz: string;
}

export type FaseDmaic = 'D' | 'M' | 'A' | 'I' | 'C' | 'cerrado';
export interface AccionDmaic {
  id: string;
  accion: string;
  responsable: string;
  fecha: string;
  hecho: boolean;
}
export interface ProyectoDmaic {
  id: string;
  titulo: string;
  responsable: string;
  fase: FaseDmaic;
  problema: string;
  objetivo: string;
  alcance: string;
  ctq: string; // característica crítica para la calidad
  metrica: string;
  unidad: string;
  mayorEsMejor: boolean;
  lineaBaseValor: number | null;
  metaValor: number | null;
  valorActual: number | null;
  causaRaiz: string;
  ishikawaId: string;
  acciones: AccionDmaic[];
  planControl: string;
}

/** Serie de mediciones de calidad (compactación, resistencia, espesores…) para gráficos de control y capacidad. */
export interface SerieCalidad {
  id: string;
  nombre: string;
  unidad: string;
  lei: number | null; // límite de especificación inferior
  les: number | null; // límite de especificación superior
  objetivo: number | null;
  valores: number[];
}

export interface Control {
  lineaBase: LineaBase | null;
  cortes: Corte[];
  cambios: Cambio[];
  riesgos: Riesgo[];
  registros: RegistroObra[];
  /** Índices unificados para el reajuste: 'base' y 'yyyy-mm' → código IU → valor. */
  indices: Record<string, Record<string, number>>;
  hitos: Hito[];
  fases: CompromisoFase[];
  restricciones: Restriccion[];
  semanas: SemanaLps[];
  frentes: Frente[];
  mediciones: Medicion[];
  cartas: CartaBalance[];
  perdidas: Perdida[];
  inspecciones: Inspeccion[];
  ishikawas: Ishikawa[];
  dmaic: ProyectoDmaic[];
  series: SerieCalidad[];
}

export function controlVacio(): Control {
  return {
    lineaBase: null,
    cortes: [],
    cambios: [],
    riesgos: [],
    registros: [],
    indices: {},
    hitos: [],
    fases: [],
    restricciones: [],
    semanas: [],
    frentes: [],
    mediciones: [],
    cartas: [],
    perdidas: [],
    inspecciones: [],
    ishikawas: [],
    dmaic: [],
    series: [],
  };
}

/** Completa un control leído de archivo (versiones anteriores o campos faltantes). */
export function normalizarControl(x: unknown): Control {
  const c = (x && typeof x === 'object' ? x : {}) as Partial<Control>;
  const v = controlVacio();
  const arr = <T,>(a: T[] | undefined) => (Array.isArray(a) ? a : []);
  return {
    lineaBase: c.lineaBase ?? null,
    cortes: arr(c.cortes),
    cambios: arr(c.cambios),
    riesgos: arr(c.riesgos),
    registros: arr(c.registros),
    indices: c.indices && typeof c.indices === 'object' ? c.indices : v.indices,
    hitos: arr(c.hitos),
    fases: arr(c.fases),
    restricciones: arr(c.restricciones),
    semanas: arr(c.semanas).map((s) => ({ ...s, compromisos: arr(s.compromisos) })),
    frentes: arr(c.frentes).map((f) => ({ ...f, partidas: arr(f.partidas) })),
    mediciones: arr(c.mediciones),
    cartas: arr(c.cartas),
    perdidas: arr(c.perdidas),
    inspecciones: arr(c.inspecciones),
    ishikawas: arr(c.ishikawas),
    dmaic: arr(c.dmaic).map((d) => ({ ...d, acciones: arr(d.acciones) })),
    series: arr(c.series).map((s) => ({ ...s, valores: arr(s.valores).map((n) => num(n)) })),
  };
}

// ======================================================================= utilidades de fechas

export const hoyIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Lunes de la semana de la fecha. */
export function lunesDe(iso: string): string {
  const d = diaSemana(iso); // 0 = domingo
  return sumarDias(iso, d === 0 ? -6 : 1 - d);
}

export const mesDe = (iso: string) => iso.slice(0, 7);

const calendarioDe = (r: Resultados, inicio: string) => new Calendario(inicio, r.proyecto.meta.diasLaborables, r.proyecto.meta.feriados);

/** Días laborables en [desde, hasta], ambos incluidos. */
function laborables(cal: Calendario, desde: string, hasta: string): number {
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

// ======================================================================= línea base

export function crearLineaBase(r: Resultados, nota = ''): LineaBase {
  const act = new Map(r.programa.actividades.map((a) => [a.partidaId, a]));
  const partidas: PartidaBase[] = r.hojas
    .filter((h) => h.metrado > 0)
    .map((h) => {
      const a = act.get(h.partida.id);
      const apu = r.apus[h.partida.id];
      const mo = apu ? apu.items.filter((it) => it.insumo.tipo === 'MO' && !it.porcentaje) : [];
      const hhUnidad = mo.reduce((s, it) => s + it.cantidad, 0);
      const costoMo = mo.reduce((s, it) => s + it.parcial, 0);
      return {
        id: h.partida.id,
        codigo: h.partida.codigo,
        descripcion: h.partida.descripcion,
        unidad: h.partida.unidad,
        metrado: h.metrado,
        pu: h.pu,
        parcial: h.parcial,
        inicio: a?.inicio ?? r.programa.inicio,
        fin: a?.fin ?? r.programa.fin,
        duracion: a?.duracion ?? 1,
        hhUnidad: redondear(hhUnidad, 4),
        costoHH: hhUnidad > 0 ? redondear(costoMo / hhUnidad, 2) : 0,
      };
    });
  return {
    fecha: hoyIso(),
    nota,
    inicio: r.programa.inicio,
    fin: r.programa.fin,
    plazoDias: r.programa.plazoDias,
    costoDirecto: r.pie.costoDirecto,
    gg: r.pie.gg,
    utilidad: r.pie.utilidad,
    subtotal: r.pie.subtotal,
    total: r.pie.total,
    partidas,
  };
}

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
  puntos: PuntoEvm[];
  ultimo: PuntoEvm | null;
  partidas: AvancePartida[];
  curvaPlan: { fecha: string; pv: number; pct: number }[];
}

/** Valor planificado acumulado de una partida a la fecha (distribución uniforme en sus días laborables). */
function pvPartida(cal: Calendario, b: PartidaBase, fecha: string): number {
  if (fecha < b.inicio) return 0;
  if (fecha >= b.fin) return b.parcial;
  const total = laborables(cal, b.inicio, b.fin) || 1;
  return (b.parcial * laborables(cal, b.inicio, fecha)) / total;
}

export function pvALaFecha(r: Resultados, lb: LineaBase, fecha: string): number {
  const cal = calendarioDe(r, lb.inicio);
  return lb.partidas.reduce((s, b) => s + pvPartida(cal, b, fecha), 0);
}

export const cortesOrdenados = (c: Control) => [...c.cortes].sort((a, b) => a.fecha.localeCompare(b.fecha));

export function calcularEvm(r: Resultados, c: Control): Evm | null {
  const lb = c.lineaBase;
  if (!lb) return null;
  const cal = calendarioDe(r, lb.inicio);
  const bac = lb.partidas.reduce((s, b) => s + b.parcial, 0);
  const cortes = cortesOrdenados(c);
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
  return { bac: redondear(bac), puntos, ultimo, partidas, curvaPlan };
}

/** Metrado acumulado ejecutado por partida hasta la fecha (incluida). */
export function ejecutadoHasta(c: Control, fecha: string): Record<string, number> {
  const acum: Record<string, number> = {};
  for (const k of c.cortes) if (k.fecha <= fecha) for (const [id, m] of Object.entries(k.metrados)) acum[id] = (acum[id] ?? 0) + num(m);
  return acum;
}

// ======================================================================= valorizaciones mensuales

export interface Valorizacion {
  mes: string; // yyyy-mm
  numero: number;
  partidas: { base: PartidaBase; metrado: number; monto: number; acumulado: number; acumuladoPct: number; mayorMetrado: number }[];
  costoDirecto: number;
  gg: number;
  utilidad: number;
  valorizacion: number; // sin IGV, sin reajuste
  k: number | null;
  reajuste: number;
  amortizacionDirecto: number;
  amortizacionMateriales: number;
  subtotal: number;
  igv: number;
  neto: number;
  acumulado: number; // valorizaciones acumuladas (sin reajuste ni IGV)
  acumuladoPct: number;
  indicesFaltantes: string[];
}

/** Coeficiente de reajuste K = Σ coef × Σ peso × (Ir / Io). Devuelve null si faltan índices. */
export function coeficienteK(r: Resultados, c: Control, mes: string): { k: number | null; faltantes: string[] } {
  const base = c.indices.base ?? {};
  const delMes = c.indices[mes] ?? {};
  const faltantes = new Set<string>();
  let k = 0;
  for (const m of r.polinomica.monomios) {
    let s = 0;
    for (const ix of m.indices) {
      const io = num(base[ix.iu]);
      const ir = num(delMes[ix.iu]);
      if (!(io > 0) || !(ir > 0)) faltantes.add(ix.iu);
      else s += ix.peso * (ir / io);
    }
    k += m.coeficiente * s;
  }
  return faltantes.size ? { k: null, faltantes: [...faltantes] } : { k: redondear(k, 3), faltantes: [] };
}

export function calcularValorizaciones(r: Resultados, c: Control): Valorizacion[] {
  const lb = c.lineaBase;
  if (!lb) return [];
  const meses = [...new Set(c.cortes.map((k) => mesDe(k.fecha)))].sort();
  const factorGG = lb.costoDirecto > 0 ? lb.gg / lb.costoDirecto : 0;
  const factorUt = lb.costoDirecto > 0 ? lb.utilidad / lb.costoDirecto : 0;
  const m = r.proyecto.meta;
  const igvPct = m.incluirIgv === false ? 0 : num(m.igvPct);
  const acumPartida: Record<string, number> = {};
  let acumulado = 0;
  return meses.map((mes, i) => {
    const delMes: Record<string, number> = {};
    for (const k of c.cortes) if (mesDe(k.fecha) === mes) for (const [id, v] of Object.entries(k.metrados)) delMes[id] = (delMes[id] ?? 0) + num(v);
    const partidas = lb.partidas
      .filter((b) => (delMes[b.id] ?? 0) !== 0)
      .map((b) => {
        const ejec = delMes[b.id] ?? 0;
        const antes = acumPartida[b.id] ?? 0;
        acumPartida[b.id] = antes + ejec;
        // se valoriza hasta el metrado contractual; el exceso es mayor metrado (requiere aprobación)
        const met = Math.max(0, Math.min(acumPartida[b.id], b.metrado) - Math.min(antes, b.metrado));
        return {
          base: b,
          metrado: met,
          mayorMetrado: redondear(ejec - met, 4),
          monto: redondear(met * b.pu),
          acumulado: acumPartida[b.id],
          acumuladoPct: b.metrado > 0 ? (acumPartida[b.id] / b.metrado) * 100 : 0,
        };
      });
    const cd = redondear(partidas.reduce((s, p) => s + p.monto, 0));
    const gg = redondear(cd * factorGG);
    const ut = redondear(cd * factorUt);
    const v = redondear(cd + gg + ut);
    const { k, faltantes } = coeficienteK(r, c, mes);
    const reajuste = k === null ? 0 : redondear(v * (k - 1));
    const amD = redondear((v * num(m.adelantoDirectoPct)) / 100);
    const amM = redondear((v * num(m.adelantoMaterialesPct)) / 100);
    const subtotal = redondear(v + reajuste - amD - amM);
    const igv = redondear((subtotal * igvPct) / 100);
    acumulado += v;
    return {
      mes,
      numero: i + 1,
      partidas,
      costoDirecto: cd,
      gg,
      utilidad: ut,
      valorizacion: v,
      k,
      reajuste,
      amortizacionDirecto: amD,
      amortizacionMateriales: amM,
      subtotal,
      igv,
      neto: redondear(subtotal + igv),
      acumulado: redondear(acumulado),
      acumuladoPct: lb.subtotal > 0 ? (acumulado / lb.subtotal) * 100 : 0,
      indicesFaltantes: faltantes,
    };
  });
}

// ======================================================================= cambios y riesgos

export interface ResumenCambios {
  contractual: number;
  plazoContractual: number;
  adicionales: number;
  deductivos: number;
  vigente: number;
  incidenciaPct: number; // (adicionales − deductivos) / contractual
  incidenciaAdicionalesPct: number;
  ampliacionDias: number;
  plazoVigente: number;
  pendientes: number;
  alerta: string | null;
}

export function resumirCambios(r: Resultados, c: Control): ResumenCambios {
  const contractual = c.lineaBase?.subtotal ?? r.pie.subtotal;
  const plazo = c.lineaBase?.plazoDias ?? r.programa.plazoDias;
  const ap = c.cambios.filter((x) => x.estado === 'aprobado');
  const adicionales = ap.filter((x) => x.tipo === 'adicional').reduce((s, x) => s + num(x.monto), 0);
  const deductivos = ap.filter((x) => x.tipo === 'deductivo').reduce((s, x) => s + Math.abs(num(x.monto)), 0);
  const ampliacion = ap.reduce((s, x) => s + num(x.plazoDias), 0);
  const inc = contractual > 0 ? ((adicionales - deductivos) / contractual) * 100 : 0;
  const incAd = contractual > 0 ? (adicionales / contractual) * 100 : 0;
  return {
    contractual,
    plazoContractual: plazo,
    adicionales: redondear(adicionales),
    deductivos: redondear(deductivos),
    vigente: redondear(contractual + adicionales - deductivos),
    incidenciaPct: inc,
    incidenciaAdicionalesPct: incAd,
    ampliacionDias: ampliacion,
    plazoVigente: plazo + ampliacion,
    pendientes: c.cambios.filter((x) => x.estado === 'propuesto').length,
    alerta: r.proyecto.meta.modo === 'publico' && inc > 15 ? 'Los adicionales netos superan el 15 % del monto contractual: revise los límites y aprobaciones que exige la normativa de contrataciones vigente.' : null,
  };
}

export const nivelRiesgo = (x: Pick<Riesgo, 'probabilidad' | 'impacto'>) => num(x.probabilidad, 1) * num(x.impacto, 1);
export function claseRiesgo(n: number): { clave: 'bajo' | 'moderado' | 'alto' | 'critico'; texto: string } {
  if (n >= 15) return { clave: 'critico', texto: 'Crítico' };
  if (n >= 10) return { clave: 'alto', texto: 'Alto' };
  if (n >= 5) return { clave: 'moderado', texto: 'Moderado' };
  return { clave: 'bajo', texto: 'Bajo' };
}

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
    const rs = c.restricciones.filter((x) => x.partidaId === a.partidaId && !x.liberada);
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

// ======================================================================= Six Sigma: estadística

export interface CartaIMR {
  valores: number[];
  media: number;
  mrMedia: number;
  lcs: number; // límite de control superior
  lci: number;
  lcsMR: number;
  fuera: number[]; // índices fuera de límites
  rachas: number[]; // índices que completan 7 puntos seguidos al mismo lado de la media
  tendencias: number[]; // índices que completan 6 puntos seguidos subiendo o bajando
  enControl: boolean;
}

/** Carta de control de valores individuales y rango móvil (I-MR). */
export function cartaIMR(valores: number[]): CartaIMR | null {
  const v = valores.filter((x) => isFinite(x));
  if (v.length < 2) return null;
  const media = v.reduce((a, b) => a + b, 0) / v.length;
  const mr = v.slice(1).map((x, i) => Math.abs(x - v[i]));
  const mrMedia = mr.reduce((a, b) => a + b, 0) / mr.length;
  const lcs = media + 2.66 * mrMedia;
  const lci = media - 2.66 * mrMedia;
  const fuera = v.map((x, i) => (x > lcs + 1e-12 || x < lci - 1e-12 ? i : -1)).filter((i) => i >= 0);
  const rachas: number[] = [];
  let lado = 0;
  let cuenta = 0;
  v.forEach((x, i) => {
    const s = x > media ? 1 : x < media ? -1 : 0;
    if (s !== 0 && s === lado) cuenta++;
    else {
      lado = s;
      cuenta = s === 0 ? 0 : 1;
    }
    if (cuenta >= 7) rachas.push(i);
  });
  const tendencias: number[] = [];
  let dir = 0;
  let largo = 1;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] > v[i - 1] ? 1 : v[i] < v[i - 1] ? -1 : 0;
    if (d !== 0 && d === dir) largo++;
    else {
      dir = d;
      largo = d === 0 ? 1 : 2;
    }
    if (largo >= 6) tendencias.push(i);
  }
  return { valores: v, media, mrMedia, lcs, lci, lcsMR: 3.267 * mrMedia, fuera, rachas, tendencias, enControl: !fuera.length && !rachas.length && !tendencias.length };
}

/** Función de distribución normal estándar (aproximación de Abramowitz-Stegun). */
export function normalAcumulada(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export interface Capacidad {
  n: number;
  media: number;
  sigma: number; // desviación estándar muestral
  min: number;
  max: number;
  cp: number | null;
  cpk: number | null;
  fueraObservadoPct: number | null;
  fueraEsperadoPct: number | null;
  dpmo: number | null;
  nivelSigma: number | null; // corto plazo (Cpk × 3 + 1.5)
  histograma: { desde: number; hasta: number; n: number }[];
}

export function capacidadProceso(valores: number[], lei: number | null, les: number | null): Capacidad | null {
  const v = valores.filter((x) => isFinite(x));
  if (v.length < 2) return null;
  const n = v.length;
  const media = v.reduce((a, b) => a + b, 0) / n;
  const sigma = Math.sqrt(v.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1));
  const tieneI = lei !== null && lei !== undefined && isFinite(lei);
  const tieneS = les !== null && les !== undefined && isFinite(les);
  let cp: number | null = null;
  let cpk: number | null = null;
  let fueraEsp: number | null = null;
  if (sigma > 0 && (tieneI || tieneS)) {
    if (tieneI && tieneS) cp = (les! - lei!) / (6 * sigma);
    const cpu = tieneS ? (les! - media) / (3 * sigma) : Infinity;
    const cpl = tieneI ? (media - lei!) / (3 * sigma) : Infinity;
    cpk = Math.min(cpu, cpl);
    fueraEsp = ((tieneS ? 1 - normalAcumulada((les! - media) / sigma) : 0) + (tieneI ? normalAcumulada((lei! - media) / sigma) : 0)) * 100;
  }
  const fueraObs = tieneI || tieneS ? (v.filter((x) => (tieneI && x < lei!) || (tieneS && x > les!)).length / n) * 100 : null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const k = Math.max(5, Math.min(12, Math.ceil(Math.sqrt(n)) + 1));
  const ancho = max > min ? (max - min) / k : 1;
  const histograma = Array.from({ length: k }, (_, i) => ({ desde: min + ancho * i, hasta: min + ancho * (i + 1), n: 0 }));
  for (const x of v) histograma[Math.min(k - 1, Math.floor((x - min) / ancho))].n++;
  return {
    n,
    media,
    sigma,
    min,
    max,
    cp,
    cpk,
    fueraObservadoPct: fueraObs,
    fueraEsperadoPct: fueraEsp,
    dpmo: fueraEsp === null ? null : Math.round(fueraEsp * 10000),
    nivelSigma: cpk === null ? null : cpk * 3 + 1.5,
    histograma,
  };
}

/** Lee una lista de números escrita a mano (separados por espacios, punto y coma o saltos de línea). */
export function leerValores(texto: string): number[] {
  return texto
    .split(/[\s;]+/)
    .map((t) => t.trim().replace(',', '.'))
    .filter(Boolean)
    .map((t) => parseFloat(t))
    .filter((n) => isFinite(n));
}

export function mejoraDmaic(d: ProyectoDmaic): number | null {
  if (d.lineaBaseValor === null || d.valorActual === null || !d.lineaBaseValor) return null;
  const cambio = ((d.valorActual - d.lineaBaseValor) / Math.abs(d.lineaBaseValor)) * 100;
  return d.mayorEsMejor ? cambio : -cambio;
}

// ======================================================================= tablero

export interface Tablero {
  hayLineaBase: boolean;
  avanceProgramado: number | null;
  avanceReal: number | null;
  spi: number | null;
  cpi: number | null;
  eac: number | null;
  finEstimado: string | null;
  ultimoCorte: string | null;
  ppcUltimo: number | null;
  ppcPromedio: number | null;
  restriccionesAbiertas: number;
  restriccionesVencidas: number;
  riesgosCriticos: number;
  riesgosAbiertos: number;
  contingencia: number;
  cambios: ResumenCambios;
  registrosAbiertos: number;
  registrosVencidos: number;
  ipPromedio: number | null;
  desviacionMo: number;
  tpPromedio: number | null;
  inspeccionPromedio: number | null;
  dmaicActivos: number;
}

export function calcularTablero(r: Resultados, c: Control, hoy = hoyIso()): Tablero {
  const evm = calcularEvm(r, c);
  const ppc = calcularPpc(c);
  const rest = resumenRestricciones(c, hoy);
  const abiertos = c.riesgos.filter((x) => x.estado !== 'cerrado');
  const rend = rendimientosPorPartida(r, c);
  const conIp = rend.filter((x) => x.ip !== null);
  const hhPlan = conIp.reduce((s, x) => s + x.hhUnidadPlan * x.cantidad, 0);
  const hhReal = conIp.reduce((s, x) => s + x.hh, 0);
  const cartas = c.cartas.map(resumenCarta).filter((x) => x.total > 0);
  const insp = c.inspecciones.map(puntajeInspeccion).filter((x): x is number => x !== null);
  const regAb = c.registros.filter((x) => x.estado === 'abierto');
  return {
    hayLineaBase: !!c.lineaBase,
    avanceProgramado: evm?.ultimo ? evm.ultimo.pvPct : null,
    avanceReal: evm?.ultimo ? evm.ultimo.evPct : null,
    spi: evm?.ultimo ? evm.ultimo.spi : null,
    cpi: evm?.ultimo?.cpi ?? null,
    eac: evm?.ultimo?.eac ?? null,
    finEstimado: evm?.ultimo?.finEstimado ?? null,
    ultimoCorte: evm?.ultimo?.fecha ?? null,
    ppcUltimo: ppc.ultimo?.ppc ?? null,
    ppcPromedio: ppc.promedio,
    restriccionesAbiertas: rest.abiertas,
    restriccionesVencidas: rest.vencidas,
    riesgosCriticos: abiertos.filter((x) => nivelRiesgo(x) >= 15).length,
    riesgosAbiertos: abiertos.length,
    contingencia: redondear(abiertos.reduce((s, x) => s + num(x.contingencia), 0)),
    cambios: resumirCambios(r, c),
    registrosAbiertos: regAb.length,
    registrosVencidos: regAb.filter((x) => x.fechaLimite && x.fechaLimite < hoy).length,
    ipPromedio: hhReal > 0 ? hhPlan / hhReal : null,
    desviacionMo: redondear(rend.reduce((s, x) => s + x.desviacionMo, 0)),
    tpPromedio: cartas.length ? cartas.reduce((s, x) => s + x.tp, 0) / cartas.length : null,
    inspeccionPromedio: insp.length ? insp.reduce((a, b) => a + b, 0) / insp.length : null,
    dmaicActivos: c.dmaic.filter((x) => x.fase !== 'cerrado').length,
  };
}

// ======================================================================= datos de demostración

/** Datos ficticios coherentes con el proyecto, para conocer las herramientas. */
export function controlDemostracion(r: Resultados): Control {
  const c = controlVacio();
  const lb = crearLineaBase(r, 'Línea base de demostración');
  lb.fecha = lb.inicio;
  c.lineaBase = lb;
  let semilla = 7;
  const azar = () => {
    semilla = (semilla * 16807) % 2147483647;
    return (semilla - 1) / 2147483646;
  };
  const cal = calendarioDe(r, lb.inicio);
  // frentes: uno por título de primer nivel
  const titulos = r.filas.filter((f) => f.esTitulo && f.nivel === 1).slice(0, 4);
  for (const t of titulos) {
    const pref = t.partida.codigo + '.';
    c.frentes.push({
      id: uid('fte'),
      nombre: `Frente ${t.partida.codigo} – ${t.partida.descripcion.slice(0, 40)}`,
      ubicacion: '',
      responsable: 'Ing. de campo',
      estado: 'activo',
      partidas: lb.partidas.filter((b) => b.codigo.startsWith(pref)).map((b) => b.id),
      nota: '',
    });
  }
  const frenteDe = (pid: string) => c.frentes.find((f) => f.partidas.includes(pid))?.id ?? '';
  // seis cortes semanales con avance algo por debajo de lo programado
  const nCortes = Math.min(6, Math.max(2, Math.floor(difDias(lb.inicio, lb.fin) / 7)));
  let prev = sumarDias(lb.inicio, -1);
  for (let i = 1; i <= nCortes; i++) {
    const fecha = sumarDias(lunesDe(lb.inicio), 7 * i - 2); // sábado
    const metrados: Record<string, number> = {};
    let costo = 0;
    for (const b of lb.partidas) {
      const plan = b.parcial > 0 ? (pvPartida(cal, b, fecha) - pvPartida(cal, b, prev)) / b.pu : 0;
      if (plan <= 0) continue;
      const factor = 0.78 + azar() * 0.3;
      const m = redondear(plan * factor, 2);
      if (m > 0) {
        metrados[b.id] = m;
        costo += m * b.pu * (0.97 + azar() * 0.12);
      }
    }
    c.cortes.push({ id: uid('cte'), fecha, nombre: `Semana ${i}`, metrados, costoReal: redondear(costo * 1.0), nota: '' });
    prev = fecha;
  }
  // mediciones de rendimiento de las partidas con más mano de obra
  const conMo = [...lb.partidas].filter((b) => b.hhUnidad > 0).sort((a, b) => b.hhUnidad * b.metrado - a.hhUnidad * a.metrado).slice(0, 5);
  for (const b of conMo) {
    for (let d = 0; d < 12; d++) {
      const fecha = sumarDias(b.inicio, d);
      if (!cal.esLaborable(fecha) || fecha > b.fin) continue;
      const trab = 4 + Math.round(azar() * 3);
      const horas = 8;
      const ip = 0.82 + azar() * 0.32;
      const cantidad = redondear((trab * horas) / (b.hhUnidad / ip), 2);
      c.mediciones.push({ id: uid('med'), fecha, frenteId: frenteDe(b.id), partidaId: b.id, cantidad, trabajadores: trab, horas, nota: '' });
    }
  }
  // Last Planner
  c.hitos = hitosDesdeCronograma(r);
  const h0 = c.hitos[0];
  if (h0)
    c.fases = [
      { id: uid('fase'), hitoId: h0.id, orden: 1, actividad: 'Recepción y protocolo de calidad', especialidad: 'Calidad', responsable: 'Supervisor de calidad', duracion: 1 },
      { id: uid('fase'), hitoId: h0.id, orden: 2, actividad: 'Ejecución de la última partida del frente', especialidad: 'Producción', responsable: 'Capataz', duracion: 5 },
      { id: uid('fase'), hitoId: h0.id, orden: 3, actividad: 'Abastecimiento de materiales del frente', especialidad: 'Logística', responsable: 'Almacenero', duracion: 3 },
      { id: uid('fase'), hitoId: h0.id, orden: 4, actividad: 'Liberación de permisos de trabajo', especialidad: 'Seguridad', responsable: 'Prevencionista', duracion: 2 },
    ];
  const causas = ['Materiales', 'Actividad previa', 'Clima', 'Mano de obra', 'Materiales', 'Equipos', 'Permisos', 'Materiales'];
  let ci = 0;
  for (let i = 0; i < nCortes; i++) {
    const lunes = sumarDias(lunesDe(lb.inicio), 7 * i);
    const sug = compromisosSugeridos(r, c, lunes).slice(0, 8);
    for (const x of sug) {
      x.responsable = 'Capataz';
      x.cumplido = azar() > 0.27;
      if (!x.cumplido) x.causa = causas[ci++ % causas.length];
    }
    c.semanas.push({ id: uid('sem'), inicio: lunes, compromisos: sug });
  }
  const proximas = lookahead(r, c, sumarDias(lunesDe(lb.inicio), 7 * nCortes), 4).filas.slice(0, 5);
  proximas.forEach((f, i) =>
    c.restricciones.push({
      id: uid('res'),
      partidaId: f.partidaId,
      tipo: TIPOS_RESTRICCION[i % 6],
      descripcion: ['Confirmar llegada de materiales al almacén de obra', 'Plano de detalle aprobado por la supervisión', 'Permiso de trabajo de la unidad', 'Cuadrilla adicional con inducción', 'Excavadora disponible del subcontratista'][i],
      responsable: ['Logística', 'Oficina técnica', 'Seguridad', 'Administración de obra', 'Equipos'][i],
      fechaRequerida: sumarDias(f.inicio, -3),
      fechaLiberacion: i < 2 ? sumarDias(f.inicio, -5) : '',
      liberada: i < 2,
    }),
  );
  // control de obra
  c.riesgos = [
    { id: uid('rsg'), descripcion: 'Lluvias intensas que paralicen movimiento de tierras', categoria: 'Clima', probabilidad: 4, impacto: 4, respuesta: 'mitigar', accion: 'Programar frentes alternos y drenaje provisional', responsable: 'Residente', contingencia: 15000, estado: 'abierto' },
    { id: uid('rsg'), descripcion: 'Demora en la aprobación de permisos de la unidad', categoria: 'Permisos', probabilidad: 3, impacto: 4, respuesta: 'mitigar', accion: 'Tramitar con dos semanas de anticipación', responsable: 'Seguridad', contingencia: 5000, estado: 'abierto' },
    { id: uid('rsg'), descripcion: 'Alza de precio del acero', categoria: 'Costos', probabilidad: 2, impacto: 3, respuesta: 'transferir', accion: 'Cerrar precio con el proveedor', responsable: 'Logística', contingencia: 8000, estado: 'abierto' },
  ];
  c.cambios = [
    { id: uid('cmb'), numero: 'ADC-01', tipo: 'adicional', fecha: sumarDias(lb.inicio, 20), descripcion: 'Mayor volumen de excavación por material suelto', causa: 'Condición de terreno', monto: redondear(lb.subtotal * 0.035), plazoDias: 7, estado: 'aprobado' },
    { id: uid('cmb'), numero: 'DED-01', tipo: 'deductivo', fecha: sumarDias(lb.inicio, 25), descripcion: 'Partida no ejecutada por cambio de diseño', causa: 'Cambio de diseño', monto: redondear(lb.subtotal * 0.01), plazoDias: 0, estado: 'aprobado' },
  ];
  c.registros = [
    { id: uid('reg'), tipo: 'rfi', numero: 'RFI-001', fecha: sumarDias(lb.inicio, 6), asunto: 'Cota de fondo de cimentación', detalle: 'Se solicita confirmar la cota de fondo en el eje 3.', autor: 'Residente', destinatario: 'Supervisión', fechaLimite: sumarDias(lb.inicio, 9), respuesta: 'Se mantiene la cota del plano E-02.', fechaRespuesta: sumarDias(lb.inicio, 8), estado: 'cerrado' },
    { id: uid('reg'), tipo: 'asiento', numero: '12', fecha: sumarDias(lb.inicio, 15), asunto: 'Paralización por lluvia', detalle: 'Se paralizan los trabajos de excavación por 4 horas.', autor: 'Residente', destinatario: 'Supervisión', fechaLimite: '', respuesta: '', fechaRespuesta: '', estado: 'abierto' },
  ];
  // lean
  if (conMo[0])
    c.cartas.push({
      id: uid('cb'),
      fecha: sumarDias(conMo[0].inicio, 2),
      tipo: 'carta',
      frenteId: frenteDe(conMo[0].id),
      partidaId: conMo[0].id,
      cuadrilla: '1 operario + 3 peones',
      conteos: { productivo: 112, transporte: 38, instrucciones: 12, mediciones: 9, limpieza: 7, preparacion: 14, otrosTC: 4, esperas: 26, viajes: 18, ocio: 11, retrabajo: 6, necesidades: 5, otrosTNC: 3 },
      nota: '',
    });
  c.perdidas = [
    { id: uid('prd'), fecha: sumarDias(lb.inicio, 3), frenteId: c.frentes[0]?.id ?? '', partidaId: conMo[0]?.id ?? '', tipo: 'Esperas', descripcion: 'Cuadrilla espera llegada del volquete', horas: 12, costo: 300 },
    { id: uid('prd'), fecha: sumarDias(lb.inicio, 5), frenteId: c.frentes[0]?.id ?? '', partidaId: conMo[1]?.id ?? '', tipo: 'Transporte', descripcion: 'Acarreo manual por acceso bloqueado', horas: 8, costo: 200 },
    { id: uid('prd'), fecha: sumarDias(lb.inicio, 9), frenteId: c.frentes[1]?.id ?? '', partidaId: conMo[2]?.id ?? '', tipo: 'Defectos / retrabajos', descripcion: 'Rehacer encofrado desalineado', horas: 6, costo: 180 },
  ];
  c.inspecciones.push({
    id: uid('ins'),
    fecha: sumarDias(lb.inicio, 7),
    plantilla: '5s',
    frenteId: c.frentes[0]?.id ?? '',
    responsable: 'Prevencionista',
    items: PLANTILLAS_INSPECCION['5s'].items.map((t, i) => ({ texto: t, resultado: i % 4 === 3 ? 'no' : 'si', nota: '' })),
    nota: '',
  });
  // six sigma
  c.series.push({ id: uid('ser'), nombre: 'Grado de compactación (Proctor modificado)', unidad: '%', lei: 95, les: null, objetivo: 97, valores: [97.2, 96.8, 98.1, 95.9, 97.5, 96.2, 97.9, 98.4, 96.6, 95.4, 97.1, 96.9, 97.8, 96.1, 98.0, 97.3] });
  const ish: Ishikawa = {
    id: uid('ish'),
    problema: 'Rendimiento de excavación por debajo del APU',
    causas: { 'Mano de obra': 'Cuadrilla nueva sin experiencia', Método: 'Acarreo manual en lugar de carretillas', Materiales: '', Máquinas: 'Volquete con demoras', Medición: 'Metrado diario estimado a ojo', 'Medio ambiente': 'Lluvias por la tarde' },
    raiz: 'Esperas de transporte (volquete)',
  };
  c.ishikawas.push(ish);
  c.dmaic.push({
    id: uid('dmc'),
    titulo: 'Reducir las HH por m³ de excavación',
    responsable: 'Ing. de producción',
    fase: 'I',
    problema: 'La excavación consume más horas-hombre que las presupuestadas.',
    objetivo: 'Llegar a un índice de productividad de 1.00',
    alcance: 'Frente 1',
    ctq: 'HH por m³',
    metrica: 'Índice de productividad',
    unidad: '',
    mayorEsMejor: true,
    lineaBaseValor: 0.86,
    metaValor: 1,
    valorActual: 0.94,
    causaRaiz: ish.raiz,
    ishikawaId: ish.id,
    acciones: [
      { id: uid('acc'), accion: 'Programar el volquete por ventanas horarias', responsable: 'Logística', fecha: sumarDias(lb.inicio, 12), hecho: true },
      { id: uid('acc'), accion: 'Medir el metrado diario con wincha y registro', responsable: 'Capataz', fecha: sumarDias(lb.inicio, 14), hecho: false },
    ],
    planControl: 'Carta de control semanal del índice de productividad.',
  });
  return c;
}
