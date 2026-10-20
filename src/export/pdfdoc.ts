// Definición del PDF consolidado (pdfmake): carátula, control del documento, aviso, índice,
// documentos con encabezado (logos) y pie (código, revisión, página y folio).
import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { datosCabecera, type Cabecera } from '../engine/cabecera';
import {
  cartaPresentacion, especificacionesTecnicas, matrizCumplimiento, memoriaDescriptiva, reporteConsistencia, type Bloque, type Documento,
} from '../engine/documentos';
import type { DocKey, Logo, Resultados } from '../engine/types';
import { fechaLarga, fmt } from '../engine/util';
import {
  tablaAdquisiciones, tablaApu, tablaDesembolsos, tablaDetallado, tablaEquipos, tablaFlete, tablaGG, tablaInsumos, tablaMetrados,
  tablaPersonal, tablaPolinomica, tablaPrograma, tablaResumen, tablaValorizado, type Fila, type Tabla,
} from './tablas';

const AZUL = '#1F3A5F';
const ROJO = '#C0392B';
const AZUL2 = '#2E6DA4';
const GRIS = '#EEF2F6';
const GRIS2 = '#F7F9FB';
const TENUE = '#5B6B7C';
const W_V = 515;
const W_H = 762;

export const SECCIONES_PDF: { clave: DocKey; nombre: string }[] = [
  { clave: 'carta', nombre: 'Carta de presentación' },
  { clave: 'memoria', nombre: 'Memoria descriptiva' },
  { clave: 'presupuesto_resumen', nombre: 'Presupuesto resumen y resumen de costos' },
  { clave: 'presupuesto_detallado', nombre: 'Presupuesto detallado' },
  { clave: 'apu', nombre: 'Análisis de precios unitarios' },
  { clave: 'insumos', nombre: 'Relación y cotización de insumos' },
  { clave: 'gg', nombre: 'Desagregado de gastos generales' },
  { clave: 'polinomica', nombre: 'Fórmula polinómica' },
  { clave: 'flete', nombre: 'Cálculo de flete' },
  { clave: 'metrados', nombre: 'Planilla de sustento de metrados' },
  { clave: 'programa', nombre: 'Cronograma de ejecución y Gantt' },
  { clave: 'valorizado', nombre: 'Cronograma valorizado y curva S' },
  { clave: 'adquisiciones', nombre: 'Calendario de adquisición de materiales' },
  { clave: 'equipos', nombre: 'Calendario de utilización de equipos' },
  { clave: 'personal', nombre: 'Histograma de personal' },
  { clave: 'desembolsos', nombre: 'Cronograma de desembolsos' },
  { clave: 'eett', nombre: 'Especificaciones técnicas' },
  { clave: 'cumplimiento', nombre: 'Matriz de cumplimiento del TdR' },
  { clave: 'consistencia', nombre: 'Reporte de consistencia' },
];

// ------------------------------------------------------------ utilidades

function celdaTexto(v: string | number | null, dec: number | null, ocultarCeros = false): string {
  if (v === null || v === undefined) return '';
  if (ocultarCeros && typeof v === 'number' && Math.abs(v) < 0.005) return '';
  if (typeof v === 'number') return dec === null ? String(v) : fmt(v, dec);
  return v;
}

function anchosPt(anchos: number[], total: number): number[] {
  const s = anchos.reduce((a, b) => a + b, 0) || 1;
  // pdfmake suma padding (4 pt por celda); se descuenta para que la tabla no desborde
  return anchos.map((a) => Math.max(14, (a / s) * total - 4.5));
}

const layoutTabla = {
  hLineWidth: (i: number, node: { table: { body: unknown[]; headerRows?: number } }) => (i === 0 || i === (node.table.headerRows ?? 0) || i === node.table.body.length ? 0.6 : 0.25),
  vLineWidth: () => 0.25,
  hLineColor: () => '#B8C3CF',
  vLineColor: () => '#D5DCE4',
  paddingLeft: () => 2,
  paddingRight: () => 2,
  paddingTop: () => 1.5,
  paddingBottom: () => 1.5,
};

const sinRelleno = { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 };

// las imágenes se registran una sola vez en el diccionario del documento (no se repiten en cada página)
let IMAGENES = new Map<string, string>();

function imagen(l: Logo | null | undefined, w: number, h: number, alinear: 'left' | 'right' | 'center' = 'left'): Content | null {
  if (!l?.dataUrl || !/^data:image\/(png|jpe?g)/i.test(l.dataUrl)) return null;
  let k = IMAGENES.get(l.dataUrl);
  if (!k) {
    k = `img${IMAGENES.size + 1}`;
    IMAGENES.set(l.dataUrl, k);
  }
  return { image: k, fit: [w, h], alignment: alinear } as Content;
}

// ------------------------------------------------------------ tablas

