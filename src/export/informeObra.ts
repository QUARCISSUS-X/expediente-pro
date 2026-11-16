// Informe semanal y mensual de obra en Word y PDF (con los logos que elija el constructor) y llenado de plantillas de Word propias.
import JSZip from 'jszip';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { PlantillaInforme } from '../engine/control';
import { type DatosInforme, documentoInforme, type OpcionesInforme } from '../engine/informe';
import type { Resultados } from '../engine/types';
import { generarDocx } from './docx';
import { definicionPdfDocumento } from './pdfdoc';

/** El proyecto con solo los logos que pidió la plantilla del informe (no modifica el original). */
function conLogos(r: Resultados, pl?: PlantillaInforme): Resultados {
  if (!pl || (pl.logoProyectista && pl.logoCliente)) return r;
  const e = r.proyecto.entidades;
  const sin = <T extends { logo?: unknown }>(x: T, quitar: boolean): T => (quitar ? { ...x, logo: undefined } : x);
  const entidades = { ...e, proyectista: sin(e.proyectista, !pl.logoProyectista), cliente: sin(e.cliente, !pl.logoCliente), propietario: sin(e.propietario, !pl.logoCliente) };
  return { ...r, proyecto: { ...r.proyecto, entidades } };
}

export function nombreInforme(r: Resultados, d: DatosInforme, ext: string): string {
  const base = (r.proyecto.meta.codigo || r.proyecto.meta.nombre || 'Proyecto').replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
  return `${base}_Informe_${d.periodo.tipo}_${d.periodo.inicio}.${ext}`;
}

export async function informeWord(r: Resultados, d: DatosInforme, op: OpcionesInforme = {}): Promise<Uint8Array> {
  const rr = conLogos(r, op.plantilla);
  return generarDocx(documentoInforme(rr, d, op), rr, { nombreArchivo: nombreInforme(r, d, 'docx') });
}

export function informePdf(r: Resultados, d: DatosInforme, op: OpcionesInforme = {}): TDocumentDefinitions {
  const rr = conLogos(r, op.plantilla);
  return definicionPdfDocumento(rr, documentoInforme(rr, d, op));
}

// ------------------------------------------------------------ plantillas de Word propias

const escaparXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Reemplaza los marcadores {{nombre}} de un párrafo de Word. Word suele partir el texto en varios fragmentos (w:t), así
 * que si el párrafo tiene un marcador se junta su texto en el primer fragmento y los demás quedan vacíos.
 * Los saltos de línea del valor salen como saltos de línea de Word.
 */
function llenarParrafo(p: string, vars: Record<string, string>, faltantes: Set<string>): string {
  const re = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g;
  const trozos = [...p.matchAll(re)];
  const texto = trozos.map((m) => m[2]).join('');
  if (!/\{\{\s*\w+\s*\}\}/.test(texto.replace(/&amp;/g, '&'))) return p;
  const nuevo = texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    if (!(k in vars)) { faltantes.add(k); return `{{${k}}}`; }
    return escaparXml(vars[k]).split('\n').join('</w:t><w:br/><w:t xml:space="preserve">');
  });
  let i = 0;
  return p.replace(re, () => (i++ === 0 ? `<w:t xml:space="preserve">${nuevo}</w:t>` : '<w:t></w:t>'));
}

/** Llena una plantilla .docx del usuario con los valores del informe. Devuelve el archivo y los marcadores que no existen. */
export async function llenarPlantillaWord(plantilla: Uint8Array, vars: Record<string, string>): Promise<{ datos: Uint8Array; faltantes: string[] }> {
  const zip = await JSZip.loadAsync(plantilla);
  const faltantes = new Set<string>();
  const partes = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
  if (!partes.includes('word/document.xml')) throw new Error('El archivo no es un documento de Word (.docx).');
  for (const n of partes) {
    const xml = await zip.file(n)!.async('string');
    zip.file(n, xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => llenarParrafo(p, vars, faltantes)));
  }
  const datos = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { datos, faltantes: [...faltantes] };
}
