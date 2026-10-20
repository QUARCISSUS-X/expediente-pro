// Exportación a Excel (.xlsx) totalmente editable: las hojas están vinculadas con fórmulas.
// Cambiar un metrado, un rendimiento, una cuadrilla, un precio o un porcentaje recalcula los APU,
// el presupuesto, los gastos generales, la fórmula polinómica, los resúmenes y los cronogramas.
// Cada fórmula se guarda con su resultado calculado por el motor (se ve correcto aun sin recalcular)
// y el libro pide recálculo completo al abrirse.
import ExcelJS from 'exceljs';
import { encajar, datosCabecera, logoBytes } from '../engine/cabecera';
import { NOMBRE_DOC } from '../engine/documentos';
import type { ActividadCalc, DocKey, Resultados, TipoInsumo } from '../engine/types';
import { compararCodigos, diaSemana, fechaCorta, isoAFecha, num, redondear, sumarDias } from '../engine/util';
import { AREAS_GEOGRAFICAS } from '../data/iu';

// ------------------------------------------------------------ estilos

const AZUL = 'FF1F3A5F';
const AZUL_INPUT = 'FF0000CC';
const VERDE_LINK = 'FF0B6B2F';
const GRIS = 'FFE9EEF3';
const GRIS2 = 'FFF5F7F9';
const BORDE_FINO = { style: 'thin' as const, color: { argb: 'FFB8C3CF' } };
const BORDE_HAIR = { style: 'hair' as const, color: { argb: 'FFD5DCE4' } };
const FUENTE = 'Arial';

const F_MONEDA = '#,##0.00';
const F_CANT = '#,##0.0000';
const F_MET = '#,##0.00';
const F_PCT = '0.00%';
const F_FECHA = 'dd/mm/yyyy';

type Valor = ExcelJS.CellValue;
interface Estilo {
  negrita?: boolean;
  cursiva?: boolean;
  tam?: number;
  color?: string;
  fondo?: string;
  fmt?: string;
  h?: 'left' | 'center' | 'right';
  v?: 'top' | 'middle' | 'bottom';
  ajustar?: boolean;
  borde?: 'fino' | 'hair' | 'arriba' | 'caja';
  sangria?: number;
}

const COL = (n: number) => {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

class Hoja {
  ws: ExcelJS.Worksheet;
  constructor(public wb: ExcelJS.Workbook, public nombre: string, opciones?: Partial<ExcelJS.AddWorksheetOptions>) {
    this.ws = wb.addWorksheet(nombre, opciones);
  }
  /** Referencia absoluta a una celda de esta hoja desde otra hoja. */
  ref(f: number, c: number, abs = true): string {
    return `'${this.nombre}'!${abs ? '$' : ''}${COL(c)}${abs ? '$' : ''}${f}`;
  }
  rango(f1: number, c1: number, f2: number, c2: number, abs = true): string {
    const d = abs ? '$' : '';
    return `'${this.nombre}'!${d}${COL(c1)}${d}${f1}:${d}${COL(c2)}${d}${f2}`;
  }
  celda(f: number, c: number) {
    return this.ws.getCell(f, c);
  }
  estilo(cell: ExcelJS.Cell, e: Estilo = {}) {
    cell.font = { name: FUENTE, size: e.tam ?? 8.5, bold: e.negrita, italic: e.cursiva, color: e.color ? { argb: e.color } : undefined };
    if (e.fondo) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: e.fondo } };
    if (e.fmt) cell.numFmt = e.fmt;
    cell.alignment = { horizontal: e.h, vertical: e.v ?? 'middle', wrapText: e.ajustar, indent: e.sangria };
    if (e.borde === 'fino') cell.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
    else if (e.borde === 'hair') cell.border = { bottom: BORDE_HAIR };
    else if (e.borde === 'arriba') cell.border = { top: { style: 'thin', color: { argb: AZUL } } };
  }
  /** Valor fijo. */
  v(f: number, c: number, valor: Valor, e: Estilo = {}) {
    const cell = this.celda(f, c);
    cell.value = valor === undefined ? null : valor;
    this.estilo(cell, e);
    return cell;
  }
  /** Dato editable (texto azul). */
  dato(f: number, c: number, valor: Valor, e: Estilo = {}) {
    return this.v(f, c, valor, { ...e, color: AZUL_INPUT });
  }
  /** Fórmula con su resultado precalculado. */
  fx(f: number, c: number, formula: string, resultado: Valor, e: Estilo = {}) {
    const cell = this.celda(f, c);
    const fo = formula.startsWith('=') ? formula.slice(1) : formula;
    cell.value = { formula: fo, result: resultado as ExcelJS.CellFormulaValue['result'] };
    this.estilo(cell, e);
    return cell;
  }
  /** Vínculo a otra hoja (texto verde). */
  link(f: number, c: number, formula: string, resultado: Valor, e: Estilo = {}) {
    return this.fx(f, c, formula, resultado, { ...e, color: e.color ?? VERDE_LINK });
  }
  fila(f: number, c1: number, c2: number, e: Estilo) {
    for (let c = c1; c <= c2; c++) {
      const cell = this.celda(f, c);
      const prev = cell.font ?? {};
      cell.font = { name: FUENTE, size: prev.size ?? e.tam ?? 8.5, bold: e.negrita ?? prev.bold, italic: e.cursiva ?? prev.italic, color: prev.color ?? (e.color ? { argb: e.color } : undefined) };
      if (e.fondo) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: e.fondo } };
      if (e.borde === 'arriba') cell.border = { top: { style: 'thin', color: { argb: AZUL } } };
      if (e.borde === 'hair') cell.border = { bottom: BORDE_HAIR };
    }
  }
  cabecera(f: number, textos: string[], c1 = 1) {
    textos.forEach((t, i) => this.v(f, c1 + i, t, { negrita: true, color: 'FFFFFFFF', fondo: AZUL, h: 'center', ajustar: true, borde: 'fino' }));
    this.ws.getRow(f).height = 26;
  }
  anchos(a: number[]) {
    a.forEach((w, i) => (this.ws.getColumn(i + 1).width = w));
  }
}

// ------------------------------------------------------------ libro

interface Ctx {
  r: Resultados;
  wb: ExcelJS.Workbook;
  imgProyectista?: { id: number; ancho: number; alto: number };
  imgCliente?: { id: number; ancho: number; alto: number };
  datos: Record<string, string>; // nombre lógico -> referencia absoluta en Datos
  insumoFila: Map<string, number>; // código -> fila en Insumos
  apuPU: Map<string, string>; // partidaId -> ref al costo unitario
  apuRend: Map<string, string>;
  metTotal: Map<string, string>; // partidaId -> ref al total de metrados
  ppto: Map<string, { met: string; pu: string; parcial: string; fila: number }>;
  refs: Record<string, string>; // CD, GG, UTIL, SUB, IGV, TOTAL, INS_TOTAL ...
  totalesGrupoInsumo: Record<TipoInsumo, string>;
  plazoMeses: number;
  hDatos?: Hoja;
  filaPlazo?: number;
  /** Cronograma: fila de cada partida (columnas H = duración, I = inicio, J = fin). */
  prog?: { fila: Map<string, number>; finLab: string };
  /** Periodos de los cronogramas (referencias absolutas a la tabla de la hoja Distribución %). */
  per?: { ini: string[]; fin: string[]; finCalc: string[]; fila: number };
  apuFilas: { fila: number; partidaId: string; codigo: string; tipo: TipoInsumo; total: number }[];
}

// Calendario de obra en fórmulas (hoja oculta "Calendario"): una fila por día desde FECHA_INICIO con la marca de
// día laborable (DIAS_NO_LAB lun→dom y FERIADOS) y el acumulado de días laborables. Solo usa INDEX/MATCH/COUNTIF,
// que funcionan igual en Excel, LibreOffice y Google Sheets.
/** Días laborables entre a y b (inclusive), con a ≥ FECHA_INICIO. */
const NDL = (a: string, b: string) => `(INDEX(CAL_ACUM,${b}-FECHA_INICIO+1)-IF(${a}<=FECHA_INICIO,0,INDEX(CAL_ACUM,${a}-FECHA_INICIO)))`;
/** Fecha del n-ésimo día laborable contado desde FECHA_INICIO (n ≥ 1). */
const WDL = (n: string) => `INDEX(CAL_FECHA,MATCH(${n},CAL_ACUM,0))`;
/** Días laborables de la actividad [i, j] que caen en la ventana [lo, hi]. */
const DIAS = (i: string, j: string, lo: string, hi: string) => `IF(MAX(${i},${lo})>MIN(${j},${hi}),0,${NDL(`MAX(${i},${lo})`, `MIN(${j},${hi})`)})`;

function hojaCalendarioLaboral(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const m = r.proyecto.meta;
  const lab = new Set(m.diasLaborables.length ? m.diasLaborables : [1, 2, 3, 4, 5, 6]);
  const fer = new Set(m.feriados);
  const plazo = Math.max(1, r.programa.plazoDias);
  const n = Math.min(6000, Math.max(plazo * 3, plazo + 730));
  h.anchos([12, 10, 12]);
  h.cabecera(1, ['Fecha', 'Laborable', 'Acumulado']);
  let acum = 0;
  for (let k = 0; k < n; k++) {
    const f = k + 2;
    const iso = sumarDias(m.fechaInicio, k);
    const es = lab.has(diaSemana(iso)) && !fer.has(iso) ? 1 : 0;
    acum += es;
    h.fx(f, 1, `=FECHA_INICIO+${k}`, isoAFecha(iso), { fmt: F_FECHA });
    h.fx(f, 2, `=IF(AND(MID(DIAS_NO_LAB,WEEKDAY(A${f},2),1)="0",COUNTIF(FERIADOS,A${f})=0),1,0)`, es, { fmt: '0' });
    h.fx(f, 3, k === 0 ? `=B${f}` : `=C${f - 1}+B${f}`, acum, { fmt: '0' });
  }
  ctx.wb.definedNames.add(`'${h.nombre}'!$A$2:$A$${n + 1}`, 'CAL_FECHA');
  ctx.wb.definedNames.add(`'${h.nombre}'!$C$2:$C$${n + 1}`, 'CAL_ACUM');
}
const CRON = 'Cronograma';

/** Serie redondeada a 2 decimales cuyo resto va al último elemento no nulo (como cuadrar() del motor). */
function serieCuadrada(expr: (x: string) => string, total: string, items: string[], i: number): string {
  const r = (x: string) => `ROUND(${expr(x)},2)`;
  const resto = `${total}-(${items.map(r).join('+')})`;
  const despues = items.slice(i + 1).map((x) => `(${r(x)}<>0)`);
  const cond = despues.length ? `AND(${r(items[i])}<>0,${despues.join('+')}=0)` : `${r(items[i])}<>0`;
  return `${r(items[i])}+IF(${cond},${resto},0)`;
}
const cron = (c: string, f: number) => `'${CRON}'!$${c}$${f}`;

/** Días laborables de una actividad cuya fecha (desplazada `ant` días antes) cae en [lo, hi] (null = sin límite). */
function diasEnVentana(r: Resultados, a: ActividadCalc | undefined, ant: number, lo: string | null, hi: string | null): number {
  if (!a) return 0;
  let n = 0;
  for (let d = a.es; d < a.ef; d++) {
    const g = ant ? sumarDias(r.programa.diaFecha[d], -ant) : r.programa.diaFecha[d];
    if ((lo === null || g >= lo) && (hi === null || g <= hi)) n++;
  }
  return n;
}

function tituloHoja(h: Hoja, ctx: Ctx, titulo: string, ncols: number) {
  const c = datosCabecera(ctx.r.proyecto);
  const ws = h.ws;
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 14;
  const c2 = Math.max(2, ncols - 1);
  if (c2 > 2) ws.mergeCells(1, 2, 2, c2);
  h.v(1, 2, titulo.toUpperCase(), { negrita: true, tam: 13, color: AZUL, h: 'center' });
  if (c2 > 2) ws.mergeCells(3, 2, 3, c2);
  h.v(3, 2, [c.proyectista, c.codigoDocumento ? `Doc. ${c.codigoDocumento}` : '', `Revisión ${c.revision}`, c.estado].filter(Boolean).join(' · '), { tam: 7.5, color: 'FF5B6B7C', h: 'center' });
  if (ctx.imgProyectista) {
    const t = encajar({ dataUrl: '', ancho: ctx.imgProyectista.ancho, alto: ctx.imgProyectista.alto }, 110, 44);
    ws.addImage(ctx.imgProyectista.id, { tl: { col: 0.08, row: 0.15 }, ext: { width: t.ancho, height: t.alto }, editAs: 'oneCell' });
  }
  if (ctx.imgCliente) {
    const t = encajar({ dataUrl: '', ancho: ctx.imgCliente.ancho, alto: ctx.imgCliente.alto }, 110, 44);
    ws.addImage(ctx.imgCliente.id, { tl: { col: ncols - 1 + 0.05, row: 0.15 }, ext: { width: t.ancho, height: t.alto }, editAs: 'oneCell' });
  }
}

/** Fila donde termina el membrete (sin escribir nada). */
function finMembrete(ctx: Ctx, extra = 0): number {
  return 5 + (datosCabecera(ctx.r.proyecto).propietario ? 5 : 4) + extra + 1;
}

