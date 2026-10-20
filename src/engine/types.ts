// Modelo de datos del expediente. Todo el programa se alimenta de un único objeto Proyecto.

export type TipoInsumo = 'MO' | 'MAT' | 'EQ' | 'SC';
export type Modo = 'privado' | 'publico';
export type TipoPred = 'FC' | 'CC' | 'FF';
export type Severidad = 'error' | 'advertencia';

export interface Insumo {
  codigo: string;
  descripcion: string;
  unidad: string; // hh, hm, m3, kg, bls, %MO ...
  tipo: TipoInsumo;
  precio: number; // sin IGV
  iu: string; // código de Índice Unificado INEI (base dic-2025), p. ej. '21' cemento
  pesoKg?: number | null; // peso por unidad, para flete
  plazoCompraDias?: number | null; // anticipación de compra
  fuente?: string; // fuente del precio o proveedor de la cotización
  fechaPrecio?: string; // fecha de la cotización
}

export interface Partida {
  id: string;
  codigo: string; // 01, 01.01, 01.01.01 ...
  descripcion: string;
  unidad: string; // vacío si es título
  titulo?: boolean;
  eett?: string; // clave de plantilla de EETT; vacío = detección automática
  eettTexto?: Partial<SeccionesEett>; // texto propio de la partida (reemplaza plantilla)
}

export interface MetradoFila {
  id: string;
  partidaId: string;
  descripcion: string;
  referencia?: string; // plano / lámina / sustento
  veces?: number | null;
  cantidad?: number | null;
  factor?: number | null; // esponjamiento, desperdicio, etc.
  largo?: number | null;
  ancho?: number | null;
  alto?: number | null;
  area?: number | null; // área medida en CAD (m2)
  volumen?: number | null; // volumen medido en CAD (m3)
}
// Parcial = producto de los campos llenos (como =PRODUCTO() en la planilla de metrados).

export interface ApuItem {
  insumo: string; // código de insumo
  cuadrilla?: number | null; // MO y EQ: cantidad = cuadrilla × jornada / rendimiento
  cantidad?: number | null; // materiales, subcontratos o cantidad manual
  porcentaje?: number | null; // insumos %MO (herramientas): % de la mano de obra del APU
}

export interface Apu {
  rendimiento: number; // unidades por día
  items: ApuItem[];
  jornada?: number | null; // horas por día de este análisis (vacío = jornada del proyecto)
}

export interface GGItem {
  id: string;
  grupo: GrupoGG;
  rubro: string;
  descripcion: string;
  unidad: string; // mes, glb, und, %CD
  cantidad: number;
  duracion: number; // meses o veces
  precio: number;
  participacion: number; // % de participación en obra
  ligadoAlPlazo?: boolean; // si es variable, la duración = plazo en meses
}

export type GrupoGG = 'variable' | 'fijo' | 'financiero';

export interface Pred {
  id: string; // id de la partida predecesora
  tipo: TipoPred;
  desfase: number; // días laborables
}

export interface Actividad {
  cuadrillas?: number | null;
  duracionManual?: number | null;
  predecesoras: Pred[];
}

export type DocKey =
  | 'presupuesto_resumen'
  | 'presupuesto_detallado'
  | 'apu'
  | 'insumos'
  | 'gg'
  | 'metrados'
  | 'polinomica'
  | 'flete'
  | 'programa'
  | 'valorizado'
  | 'adquisiciones'
  | 'equipos'
  | 'personal'
  | 'desembolsos'
  | 'eett'
  | 'memoria'
  | 'carta'
  | 'msproject'
  | 'consistencia'
  | 'cumplimiento'
  | 'externo';

export interface EntregableTdR {
  id: string;
  descripcion: string;
  documento: DocKey | '';
  obligatorio: boolean;
  observacion?: string;
}

export interface SeccionesEett {
  descripcion: string;
  manoObra: string;
  materiales: string;
  equipos: string;
  metodo: string;
  calidad: string;
  medicion: string;
  pago: string;
}

export interface PlantillaEett extends SeccionesEett {
  clave: string;
  nombre: string;
  palabras: string[]; // palabras clave para detección automática
}

export interface Logo {
  dataUrl: string; // data:image/png;base64,...
  ancho: number; // px
  alto: number; // px
}

export interface Entidad {
  nombre: string;
  ruc: string;
  direccion: string;
  telefono: string;
  email: string;
  web: string;
  representante: string;
  logo?: Logo | null;
}