function filaPdf(t: Tabla, f: Fila, cols: number[], fs: number, completa: boolean): TableCell[] {
  const est = f.estilo ?? 'normal';
  const celdas: TableCell[] = cols.map((i) => {
    const txt = celdaTexto(f.celdas[i] ?? null, est === 'encabezado' ? null : t.decimales[i] ?? null, !!t.ocultarCeros && i >= (t.columnasFijas ?? 0));
    if (est === 'separador') return { text: '', fontSize: 3, border: [false, false, false, false] } as TableCell;
    if (est === 'encabezado') return { text: txt, bold: true, color: 'white', fillColor: AZUL, alignment: 'center', fontSize: fs - 0.3 } as TableCell;
    const sangria = i === 1 && f.nivel && f.nivel > 1 ? Math.min(4, f.nivel - 1) * 5 : 0;
    return {
      text: txt,
      fontSize: est === 'nota' ? fs - 0.6 : fs,
      bold: est === 'titulo' || est === 'subtitulo' || est === 'total' || est === 'grupo',
      italics: est === 'nota',
      color: est === 'nota' ? TENUE : '#1B1B1B',
      alignment: t.alinear[i] === 'r' ? 'right' : t.alinear[i] === 'c' ? 'center' : 'left',
      fillColor: est === 'titulo' ? GRIS : est === 'subtitulo' ? GRIS2 : est === 'total' ? '#F1F4F7' : undefined,
      margin: sangria ? [sangria, 0, 0, 0] : undefined,
    } as TableCell;
  });
  if (completa && f.combinar) {
    for (const c of f.combinar) {
      const a = cols.indexOf(c.desde);
      const b = cols.indexOf(c.hasta);
      if (a < 0 || b <= a) continue;
      (celdas[a] as { colSpan?: number }).colSpan = b - a + 1;
      if (t.alinear[c.desde] === 'r' && (f.estilo === 'nota' || f.estilo === 'titulo')) (celdas[a] as { alignment?: string }).alignment = 'left';
      for (let k = a + 1; k <= b; k++) celdas[k] = { text: '' } as TableCell;
    }
  }
  return celdas;
}

function tablaPdf(t: Tabla, horizontal: boolean, columnas?: number[]): Content {
  const cols = columnas ?? t.cabecera.map((_, i) => i);
  const completa = cols.length === t.cabecera.length;
  const anchos = anchosPt(cols.map((i) => t.anchos[i]), horizontal ? W_H : W_V);
  const fs = horizontal && cols.length > 10 ? 6.3 : 7.2;
  const cab: TableCell[] = cols.map((i) => ({ text: t.cabecera[i], bold: true, color: 'white', fillColor: AZUL, alignment: 'center', fontSize: fs }) as TableCell);
  const tabla = (filas: Fila[], conCab: boolean): Content =>
    ({
      table: { headerRows: conCab ? 1 : 0, widths: anchos, body: [...(conCab ? [cab] : []), ...filas.map((f) => filaPdf(t, f, cols, fs, completa))], dontBreakRows: true },
      layout: layoutTabla,
      margin: [0, 0, 0, 0],
    }) as Content;
  if (t.bloques?.length) {
    const out: Content[] = [];
    const lim = [...t.bloques, t.filas.length];
    for (let k = 0; k < t.bloques.length; k++) {
      const filas = t.filas.slice(lim[k], lim[k + 1]);
      const util = filas.filter((f) => f.estilo !== 'separador');
      out.push({ stack: [tabla(util, !t.sinCabecera)], unbreakable: util.length <= 42, margin: [0, 0, 0, 7] } as Content);
    }
    return { stack: out } as Content;
  }
  return { stack: [tabla(t.filas, !t.sinCabecera)], margin: [0, 2, 0, 8] } as Content;
}

/** Parte una tabla ancha en bloques de columnas que entran en la página horizontal. */
function tablaAncha(t: Tabla): Content[] {
  const fijas = t.columnasFijas ?? 0;
  const nPer = t.cabecera.length - fijas;
  if (!fijas || nPer <= 0) return [tablaPdf(t, true)];
  const s = t.anchos.reduce((a, b) => a + b, 0);
  const anchoFijas = t.anchos.slice(0, fijas).reduce((a, b) => a + b, 0);
  const porBloque = Math.max(3, Math.floor((W_H * 0.98 - (anchoFijas / s) * W_H * 0.55) / 50));
  if (nPer <= porBloque) return [tablaPdf(t, true)];
  const out: Content[] = [];
  for (let k = 0; k < nPer; k += porBloque) {
    const cols = [...Array(fijas).keys(), ...Array.from({ length: Math.min(porBloque, nPer - k) }, (_, j) => fijas + k + j)];
    if (k > 0) out.push({ text: `(continuación – columnas ${t.cabecera[fijas + k]} a ${t.cabecera[cols[cols.length - 1]]})`, fontSize: 7, italics: true, color: TENUE, pageBreak: 'before' } as Content);
    out.push(tablaPdf(t, true, cols));
  }
  return out;
}

