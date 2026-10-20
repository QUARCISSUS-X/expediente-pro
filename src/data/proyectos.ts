import { LOGO_CLIENTE_EJEMPLO, LOGO_PROYECTISTA_EJEMPLO } from './logosEjemplo';
// Fábricas de proyectos: proyecto en blanco y proyecto de ejemplo completo.
import type { Actividad, Apu, ConfigDocumento, Entidad, EntregableTdR, GGItem, GrupoGG, Meta, MetradoFila, Partida, Proyecto, Responsable, TextosEett, TipoPred } from '../engine/types';
import { BIBLIOTECA, partidaTipo } from './biblioteca';
import { CATALOGO_BASE } from './catalogo';
import { PLANTILLAS_EETT } from './plantillasEett';

const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function metaPorDefecto(): Meta {
  return {
    nombre: 'Nuevo expediente',
    codigo: 'EXP-001',
    descripcion: '',
    fecha: new Date().toISOString().slice(0, 10),
    ubicacion: '',
    departamento: 'Lima',
    provincia: 'Lima',
    distrito: '',
    areaGeografica: 4,
    modo: 'privado',
    sistemaContratacion: 'Precios unitarios',
    fechaBase: new Date().toISOString().slice(0, 10),
    fechaInicio: new Date().toISOString().slice(0, 10),
    moneda: 'S/',
    monedaNombre: 'SOLES',
    unidadMedida: 'Sistema Internacional de Unidades (SI)',
    jornadaHoras: 8,
    diasLaborables: [1, 2, 3, 4, 5, 6],
    feriados: [],
    periodo: '30dias',
    utilidadPct: 10,
    igvPct: 18,
    incluirIgv: true,
    adelantoDirectoPct: 0,
    adelantoMaterialesPct: 0,
    plazoCompraDefecto: 7,
    fleteTarifaTon: 0,
    fleteDistanciaKm: 0,
    personalMaximo: null,
    foliacion: 'ascendente',
    validezOfertaDias: 30,
    formaPago: 'Valorizaciones mensuales',
  };
}

export function entidadVacia(): Entidad {
  return { nombre: '', ruc: '', direccion: '', telefono: '', email: '', web: '', representante: '', logo: null };
}

export function responsableVacio(cargo = ''): Responsable {
  return { nombre: '', cargo, colegiatura: '', fecha: '' };
}

export const AVISO_DEFECTO =
  'El presente documento fue preparado por {{proyectista}} para {{cliente}} y solo debe utilizarse para los fines del proyecto "{{proyecto}}". El uso por terceros, así como cualquier decisión tomada con base en su contenido, es responsabilidad exclusiva de dichos terceros.\n\nLos análisis y conclusiones se basan en la información disponible a la fecha de elaboración. La exactitud de los resultados depende de la integridad y vigencia de la información proporcionada por el cliente y demás fuentes del proyecto.';

export function documentoPorDefecto(): ConfigDocumento {
  return {
    codigo: '',
    revision: '0',
    fechaRevision: new Date().toISOString().slice(0, 10),
    estado: 'Para revisión',
    tipo: 'EXPEDIENTE TÉCNICO',
    autores: '',
    aviso: AVISO_DEFECTO,
  };
}

export function textosEettPorDefecto(): TextosEett {
  return {
    objetivo:
      'Las presentes especificaciones técnicas establecen los lineamientos, materiales, equipos, procedimientos constructivos, criterios de aceptación, métodos de medición y formas de pago que rigen la ejecución de los trabajos del proyecto "{{proyecto}}", ubicado en {{ubicacion}}.',
    alcance:
      'Las especificaciones corresponden a las partidas del presupuesto del proyecto, en el mismo orden y con la misma codificación. Cada partida se ejecutará conforme a los planos, a las presentes especificaciones y a las indicaciones de la Supervisión.',
    normativa:
      'Los trabajos se ejecutarán en concordancia con los planos del proyecto, el Reglamento Nacional de Edificaciones, las normas técnicas peruanas (NTP), las normas ASTM y ACI aplicables a cada partida y las disposiciones de seguridad, salud ocupacional y medio ambiente vigentes. Ante cualquier discrepancia prima el criterio de la Supervisión.',
    definiciones:
      'Contratista: persona natural o jurídica responsable de la ejecución de la obra.\n\nSupervisión: persona natural o jurídica, o profesional designado por el propietario, responsable de velar por la correcta ejecución de la obra y el cumplimiento de las presentes especificaciones.\n\nPropietario: {{propietario}}.',
    consideraciones:
      'Todo material, equipo o procedimiento alternativo al indicado deberá contar con la aprobación previa y por escrito de la Supervisión. El Contratista es responsable de la calidad de los trabajos ejecutados, del cumplimiento de las medidas de seguridad y de la protección ambiental durante toda la obra.',
  };
}

