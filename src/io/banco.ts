// Formatos del banco de datos: .epdb (ZIP con un JSON por tabla y un manifiesto con suma de comprobación), Excel editable y
// reimportable, CSV por tabla, y lectura de fuentes externas (S10, Delphin, PowerCost, listas de precios, proyectos).
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  type Banco, bancoDesdeProyecto, type InsumoBanco, bancoVacio, canonico, FUENTES_PRECIO, type FuentePrecio, normalizarBanco, ordenarBanco, resumenBanco, sumaComprobacion,
  TABLAS, type Tabla,
} from '../engine/banco';
import type { ApuItem, Proyecto, TipoInsumo } from '../engine/types';
import { num } from '../engine/util';
import { leerJson } from './estructura';
import { importarExpediente } from './importarExpediente';
import { migrarProyecto } from './migrar';
import { importarPlantilla } from './plantilla';

export const FORMATO_EPDB = 'expediente-pro-banco';

export interface Manifiesto {
  formato: typeof FORMATO_EPDB;
  version: 1;
  programa: string;
  fecha: string;
  conteos: Record<Tabla, number>;
  sumas: Record<Tabla, string>;
  proyectos?: number; // respaldo completo: proyectos y versiones incluidos
  copias?: number;
}

/** Contenido de un .epdb: el banco y, si es un respaldo completo, los proyectos y sus versiones (tal como se guardan). */
export interface ContenidoEpdb {
  banco: Banco;
  proyectos?: unknown[];
  copias?: unknown[];
}

const sumas = (b: Banco) => Object.fromEntries(TABLAS.map(({ id }) => [id, sumaComprobacion(canonico(b[id]))])) as Record<Tabla, string>;

export async function escribirEpdb(c: ContenidoEpdb, programa = 'Expediente Pro'): Promise<Uint8Array> {
  const b = ordenarBanco(c.banco);
  const zip = new JSZip();
  const m: Manifiesto = { formato: FORMATO_EPDB, version: 1, programa, fecha: new Date().toISOString(), conteos: resumenBanco(b), sumas: sumas(b) };
  for (const { id } of TABLAS) zip.file(`banco/${id}.json`, JSON.stringify(b[id], null, 1));
  if (c.proyectos) {
    m.proyectos = c.proyectos.length;
    zip.file('proyectos.json', JSON.stringify(c.proyectos));
  }
  if (c.copias) {
    m.copias = c.copias.length;
    zip.file('versiones.json', JSON.stringify(c.copias));
  }
  zip.file('manifiesto.json', JSON.stringify(m, null, 2));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

/** Lee un .epdb y comprueba sus conteos y sumas; una tabla alterada da error. */
export async function leerEpdb(datos: Uint8Array | ArrayBuffer): Promise<ContenidoEpdb & { manifiesto: Manifiesto }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(datos);
  } catch {
    throw new Error('El archivo .epdb está dañado o incompleto (no es un ZIP).');
  }
  const leer = async (n: string) => { const f = zip.file(n); return f ? leerJson(await f.async('string'), n) : undefined; };
  const m = (await leer('manifiesto.json')) as Manifiesto | undefined;
  if (!m || m.formato !== FORMATO_EPDB) throw new Error('El archivo no es un banco de datos de Expediente Pro (falta manifiesto.json).');
  const crudo = bancoVacio() as unknown as Record<string, unknown>;
  for (const { id } of TABLAS) crudo[id] = (await leer(`banco/${id}.json`)) ?? [];
  const banco = normalizarBanco(crudo);
  const s = sumas(ordenarBanco(banco));
  const malas = TABLAS.filter(({ id }) => m.sumas?.[id] && m.sumas[id] !== s[id]).map((t) => t.nombre);
  if (malas.length) throw new Error(`El archivo .epdb fue modificado o está dañado: no cuadra la suma de comprobación de ${malas.join(', ')}.`);
  const proyectos = (await leer('proyectos.json')) as unknown[] | undefined;
  const copias = (await leer('versiones.json')) as unknown[] | undefined;
  return { banco, manifiesto: m, ...(proyectos ? { proyectos } : {}), ...(copias ? { copias } : {}) };
}