export interface Responsable {
  nombre: string;
  cargo: string;
  colegiatura: string;
  fecha: string;
}

export interface ConfigDocumento {
  codigo: string; // código de documento del proyectista (p. ej. 26006)
  revision: string; // 0, A, B ...
  fechaRevision: string; // ISO
  estado: string; // Para revisión, Para aprobación, Aprobado ...
  tipo: string; // INFORME TÉCNICO, EXPEDIENTE TÉCNICO ...
  autores: string;
  aviso: string; // aviso y alcance de uso
  imagenPortada?: Logo | null; // foto o imagen de la carátula
}

export interface TextosEett {
  objetivo: string;
  alcance: string;
  normativa: string;
  definiciones: string;
  consideraciones: string;
}

export interface Meta {
  nombre: string;
  codigo: string;
  descripcion: string;
  fecha: string; // fecha del proyecto o del documento (ISO)
  ubicacion: string;
  departamento: string;
  provincia: string;
  distrito: string;
  areaGeografica: number; // 1..13 INEI
  modo: Modo;
  sistemaContratacion: string;
  fechaBase: string; // ISO yyyy-mm-dd: fecha de determinación del presupuesto
  fechaInicio: string; // ISO
  moneda: string; // símbolo: S/, US$
  monedaNombre: string; // SOLES, DÓLARES AMERICANOS (para montos en letras)
  unidadMedida: string; // Sistema Internacional (métrico)
  jornadaHoras: number;
  diasLaborables: number[]; // 0=dom ... 6=sáb
  feriados: string[]; // ISO
  periodo: '30dias' | 'mes';
  utilidadPct: number;
  igvPct: number;
  incluirIgv: boolean; // false: el total es el subtotal sin IGV
  adelantoDirectoPct: number;
  adelantoMaterialesPct: number;
  plazoCompraDefecto: number;
  fleteTarifaTon: number; // S/ por tonelada
  fleteDistanciaKm: number;
  personalMaximo?: number | null;
  foliacion: 'ascendente' | 'descendente';
  validezOfertaDias: number;
  formaPago: string;
}

export interface TextosMemoria {
  antecedentes: string;
  objetivo: string;
  alcance: string;
  descripcionTecnica: string;
  consideraciones: string;
}

/** Observación encontrada al importar un expediente existente (formato, consistencia o cálculo). */
export interface ObservacionOrigen {
  documento: string;
  ubicacion: string;
  tipo: 'Formato' | 'Consistencia' | 'Cálculo' | 'Información';
  detalle: string;
  correccion: string;
}

export interface OrigenImportacion {
  fecha: string;
  archivos: string[];
  hojas: string[];
  original: { costoDirecto?: number; gg?: number; utilidad?: number; subtotal?: number; plazoDias?: number };
  observaciones: ObservacionOrigen[];
}

export interface Proyecto {
  version: 2;
  meta: Meta;
  entidades: { proyectista: Entidad; cliente: Entidad; propietario: Entidad };
  responsables: { elaboro: Responsable; reviso: Responsable; aprobo: Responsable };
  documento: ConfigDocumento;
  textosEett: TextosEett;
  insumos: Insumo[];
  partidas: Partida[];
  metrados: MetradoFila[];
  apus: Record<string, Apu>;
  gg: GGItem[];
  programa: Record<string, Actividad>;
  tdr: { titulo: string; resumen: string; entregables: EntregableTdR[] };
  plantillasEett: PlantillaEett[];
  memoria: TextosMemoria;
  origen?: OrigenImportacion; // expediente del que se importó (con sus observaciones)
}

// ----------------------------- Resultados ---------------------------------

export interface ApuItemCalc {
  origen: number; // índice del renglón en el APU del proyecto
  insumo: Insumo;
  cuadrilla: number | null;
  cantidad: number; // por unidad de partida (4 decimales)
  precio: number;
  parcial: number; // 2 decimales
  porcentaje: number | null;
}

export interface ApuCalc {
  partidaId: string;
  rendimiento: number;
  jornada: number; // horas por día usadas en el análisis
  items: ApuItemCalc[];
  subtotales: Record<TipoInsumo, number>;
  pu: number;
  faltantes: string[]; // códigos de insumo inexistentes
}

export interface FilaPresupuesto {
  partida: Partida;
  nivel: number;
  esTitulo: boolean;
  metrado: number;
  pu: number;
  parcial: number;
  padreId: string | null;
}