export const ENTREGABLES_BASE: { descripcion: string; documento: EntregableTdR['documento'] }[] = [
  { descripcion: 'Presupuesto resumen', documento: 'presupuesto_resumen' },
  { descripcion: 'Presupuesto detallado por partidas', documento: 'presupuesto_detallado' },
  { descripcion: 'Análisis de precios unitarios', documento: 'apu' },
  { descripcion: 'Relación de insumos', documento: 'insumos' },
  { descripcion: 'Desagregado de gastos generales', documento: 'gg' },
  { descripcion: 'Planilla de sustento de metrados', documento: 'metrados' },
  { descripcion: 'Programa de ejecución de obra (Gantt)', documento: 'programa' },
  { descripcion: 'Cronograma valorizado de avance de obra', documento: 'valorizado' },
  { descripcion: 'Calendario de adquisición de materiales', documento: 'adquisiciones' },
  { descripcion: 'Especificaciones técnicas', documento: 'eett' },
  { descripcion: 'Memoria descriptiva', documento: 'memoria' },
];

export function ggPlantilla(): GGItem[] {
  const g = (grupo: GrupoGG, rubro: string, descripcion: string, unidad: string, cantidad: number, duracion: number, precio: number, participacion = 100, ligado = grupo === 'variable'): GGItem => ({
    id: `gg_${rubro}_${descripcion}`.replace(/[^a-z0-9]/gi, '').slice(0, 40) + Math.random().toString(36).slice(2, 6),
    grupo, rubro, descripcion, unidad, cantidad, duracion, precio, participacion, ligadoAlPlazo: ligado,
  });
  return [
    g('variable', 'Personal técnico', 'Residente de obra', 'mes', 1, 1, 11000),
    g('variable', 'Personal técnico', 'Ingeniero de seguridad y salud ocupacional', 'mes', 1, 1, 7500),
    g('variable', 'Personal técnico', 'Ingeniero de calidad y oficina técnica', 'mes', 1, 1, 6500, 50),
    g('variable', 'Personal técnico', 'Maestro de obra', 'mes', 1, 1, 5000),
    g('variable', 'Personal administrativo', 'Administrador de obra', 'mes', 1, 1, 4500, 50),
    g('variable', 'Personal administrativo', 'Almacenero', 'mes', 1, 1, 2500),
    g('variable', 'Equipos y servicios', 'Camioneta 4x4 con conductor y combustible', 'mes', 1, 1, 6500),
    g('variable', 'Equipos y servicios', 'Alimentación y alojamiento del personal técnico', 'mes', 3, 1, 1500),
    g('variable', 'Equipos y servicios', 'Comunicaciones (radio e internet satelital)', 'mes', 1, 1, 500),
    g('fijo', 'Propuesta y contrato', 'Gastos de elaboración de propuesta', 'glb', 1, 1, 3500),
    g('fijo', 'Propuesta y contrato', 'Carta fianza de fiel cumplimiento', 'glb', 1, 1, 4800),
    g('fijo', 'Seguros', 'Seguro complementario de trabajo de riesgo y pólizas', '%CD', 0.6, 1, 0),
    g('fijo', 'Personal', 'Exámenes médicos de ingreso y retiro', 'und', 30, 1, 280),
    g('fijo', 'Calidad', 'Ensayos de laboratorio de control de calidad', 'glb', 1, 1, 6000),
    g('fijo', 'Cierre', 'Dossier de calidad y liquidación de obra', 'glb', 1, 1, 2500),
    g('financiero', 'Garantías', 'Costo financiero de la carta fianza de fiel cumplimiento (tasa 10 %, comisión 3.5 % anual)', '%CD', 0.02917, 1, 0),
  ];
}

export function proyectoEnBlanco(): Proyecto {
  return {
    version: 2,
    meta: metaPorDefecto(),
    entidades: { proyectista: entidadVacia(), cliente: entidadVacia(), propietario: entidadVacia() },
    responsables: { elaboro: responsableVacio('Especialista en costos y presupuestos'), reviso: responsableVacio('Jefe de proyecto'), aprobo: responsableVacio('Gerente de proyecto') },
    documento: documentoPorDefecto(),
    textosEett: textosEettPorDefecto(),
    insumos: clonar(CATALOGO_BASE),
    partidas: [],
    metrados: [],
    apus: {},
    gg: ggPlantilla(),
    programa: {},
    tdr: {
      titulo: '',
      resumen: '',
      entregables: ENTREGABLES_BASE.map((e, i) => ({ id: `tdr${i + 1}`, descripcion: e.descripcion, documento: e.documento, obligatorio: true })),
    },
    plantillasEett: clonar(PLANTILLAS_EETT),
    memoria: { antecedentes: '', objetivo: '', alcance: '', descripcionTecnica: '', consideraciones: '' },
  };
}