/** Recuadro de datos del proyecto (como el encabezado de los reportes de S10). */
function cajetin(c: Cabecera, ancho: number, extra?: string): Content {
  const k = (t: string): TableCell => ({ text: t, bold: true, fontSize: 7, color: TENUE });
  const v = (t: string, span = 1): TableCell => ({ text: t || '—', fontSize: 7.2, colSpan: span });
  const body: TableCell[][] = [
    [k('Proyecto'), v(`${c.codigoProyecto ? c.codigoProyecto + '  ' : ''}${c.proyecto}`, 3), {}, {}],
    [k('Cliente'), v(c.cliente), k('Fecha de precios'), v(c.fechaBase)],
    [k('Ubicación'), v(c.ubicacion), k('Moneda'), v(`${c.monedaNombre} (${c.moneda})`)],
  ];
  if (extra) body.push([k('Nota'), v(extra, 3), {}, {}]);
  return {
    table: { widths: [52, ancho - 52 - 70 - 110 - 18, 70, 110], body },
    layout: { hLineWidth: (i: number, n: { table: { body: unknown[] } }) => (i === 0 || i === n.table.body.length ? 0.6 : 0), vLineWidth: () => 0, hLineColor: () => AZUL, paddingTop: () => 1.2, paddingBottom: () => 1.2, paddingLeft: () => 2, paddingRight: () => 2 },
    margin: [0, 0, 0, 6],
  } as Content;
}

// ------------------------------------------------------------ bloques de texto

function bloquesPdf(bloques: Bloque[], ancho = W_V): Content[] {
  const out: Content[] = [];
  for (const b of bloques) {
    switch (b.t) {
      case 'h1': out.push({ text: b.texto, style: 'h1' }); break;
      case 'h2': out.push({ text: b.texto, style: 'h2' }); break;
      case 'h3': out.push({ text: b.texto, style: 'h3' }); break;
      case 'h4': out.push({ text: b.texto, style: 'h4' }); break;
      case 'p':
        out.push({
          text: b.etiqueta ? [{ text: `${b.etiqueta}: `, bold: true }, b.texto] : b.texto,
          bold: b.negrita,
          alignment: b.alinear === 'der' ? 'right' : b.alinear === 'centro' ? 'center' : b.alinear === 'just' ? 'justify' : 'left',
          margin: [0, 0, 0, b.negrita ? 2 : 5],
          fontSize: b.tam ?? 9,
          color: b.negrita ? '#1F2B37' : undefined,
        } as Content);
        break;
      case 'lista': out.push({ ul: b.items, fontSize: 9, margin: [6, 0, 0, 6], alignment: 'justify' } as Content); break;
      case 'kv':
        out.push({
          table: { widths: [ancho * 0.33 - 5, ancho * 0.67 - 5], body: b.pares.map(([k, v]) => [{ text: k, bold: true, fillColor: GRIS, fontSize: 8.5 }, { text: v, fontSize: 8.5 }]) },
          layout: layoutTabla,
          margin: [0, 2, 0, 8],
        } as Content);
        break;
      case 'tabla': {
        const anchos = anchosPt(b.anchos ?? b.cabecera.map(() => 1), ancho);
        out.push({
          table: {
            headerRows: 1,
            widths: anchos,
            body: [
              b.cabecera.map((h) => ({ text: h, bold: true, color: 'white', fillColor: AZUL, fontSize: 7.5, alignment: 'center' })),
              ...b.filas.map((f, fi) => f.map((v, i) => ({ text: v, fontSize: 7.5, bold: b.negritas?.includes(fi), alignment: b.alinear?.[i] === 'r' ? 'right' : b.alinear?.[i] === 'c' ? 'center' : 'left' }))),
            ],
          },
          layout: layoutTabla,
          margin: [0, 2, 0, 8],
        } as Content);
        break;
      }
      case 'salto': out.push({ text: '', pageBreak: 'after' }); break;
      case 'firma':
        out.push({ stack: [{ text: '______________________________', margin: [0, 40, 0, 2] }, { text: b.nombre, bold: true }, { text: b.cargo, fontSize: 8.5 }, ...(b.detalle ? [{ text: b.detalle, fontSize: 8 }] : [])], alignment: 'center', fontSize: 9, unbreakable: true } as Content);
        break;
      case 'firmas':
        out.push(firmasPdf(b.firmas, ancho));
        break;
    }
  }
  return out;
}

