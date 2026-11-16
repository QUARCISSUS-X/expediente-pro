// Banco de datos propio (fuera de los proyectos): insumos, precios con fecha y fuente, análisis, cuadrillas, plantillas y
// proveedores. Motor puro: comparar y fusionar bancos, precio vigente, actualizar precios de un proyecto y enviarle lo afinado.
import { BIBLIOTECA } from '../data/biblioteca';
import { CATALOGO_BASE } from '../data/catalogo';
import { PLANTILLAS_EETT } from '../data/plantillasEett';
import { ggPlantilla } from '../data/proyectos';
import type { ApuItem, Insumo, Partida, Proyecto, TipoInsumo } from './types';
import { num, redondear } from './util';

// ------------------------------------------------------------ modelo

export type FuentePrecio = 'cotizacion' | 'revista' | 'proveedor' | 'proyecto' | 'otro';
export const FUENTES_PRECIO: { valor: FuentePrecio; texto: string }[] = [
  { valor: 'cotizacion', texto: 'Cotización' },
  { valor: 'revista', texto: 'Revista' },
  { valor: 'proveedor', texto: 'Lista de proveedor' },
  { valor: 'proyecto', texto: 'Proyecto u obra' },
  { valor: 'otro', texto: 'Otra' },
];

export interface InsumoBanco {
  codigo: string;
  descripcion: string;
  unidad: string;
  tipo: TipoInsumo;
  iu: string; // índice unificado INEI
  grupo?: string;
  pesoKg?: number | null;
  plazoCompraDias?: number | null;
  actualizado?: string; // ISO: última modificación (decide la fusión por defecto)
}

export interface PrecioBanco {
  insumo: string; // código
  precio: number; // sin IGV
  moneda: string; // S/, US$
  fecha: string; // ISO yyyy-mm-dd
  lugar: string; // departamento o ciudad
  fuente: FuentePrecio;
  referencia?: string; // nombre de la revista, del proveedor o de la obra
  proveedorRuc?: string;
  vigenciaDias?: number | null;
}

export interface AnalisisBanco {
  codigo: string;
  descripcion: string;
  unidad: string;
  especialidad: string; // grupo de la biblioteca: obras provisionales, concreto, movimiento de tierras…
  rendimiento: number;
  jornada?: number | null;
  items: ApuItem[];
  duracionManual?: number | null;
  actualizado?: string;
}

export interface CuadrillaBanco {
  nombre: string;
  descripcion?: string;
  items: { insumo: string; cuadrilla: number }[];
  actualizado?: string;
}

export type TipoPlantilla = 'eett' | 'gg' | 'calendario' | 'documento';
export interface PlantillaBanco {
  clave: string; // tipo:nombre
  tipo: TipoPlantilla;
  nombre: string;
  datos: unknown;
  actualizado?: string;
}

export interface ProveedorBanco {
  ruc: string;
  razonSocial: string;
  contacto?: string;
  telefono?: string;
  correo?: string;
  rubros: string[];
  cotizaciones: { fecha: string; referencia: string; insumos: string[] }[];
  actualizado?: string;
}

export interface Banco {
  insumos: InsumoBanco[];
  precios: PrecioBanco[];
  analisis: AnalisisBanco[];
  cuadrillas: CuadrillaBanco[];
  plantillas: PlantillaBanco[];
  proveedores: ProveedorBanco[];
}

export type Tabla = keyof Banco;
export const TABLAS: { id: Tabla; nombre: string }[] = [
  { id: 'insumos', nombre: 'Insumos' },
  { id: 'precios', nombre: 'Precios' },
  { id: 'analisis', nombre: 'Análisis' },
  { id: 'cuadrillas', nombre: 'Cuadrillas' },
  { id: 'plantillas', nombre: 'Plantillas' },
  { id: 'proveedores', nombre: 'Proveedores' },
];

export const bancoVacio = (): Banco => ({ insumos: [], precios: [], analisis: [], cuadrillas: [], plantillas: [], proveedores: [] });