// ------------------------------------------------------------------ ejemplo

type M = [string, number | null, number | null, number | null, number | null, string, number?];

export function proyectoEjemplo(): Proyecto {
  const p = proyectoEnBlanco();
  p.meta = {
    ...p.meta,
    nombre: 'Cierre de bocaminas y rehabilitación del depósito de desmonte D-1 (proyecto de ejemplo)',
    codigo: 'EXP-DEMO-01',
    descripcion: 'Cierre de tres bocaminas con tapones de concreto armado y rehabilitación física y biológica del depósito de desmonte D-1.',
    fecha: '2026-10-01',
    ubicacion: 'Unidad Minera Ejemplo',
    departamento: 'Junín',
    provincia: 'Yauli',
    distrito: 'Yauli',
    areaGeografica: 8,
    modo: 'privado',
    sistemaContratacion: 'Precios unitarios',
    fechaBase: '2026-10-01',
    fechaInicio: '2026-11-02',
    feriados: ['2026-12-08', '2026-12-09', '2026-12-25', '2027-01-01'],
    utilidadPct: 10,
    adelantoDirectoPct: 10,
    adelantoMaterialesPct: 0,
    fleteTarifaTon: 120,
    fleteDistanciaKm: 180,
    personalMaximo: 60,
    formaPago: 'Valorizaciones mensuales, pago a 30 días de aprobadas',
  };

  p.entidades.proyectista = { ...entidadVacia(), nombre: 'Consultora Ejemplo S.A.C.', ruc: '20000000001', direccion: 'Av. Ejemplo 123, Lima', telefono: '+51 1 000 0000', email: 'proyectos@ejemplo.pe', web: 'www.ejemplo.pe', logo: LOGO_PROYECTISTA_EJEMPLO };
  p.entidades.cliente = { ...entidadVacia(), nombre: 'Compañía Minera Ejemplo S.A.A.', ruc: '20000000002', direccion: 'Unidad Minera Ejemplo, Yauli, Junín', logo: LOGO_CLIENTE_EJEMPLO };
  p.responsables = {
    elaboro: { nombre: 'Ing. Nombre Apellido', cargo: 'Especialista en costos y presupuestos', colegiatura: 'CIP 000000', fecha: '2026-10-01' },
    reviso: { nombre: 'Ing. Revisor Ejemplo', cargo: 'Jefe de proyecto', colegiatura: 'CIP 000001', fecha: '2026-10-02' },
    aprobo: { nombre: 'Ing. Aprobador Ejemplo', cargo: 'Gerente de proyecto', colegiatura: 'CIP 000002', fecha: '2026-10-03' },
  };
  p.documento = { ...p.documento, codigo: 'DEMO-001', revision: '0', fechaRevision: '2026-10-01', autores: 'Ing. Nombre Apellido' };

  const partidas: Partida[] = [];
  const apus: Record<string, Apu> = {};
  const metrados: MetradoFila[] = [];
  const programa: Record<string, Actividad> = {};
  const id = (codigo: string) => 'p' + codigo.replace(/\./g, '');
  const titulo = (codigo: string, descripcion: string) => partidas.push({ id: id(codigo), codigo, descripcion, unidad: '', titulo: true });
  let n = 0;
  const partida = (codigo: string, clave: string, filas: M[], cfg: { cuadrillas?: number; duracion?: number; preds?: [string, TipoPred, number][]; descripcion?: string } = {}) => {
    const t = partidaTipo(clave)!;
    const pid = id(codigo);
    partidas.push({ id: pid, codigo, descripcion: cfg.descripcion ?? t.descripcion, unidad: t.unidad });
    apus[pid] = clonar(t.apu);
    for (const [descripcion, veces, largo, ancho, alto, referencia, cantidad] of filas) {
      metrados.push({ id: `m${++n}`, partidaId: pid, descripcion, veces, largo, ancho, alto, cantidad: cantidad ?? null, referencia });
    }
    programa[pid] = {
      cuadrillas: cfg.cuadrillas ?? 1,
      duracionManual: cfg.duracion ?? t.duracionManual ?? null,
      predecesoras: (cfg.preds ?? []).map(([c, tipo, desfase]) => ({ id: id(c), tipo, desfase })),
    };
  };

  titulo('01', 'OBRAS PROVISIONALES Y TRABAJOS PRELIMINARES');
  partida('01.01', 'movilizacion', [['Movilización y desmovilización', null, null, null, null, 'TdR – Alcance', 1]]);
  partida('01.02', 'campamento', [['Instalaciones provisionales', null, null, null, null, 'Plano PG-01', 1]], { preds: [['01.01', 'CC', 2]] });
  partida('01.03', 'trazo', [
    ['Depósito de desmonte D-1', 1, 150, 80, null, 'Plano DD-01'],
    ['Bocaminas BM-1, BM-2 y BM-3', 3, 10, 8, null, 'Plano BM-01'],
    ['Canal de coronación', 1, 420, 2, null, 'Plano DR-01'],
  ], { cuadrillas: 2, preds: [['01.01', 'FC', 0]] });

  titulo('02', 'SEGURIDAD Y SALUD OCUPACIONAL');
  partida('02.01', 'ssoma', [['Plan e implementación', null, null, null, null, 'TdR – SSOMA', 1]], { preds: [['01.01', 'CC', 0]] });
  partida('02.02', 'senalizacion', [['Señalización de frentes de trabajo', null, null, null, null, 'Plano PG-01', 1]], { preds: [['01.01', 'CC', 1]] });

  titulo('03', 'CIERRE DE BOCAMINAS');
  partida('03.01', 'desquinche', [['Bocaminas BM-1 a BM-3', 3, 6, 2.5, 1, 'Plano BM-01']], { cuadrillas: 2, preds: [['01.03', 'CC', 3]] });
  partida('03.02', 'excRoca', [['Cimentación de tapones', 3, 3.2, 3, 0.5, 'Plano BM-02']], { preds: [['03.01', 'FC', 0]] });
  partida('03.03', 'acero', [['Tapones de concreto armado', 3, null, null, null, 'Plano BM-02 – cuadro de acero', 420]], { preds: [['03.02', 'FC', 0]], descripcion: 'Acero de refuerzo fy=4200 kg/cm2 en tapón' });
  partida('03.04', 'encofrado', [['Tapones (2 caras)', 6, 3, 2.8, null, 'Plano BM-02']], { preds: [['03.03', 'CC', 2]] });
  partida('03.05', 'concreto210', [['Tapones de concreto', 3, 3, 2.8, 1.5, 'Plano BM-02']], { preds: [['03.04', 'FC', 0]] });
  partida('03.06', 'rellenoBocamina', [['Relleno detrás de tapón', 3, 2.8, 2.5, 8, 'Plano BM-03']], { preds: [['03.05', 'FC', 7]] });

  titulo('04', 'REHABILITACIÓN DEL DEPÓSITO DE DESMONTE D-1');
  partida('04.01', 'perfilado', [['Taludes según secciones S-1 a S-12', null, null, null, null, 'Plano DD-02 – secciones', 18500]], { cuadrillas: 2, preds: [['01.03', 'CC', 5]] });
  partida('04.02', 'conformacion', [['Plataforma superior', 1, 150, 80, null, 'Plano DD-01']], { preds: [['04.01', 'FC', 0]] });
  partida('04.03', 'geotextil', [['Zona de cobertura impermeable', 1, 120, 80, null, 'Plano DD-03']], { preds: [['04.02', 'CC', 2]] });
  partida('04.04', 'geomembrana', [['Zona de cobertura impermeable', 1, 120, 80, null, 'Plano DD-03']], { preds: [['04.03', 'CC', 2]] });
  partida('04.05', 'coberturaPrestamo', [['Sobre geomembrana', 1, 120, 80, 0.3, 'Plano DD-03']], { preds: [['04.04', 'CC', 3], ['04.04', 'FF', 2]] });
  partida('04.06', 'topsoil', [['Plataforma superior', 1, 150, 80, 0.2, 'Plano DD-03']], { preds: [['04.05', 'FC', 0]] });
  partida('04.07', 'revegetacion', [['Plataforma superior', 1, 150, 80, null, 'Plano DD-04']], { cuadrillas: 2, preds: [['04.06', 'CC', 3]] });

  titulo('05', 'OBRAS DE DRENAJE');
  partida('05.01', 'excCanal', [['Canal de coronación', 1, 420, 0.8, 0.6, 'Plano DR-01']], { cuadrillas: 6, preds: [['04.01', 'CC', 5]] });
  partida('05.02', 'encofradoCanal', [['Paredes del canal', 2, 420, null, 0.5, 'Plano DR-02']], { cuadrillas: 3, preds: [['05.01', 'CC', 3]] });
  partida('05.03', 'concreto175', [['Revestimiento del canal (e=0.15 m, perímetro 1.60 m)', 1, 420, 1.6, 0.15, 'Plano DR-02']], { preds: [['05.02', 'CC', 2]] });
  partida('05.04', 'eliminacion', [
    ['Desquinche de bocaminas (esponjamiento 25 %)', 3, 6, 2.5, 1.25, 'Plano BM-01'],
    ['Cimentación de tapones (esponjamiento 25 %)', 3, 3.2, 3, 0.625, 'Plano BM-02'],
    ['Canal de coronación (esponjamiento 25 %)', 1, 420, 0.8, 0.75, 'Plano DR-01'],
  ], { preds: [['05.01', 'FF', 2]] });

  titulo('06', 'VARIOS');
  partida('06.01', 'monitoreo', [['Campañas de monitoreo mensual', null, null, null, null, 'TdR – Plan de manejo ambiental', 3]], { duracion: 80, preds: [['01.01', 'CC', 5]] });
  partida('06.02', 'asbuilt', [['Obras ejecutadas', null, null, null, null, 'TdR – Entregables', 1]], { preds: [['04.07', 'FC', 0]] });
  partida('06.03', 'limpiezaFinal', [['Áreas intervenidas', 1, null, null, null, 'Planos DD-01, BM-01, DR-01', 13080]], { cuadrillas: 4, preds: [['04.07', 'FC', 0]] });

  p.partidas = partidas;
  p.apus = apus;
  p.metrados = metrados;
  p.programa = programa;
  p.tdr = {
    titulo: 'Términos de referencia – Servicio de cierre de bocaminas y rehabilitación del depósito de desmonte D-1',
    resumen: 'Ejecución de las obras de cierre de tres bocaminas y de la rehabilitación física del depósito de desmonte D-1, conforme al plan de cierre aprobado, incluyendo obras de drenaje y revegetación.',
    entregables: [
      ...ENTREGABLES_BASE.map((e, i) => ({ id: `tdr${i + 1}`, descripcion: e.descripcion, documento: e.documento, obligatorio: true })),
      { id: 'tdr20', descripcion: 'Histograma de personal', documento: 'personal', obligatorio: true },
      { id: 'tdr21', descripcion: 'Calendario de utilización de equipos', documento: 'equipos', obligatorio: true },
      { id: 'tdr22', descripcion: 'Carta de presentación de la oferta', documento: 'carta', obligatorio: true },
      { id: 'tdr23', descripcion: 'Planos de diseño del cierre', documento: 'externo', obligatorio: true, observacion: 'Proporcionados por el titular minero (plan de cierre aprobado).' },
    ],
  };
  p.memoria = {
    antecedentes: 'El titular minero cuenta con un plan de cierre de minas aprobado que contempla el cierre definitivo de las bocaminas BM-1, BM-2 y BM-3 y la rehabilitación del depósito de desmonte D-1. El presente expediente desarrolla los costos, el programa y las especificaciones para su ejecución.',
    objetivo: 'Asegurar la estabilidad física, geoquímica e hidrológica de los componentes intervenidos, impedir el ingreso de personas y animales a las labores subterráneas y restablecer la cobertura vegetal del depósito.',
    alcance: 'Comprende las obras provisionales, la implementación de seguridad y salud ocupacional, el cierre de tres bocaminas con tapones de concreto armado y relleno, el perfilado de taludes, la cobertura impermeable con geosintéticos, la colocación de suelo orgánico y la revegetación del depósito D-1, así como el canal de coronación y la eliminación del material excedente.',
    descripcionTecnica: 'Los tapones se cimentarán en roca competente y tendrán 1.50 m de espesor. Los taludes del depósito se perfilarán a la geometría de diseño. La cobertura del depósito estará compuesta por geotextil de 300 g/m2, geomembrana HDPE de 1.5 mm, 0.30 m de material de préstamo y 0.20 m de suelo orgánico revegetado con pastos nativos. El canal de coronación tendrá revestimiento de concreto de 0.15 m.',
    consideraciones: 'Los precios de insumos del proyecto de ejemplo son referenciales y deben actualizarse con fuentes vigentes antes de emitir una oferta.',
  };
  void BIBLIOTECA;
  return p;
}