function membrete(h: Hoja, ctx: Ctx, titulo: string, ncols: number, extra: [string, string, Valor][] = []): number {
  const c = datosCabecera(ctx.r.proyecto);
  tituloHoja(h, ctx, titulo, ncols);
  const filas: [string, string, Valor][] = [
    ['Proyecto', ctx.datos.proyecto, c.proyecto],
    ['Cliente', ctx.datos.cliente, c.cliente],
    ...(c.propietario ? ([['Propietario', ctx.datos.propietario, c.propietario]] as [string, string, Valor][]) : []),
    ['Ubicación', ctx.datos.ubicacion, c.ubicacion],
    ['Fecha de precios', ctx.datos.fechaBase, isoAFecha(ctx.r.proyecto.meta.fechaBase)],
    ...extra,
  ];
  let f = 5;
  for (const [etq, ref, val] of filas) {
    h.v(f, 1, etq, { negrita: true, tam: 8, v: 'top' });
    if (ncols > 2) h.ws.mergeCells(f, 2, f, ncols);
    h.link(f, 2, `=${ref}`, val, { tam: 8, color: 'FF20262A', fmt: val instanceof Date ? F_FECHA : typeof val === 'number' ? '#,##0.00' : undefined, h: 'left', ajustar: true, v: 'top' });
    if (typeof val === 'string' && val.length > 95) h.ws.getRow(f).height = 22;
    f++;
  }
  return f + 1;
}

function configurarImpresion(h: Hoja, ctx: Ctx, filaTitulos: number, horizontal: boolean) {
  const c = datosCabecera(ctx.r.proyecto);
  h.ws.pageSetup = {
    paperSize: 9,
    orientation: horizontal ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.25, footer: 0.25 },
    printTitlesRow: `${filaTitulos}:${filaTitulos}`,
  };
  const esc = (s: string) => (s || '').replace(/&/g, '&&');
  h.ws.headerFooter = {
    oddHeader: `&L&7 ${esc(c.proyectista)}&C&7 ${esc(c.tipoDocumento)}&R&7 ${c.codigoDocumento ? `Código ${esc(c.codigoDocumento)} · ` : ''}Rev. ${esc(c.revision)}`,
    oddFooter: `&L&7 ${esc(c.proyecto).slice(0, 90)}&R&7 Página &P de &N`,
  };
}

// ------------------------------------------------------------ Datos

function hojaDatos(ctx: Ctx) {
  const { r, wb } = ctx;
  const p = r.proyecto;
  const m = p.meta;
  const c = datosCabecera(p);
  const h = new Hoja(wb, 'Datos');
  h.anchos([44, 70, 16, 16]);
  tituloHoja(h, ctx, 'Datos generales del proyecto', 3);
  let f = 5;
  const sec = (t: string) => {
    h.v(f, 1, t, { negrita: true, color: 'FFFFFFFF', fondo: AZUL });
    h.v(f, 2, '', { fondo: AZUL });
    f++;
  };
  const fila = (clave: string, etq: string, valor: Valor, e: Estilo = {}, nombre?: string) => {
    h.v(f, 1, etq, { borde: 'hair' });
    h.dato(f, 2, valor, { borde: 'hair', h: 'left', ...e });
    ctx.datos[clave] = h.ref(f, 2);
    if (nombre) wb.definedNames.add(`'Datos'!$B$${f}`, nombre);
    f++;
  };
  sec('Proyecto');
  fila('proyecto', 'Nombre del proyecto', m.nombre, { ajustar: true });
  fila('codigo', 'Código del proyecto', m.codigo);
  fila('descripcion', 'Descripción', m.descripcion, { ajustar: true });
  fila('ubicacion', 'Ubicación', c.ubicacion, { ajustar: true });
  fila('area', 'Área geográfica (índices unificados INEI)', `${m.areaGeografica} – ${AREAS_GEOGRAFICAS[m.areaGeografica] ?? ''}`);
  fila('fecha', 'Fecha del proyecto', isoAFecha(m.fecha || m.fechaBase), { fmt: F_FECHA });
  fila('fechaBase', 'Fecha de determinación del presupuesto (precios)', isoAFecha(m.fechaBase), { fmt: F_FECHA });
  fila('modalidad', 'Modalidad', m.modo === 'publico' ? 'Expediente técnico de obra pública' : 'Cotización privada');
  fila('sistema', 'Sistema de contratación', m.sistemaContratacion);
  fila('moneda', 'Moneda', `${c.monedaNombre} (${m.moneda})`);
  fila('unidades', 'Sistema de unidades', m.unidadMedida);
  sec('Participantes');
  fila('cliente', 'Cliente', c.cliente);
  fila('propietario', 'Propietario / cliente final', c.propietario);
  fila('proyectista', 'Proyectista / consultor', c.proyectista);
  fila('elaboro', 'Elaborado por', [p.responsables.elaboro.nombre, p.responsables.elaboro.cargo, p.responsables.elaboro.colegiatura].filter(Boolean).join(' · '));
  fila('reviso', 'Revisado por', [p.responsables.reviso.nombre, p.responsables.reviso.cargo, p.responsables.reviso.colegiatura].filter(Boolean).join(' · '));
  fila('aprobo', 'Aprobado por', [p.responsables.aprobo.nombre, p.responsables.aprobo.cargo, p.responsables.aprobo.colegiatura].filter(Boolean).join(' · '));
  fila('docCodigo', 'Código de documento / revisión', `${c.codigoDocumento} · Rev. ${c.revision} · ${c.estado}`);
  sec('Parámetros de cálculo (editables)');
  fila('jornada', 'Jornada de trabajo (horas por día)', m.jornadaHoras, { fmt: '0.00' }, 'JORNADA');
  fila('utilidad', 'Utilidad (% del costo directo)', m.utilidadPct / 100, { fmt: F_PCT }, 'UTILIDAD');
  fila('igv', 'IGV', m.igvPct / 100, { fmt: F_PCT }, 'IGV');
  fila('incluirIgv', 'Incluir IGV en el total (1 = sí, 0 = no)', m.incluirIgv === false ? 0 : 1, { fmt: '0' }, 'INCLUIR_IGV');
  fila('fechaInicio', 'Fecha de inicio de obra', isoAFecha(m.fechaInicio), { fmt: F_FECHA }, 'FECHA_INICIO');
  const lab = new Set(m.diasLaborables.length ? m.diasLaborables : [1, 2, 3, 4, 5, 6]);
  fila('diasNoLab', 'Días no laborables (lun → dom; 1 = no laborable)', [1, 2, 3, 4, 5, 6, 0].map((d) => (lab.has(d) ? '0' : '1')).join(''), {}, 'DIAS_NO_LAB');
  // el plazo sale del cronograma: la fórmula se escribe al armar la hoja Cronograma
  ctx.filaPlazo = f;
  fila('plazoDias', 'Plazo de ejecución (días calendario, del cronograma)', r.programa.plazoDias, { fmt: '0' }, 'PLAZO_DIAS');
  h.v(f, 1, 'Plazo de ejecución (meses de 30 días)', { borde: 'hair' });
  h.fx(f, 2, `=ROUND(PLAZO_DIAS/30,2)`, r.programa.plazoMeses, { fmt: '0.00', borde: 'hair', h: 'left' });
  wb.definedNames.add(`'Datos'!$B$${f}`, 'PLAZO_MESES');
  ctx.datos.plazoMeses = h.ref(f, 2);
  f++;
  fila('adelDir', 'Adelanto directo', m.adelantoDirectoPct / 100, { fmt: F_PCT }, 'ADELANTO_DIRECTO');
  fila('adelMat', 'Adelanto de materiales', m.adelantoMaterialesPct / 100, { fmt: F_PCT }, 'ADELANTO_MATERIALES');
  fila('flete', 'Tarifa de flete (por tonelada)', m.fleteTarifaTon, { fmt: F_MONEDA }, 'TARIFA_FLETE');
  sec('Feriados (días no laborables adicionales)');
  const fer = [...m.feriados].sort();
  const nFer = Math.max(8, fer.length + 4);
  const f1 = f;
  for (let i = 0; i < nFer; i++) {
    h.v(f, 1, i === 0 ? 'Fechas (una por celda; se pueden agregar)' : '', { borde: 'hair', tam: 7.5 });
    h.dato(f, 2, fer[i] ? isoAFecha(fer[i]) : null, { fmt: F_FECHA, borde: 'hair', h: 'left' });
    f++;
  }
  wb.definedNames.add(`'Datos'!$B$${f1}:$B$${f - 1}`, 'FERIADOS');
  f++;
  h.v(f++, 1, 'Cómo usar este libro', { negrita: true, color: AZUL });
  for (const t of [
    'Texto azul: datos que puede modificar (metrados, rendimientos, cuadrillas, cantidades, precios, porcentajes y parámetros).',
    'Texto negro: fórmulas. Texto verde: vínculos a otra hoja. No sobrescriba las fórmulas.',
    'Al cambiar un dato se recalculan APU, presupuesto, gastos generales, fórmula polinómica, resúmenes, cronogramas y controles.',
    'El cronograma también es de fórmulas: duración = metrado ÷ (rendimiento × cuadrillas); inicio y fin salen de las predecesoras, la fecha de inicio, los días no laborables y los feriados (ruta crítica incluida). De ahí se calculan el plazo, los gastos generales ligados al plazo, la distribución por periodos, el valorizado, los calendarios y los desembolsos.',
    'Las predecesoras y la cantidad de periodos se fijan al exportar; si el plazo crece, lo que exceda se acumula en el último periodo.',
  ]) {
    h.ws.mergeCells(f, 1, f, 2);
    h.v(f++, 1, t, { ajustar: true, tam: 8 });
  }
  configurarImpresion(h, ctx, 4, false);
  ctx.hDatos = h;
  return h;
}

// ------------------------------------------------------------ Insumos

const TIPOS: { t: TipoInsumo; n: string }[] = [
  { t: 'MO', n: 'MANO DE OBRA' },
  { t: 'MAT', n: 'MATERIALES' },
  { t: 'EQ', n: 'EQUIPOS' },
  { t: 'SC', n: 'SUBCONTRATOS' },
];

function insumosUsados(r: Resultados) {
  const usados = new Map(r.insumos.items.map((i) => [i.insumo.codigo, i]));
  // también los insumos usados en APU de partidas sin metrado
  for (const a of Object.values(r.apus)) for (const it of a.items) if (!usados.has(it.insumo.codigo)) usados.set(it.insumo.codigo, { insumo: it.insumo, cantidad: 0, precio: it.insumo.precio, parcial: 0 });
  return usados;
}

/** Fija de antemano la fila de cada insumo en la hoja Insumos (los APU se escriben antes y la referencian). */
function planInsumos(ctx: Ctx) {
  const usados = insumosUsados(ctx.r);
  let f = finMembrete(ctx) + 1;
  for (const { t } of TIPOS) {
    const its = [...usados.values()].filter((x) => x.insumo.tipo === t).sort((a, b) => a.insumo.descripcion.localeCompare(b.insumo.descripcion));
    if (!its.length) continue;
    f++;
    for (const it of its) ctx.insumoFila.set(it.insumo.codigo, f++);
  }
}

function hojaInsumos(ctx: Ctx, h: Hoja, hApu: Hoja) {
  const { r } = ctx;
  const usados = insumosUsados(r);
  h.anchos([12, 52, 8, 6, 6, 13, 30, 12, 14, 15]);
  let f = membrete(h, ctx, 'Relación y cotización de insumos', 10);
  const filaCab = f;
  h.cabecera(f++, ['Código', 'Descripción del insumo', 'Unidad', 'Tipo', 'IU', `Precio (${r.proyecto.meta.moneda})`, 'Fuente / cotización', 'Fecha cot.', 'Cantidad', `Parcial (${r.proyecto.meta.moneda})`]);
  const subtotales: string[] = [];
  const sumRango = `${hApu.rango(1, 1, 20000, 1)}`;
  for (const { t, n } of TIPOS) {
    const its = [...usados.values()].filter((x) => x.insumo.tipo === t).sort((a, b) => a.insumo.descripcion.localeCompare(b.insumo.descripcion));
    if (!its.length) continue;
    const fGrupo = f++;
    h.v(fGrupo, 2, n, { negrita: true });
    h.fila(fGrupo, 1, 10, { fondo: GRIS, negrita: true });
    const ini = f;
    for (const it of its) {
      const i = it.insumo;
      const pct = i.unidad.trim().startsWith('%');
      h.v(f, 1, i.codigo, { borde: 'hair' });
      h.v(f, 2, i.descripcion, { borde: 'hair' });
      h.v(f, 3, i.unidad, { h: 'center', borde: 'hair' });
      h.v(f, 4, i.tipo, { h: 'center', borde: 'hair' });
      h.v(f, 5, i.iu || '39', { h: 'center', borde: 'hair' });
      if (pct) h.v(f, 6, null, { borde: 'hair' });
      else h.dato(f, 6, i.precio, { fmt: F_MONEDA, borde: 'hair' });
      h.dato(f, 7, i.fuente ?? '', { borde: 'hair', tam: 7.5 });
      h.dato(f, 8, i.fechaPrecio ? isoAFecha(i.fechaPrecio) : null, { fmt: F_FECHA, borde: 'hair', tam: 7.5 });
      if (pct) {
        h.v(f, 9, null, { borde: 'hair' });
        h.fx(f, 10, `=ROUND(SUMIF(${sumRango},$A${f},${hApu.rango(1, 9, 20000, 9)}),2)`, it.parcial, { fmt: F_MONEDA, borde: 'hair' });
      } else {
        h.fx(f, 9, `=ROUND(SUMIF(${sumRango},$A${f},${hApu.rango(1, 8, 20000, 8)}),4)`, it.cantidad, { fmt: F_CANT, borde: 'hair' });
        h.fx(f, 10, `=ROUND(I${f}*F${f},2)`, it.parcial, { fmt: F_MONEDA, borde: 'hair' });
      }
      if (ctx.insumoFila.get(i.codigo) !== f) throw new Error(`Desfase de filas en Insumos (${i.codigo})`);
      f++;
    }
    h.fx(fGrupo, 10, `=SUM(J${ini}:J${f - 1})`, r.insumos.porTipo[t], { fmt: F_MONEDA, negrita: true, fondo: GRIS });
    ctx.totalesGrupoInsumo[t] = h.ref(fGrupo, 10);
    subtotales.push(`J${fGrupo}`);
  }
  f++;
  h.v(f, 2, 'TOTAL DE INSUMOS', { negrita: true });
  h.fx(f, 10, `=${subtotales.join('+') || 0}`, r.insumos.total, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 10, { borde: 'arriba', negrita: true });
  ctx.refs.INS_TOTAL = h.ref(f, 10);
  f++;
  h.v(f, 2, 'Diferencia por redondeo de los análisis de precios unitarios', { cursiva: true, tam: 7.5 });
  h.fx(f, 10, `=${ctx.refs.CD}-J${f - 1}`, r.insumos.diferenciaRedondeo, { fmt: F_MONEDA, cursiva: true, tam: 7.5 });
  f++;
  h.v(f, 2, 'COSTO DIRECTO', { negrita: true });
  h.link(f, 10, `=${ctx.refs.CD}`, r.pie.costoDirecto, { fmt: F_MONEDA, negrita: true });
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, false);
}