/** Clave única de una fila de cada tabla. */
export function claveFila(t: Tabla, f: unknown): string {
  const x = f as Record<string, unknown>;
  switch (t) {
    case 'insumos': return String(x.codigo);
    case 'precios': return `${x.insumo}|${x.fecha}|${String(x.lugar ?? '').toLowerCase()}|${x.fuente}`;
    case 'analisis': return String(x.codigo);
    case 'cuadrillas': return String(x.nombre);
    case 'plantillas': return String(x.clave);
    case 'proveedores': return String(x.ruc);
  }
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());
const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const TIPOS: TipoInsumo[] = ['MO', 'MAT', 'EQ', 'SC'];
const FUENTES = new Set(FUENTES_PRECIO.map((f) => f.valor));

/** Completa y limpia un banco leído de archivo (filas sin clave se descartan; claves repetidas: queda la última). */
export function normalizarBanco(x: unknown): Banco {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const b: Banco = {
    insumos: lista<InsumoBanco>(o.insumos).filter((i) => texto(i?.codigo)).map((i) => ({
      ...i, codigo: texto(i.codigo), descripcion: texto(i.descripcion), unidad: texto(i.unidad) || 'und', tipo: TIPOS.includes(i.tipo) ? i.tipo : 'MAT', iu: texto(i.iu) || '39',
    })),
    precios: lista<PrecioBanco>(o.precios).filter((p) => texto(p?.insumo) && texto(p?.fecha) && Number.isFinite(num(p?.precio, NaN))).map((p) => ({
      ...p, insumo: texto(p.insumo), precio: num(p.precio), moneda: texto(p.moneda) || 'S/', fecha: texto(p.fecha).slice(0, 10), lugar: texto(p.lugar), fuente: FUENTES.has(p.fuente) ? p.fuente : 'otro',
    })),
    analisis: lista<AnalisisBanco>(o.analisis).filter((a) => texto(a?.codigo)).map((a) => ({
      ...a, codigo: texto(a.codigo), descripcion: texto(a.descripcion), unidad: texto(a.unidad), especialidad: texto(a.especialidad) || 'General', rendimiento: num(a.rendimiento, 1), items: lista<ApuItem>(a.items).filter((it) => texto(it?.insumo)),
    })),
    cuadrillas: lista<CuadrillaBanco>(o.cuadrillas).filter((c) => texto(c?.nombre)).map((c) => ({ ...c, nombre: texto(c.nombre), items: lista<CuadrillaBanco['items'][number]>(c.items).filter((it) => texto(it?.insumo)) })),
    plantillas: lista<PlantillaBanco>(o.plantillas).filter((p) => texto(p?.clave)).map((p) => ({ ...p, clave: texto(p.clave), nombre: texto(p.nombre) || texto(p.clave) })),
    proveedores: lista<ProveedorBanco>(o.proveedores).filter((p) => texto(p?.ruc)).map((p) => ({ ...p, ruc: texto(p.ruc), razonSocial: texto(p.razonSocial), rubros: lista<string>(p.rubros), cotizaciones: lista(p.cotizaciones) })),
  };
  for (const { id } of TABLAS) {
    const m = new Map<string, unknown>();
    for (const f of b[id] as unknown[]) m.set(claveFila(id, f), f);
    (b as unknown as Record<string, unknown[]>)[id] = [...m.values()];
  }
  return b;
}

export function resumenBanco(b: Banco): Record<Tabla, number> {
  return Object.fromEntries(TABLAS.map(({ id }) => [id, b[id].length])) as Record<Tabla, number>;
}

