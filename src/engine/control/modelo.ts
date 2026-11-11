// Modelo de datos de Proyecto.control (línea base, cortes, cambios, riesgos, cuaderno, Last Planner, Lean, Six Sigma y v2.5), controlVacio y normalizarControl.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { type Calidad, calidadVacia, normalizarCalidad } from '../calidad';
import { type ConfigCcpm, configCcpmVacia, normalizarConfigCcpm } from '../ccpm';
import { type Kanban, kanbanVacio, normalizarKanban } from '../kanban';
import { type ConfigRiesgo, configRiesgoVacia, normalizarConfigRiesgo } from '../riesgo';
import { num } from '../util';
import { normalizarValor, type Valor, valorVacio } from '../valor';

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
  // versión 2.5
  riesgo: ConfigRiesgo; // Monte Carlo / PERT
  ccpm: ConfigCcpm; // cadena crítica
  kanban: Kanban; // kanban de materiales
  calidad: Calidad; // plan de calidad ISO 9001
  valor: Valor; // ingeniería de valor y Target Value Design
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
    riesgo: configRiesgoVacia(),
    ccpm: configCcpmVacia(),
    kanban: kanbanVacio(),
    calidad: calidadVacia(),
    valor: valorVacio(),
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
    riesgo: normalizarConfigRiesgo(c.riesgo),
    ccpm: normalizarConfigCcpm(c.ccpm),
    kanban: normalizarKanban(c.kanban),
    calidad: normalizarCalidad(c.calidad),
    valor: normalizarValor(c.valor),
  };
}