function firmasPdf(firmas: { rol: string; nombre: string; cargo: string; detalle?: string; fecha?: string }[], ancho: number): Content {
  const w = (ancho - 4.5 * firmas.length) / firmas.length;
  return {
    unbreakable: true,
    margin: [0, 18, 0, 6],
    table: {
      widths: firmas.map(() => w),
      body: [
        firmas.map((f) => ({ text: f.rol.toUpperCase(), bold: true, fontSize: 7, color: 'white', fillColor: AZUL, alignment: 'center' })),
        firmas.map(() => ({ text: '\n\n\n\n', fontSize: 8 })),
        firmas.map((f) => ({ stack: [{ text: f.nombre || '—', bold: true, fontSize: 8 }, { text: f.cargo || '', fontSize: 7.5 }, ...(f.detalle ? [{ text: f.detalle, fontSize: 7, color: TENUE }] : []), ...(f.fecha ? [{ text: f.fecha, fontSize: 7, color: TENUE }] : [])], alignment: 'center' })),
      ],
    },
    layout: layoutTabla,
  } as Content;
}

// ------------------------------------------------------------ gráficos

function inicioDia(r: Resultados, iso: string): number {
  let n = 0;
  for (const d of r.programa.diaFecha) if (d < iso) n++;
  return n;
}

function gantt(r: Resultados): Content[] {
  const T = Math.max(1, r.programa.diasLaborables);
  const W = 470;
  const per = r.programa.periodos;
  const limites = per.map((p) => Math.min(T, inicioDia(r, p.inicio)));
  limites.push(T);
  const anchosPer = per.map((_, i) => Math.max(0.0001, ((limites[i + 1] - limites[i]) / T) * W));
  const lineas = () => limites.slice(1, -1).map((l) => ({ type: 'line', x1: (l / T) * W, y1: 0, x2: (l / T) * W, y2: 10, lineWidth: 0.3, lineColor: '#C9D2DC' }));
  const acts = new Map(r.programa.actividades.map((a) => [a.partidaId, a]));
  const filas: TableCell[][] = [];
  filas.push([
    { text: 'Ítem', bold: true, color: 'white', fillColor: AZUL, fontSize: 6.5 },
    { text: 'Actividad', bold: true, color: 'white', fillColor: AZUL, fontSize: 6.5 },
    { text: 'Días', bold: true, color: 'white', fillColor: AZUL, fontSize: 6.5, alignment: 'center' },
    {
      fillColor: AZUL,
      table: { widths: anchosPer, body: [per.map((p) => ({ text: p.etiqueta, color: 'white', bold: true, fontSize: 6, alignment: 'center' }))] },
      layout: sinRelleno,
    } as TableCell,
  ]);
  for (const f of r.filas) {
    if (f.esTitulo) {
      const desc = r.filas.filter((x) => !x.esTitulo && x.partida.codigo.startsWith(f.partida.codigo + '.')).map((x) => acts.get(x.partida.id)).filter(Boolean);
      if (!desc.length) continue;
      const es = Math.min(...desc.map((a) => a!.es));
      const ef = Math.max(...desc.map((a) => a!.es + a!.duracion));
      filas.push([
        { text: f.partida.codigo, fontSize: 6.3, bold: true, fillColor: GRIS2 },
        { text: f.partida.descripcion.length > 58 ? f.partida.descripcion.slice(0, 56) + '…' : f.partida.descripcion, fontSize: 6.3, bold: true, fillColor: GRIS2 },
        { text: String(ef - es), fontSize: 6.3, alignment: 'center', bold: true, fillColor: GRIS2 },
        { fillColor: GRIS2, canvas: [...lineas(), { type: 'rect', x: (es / T) * W, y: 3, w: Math.max(1.5, ((ef - es) / T) * W), h: 4, color: '#5B6B7C' }] } as TableCell,
      ]);
      continue;
    }
    const a = acts.get(f.partida.id);
    if (!a) continue;
    filas.push([
      { text: a.codigo, fontSize: 6.3 },
      { text: a.descripcion.length > 58 ? a.descripcion.slice(0, 56) + '…' : a.descripcion, fontSize: 6.3 },
      { text: String(a.duracion), fontSize: 6.3, alignment: 'center' },
      { canvas: [...lineas(), { type: 'rect', x: (a.es / T) * W, y: 1.5, w: Math.max(1.5, (a.duracion / T) * W), h: 7, color: a.critica ? ROJO : AZUL2 }] } as TableCell,
    ]);
  }
  return [
    { text: `Diagrama de Gantt — ${r.programa.diasLaborables} días laborables · ${r.programa.plazoDias} días calendario · azul = actividad, rojo = ruta crítica, gris = título`, fontSize: 8, bold: true, margin: [0, 4, 0, 4] },
    { table: { headerRows: 1, widths: [34, 200, 20, W], body: filas, dontBreakRows: true }, layout: layoutTabla } as Content,
  ];
}