// ------------------------------------------------------------ columnas de Excel y CSV

type Fila = Record<string, unknown>;
interface Columna {
  titulo: string;
  ancho?: number;
  leer: (f: Fila) => string | number | null;
  escribir: (f: Fila, v: string) => void;
}

const txt = (k: string, titulo: string, ancho = 14): Columna => ({ titulo, ancho, leer: (f) => (f[k] === undefined || f[k] === null ? '' : String(f[k])), escribir: (f, v) => { if (v !== '') f[k] = v; } });
const nro = (k: string, titulo: string, ancho = 12): Columna => ({
  titulo, ancho, leer: (f) => (typeof f[k] === 'number' ? (f[k] as number) : null),
  escribir: (f, v) => { if (v !== '') { const n = num(v.replace(',', '.'), NaN); if (Number.isFinite(n)) f[k] = n; } },
});
const json = (k: string, titulo: string): Columna => ({ titulo, ancho: 50, leer: (f) => (f[k] === undefined ? '' : JSON.stringify(f[k])), escribir: (f, v) => { if (v) f[k] = JSON.parse(v); } });

/** Renglones de un APU en texto: «MO02 c=1; MA01 q=0.25; EQ01 %=3». */
export function textoRenglones(items: ApuItem[]): string {
  return items.map((i) => [i.insumo, i.cuadrilla != null ? `c=${i.cuadrilla}` : '', i.cantidad != null ? `q=${i.cantidad}` : '', i.porcentaje != null ? `%=${i.porcentaje}` : ''].filter(Boolean).join(' ')).join('; ');
}
export function leerRenglones(t: string): ApuItem[] {
  return t.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [insumo, ...resto] = s.split(/\s+/);
    const it: ApuItem = { insumo };
    for (const r of resto) {
      const [k, v] = r.split('=');
      const n = num(v?.replace(',', '.'), NaN);
      if (!Number.isFinite(n)) continue;
      if (k === 'c') it.cuadrilla = n;
      else if (k === 'q') it.cantidad = n;
      else if (k === '%') it.porcentaje = n;
    }
    return it;
  });
}

const fuenteTexto = (v: string): FuentePrecio => (FUENTES_PRECIO.find((f) => f.valor === v || f.texto.toLowerCase() === v.toLowerCase())?.valor ?? 'otro');

