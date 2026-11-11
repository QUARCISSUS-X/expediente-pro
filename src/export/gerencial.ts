// Reportes gerenciales: informe ejecutivo en PDF (con gráficos) y reporte gerencial en Excel.
// Las tablas salen de engine/analisis.ts e engine/integridad.ts; también las muestra el módulo Resumen.
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { analizar, type Abc, type Analisis } from '../engine/analisis';
import { datosCabecera } from '../engine/cabecera';
import { normalizarControl } from '../engine/control';
import { resumenIntegridad, revisarIntegridad } from '../engine/integridad';
import type { Resultados } from '../engine/types';
import { fechaCorta, fmt } from '../engine/util';
import { generarXlsxTablas, tablaTablero } from './control';
import { curvaS, definicionPdfTablas } from './pdfdoc';
import type { Fila, Tabla } from './tablas';

const T = (clave: string, titulo: string, cabecera: string[], filas: Fila[], alinear: ('l' | 'r' | 'c')[], decimales: (number | null)[], anchos: number[], subtitulo?: string): Tabla => ({ clave, titulo, cabecera, filas, alinear, decimales, anchos, subtitulo });
const f = (celdas: Fila['celdas'], estilo?: Fila['estilo']): Fila => ({ celdas, estilo });

export function tablaResumenEjecutivo(r: Resultados, a: Analisis): Tabla {
  const m = r.proyecto.meta;
  const c = datosCabecera(r.proyecto);
  const i = a.indices;
  const mon = (v: number) => `${m.moneda} ${fmt(v)}`;
  const v = r.resumenValidacion;
  const integ = resumenIntegridad(revisarIntegridad(r.proyecto));
  return T('ejecutivo', 'Resumen ejecutivo', ['Concepto', 'Valor', 'Detalle'], [
    f(['Datos generales', null, null], 'subtitulo'),
    f(['Proyecto', c.proyecto, c.codigoProyecto || '']),
    f(['Cliente', c.cliente || '—', m.ubicacion || '']),
    f(['Precios a', fechaCorta(m.fechaBase), `Moneda: ${c.monedaNombre}`]),
    f(['Costo', null, null], 'subtitulo'),
    f(['Costo directo', mon(r.pie.costoDirecto), `${i.partidas} partidas en ${i.titulos} títulos`]),
    f(['Gastos generales', mon(r.pie.gg), `${fmt(i.ggPct)} % del costo directo`]),
    f(['Utilidad', mon(r.pie.utilidad), `${fmt(i.utilidadPct)} % del costo directo`]),
    f([m.incluirIgv === false ? 'Total sin IGV' : 'Total con IGV', mon(r.pie.total), m.incluirIgv === false ? '' : `IGV: ${mon(r.pie.igv)}`], 'total'),
    f(['Clase A (80 % del costo)', `${a.abcPartidas.clases.A.n} partidas`, `${a.abcInsumos.clases.A.n} insumos concentran el 80 % del costo de insumos`]),
    f(['Tiempo y recursos', null, null], 'subtitulo'),
    f(['Plazo de ejecución', `${i.plazoDias} días calendario`, `${i.diasLaborables} días laborables · ${fechaCorta(r.programa.inicio)} al ${fechaCorta(r.programa.fin)}`]),
    f(['Ruta crítica', `${i.actividadesCriticas} actividades`, `${fmt(i.pctCostoCritico, 1)} % del costo directo`]),
    f(['Costo directo por día', mon(i.costoPorDia), 'Promedio por día calendario']),
    f(['Mano de obra', `${fmt(i.horasHombre, 0)} hh`, `Pico de ${fmt(i.personalPico, 1)} trabajadores`]),
    f(['Equipos', `${fmt(i.horasMaquina, 0)} hm`, '']),
    f(['Confiabilidad de la información', null, null], 'subtitulo'),
    f(['Reglas de consistencia', `${v.ok} conformes`, `${v.errores} con errores · ${v.advertencias} con advertencias`]),
    f(['Integridad de datos', integ.errores + integ.avisos === 0 ? 'Sin problemas' : `${integ.errores} errores · ${integ.avisos} avisos`, integ.reparables ? `${integ.reparables} se pueden reparar desde Validación` : '']),
    f(['Sustento de precios', `${fmt(i.preciosConFuente, 0)} % con fuente`, `${i.insumos} insumos en la relación`]),
    ...(a.alertas.length ? [f(['Puntos de atención', null, null], 'subtitulo'), ...a.alertas.map((x) => f([x.nivel === 'error' ? 'Error' : x.nivel === 'advertencia' ? 'Advertencia' : 'Nota', x.texto, null]))] : []),
  ], ['l', 'l', 'l'], [null, null, null], [30, 44, 60]);
}