function curvaS(r: Resultados): Content[] {
  const v = r.valorizado;
  const n = v.cd.length;
  if (!n) return [];
  const W = 640, H = 170;
  const bw = W / n;
  const barras = v.avancePct.map((p, i) => ({ type: 'rect', x: i * bw + bw * 0.2, y: H - (p / 100) * H, w: bw * 0.6, h: (p / 100) * H, color: '#BFD3E6' }));
  const pts = v.acumuladoPct.map((p, i) => ({ x: (i + 1) * bw - bw / 2, y: H - (p / 100) * H }));
  const grid = [0, 25, 50, 75, 100].map((g) => ({ type: 'line', x1: 0, y1: H - (g / 100) * H, x2: W, y2: H - (g / 100) * H, lineWidth: 0.3, lineColor: '#D5DCE4' }));
  return [
    { text: 'Curva S — avance acumulado (línea) y avance del periodo (barras), % del costo directo', fontSize: 8, bold: true, margin: [0, 10, 0, 4], unbreakable: true },
    {
      unbreakable: true,
      stack: [
        {
          columns: [
            { width: 28, stack: [100, 75, 50, 25, 0].map((g, i) => ({ text: `${g}%`, fontSize: 6, alignment: 'right', margin: [0, i === 0 ? 0 : H / 4 - 7.2, 2, 0] })) },
            { width: W, canvas: [...grid, ...barras, { type: 'polyline', lineWidth: 1.6, lineColor: AZUL, points: [{ x: 0, y: H }, ...pts] }, ...pts.map((p) => ({ type: 'ellipse', x: p.x, y: p.y, r1: 2, r2: 2, color: AZUL }))] },
          ],
        },
        {
          margin: [28, 2, 0, 0],
          table: { widths: v.cd.map(() => bw - 4), body: [r.programa.periodos.map((p, i) => ({ text: `${p.etiqueta}\n${fmt(v.acumuladoPct[i])}%`, fontSize: 6, alignment: 'center' }))] },
          layout: 'noBorders',
        },
      ],
    } as Content,
  ];
}

function histograma(r: Resultados): Content[] {
  const v = r.personalEquivalente;
  if (!v.length) return [];
  const W = 640, H = 120;
  const max = Math.max(...v, 1);
  const bw = W / v.length;
  return [
    {
      unbreakable: true,
      stack: [
        { text: `Trabajadores promedio por periodo (pico diario: ${fmt(r.personalPico, 1)})`, fontSize: 8, bold: true, margin: [0, 10, 0, 4] },
        { canvas: v.map((x, i) => ({ type: 'rect', x: i * bw + bw * 0.2, y: H - (x / max) * H, w: bw * 0.6, h: (x / max) * H, color: AZUL2 })) },
        { table: { widths: v.map(() => bw - 4), body: [r.programa.periodos.map((p, i) => ({ text: `${p.etiqueta}\n${fmt(v[i], 1)}`, fontSize: 6, alignment: 'center' }))] }, layout: 'noBorders', margin: [0, 2, 0, 0] },
      ],
    } as Content,
  ];
}

// ------------------------------------------------------------ carátula y control del documento