export const COLUMNAS: Record<Tabla, Columna[]> = {
  insumos: [txt('codigo', 'Código', 10), txt('descripcion', 'Descripción', 44), txt('unidad', 'Unidad', 8), txt('tipo', 'Tipo (MO, MAT, EQ, SC)', 10), txt('iu', 'IU', 6), txt('grupo', 'Grupo'), nro('pesoKg', 'Peso (kg)'), nro('plazoCompraDias', 'Anticipación de compra (días)')],
  precios: [
    txt('insumo', 'Insumo', 10), nro('precio', 'Precio sin IGV'), txt('moneda', 'Moneda', 7), txt('fecha', 'Fecha (aaaa-mm-dd)', 12), txt('lugar', 'Lugar'),
    { titulo: 'Fuente', ancho: 16, leer: (f) => FUENTES_PRECIO.find((x) => x.valor === f.fuente)?.texto ?? String(f.fuente ?? ''), escribir: (f, v) => { f.fuente = fuenteTexto(v); } },
    txt('referencia', 'Referencia (revista, proveedor u obra)', 30), txt('proveedorRuc', 'RUC del proveedor', 13), nro('vigenciaDias', 'Vigencia (días)'),
  ],
  analisis: [
    txt('codigo', 'Código', 18), txt('descripcion', 'Descripción', 44), txt('unidad', 'Unidad', 8), txt('especialidad', 'Especialidad', 20), nro('rendimiento', 'Rendimiento (und/día)'), nro('jornada', 'Jornada (h)'), nro('duracionManual', 'Duración fija (días)'),
    { titulo: 'Renglones (insumo c=cuadrilla q=cantidad %=porcentaje; …)', ancho: 70, leer: (f) => textoRenglones((f.items as ApuItem[]) ?? []), escribir: (f, v) => { f.items = leerRenglones(v); } },
  ],
  cuadrillas: [
    txt('nombre', 'Nombre', 30), txt('descripcion', 'Descripción', 30),
    { titulo: 'Composición (insumo cuadrilla; …)', ancho: 50, leer: (f) => ((f.items as { insumo: string; cuadrilla: number }[]) ?? []).map((i) => `${i.insumo} ${i.cuadrilla}`).join('; '), escribir: (f, v) => { f.items = v.split(';').map((s) => s.trim().split(/\s+/)).filter((x) => x[0]).map(([insumo, c]) => ({ insumo, cuadrilla: num(c?.replace(',', '.'), 1) })); } },
  ],
  plantillas: [txt('clave', 'Clave', 24), txt('tipo', 'Tipo (eett, gg, calendario, documento)', 12), txt('nombre', 'Nombre', 30), json('datos', 'Contenido (JSON)')],
  proveedores: [
    txt('ruc', 'RUC', 13), txt('razonSocial', 'Razón social', 34), txt('contacto', 'Contacto', 20), txt('telefono', 'Teléfono'), txt('correo', 'Correo', 24),
    { titulo: 'Rubros (separados por ;)', ancho: 30, leer: (f) => ((f.rubros as string[]) ?? []).join('; '), escribir: (f, v) => { f.rubros = v.split(';').map((s) => s.trim()).filter(Boolean); } },
    json('cotizaciones', 'Cotizaciones (JSON)'),
  ],
};

const filaDe = (t: Tabla, valores: string[]) => {
  const f: Fila = {};
  COLUMNAS[t].forEach((c, i) => c.escribir(f, (valores[i] ?? '').trim()));
  return f;
};

// ------------------------------------------------------------ Excel

const NOMBRE_HOJA = Object.fromEntries(TABLAS.map((t) => [t.id, t.nombre])) as Record<Tabla, string>;

export async function exportarBancoXlsx(b: Banco): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Expediente Pro';
  for (const { id } of TABLAS) {
    const ws = wb.addWorksheet(NOMBRE_HOJA[id], { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = COLUMNAS[id].map((c) => ({ header: c.titulo, width: c.ancho ?? 14 }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
    for (const f of ordenarBanco(b)[id] as unknown as Fila[]) ws.addRow(COLUMNAS[id].map((c) => c.leer(f)));
  }
  const ws = wb.addWorksheet('Léame');
  ws.getColumn(1).width = 110;
  for (const l of [
    'Banco de datos de Expediente Pro. Cada hoja es una tabla; se puede editar y volver a importar desde «Banco de datos › Importar».',
    'Antes de escribir, el programa muestra los registros nuevos, iguales y en conflicto para elegir qué conservar.',
    'Claves: Insumos por código; Precios por insumo + fecha + lugar + fuente; Análisis por código; Cuadrillas por nombre; Plantillas por clave; Proveedores por RUC.',
    'Precios sin IGV. Fuente: Cotización, Revista, Lista de proveedor, Proyecto u obra u Otra.',
  ]) ws.addRow([l]);
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** Texto de una celda de Excel (fórmulas con su resultado, texto enriquecido, fechas como aaaa-mm-dd). */
export function textoCelda(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (o.result !== undefined) return textoCelda(o.result as ExcelJS.CellValue);
    if (o.richText) return o.richText.map((x) => x.text).join('');
    if (o.text !== undefined) return String(o.text);
  }
  return String(v).trim();
}

/** Filas de una hoja como texto (desde la primera columna). */
export function filasHoja(ws: ExcelJS.Worksheet, columnas = 0): string[][] {
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const n = Math.max(row.cellCount, columnas);
    const vals: string[] = [];
    for (let i = 1; i <= n; i++) vals.push(textoCelda(row.getCell(i).value));
    out.push(vals);
  });
  return out;
}

const abrirLibro = async (datos: Uint8Array | ArrayBuffer) => {
  const wb = new ExcelJS.Workbook();
  const ab = datos instanceof Uint8Array ? datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) : datos;
  await wb.xlsx.load(ab as ArrayBuffer);
  return wb;
};