export function tablaCostoPorTitulo(r: Resultados, a: Analisis): Tabla {
  return T('titulos', 'Costo por título', ['Título', 'Costo directo', '% del costo directo'], [
    ...a.porTitulo.map((x) => f([x.nombre, x.monto, x.pct])),
    f(['COSTO DIRECTO', a.costoDirecto, 100], 'total'),
  ], ['l', 'r', 'r'], [null, 2, 2], [60, 18, 18], `Moneda: ${r.proyecto.meta.moneda}`);
}

export function tablaComposicion(r: Resultados, a: Analisis): Tabla {
  return T('composicion', 'Composición del costo y estructura del precio', ['Concepto', 'Monto', '%'], [
    f(['Composición del costo directo (por tipo de recurso)', null, null], 'subtitulo'),
    ...a.composicion.map((x) => f([x.nombre, x.monto, x.pct])),
    f(['Estructura del precio (sobre el total)', null, null], 'subtitulo'),
    ...a.estructura.map((x) => f([x.nombre, x.monto, x.pct])),
    f(['TOTAL', a.total, 100], 'total'),
  ], ['l', 'r', 'r'], [null, 2, 2], [60, 18, 12], `Moneda: ${r.proyecto.meta.moneda}`);
}

function tablaAbc(clave: string, titulo: string, abc: Abc, colCant: string, maximo?: number): Tabla {
  const items = maximo ? abc.items.slice(0, maximo) : abc.items;
  const resto = abc.items.length - items.length;
  return T(clave, titulo, ['Clase', 'Código', 'Descripción', 'Und.', colCant, 'Precio', 'Parcial', '%', '% acum.'], [
    ...items.map((x) => f([x.clase, x.codigo, x.descripcion, x.unidad, x.cantidad, x.precio, x.monto, x.pct, x.acumPct])),
    ...(resto > 0 ? [f([null, null, `… y ${resto} más (el detalle completo está en el reporte gerencial en Excel)`, null, null, null, null, null, null], 'nota')] : []),
    f([null, null, `A: ${abc.clases.A.n} (${fmt(abc.clases.A.pct, 1)} %) · B: ${abc.clases.B.n} (${fmt(abc.clases.B.pct, 1)} %) · C: ${abc.clases.C.n} (${fmt(abc.clases.C.pct, 1)} %)`, null, null, null, abc.total, null, null], 'total'),
  ], ['c', 'l', 'l', 'c', 'r', 'r', 'r', 'r', 'r'], [null, null, null, null, 2, 2, 2, 2, 1], [7, 12, 48, 7, 13, 12, 15, 8, 9]);
}
export const tablaAbcPartidas = (a: Analisis, maximo?: number) => tablaAbc('abc_partidas', 'Clasificación ABC de partidas', a.abcPartidas, 'Metrado', maximo);
export const tablaAbcInsumos = (a: Analisis, maximo?: number) => tablaAbc('abc_insumos', 'Clasificación ABC de insumos', a.abcInsumos, 'Cantidad', maximo);

export function tablaCurva(r: Resultados, a: Analisis): Tabla {
  let acum = 0;
  return T('curva', 'Avance programado por periodo (curva S)', ['Periodo', 'Desde', 'Hasta', 'Costo directo', '% del periodo', '% acumulado', 'Acumulado'],
    a.curva.map((x, i) => {
      acum += x.monto;
      const p = r.programa.periodos[i];
      return f([x.etiqueta, fechaCorta(p.inicio), fechaCorta(p.fin), x.monto, x.avancePct, x.acumuladoPct, acum]);
    }), ['l', 'c', 'c', 'r', 'r', 'r', 'r'], [null, null, null, 2, 2, 2, 2], [14, 12, 12, 18, 14, 14, 18]);
}

export function tablaConfiabilidad(r: Resultados): Tabla {
  const integ = revisarIntegridad(r.proyecto);
  return T('confiabilidad', 'Consistencia e integridad de la información', ['N.°', 'Control', 'Estado', 'Detalle'], [
    f([null, 'Reglas de consistencia del expediente', null, null], 'subtitulo'),
    ...r.validacion.map((v) => f([v.regla, v.control, v.estado === 'ok' ? 'Conforme' : v.estado === 'error' ? 'Error' : 'Advertencia', v.detalle])),
    f([null, 'Integridad de los datos del proyecto', null, null], 'subtitulo'),
    ...(integ.length ? integ.map((x, i) => f([i + 1, x.mensaje, x.nivel === 'error' ? 'Error' : 'Aviso', `${x.cantidad}: ${x.detalle.slice(0, 3).join('; ')}${x.cantidad > 3 ? '…' : ''}`])) : [f([null, 'Sin datos sueltos, repetidos ni dañados', 'Conforme', ''])]),
  ], ['c', 'l', 'c', 'l'], [0, null, null, null], [6, 44, 13, 70]);
}