function caratula(r: Resultados, c: Cabecera, titulo: string): Content[] {
  const m = r.proyecto.meta;
  const publico = m.modo === 'publico';
  const fila = (k: string, v: string): TableCell[] => [{ text: k, bold: true, fillColor: GRIS, fontSize: 9 }, { text: v, alignment: 'right', fontSize: 9 }];
  const logos: Content[] = [];
  const lp = imagen(c.logoProyectista, 130, 46, 'left');
  const lc = imagen(c.logoCliente, 130, 46, 'right');
  logos.push({
    columns: [
      lp ? { width: '*', stack: [lp] } : { width: '*', text: c.proyectista, bold: true, fontSize: 11, color: AZUL },
      lc ? { width: '*', stack: [lc] } : { width: '*', text: '' },
    ],
  } as Content);
  const foto = imagen(c.imagenPortada, W_V, 210, 'center');
  return [
    {
      stack: [
        { text: `${c.tipoDocumento}${titulo && titulo.toUpperCase() !== c.tipoDocumento ? ' | ' + titulo.toUpperCase() : ''}`, fontSize: 8, bold: true, color: '#C9D6E3', margin: [0, 0, 0, 2] },
        { text: `Revisión ${c.revision}${c.estado ? ' · ' + c.estado : ''}`, fontSize: 8, color: '#C9D6E3', margin: [0, 0, 0, 14] },
        { text: m.nombre.toUpperCase(), fontSize: m.nombre.length > 120 ? 15 : 19, bold: true, color: 'white', lineHeight: 1.1, margin: [0, 0, 0, 14] },
        ...(c.descripcion ? [{ text: c.descripcion, fontSize: 9, color: '#E4EBF2', margin: [0, 0, 0, 10] }] : []),
        {
          columns: [
            { width: '*', stack: [{ text: publico ? 'ENTIDAD / CLIENTE' : 'CLIENTE', fontSize: 7, color: '#C9D6E3', bold: true }, { text: c.cliente || '—', fontSize: 10, bold: true, color: 'white' }, ...(c.propietario ? [{ text: `Propietario: ${c.propietario}`, fontSize: 8, color: '#E4EBF2' }] : [])] },
            { width: 190, stack: [{ text: 'UBICACIÓN', fontSize: 7, color: '#C9D6E3', bold: true }, { text: c.ubicacionLarga || c.ubicacion || '—', fontSize: 8.5, color: 'white' }] },
          ],
          columnGap: 14,
        },
      ],
      margin: [8, 38, 8, 0],
    } as Content,
    { text: '', margin: [0, 0, 0, 52] },
    ...(foto ? [{ ...(foto as object), margin: [0, 0, 0, 14] } as Content] : []),
    {
      table: {
        widths: [230, 230],
        body: [
          fila(publico ? 'Valor referencial' : 'Monto total de la oferta', `${m.moneda} ${fmt(r.pie.total)}${m.incluirIgv === false ? ' (sin IGV)' : ''}`),
          fila('Plazo de ejecución', `${r.programa.plazoDias} días calendario`),
          fila('Fecha de determinación del presupuesto', fechaLarga(m.fechaBase)),
          fila('Sistema de contratación', m.sistemaContratacion),
        ],
      },
      layout: layoutTabla,
      margin: [22, foto ? 0 : 40, 22, 0],
    } as Content,
    { text: '', margin: [0, 0, 0, foto ? 24 : 120] },
    ...logos,
    {
      columns: [
        { width: '*', text: [{ text: 'Elaborado por: ', bold: true }, c.proyectista || '—'], fontSize: 8.5 },
        { width: 'auto', text: `${c.codigoDocumento ? 'Código ' + c.codigoDocumento + ' · ' : ''}${c.fechaLarga}`, fontSize: 8.5, color: TENUE },
      ],
      margin: [0, 8, 0, 0],
    } as Content,
  ];
}

function bloqueEntidad(rol: string, e: { nombre: string; ruc: string; direccion: string; telefono: string; email: string; web: string; representante: string; logo?: Logo | null }): Content {
  const lineas = [e.ruc ? `RUC ${e.ruc}` : '', e.representante ? `Representante: ${e.representante}` : '', e.direccion, [e.telefono, e.email].filter(Boolean).join(' · '), e.web].filter(Boolean);
  const logo = imagen(e.logo, 110, 42, 'right');
  return {
    columns: [
      { width: '*', stack: [{ text: rol, bold: true, fontSize: 8, color: AZUL }, { text: e.nombre || '—', bold: true, fontSize: 9.5, margin: [0, 1, 0, 2] }, ...lineas.map((l) => ({ text: l, fontSize: 8, color: '#3B4B5C' }))] },
      ...(logo ? [{ width: 120, stack: [logo] }] : []),
    ],
    margin: [0, 0, 0, 14],
  } as Content;
}

