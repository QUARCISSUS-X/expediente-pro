// Importa un expediente existente hecho en S10, Delphin, PowerCost o Excel:
//   · Presupuesto ("Item / Descripción / Unid. / Cant. / Precio / Total")
//   · Análisis de precios unitarios por bloques ("Partida: … Rendimiento: … Costo unit. por …")
//   · Lista de insumos, gastos generales variables, fijos y financieros
//   · Planilla de sustento de metrados (N.º veces, cantidad, factor, largo, ancho, alto, área, volumen)
//   · Cronograma de MS Project guardado como XML (MSPDI)
// Además de cargar el proyecto, compara cada cifra recalculada con la del archivo original y anota
// las inconsistencias de formato y de cálculo encontradas.
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { sugerirIU } from '../data/iu';
import { proyectoEnBlanco } from '../data/proyectos';
import { calcularTodo } from '../engine/index';
import type { Apu, ApuItem, GGItem, GrupoGG, Insumo, MetradoFila, ObservacionOrigen, Partida, Proyecto, TipoInsumo, TipoPred } from '../engine/types';
import { aplicarEett, leerEettDocx } from './importarEett';
import { normalizarUnidad, redondear, uid } from '../engine/util';

export type Observacion = ObservacionOrigen;

export interface ControlImportacion {
  costoDirecto?: number;
  gg?: number;
  utilidad?: number;
  subtotal?: number;
  plazoDias?: number;
}

export interface ResultadoImportacion {
  proyecto: Proyecto;
  avisos: string[];
  observaciones: Observacion[];
  original: ControlImportacion;
  hojas: string[];
}

export interface ArchivoEntrada {
  nombre: string;
  datos: Uint8Array | ArrayBuffer;
}

// ------------------------------------------------------------ utilidades

type Celda = string | number | Date | null;

function valor(v: ExcelJS.CellValue): Celda {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return typeof v === 'string' ? v.replace(/ /g, ' ') : v;
  if (v instanceof Date) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; error?: string };
  if (o.richText) return o.richText.map((x) => x.text).join('');
  if ('result' in o) {
    const r = o.result as unknown;
    if (r === undefined || r === null) return null;
    if (typeof r === 'object' && r && 'error' in (r as object)) return null;
    return r instanceof Date ? r : typeof r === 'number' || typeof r === 'string' ? r : null;
  }
  if (o.text !== undefined) return String(o.text);
  return null;
}

type Tabla = Celda[][]; // [fila][columna], base 0

function leerHoja(ws: ExcelJS.Worksheet): Tabla {
  const t: Tabla = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const f: Celda[] = [];
    row.eachCell({ includeEmpty: true }, (c, col) => {
      f[col - 1] = valor(c.value);
    });
    t[n - 1] = f;
  });
  for (let i = 0; i < t.length; i++) if (!t[i]) t[i] = [];
  return t;
}