/** Hojas del reporte gerencial (Excel). */
export function tablasGerenciales(r: Resultados): { hoja: string; tabla: Tabla }[] {
  const a = analizar(r);
  const lista = [
    { hoja: 'Resumen ejecutivo', tabla: tablaResumenEjecutivo(r, a) },
    { hoja: 'Costo por título', tabla: tablaCostoPorTitulo(r, a) },
    { hoja: 'Composición', tabla: tablaComposicion(r, a) },
    { hoja: 'ABC partidas', tabla: tablaAbcPartidas(a) },
    { hoja: 'ABC insumos', tabla: tablaAbcInsumos(a) },
    { hoja: 'Curva S', tabla: tablaCurva(r, a) },
    { hoja: 'Consistencia', tabla: tablaConfiabilidad(r) },
  ];
  if (r.proyecto.control?.lineaBase) lista.push({ hoja: 'Control de obra', tabla: tablaTablero(r, normalizarControl(r.proyecto.control)) });
  return lista;
}

export const generarXlsxGerencial = (r: Resultados) => generarXlsxTablas(r, `Reporte gerencial – ${r.proyecto.meta.nombre}`, tablasGerenciales(r));

// ------------------------------------------------------------ gráficos del PDF

const VERDE = '#1E6B5E';
const COLORES = ['#1E6B5E', '#2E6DA4', '#A9731A', '#A8372A', '#6B7B83'];

/** Barras horizontales con etiqueta y valor. */
function barrasH(titulo: string, datos: { nombre: string; monto: number; pct: number }[], color = VERDE): Content[] {
  if (!datos.length) return [];
  const W = 250;
  const max = Math.max(...datos.map((d) => d.pct), 1);
  return [
    { text: titulo, fontSize: 8, bold: true, margin: [0, 8, 0, 3] },
    {
      table: {
        widths: [180, W, 50],
        body: datos.map((d) => [
          { text: d.nombre.length > 46 ? d.nombre.slice(0, 45) + '…' : d.nombre, fontSize: 7 },
          { canvas: [{ type: 'rect', x: 0, y: 1, w: Math.max(1, (d.pct / max) * W), h: 7, color }] },
          { text: `${fmt(d.pct, 1)} %`, fontSize: 7, alignment: 'right' },
        ]),
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 6],
    } as Content,
  ];
}

/** Barra apilada con leyenda (composición o estructura). */
function barraApilada(titulo: string, partes: { nombre: string; pct: number }[]): Content[] {
  if (!partes.length) return [];
  const W = 500;
  let x = 0;
  const rects = partes.map((p, i) => {
    const w = (p.pct / 100) * W;
    const rect = { type: 'rect', x, y: 0, w: Math.max(0.5, w), h: 12, color: COLORES[i % COLORES.length] };
    x += w;
    return rect;
  });
  return [
    { text: titulo, fontSize: 8, bold: true, margin: [0, 8, 0, 3] },
    { canvas: rects } as Content,
    { margin: [0, 3, 0, 6], fontSize: 7, text: partes.flatMap((p, i) => [{ text: '■ ', color: COLORES[i % COLORES.length] }, { text: `${p.nombre} ${fmt(p.pct, 1)} %     ` }]) } as Content,
  ];
}

/** Informe ejecutivo: carátula y una sección por tema, cada una con su gráfico y su tabla. */
export function definicionPdfEjecutivo(r: Resultados): TDocumentDefinitions {
  const a = analizar(r);
  const tablas = [tablaResumenEjecutivo(r, a), tablaCostoPorTitulo(r, a), tablaComposicion(r, a), tablaAbcPartidas(a, 20), tablaAbcInsumos(a, 20), tablaCurva(r, a), tablaConfiabilidad(r)];
  if (r.proyecto.control?.lineaBase) tablas.push(tablaTablero(r, normalizarControl(r.proyecto.control)));
  const pareto = (abc: Abc) => abc.items.slice(0, 10).map((x) => ({ nombre: `${x.codigo} ${x.descripcion}`, monto: x.monto, pct: x.pct }));
  return definicionPdfTablas(r, 'INFORME EJECUTIVO', tablas, {
    titulos: barrasH('Incidencia de cada título en el costo directo', a.porTitulo),
    composicion: [...barraApilada('Composición del costo directo', a.composicion), ...barraApilada('Estructura del precio', a.estructura)],
    abc_partidas: barrasH('Las 10 partidas de mayor incidencia', pareto(a.abcPartidas), '#2E6DA4'),
    abc_insumos: barrasH('Los 10 insumos de mayor incidencia', pareto(a.abcInsumos), '#A9731A'),
    curva: curvaS(r),
  });
}