function controlDocumento(r: Resultados, c: Cabecera, tituloDoc: string): Content[] {
  const p = r.proyecto;
  const rs = p.responsables;
  const out: Content[] = [
    { text: 'CONTROL DEL DOCUMENTO', style: 'seccion', pageBreak: 'before' } as Content,
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: W_V, y2: 0, lineWidth: 0.8, lineColor: AZUL }], margin: [0, -4, 0, 8] } as Content,
    { text: [{ text: 'REVISIÓN VIGENTE: ', bold: true, color: AZUL }, `Revisión ${c.revision}${c.estado ? ' · ' + c.estado : ''}${c.fechaRevision ? ' · ' + c.fechaRevision : ''}`], fontSize: 8, margin: [0, 0, 0, 8] } as Content,
    { text: `${tituloDoc.toUpperCase()}`, fontSize: 10.5, bold: true, color: '#1F2B37' } as Content,
    { text: p.meta.nombre, fontSize: 9, margin: [0, 2, 0, 14] } as Content,
    bloqueEntidad('Preparado para:', p.entidades.cliente),
  ];
  if (c.propietario) out.push(bloqueEntidad('Propietario:', p.entidades.propietario));
  out.push(bloqueEntidad('Preparado por:', p.entidades.proyectista));
  if (c.autores.length) {
    out.push({ text: 'Autores principales:', bold: true, fontSize: 8, color: AZUL } as Content);
    out.push({ ul: c.autores, fontSize: 8, margin: [6, 2, 0, 10] } as Content);
  }
  out.push({ text: 'Historial de revisiones', bold: true, fontSize: 8, color: AZUL, margin: [0, 4, 0, 3] } as Content);
  out.push({
    table: {
      widths: [30, 60, '*', 80, 80, 80],
      body: [
        ['Rev.', 'Fecha', 'Descripción', 'Elaborado', 'Revisado', 'Aprobado'].map((t) => ({ text: t, bold: true, color: 'white', fillColor: AZUL, fontSize: 7.5, alignment: 'center' })),
        [c.revision, c.fechaRevision || c.fecha, c.estado || 'Emisión', rs.elaboro.nombre || '—', rs.reviso.nombre || '—', rs.aprobo.nombre || '—'].map((t) => ({ text: t, fontSize: 7.5, alignment: 'center' })),
      ],
    },
    layout: layoutTabla,
  } as Content);
  out.push(firmasPdf([
    { rol: 'Elaborado por', nombre: rs.elaboro.nombre, cargo: rs.elaboro.cargo, detalle: rs.elaboro.colegiatura, fecha: rs.elaboro.fecha ? fechaLarga(rs.elaboro.fecha) : '' },
    { rol: 'Revisado por', nombre: rs.reviso.nombre, cargo: rs.reviso.cargo, detalle: rs.reviso.colegiatura, fecha: rs.reviso.fecha ? fechaLarga(rs.reviso.fecha) : '' },
    { rol: 'Aprobado por', nombre: rs.aprobo.nombre, cargo: rs.aprobo.cargo, detalle: rs.aprobo.colegiatura, fecha: rs.aprobo.fecha ? fechaLarga(rs.aprobo.fecha) : '' },
  ], W_V));
  if (c.aviso.trim()) {
    out.push({ text: 'AVISO Y ALCANCE DE USO', bold: true, fontSize: 9, color: AZUL, margin: [0, 14, 0, 4] } as Content);
    out.push({
      table: { widths: [W_V - 12], body: [[{ stack: c.aviso.split(/\n{2,}/).map((t) => ({ text: t.trim(), fontSize: 7.5, alignment: 'justify', margin: [0, 0, 0, 4], color: '#3B4B5C' })), fillColor: GRIS2 }]] },
      layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 2 : 0), vLineColor: () => AZUL, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 4 },
    } as Content);
  }
  return out;
}

// ------------------------------------------------------------ definición

export interface OpcionesPdf {
  secciones?: DocKey[];
}