/** Verdadero si el libro es un banco exportado por el programa (hojas y encabezados propios). */
const esLibroBanco = (wb: ExcelJS.Workbook) => TABLAS.some(({ id }) => {
  const ws = wb.getWorksheet(NOMBRE_HOJA[id]);
  return !!ws && textoCelda(ws.getRow(1).getCell(1).value) === COLUMNAS[id][0].titulo;
});

function bancoDeLibro(wb: ExcelJS.Workbook): Banco {
  const crudo = bancoVacio() as unknown as Record<string, unknown[]>;
  for (const { id } of TABLAS) {
    const ws = wb.getWorksheet(NOMBRE_HOJA[id]);
    if (!ws) continue;
    crudo[id] = filasHoja(ws, COLUMNAS[id].length).slice(1).filter((v) => v.some(Boolean)).map((v) => filaDe(id, v));
  }
  return normalizarBanco(crudo);
}

// ------------------------------------------------------------ CSV

const csvCampo = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Un CSV por tabla (separador «;», UTF-8 con BOM para que Excel lo abra bien). */
export function exportarBancoCsv(b: Banco): { nombre: string; texto: string }[] {
  const o = ordenarBanco(b);
  return TABLAS.map(({ id }) => ({
    nombre: `${id}.csv`,
    texto: '﻿' + [COLUMNAS[id].map((c) => csvCampo(c.titulo)).join(';'), ...(o[id] as unknown as Fila[]).map((f) => COLUMNAS[id].map((c) => csvCampo(c.leer(f))).join(';'))].join('\r\n') + '\r\n',
  }));
}

/** Separa un CSV (con «;» o «,», comillas dobles y saltos de línea dentro de comillas). */
export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primera = t.split(/\r?\n/)[0] ?? '';
  const sep = (primera.match(/;/g)?.length ?? 0) >= (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const out: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') comillas = false; else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo);
      if (fila.some((x) => x.trim())) out.push(fila.map((x) => x.trim()));
      fila = [];
      campo = '';
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim())) out.push(fila.map((x) => x.trim()));
  return out;
}

/** Tabla del banco a la que corresponde un CSV propio (por sus encabezados), o null. */
function tablaDeCsv(cab: string[]): Tabla | null {
  return TABLAS.find(({ id }) => COLUMNAS[id].every((c, i) => (cab[i] ?? '') === c.titulo))?.id ?? null;
}

// ------------------------------------------------------------ listas de precios externas

export interface OpcionesImportacion {
  fecha: string; // fecha de los precios que no la traen
  lugar: string;
  fuente: FuentePrecio;
  referencia: string; // revista, proveedor u obra
  moneda?: string;
  /** Insumos que ya están en el banco: una lista sin códigos los reconoce por descripción y unidad. */
  insumos?: InsumoBanco[];
}

const TIPO_DE = (t: string, und: string): TipoInsumo => {
  const x = t.toUpperCase();
  if (['MO', 'MAT', 'EQ', 'SC'].includes(x)) return x as TipoInsumo;
  if (/mano/i.test(t)) return 'MO';
  if (/equipo/i.test(t)) return 'EQ';
  if (/sub/i.test(t)) return 'SC';
  return /^hh$/i.test(und) ? 'MO' : /^hm$/i.test(und) ? 'EQ' : 'MAT';
};

