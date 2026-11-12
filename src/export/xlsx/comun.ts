// Excel del expediente: estilos, la clase Hoja, el contexto compartido, fórmulas de días laborables y membretes.
import ExcelJS from 'exceljs';
import { encajar, datosCabecera } from '../../engine/cabecera';
import type { ActividadCalc, Resultados, TipoInsumo } from '../../engine/types';
import { diaSemana, isoAFecha, sumarDias } from '../../engine/util';

// ------------------------------------------------------------ estilos

export const AZUL = 'FF1F3A5F';
export const AZUL_INPUT = 'FF0000CC';
export const VERDE_LINK = 'FF0B6B2F';
export const GRIS = 'FFE9EEF3';
export const GRIS2 = 'FFF5F7F9';
export const BORDE_FINO = { style: 'thin' as const, color: { argb: 'FFB8C3CF' } };
export const BORDE_HAIR = { style: 'hair' as const, color: { argb: 'FFD5DCE4' } };
export const FUENTE = 'Arial';

export const F_MONEDA = '#,##0.00';
export const F_CANT = '#,##0.0000';
export const F_MET = '#,##0.00';
export const F_PCT = '0.00%';
export const F_FECHA = 'dd/mm/yyyy';

export type Valor = ExcelJS.CellValue;
export interface Estilo {
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

export const COL = (n: number) => {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export class Hoja {
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

export interface Ctx {
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
export const NDL = (a: string, b: string) => `(INDEX(CAL_ACUM,${b}-FECHA_INICIO+1)-IF(${a}<=FECHA_INICIO,0,INDEX(CAL_ACUM,${a}-FECHA_INICIO)))`;
/** Fecha del n-ésimo día laborable contado desde FECHA_INICIO (n ≥ 1). */
export const WDL = (n: string) => `INDEX(CAL_FECHA,MATCH(${n},CAL_ACUM,0))`;
/** Días laborables de la actividad [i, j] que caen en la ventana [lo, hi]. */
export const DIAS = (i: string, j: string, lo: string, hi: string) => `IF(MAX(${i},${lo})>MIN(${j},${hi}),0,${NDL(`MAX(${i},${lo})`, `MIN(${j},${hi})`)})`;

export function hojaCalendarioLaboral(ctx: Ctx, h: Hoja) {
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
export const CRON = 'Cronograma';

/** Serie redondeada a 2 decimales cuyo resto va al último elemento no nulo (como cuadrar() del motor). */
export function serieCuadrada(expr: (x: string) => string, total: string, items: string[], i: number): string {
  const r = (x: string) => `ROUND(${expr(x)},2)`;
  const resto = `${total}-(${items.map(r).join('+')})`;
  const despues = items.slice(i + 1).map((x) => `(${r(x)}<>0)`);
  const cond = despues.length ? `AND(${r(items[i])}<>0,${despues.join('+')}=0)` : `${r(items[i])}<>0`;
  return `${r(items[i])}+IF(${cond},${resto},0)`;
}
export const cron = (c: string, f: number) => `'${CRON}'!$${c}$${f}`;

/** Días laborables de una actividad cuya fecha (desplazada `ant` días antes) cae en [lo, hi] (null = sin límite). */
export function diasEnVentana(r: Resultados, a: ActividadCalc | undefined, ant: number, lo: string | null, hi: string | null): number {
  if (!a) return 0;
  let n = 0;
  for (let d = a.es; d < a.ef; d++) {
    const g = ant ? sumarDias(r.programa.diaFecha[d], -ant) : r.programa.diaFecha[d];
    if ((lo === null || g >= lo) && (hi === null || g <= hi)) n++;
  }
  return n;
}

export function tituloHoja(h: Hoja, ctx: Ctx, titulo: string, ncols: number) {
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
export function finMembrete(ctx: Ctx, extra = 0): number {
  return 5 + (datosCabecera(ctx.r.proyecto).propietario ? 5 : 4) + extra + 1;
}

export function membrete(h: Hoja, ctx: Ctx, titulo: string, ncols: number, extra: [string, string, Valor][] = []): number {
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

export function configurarImpresion(h: Hoja, ctx: Ctx, filaTitulos: number, horizontal: boolean) {
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