export function definicionPdf(r: Resultados, op: OpcionesPdf = {}): TDocumentDefinitions {
  const m = r.proyecto.meta;
  const c = datosCabecera(r.proyecto);
  IMAGENES = new Map();
  // se registran antes de armar el contenido (el encabezado se evalúa al imprimir)
  for (const l of [c.logoProyectista, c.logoCliente, c.imagenPortada]) imagen(l, 1, 1);
  const incluir = new Set<DocKey>(op.secciones ?? SECCIONES_PDF.map((s) => s.clave));
  if (m.modo === 'publico') incluir.delete('carta');
  if (!m.fleteTarifaTon) incluir.delete('flete');
  if (!r.proyecto.tdr.entregables.length) incluir.delete('cumplimiento');
  const contenido: Content[] = [];
  const titulo = (texto: string, horizontal: boolean): Content =>
    ({ text: texto.toUpperCase(), style: 'seccion', tocItem: true, pageBreak: 'before', pageOrientation: horizontal ? 'landscape' : 'portrait' }) as Content;

  contenido.push(...caratula(r, c, ''));
  contenido.push(...controlDocumento(r, c, c.tipoDocumento));
  contenido.push({ toc: { title: { text: 'ÍNDICE', style: 'seccion' }, numberStyle: { fontSize: 9 }, textStyle: { fontSize: 9 } }, pageBreak: 'before' } as Content);

  const docBloques = (d: Documento) => {
    contenido.push(titulo(d.titulo, false));
    contenido.push(...bloquesPdf(d.bloques));
  };
  const docTabla = (t: Tabla, extra?: Content[]) => {
    const h = !!t.horizontal;
    contenido.push(titulo(t.titulo, h));
    contenido.push(cajetin(c, h ? W_H : W_V, t.subtitulo));
    contenido.push(...(h ? tablaAncha(t) : [tablaPdf(t, false)]));
    if (extra) contenido.push(...extra);
  };

  for (const s of SECCIONES_PDF) {
    if (!incluir.has(s.clave)) continue;
    switch (s.clave) {
      case 'carta': docBloques(cartaPresentacion(r)); break;
      case 'memoria': docBloques(memoriaDescriptiva(r)); break;
      case 'presupuesto_resumen': docTabla(tablaResumen(r)); break;
      case 'presupuesto_detallado': docTabla(tablaDetallado(r)); break;
      case 'apu': docTabla(tablaApu(r)); break;
      case 'insumos': docTabla(tablaInsumos(r)); break;
      case 'gg': docTabla(tablaGG(r)); break;
      case 'polinomica': docTabla(tablaPolinomica(r)); break;
      case 'flete': docTabla(tablaFlete(r)); break;
      case 'metrados': docTabla(tablaMetrados(r)); break;
      case 'programa':
        docTabla(tablaPrograma(r));
        contenido.push({ text: '', pageBreak: 'before', pageOrientation: 'landscape' } as Content);
        contenido.push(...gantt(r));
        break;
      case 'valorizado': docTabla(tablaValorizado(r), curvaS(r)); break;
      case 'adquisiciones': docTabla(tablaAdquisiciones(r)); break;
      case 'equipos': docTabla(tablaEquipos(r)); break;
      case 'personal': docTabla(tablaPersonal(r), histograma(r)); break;
      case 'desembolsos': docTabla(tablaDesembolsos(r)); break;
      case 'eett': docBloques(especificacionesTecnicas(r)); break;
      case 'cumplimiento': docBloques(matrizCumplimiento(r)); break;
      case 'consistencia': docBloques(reporteConsistencia(r)); break;
    }
  }

  const desc = m.foliacion === 'descendente';
  const corto = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [40, 66, 40, 44],
    info: { title: m.nombre, author: c.proyectista || r.proyecto.responsables.elaboro.nombre, subject: c.tipoDocumento, creator: 'Expediente Pro' },
    background: (pagina: number, size: { width: number; height: number }) =>
      pagina === 1 ? ({ canvas: [{ type: 'rect', x: 0, y: 0, w: size.width, h: 330, color: AZUL }] } as Content) : null,
    header: (pagina: number, _total: number, size: { width: number; height: number }) => {
      if (pagina === 1) return null;
      const w = size.width - 80;
      const lp = imagen(c.logoProyectista, 78, 26, 'left');
      const lc = imagen(c.logoCliente, 78, 26, 'right');
      return {
        margin: [40, 16, 40, 0],
        table: {
          widths: [84, w - 84 - 84 - 12, 84],
          body: [[
            lp ?? { text: c.proyectista, bold: true, fontSize: 7.5, color: AZUL },
            { stack: [{ text: `${corto(c.proyectista, 40)}${c.proyectista ? ' | ' : ''}${c.tipoDocumento}`, bold: true, fontSize: 6.8, color: AZUL }, { text: corto(m.nombre, 118), fontSize: 6.3, color: TENUE }], alignment: 'center' },
            lc ?? { text: corto(c.cliente, 40), fontSize: 7, color: TENUE, alignment: 'right' },
          ]],
        },
        layout: { hLineWidth: (i: number) => (i === 1 ? 0.8 : 0), vLineWidth: () => 0, hLineColor: () => AZUL, paddingBottom: () => 3, paddingLeft: () => 0, paddingRight: () => 0 },
      } as Content;
    },
    footer: (pagina: number, total: number, size: { width: number; height: number }) =>
      pagina === 1
        ? null
        : ({
            margin: [40, 10, 40, 0],
            table: {
              widths: [(size.width - 80) / 3 - 2, (size.width - 80) / 3 - 2, (size.width - 80) / 3 - 2],
              body: [[
                { text: [{ text: 'CÓDIGO ', bold: true }, c.codigoDocumento || '—'], fontSize: 7, color: TENUE },
                { text: `Revisión ${c.revision} · Página ${pagina} de ${total}`, fontSize: 7, color: TENUE, alignment: 'center' },
                { text: `FOLIO ${String(desc ? total - pagina + 1 : pagina).padStart(4, '0')}`, fontSize: 8, bold: true, alignment: 'right', color: AZUL },
              ]],
            },
            layout: { hLineWidth: (i: number) => (i === 0 ? 0.5 : 0), vLineWidth: () => 0, hLineColor: () => '#B8C3CF', paddingTop: () => 3, paddingLeft: () => 0, paddingRight: () => 0 },
          } as Content),
    content: contenido,
    images: Object.fromEntries([...IMAGENES.entries()].map(([url, k]) => [k, url])),
    defaultStyle: { font: 'Roboto', fontSize: 8.5, lineHeight: 1.15 },
    styles: {
      seccion: { fontSize: 12.5, bold: true, color: AZUL, margin: [0, 0, 0, 8] },
      h1: { fontSize: 11.5, bold: true, color: AZUL, margin: [0, 10, 0, 4] },
      h2: { fontSize: 10.5, bold: true, color: AZUL, margin: [0, 8, 0, 4] },
      h3: { fontSize: 9.5, bold: true, color: AZUL, margin: [0, 6, 0, 3] },
      h4: { fontSize: 9.2, bold: true, color: '#1F2B37', margin: [0, 6, 0, 2] },
    },
  };
}