// ------------------------------------------------------------ Metrados

function hojaMetrados(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const p = r.proyecto;
  h.anchos([13, 46, 6, 18, 8, 9, 8, 9, 9, 9, 10, 10, 12, 13]);
  let f = membrete(h, ctx, 'Planilla de sustento de metrados', 14);
  const filaCab = f;
  h.cabecera(f++, ['Ítem', 'Descripción', 'Und', 'Referencia (plano N.º)', 'N.º veces', 'Cantidad', 'Factor', 'Largo (m)', 'Ancho (m)', 'Alto (m)', 'Área CAD (m²)', 'Volumen CAD (m³)', 'Metrado parcial', 'Metrado total']);
  const porPartida = new Map<string, typeof p.metrados>();
  for (const m of p.metrados) {
    const l = porPartida.get(m.partidaId) ?? [];
    l.push(m);
    porPartida.set(m.partidaId, l);
  }
  for (const fp of r.filas) {
    const pt = fp.partida;
    if (fp.esTitulo) {
      h.v(f, 1, pt.codigo, { negrita: true });
      h.v(f, 2, pt.descripcion, { negrita: true });
      h.fila(f, 1, 14, { fondo: fp.nivel === 1 ? GRIS : GRIS2, negrita: true });
      f++;
      continue;
    }
    const fP = f++;
    h.v(fP, 1, pt.codigo, { negrita: true });
    h.v(fP, 2, pt.descripcion, { negrita: true, ajustar: true });
    h.v(fP, 3, pt.unidad, { h: 'center', negrita: true });
    const lineas = porPartida.get(pt.id) ?? [];
    const ini = f;
    for (const m of lineas) {
      h.v(f, 2, m.descripcion, { sangria: 1, borde: 'hair' });
      h.dato(f, 4, m.referencia ?? '', { borde: 'hair', tam: 7.5 });
      (['veces', 'cantidad', 'factor', 'largo', 'ancho', 'alto', 'area', 'volumen'] as const).forEach((k, i) => {
        const val = m[k];
        h.dato(f, 5 + i, val === null || val === undefined || (val as unknown) === '' ? null : num(val), { fmt: '#,##0.00##', borde: 'hair' });
      });
      const llenos = (['veces', 'cantidad', 'factor', 'largo', 'ancho', 'alto', 'area', 'volumen'] as const).map((k) => m[k]).filter((x) => x !== null && x !== undefined && (x as unknown) !== '');
      const parcial = llenos.length ? llenos.reduce<number>((a, b) => a * num(b), 1) : 0;
      h.fx(f, 13, `=IF(COUNT(E${f}:L${f})=0,0,PRODUCT(E${f}:L${f}))`, parcial, { fmt: F_MET, borde: 'hair' });
      f++;
    }
    const total = r.metradoPorPartida[pt.id] ?? 0;
    h.fx(fP, 14, lineas.length ? `=ROUND(SUM(M${ini}:M${f - 1}),2)` : '=0', total, { fmt: F_MET, negrita: true });
    ctx.metTotal.set(pt.id, h.ref(fP, 14));
  }
  h.ws.views = [{ state: 'frozen', ySplit: filaCab, xSplit: 2 }];
  configurarImpresion(h, ctx, filaCab, true);
}

function hojaResumenMetrados(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  h.anchos([13, 70, 8, 14]);
  let f = membrete(h, ctx, 'Resumen de metrados', 4);
  const filaCab = f;
  h.cabecera(f++, ['Ítem', 'Descripción', 'Und', 'Metrado']);
  for (const fp of r.filas) {
    h.v(f, 1, fp.partida.codigo, { negrita: fp.esTitulo, borde: 'hair' });
    h.v(f, 2, fp.partida.descripcion, { negrita: fp.esTitulo, sangria: fp.nivel - 1, borde: 'hair' });
    if (!fp.esTitulo) {
      h.v(f, 3, fp.partida.unidad, { h: 'center', borde: 'hair' });
      h.link(f, 4, `=${ctx.metTotal.get(fp.partida.id)}`, fp.metrado, { fmt: F_MET, borde: 'hair' });
    } else h.fila(f, 1, 4, { fondo: fp.nivel === 1 ? GRIS : GRIS2 });
    f++;
  }
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, false);
}

// ------------------------------------------------------------ APU (formato estándar)

function hojaApu(ctx: Ctx, h: Hoja, hPpto: Hoja, filaPptoDe: Map<string, number>) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  h.anchos([13, 48, 7, 10, 11, 11, 12, 12, 12]);
  let f = membrete(h, ctx, 'Análisis de precios unitarios', 7);
  for (const fp of r.hojas) {
    const pt = fp.partida;
    const a = r.apus[pt.id];
    if (!a) continue;
    h.v(f, 1, 'Partida', { negrita: true, fondo: GRIS });
    h.v(f, 2, `${pt.codigo}   ${pt.descripcion}`, { negrita: true, fondo: GRIS, ajustar: true });
    h.ws.mergeCells(f, 2, f, 7);
    f++;
    const fRend = f;
    h.v(f, 1, 'Rendimiento', { negrita: true });
    h.dato(f, 2, a.rendimiento, { fmt: `#,##0.0000" ${pt.unidad.replace(/"/g, '')}/día"`, h: 'left' });
    // jornada del análisis: la del proyecto (vínculo) o una propia de este APU (dato)
    const apuP = r.proyecto.apus[pt.id];
    if (apuP?.jornada) h.dato(f, 3, a.jornada, { fmt: '0.0" h/día"', tam: 7.5 });
    else h.link(f, 3, '=JORNADA', a.jornada, { fmt: '0.0" h/día"', tam: 7.5 });
    h.v(f, 4, `Costo unitario directo por: ${pt.unidad}`, { negrita: true, h: 'right' });
    h.ws.mergeCells(f, 4, f, 6);
    const refRend = `$B$${fRend}`;
    ctx.apuRend.set(pt.id, h.ref(fRend, 2));
    f++;
    h.cabecera(f++, ['Código', 'Descripción del recurso', 'Unidad', 'Cuadrilla', 'Cantidad', `Precio (${mon})`, `Parcial (${mon})`]);
    const metRef = `'${hPpto.nombre}'!$D$${filaPptoDe.get(pt.id)}`;
    // primera pasada: filas de cada grupo y de cada recurso (los % de MO/MAT se calculan sobre los recursos no porcentuales)
    const grupos = TIPOS.filter(({ t }) => a.items.some((x) => x.insumo.tipo === t));
    const plan: { t: TipoInsumo; n: string; fila: number; items: { it: (typeof a.items)[number]; fila: number }[] }[] = [];
    const noPct: Record<string, number[]> = { MO: [], MAT: [], EQ: [], SC: [] };
    let g = f;
    for (const { t, n } of grupos) {
      const fG = g++;
      const items = a.items.filter((x) => x.insumo.tipo === t).map((it) => ({ it, fila: g++ }));
      for (const x of items) if (x.it.porcentaje === null) noPct[t].push(x.fila);
      plan.push({ t, n, fila: fG, items });
    }
    const subt: string[] = [];
    for (const grp of plan) {
      h.v(grp.fila, 2, grp.n.charAt(0) + grp.n.slice(1).toLowerCase(), { negrita: true });
      for (const { it, fila: fr } of grp.items) {
        const fi = ctx.insumoFila.get(it.insumo.codigo);
        const pct = it.porcentaje !== null;
        h.v(fr, 1, it.insumo.codigo, { borde: 'hair' });
        h.link(fr, 2, fi ? `='Insumos'!$B$${fi}` : `="${it.insumo.descripcion.replace(/"/g, '""')}"`, it.insumo.descripcion, { borde: 'hair', color: 'FF20262A' });
        h.v(fr, 3, it.insumo.unidad, { h: 'center', borde: 'hair' });
        if (pct) {
          const deMat = it.insumo.unidad.toLowerCase().includes('mat');
          const base = noPct[deMat ? 'MAT' : 'MO'];
          const baseVal = a.items.filter((x) => x.porcentaje === null && x.insumo.tipo === (deMat ? 'MAT' : 'MO')).reduce((acc, x) => acc + x.parcial, 0);
          h.v(fr, 4, null, { borde: 'hair' });
          h.dato(fr, 5, it.cantidad, { fmt: '0.00"%"', borde: 'hair' });
          h.fx(fr, 6, base.length ? `=${base.map((x) => `G${x}`).join('+')}` : '=0', redondear(baseVal, 2), { fmt: F_MONEDA, borde: 'hair' });
          h.fx(fr, 7, `=ROUND(E${fr}/100*F${fr},2)`, it.parcial, { fmt: F_MONEDA, borde: 'hair' });
          h.v(fr, 8, null);
          h.fx(fr, 9, `=G${fr}*${metRef}`, it.parcial * fp.metrado, { fmt: F_MONEDA });
        } else {
          const conCuadrilla = it.cuadrilla !== null && (grp.t === 'MO' || grp.t === 'EQ');
          if (conCuadrilla) {
            h.dato(fr, 4, it.cuadrilla, { fmt: '0.0000', borde: 'hair' });
            h.fx(fr, 5, `=IF(${refRend}>0,ROUND(D${fr}*$C$${fRend}/${refRend},4),0)`, it.cantidad, { fmt: F_CANT, borde: 'hair' });
          } else {
            h.v(fr, 4, null, { borde: 'hair' });
            h.dato(fr, 5, it.cantidad, { fmt: F_CANT, borde: 'hair' });
          }
          h.link(fr, 6, fi ? `='Insumos'!$F$${fi}` : '=0', it.precio, { fmt: F_MONEDA, borde: 'hair' });
          h.fx(fr, 7, `=ROUND(E${fr}*F${fr},2)`, it.parcial, { fmt: F_MONEDA, borde: 'hair' });
          h.fx(fr, 8, `=E${fr}*${metRef}`, it.cantidad * fp.metrado, { fmt: F_CANT });
          ctx.apuFilas.push({ fila: fr, partidaId: pt.id, codigo: it.insumo.codigo, tipo: it.insumo.tipo, total: it.cantidad * fp.metrado });
          h.fx(fr, 9, `=G${fr}*${metRef}`, it.parcial * fp.metrado, { fmt: F_MONEDA });
        }
      }
      const ini = grp.fila + 1;
      const ult = grp.items.length ? grp.items[grp.items.length - 1].fila : grp.fila;
      h.fx(grp.fila, 7, ult > grp.fila ? `=SUM(G${ini}:G${ult})` : '=0', a.subtotales[grp.t], { fmt: F_MONEDA, negrita: true });
      subt.push(`G${grp.fila}`);
    }
    f = g;
    h.fx(fRend, 7, `=ROUND(${subt.join('+') || 0},2)`, a.pu, { fmt: F_MONEDA, negrita: true, fondo: GRIS });
    ctx.apuPU.set(pt.id, h.ref(fRend, 7));
    f += 1;
  }
  // columnas auxiliares para la relación de insumos (cantidad y parcial por el metrado)
  h.ws.getColumn(8).hidden = true;
  h.ws.getColumn(9).hidden = true;
  h.ws.getCell(5, 8).value = 'Aux: cantidad × metrado';
  h.ws.getCell(5, 9).value = 'Aux: parcial × metrado';
  configurarImpresion(h, ctx, 0, false);
  h.ws.pageSetup.printTitlesRow = undefined;
}

// ------------------------------------------------------------ Presupuesto

function filaUltimoDescendiente(r: Resultados, idx: number): number {
  const base = r.filas[idx];
  let j = idx;
  while (j + 1 < r.filas.length && r.filas[j + 1].partida.codigo.startsWith(base.partida.codigo + '.')) j++;
  return j;
}

