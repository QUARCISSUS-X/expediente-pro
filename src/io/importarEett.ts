// Lee las especificaciones técnicas de un expediente en Word (.docx) para conservar su redacción:
// especificaciones generales (objetivo, alcance, normativa, definiciones, consideraciones) y, por partida,
// descripción, mano de obra, materiales, equipos, procedimiento, aceptación, medición y pago.
import JSZip from 'jszip';
import type { Partida, Proyecto, SeccionesEett, TextosEett } from '../engine/types';
import { normalizarUnidad } from '../engine/util';
import type { Observacion } from './importarExpediente';

interface Parrafo { estilo: string; nivel: number; lista: boolean; texto: string }
export interface EspecificacionLeida { titulo: string; nivel: number; unidad: string; secciones: Partial<SeccionesEett>; orden: number; remite?: string }
export interface EettLeidas { generales: Partial<TextosEett>; especificaciones: EspecificacionLeida[]; indice: string[] }

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => sinTildes(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const SECCION: [RegExp, keyof SeccionesEett][] = [
  [/^descripcion( de la partida)?$/, 'descripcion'],
  [/^mano de obra$/, 'manoObra'],
  [/^materiales?$/, 'materiales'],
  [/^equipos?( y herramientas?)?$|^herramientas y equipos?$/, 'equipos'],
  [/^(procedimiento constructivo|proceso constructivo|metodo de ejecucion|metodo constructivo|ejecucion)$/, 'metodo'],
  [/^(aceptacion de los trabajos|control de calidad|criterios? de aceptacion|calidad)$/, 'calidad'],
  [/^(metodo de medicion|medicion|unidad y metodo de medicion)$/, 'medicion'],
  [/^(forma de pago|bases? de pago|condiciones de pago|pago)$/, 'pago'],
];
const GENERAL: [RegExp, keyof TextosEett][] = [
  [/^objetivos?$/, 'objetivo'],
  [/^alcances?$/, 'alcance'],
  [/^normativa( aplicable)?$|^normas( aplicables)?$/, 'normativa'],
  [/^definiciones$/, 'definiciones'],
  [/^consideraciones( generales)?$/, 'consideraciones'],
];

/** Extrae los párrafos (texto, estilo de título y viñetas) del documento. */
async function parrafos(datos: Uint8Array | ArrayBuffer): Promise<Parrafo[]> {
  const zip = await JSZip.loadAsync(datos);
  const xml = await zip.file('word/document.xml')!.async('string');
  const estilosXml = (await zip.file('word/styles.xml')?.async('string')) ?? '';
  // nivel de título de cada estilo (Ttulo1, Heading2, Título 3…): por su outlineLvl o por su nombre
  const nivelEstilo = new Map<string, number>();
  for (const m of estilosXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const nombre = m[2].match(/<w:name w:val="([^"]+)"/)?.[1] ?? '';
    const ol = m[2].match(/<w:outlineLvl w:val="(\d)"/)?.[1];
    const n = /^(heading|t[ií]tulo|ttulo)\s*(\d)$/i.exec(nombre.replace(/\s+/g, ' ').trim()) ?? /^(heading|ttulo|titulo)(\d)$/i.exec(m[1]);
    if (n) nivelEstilo.set(m[1], parseInt(n[2], 10));
    else if (ol !== undefined && !/toc|tdc/i.test(m[1])) nivelEstilo.set(m[1], parseInt(ol, 10) + 1);
  }
  const out: Parrafo[] = [];
  for (const m of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const estilo = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? '';
    const texto = [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map((x) => (x[1] === undefined ? ' ' : x[1])).join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    out.push({ estilo, nivel: nivelEstilo.get(estilo) ?? 0, lista: /<w:numPr>/.test(p) || /^[-•●▪]\s/.test(texto), texto });
  }
  void W;
  return out;
}

export async function leerEettDocx(datos: Uint8Array | ArrayBuffer): Promise<EettLeidas> {
  const ps = await parrafos(datos);
  const indice = ps.filter((x) => /^(toc|tdc)\s*\d/i.test(x.estilo)).map((x) => x.texto);
  const cuerpo = ps.filter((x) => !/^(toc|tdc)\s*\d/i.test(x.estilo));
  const generales: Partial<TextosEett> = {};
  const especificaciones: EspecificacionLeida[] = [];
  let actual: EspecificacionLeida | null = null;
  let seccion: keyof SeccionesEett | null = null;
  let general: keyof TextosEett | null = null;
  let enGenerales = false;
  const agregar = (obj: Record<string, string | undefined>, k: string, p: Parrafo) => {
    const linea = p.lista ? `- ${p.texto.replace(/^[-•●▪]\s*/, '')}` : p.texto;
    const prev = obj[k];
    obj[k] = prev ? `${prev}${p.lista && /(^|\n)- [^\n]*$/.test(prev) ? '\n' : '\n\n'}${linea}` : linea;
  };
  for (let i = 0; i < cuerpo.length; i++) {
    const p = cuerpo[i];
    const n = norm(p.texto);
    if (p.nivel > 0) {
      seccion = null;
      general = null;
      if (/especificaciones generales/.test(n)) { enGenerales = true; actual = null; continue; }
      enGenerales = false;
      // título de partida si en los siguientes párrafos aparece la unidad de medida
      const siguiente = cuerpo.slice(i + 1, i + 4).find((x) => /^unidad de medida/.test(norm(x.texto)));
      const antesDeOtroTitulo = cuerpo.slice(i + 1, i + 4).findIndex((x) => x.nivel > 0);
      const idxUnidad = cuerpo.slice(i + 1, i + 4).findIndex((x) => /^unidad de medida/.test(norm(x.texto)));
      if (siguiente && (antesDeOtroTitulo < 0 || idxUnidad < antesDeOtroTitulo)) {
        actual = { titulo: p.texto.replace(/^[\d.]+\s*/, ''), nivel: p.nivel, unidad: siguiente.texto.replace(/^unidad de medida\s*:?\s*/i, '').trim(), secciones: {}, orden: especificaciones.length };
        especificaciones.push(actual);
      } else actual = null;
      continue;
    }
    if (enGenerales) {
      const g = GENERAL.find(([re]) => re.test(n));
      if (g && p.texto.length < 40) { general = g[1]; continue; }
      if (general) agregar(generales as Record<string, string | undefined>, general, p);
      continue;
    }
    if (!actual) continue;
    if (/^unidad de medida/.test(n)) continue;
    const s = SECCION.find(([re]) => re.test(n));
    if (s && p.texto.length < 45) { seccion = s[1]; continue; }
    agregar(actual.secciones as Record<string, string | undefined>, seccion ?? 'descripcion', p);
  }
  // especificaciones que solo remiten a otra ("Se ejecutará conforme a lo establecido en la partida …")
  for (const e of especificaciones) {
    const llenas = Object.values(e.secciones).filter((x) => x && x.trim()).length;
    const m = (e.secciones.descripcion ?? '').match(/conforme a lo (?:establecido|indicado|especificado) en la (?:partida|especificaci[oó]n)[^"“”]*["“”]([^"“”]+)["“”]/i);
    if (llenas <= 1 && m) e.remite = m[1].trim();
  }
  return { generales, especificaciones, indice };
}

function similitud(a: string, b: string): number {
  const vac = new Set(['de', 'la', 'el', 'los', 'las', 'con', 'en', 'para', 'por', 'del', 'al', 'inc', 'incluye', 'y']);
  const ta = new Set(norm(a).split(' ').filter((x) => x.length > 1 && !vac.has(x)));
  const tb = new Set(norm(b).split(' ').filter((x) => x.length > 1 && !vac.has(x)));
  if (!ta.size || !tb.size) return 0;
  let c = 0;
  for (const x of ta) if (tb.has(x)) c++;
  return c / Math.max(ta.size, tb.size);
}

/** Copia la redacción de las EETT a las partidas del presupuesto (por orden y nombre) y anota las diferencias. */
export function aplicarEett(p: Proyecto, e: EettLeidas, obs: Observacion[], documento = 'Especificaciones técnicas'): { asignadas: number } {
  const ob = (ubicacion: string, tipo: Observacion['tipo'], detalle: string, correccion: string) => obs.push({ documento, ubicacion, tipo, detalle, correccion });
  for (const [k, v] of Object.entries(e.generales)) if (v) (p.textosEett as unknown as Record<string, string>)[k] = v;
  const hojas = p.partidas.filter((x) => !x.titulo).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  const usadas = new Set<number>();
  let k = 0;
  let asignadas = 0;
  const asignar = (pt: Partida, es: EspecificacionLeida) => {
    usadas.add(es.orden);
    const x = p.partidas.find((y) => y.id === pt.id)!;
    let secciones = es.secciones;
    if (es.remite) {
      const fuente = e.especificaciones
        .filter((y) => y !== es && !y.remite && Object.values(y.secciones).filter(Boolean).length >= 3)
        .map((y) => ({ y, s: norm(y.titulo) === norm(es.remite!) ? 2 : similitud(y.titulo, es.remite!) }))
        .sort((a, b) => b.s - a.s)[0];
      if (fuente && fuente.s >= 0.6) {
        secciones = { ...fuente.y.secciones };
        ob(`Partida ${pt.codigo}`, 'Formato', `La especificación solo remite a "${es.remite}" ("Se ejecutará conforme a lo establecido en…").`, 'Se copió el texto completo de la especificación de referencia para que cada partida tenga su especificación completa y autosuficiente.');
      }
    }
    x.eettTexto = { ...secciones };
    asignadas++;
    const esp = (s: string) => s.match(/e\s*=\s*([\d.]+)\s*(cm|m)\b/i)?.slice(1, 3).join('');
    const a = esp(es.titulo), b = esp(pt.descripcion);
    const enM = (s?: string) => (s ? (s.endsWith('cm') ? parseFloat(s) / 100 : parseFloat(s)) : NaN);
    if (a && b && Math.abs(enM(a) - enM(b)) > 1e-9) ob(`Partida ${pt.codigo}`, 'Consistencia', `El espesor de la especificación "${es.titulo}" (e=${a}) no coincide con el del presupuesto (e=${b}).`, 'Unificar el espesor en planos, metrados, presupuesto, APU, EETT y cronograma.');
    if (es.unidad && normalizarUnidad(es.unidad) !== normalizarUnidad(pt.unidad)) ob(`Partida ${pt.codigo}`, 'Consistencia', `Unidad de medida de la EETT (${es.unidad}) distinta de la del presupuesto (${pt.unidad}).`, 'Usar la misma unidad en todos los documentos.');
    const faltan = (['descripcion', 'materiales', 'equipos', 'metodo', 'calidad', 'medicion', 'pago'] as (keyof SeccionesEett)[]).filter((s) => !secciones[s]?.trim());
    if (faltan.length) ob(`Partida ${pt.codigo}`, 'Formato', `A la especificación le faltan secciones: ${faltan.join(', ')}.`, 'Completar las ocho secciones (descripción, mano de obra, materiales, equipos, procedimiento, aceptación, medición y pago); Expediente Pro completa las faltantes con su plantilla y con los recursos del APU.');
  };
  for (const pt of hojas) {
    let mejor = -1;
    let s = 0;
    for (let j = Math.max(0, k - 3); j < Math.min(e.especificaciones.length, k + 4); j++) {
      if (usadas.has(j)) continue;
      const sm = similitud(pt.descripcion, e.especificaciones[j].titulo);
      if (sm > s) { s = sm; mejor = j; }
    }
    if (mejor >= 0 && s >= 0.3) {
      if (mejor < k - 0) ob(`Partida ${pt.codigo}`, 'Formato', `La especificación "${e.especificaciones[mejor].titulo}" está en otro orden que en el presupuesto.`, 'Ordenar las EETT con el mismo orden y numeración del presupuesto.');
      asignar(pt, e.especificaciones[mejor]);
      k = Math.max(k, mejor + 1);
    } else ob(`Partida ${pt.codigo}`, 'Consistencia', `La partida ${pt.codigo} ${pt.descripcion} no tiene especificación técnica.`, 'Redactar su especificación (Expediente Pro usa la plantilla que corresponda).');
  }
  for (let j = 0; j < e.especificaciones.length; j++) if (!usadas.has(j)) ob(`EETT "${e.especificaciones[j].titulo}"`, 'Consistencia', 'Especificación sin partida en el presupuesto.', 'Retirar la especificación o agregar la partida.');
  // índice: numeración distinta a la del presupuesto y entradas sin página
  if (e.indice.length) {
    const sinPagina = e.indice.filter((x) => !/\d+\s*$/.test(x));
    const numeros = e.indice.map((x) => x.match(/^([\d.]+)\s/)?.[1]).filter(Boolean) as string[];
    const estiloCorto = numeros.some((n) => /^\d\.\d(\.|$)/.test(n));
    const estiloPpto = hojas.some((h) => /^\d{2}\./.test(h.codigo));
    if (estiloCorto && estiloPpto) ob('Tabla de contenido', 'Formato', `La numeración de las EETT (${numeros.slice(2, 4).join(', ')}…, numeración automática de Word) no coincide con los ítems del presupuesto (${hojas.slice(0, 2).map((h) => h.codigo).join(', ')}…).`, 'Numerar cada especificación con el ítem del presupuesto; Expediente Pro usa los mismos códigos en metrados, presupuesto, APU, EETT y cronograma.');
    if (sinPagina.length) ob('Tabla de contenido', 'Formato', `${sinPagina.length} entradas del índice no tienen número de página (p. ej., "${sinPagina[0].slice(0, 60)}").`, 'Actualizar el índice; los documentos de Expediente Pro traen el índice con sus páginas.');
  }
  return { asignadas };
}