export interface Pie {
  costoDirecto: number;
  ggFijos: number;
  ggVariables: number;
  ggFinancieros: number;
  gg: number;
  ggPct: number;
  utilidad: number;
  subtotal: number;
  igv: number;
  total: number;
}

export interface InsumoTotal {
  insumo: Insumo;
  cantidad: number;
  precio: number;
  parcial: number;
}

export interface RelacionInsumos {
  items: InsumoTotal[];
  porTipo: Record<TipoInsumo, number>;
  porcentuales: number; // rubros %MO (herramientas)
  total: number;
  diferenciaRedondeo: number; // CD - total
}

export interface GGCalc {
  items: (GGItem & { duracionUsada: number; total: number })[];
  fijos: number;
  variables: number;
  financieros: number;
  total: number;
}

export interface Monomio {
  simbolo: string;
  coeficiente: number;
  indices: { iu: string; nombre: string; peso: number }[]; // peso dentro del monomio
  miembros: { iu: string; nombre: string; incidencia: number }[];
}

export interface Polinomica {
  base: number;
  incidencias: { iu: string; nombre: string; monto: number; incidencia: number }[];
  monomios: Monomio[];
  formula: string;
  suma: number;
}

export interface ActividadCalc {
  partidaId: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  metrado: number;
  rendimiento: number;
  cuadrillas: number;
  duracion: number; // días laborables
  es: number;
  ef: number; // exclusivo
  ls: number;
  lf: number;
  holgura: number;
  critica: boolean;
  inicio: string; // ISO
  fin: string; // ISO
  predecesoras: Pred[];
  parcial: number;
}

export interface Periodo {
  n: number;
  etiqueta: string;
  inicio: string;
  fin: string;
  diasLaborables: number;
}

export interface Programa {
  actividades: ActividadCalc[];
  diasLaborables: number;
  plazoDias: number; // calendario
  plazoMeses: number;
  inicio: string;
  fin: string;
  periodos: Periodo[];
  diaFecha: string[]; // fecha ISO de cada día laborable
  errores: string[];
}

export interface FilaCronograma {
  clave: string; // id de partida o código de insumo
  codigo: string;
  descripcion: string;
  unidad: string;
  total: number;
  valores: number[]; // por periodo (índice 0 = antes del inicio en adquisiciones)
  montos?: number[];
}

export interface Valorizado {
  filas: FilaCronograma[]; // por partida (montos de CD)
  cd: number[];
  gg: number[];
  utilidad: number[];
  subtotal: number[];
  igv: number[];
  total: number[];
  avancePct: number[];
  acumuladoPct: number[];
  acumulado: number[];
}

export interface Desembolso {
  periodo: string;
  valorizacion: number;
  adelantoDirecto: number;
  adelantoMateriales: number;
  amortizacion: number;
  neto: number;
  acumulado: number;
}

export interface FleteCalc {
  items: { insumo: Insumo; cantidad: number; pesoKg: number; toneladas: number; flete: number }[];
  sinPeso: string[];
  toneladas: number;
  total: number;
}

export interface Hallazgo {
  regla: number;
  control: string;
  severidad: Severidad;
  mensaje: string;
  referencia?: string;
}

export interface ReglaResultado {
  regla: number;
  control: string;
  estado: 'ok' | 'error' | 'advertencia';
  detalle: string;
  hallazgos: Hallazgo[];
}

export interface EettPartida {
  partida: Partida;
  plantilla: string; // clave usada
  generica: boolean;
  secciones: SeccionesEett;
}

export interface Resultados {
  proyecto: Proyecto;
  apus: Record<string, ApuCalc>;
  filas: FilaPresupuesto[];
  hojas: FilaPresupuesto[]; // solo partidas (no títulos)
  metradoPorPartida: Record<string, number>;
  pie: Pie;
  insumos: RelacionInsumos;
  gg: GGCalc;
  polinomica: Polinomica;
  flete: FleteCalc;
  programa: Programa;
  valorizado: Valorizado;
  adquisiciones: FilaCronograma[];
  equipos: FilaCronograma[];
  personal: FilaCronograma[];
  personalEquivalente: number[]; // trabajadores promedio por periodo
  personalPico: number;
  desembolsos: Desembolso[];
  eett: EettPartida[];
  validacion: ReglaResultado[];
  resumenValidacion: { errores: number; advertencias: number; ok: number };
}