const txt = (c: Celda | undefined) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim());
const numero = (c: Celda | undefined): number | null => {
  if (typeof c === 'number' && isFinite(c)) return c;
  if (typeof c === 'string') {
    const s = c.replace(/[%\s]/g, '').replace(/,(?=\d{3}\b)/g, '');
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  }
  return null;
};
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => sinTildes(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fechaIso = (c: Celda | undefined): string | null => {
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  const s = txt(c);
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Normaliza un ítem: 1 → 01, 1.01 → 01.01, '1.1.1' → 01.01.01. */
export function codigoItem(c: Celda): string {
  if (typeof c === 'number') {
    const ent = Math.trunc(c);
    const frac = Math.round((c - ent) * 100);
    return frac ? `${pad2(ent)}.${pad2(frac)}` : pad2(ent);
  }
  const s = txt(c).replace(/\s/g, '').replace(/\.$/, '');
  if (!/^\d+(\.\d+)*$/.test(s)) return s;
  return s.split('.').map((p) => p.padStart(2, '0')).join('.');
}

/** Código de insumo: los numéricos de S10 tienen 10 dígitos (Excel les quita los ceros de la izquierda). */
function codigoInsumo(c: Celda): string {
  if (typeof c === 'number') return String(Math.round(c)).padStart(10, '0');
  const s = txt(c);
  return /^\d{5,9}$/.test(s) ? s.padStart(10, '0') : s;
}

const VACIAS = new Set(['de', 'la', 'el', 'los', 'las', 'con', 'en', 'para', 'por', 'del', 'al', 'inc', 'incluye', 'tipo']);
function similitud(a: string, b: string): number {
  const ta = new Set(norm(a).split(' ').filter((x) => x.length > 1 && !VACIAS.has(x)));
  const tb = new Set(norm(b).split(' ').filter((x) => x.length > 1 && !VACIAS.has(x)));
  if (!ta.size || !tb.size) return 0;
  let comun = 0;
  for (const x of ta) if (tb.has(x)) comun++;
  return comun / Math.max(ta.size, tb.size);
}

function buscarFila(t: Tabla, pred: (f: Celda[]) => boolean, desde = 0, hasta = t.length): number {
  for (let i = desde; i < Math.min(hasta, t.length); i++) if (pred(t[i])) return i;
  return -1;
}
const filaTiene = (f: Celda[], re: RegExp) => f.some((c) => re.test(norm(txt(c))));
const colDe = (f: Celda[], re: RegExp) => f.findIndex((c) => re.test(norm(txt(c))));

// ------------------------------------------------------------ hojas reconocidas

interface LineaPpto { codigo: string; descripcion: string; unidad: string; metrado: number | null; precio: number | null; parcial: number | null; fila: number }

function leerPresupuesto(t: Tabla) {
  const h = buscarFila(t, (f) => filaTiene(f, /^item$/) && filaTiene(f, /^descripcion/) && filaTiene(f, /^(cant|metrado)/) && filaTiene(f, /^precio/));
  if (h < 0) return null;
  const cab = t[h];
  const cI = colDe(cab, /^item$/), cD = colDe(cab, /^descripcion/), cU = colDe(cab, /^(unid|und)/), cM = colDe(cab, /^(cant|metrado)/), cP = colDe(cab, /^precio/), cT = colDe(cab, /^(total|parcial)/);
  const lineas: LineaPpto[] = [];
  let fin = t.length;
  for (let i = h + 1; i < t.length; i++) {
    const f = t[i];
    if (filaTiene(f, /^costo directo$/)) { fin = i; break; }
    const cod = f[cI];
    const desc = txt(f[cD]);
    if (cod === null || cod === undefined || !desc) continue;
    const codigo = codigoItem(cod);
    if (!/^\d{2}(\.\d{2})*$/.test(codigo)) continue;
    lineas.push({ codigo, descripcion: desc.replace(/\s+/g, ' ').trim(), unidad: txt(f[cU]), metrado: numero(f[cM]), precio: numero(f[cP]), parcial: numero(f[cT]), fila: i + 1 });
  }
  // pie
  const pie: ControlImportacion & { utilidadPct?: number; ggPct?: number; igv?: number } = {};
  for (let i = fin; i < Math.min(t.length, fin + 15); i++) {
    const f = t[i];
    const etq = f.map((c) => norm(txt(c))).find((x) => x) ?? '';
    const nums = f.map(numero).filter((x): x is number => x !== null);
    const ult = nums.length ? nums[nums.length - 1] : undefined;
    const pct = f.map((c) => (typeof c === 'string' && /%/.test(c) ? numero(c) : typeof c === 'number' && c > 0 && c < 1.5 ? c * 100 : null)).find((x) => x !== null) ?? undefined;
    if (/^costo directo/.test(etq)) pie.costoDirecto = ult;
    else if (/^gastos generales/.test(etq)) { pie.gg = ult; pie.ggPct = pct ?? undefined; }
    else if (/^utilidad/.test(etq)) { pie.utilidad = ult; pie.utilidadPct = pct ?? undefined; }
    else if (/^sub ?total/.test(etq)) pie.subtotal = ult;
    else if (/^igv/.test(etq)) pie.igv = ult;
  }
  // datos del encabezado
  const dato = (re: RegExp) => {
    const i = buscarFila(t, (f) => re.test(norm(txt(f[0]))), 0, h);
    if (i < 0) return '';
    const etq = txt(t[i][0]);
    const vals = t[i].slice(1).filter((c) => c !== null && txt(c) !== '' && txt(c) !== ':' && txt(c) !== etq);
    return vals.length ? vals[0] : '';
  };
  const filasSon = t.slice(fin, fin + 15).flat().map(txt).filter((x) => /son\s*:/i.test(x));
  return {
    lineas,
    pie,
    proyecto: txt(dato(/^proyecto/)),
    propietario: txt(dato(/^(propietario|cliente)/)),
    ubicacion: txt(dato(/^(ubicacion|lugar)/)),
    fecha: fechaIso(dato(/^fecha/) as Celda),
    son: filasSon[0] ?? '',
  };
}

interface ItemApuLeido { codigo: string; descripcion: string; unidad: string; tipo: TipoInsumo; cuadrilla: number | null; cantidad: number; precio: number; parcial: number; fila: number }
interface ApuLeido { codigo: string; descripcion: string; unidad: string; rendimiento: number; pu: number | null; items: ItemApuLeido[]; fila: number; subtotales: Partial<Record<TipoInsumo, number>> }

const GRUPOS: [RegExp, TipoInsumo][] = [
  [/^mano de obra/, 'MO'],
  [/^materiales?/, 'MAT'],
  [/^equipos?( y herramientas)?$/, 'EQ'],
  [/^sub ?contratos?/, 'SC'],
];

function leerApus(t: Tabla): ApuLeido[] {
  const out: ApuLeido[] = [];
  let actual: ApuLeido | null = null;
  let cols: { c: number; d: number; u: number; r: number; q: number; p: number; t: number } | null = null;
  let tipo: TipoInsumo = 'MAT';
  for (let i = 0; i < t.length; i++) {
    const f = t[i];
    const a = txt(f[0]);
    const na = norm(a);
    if (/^partida\b/.test(na)) {
      const m = a.match(/partida\s*:?\s*([\d.]+)/i);
      const siguiente = txt(f.slice(1).find((c) => c !== null && txt(c) !== a) ?? '');
      const m2 = siguiente.match(/^([\d.]+)\s+(.*)$/);
      const codigo = codigoItem(m ? m[1] : m2 ? m2[1] : siguiente);
      actual = { codigo, descripcion: '', unidad: '', rendimiento: 0, pu: null, items: [], fila: i + 1, subtotales: {} };
      out.push(actual);
      cols = null;
      tipo = 'MAT';
      // descripción en la misma fila (S10) o en la siguiente
      const resto = f.slice(1).map(txt).filter((x) => x && x !== a && !/^partida/i.test(x) && !/^rendimiento/i.test(x) && !/^[\d.]+$/.test(x) && !/^(mo|eq)\.?$/i.test(x) && !/\/\s*d[ií]a/i.test(x));
      if (m2 && !m) actual.descripcion = m2[2].trim();
      else if (resto.length && resto[0].length > 3 && !/^\d/.test(resto[0])) actual.descripcion = resto[0];
    }
    if (!actual) continue;
    // rendimiento
    const iRend = f.findIndex((c) => /rendimiento/i.test(txt(c)));
    if (iRend >= 0 && !actual.rendimiento) {
      const s = txt(f[iRend]);
      const m = s.match(/rendimiento\s*:?\s*([\d.,]+)\s*([^\s/]+)?\s*\/\s*d/i);
      if (m) {
        actual.rendimiento = parseFloat(m[1].replace(',', '.'));
        if (m[2]) actual.unidad = normalizarUnidad(m[2]);
      } else {
        const resto = f.slice(iRend + 1);
        const u = resto.map(txt).find((x) => /\/\s*d/i.test(x));
        if (u) actual.unidad = normalizarUnidad(u.split('/')[0]);
        const iMo = resto.findIndex((c) => /^mo\.?$/i.test(txt(c)));
        const n = iMo >= 0 ? numero(resto[iMo + 1]) : resto.map(numero).find((x) => x !== null) ?? null;
        if (n !== null) actual.rendimiento = n;
      }
    }
    if (!actual.descripcion && i === actual.fila && a && !/^partida/i.test(a) && !/^c[oó]digo$/i.test(a)) actual.descripcion = a;
    const iCosto = f.findIndex((c) => /costo unit/i.test(txt(c)));
    if (iCosto >= 0) {
      const s = txt(f[iCosto]);
      const m = s.match(/por\s*:?\s*(\S+)/i);
      if (m && !actual.unidad) actual.unidad = normalizarUnidad(m[1]);
      const nums = f.slice(iCosto + 1).map(numero).filter((x): x is number => x !== null);
      if (nums.length) actual.pu = nums[nums.length - 1];
      continue;
    }
    if (/^codigo$/.test(na) && filaTiene(f, /^descripcion/)) {
      cols = {
        c: 0,
        d: colDe(f, /^descripcion/),
        u: colDe(f, /^(unid|und)/),
        r: colDe(f, /^(recursos|cuadrilla)/),
        q: colDe(f, /^cantidad/),
        p: colDe(f, /^precio/),
        t: colDe(f, /^parcial/),
      };
      continue;
    }
    if (!cols) continue;
    const nb = norm(txt(f[cols.d]));
    const g = GRUPOS.find(([re]) => re.test(na)) ?? (!a ? GRUPOS.find(([re]) => re.test(nb)) : undefined);
    if (g && (cols.q < 0 || numero(f[cols.q]) === null || txt(f[cols.d]) === a || !a)) {
      tipo = g[1];
      const st = numero(f[cols.t]);
      if (st !== null) actual.subtotales[tipo] = st;
      continue;
    }
    const desc = txt(f[cols.d]);
    if (!a || !desc) continue;
    const cantidad = numero(f[cols.q]);
    if (cantidad === null) continue;
    actual.items.push({
      codigo: codigoInsumo(f[0]),
      descripcion: desc.replace(/\s+/g, ' ').trim(),
      unidad: normalizarUnidad(txt(f[cols.u])),
      tipo,
      cuadrilla: cols.r >= 0 ? numero(f[cols.r]) : null,
      cantidad,
      precio: numero(f[cols.p]) ?? 0,
      parcial: numero(f[cols.t]) ?? 0,
      fila: i + 1,
    });
  }
  return out.filter((x) => x.items.length || x.pu !== null);
}

interface LineaMetrado { referencia: string; veces: number | null; cantidad: number | null; factor: number | null; largo: number | null; ancho: number | null; alto: number | null; area: number | null; volumen: number | null; descripcion: string }
interface PartidaMetrado { codigo: string; descripcion: string; unidad: string; total: number | null; lineas: LineaMetrado[]; fila: number }

let cabMetrados: Record<string, string> = {};
function leerPlanillaMetrados(t: Tabla): PartidaMetrado[] | null {
  const h = buscarFila(t, (f) => filaTiene(f, /^item$/) && filaTiene(f, /veces/) && filaTiene(f, /^largo/));
  if (h < 0) return null;
  cabMetrados = leerCabecera(t, h);
  const f0 = t[h];
  const c = {
    i: colDe(f0, /^item$/), d: colDe(f0, /^descripcion/), u: colDe(f0, /^(und|unid)/), ref: colDe(f0, /^referencia/), v: colDe(f0, /veces/), q: colDe(f0, /^cantidad/),
    fa: colDe(f0, /^factor/), l: colDe(f0, /^largo/), an: colDe(f0, /^ancho/), al: colDe(f0, /^(alto|altura)/), ar: colDe(f0, /^area/), vo: colDe(f0, /^volumen/), tot: colDe(f0, /total/),
  };
  const out: PartidaMetrado[] = [];
  let actual: PartidaMetrado | null = null;
  const n = (f: Celda[], k: number) => (k >= 0 ? numero(f[k]) : null);
  for (let i = h + 1; i < t.length; i++) {
    const f = t[i];
    const item = f[c.i];
    const desc = txt(f[c.d]);
    const und = txt(f[c.u]);
    const dims: LineaMetrado = { referencia: c.ref >= 0 ? txt(f[c.ref]) : '', veces: n(f, c.v), cantidad: n(f, c.q), factor: n(f, c.fa), largo: n(f, c.l), ancho: n(f, c.an), alto: n(f, c.al), area: n(f, c.ar), volumen: n(f, c.vo), descripcion: '' };
    const tieneDims = [dims.veces, dims.cantidad, dims.factor, dims.largo, dims.ancho, dims.alto, dims.area, dims.volumen].some((x) => x !== null);
    if (item !== null && item !== undefined && txt(item)) {
      if (!und) { actual = null; continue; } // título
      actual = { codigo: codigoItem(item), descripcion: desc.replace(/\s+/g, ' ').trim(), unidad: normalizarUnidad(und), total: n(f, c.tot), lineas: [], fila: i + 1 };
      out.push(actual);
      if (tieneDims) actual.lineas.push({ ...dims, descripcion: 'Metrado según planos' });
    } else if (actual && tieneDims) actual.lineas.push({ ...dims, descripcion: desc || 'Metrado' });
  }
  return out;
}

interface FilaGG { rubro: string; descripcion: string; unidad: string; inc: number | null; q1: number | null; q2: number | null; pu: number | null; parcial: number | null; codigo: string; fila: number }

/** Datos del encabezado de una hoja ("Cliente:", "Código:", "Consultor:"…). */
function leerCabecera(t: Tabla, hasta: number): Record<string, string> {
  const cab: Record<string, string> = {};
  for (const f of t.slice(0, Math.max(0, hasta))) f.forEach((c, i) => {
    const k = norm(txt(c));
    if (/^(codigo|cliente|cliente final|consultor|proyecto|ubicacion|propietario)$/.test(k) && !cab[k]) cab[k] = txt(f.slice(i + 1).find((x) => x !== null && txt(x) !== txt(c) && txt(x) !== ':') ?? '');
  });
  return cab;
}

function leerGG(t: Tabla): { filas: FilaGG[]; plazo: number | null; total: number | null; cab: Record<string, string> } | null {
  const h = buscarFila(t, (f) => filaTiene(f, /^item$/) && filaTiene(f, /^descripcion/) && filaTiene(f, /^und/) && filaTiene(f, /^parcial/));
  if (h < 0) return null;
  const f0 = t[h];
  const cI = colDe(f0, /^item$/), cD = colDe(f0, /^descripcion/), cU = colDe(f0, /^und/), cP = colDe(f0, /^parcial/), cT = colDe(f0, /^total/);
  const iPlazo = buscarFila(t, (f) => /^plazo/.test(norm(txt(f[0]))), 0, h);
  const plazo = iPlazo >= 0 ? numero(t[iPlazo].slice(1).find((x) => numero(x) !== null) ?? null) : null;
  const cab = leerCabecera(t, h);
  const filas: FilaGG[] = [];
  let rubro = '';
  let sub = '';
  let total: number | null = null;
  for (let i = h + 1; i < t.length; i++) {
    const f = t[i];
    const a = txt(f[cI]);
    const desc = txt(f[cD]).replace(/\s+/g, ' ').trim();
    if (/^total/i.test(a)) { total = numero(f[cT]) ?? total; break; }
    if (!desc && !a) continue;
    const und = txt(f[cU]);
    const parcial = numero(f[cP]);
    if (!und) {
      // rubro (nivel 1) o subtítulo
      if (numero(f[cT]) !== null || /^\d{1,2}(\.00)?$/.test(a)) { rubro = desc; sub = ''; }
      else sub = desc;
      continue;
    }
    if (parcial === null) continue;
    const nums = f.slice(cU + 1, cP).map(numero);
    filas.push({ rubro, descripcion: a ? desc : sub ? `${sub.charAt(0)}${sub.slice(1).toLowerCase()}: ${desc}` : desc, unidad: und, inc: nums[0] ?? null, q1: nums[1] ?? null, q2: nums[2] ?? null, pu: nums[3] ?? null, parcial, codigo: a, fila: i + 1 });
  }
  return { filas, plazo, total, cab };
}

function leerFinancieros(t: Tabla): { costo: number | null; tasa: number | null; comision: number | null; periodo: number | null } {
  let costo: number | null = null, tasa: number | null = null, comision: number | null = null, periodo: number | null = null;
  for (const f of t) {
    f.forEach((c, i) => {
      const s = norm(txt(c));
      const sig = () => f.slice(i + 1).map(numero).find((x) => x !== null) ?? null;
      if (/^tasa/.test(s)) tasa = sig();
      else if (/^comision del banco$/.test(s) && comision === null) comision = sig();
      else if (/^periodo/.test(s)) periodo = sig();
      else if (/^costo financiero/.test(s)) costo = sig();
      else if (/^sub ?total/.test(s) && costo === null) costo = sig();
    });
  }
  return { costo, tasa, comision, periodo };
}

// ------------------------------------------------------------ MS Project XML

interface TareaMsp { uid: string; nombre: string; nivel: number; resumen: boolean; hito: boolean; duracionDias: number; inicio: string; fin: string; preds: { uid: string; tipo: TipoPred | 'CF'; desfase: number }[] }

export function leerMsProjectXml(xml: string): { tareas: TareaMsp[]; inicio: string | null; laborables: number[] | null; minutosDia: number } {
  const tag = (s: string, n: string) => s.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1] ?? '';
  const minutosDia = parseFloat(tag(xml.slice(0, 4000), 'MinutesPerDay')) || 480;
  const horas = (d: string) => {
    const m = d.match(/PT(\d+(?:\.\d+)?)H(\d+(?:\.\d+)?)M/);
    return m ? parseFloat(m[1]) + parseFloat(m[2]) / 60 : 0;
  };
  const ent = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const bloques = xml.match(/<Task>[\s\S]*?<\/Task>/g) ?? [];
  const tareas: TareaMsp[] = bloques.map((b) => ({
    uid: tag(b, 'UID'),
    nombre: ent(tag(b, 'Name')).trim(),
    nivel: parseInt(tag(b, 'OutlineLevel') || '0', 10),
    resumen: tag(b, 'Summary') === '1',
    hito: tag(b, 'Milestone') === '1',
    duracionDias: Math.round((horas(tag(b, 'Duration')) * 60) / minutosDia * 100) / 100,
    inicio: tag(b, 'Start').slice(0, 10),
    fin: tag(b, 'Finish').slice(0, 10),
    preds: (b.match(/<PredecessorLink>[\s\S]*?<\/PredecessorLink>/g) ?? []).map((p) => {
      const ti = tag(p, 'Type');
      const lag = parseFloat(tag(p, 'LinkLag') || '0'); // décimas de minuto
      return { uid: tag(p, 'PredecessorUID'), tipo: ti === '0' ? 'FF' : ti === '3' ? 'CC' : ti === '2' ? 'CF' : 'FC', desfase: Math.round(lag / 10 / minutosDia) };
    }),
  }));
  const cal = xml.match(/<Calendar>[\s\S]*?<\/Calendar>/)?.[0] ?? '';
  const dias = (cal.match(/<WeekDay>[\s\S]*?<\/WeekDay>/g) ?? []).map((w) => ({ t: parseInt(tag(w, 'DayType'), 10), w: tag(w, 'DayWorking') === '1' })).filter((x) => x.t >= 1 && x.t <= 7);
  const laborables = dias.length ? dias.filter((x) => x.w).map((x) => x.t - 1).sort() : null;
  const inicio = tag(xml.slice(0, 6000), 'StartDate').slice(0, 10) || null;
  return { tareas, inicio, laborables, minutosDia };
}

// ------------------------------------------------------------ armado del proyecto

const TIPO_TXT: Record<TipoInsumo, string> = { MO: 'mano de obra', MAT: 'materiales', EQ: 'equipos', SC: 'subcontratos' };

export async function importarExpediente(archivos: ArchivoEntrada[], opciones: { jornada?: number } = {}): Promise<ResultadoImportacion> {
  const obs: Observacion[] = [];
  const avisos: string[] = [];
  const hojas: string[] = [];
  let jornada = opciones.jornada ?? 8;
  const ob = (documento: string, ubicacion: string, tipo: Observacion['tipo'], detalle: string, correccion: string) => obs.push({ documento, ubicacion, tipo, detalle, correccion });

  let ppto: ReturnType<typeof leerPresupuesto> & { archivo: string; hoja: string } | null = null;
  let apus: ApuLeido[] = [];
  let hojaApu = '';
  let metr: { lineas: PartidaMetrado[]; archivo: string; hoja: string } | null = null;
  const gg: { grupo: GrupoGG; datos: NonNullable<ReturnType<typeof leerGG>>; hoja: string }[] = [];
  let fin: ReturnType<typeof leerFinancieros> | null = null;
  let msp: (ReturnType<typeof leerMsProjectXml> & { archivo: string }) | null = null;
  let resumenMetrado: { codigo: string; total: number | null }[] = [];
  let dolares = false;
  const eett: { nombre: string; lectura: Awaited<ReturnType<typeof leerEettDocx>> }[] = [];

  for (const a of archivos) {
    const datos = a.datos instanceof Uint8Array ? a.datos : new Uint8Array(a.datos);
    if (/\.xml$/i.test(a.nombre)) {
      const xml = new TextDecoder('utf-8').decode(datos);
      const leido = { ...leerMsProjectXml(xml), archivo: a.nombre };
      const firma = (x: typeof leido) => x.tareas.map((t) => `${t.nombre}|${t.duracionDias}|${t.inicio}`).join('\n');
      if (msp && firma(msp) === firma(leido)) {
        ob('Cronograma (MS Project)', `${msp.archivo} y ${a.nombre}`, 'Formato', 'Los dos cronogramas tienen las mismas tareas, duraciones y fechas: el "resumen" no resume nada.', 'Entregar un solo cronograma detallado o un resumen real (por frentes o títulos).');
        continue;
      }
      if (!msp || leido.tareas.length > msp.tareas.length) msp = leido;
      hojas.push(`${a.nombre}: cronograma de MS Project (${leido.tareas.length} tareas)`);
      const recursos = (xml.match(/<Resource>[\s\S]*?<\/Resource>/g) ?? []).filter((r) => /<Name>/.test(r));
      const conTarifa = recursos.filter((r) => /<StandardRate>(?!0(\.0+)?<)[\d.]+<\/StandardRate>/.test(r));
      if (recursos.length && !conTarifa.length) ob('Cronograma (MS Project)', a.nombre, 'Información', `El cronograma tiene ${recursos.length} recursos sin tarifa y sus tareas no tienen costo.`, 'El cronograma valorizado y los calendarios de recursos los calcula Expediente Pro desde el presupuesto; el .xml exportado lleva el costo de cada actividad.');
      continue;
    }
    if (/\.docx$/i.test(a.nombre)) {
      eett.push({ nombre: a.nombre, lectura: await leerEettDocx(datos) });
      hojas.push(`${a.nombre}: especificaciones técnicas (${eett[eett.length - 1].lectura.especificaciones.length} partidas)`);
      continue;
    }
    if (!/\.xlsx$/i.test(a.nombre)) {
      avisos.push(`${a.nombre}: formato no reconocido (use .xlsx, .docx o el .xml de MS Project).`);
      continue;
    }
    // revisión de fórmulas: vínculos a otros libros, fechas que cambian solas y referencias rotas
    try {
      const zip = await JSZip.loadAsync(datos);
      let externos = 0, hoy = 0, rotas = 0;
      for (const [ruta, f] of Object.entries(zip.files)) {
        if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(ruta)) continue;
        const x = await f.async('string');
        externos += (x.match(/<f>[^<]*\[\d+\][^<]*<\/f>/g) ?? []).length;
        hoy += (x.match(/<f>[^<]*(TODAY|NOW)\(\)[^<]*<\/f>/g) ?? []).length;
        rotas += (x.match(/#REF!/g) ?? []).length;
      }
      if (externos) ob(a.nombre, 'Fórmulas', 'Formato', `${externos} fórmulas apuntan a otro libro de Excel (p. ej., '[1]Resumen de GG'). Al abrir el archivo en otra computadora los valores no se actualizan o se pierden.`, 'Vincular las hojas dentro del mismo libro, como hace el Excel que genera Expediente Pro.');
      if (hoy) ob(a.nombre, 'Fórmulas', 'Formato', `${hoy} celdas usan HOY()/AHORA(): la fecha del documento cambia cada vez que se abre.`, 'Escribir la fecha del documento como dato fijo (Configuración general → fecha del proyecto).');
      if (rotas) ob(a.nombre, 'Fórmulas', 'Formato', `El libro contiene ${rotas} referencias rotas (#REF!).`, 'Eliminar las hojas o fórmulas rotas antes de entregar.');
    } catch {
      /* no es un zip legible */
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer);
    const ocultas: string[] = [];
    for (const ws of wb.worksheets) {
      if (ws.state !== 'visible') { ocultas.push(ws.name); continue; }
      const t = leerHoja(ws);
      const crudo = t.slice(0, 14).flat().map(txt).join(' ');
      const titulo = norm(crudo);
      if (/US\$|\(\$\)|\bUSD\b/.test(crudo)) dolares = true;
      if (/gastos generales variables/.test(titulo) && !/resumen/.test(norm(ws.name))) {
        const d = leerGG(t); if (d) { gg.push({ grupo: 'variable', datos: d, hoja: ws.name }); hojas.push(`${a.nombre} › ${ws.name}: gastos generales variables`); }
        continue;
      }
      if (/gastos generales fijos/.test(titulo) && !/resumen/.test(norm(ws.name))) {
        const d = leerGG(t); if (d) { gg.push({ grupo: 'fijo', datos: d, hoja: ws.name }); hojas.push(`${a.nombre} › ${ws.name}: gastos generales fijos`); }
        continue;
      }
      if (/gastos financieros/.test(titulo) && !/resumen/.test(titulo)) {
        fin = leerFinancieros(t); hojas.push(`${a.nombre} › ${ws.name}: gastos financieros`);
        continue;
      }
      if (t.some((f) => /^partida\b/.test(norm(txt(f[0]))))) {
        const x = leerApus(t);
        if (x.length > apus.length) { apus = x; hojaApu = ws.name; }
        continue;
      }
      const pm = leerPlanillaMetrados(t);
      if (pm && pm.length) {
        if (!metr || pm.length > metr.lineas.length) metr = { lineas: pm, archivo: a.nombre, hoja: ws.name };
        continue;
      }
      const p = leerPresupuesto(t);
      if (p && p.lineas.some((l) => l.unidad)) {
        if (!ppto || p.lineas.filter((l) => l.unidad).length > ppto.lineas.filter((l) => l.unidad).length) ppto = { ...p, archivo: a.nombre, hoja: ws.name };
        continue;
      }
      // resumen de metrados (ÍTEM / DESCRIPCIÓN / UND / METRADO)
      const hR = buscarFila(t, (f) => filaTiene(f, /^item$/) && filaTiene(f, /^metrado$/));
      if (hR >= 0) {
        const cI = colDe(t[hR], /^item$/), cU = colDe(t[hR], /^(und|unid)/), cM = colDe(t[hR], /^metrado$/);
        resumenMetrado = t.slice(hR + 1).filter((f) => txt(f[cU]) && f[cI] !== null).map((f) => ({ codigo: codigoItem(f[cI]), total: numero(f[cM]) }));
      }
    }
    if (ocultas.length) ob(a.nombre, `${ocultas.length} hojas ocultas`, 'Formato', `El libro conserva ${ocultas.length} hojas ocultas de otros proyectos o versiones (${ocultas.slice(0, 6).join(', ')}${ocultas.length > 6 ? '…' : ''}).`, 'Eliminar las hojas que no forman parte del entregable; pueden contener vínculos rotos (#REF!) y datos de otros proyectos.');
  }
  if (ppto) hojas.unshift(`${ppto.archivo} › ${ppto.hoja}: presupuesto (${ppto.lineas.filter((l) => l.unidad).length} partidas)`);
  if (apus.length) hojas.push(`${hojaApu}: análisis de precios unitarios (${apus.length})`);
  if (metr) hojas.push(`${metr.archivo} › ${metr.hoja}: planilla de metrados (${metr.lineas.length} partidas)`);
  if (!ppto) throw new Error('No se encontró una hoja de presupuesto (encabezados Item, Descripción, Unid., Cant., Precio, Total).');

  // jornada de los APU: la que reproduce más cantidades (cantidad = cuadrilla × jornada ÷ rendimiento, al cuarto decimal)
  const CAND = [8, 10, 9, 12, 11, 8.5, 9.5, 7.5, 7, 6, 4];
  const coincide = (it: ItemApuLeido, rend: number, j: number) => Math.abs(redondear(((it.cuadrilla ?? 0) * j) / rend, 4) - it.cantidad) < 0.00006;
  const conCuadrilla = (a: ApuLeido) => (a.rendimiento > 0 ? a.items.filter((it) => (it.tipo === 'MO' || it.tipo === 'EQ') && (it.cuadrilla ?? 0) > 0 && !it.unidad.startsWith('%')) : []);
  if (!opciones.jornada) {
    const votos = CAND.map((j) => apus.reduce((n, a) => n + conCuadrilla(a).filter((it) => coincide(it, a.rendimiento, j)).length, 0));
    const max = Math.max(...votos);
    if (max > 0) jornada = CAND[votos.indexOf(max)];
  }
  const jornadaApu = new Map<string, number>();
  for (const a of apus) {
    const its = conCuadrilla(a);
    if (!its.length) continue;
    const votos = CAND.map((j) => its.filter((it) => coincide(it, a.rendimiento, j)).length);
    const max = Math.max(...votos);
    const j = votos[CAND.indexOf(jornada)] === max ? jornada : CAND[votos.indexOf(max)];
    if (j !== jornada && max > 0) jornadaApu.set(a.codigo, j);
  }
  for (const j of new Set(jornadaApu.values())) {
    const cods = [...jornadaApu.entries()].filter(([, x]) => x === j).map(([c]) => c);
    ob('Análisis de precios unitarios', `${cods.length} partidas`, 'Consistencia', `${cods.length} análisis calculan la mano de obra y el equipo con una jornada de ${j} h y los demás con ${jornada} h: ${cods.join(', ')}.`, `Se conservó la jornada de ${j} h en esos análisis (campo Jornada del APU) para reproducir los costos; confirme la jornada real de obra y úsela en todos.`);
  }

  // ---------------------------------------------------------- proyecto base
  const p = proyectoEnBlanco();
  p.gg = [];
  p.insumos = [];
  p.meta.nombre = ppto.proyecto || p.meta.nombre;
  p.meta.jornadaHoras = jornada;
  if (ppto.fecha) { p.meta.fechaBase = ppto.fecha; p.meta.fecha = ppto.fecha; }
  const ub = ppto.ubicacion;
  const dpto = ub.match(/DPTO\.?\s*:?\s*([A-ZÁÉÍÓÚÑ ]+?)(?=\s+PROV|\s*$)/i)?.[1]?.trim();
  const prov = ub.match(/PROV\.?\s*:?\s*([A-ZÁÉÍÓÚÑ ]+?)(?=\s+DIST|\s*$)/i)?.[1]?.trim();
  const dist = ub.match(/DIST\.?\s*:?\s*([A-ZÁÉÍÓÚÑ ]+?)\s*$/i)?.[1]?.trim();
  const tit = (s?: string) => (s ? s.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()) : '');
  if (dpto || prov || dist) { p.meta.departamento = tit(dpto); p.meta.provincia = tit(prov); p.meta.distrito = tit(dist); }
  else p.meta.ubicacion = ub;
  if (ppto.propietario) p.entidades.propietario.nombre = ppto.propietario;
  // encabezados de metrados y gastos generales: código, cliente, cliente final y consultor
  const cabs = [metr ? cabMetrados : {}, ...gg.map((g) => g.datos.cab)];
  const de = (k: string) => cabs.map((c) => c[k]).find((x) => x && x.trim()) ?? '';
  if (de('codigo')) p.meta.codigo = de('codigo');
  if (de('consultor')) p.entidades.proyectista.nombre = de('consultor');
  const cliente = de('cliente');
  const final = de('cliente final');
  if (final) { p.entidades.cliente.nombre = cliente; p.entidades.propietario.nombre = final; }
  else if (cliente && ppto.propietario && norm(cliente).includes(norm(ppto.propietario))) p.entidades.propietario.nombre = cliente;
  else if (cliente) p.entidades.cliente.nombre = cliente;
  if (ppto.pie.utilidadPct !== undefined) p.meta.utilidadPct = redondear(ppto.pie.utilidadPct, 4);
  p.meta.incluirIgv = ppto.pie.igv !== undefined;
  if (dolares || /d[oó]lar/i.test(String(ppto.son))) { p.meta.moneda = 'US$'; p.meta.monedaNombre = 'DÓLARES AMERICANOS'; }

  // ---------------------------------------------------------- partidas
  const porCodigo = new Map<string, Partida>();
  const vistos = new Set<string>();
  for (const l of ppto.lineas) {
    if (vistos.has(l.codigo)) {
      ob('Presupuesto', `Ítem ${l.codigo} (fila ${l.fila})`, 'Consistencia', `El ítem ${l.codigo} está repetido.`, 'Numerar cada ítem una sola vez.');
      continue;
    }
    vistos.add(l.codigo);
    const esPartida = !!l.unidad && l.metrado !== null;
    const pt: Partida = esPartida
      ? { id: uid('pt'), codigo: l.codigo, descripcion: l.descripcion, unidad: normalizarUnidad(l.unidad) }
      : { id: uid('pt'), codigo: l.codigo, descripcion: l.descripcion, unidad: '', titulo: true };
    p.partidas.push(pt);
    porCodigo.set(l.codigo, pt);
    if (l.descripcion !== l.descripcion.trim() || /\s{2,}/.test(l.descripcion)) ob('Presupuesto', `Ítem ${l.codigo}`, 'Formato', 'La descripción tiene espacios de más al inicio o entre palabras.', 'Quitar los espacios sobrantes.');
  }
  const hojasPpto = ppto.lineas.filter((l) => l.unidad && l.metrado !== null);
  const sinTitulo = p.partidas.filter((x) => !x.titulo && !x.codigo.includes('.'));
  if (sinTitulo.length) avisos.push(`${sinTitulo.length} partidas no están dentro de un título.`);

  // ---------------------------------------------------------- insumos y APU
  const registro = new Map<string, { codigo: string; descripcion: string; precio: number; unidad: string; tipo: TipoInsumo }[]>();
  const insumoDe = (it: ItemApuLeido): string => {
    const lista = registro.get(it.codigo) ?? [];
    const pct = it.unidad.startsWith('%');
    const igual = lista.find((x) => (pct ? x.unidad === it.unidad : Math.abs(x.precio - it.precio) < 0.0001 && x.unidad === it.unidad));
    if (igual) return igual.codigo;
    const codigo = lista.length ? `${it.codigo}-${lista.length + 1}` : it.codigo;
    if (lista.length) {
      ob('Relación de insumos', `Código ${it.codigo}`, 'Consistencia', `El insumo ${it.codigo} "${it.descripcion}" aparece con dos precios distintos (${lista.map((x) => x.precio).join(' y ')} / ${it.precio}).`, `Un código debe tener un solo precio. Se separó como ${codigo}; unifique el precio o asigne un código propio a la variante.`);
    }
    lista.push({ codigo, descripcion: it.descripcion, precio: it.precio, unidad: it.unidad, tipo: it.tipo });
    registro.set(it.codigo, lista);
    p.insumos.push({ codigo, descripcion: it.descripcion, unidad: it.unidad, tipo: it.tipo, precio: pct ? 0 : it.precio, iu: sugerirIU(it.descripcion, it.tipo, it.unidad), fuente: 'Expediente original', fechaPrecio: p.meta.fechaBase });
    return codigo;
  };
  const apuPorCodigo = new Map(apus.map((a) => [a.codigo, a]));
  for (const l of hojasPpto) {
    const pt = porCodigo.get(l.codigo)!;
    const a = apuPorCodigo.get(l.codigo);
    if (!a) {
      ob('Análisis de precios unitarios', `Partida ${l.codigo}`, 'Consistencia', `La partida ${l.codigo} ${l.descripcion} no tiene análisis de precio unitario.`, 'Agregar el APU de la partida.');
      p.apus[pt.id] = { rendimiento: 1, items: [] };
      continue;
    }
    if (a.descripcion && norm(a.descripcion) !== norm(l.descripcion)) ob('Análisis de precios unitarios', `Partida ${l.codigo}`, 'Consistencia', `La descripción del APU ("${a.descripcion}") no coincide con la del presupuesto ("${l.descripcion}").`, 'Usar la misma descripción en todos los documentos.');
    if (a.unidad && normalizarUnidad(a.unidad) !== normalizarUnidad(l.unidad)) ob('Análisis de precios unitarios', `Partida ${l.codigo}`, 'Consistencia', `Unidad del APU (${a.unidad}) distinta de la del presupuesto (${l.unidad}).`, 'Unificar la unidad de medida.');
    const items: ApuItem[] = [];
    const otraJornada: { d: string; j: number }[] = [];
    for (const it of a.items) {
      const codigo = insumoDe(it);
      if (it.unidad.startsWith('%')) items.push({ insumo: codigo, porcentaje: it.cantidad });
      else if ((it.tipo === 'MO' || it.tipo === 'EQ') && it.cuadrilla !== null && it.cuadrilla > 0 && a.rendimiento > 0 && coincide(it, a.rendimiento, jornadaApu.get(a.codigo) ?? jornada)) items.push({ insumo: codigo, cuadrilla: it.cuadrilla });
      else {
        items.push({ insumo: codigo, cantidad: it.cantidad });
        if ((it.tipo === 'MO' || it.tipo === 'EQ') && it.cuadrilla !== null && it.cuadrilla > 0 && a.rendimiento > 0)
          otraJornada.push({ d: it.descripcion, j: redondear((it.cantidad * a.rendimiento) / it.cuadrilla, 1) });
      }
      if (Math.abs(redondear(it.cantidad * it.precio, 2) - it.parcial) > 0.011 && !it.unidad.startsWith('%'))
        ob('Análisis de precios unitarios', `Partida ${l.codigo}, ${it.descripcion}`, 'Cálculo', `Parcial ${it.parcial} distinto de cantidad × precio (${redondear(it.cantidad * it.precio, 2)}).`, 'Revisar la fórmula del parcial.');
      if (it.tipo === 'MO' && /^d[ií]a$/i.test(it.unidad)) ob('Análisis de precios unitarios', `Partida ${l.codigo}, ${it.descripcion}`, 'Formato', 'Mano de obra expresada en días.', 'Expresar la mano de obra en horas-hombre (hh) con su cuadrilla, como el resto de recursos.');
    }
    if (otraJornada.length) {
      const js = [...new Set(otraJornada.map((x) => x.j))];
      ob(
        'Análisis de precios unitarios',
        `Partida ${l.codigo}`,
        'Cálculo',
        js.length === 1
          ? `La cantidad de ${otraJornada.length === 1 ? otraJornada[0].d : `${otraJornada.length} recursos (${otraJornada.map((x) => x.d).join(', ')})`} equivale a una jornada de ${js[0]} h, distinta de la del análisis (${jornadaApu.get(a.codigo) ?? jornada} h).`
          : `Las cantidades de ${otraJornada.map((x) => `${x.d} (≈${x.j} h)`).join(', ')} no resultan de cuadrilla × jornada ÷ rendimiento.`,
        'Usar la misma jornada en todos los APU (o ajustar el rendimiento). Se conservaron las cantidades originales como valores fijos.',
      );
    }
    const apu: Apu = { rendimiento: a.rendimiento || 1, items, ...(jornadaApu.has(a.codigo) ? { jornada: jornadaApu.get(a.codigo)! } : {}) };
    p.apus[pt.id] = apu;
    if (!a.rendimiento) ob('Análisis de precios unitarios', `Partida ${l.codigo}`, 'Formato', 'El APU no indica el rendimiento.', 'Indicar el rendimiento diario de la cuadrilla.');
  }
  const sinUso = apus.filter((a) => !porCodigo.has(a.codigo));
  for (const a of sinUso) ob('Análisis de precios unitarios', `Partida ${a.codigo}`, 'Consistencia', `Hay un APU para ${a.codigo} ${a.descripcion} que no figura en el presupuesto.`, 'Eliminar el APU sobrante o agregar la partida.');

  // ---------------------------------------------------------- metrados
  const hojasP = p.partidas.filter((x) => !x.titulo);
  const lineaPpto = new Map(hojasPpto.map((l) => [l.codigo, l]));
  if (metr) {
    const pm = metr.lineas;
    if (pm.length !== hojasP.length) ob('Planilla de metrados', metr.hoja, 'Consistencia', `La planilla tiene ${pm.length} partidas y el presupuesto ${hojasP.length}.`, 'La planilla debe tener las mismas partidas que el presupuesto.');
    let k = 0;
    for (const pt of hojasP) {
      // emparejar en orden, con tolerancia por descripción
      let j = -1;
      for (let s = k; s < Math.min(pm.length, k + 4); s++) if (similitud(pm[s].descripcion, pt.descripcion) >= 0.34 || s === k) { j = s; if (similitud(pm[s].descripcion, pt.descripcion) >= 0.34) break; }
      const m = j >= 0 ? pm[j] : undefined;
      const lp = lineaPpto.get(pt.codigo)!;
      if (!m) { p.metrados.push({ id: uid('m'), partidaId: pt.id, descripcion: 'Metrado del presupuesto', referencia: '', cantidad: lp.metrado }); continue; }
      k = j + 1;
      if (m.codigo !== pt.codigo) ob('Planilla de metrados', `Ítem ${m.codigo} ↔ ${pt.codigo}`, 'Formato', `La numeración de la planilla (${m.codigo}) no coincide con la del presupuesto (${pt.codigo}).`, 'Usar la misma codificación del presupuesto (01.01.01).');
      if (norm(m.descripcion) !== norm(pt.descripcion)) ob('Planilla de metrados', `Ítem ${m.codigo}`, 'Consistencia', `Descripción distinta: planilla "${m.descripcion}" / presupuesto "${pt.descripcion}".`, 'Usar la misma descripción en la planilla, el presupuesto, el APU, las EETT y el cronograma.');
      if (m.unidad && normalizarUnidad(m.unidad) !== pt.unidad) ob('Planilla de metrados', `Ítem ${m.codigo}`, 'Consistencia', `Unidad distinta: planilla ${m.unidad} / presupuesto ${pt.unidad}.`, 'Unificar la unidad de medida; se usó la del presupuesto.');
      const lineas: MetradoFila[] = m.lineas.map((x) => ({ id: uid('m'), partidaId: pt.id, descripcion: x.descripcion, referencia: x.referencia, veces: x.veces, cantidad: x.cantidad, factor: x.factor, largo: x.largo, ancho: x.ancho, alto: x.alto, area: x.area, volumen: x.volumen }));
      if (!lineas.length) lineas.push({ id: uid('m'), partidaId: pt.id, descripcion: 'Metrado según planilla', referencia: '', cantidad: m.total ?? lp.metrado });
      p.metrados.push(...lineas);
      const tot = m.total ?? null;
      if (tot !== null && lp.metrado !== null && Math.abs(redondear(tot, 2) - lp.metrado) > 0.005) ob('Planilla de metrados', `Ítem ${m.codigo}`, 'Consistencia', `Metrado de la planilla (${redondear(tot, 4)}) distinto del presupuesto (${lp.metrado}).`, 'El presupuesto debe tomar el metrado total de la planilla.');
      if (tot !== null && Math.abs(tot - redondear(tot, 2)) > 1e-9) ob('Planilla de metrados', `Ítem ${m.codigo}`, 'Formato', `Metrado total sin redondear (${tot}).`, 'Redondear el metrado total a dos decimales, como se usa en el presupuesto.');
      if (m.lineas.some((x) => x.factor !== null && x.factor !== 1)) ob('Planilla de metrados', `Ítem ${m.codigo}`, 'Información', `Se aplica un factor ${m.lineas.find((x) => x.factor !== 1)?.factor} (esponjamiento o desperdicio).`, 'Indicar en la referencia el origen del factor.');
    }
  } else {
    for (const pt of hojasP) p.metrados.push({ id: uid('m'), partidaId: pt.id, descripcion: 'Metrado del presupuesto', referencia: '', cantidad: lineaPpto.get(pt.codigo)?.metrado ?? null });
    avisos.push('No se encontró la planilla de metrados: cada partida toma su metrado del presupuesto.');
  }
  for (const r of resumenMetrado) void r;

  // ---------------------------------------------------------- gastos generales
  const cdOriginal = ppto.pie.costoDirecto ?? 0;
  let plazoMesesOriginal: number | null = null;
  for (const g of gg) {
    plazoMesesOriginal = plazoMesesOriginal ?? g.datos.plazo;
    for (const f of g.datos.filas) {
      const inc = f.inc ?? 1;
      const q1 = f.q1 ?? 1;
      const q2 = f.q2 ?? 1;
      const pu = f.pu ?? 0;
      const parcial = f.parcial ?? 0;
      let item: GGItem;
      const base: Omit<GGItem, 'unidad' | 'cantidad' | 'duracion' | 'precio' | 'participacion'> = { id: uid('gg'), grupo: g.grupo, rubro: f.rubro ? f.rubro.charAt(0) + f.rubro.slice(1).toLowerCase() : 'Varios', descripcion: f.descripcion, ligadoAlPlazo: false };
      if (cdOriginal && Math.abs(pu - cdOriginal) < 0.011) {
        item = { ...base, unidad: '%CD', cantidad: redondear(inc * q1 * q2 * 100, 6), duracion: 1, precio: 0, participacion: 100 };
      } else if (Math.abs(inc * q1 * q2 * pu - parcial) <= 0.011) {
        item = { ...base, unidad: f.unidad.toLowerCase(), cantidad: q1, duracion: q2, precio: pu, participacion: redondear(inc * 100, 6) };
      } else if (Math.abs(q1 * q2 * pu - parcial) <= 0.011) {
        item = { ...base, unidad: f.unidad.toLowerCase(), cantidad: q1, duracion: q2, precio: pu, participacion: 100 };
        ob(`Gastos generales (${g.hoja})`, `Fila ${f.fila}: ${f.descripcion}`, 'Cálculo', `La incidencia (${inc}) no interviene en el parcial; el parcial es cantidad × meses × precio.`, 'Usar la misma fórmula en todas las filas o dejar la incidencia en 100 %.');
      } else {
        item = { ...base, unidad: f.unidad.toLowerCase(), cantidad: 1, duracion: 1, precio: parcial, participacion: 100 };
        ob(`Gastos generales (${g.hoja})`, `Fila ${f.fila}: ${f.descripcion}`, 'Cálculo', `El parcial (${parcial}) no resulta del producto de sus columnas.`, 'Revisar la fórmula; se importó el parcial como monto global.');
      }
      if (g.grupo === 'variable' && plazoMesesOriginal && /^mes$/i.test(f.unidad) && Math.abs(q2 - plazoMesesOriginal) < 0.0001 && item.unidad !== '%CD') item.ligadoAlPlazo = true;
      if (Math.abs(parcial - redondear(parcial, 2)) > 1e-9) ob(`Gastos generales (${g.hoja})`, `Fila ${f.fila}: ${f.descripcion}`, 'Formato', `Parcial sin redondear (${parcial}).`, 'Redondear cada parcial a dos decimales para que la suma coincida con lo impreso.');
      p.gg.push(item);
    }
    const codigos = g.datos.filas.map((x) => x.codigo).filter(Boolean);
    const rep = codigos.filter((c, i) => codigos.indexOf(c) !== i);
    for (const c of new Set(rep)) ob(`Gastos generales (${g.hoja})`, `Ítem ${c}`, 'Formato', `El ítem ${c} está numerado dos veces.`, 'Numerar los ítems en forma correlativa.');
  }
  if (fin && (fin.costo !== null || fin.tasa !== null)) {
    const pct = fin.tasa !== null && fin.comision !== null ? fin.tasa * fin.comision * ((fin.periodo ?? 1) / 12) * 100 : null;
    p.gg.push(
      pct !== null
        ? { id: uid('gg'), grupo: 'financiero', rubro: 'Garantías', descripcion: `Carta fianza de fiel cumplimiento (${redondear(fin.tasa! * 100, 2)} % del monto, comisión ${redondear(fin.comision! * 100, 2)} % anual, ${fin.periodo ?? 1} mes(es))`, unidad: '%CD', cantidad: redondear(pct, 6), duracion: 1, precio: 0, participacion: 100 }
        : { id: uid('gg'), grupo: 'financiero', rubro: 'Garantías', descripcion: 'Costo financiero', unidad: 'glb', cantidad: 1, duracion: 1, precio: fin.costo ?? 0, participacion: 100 },
    );
  }
  if (!gg.length) {
    avisos.push('No se encontró el desagregado de gastos generales: se aplica el porcentaje del pie del presupuesto como gasto fijo.');
    if (ppto.pie.gg) p.gg.push({ id: uid('gg'), grupo: 'fijo', rubro: 'Gastos generales', descripcion: 'Gastos generales del presupuesto original', unidad: 'glb', cantidad: 1, duracion: 1, precio: ppto.pie.gg, participacion: 100 });
  }

  // ---------------------------------------------------------- cronograma
  if (msp) {
    const tareas = msp.tareas.filter((x) => x.nivel > 0);
    if (msp.laborables?.length) p.meta.diasLaborables = msp.laborables;
    const inicio = msp.inicio ?? tareas.map((x) => x.inicio).sort()[0];
    if (inicio) p.meta.fechaInicio = inicio;
    // ruta de cada tarea (nombres de sus resúmenes)
    const ruta = new Map<string, string[]>();
    const pila: TareaMsp[] = [];
    for (const t of tareas) {
      while (pila.length && pila[pila.length - 1].nivel >= t.nivel) pila.pop();
      ruta.set(t.uid, pila.map((x) => x.nombre));
      if (t.resumen) pila.push(t);
    }
    const hojasMsp = tareas.filter((x) => !x.resumen && !(x.hito && x.duracionDias === 0));
    const usadas = new Set<string>();
    const mapa = new Map<string, string>(); // uid tarea → id partida
    // secciones: el nivel de títulos más alto que tenga más de un título (p. ej., BD-SC-19, BD-SC-20…)
    const titulos = p.partidas.filter((x) => x.titulo);
    const niveles = [...new Set(titulos.map((x) => x.codigo.split('.').length))].sort((x, y) => x - y);
    const nivelSec = niveles.find((n) => titulos.filter((x) => x.codigo.split('.').length === n).length > 1) ?? 1;
    const secciones = titulos.filter((x) => x.codigo.split('.').length === nivelSec);
    const resumenes = tareas.map((t, i) => ({ t, i })).filter((x) => x.t.resumen);
    const rangoSeccion = new Map<string, [number, number]>(); // código de sección → índices de tareas
    for (const sec of secciones) {
      let mejor: { i: number; s: number } | null = null;
      for (const r of resumenes) {
        const sm = similitud(sec.descripcion, r.t.nombre);
        if (sm >= 0.5 && (!mejor || sm > mejor.s)) mejor = { i: r.i, s: sm };
      }
      if (!mejor) continue;
      let fin = mejor.i + 1;
      while (fin < tareas.length && tareas[fin].nivel > tareas[mejor.i].nivel) fin++;
      rangoSeccion.set(sec.codigo, [mejor.i, fin]);
    }
    const idxTarea = new Map(tareas.map((t, i) => [t.uid, i]));
    const titulosDe = (pt: Partida) => p.partidas.filter((x) => x.titulo && pt.codigo.startsWith(x.codigo + '.') && x.codigo.includes('.')).map((x) => x.descripcion);
    const candidatos = (pt: Partida) => {
      const sec = secciones.find((x) => pt.codigo.startsWith(x.codigo + '.'));
      const rango = sec ? rangoSeccion.get(sec.codigo) : undefined;
      return hojasMsp.filter((t) => !usadas.has(t.uid) && (!rango || (idxTarea.get(t.uid)! > rango[0] && idxTarea.get(t.uid)! < rango[1])));
    };
    const asignar = (pt: Partida, t: TareaMsp) => {
      usadas.add(t.uid);
      mapa.set(t.uid, pt.id);
      const esp = (x: string) => x.match(/e\s*=\s*([\d.]+)\s*(cm|m)\b/i)?.slice(1, 3).join('');
      if (esp(t.nombre) && esp(pt.descripcion) && esp(t.nombre) !== esp(pt.descripcion))
        ob('Cronograma (MS Project)', `Tarea "${t.nombre}"`, 'Consistencia', `El espesor del cronograma (e=${esp(t.nombre)}) no coincide con el del presupuesto y el APU de la partida ${pt.codigo} (e=${esp(pt.descripcion)}).`, 'Corregir la descripción: el espesor debe ser el mismo en planos, metrados, presupuesto, EETT y cronograma.');
      else if (norm(t.nombre.replace(/\s\d+$/, '')) !== norm(pt.descripcion)) ob('Cronograma (MS Project)', `Tarea "${t.nombre}"`, 'Consistencia', `El nombre de la tarea no coincide con la partida ${pt.codigo} "${pt.descripcion}".`, 'Usar en el cronograma la misma codificación y descripción del presupuesto.');
    };
    // 1.ª pasada: coincidencia clara de nombres dentro de la sección
    for (const pt of hojasP) {
      const ts = titulosDe(pt);
      const padreP = ts[ts.length - 1] ?? '';
      let mejor: TareaMsp | null = null;
      let puntaje = 0;
      for (const t of candidatos(pt)) {
        const r = ruta.get(t.uid) ?? [];
        const ctx = padreP && r.length ? similitud(padreP, r[r.length - 1]) : 0;
        const sm = similitud(pt.descripcion, t.nombre.replace(/\s\d+$/, '')) * 0.8 + ctx * 0.2;
        if (sm > puntaje) { puntaje = sm; mejor = t; }
      }
      if (mejor && puntaje >= 0.45) asignar(pt, mejor);
    }
    // 2.ª pasada: completar huecos respetando el orden (p. ej., "Mejoramiento de la revegetación")
    const partidaDe = new Map([...mapa.entries()].map(([u, id]) => [id, u]));
    hojasP.forEach((pt, k) => {
      if (partidaDe.has(pt.id)) return;
      const antes = hojasP.slice(0, k).reverse().find((x) => partidaDe.has(x.id));
      const despues = hojasP.slice(k + 1).find((x) => partidaDe.has(x.id));
      const desde = antes ? idxTarea.get(partidaDe.get(antes.id)!)! : -1;
      const hasta = despues ? idxTarea.get(partidaDe.get(despues.id)!)! : tareas.length;
      const hueco = candidatos(pt).filter((t) => idxTarea.get(t.uid)! > desde && idxTarea.get(t.uid)! < hasta);
      const huecoP = hojasP.slice(k).filter((x) => !partidaDe.has(x.id) && (!despues || hojasP.indexOf(x) < hojasP.indexOf(despues)));
      const mejor = hueco.map((t) => ({ t, s: similitud(pt.descripcion, t.nombre) })).sort((x, y) => y.s - x.s)[0];
      void huecoP;
      if (mejor && mejor.s >= 0.15) {
        asignar(pt, mejor.t);
        partidaDe.set(pt.id, mejor.t.uid);
      }
    });
    for (const pt of hojasP) if (!partidaDe.has(pt.id)) ob('Cronograma (MS Project)', `Partida ${pt.codigo}`, 'Consistencia', `La partida ${pt.codigo} ${pt.descripcion} no tiene actividad en el cronograma.`, 'Programar todas las partidas del presupuesto.');
    for (const t of hojasMsp) if (!usadas.has(t.uid)) ob('Cronograma (MS Project)', `Tarea "${t.nombre}"`, 'Consistencia', 'Actividad del cronograma sin partida en el presupuesto (o partida programada dos veces).', 'Cada actividad debe corresponder a una partida del presupuesto.');
    // resolver predecesoras: resumen → su primera tarea con partida; tarea sin partida → la anterior con partida
    const porUid = new Map(tareas.map((t, i) => [t.uid, i]));
    const resolver = (u: string, prof = 0): string | null => {
      if (prof > 30) return null;
      if (mapa.has(u)) return mapa.get(u)!;
      const i = porUid.get(u);
      if (i === undefined) return null;
      const t = tareas[i];
      if (t.resumen) {
        for (let k = i + 1; k < tareas.length && tareas[k].nivel > t.nivel; k++) if (mapa.has(tareas[k].uid)) return mapa.get(tareas[k].uid)!;
        return null;
      }
      if (t.hito && t.duracionDias === 0) return t.preds.length ? resolver(t.preds[0].uid, prof + 1) : null;
      for (const pr of t.preds) { const r = resolver(pr.uid, prof + 1); if (r) return r; }
      return null;
    };
    let previo: string | null = null;
    for (const pt of hojasP) {
      const uidT = [...mapa.entries()].find(([, v]) => v === pt.id)?.[0];
      const t = uidT ? tareas[porUid.get(uidT)!] : undefined;
      if (t) {
        const preds = t.preds
          .map((x) => ({ id: resolver(x.uid), tipo: (x.tipo === 'CF' ? 'CC' : x.tipo) as TipoPred, desfase: x.desfase }))
          .filter((x): x is { id: string; tipo: TipoPred; desfase: number } => !!x.id && x.id !== pt.id);
        p.programa[pt.id] = { cuadrillas: 1, duracionManual: Math.max(1, Math.round(t.duracionDias)), predecesoras: preds.filter((x, i) => preds.findIndex((y) => y.id === x.id) === i) };
      } else {
        p.programa[pt.id] = { cuadrillas: 1, duracionManual: null, predecesoras: previo ? [{ id: previo, tipo: 'CC', desfase: 0 }] : [] };
      }
      previo = pt.id;
    }
    const finMsp = tareas.map((x) => x.fin).sort().pop();
    if (inicio && finMsp) {
      const dias = Math.round((Date.parse(finMsp) - Date.parse(inicio)) / 86400000) + 1;
      plazoMesesOriginal = plazoMesesOriginal ?? redondear(dias / 30, 2);
      (ppto.pie as ControlImportacion).plazoDias = dias;
    }
  } else {
    avisos.push('No se cargó el cronograma: cada partida dura lo que resulta de su metrado y rendimiento, una después de otra.');
    let previo: string | null = null;
    for (const pt of hojasP) {
      p.programa[pt.id] = { cuadrillas: 1, duracionManual: null, predecesoras: previo ? [{ id: previo, tipo: 'FC', desfase: 0 }] : [] };
      previo = pt.id;
    }
  }

  // ---------------------------------------------------------- especificaciones técnicas
  for (const e of eett) {
    const { asignadas } = aplicarEett(p, e.lectura, obs, `Especificaciones técnicas (${e.nombre})`);
    avisos.push(`${e.nombre}: ${asignadas} especificaciones copiadas a sus partidas.`);
  }

  // ---------------------------------------------------------- comparación con el original
  const r = calcularTodo(p);
  for (const f of r.hojas) {
    const l = lineaPpto.get(f.partida.codigo);
    if (!l) continue;
    if (l.precio !== null && Math.abs(f.pu - l.precio) > 0.005) {
      const a = apuPorCodigo.get(f.partida.codigo);
      ob('Análisis de precios unitarios', `Partida ${f.partida.codigo}`, 'Cálculo', `Costo unitario recalculado ${f.pu} distinto del original ${l.precio}${a?.pu !== null && a?.pu !== undefined && a.pu !== l.precio ? ` (el APU dice ${a.pu})` : ''}.`, 'Revisar redondeos y cantidades del APU.');
    }
    if (l.parcial !== null && l.metrado !== null && l.precio !== null && Math.abs(redondear(l.metrado * l.precio, 2) - l.parcial) > 0.011) ob('Presupuesto', `Ítem ${l.codigo}`, 'Cálculo', `Parcial ${l.parcial} distinto de metrado × precio (${redondear(l.metrado * l.precio, 2)}).`, 'Revisar la fórmula del parcial.');
  }
  const cd = ppto.pie.costoDirecto;
  if (cd !== undefined && Math.abs(cd - r.pie.costoDirecto) > 0.011) ob('Presupuesto', 'Costo directo', 'Cálculo', `Costo directo recalculado ${r.pie.costoDirecto} distinto del original ${cd}.`, 'Revisar parciales y subtotales.');
  if (ppto.pie.gg !== undefined && Math.abs(ppto.pie.gg - redondear(ppto.pie.gg, 2)) > 1e-9) ob('Presupuesto', 'Pie de presupuesto', 'Formato', `Los gastos generales del pie no están redondeados (${ppto.pie.gg}).`, 'Redondear a dos decimales: el subtotal impreso no coincide con la suma de las cifras impresas.');
  if (ppto.pie.subtotal !== undefined && Math.abs(ppto.pie.subtotal - redondear(ppto.pie.subtotal, 2)) > 1e-9) ob('Presupuesto', 'Pie de presupuesto', 'Formato', `El subtotal no está redondeado (${ppto.pie.subtotal}).`, 'Redondear a dos decimales.');
  if (ppto.son && !/(soles|dolares|dólares)/i.test(ppto.son)) ob('Presupuesto', 'Monto en letras', 'Formato', `El monto en letras no indica la moneda ("${ppto.son}").`, `Escribir la moneda: ${r.pie.total ? `SON: … ${p.meta.monedaNombre}` : ''}.`);
  if (ppto.son && /trecientos/i.test(ppto.son)) ob('Presupuesto', 'Monto en letras', 'Formato', 'Falta de ortografía en el monto en letras ("trecientos").', 'Corregir a "trescientos" (Expediente Pro escribe el monto en letras automáticamente).');
  if (!p.meta.incluirIgv) ob('Presupuesto', 'Pie de presupuesto', 'Información', 'El presupuesto termina en el subtotal, sin IGV.', 'Indicar expresamente "sin IGV" en el total o agregar el IGV.');
  const tipos = new Map<TipoInsumo, number>();
  for (const i of p.insumos) tipos.set(i.tipo, (tipos.get(i.tipo) ?? 0) + 1);
  avisos.push(`Importado: ${hojasP.length} partidas, ${p.partidas.length - hojasP.length} títulos, ${p.insumos.length} insumos (${[...tipos.entries()].map(([t, n]) => `${n} de ${TIPO_TXT[t]}`).join(', ')}), ${p.gg.length} gastos generales.`);
  const original = { costoDirecto: cd, gg: ppto.pie.gg, utilidad: ppto.pie.utilidad, subtotal: ppto.pie.subtotal, plazoDias: (ppto.pie as ControlImportacion).plazoDias };
  p.origen = { fecha: new Date().toISOString().slice(0, 10), archivos: archivos.map((a) => a.nombre), hojas, original, observaciones: obs };
  return { proyecto: p, avisos, observaciones: obs, original, hojas };
}

export type { Insumo };