function hojaPresupuesto(ctx: Ctx, h: Hoja, filaPptoDe: Map<string, number>, soloPlan = false) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  h.anchos([14, 58, 7, 12, 12, 15, 4]);
  let f = soloPlan ? finMembrete(ctx) : membrete(h, ctx, r.proyecto.meta.modo === 'publico' ? 'Presupuesto de obra' : 'Presupuesto', 6);
  const filaCab = f;
  if (!soloPlan) h.cabecera(f, ['Ítem', 'Descripción', 'Und.', 'Metrado', `Precio (${mon})`, `Parcial (${mon})`]);
  f++;
  const ini = f;
  // primera pasada: filas (el APU necesita conocer la fila del metrado de cada partida)
  r.filas.forEach((fp) => {
    filaPptoDe.set(fp.partida.id, f);
    f++;
  });
  if (soloPlan) return;
  const fin = f - 1;
  r.filas.forEach((fp, idx) => {
    const fi = filaPptoDe.get(fp.partida.id)!;
    const pt = fp.partida;
    h.v(fi, 1, pt.codigo, { negrita: fp.esTitulo, borde: 'hair' });
    h.v(fi, 2, pt.descripcion, { negrita: fp.esTitulo, sangria: Math.min(4, fp.nivel - 1), ajustar: true, borde: 'hair' });
    h.v(fi, 7, fp.esTitulo ? 'T' : 'P', { tam: 6, color: 'FFB0B8BF' });
    if (fp.esTitulo) {
      const ult = filaPptoDe.get(r.filas[filaUltimoDescendiente(r, idx)].partida.id)!;
      h.fx(fi, 6, ult > fi ? `=SUBTOTAL(9,F${fi + 1}:F${ult})` : '=0', fp.parcial, { fmt: F_MONEDA, negrita: true, borde: 'hair' });
      h.fila(fi, 1, 6, { fondo: fp.nivel === 1 ? GRIS : GRIS2 });
    } else {
      h.v(fi, 3, pt.unidad, { h: 'center', borde: 'hair' });
      h.link(fi, 4, `=${ctx.metTotal.get(pt.id)}`, fp.metrado, { fmt: F_MET, borde: 'hair' });
      h.link(fi, 5, `=${ctx.apuPU.get(pt.id)}`, fp.pu, { fmt: F_MONEDA, borde: 'hair' });
      h.fx(fi, 6, `=ROUND(D${fi}*E${fi},2)`, fp.parcial, { fmt: F_MONEDA, borde: 'hair' });
      ctx.ppto.set(pt.id, { met: h.ref(fi, 4), pu: h.ref(fi, 5), parcial: h.ref(fi, 6), fila: fi });
    }
  });
  h.ws.getColumn(7).hidden = true;
  f = fin + 2;
  const pie = r.pie;
  const fCD = f;
  h.v(f, 2, 'COSTO DIRECTO', { negrita: true, h: 'right' });
  h.fx(f, 6, `=SUBTOTAL(9,F${ini}:F${fin})`, pie.costoDirecto, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 6, { borde: 'arriba' });
  ctx.refs.CD = h.ref(f, 6);
  f++;
  const fGG = f;
  h.v(f, 2, 'GASTOS GENERALES', { h: 'right' });
  h.fx(f, 5, `=IF(F${fCD}>0,F${f}/F${fCD},0)`, pie.costoDirecto ? pie.gg / pie.costoDirecto : 0, { fmt: F_PCT });
  ctx.refs.GG_FILA = String(f);
  f++;
  const fUt = f;
  h.v(f, 2, 'UTILIDAD', { h: 'right' });
  h.link(f, 5, `=UTILIDAD`, r.proyecto.meta.utilidadPct / 100, { fmt: F_PCT });
  h.fx(f, 6, `=ROUND(F${fCD}*E${f},2)`, pie.utilidad, { fmt: F_MONEDA });
  ctx.refs.UTIL = h.ref(f, 6);
  f++;
  const fSub = f;
  h.v(f, 2, 'SUBTOTAL', { negrita: true, h: 'right' });
  h.fx(f, 6, `=F${fCD}+F${fGG}+F${fUt}`, pie.subtotal, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 6, { borde: 'arriba' });
  ctx.refs.SUB = h.ref(f, 6);
  f++;
  const fIgv = f;
  h.v(f, 2, 'IGV', { h: 'right' });
  h.fx(f, 5, `=IGV*INCLUIR_IGV`, r.proyecto.meta.incluirIgv === false ? 0 : r.proyecto.meta.igvPct / 100, { fmt: F_PCT });
  h.fx(f, 6, `=ROUND(F${fSub}*E${f},2)`, pie.igv, { fmt: F_MONEDA });
  ctx.refs.IGV = h.ref(f, 6);
  f++;
  h.v(f, 2, r.proyecto.meta.modo === 'publico' ? 'VALOR REFERENCIAL' : 'PRESUPUESTO TOTAL', { negrita: true, h: 'right' });
  h.fx(f, 6, `=F${fSub}+F${fIgv}`, pie.total, { fmt: F_MONEDA, negrita: true, fondo: GRIS });
  h.fila(f, 1, 6, { borde: 'arriba' });
  ctx.refs.TOTAL = h.ref(f, 6);
  ctx.refs.PPTO_FILAS = `${ini}:${fin}`;
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, false);
}

/** La celda de GG del pie apunta a la hoja de gastos generales (se escribe al final). */
function completarGGPresupuesto(ctx: Ctx, h: Hoja) {
  const f = Number(ctx.refs.GG_FILA);
  h.link(f, 6, `=${ctx.refs.GG}`, ctx.r.pie.gg, { fmt: F_MONEDA });
}

// ------------------------------------------------------------ Resumen y resumen de costos