/** JSON con las claves ordenadas: dos filas iguales dan el mismo texto. */
export function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined && k !== 'actualizado').sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Suma de comprobación (FNV-1a de 32 bits) de un texto. */
export function sumaComprobacion(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Tablas ordenadas por clave: dos bancos con lo mismo dan el mismo resultado. */
export function ordenarBanco(b: Banco): Banco {
  const o = bancoVacio();
  for (const { id } of TABLAS) (o as unknown as Record<string, unknown[]>)[id] = [...(b[id] as unknown[])].sort((x, y) => claveFila(id, x).localeCompare(claveFila(id, y), 'es', { numeric: true }));
  return o;
}

// ------------------------------------------------------------ banco inicial

const F_INICIAL = '2026-10-01';

/** Banco de partida: el catálogo y la biblioteca de demostración que trae el programa, más las plantillas. */
export function bancoInicial(): Banco {
  const b = bancoVacio();
  for (const i of CATALOGO_BASE) {
    b.insumos.push({ codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, tipo: i.tipo, iu: i.iu, ...(i.pesoKg ? { pesoKg: i.pesoKg } : {}), ...(i.plazoCompraDias ? { plazoCompraDias: i.plazoCompraDias } : {}) });
    b.precios.push({ insumo: i.codigo, precio: i.precio, moneda: 'S/', fecha: F_INICIAL, lugar: 'Lima', fuente: 'otro', referencia: i.fuente ?? 'Catálogo inicial' });
  }
  for (const t of BIBLIOTECA) b.analisis.push({ codigo: t.clave, descripcion: t.descripcion, unidad: t.unidad, especialidad: t.grupo, rendimiento: t.apu.rendimiento, items: JSON.parse(JSON.stringify(t.apu.items)), ...(t.duracionManual ? { duracionManual: t.duracionManual } : {}) });
  b.cuadrillas.push(
    { nombre: 'Concreto (1 Op + 2 Of + 8 Pe)', descripcion: 'Vaciado de concreto con mezcladora', items: [{ insumo: 'MO02', cuadrilla: 1 }, { insumo: 'MO03', cuadrilla: 2 }, { insumo: 'MO04', cuadrilla: 8 }] },
    { nombre: 'Encofrado (1 Op + 1 Of)', items: [{ insumo: 'MO02', cuadrilla: 1 }, { insumo: 'MO03', cuadrilla: 1 }] },
    { nombre: 'Movimiento de tierras (0.1 Cap + 1 Pe)', items: [{ insumo: 'MO01', cuadrilla: 0.1 }, { insumo: 'MO04', cuadrilla: 1 }] },
  );
  for (const p of PLANTILLAS_EETT) b.plantillas.push({ clave: `eett:${p.clave}`, tipo: 'eett', nombre: p.nombre ?? p.clave, datos: JSON.parse(JSON.stringify(p)) });
  b.plantillas.push({ clave: 'gg:tipica', tipo: 'gg', nombre: 'Gastos generales típicos', datos: ggPlantilla().map((g, i) => ({ ...g, id: `gg-${i + 1}` })) }); // ids fijos: el banco inicial siempre es el mismo
  return ordenarBanco(b);
}

// ------------------------------------------------------------ comparar y fusionar

export type EstadoFila = 'nuevo' | 'igual' | 'conflicto';
export type Decision = 'conservar' | 'reemplazar' | 'ambos';

export interface FilaComparada {
  tabla: Tabla;
  clave: string;
  estado: EstadoFila;
  actual?: unknown;
  entrante: unknown;
  sugerida: Decision; // regla por defecto
}

export interface Comparacion {
  filas: FilaComparada[];
  conteo: Record<EstadoFila, number>;
}

/** Fecha de una fila para la regla «gana lo más reciente». */
const fechaDe = (f: unknown) => texto((f as { actualizado?: string; fecha?: string })?.actualizado ?? (f as { fecha?: string })?.fecha);

/** Compara lo que llega con el banco actual, tabla por tabla. Nada se escribe. */
export function compararBancos(actual: Banco, entrante: Banco): Comparacion {
  const filas: FilaComparada[] = [];
  for (const { id } of TABLAS) {
    const m = new Map((actual[id] as unknown[]).map((f) => [claveFila(id, f), f]));
    for (const e of entrante[id] as unknown[]) {
      const clave = claveFila(id, e);
      const a = m.get(clave);
      if (a === undefined) filas.push({ tabla: id, clave, estado: 'nuevo', entrante: e, sugerida: 'reemplazar' });
      else if (canonico(a) === canonico(e)) filas.push({ tabla: id, clave, estado: 'igual', actual: a, entrante: e, sugerida: 'conservar' });
      // regla por defecto: gana lo más reciente; sin fechas, se conserva lo que ya está
      else filas.push({ tabla: id, clave, estado: 'conflicto', actual: a, entrante: e, sugerida: fechaDe(e) > fechaDe(a) ? 'reemplazar' : 'conservar' });
    }
  }
  const conteo = { nuevo: 0, igual: 0, conflicto: 0 };
  for (const f of filas) conteo[f.estado]++;
  return { filas, conteo };
}

/** Copia de una fila con otra clave (para «guardar ambos»). */
function conOtraClave(t: Tabla, f: unknown, ocupadas: Set<string>): unknown {
  const x = { ...(f as Record<string, unknown>) };
  const campo = t === 'insumos' || t === 'analisis' ? 'codigo' : t === 'cuadrillas' ? 'nombre' : t === 'plantillas' ? 'clave' : t === 'proveedores' ? 'ruc' : 'referencia';
  if (t === 'precios') {
    // un precio se distingue por su lugar: se guarda como otro lugar de la misma fuente
    for (let n = 2; ; n++) { x.lugar = `${(f as PrecioBanco).lugar || 'Sin lugar'} (${n})`; if (!ocupadas.has(claveFila(t, x))) return x; }
  }
  for (let n = 2; ; n++) { x[campo] = `${(f as Record<string, unknown>)[campo]}-${n}`; if (!ocupadas.has(claveFila(t, x))) return x; }
}

/**
 * Aplica la comparación: los nuevos entran, los iguales no cambian y cada conflicto sigue su decisión
 * (o la regla por defecto). Devuelve un banco nuevo; el actual no se toca.
 */
export function fusionarBancos(actual: Banco, c: Comparacion, decisiones: Partial<Record<string, Decision>> = {}): Banco {
  const out = ordenarBanco(actual);
  const porTabla = new Map<Tabla, Map<string, unknown>>(TABLAS.map(({ id }) => [id, new Map((out[id] as unknown[]).map((f) => [claveFila(id, f), f]))]));
  for (const f of c.filas) {
    const m = porTabla.get(f.tabla)!;
    if (f.estado === 'nuevo') m.set(f.clave, f.entrante);
    if (f.estado !== 'conflicto') continue;
    const d = decisiones[`${f.tabla}:${f.clave}`] ?? f.sugerida;
    if (d === 'reemplazar') m.set(f.clave, f.entrante);
    else if (d === 'ambos') {
      const otra = conOtraClave(f.tabla, f.entrante, new Set(m.keys()));
      m.set(claveFila(f.tabla, otra), otra);
    }
  }
  for (const { id } of TABLAS) (out as unknown as Record<string, unknown[]>)[id] = [...porTabla.get(id)!.values()];
  return ordenarBanco(out);
}

// ------------------------------------------------------------ precios

/** Precios de un insumo, del más reciente al más antiguo (opcionalmente de un lugar). */
export function historialPrecio(b: Banco, insumo: string, lugar = ''): PrecioBanco[] {
  const l = lugar.trim().toLowerCase();
  return b.precios.filter((p) => p.insumo === insumo && (!l || p.lugar.toLowerCase() === l)).sort((x, y) => y.fecha.localeCompare(x.fecha) || x.fuente.localeCompare(y.fuente));
}

/** Precio vigente a una fecha: el más reciente no posterior, del lugar pedido si lo hay (si no, de cualquier lugar). */
export function precioVigente(b: Banco, insumo: string, fecha: string, lugar = '', moneda = ''): PrecioBanco | null {
  const elegir = (l: string) => historialPrecio(b, insumo, l).find((p) => p.fecha <= fecha && (!moneda || p.moneda === moneda)) ?? null;
  return (lugar ? elegir(lugar) : null) ?? elegir('');
}

export interface DiferenciaPrecio {
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number; // cantidad total del insumo en el presupuesto
  actual: number;
  banco: number;
  precio: PrecioBanco;
  diferencia: number;
  efecto: number; // cantidad × diferencia (efecto aproximado en el costo directo)
}

/** Compara los precios del proyecto con los del banco a una fecha y lugar (solo insumos con precio distinto). */
export function compararPrecios(p: Proyecto, cantidades: Map<string, number>, b: Banco, fecha: string, lugar = ''): DiferenciaPrecio[] {
  const out: DiferenciaPrecio[] = [];
  for (const i of p.insumos) {
    if (/^%/.test(i.unidad)) continue; // los porcentajes de mano de obra no tienen precio propio
    const v = precioVigente(b, i.codigo, fecha, lugar, p.meta.moneda);
    if (!v || Math.abs(v.precio - num(i.precio)) < 0.005) continue;
    const cantidad = cantidades.get(i.codigo) ?? 0;
    out.push({ codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, cantidad, actual: num(i.precio), banco: v.precio, precio: v, diferencia: redondear(v.precio - num(i.precio), 4), efecto: redondear(cantidad * (v.precio - num(i.precio)), 2) });
  }
  return out.sort((x, y) => Math.abs(y.efecto) - Math.abs(x.efecto) || x.codigo.localeCompare(y.codigo));
}

const nombreFuente = (p: PrecioBanco) => `${FUENTES_PRECIO.find((f) => f.valor === p.fuente)?.texto ?? p.fuente}${p.referencia ? `: ${p.referencia}` : ''}${p.lugar ? ` (${p.lugar})` : ''}`;

/** Aplica al proyecto (borrador de immer u objeto) los precios elegidos del banco. Devuelve cuántos cambió. */
export function aplicarPrecios(d: Proyecto, cambios: DiferenciaPrecio[]): number {
  let n = 0;
  for (const c of cambios) {
    const i = d.insumos.find((x) => x.codigo === c.codigo);
    if (!i) continue;
    i.precio = c.banco;
    i.fuente = nombreFuente(c.precio);
    i.fechaPrecio = c.precio.fecha;
    if (c.precio.proveedorRuc) i.proveedorRuc = c.precio.proveedorRuc;
    else delete i.proveedorRuc;
    n++;
  }
  return n;
}

// ------------------------------------------------------------ banco ↔ proyecto

/** Clave de una partida tipo a partir de su descripción y unidad (lo mismo en dos obras cae en la misma fila). */
export function clavePartida(descripcion: string, unidad: string): string {
  const s = descripcion.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${s.slice(0, 60)}-${unidad.toLowerCase().replace(/[^a-z0-9%]+/g, '')}`;
}

export interface OpcionesEnvio {
  lugar: string;
  fecha: string; // fecha de los precios que no la tienen
  referencia: string; // nombre de la obra
  especialidad?: string;
  ahora?: string; // ISO (pruebas)
}

/** Lo que un proyecto aporta al banco: insumos, un precio por insumo y el análisis de cada partida. */
export function bancoDesdeProyecto(p: Proyecto, o: OpcionesEnvio): Banco {
  const b = bancoVacio();
  const ahora = o.ahora ?? new Date().toISOString();
  for (const i of p.insumos) {
    b.insumos.push({ codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, tipo: i.tipo, iu: i.iu, ...(i.pesoKg ? { pesoKg: i.pesoKg } : {}), ...(i.plazoCompraDias ? { plazoCompraDias: i.plazoCompraDias } : {}), actualizado: ahora });
    if (!/^%/.test(i.unidad)) b.precios.push({ insumo: i.codigo, precio: num(i.precio), moneda: p.meta.moneda || 'S/', fecha: (i.fechaPrecio || o.fecha).slice(0, 10), lugar: o.lugar, fuente: 'proyecto', referencia: o.referencia });
  }
  const titulos = p.partidas.filter((x) => x.titulo);
  const tituloDe = (pt: Partida) => titulos.filter((t) => pt.codigo.startsWith(`${t.codigo}.`)).sort((a, z) => z.codigo.length - a.codigo.length)[0]?.descripcion;
  for (const pt of p.partidas) {
    const apu = p.apus[pt.id];
    if (pt.titulo || !apu || !apu.items.length) continue;
    b.analisis.push({
      codigo: clavePartida(pt.descripcion, pt.unidad), descripcion: pt.descripcion, unidad: pt.unidad, especialidad: o.especialidad || tituloDe(pt) || 'General',
      rendimiento: num(apu.rendimiento, 1), ...(apu.jornada ? { jornada: apu.jornada } : {}), items: JSON.parse(JSON.stringify(apu.items)),
      ...(num(p.programa[pt.id]?.duracionManual) > 0 ? { duracionManual: num(p.programa[pt.id]?.duracionManual) } : {}), actualizado: ahora,
    });
  }
  return ordenarBanco(normalizarBanco(b));
}

/** Insumo del proyecto armado desde el banco, con el precio vigente a la fecha y lugar. */
export function insumoDesdeBanco(b: Banco, codigo: string, fecha: string, lugar = '', moneda = ''): Insumo | null {
  const i = b.insumos.find((x) => x.codigo === codigo);
  if (!i) return null;
  const v = precioVigente(b, codigo, fecha, lugar, moneda);
  return {
    codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, tipo: i.tipo, iu: i.iu, precio: v?.precio ?? 0,
    ...(i.pesoKg ? { pesoKg: i.pesoKg } : {}), ...(i.plazoCompraDias ? { plazoCompraDias: i.plazoCompraDias } : {}),
    ...(v ? { fuente: nombreFuente(v), fechaPrecio: v.fecha } : { fuente: 'Banco de datos (sin precio)' }),
  };
}

/**
 * Agrega al proyecto los insumos que usa un análisis del banco y que el proyecto todavía no tiene.
 * Devuelve los códigos agregados y los que no están ni en el banco.
 */
export function completarInsumos(d: Proyecto, b: Banco, a: AnalisisBanco, fecha: string, lugar = ''): { agregados: string[]; faltan: string[] } {
  const agregados: string[] = [];
  const faltan: string[] = [];
  for (const it of a.items) {
    if (d.insumos.some((x) => x.codigo === it.insumo) || agregados.includes(it.insumo)) continue;
    const i = insumoDesdeBanco(b, it.insumo, fecha, lugar, d.meta.moneda);
    if (i) { d.insumos.push(i); agregados.push(it.insumo); } else faltan.push(it.insumo);
  }
  return { agregados, faltan };
}

/** Partida tipo (como la de la biblioteca) a partir de un análisis del banco. */
export function partidaTipoDe(a: AnalisisBanco) {
  return { clave: a.codigo, descripcion: a.descripcion, unidad: a.unidad, grupo: a.especialidad, apu: { rendimiento: a.rendimiento, items: JSON.parse(JSON.stringify(a.items)) as ApuItem[], ...(a.jornada ? { jornada: a.jornada } : {}) }, ...(a.duracionManual ? { duracionManual: a.duracionManual } : {}) };
}

/** Nuevo identificador para filas creadas a mano en la pantalla del banco. */
export const nuevoCodigoBanco = (prefijo: string, existentes: string[]) => {
  for (let n = existentes.length + 1; ; n++) {
    const c = `${prefijo}${String(n).padStart(3, '0')}`;
    if (!existentes.includes(c)) return c;
  }
};