/**
 * Lista de precios en filas (Revista Costos, presupuestos.pe, proveedor u otro programa exportado a Excel/CSV):
 * busca la fila de encabezados con «descripción» y «precio»; el código es opcional (si falta se arma uno estable).
 */
export function bancoDeListaPrecios(filas: string[][], o: OpcionesImportacion): { banco: Banco; avisos: string[] } {
  const iCab = filas.findIndex((f) => f.some((c) => /desc|nombre|insumo|recurso/i.test(c)) && f.some((c) => /precio|costo|p\.?\s*u/i.test(c)));
  if (iCab < 0) throw new Error('No se encontró una fila de encabezados con «Descripción» y «Precio».');
  const cab = filas[iCab].map((c) => c.toLowerCase());
  const col = (re: RegExp) => cab.findIndex((c) => re.test(c));
  const cCod = col(/c[oó]d/), cDesc = col(/desc|nombre|insumo|recurso/), cUnd = col(/^und|unid|u\.m|^um$/), cPrecio = col(/precio|costo|p\.?\s*u/);
  const cTipo = col(/^tipo/), cIu = col(/^iu$|[ií]ndice/), cFecha = col(/fecha/), cLugar = col(/lugar|zona|ciudad|departamento/);
  const b = bancoVacio();
  const avisos: string[] = [];
  let sinPrecio = 0;
  let reconocidos = 0;
  const llave = (d: string, u: string) => `${d.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${u.toLowerCase().replace(/[^a-z0-9%]+/g, '')}`;
  const conocidos = new Map((o.insumos ?? []).map((i) => [llave(i.descripcion, i.unidad), i]));
  for (const f of filas.slice(iCab + 1)) {
    const descripcion = f[cDesc]?.trim();
    const precio = num((f[cPrecio] ?? '').replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'), NaN);
    if (!descripcion) continue;
    if (!Number.isFinite(precio)) { sinPrecio++; continue; }
    const unidad = (cUnd >= 0 ? f[cUnd] : '') || 'und';
    const conocido = cCod >= 0 && f[cCod]?.trim() ? undefined : conocidos.get(llave(descripcion, unidad));
    if (conocido) reconocidos++;
    const codigo = (cCod >= 0 && f[cCod]?.trim()) || conocido?.codigo || `L${sumaComprobacion(`${descripcion.toLowerCase()}|${unidad.toLowerCase()}`).slice(0, 6).toUpperCase()}`;
    const tipo = TIPO_DE(cTipo >= 0 ? f[cTipo] : '', unidad);
    if (!conocido) b.insumos.push({ codigo, descripcion, unidad, tipo, iu: (cIu >= 0 && f[cIu]?.padStart(2, '0')) || (tipo === 'MO' ? '47' : tipo === 'EQ' ? '49' : '39') });
    b.precios.push({ insumo: codigo, precio, moneda: o.moneda || 'S/', fecha: (cFecha >= 0 && /^\d{4}-\d{2}-\d{2}/.test(f[cFecha]) ? f[cFecha].slice(0, 10) : o.fecha), lugar: (cLugar >= 0 && f[cLugar]) || o.lugar, fuente: o.fuente, referencia: o.referencia });
  }
  if (cCod < 0) avisos.push(`La lista no trae códigos: ${reconocidos ? `${reconocidos} insumo(s) se reconocieron en el banco por descripción y unidad; ` : ''}a los demás se les armó un código estable (empieza con L).`);
  if (sinPrecio) avisos.push(`${sinPrecio} fila(s) sin precio numérico se omitieron.`);
  return { banco: normalizarBanco(b), avisos };
}

// ------------------------------------------------------------ importar cualquier archivo

export interface ArchivoBanco {
  nombre: string;
  datos: Uint8Array;
}

export interface ResultadoBanco {
  banco: Banco;
  avisos: string[];
  origen: string; // descripción de lo leído
  proyectos?: unknown[];
  copias?: unknown[];
}

const desdeProyecto = (p: Proyecto, nombre: string, o: OpcionesImportacion) =>
  bancoDesdeProyecto(p, { lugar: o.lugar || p.meta.departamento || '', fecha: o.fecha || p.meta.fechaBase, referencia: o.referencia || p.meta.nombre || nombre });

/**
 * Lee un archivo para el banco: .epdb, Excel o CSV propios, lista de precios, plantilla de carga, expediente de S10,
 * Delphin o PowerCost exportado a Excel, o un proyecto .expediente.json («enviar al banco»).
 */
export async function leerArchivoBanco(a: ArchivoBanco, o: OpcionesImportacion): Promise<ResultadoBanco> {
  const n = a.nombre.toLowerCase();
  const zip = a.datos[0] === 0x50 && a.datos[1] === 0x4b;
  if (/\.(epdb|zip)$/.test(n) && zip) {
    const c = await leerEpdb(a.datos);
    return { banco: c.banco, avisos: [], origen: `Banco de datos ${a.nombre}${c.proyectos ? ` (respaldo con ${c.proyectos.length} proyecto(s))` : ''}`, proyectos: c.proyectos, copias: c.copias };
  }
  if (/\.json$/.test(n)) {
    const p = migrarProyecto(leerJson(new TextDecoder().decode(a.datos), a.nombre));
    return { banco: desdeProyecto(p, a.nombre, o), avisos: [], origen: `Proyecto ${p.meta.nombre || a.nombre}` };
  }
  if (/\.(csv|txt)$/.test(n)) {
    const filas = leerCsv(new TextDecoder().decode(a.datos));
    const t = tablaDeCsv(filas[0] ?? []);
    if (t) {
      const crudo = bancoVacio() as unknown as Record<string, unknown[]>;
      crudo[t] = filas.slice(1).map((v) => filaDe(t, v));
      return { banco: normalizarBanco(crudo), avisos: [], origen: `Tabla ${NOMBRE_HOJA[t]} (${a.nombre})` };
    }
    const r = bancoDeListaPrecios(filas, o);
    return { ...r, origen: `Lista de precios ${a.nombre}` };
  }
  if (/\.xlsx$/.test(n)) {
    const wb = await abrirLibro(a.datos);
    if (esLibroBanco(wb)) return { banco: bancoDeLibro(wb), avisos: [], origen: `Banco de datos en Excel ${a.nombre}` };
    if (wb.getWorksheet('PARTIDAS') && wb.getWorksheet('APU')) {
      const r = await importarPlantilla(a.datos);
      return { banco: desdeProyecto(r.proyecto, a.nombre, o), avisos: r.avisos, origen: `Plantilla de carga ${a.nombre}` };
    }
    // una sola hoja con descripción y precio y sin APU: lista de precios; si no, expediente de otro programa
    const hojas = wb.worksheets.filter((w) => w.state !== 'hidden');
    if (hojas.length <= 2) {
      try {
        const r = bancoDeListaPrecios(filasHoja(hojas[0]), o);
        if (r.banco.precios.length) return { ...r, origen: `Lista de precios ${a.nombre}` };
      } catch {
        /* no es lista de precios */
      }
    }
    const r = await importarExpediente([{ nombre: a.nombre, datos: a.datos }]);
    return { banco: desdeProyecto(r.proyecto, a.nombre, o), avisos: r.avisos, origen: `Expediente ${r.proyecto.meta.nombre || a.nombre} (S10, Delphin, PowerCost o Excel)` };
  }
  throw new Error(`${a.nombre}: formato no reconocido. Use .epdb, .xlsx, .csv o .expediente.json.`);
}