function hojaResumen(ctx: Ctx, h: Hoja, filaPptoDe: Map<string, number>) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  h.anchos([14, 60, 16, 10]);
  let f = membrete(h, ctx, 'Resumen de presupuesto', 4);
  const filaCab = f;
  h.cabecera(f++, ['Ítem', 'Descripción', `Parcial (${mon})`, '% del CD']);
  for (const fp of r.filas) {
    if (!fp.esTitulo || fp.nivel > 2) continue;
    const fi = filaPptoDe.get(fp.partida.id)!;
    h.v(f, 1, fp.partida.codigo, { negrita: fp.nivel === 1, borde: 'hair' });
    h.v(f, 2, fp.partida.descripcion, { negrita: fp.nivel === 1, sangria: fp.nivel - 1, borde: 'hair' });
    h.link(f, 3, `='Presupuesto'!$F$${fi}`, fp.parcial, { fmt: F_MONEDA, negrita: fp.nivel === 1, borde: 'hair' });
    h.fx(f, 4, `=IF(${ctx.refs.CD}>0,C${f}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? fp.parcial / r.pie.costoDirecto : 0, { fmt: F_PCT, borde: 'hair' });
    f++;
  }
  f++;
  const pie: [string, string, number, boolean][] = [
    ['COSTO DIRECTO', ctx.refs.CD, r.pie.costoDirecto, true],
    ['Gastos generales', ctx.refs.GG, r.pie.gg, false],
    ['Utilidad', ctx.refs.UTIL, r.pie.utilidad, false],
    ['SUBTOTAL', ctx.refs.SUB, r.pie.subtotal, true],
    ['IGV', ctx.refs.IGV, r.pie.igv, false],
    [r.proyecto.meta.modo === 'publico' ? 'VALOR REFERENCIAL' : 'PRESUPUESTO TOTAL', ctx.refs.TOTAL, r.pie.total, true],
  ];
  for (const [n, ref, val, neg] of pie) {
    h.v(f, 2, n, { negrita: neg, h: 'right' });
    h.link(f, 3, `=${ref}`, val, { fmt: F_MONEDA, negrita: neg });
    h.fx(f, 4, `=IF(${ctx.refs.CD}>0,C${f}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? val / r.pie.costoDirecto : 0, { fmt: F_PCT });
    if (neg) h.fila(f, 1, 4, { borde: 'arriba' });
    f++;
  }
  // resumen de costos por tipo de insumo
  f += 2;
  h.v(f++, 1, 'RESUMEN DE COSTOS POR TIPO DE INSUMO', { negrita: true, color: AZUL });
  h.cabecera(f++, ['Tipo', 'Descripción', `Monto (${mon})`, '% del CD']);
  const ini = f;
  for (const { t, n } of TIPOS) {
    const ref = ctx.totalesGrupoInsumo[t];
    if (!ref) continue;
    h.v(f, 1, t, { borde: 'hair' });
    h.v(f, 2, n.charAt(0) + n.slice(1).toLowerCase(), { borde: 'hair' });
    h.link(f, 3, `=${ref}`, r.insumos.porTipo[t], { fmt: F_MONEDA, borde: 'hair' });
    h.fx(f, 4, `=IF(${ctx.refs.CD}>0,C${f}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? r.insumos.porTipo[t] / r.pie.costoDirecto : 0, { fmt: F_PCT, borde: 'hair' });
    f++;
  }
  h.v(f, 2, 'Diferencia por redondeo', { cursiva: true, borde: 'hair' });
  h.fx(f, 3, `=${ctx.refs.CD}-SUM(C${ini}:C${f - 1})`, r.insumos.diferenciaRedondeo, { fmt: F_MONEDA, cursiva: true, borde: 'hair' });
  f++;
  h.v(f, 2, 'COSTO DIRECTO', { negrita: true });
  h.fx(f, 3, `=SUM(C${ini}:C${f - 1})`, r.pie.costoDirecto, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 4, { borde: 'arriba' });
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, false);
}

// ------------------------------------------------------------ Gastos generales

function hojaGG(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  h.anchos([10, 50, 8, 9, 10, 10, 13, 14, 14]);
  let f = membrete(h, ctx, 'Desagregado de gastos generales', 9, [['Plazo de ejecución (meses)', ctx.datos.plazoMeses, r.programa.plazoMeses]]);
  const calc = new Map(r.gg.items.map((i) => [i.id, i]));
  const totales: Record<string, string> = {};
  const secciones: { g: 'variable' | 'fijo' | 'financiero'; n: string; total: number }[] = [
    { g: 'variable', n: 'A. GASTOS GENERALES VARIABLES', total: r.gg.variables },
    { g: 'fijo', n: 'B. GASTOS GENERALES FIJOS', total: r.gg.fijos },
    { g: 'financiero', n: 'C. GASTOS FINANCIEROS', total: r.gg.financieros },
  ];
  let filaCab1 = 0;
  for (const s of secciones) {
    const items = r.proyecto.gg.filter((g) => (g.grupo ?? 'variable') === s.g);
    if (!items.length && s.g === 'financiero') continue;
    h.v(f++, 1, s.n, { negrita: true, color: AZUL });
    if (!filaCab1) filaCab1 = f;
    h.cabecera(f++, ['Ítem', 'Descripción', 'Und.', 'Inc. (%)', 'Cantidad', s.g === 'variable' ? 'Meses' : 'Veces', `PU (${mon})`, `Parcial (${mon})`, `Total (${mon})`]);
    const rubros = [...new Set(items.map((g) => g.rubro || 'Varios'))];
    const filasRubro: number[] = [];
    rubros.forEach((rb, ir) => {
      const fR = f++;
      filasRubro.push(fR);
      h.v(fR, 1, String(ir + 1).padStart(2, '0'), { negrita: true });
      h.v(fR, 2, rb.toUpperCase(), { negrita: true });
      h.fila(fR, 1, 9, { fondo: GRIS2 });
      const ini = f;
      items.filter((g) => (g.rubro || 'Varios') === rb).forEach((g, ii) => {
        const c = calc.get(g.id)!;
        const pctCD = (g.unidad || '').toLowerCase() === '%cd';
        h.v(f, 1, `${String(ir + 1).padStart(2, '0')}.${String(ii + 1).padStart(2, '0')}`, { borde: 'hair' });
        h.v(f, 2, g.descripcion, { borde: 'hair', ajustar: true });
        h.v(f, 3, pctCD ? '%CD' : g.unidad, { h: 'center', borde: 'hair' });
        h.dato(f, 4, num(g.participacion, 100) / 100, { fmt: '0.00%', borde: 'hair' });
        if (pctCD) {
          h.dato(f, 5, num(g.cantidad) / 100, { fmt: '0.0000%', borde: 'hair' });
          h.v(f, 6, 1, { fmt: '0.00', borde: 'hair' });
          h.link(f, 7, `=${ctx.refs.CD}`, r.pie.costoDirecto, { fmt: F_MONEDA, borde: 'hair' });
        } else {
          h.dato(f, 5, num(g.cantidad), { fmt: '#,##0.00', borde: 'hair' });
          if (g.grupo === 'variable' && g.ligadoAlPlazo) h.link(f, 6, '=PLAZO_MESES', c.duracionUsada, { fmt: '0.00', borde: 'hair' });
          else h.dato(f, 6, num(g.duracion, 1), { fmt: '0.00', borde: 'hair' });
          h.dato(f, 7, num(g.precio), { fmt: F_MONEDA, borde: 'hair' });
        }
        h.fx(f, 8, `=ROUND(D${f}*E${f}*F${f}*G${f},2)`, c.total, { fmt: F_MONEDA, borde: 'hair' });
        f++;
      });
      const tot = items.filter((g) => (g.rubro || 'Varios') === rb).reduce((a, g) => a + (calc.get(g.id)?.total ?? 0), 0);
      h.fx(fR, 9, f > ini ? `=SUM(H${ini}:H${f - 1})` : '=0', redondear(tot, 2), { fmt: F_MONEDA, negrita: true, fondo: GRIS2 });
    });
    h.v(f, 2, `TOTAL ${s.n.slice(3)}`, { negrita: true, h: 'right' });
    h.fx(f, 9, filasRubro.length ? `=${filasRubro.map((x) => `I${x}`).join('+')}` : '=0', s.total, { fmt: F_MONEDA, negrita: true });
    h.fila(f, 1, 9, { borde: 'arriba' });
    totales[s.g] = `I${f}`;
    f++;
    h.v(f, 2, `Porcentaje del costo directo`, { cursiva: true, h: 'right', tam: 7.5 });
    h.fx(f, 9, `=IF(${ctx.refs.CD}>0,I${f - 1}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? s.total / r.pie.costoDirecto : 0, { fmt: F_PCT, cursiva: true, tam: 7.5 });
    f += 2;
  }
  // resumen
  h.v(f++, 1, 'RESUMEN DE GASTOS GENERALES', { negrita: true, color: AZUL });
  h.cabecera(f++, ['', 'Concepto', '', '', '', '', '', `Monto (${mon})`, '% del CD']);
  const ini = f;
  for (const s of secciones) {
    if (!totales[s.g]) continue;
    h.v(f, 2, s.n.slice(3), { borde: 'hair' });
    h.fx(f, 8, `=${totales[s.g]}`, s.total, { fmt: F_MONEDA, borde: 'hair' });
    h.fx(f, 9, `=IF(${ctx.refs.CD}>0,H${f}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? s.total / r.pie.costoDirecto : 0, { fmt: F_PCT, borde: 'hair' });
    f++;
  }
  h.v(f, 2, 'TOTAL GASTOS GENERALES', { negrita: true });
  h.fx(f, 8, `=SUM(H${ini}:H${f - 1})`, r.gg.total, { fmt: F_MONEDA, negrita: true, fondo: GRIS });
  h.fx(f, 9, `=IF(${ctx.refs.CD}>0,H${f}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? r.gg.total / r.pie.costoDirecto : 0, { fmt: F_PCT, negrita: true });
  h.fila(f, 1, 9, { borde: 'arriba' });
  ctx.refs.GG = h.ref(f, 8);
  if (filaCab1) h.ws.views = [{ state: 'frozen', ySplit: 0 }];
  configurarImpresion(h, ctx, 0, false);
  h.ws.pageSetup.printTitlesRow = undefined;
}

// ------------------------------------------------------------ Fórmula polinómica

function hojaPolinomica(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const pol = r.polinomica;
  const mon = r.proyecto.meta.moneda;
  h.anchos([10, 54, 16, 13, 40]);
  let f = membrete(h, ctx, 'Fórmula polinómica', 5, [['Área geográfica', ctx.datos.area, `${r.proyecto.meta.areaGeografica} – ${AREAS_GEOGRAFICAS[r.proyecto.meta.areaGeografica] ?? ''}`]]);
  // base
  const fBase = f;
  h.v(f, 2, 'Base de cálculo: costo directo + gastos generales + utilidad', { negrita: true });
  h.fx(f, 3, `=${ctx.refs.CD}+${ctx.refs.GG}+${ctx.refs.UTIL}`, pol.base, { fmt: F_MONEDA, negrita: true });
  f++;
  const fFactor = f;
  h.v(f, 2, 'Factor de ajuste de insumos al costo directo (CD / total de insumos)', { cursiva: true, tam: 7.5 });
  h.fx(f, 3, `=IF(${ctx.refs.INS_TOTAL}>0,${ctx.refs.CD}/${ctx.refs.INS_TOTAL},0)`, r.insumos.total ? r.pie.costoDirecto / r.insumos.total : 0, { fmt: '0.000000', cursiva: true, tam: 7.5 });
  f += 2;
  h.v(f++, 1, 'INCIDENCIA DE CADA ÍNDICE UNIFICADO', { negrita: true, color: AZUL });
  h.cabecera(f++, ['IU', 'Descripción', `Monto (${mon})`, 'Incidencia', '']);
  const filaIU = new Map<string, number>();
  const insIU = `'Insumos'!$E$1:$E$20000`;
  const insParc = `'Insumos'!$J$1:$J$20000`;
  for (const inc of pol.incidencias) {
    h.v(f, 1, inc.iu, { h: 'center', borde: 'hair' });
    h.v(f, 2, inc.nombre, { borde: 'hair' });
    h.fx(f, 3, `=ROUND(SUMIF(${insIU},"${inc.iu}",${insParc})*$C$${fFactor},2)`, inc.monto, { fmt: F_MONEDA, borde: 'hair' });
    h.fx(f, 4, `=IF($C$${fBase}>0,C${f}/$C$${fBase},0)`, inc.incidencia, { fmt: '0.0000', borde: 'hair' });
    filaIU.set(inc.iu, f);
    f++;
  }
  const fGU = f;
  h.v(f, 1, '39', { h: 'center', borde: 'hair' });
  h.v(f, 2, 'Gastos generales y utilidad', { borde: 'hair' });
  h.fx(f, 3, `=${ctx.refs.GG}+${ctx.refs.UTIL}`, r.pie.gg + r.pie.utilidad, { fmt: F_MONEDA, borde: 'hair' });
  h.fx(f, 4, `=IF($C$${fBase}>0,C${f}/$C$${fBase},0)`, pol.base ? (r.pie.gg + r.pie.utilidad) / pol.base : 0, { fmt: '0.0000', borde: 'hair' });
  f += 2;
  h.v(f++, 1, 'MONOMIOS (D.S. 011-79-VC: máximo 8, coeficiente mínimo 0.050, hasta 3 índices por monomio)', { negrita: true, color: AZUL });
  h.cabecera(f++, ['Símbolo', 'Índices agrupados', 'Coeficiente', 'Verificación', 'Índices representativos (peso)']);
  const ini = f;
  const filasCoef: number[] = [];
  pol.monomios.forEach((m, i) => {
    const miembros = m.miembros.map((x) => x.iu);
    const sumas = miembros.filter((iu) => iu !== '39').map((iu) => (filaIU.has(iu) ? `D${filaIU.get(iu)}` : '0'));
    if (miembros.includes('39')) {
      sumas.push(`D${fGU}`);
      if (filaIU.has('39')) sumas.push(`D${filaIU.get('39')}`);
    }
    h.v(f, 1, m.simbolo, { negrita: true, h: 'center', borde: 'hair' });
    h.v(f, 2, miembros.map((iu) => `${iu}`).join(', '), { borde: 'hair' });
    filasCoef.push(f);
    // F (oculta) = coeficiente sin redondear; C = redondeado al milésimo y el resto se asigna al mayor
    h.fx(f, 6, `=${sumas.join('+') || 0}`, m.coeficiente, { fmt: '0.000000' });
    h.fx(f, 4, `=IF(C${f}>=0.05,"Conforme","Menor a 0.050")`, m.coeficiente >= 0.05 ? 'Conforme' : 'Menor a 0.050', { borde: 'hair', h: 'center' });
    h.v(f, 5, m.indices.map((x) => `${x.iu} ${x.nombre} (${x.peso.toFixed(3)})`).join('; '), { borde: 'hair', ajustar: true, tam: 7.5 });
    f++;
  });
  if (filasCoef.length) {
    const fA = filasCoef[0], fZ = filasCoef[filasCoef.length - 1];
    const crudo = `$F$${fA}:$F$${fZ}`;
    filasCoef.forEach((fc, k) =>
      h.fx(fc, 3, `=ROUND(F${fc},3)+IF(MATCH(MAX(${crudo}),${crudo},0)=${k + 1},1-SUMPRODUCT(ROUND(${crudo},3)),0)`, pol.monomios[k].coeficiente, { fmt: '0.000', borde: 'hair' }),
    );
    // G (oculta) = clave de orden: coeficiente con desempate por posición, para escribir la fórmula de mayor a menor
    filasCoef.forEach((fc, k) => h.fx(fc, 7, `=C${fc}-${k + 1}/10000000`, pol.monomios[k].coeficiente - (k + 1) / 1e7, { fmt: '0.000000' }));
    h.ws.getColumn(6).hidden = true;
    h.ws.getColumn(7).hidden = true;
  }
  h.v(f, 2, 'Suma de coeficientes', { negrita: true, h: 'right' });
  h.fx(f, 3, `=SUM(C${ini}:C${f - 1})`, pol.suma, { fmt: '0.000', negrita: true });
  h.fila(f, 1, 5, { borde: 'arriba' });
  ctx.refs.POL_SUMA = h.ref(f, 3);
  ctx.refs.POL_MIN = `MIN('${h.nombre}'!$C$${ini}:$C$${f - 1})`;
  ctx.refs.POL_N = `COUNT('${h.nombre}'!$C$${ini}:$C$${f - 1})`;
  f += 2;
  h.v(f, 1, 'Fórmula', { negrita: true });
  const orden = filasCoef.length ? `$G$${filasCoef[0]}:$G$${filasCoef[filasCoef.length - 1]}` : '';
  const enPos = (k: number, col: string) => `INDEX($${col}$${filasCoef[0]}:$${col}$${filasCoef[filasCoef.length - 1]},MATCH(LARGE(${orden},${k}),${orden},0))`;
  const partes = pol.monomios.map((_, k) => `FIXED(${enPos(k + 1, 'C')},3)&" ("&${enPos(k + 1, 'A')}&"r/"&${enPos(k + 1, 'A')}&"o)"`);
  h.ws.mergeCells(f, 2, f, 5);
  h.fx(f, 2, `="K = "&${partes.join('&" + "&') || '""'}`, pol.formula, { negrita: true, tam: 10, color: AZUL });
  configurarImpresion(h, ctx, 0, false);
  h.ws.pageSetup.printTitlesRow = undefined;
}

// ------------------------------------------------------------ Programa y Gantt

function hojaPrograma(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const prog = r.programa;
  const acts = new Map(prog.actividades.map((a) => [a.partidaId, a]));
  const cod = new Map(r.proyecto.partidas.map((x) => [x.id, x.codigo]));
  const diario = prog.plazoDias <= 120;
  const paso = diario ? 1 : 7;
  // margen de 25 % para que el Gantt siga mostrando las barras si el plazo crece al editar el libro
  const nCols = Math.max(1, Math.ceil((Math.max(1, prog.plazoDias) * 1.25) / paso));
  const C0 = 14; // primera columna del Gantt
  // con un ciclo en las precedencias el cálculo en fórmulas sería circular: se dejan las fechas del motor
  const estatico = prog.errores.some((e) => /ciclo/i.test(e));
  h.anchos([12, 42, 6, 11, 10, 8, 9, 8, 11, 11, 7, 7, 18]);
  for (let i = 0; i < nCols; i++) h.ws.getColumn(C0 + i).width = diario ? 3.2 : 4.2;
  let f = membrete(h, ctx, 'Cronograma de ejecución de obra', 13, [['Plazo (días calendario)', ctx.datos.plazoDias, prog.plazoDias]]);
  const filaFechas = f;
  for (let i = 0; i < nCols; i++) {
    const d = isoAFecha(sumarDias(prog.inicio, i * paso));
    if (estatico) h.v(filaFechas, C0 + i, d, { fmt: diario ? 'dd' : 'dd/mm', tam: 6.5, h: 'center', fondo: GRIS });
    else h.fx(filaFechas, C0 + i, `=FECHA_INICIO+${i * paso}`, d, { fmt: diario ? 'dd' : 'dd/mm', tam: 6.5, h: 'center', fondo: GRIS });
  }
  h.ws.getRow(filaFechas).height = 14;
  f++;
  const filaCab = f;
  h.cabecera(f++, ['Ítem', 'Actividad', 'Und', 'Metrado', 'Rend./día', 'Cuadrillas', 'Duración fija', 'Duración (d)', 'Inicio', 'Fin', 'Holgura', 'Crítica', 'Predecesoras']);
  for (let i = 0; i < nCols; i++) {
    const e = { tam: 6, h: 'center' as const, fondo: AZUL, color: 'FFFFFFFF' };
    if (diario && !estatico) h.fx(filaCab, C0 + i, `=DAY(${COL(C0 + i)}${filaFechas})`, isoAFecha(sumarDias(prog.inicio, i)).getUTCDate(), e);
    else h.v(filaCab, C0 + i, diario ? isoAFecha(sumarDias(prog.inicio, i)).getUTCDate() : `S${i + 1}`, e);
  }
  // columnas auxiliares (ocultas) del cálculo de ruta crítica, en días laborables desde el inicio
  const cES = C0 + nCols, cEF = cES + 1, cLS = cES + 2, cLF = cES + 3;
  const [ES, EF, LS, LF] = [cES, cEF, cLS, cLF].map(COL);
  ['Inicio temprano (día lab.)', 'Fin temprano', 'Inicio tardío', 'Fin tardío'].forEach((t, i) => {
    h.v(filaCab, cES + i, t, { tam: 6 });
    h.ws.getColumn(cES + i).hidden = true;
  });
  const ini = f;
  const filaDe = new Map<string, number>();
  r.filas.forEach((fp) => filaDe.set(fp.partida.id, f++));
  const fin = f - 1;
  const FIN = `$${EF}$${fin + 1}`;
  const esPartida = new Set(r.hojas.map((x) => x.partida.id));
  // predecesoras y sucesoras entre partidas (no títulos)
  const preds = new Map<string, { id: string; tipo: string; lag: number }[]>();
  const sucs = new Map<string, { id: string; tipo: string; lag: number }[]>();
  for (const fp of r.hojas) {
    const lista = (r.proyecto.programa[fp.partida.id]?.predecesoras ?? []).filter((x) => esPartida.has(x.id) && x.id !== fp.partida.id).map((x) => ({ id: x.id, tipo: x.tipo, lag: num(x.desfase) }));
    preds.set(fp.partida.id, lista);
    for (const x of lista) (sucs.get(x.id) ?? sucs.set(x.id, []).get(x.id)!).push({ id: fp.partida.id, tipo: x.tipo, lag: x.lag });
  }
  const mas = (n: number) => (n ? (n > 0 ? `+${n}` : `${n}`) : '');
  r.filas.forEach((fp, idx) => {
    const fi = filaDe.get(fp.partida.id)!;
    const pt = fp.partida;
    h.v(fi, 1, pt.codigo, { negrita: fp.esTitulo, borde: 'hair' });
    h.v(fi, 2, pt.descripcion, { negrita: fp.esTitulo, sangria: Math.min(4, fp.nivel - 1), borde: 'hair' });
    const a = acts.get(pt.id);
    if (fp.esTitulo) {
      const ult = filaDe.get(r.filas[filaUltimoDescendiente(r, idx)].partida.id)!;
      if (ult > fi) {
        const desc = r.filas.slice(idx + 1, filaUltimoDescendiente(r, idx) + 1).map((x) => acts.get(x.partida.id)).filter(Boolean);
        const iniT = desc.length ? desc.reduce((m, x) => (x!.inicio < m ? x!.inicio : m), desc[0]!.inicio) : '';
        const finT = desc.length ? desc.reduce((m, x) => (x!.fin > m ? x!.fin : m), desc[0]!.fin) : '';
        h.fx(fi, 9, `=IF(COUNT(I${fi + 1}:I${ult})=0,"",MIN(I${fi + 1}:I${ult}))`, iniT ? isoAFecha(iniT) : '', { fmt: F_FECHA, negrita: true, borde: 'hair' });
        h.fx(fi, 10, `=IF(COUNT(J${fi + 1}:J${ult})=0,"",MAX(J${fi + 1}:J${ult}))`, finT ? isoAFecha(finT) : '', { fmt: F_FECHA, negrita: true, borde: 'hair' });
      }
      h.v(fi, 12, 'T', { tam: 6, color: 'FFB0B8BF', h: 'center' });
      h.fila(fi, 1, 13, { fondo: fp.nivel === 1 ? GRIS : GRIS2 });
      return;
    }
    const cfg = r.proyecto.programa[pt.id] ?? { predecesoras: [] };
    h.v(fi, 3, pt.unidad, { h: 'center', borde: 'hair' });
    const pp = ctx.ppto.get(pt.id);
    h.link(fi, 4, pp ? `=${pp.met}` : '=0', fp.metrado, { fmt: F_MET, borde: 'hair' });
    h.link(fi, 5, ctx.apuRend.has(pt.id) ? `=${ctx.apuRend.get(pt.id)}` : '=0', r.apus[pt.id]?.rendimiento ?? 0, { fmt: '#,##0.00', borde: 'hair' });
    h.dato(fi, 6, num(cfg.cuadrillas, 1), { fmt: '0', borde: 'hair' });
    h.dato(fi, 7, cfg.duracionManual ? num(cfg.duracionManual) : null, { fmt: '0', borde: 'hair' });
    h.fx(fi, 8, `=IF(D${fi}=0,0,IF(G${fi}>0,ROUNDUP(G${fi},0),IF(E${fi}*MAX(1,F${fi})>0,MAX(1,ROUNDUP(D${fi}/(E${fi}*MAX(1,F${fi}))-1E-9,0)),1)))`, a ? a.duracion : 0, { fmt: '0', borde: 'hair' });
    h.v(fi, 13, (cfg.predecesoras ?? []).filter((x) => esPartida.has(x.id)).map((x) => `${cod.get(x.id) ?? '?'}${x.tipo}${x.desfase ? (x.desfase > 0 ? '+' : '') + x.desfase : ''}`).join('; '), { borde: 'hair', tam: 7 });
    if (estatico) {
      if (a) {
        h.dato(fi, 9, isoAFecha(a.inicio), { fmt: F_FECHA, borde: 'hair' });
        h.dato(fi, 10, isoAFecha(a.fin), { fmt: F_FECHA, borde: 'hair' });
        h.v(fi, 11, a.holgura, { fmt: '0', borde: 'hair', h: 'center' });
        h.v(fi, 12, a.critica ? 'Sí' : 'No', { borde: 'hair', h: 'center' });
      } else h.v(fi, 12, '', { borde: 'hair' });
      return;
    }
    // pasada hacia adelante: inicio temprano según el tipo de relación (FC, CC, FF) y el desfase
    const tES = (preds.get(pt.id) ?? []).map((x) => {
      const rb = filaDe.get(x.id)!;
      const e = x.tipo === 'CC' ? `${ES}${rb}${mas(x.lag)}` : x.tipo === 'FF' ? `${EF}${rb}${mas(x.lag)}-H${fi}` : `${EF}${rb}${mas(x.lag)}`;
      return `IF(H${rb}=0,0,${e})`;
    });
    const finLab = prog.diasLaborables;
    h.fx(fi, cES, tES.length ? `=IF(H${fi}=0,0,MAX(0,${tES.join(',')}))` : '=0', a?.es ?? 0, { fmt: '0' });
    h.fx(fi, cEF, `=${ES}${fi}+H${fi}`, a?.ef ?? 0, { fmt: '0' });
    // pasada hacia atrás desde las sucesoras
    const tLF = (sucs.get(pt.id) ?? []).map((x) => {
      const rs = filaDe.get(x.id)!;
      const e = x.tipo === 'CC' ? `${LS}${rs}${mas(-x.lag)}+H${fi}` : x.tipo === 'FF' ? `${LF}${rs}${mas(-x.lag)}` : `${LS}${rs}${mas(-x.lag)}`;
      return `IF(H${rs}=0,${FIN},${e})`;
    });
    h.fx(fi, cLF, tLF.length ? `=MIN(${FIN},${tLF.join(',')})` : `=${FIN}`, a?.lf ?? finLab, { fmt: '0' });
    h.fx(fi, cLS, `=${LF}${fi}-H${fi}`, a?.ls ?? finLab, { fmt: '0' });
    h.fx(fi, 9, `=IF(H${fi}=0,"",${WDL(`${ES}${fi}+1`)})`, a ? isoAFecha(a.inicio) : '', { fmt: F_FECHA, borde: 'hair' });
    h.fx(fi, 10, `=IF(H${fi}=0,"",${WDL(`${EF}${fi}`)})`, a ? isoAFecha(a.fin) : '', { fmt: F_FECHA, borde: 'hair' });
    h.fx(fi, 11, `=IF(H${fi}=0,"",${LS}${fi}-${ES}${fi})`, a ? a.holgura : '', { fmt: '0', borde: 'hair', h: 'center' });
    h.fx(fi, 12, `=IF(H${fi}=0,"",IF(K${fi}<=0,"Sí","No"))`, a ? (a.critica ? 'Sí' : 'No') : '', { borde: 'hair', h: 'center' });
  });
  ctx.prog = { fila: filaDe, finLab: `'${CRON}'!${FIN}` };
  if (!estatico) {
    h.fx(fin + 1, cEF, `=MAX(${EF}${ini}:${EF}${fin})`, prog.diasLaborables, { fmt: '0' });
    // el plazo del libro sale de aquí: Datos › PLAZO_DIAS → PLAZO_MESES → gastos generales variables
    if (ctx.hDatos && ctx.filaPlazo)
      ctx.hDatos.fx(ctx.filaPlazo, 2, `=IF(${ctx.prog.finLab}=0,0,${WDL(ctx.prog.finLab)}-FECHA_INICIO+1)`, prog.plazoDias, { fmt: '0', borde: 'hair', h: 'left' });
  }
  // Gantt con formato condicional: las barras siguen a las fechas de inicio y fin
  const c1 = COL(C0);
  const c2 = COL(C0 + nCols - 1);
  const ref = `${c1}${ini}:${c2}${fin}`;
  const cond = diario ? `AND(${c1}$${filaFechas}>=$I${ini},${c1}$${filaFechas}<=$J${ini})` : `AND(${c1}$${filaFechas}<=$J${ini},${c1}$${filaFechas}+6>=$I${ini})`;
  h.ws.addConditionalFormatting({
    ref,
    rules: [
      { type: 'expression', priority: 1, formulae: [`AND(ISNUMBER($I${ini}),$L${ini}="T",${cond})`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF5B6B7C' } } } },
      { type: 'expression', priority: 2, formulae: [`AND(ISNUMBER($I${ini}),$L${ini}="Sí",${cond})`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC0392B' } } } },
      { type: 'expression', priority: 3, formulae: [`AND(ISNUMBER($I${ini}),${cond})`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF2E6DA4' } } } },
    ],
  });
  for (let fi = ini; fi <= fin; fi++) for (let i = 0; i < nCols; i++) h.celda(fi, C0 + i).border = { left: BORDE_HAIR, bottom: BORDE_HAIR };
  f = fin + 2;
  h.v(f, 2, `Barras: azul = actividad, rojo = ruta crítica, gris = título. Columnas ${diario ? 'diarias' : 'semanales'} desde la fecha de inicio, con un margen de 25 % sobre el plazo.`, { cursiva: true, tam: 7.5 });
  h.ws.views = [{ state: 'frozen', ySplit: filaCab, xSplit: 2 }];
  configurarImpresion(h, ctx, filaCab, true);
}

// ------------------------------------------------------------ Distribución, valorizado y calendarios

interface Bloque {
  titulo: string;
  filas: { clave: string; codigo: string; descripcion: string; unidad: string; fracciones: number[] }[];
  periodos: string[];
  /** Fórmula de la fracción del periodo i (si falta, la fracción es un dato fijo). */
  formula?: (f: number, i: number, clave: string) => string;
}

/** Ubica la tabla de periodos en la hoja Distribución % (se usa antes de escribir esa hoja). */
function planPeriodos(ctx: Ctx) {
  const P = ctx.r.programa.periodos.length;
  const fila = finMembrete(ctx) + 2;
  const c = (i: number, k: number) => `'Distribución %'!$${COL(4 + i)}$${fila + k}`;
  const idx = [...Array(P).keys()];
  ctx.per = { fila, ini: idx.map((i) => c(i, 2)), fin: idx.map((i) => c(i, 3)), finCalc: idx.map((i) => (i === P - 1 ? 'DATE(2200,12,31)' : c(i, 3))) };
}

/** Columnas auxiliares del APU: cantidad de cada recurso en cada periodo (J = previo, K… = periodos). */
function apuPeriodos(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const per = ctx.per!;
  const P = per.ini.length;
  const pers = r.programa.periodos;
  const acts = new Map(r.programa.actividades.map((a) => [a.partidaId, a]));
  const def = r.proyecto.meta.plazoCompraDefecto;
  const plazo = new Map(r.proyecto.insumos.map((i) => [i.codigo, num(i.plazoCompraDias ?? def, def)]));
  h.ws.getCell(5, 10).value = 'Aux: cantidad por periodo (previo, periodo 1, 2 …) según el cronograma';
  for (let c = 10; c <= 10 + P; c++) h.ws.getColumn(c).hidden = true;
  for (const x of ctx.apuFilas) {
    const rp = ctx.prog?.fila.get(x.partidaId);
    if (!rp) continue;
    const H = cron('H', rp), I = cron('I', rp), J = cron('J', rp);
    const a = acts.get(x.partidaId);
    const mat = x.tipo === 'MAT';
    const fi = ctx.insumoFila.get(x.codigo);
    const ant = mat && fi ? `'Insumos'!$K$${fi}` : '0';
    const antV = mat ? plazo.get(x.codigo) ?? def : 0;
    const sh = (ref: string) => (mat ? `${ref}+${ant}` : ref);
    const q = (dias: number) => (a && a.duracion ? (x.total * dias) / a.duracion : 0);
    h.fx(x.fila, 10, `=IF(${H}=0,0,$H${x.fila}*${DIAS(I, J, '1', `FECHA_INICIO+${ant}-1`)}/${H})`, q(diasEnVentana(r, a, antV, null, pers[0] ? sumarDias(pers[0].inicio, -1) : null)), { fmt: F_CANT });
    for (let i = 0; i < P; i++)
      h.fx(x.fila, 11 + i, `=IF(${H}=0,0,$H${x.fila}*${DIAS(I, J, sh(per.ini[i]), sh(per.finCalc[i]))}/${H})`, q(diasEnVentana(r, a, antV, pers[i].inicio, i === P - 1 ? null : pers[i].fin)), { fmt: F_CANT });
  }
}

/** Anticipación de compra de cada material (columna K oculta de Insumos), usada por el calendario de adquisiciones. */
function insumosAnticipacion(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const def = r.proyecto.meta.plazoCompraDefecto;
  h.ws.getCell(5, 11).value = 'Aux: anticipación de compra (días)';
  h.ws.getColumn(11).hidden = true;
  for (const [codigo, fi] of ctx.insumoFila) {
    const ins = r.proyecto.insumos.find((i) => i.codigo === codigo);
    if (ins?.tipo === 'MAT') h.dato(fi, 11, num(ins.plazoCompraDias ?? def, def), { fmt: '0' });
  }
}

function hojaDistribucion(ctx: Ctx, h: Hoja, bloques: Bloque[]): Map<string, Map<string, number>> {
  // devuelve, por bloque, la fila de cada clave
  const out = new Map<string, Map<string, number>>();
  const maxP = Math.max(1, ...bloques.map((b) => b.periodos.length));
  h.anchos([12, 46, 7, ...new Array(maxP).fill(10), 10]);
  let f = membrete(h, ctx, 'Distribución programada por periodo (%)', 3 + maxP);
  h.ws.mergeCells(f, 1, f, 3 + maxP);
  h.v(f++, 1, 'Porcentaje de cada partida o insumo que se ejecuta o compra en cada periodo. Se calcula con fórmulas desde las fechas del cronograma (días laborables de cada actividad dentro del periodo); cada fila suma 100 %.', { cursiva: true, tam: 7.5, ajustar: true });
  f++;
  const per = ctx.per;
  if (per && f === per.fila) {
    const pers = ctx.r.programa.periodos;
    const porMes = ctx.r.proyecto.meta.periodo === 'mes';
    h.v(f++, 1, 'PERIODOS DE LOS CRONOGRAMAS', { negrita: true, color: AZUL });
    h.cabecera(f++, ['N.º', 'Periodo', '', ...pers.map((x) => x.etiqueta)]);
    h.v(f, 2, 'Inicio', { borde: 'hair' });
    h.v(f + 1, 2, 'Fin', { borde: 'hair' });
    h.v(f + 2, 2, 'Días laborables', { borde: 'hair' });
    pers.forEach((x, i) => {
      const c = COL(4 + i);
      h.fx(f, 4 + i, porMes ? (i === 0 ? '=FECHA_INICIO' : `=EOMONTH(FECHA_INICIO,${i - 1})+1`) : `=FECHA_INICIO+${30 * i}`, isoAFecha(x.inicio), { fmt: F_FECHA, borde: 'hair' });
      h.fx(f + 1, 4 + i, porMes ? `=EOMONTH(FECHA_INICIO,${i})` : `=${c}${f}+29`, isoAFecha(x.fin), { fmt: F_FECHA, borde: 'hair' });
      h.fx(f + 2, 4 + i, `=${NDL(`${c}${f}`, `${c}${f + 1}`)}`, x.diasLaborables, { fmt: '0', borde: 'hair' });
    });
    f += 4;
  }
  for (const b of bloques) {
    const mapa = new Map<string, number>();
    h.v(f++, 1, b.titulo.toUpperCase(), { negrita: true, color: AZUL });
    h.cabecera(f++, ['Código', 'Descripción', 'Und', ...b.periodos, 'Suma']);
    for (const x of b.filas) {
      h.v(f, 1, x.codigo, { borde: 'hair' });
      h.v(f, 2, x.descripcion, { borde: 'hair' });
      h.v(f, 3, x.unidad, { h: 'center', borde: 'hair' });
      x.fracciones.forEach((v, i) => (b.formula ? h.fx(f, 4 + i, b.formula(f, i, x.clave), v, { fmt: '0.00%', borde: 'hair' }) : h.dato(f, 4 + i, v, { fmt: '0.00%', borde: 'hair' })));
      const cU = COL(3 + b.periodos.length);
      h.fx(f, 4 + b.periodos.length, `=SUM(D${f}:${cU}${f})`, x.fracciones.reduce((a, c) => a + c, 0), { fmt: '0.00%', borde: 'hair' });
      mapa.set(x.clave, f);
      f++;
    }
    out.set(b.titulo, mapa);
    f += 2;
  }
  configurarImpresion(h, ctx, 0, true);
  h.ws.pageSetup.printTitlesRow = undefined;
  return out;
}

/** Filas del valorizado: todas las partidas (las de metrado cero quedan en cero hasta que se llene el metrado). */
function filasValorizado(r: Resultados) {
  const P = r.programa.periodos.length;
  const val = new Map(r.valorizado.filas.map((x) => [x.clave, x]));
  return r.hojas.map((fp) => val.get(fp.partida.id) ?? { clave: fp.partida.id, codigo: fp.partida.codigo, descripcion: fp.partida.descripcion, unidad: fp.partida.unidad, total: fp.parcial, valores: new Array(P).fill(0) });
}

function hojaValorizado(ctx: Ctx, h: Hoja, filasDist: Map<string, number>) {
  const { r } = ctx;
  const per = r.programa.periodos;
  const P = per.length;
  const mon = r.proyecto.meta.moneda;
  h.anchos([12, 44, 14, ...new Array(P).fill(13)]);
  let f = membrete(h, ctx, 'Cronograma valorizado de avance de obra', 3 + P);
  const filaCab = f;
  h.cabecera(f++, ['Ítem', 'Descripción', `Parcial (${mon})`, ...per.map((x) => `${x.etiqueta}\n${fechaCorta(x.inicio).slice(0, 5)}–${fechaCorta(x.fin).slice(0, 5)}`)]);
  if (ctx.per)
    per.forEach((x, i) => {
      h.celda(filaCab, 4 + i).value = { formula: `"${x.etiqueta}"&CHAR(10)&TEXT(${ctx.per!.ini[i]},"dd/mm")&"–"&TEXT(${ctx.per!.fin[i]},"dd/mm")`, result: `${x.etiqueta}\n${fechaCorta(x.inicio).slice(0, 5)}–${fechaCorta(x.fin).slice(0, 5)}` };
    });
  const ini = f;
  for (const fila of filasValorizado(r)) {
    const pp = ctx.ppto.get(fila.clave);
    const fd = filasDist.get(fila.clave);
    h.v(f, 1, fila.codigo, { borde: 'hair' });
    h.v(f, 2, fila.descripcion, { borde: 'hair' });
    h.link(f, 3, pp ? `=${pp.parcial}` : '=0', fila.total, { fmt: F_MONEDA, borde: 'hair' });
    const cols = per.map((_, i) => COL(4 + i));
    fila.valores.forEach((v, i) => {
      h.fx(f, 4 + i, fd ? `=${serieCuadrada((c) => `$C${f}*'Distribución %'!${c}${fd}`, `$C${f}`, cols, i)}` : '=0', v, { fmt: F_MONEDA, borde: 'hair' });
    });
    f++;
  }
  const fin = f - 1;
  const v = r.valorizado;
  const filaTot = (n: string, vals: number[], formula: (c: string, i: number) => string, total: string, totalVal: number, e: Estilo = {}) => {
    h.v(f, 2, n, { negrita: e.negrita, h: 'right' });
    h.fx(f, 3, total, totalVal, { fmt: e.fmt ?? F_MONEDA, negrita: e.negrita });
    vals.forEach((x, i) => h.fx(f, 4 + i, formula(COL(4 + i), i), x, { fmt: e.fmt ?? F_MONEDA, negrita: e.negrita }));
    if (e.borde) h.fila(f, 1, 3 + P, { borde: e.borde });
    return f++;
  };
  const fCD = filaTot('COSTO DIRECTO', v.cd, (c) => `=SUM(${c}${ini}:${c}${fin})`, `=SUM(C${ini}:C${fin})`, r.pie.costoDirecto, { negrita: true, borde: 'arriba' });
  const colsP = per.map((_, i) => COL(4 + i));
  const prop = (ref: string) => (c: string, i: number) => `=IF($C$${fCD}>0,${serieCuadrada((x) => `${ref}*${x}${fCD}/$C$${fCD}`, ref, colsP, i)},0)`;
  const fGG = filaTot('Gastos generales', v.gg, prop(ctx.refs.GG), `=${ctx.refs.GG}`, r.pie.gg);
  const fUt = filaTot('Utilidad', v.utilidad, prop(ctx.refs.UTIL), `=${ctx.refs.UTIL}`, r.pie.utilidad);
  const fSub = filaTot('SUBTOTAL', v.subtotal, (c) => `=${c}${fCD}+${c}${fGG}+${c}${fUt}`, `=C${fCD}+C${fGG}+C${fUt}`, r.pie.subtotal, { negrita: true, borde: 'arriba' });
  const fIgv = filaTot('IGV', v.igv, prop(ctx.refs.IGV), `=${ctx.refs.IGV}`, r.pie.igv);
  const fTot = filaTot('TOTAL', v.total, (c) => `=${c}${fSub}+${c}${fIgv}`, `=C${fSub}+C${fIgv}`, r.pie.total, { negrita: true, borde: 'arriba' });
  filaTot('Avance del periodo (%)', v.avancePct.map((x) => x / 100), (c) => `=IF($C$${fCD}>0,${c}${fCD}/$C$${fCD},0)`, `=1`, 1, { fmt: F_PCT });
  filaTot('Avance acumulado (%)', v.acumuladoPct.map((x) => x / 100), (c, i) => `=IF($C$${fCD}>0,SUM($D$${fCD}:${c}${fCD})/$C$${fCD},0)`, `=1`, 1, { fmt: F_PCT });
  filaTot('Monto acumulado', v.acumulado, (c) => `=SUM($D$${fTot}:${c}${fTot})`, `=C${fTot}`, r.pie.total);
  ctx.refs.VAL_TOTAL_FILA = String(fTot);
  ctx.refs.VAL_CD = `SUM('${h.nombre}'!$D$${fCD}:$${COL(3 + P)}$${fCD})`;
  h.ws.views = [{ state: 'frozen', ySplit: filaCab, xSplit: 3 }];
  configurarImpresion(h, ctx, filaCab, true);
}

function hojaCalendario(
  ctx: Ctx,
  h: Hoja,
  titulo: string,
  filas: Resultados['adquisiciones'],
  filasDist: Map<string, number>,
  conPrevio: boolean,
  extra?: (f: number, ini: number, fin: number, P: number) => number,
) {
  const { r } = ctx;
  const per = [...(conPrevio ? ['Previo'] : []), ...r.programa.periodos.map((x) => x.etiqueta)];
  const P = per.length;
  const mon = r.proyecto.meta.moneda;
  h.anchos([12, 40, 7, 12, 11, ...new Array(P).fill(11)]);
  let f = membrete(h, ctx, titulo, 5 + P);
  const filaCab = f;
  h.cabecera(f++, ['Código', 'Descripción', 'Und', 'Cantidad total', `Precio (${mon})`, ...per]);
  const ini = f;
  for (const x of filas) {
    const fi = ctx.insumoFila.get(x.codigo);
    const fd = filasDist.get(x.codigo);
    h.v(f, 1, x.codigo, { borde: 'hair' });
    h.v(f, 2, x.descripcion, { borde: 'hair' });
    h.v(f, 3, x.unidad, { h: 'center', borde: 'hair' });
    h.link(f, 4, fi ? `='Insumos'!$I$${fi}` : '=0', x.total, { fmt: '#,##0.00', borde: 'hair' });
    h.link(f, 5, fi ? `='Insumos'!$F$${fi}` : '=0', r.proyecto.insumos.find((i) => i.codigo === x.codigo)?.precio ?? 0, { fmt: F_MONEDA, borde: 'hair' });
    const idx = x.valores.map((_, i) => String(i));
    x.valores.forEach((v, i) => h.fx(f, 6 + i, fd ? `=${serieCuadrada((k) => `$D${f}*'Distribución %'!${COL(4 + Number(k))}${fd}`, `ROUND($D${f},2)`, idx, i)}` : '=0', v, { fmt: '#,##0.00', borde: 'hair' }));
    f++;
  }
  const fin = f - 1;
  if (extra) f = extra(f, ini, fin, P);
  h.ws.views = [{ state: 'frozen', ySplit: filaCab, xSplit: 2 }];
  configurarImpresion(h, ctx, filaCab, true);
  return { ini, fin, P };
}

function hojaDesembolsos(ctx: Ctx, h: Hoja, hVal: Hoja) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  const fTot = Number(ctx.refs.VAL_TOTAL_FILA);
  h.anchos([14, 18, 16, 16, 18, 18]);
  let f = membrete(h, ctx, 'Cronograma de desembolsos', 6);
  const filaCab = f;
  h.cabecera(f++, ['Periodo', `Valorización (${mon})`, 'Adelantos', 'Amortización', 'Desembolso neto', 'Acumulado']);
  const fAd = f;
  const ad = r.desembolsos.find((d) => d.periodo === 'Adelantos');
  h.v(f, 1, 'Adelantos', { borde: 'hair' });
  h.v(f, 2, 0, { fmt: F_MONEDA, borde: 'hair' });
  h.fx(f, 3, `=ROUND(${ctx.refs.TOTAL}*ADELANTO_DIRECTO,2)+ROUND(${ctx.refs.TOTAL}*ADELANTO_MATERIALES,2)`, ad ? ad.adelantoDirecto + ad.adelantoMateriales : 0, { fmt: F_MONEDA, borde: 'hair' });
  h.v(f, 4, 0, { fmt: F_MONEDA, borde: 'hair' });
  h.fx(f, 5, `=B${f}+C${f}-D${f}`, ad?.neto ?? 0, { fmt: F_MONEDA, borde: 'hair' });
  h.fx(f, 6, `=E${f}`, ad?.acumulado ?? 0, { fmt: F_MONEDA, borde: 'hair' });
  f++;
  const filas = r.desembolsos.filter((d) => d.periodo !== 'Adelantos');
  filas.forEach((d, i) => {
    const col = COL(4 + i);
    h.v(f, 1, d.periodo, { borde: 'hair' });
    h.link(f, 2, `='${hVal.nombre}'!${col}${fTot}`, d.valorizacion, { fmt: F_MONEDA, borde: 'hair' });
    h.v(f, 3, 0, { fmt: F_MONEDA, borde: 'hair' });
    const filasB = filas.map((_, k) => `B${fAd + 1 + k}`);
    h.fx(f, 4, `=IF(${ctx.refs.TOTAL}>0,${serieCuadrada((b) => `$C$${fAd}*${b}/${ctx.refs.TOTAL}`, `$C$${fAd}`, filasB, i)},0)`, d.amortizacion, { fmt: F_MONEDA, borde: 'hair' });
    h.fx(f, 5, `=B${f}+C${f}-D${f}`, d.neto, { fmt: F_MONEDA, borde: 'hair' });
    h.fx(f, 6, `=F${f - 1}+E${f}`, d.acumulado, { fmt: F_MONEDA, borde: 'hair' });
    f++;
  });
  h.v(f, 1, 'TOTAL', { negrita: true });
  h.fx(f, 2, `=SUM(B${fAd}:B${f - 1})`, r.pie.total, { fmt: F_MONEDA, negrita: true });
  h.fx(f, 5, `=SUM(E${fAd}:E${f - 1})`, r.pie.total, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 6, { borde: 'arriba' });
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, false);
}

function hojaFlete(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  h.anchos([12, 46, 7, 13, 12, 12, 14]);
  let f = membrete(h, ctx, 'Cálculo de flete terrestre', 7, [['Tarifa por tonelada', ctx.datos.flete, r.proyecto.meta.fleteTarifaTon]]);
  const filaCab = f;
  h.cabecera(f++, ['Código', 'Material', 'Und', 'Cantidad', 'Peso unit. (kg)', 'Toneladas', `Flete (${mon})`]);
  const ini = f;
  for (const it of r.flete.items) {
    const fi = ctx.insumoFila.get(it.insumo.codigo);
    h.v(f, 1, it.insumo.codigo, { borde: 'hair' });
    h.v(f, 2, it.insumo.descripcion, { borde: 'hair' });
    h.v(f, 3, it.insumo.unidad, { h: 'center', borde: 'hair' });
    h.link(f, 4, fi ? `='Insumos'!$I$${fi}` : '=0', it.cantidad, { fmt: '#,##0.00', borde: 'hair' });
    h.dato(f, 5, it.pesoKg, { fmt: '#,##0.00', borde: 'hair' });
    h.fx(f, 6, `=ROUND(D${f}*E${f}/1000,3)`, it.toneladas, { fmt: '#,##0.000', borde: 'hair' });
    h.fx(f, 7, `=ROUND(D${f}*E${f}/1000*TARIFA_FLETE,2)`, it.flete, { fmt: F_MONEDA, borde: 'hair' });
    f++;
  }
  h.v(f, 2, 'TOTAL', { negrita: true });
  h.fx(f, 6, `=SUM(F${ini}:F${Math.max(ini, f - 1)})`, r.flete.toneladas, { fmt: '#,##0.000', negrita: true });
  h.fx(f, 7, `=SUM(G${ini}:G${Math.max(ini, f - 1)})`, r.flete.total, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 7, { borde: 'arriba' });
  configurarImpresion(h, ctx, filaCab, false);
}

function hojaControles(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  h.anchos([6, 64, 16, 16]);
  let f = membrete(h, ctx, 'Controles de consistencia', 4);
  h.cabecera(f++, ['N°', 'Control (se recalcula con el libro)', 'Valor', 'Estado']);
  const ppto = `'Presupuesto'!`;
  const [i0, i1] = (ctx.refs.PPTO_FILAS || '1:1').split(':').map(Number);
  const tipo = `${ppto}$G$${i0}:$G$${i1}`;
  const parcial = `${ppto}$F$${i0}:$F$${i1}`;
  const met = `${ppto}$D$${i0}:$D$${i1}`;
  const pu = `${ppto}$E$${i0}:$E$${i1}`;
  const ins = r.insumos.total;
  const controles: [string, string, Valor, string, boolean][] = [
    ['Suma de partidas = costo directo', `=SUMIF(${tipo},"P",${parcial})-${ctx.refs.CD}`, 0, `ABS(C{f})<0.005`, true],
    ['Partidas sin metrado', `=COUNTIFS(${tipo},"P",${met},0)`, r.hojas.filter((x) => x.metrado === 0).length, `C{f}=0`, r.hojas.every((x) => x.metrado > 0)],
    ['Partidas sin precio unitario', `=COUNTIFS(${tipo},"P",${pu},0)`, r.hojas.filter((x) => x.pu === 0).length, `C{f}=0`, r.hojas.every((x) => x.pu > 0)],
    ['Relación de insumos − costo directo (redondeo de APU)', `=${ctx.refs.INS_TOTAL}-${ctx.refs.CD}`, redondear(ins - r.pie.costoDirecto, 2), `ABS(C{f})<=MAX(1,${ctx.refs.CD}*0.001)`, Math.abs(ins - r.pie.costoDirecto) <= Math.max(1, r.pie.costoDirecto * 0.001)],
    ['Cronograma valorizado − costo directo', `=${ctx.refs.VAL_CD}-${ctx.refs.CD}`, 0, `ABS(C{f})<0.05`, true],
    ['Gastos generales del pie = desagregado', `=${ppto}$F$${ctx.refs.GG_FILA}-${ctx.refs.GG}`, 0, `ABS(C{f})<0.005`, true],
    ['Fórmula polinómica: suma de coeficientes', `=${ctx.refs.POL_SUMA}`, r.polinomica.suma, `ABS(C{f}-1)<0.0005`, Math.abs(r.polinomica.suma - 1) < 0.0005],
    ['Fórmula polinómica: coeficiente mínimo (≥ 0.050)', `=${ctx.refs.POL_MIN}`, Math.min(...r.polinomica.monomios.map((x) => x.coeficiente), 1), `C{f}>=0.05`, r.polinomica.monomios.every((x) => x.coeficiente >= 0.05)],
    ['Fórmula polinómica: número de monomios (≤ 8)', `=${ctx.refs.POL_N}`, r.polinomica.monomios.length, `C{f}<=8`, r.polinomica.monomios.length <= 8],
  ];
  controles.forEach(([n, fo, val, cond, ok], i) => {
    h.v(f, 1, i + 1, { h: 'center', borde: 'hair' });
    h.v(f, 2, n, { borde: 'hair' });
    h.fx(f, 3, fo, val, { fmt: typeof val === 'number' && !Number.isInteger(val) ? '#,##0.000' : '#,##0.00', borde: 'hair' });
    h.fx(f, 4, `=IF(${cond.replace(/\{f\}/g, String(f))},"Conforme","Revisar")`, ok ? 'Conforme' : 'Revisar', { h: 'center', negrita: true, borde: 'hair' });
    f++;
  });
  h.ws.addConditionalFormatting({
    ref: `D${f - controles.length}:D${f - 1}`,
    rules: [
      { type: 'containsText', operator: 'containsText', text: 'Revisar', priority: 1, style: { font: { color: { argb: 'FFC0392B' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF5E1DD' } } } },
      { type: 'containsText', operator: 'containsText', text: 'Conforme', priority: 2, style: { font: { color: { argb: 'FF17574C' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE1EEEA' } } } },
    ],
  });
  f += 2;
  h.v(f++, 1, 'Resultado de las 15 reglas de Expediente Pro al exportar', { negrita: true, color: AZUL });
  for (const v of r.validacion) {
    h.v(f, 1, v.regla, { h: 'center', borde: 'hair' });
    h.v(f, 2, v.control, { borde: 'hair' });
    h.v(f, 4, v.estado === 'ok' ? 'Conforme' : v.estado === 'error' ? 'Error' : 'Advertencia', { h: 'center', borde: 'hair' });
    f++;
  }
  configurarImpresion(h, ctx, 0, false);
  h.ws.pageSetup.printTitlesRow = undefined;
}

function hojaCumplimiento(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  h.anchos([6, 50, 40, 12, 36]);
  let f = membrete(h, ctx, 'Matriz de cumplimiento del TdR', 5);
  h.cabecera(f++, ['N°', 'Entregable exigido', 'Documento del expediente', 'Estado', 'Observación']);
  r.proyecto.tdr.entregables.forEach((e, i) => {
    h.v(f, 1, i + 1, { h: 'center', borde: 'hair' });
    h.v(f, 2, e.descripcion, { borde: 'hair', ajustar: true });
    h.v(f, 3, e.documento ? NOMBRE_DOC[e.documento as DocKey] : '— sin asignar —', { borde: 'hair' });
    h.v(f, 4, !e.documento ? 'Pendiente' : e.documento === 'externo' ? 'Externo' : 'Generado', { h: 'center', borde: 'hair' });
    h.v(f, 5, e.observacion ?? '', { borde: 'hair', ajustar: true });
    f++;
  });
  configurarImpresion(h, ctx, 0, false);
}

// ------------------------------------------------------------ principal

export async function generarXlsx(r: Resultados): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const c = datosCabecera(r.proyecto);
  wb.creator = c.proyectista || 'Expediente Pro';
  wb.title = r.proyecto.meta.nombre;
  wb.company = c.proyectista;
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const ctx: Ctx = {
    r,
    wb,
    datos: {},
    insumoFila: new Map(),
    apuPU: new Map(),
    apuRend: new Map(),
    metTotal: new Map(),
    ppto: new Map(),
    refs: {},
    totalesGrupoInsumo: {} as Record<TipoInsumo, string>,
    plazoMeses: r.programa.plazoMeses,
    apuFilas: [],
  };
  if (c.logoProyectista) {
    const b = logoBytes(c.logoProyectista);
    ctx.imgProyectista = { id: wb.addImage({ buffer: b.datos as unknown as ExcelJS.Buffer, extension: b.tipo === 'jpg' ? 'jpeg' : 'png' }), ancho: c.logoProyectista.ancho, alto: c.logoProyectista.alto };
  }
  if (c.logoCliente) {
    const b = logoBytes(c.logoCliente);
    ctx.imgCliente = { id: wb.addImage({ buffer: b.datos as unknown as ExcelJS.Buffer, extension: b.tipo === 'jpg' ? 'jpeg' : 'png' }), ancho: c.logoCliente.ancho, alto: c.logoCliente.alto };
  }

  // orden de pestañas
  hojaDatos(ctx);
  const hRes = new Hoja(wb, 'Resumen');
  const hPpto = new Hoja(wb, 'Presupuesto');
  const hApu = new Hoja(wb, 'APU');
  const hIns = new Hoja(wb, 'Insumos');
  const hMet = new Hoja(wb, 'Metrados');
  const hResMet = new Hoja(wb, 'Resumen metrados');
  const hGG = new Hoja(wb, 'Gastos generales');
  const hPol = new Hoja(wb, 'Fórmula polinómica');
  const hFle = r.proyecto.meta.fleteTarifaTon ? new Hoja(wb, 'Flete') : null;
  const hProg = new Hoja(wb, 'Cronograma');
  const hVal = new Hoja(wb, 'Valorizado');
  const hAdq = new Hoja(wb, 'Adquisiciones');
  const hEq = new Hoja(wb, 'Equipos');
  const hPer = new Hoja(wb, 'Personal');
  const hDes = new Hoja(wb, 'Desembolsos');
  const hDist = new Hoja(wb, 'Distribución %');
  const hCtl = new Hoja(wb, 'Controles');
  const hCum = r.proyecto.tdr.entregables.length ? new Hoja(wb, 'Cumplimiento TdR') : null;
  const hCal = new Hoja(wb, 'Calendario', { state: 'hidden' });
  hojaCalendarioLaboral(ctx, hCal);

  // dependencias: metrados → filas de presupuesto → APU → insumos → presupuesto → GG → resto
  planInsumos(ctx);
  hojaMetrados(ctx, hMet);
  const filaPptoDe = new Map<string, number>();
  hojaPresupuesto(ctx, hPpto, filaPptoDe, true); // solo reserva filas
  hojaApu(ctx, hApu, hPpto, filaPptoDe);
  // presupuesto real (necesita APU y metrados); CD se usa en insumos y GG
  const plan = new Map(filaPptoDe);
  hojaPresupuesto(ctx, hPpto, filaPptoDe);
  for (const [k, v] of plan) if (filaPptoDe.get(k) !== v) throw new Error('Desfase de filas en el presupuesto');
  hojaInsumos(ctx, hIns, hApu);
  insumosAnticipacion(ctx, hIns);
  hojaGG(ctx, hGG);
  completarGGPresupuesto(ctx, hPpto);
  hojaResumenMetrados(ctx, hResMet);
  hojaResumen(ctx, hRes, filaPptoDe);
  hojaPolinomica(ctx, hPol);
  if (hFle) hojaFlete(ctx, hFle);
  hojaPrograma(ctx, hProg);
  planPeriodos(ctx);
  apuPeriodos(ctx, hApu);

  // distribución por periodos (fracciones calculadas por el motor)
  const etiquetas = r.programa.periodos.map((x) => x.etiqueta);
  const frac = (vals: number[], total: number) => vals.map((v) => (total ? v / total : 0));
  const per = ctx.per!;
  const apuA = hApu.rango(1, 1, 20000, 1);
  const apuH = hApu.rango(1, 8, 20000, 8);
  const porInsumo = (col0: number) => (f: number, i: number) => {
    const tot = `SUMIF(${apuA},$A${f},${apuH})`;
    return `=IF(${tot}=0,0,SUMIF(${apuA},$A${f},${hApu.rango(1, col0 + i, 20000, col0 + i)})/${tot})`;
  };
  const avance = (_f: number, i: number, clave: string) => {
    const rp = ctx.prog?.fila.get(clave);
    if (!rp) return '=0';
    const H = cron('H', rp), I = cron('I', rp), J = cron('J', rp);
    return `=IF(${H}=0,0,${DIAS(I, J, per.ini[i], per.finCalc[i])}/${H})`;
  };
  const bloques: Bloque[] = [
    { titulo: 'Avance de partidas', periodos: etiquetas, formula: avance, filas: filasValorizado(r).map((x) => ({ clave: x.clave, codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad, fracciones: frac(x.valores, x.total) })) },
    { titulo: 'Compra de materiales', periodos: ['Previo', ...etiquetas], formula: porInsumo(10), filas: r.adquisiciones.map((x) => ({ clave: x.codigo, codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad, fracciones: frac(x.valores, x.total) })) },
    { titulo: 'Uso de equipos', periodos: etiquetas, formula: porInsumo(11), filas: r.equipos.map((x) => ({ clave: x.codigo, codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad, fracciones: frac(x.valores, x.total) })) },
    { titulo: 'Mano de obra', periodos: etiquetas, formula: porInsumo(11), filas: r.personal.map((x) => ({ clave: x.codigo, codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad, fracciones: frac(x.valores, x.total) })) },
  ];
  const dist = hojaDistribucion(ctx, hDist, bloques);
  hojaValorizado(ctx, hVal, dist.get('Avance de partidas')!);
  hojaCalendario(ctx, hAdq, 'Calendario de adquisición de materiales', r.adquisiciones, dist.get('Compra de materiales')!, true, (f, ini, fin, P) => {
    const h = hAdq;
    h.v(f, 2, `Monto de compras (${r.proyecto.meta.moneda})`, { negrita: true, h: 'right' });
    for (let i = 0; i < P; i++) {
      const c2 = COL(6 + i);
      const monto = r.adquisiciones.reduce((a, x) => a + (x.montos?.[i] ?? 0), 0);
      h.fx(f, 6 + i, `=SUMPRODUCT(ROUND(${c2}${ini}:${c2}${fin}*$E$${ini}:$E$${fin},2))`, monto, { fmt: F_MONEDA, negrita: true });
    }
    h.fila(f, 1, 5 + P, { borde: 'arriba' });
    return f + 1;
  });
  hojaCalendario(ctx, hEq, 'Calendario de utilización de equipos (horas-máquina)', r.equipos, dist.get('Uso de equipos')!, false);
  hojaCalendario(ctx, hPer, 'Histograma de personal (horas-hombre)', r.personal, dist.get('Mano de obra')!, false, (f, ini, fin, P) => {
    const h = hPer;
    h.v(f, 2, 'Total horas-hombre', { negrita: true, h: 'right' });
    for (let i = 0; i < P; i++) {
      const c2 = COL(6 + i);
      const hh = r.personal.reduce((a, x) => a + (x.valores[i] ?? 0), 0);
      h.fx(f, 6 + i, `=SUM(${c2}${ini}:${c2}${fin})`, hh, { fmt: '#,##0.00', negrita: true });
    }
    h.fila(f, 1, 5 + P, { borde: 'arriba' });
    f++;
    h.v(f, 2, 'Días laborables del periodo', { cursiva: true, h: 'right' });
    r.programa.periodos.forEach((p, i) => h.fx(f, 6 + i, `=${NDL(per.ini[i], per.fin[i])}`, p.diasLaborables, { fmt: '0' }));
    f++;
    h.v(f, 2, 'Trabajadores promedio (equivalentes)', { negrita: true, h: 'right' });
    for (let i = 0; i < P; i++) {
      const c2 = COL(6 + i);
      h.fx(f, 6 + i, `=IF(${c2}${f - 1}>0,ROUND(${c2}${f - 2}/(JORNADA*${c2}${f - 1}),1),0)`, r.personalEquivalente[i] ?? 0, { fmt: '0.0', negrita: true });
    }
    return f + 1;
  });
  hojaDesembolsos(ctx, hDes, hVal);
  hojaControles(ctx, hCtl);
  if (hCum) hojaCumplimiento(ctx, hCum);
  void compararCodigos;
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
