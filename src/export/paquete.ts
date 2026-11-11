// Genera todos los archivos del expediente y el ZIP. El render del PDF se inyecta (navegador o Node).
import JSZip from 'jszip';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { cartaPresentacion, especificacionesTecnicas, informeObservaciones, matrizCumplimiento, memoriaDescriptiva, reporteConsistencia } from '../engine/documentos';
import type { DocKey, Resultados } from '../engine/types';
import { generarDocx } from './docx';
import { generarMsProject } from './msproject';
import { definicionPdfEjecutivo, generarXlsxGerencial } from './gerencial';
import { definicionPdf } from './pdfdoc';
import { generarXlsx } from './xlsx';

export type RenderPdf = (def: TDocumentDefinitions) => Promise<Uint8Array>;

export interface Archivo {
  nombre: string;
  tipo: string;
  datos: Uint8Array;
}

export const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  xml: 'application/xml',
  json: 'application/json',
  zip: 'application/zip',
};

const texto = (s: string) => new TextEncoder().encode(s);

export function nombreBase(r: Resultados): string {
  return (r.proyecto.meta.codigo || 'Expediente').replace(/[^\w.-]+/g, '_');
}

export async function archivoExcel(r: Resultados): Promise<Archivo> {
  return { nombre: `${nombreBase(r)}_Presupuesto_y_cronogramas.xlsx`, tipo: MIME.xlsx, datos: await generarXlsx(r) };
}
export async function archivoEett(r: Resultados): Promise<Archivo> {
  const nombre = `${nombreBase(r)}_Especificaciones_tecnicas.docx`;
  return { nombre, tipo: MIME.docx, datos: await generarDocx(especificacionesTecnicas(r), r, { nombreArchivo: nombre }) };
}
export async function archivoMemoria(r: Resultados): Promise<Archivo> {
  const nombre = `${nombreBase(r)}_Memoria_descriptiva.docx`;
  return { nombre, tipo: MIME.docx, datos: await generarDocx(memoriaDescriptiva(r), r, { nombreArchivo: nombre }) };
}
export async function archivoCarta(r: Resultados): Promise<Archivo> {
  const nombre = `${nombreBase(r)}_Carta_de_presentacion.docx`;
  return { nombre, tipo: MIME.docx, datos: await generarDocx(cartaPresentacion(r), r, { nombreArchivo: nombre }) };
}
export async function archivoMatriz(r: Resultados): Promise<Archivo> {
  const nombre = `${nombreBase(r)}_Matriz_cumplimiento_TdR.docx`;
  return { nombre, tipo: MIME.docx, datos: await generarDocx(matrizCumplimiento(r), r, { nombreArchivo: nombre }) };
}
export async function archivoConsistencia(r: Resultados): Promise<Archivo> {
  const nombre = `${nombreBase(r)}_Reporte_de_consistencia.docx`;
  return { nombre, tipo: MIME.docx, datos: await generarDocx(reporteConsistencia(r), r, { nombreArchivo: nombre }) };
}
export async function archivoObservaciones(r: Resultados): Promise<Archivo | null> {
  const d = informeObservaciones(r);
  if (!d) return null;
  const nombre = `${nombreBase(r)}_Informe_de_revision_del_expediente.docx`;
  return { nombre, tipo: MIME.docx, datos: await generarDocx(d, r, { nombreArchivo: nombre }) };
}
export function archivoMsProject(r: Resultados): Archivo {
  return { nombre: `${nombreBase(r)}_Programa_MSProject.xml`, tipo: MIME.xml, datos: texto(generarMsProject(r)) };
}
export async function archivoPdf(r: Resultados, render: RenderPdf, secciones?: DocKey[]): Promise<Archivo> {
  return { nombre: `${nombreBase(r)}_Expediente_consolidado.pdf`, tipo: MIME.pdf, datos: await render(definicionPdf(r, { secciones })) };
}
export async function archivoEjecutivo(r: Resultados, render: RenderPdf): Promise<Archivo> {
  return { nombre: `${nombreBase(r)}_Informe_ejecutivo.pdf`, tipo: MIME.pdf, datos: await render(definicionPdfEjecutivo(r)) };
}
export async function archivoGerencial(r: Resultados): Promise<Archivo> {
  return { nombre: `${nombreBase(r)}_Reporte_gerencial.xlsx`, tipo: MIME.xlsx, datos: await generarXlsxGerencial(r) };
}
export function archivoProyecto(r: Resultados): Archivo {
  return { nombre: `${nombreBase(r)}.expediente.json`, tipo: MIME.json, datos: texto(JSON.stringify(r.proyecto, null, 2)) };
}

export async function generarTodos(r: Resultados, render: RenderPdf, progreso?: (paso: string) => void): Promise<Archivo[]> {
  const out: Archivo[] = [];
  const paso = async (nombre: string, f: () => Promise<Archivo> | Archivo) => {
    progreso?.(nombre);
    out.push(await f());
  };
  await paso('Excel', () => archivoExcel(r));
  await paso('Especificaciones técnicas', () => archivoEett(r));
  await paso('Memoria descriptiva', () => archivoMemoria(r));
  if (r.proyecto.meta.modo === 'privado') await paso('Carta de presentación', () => archivoCarta(r));
  await paso('Matriz del TdR', () => archivoMatriz(r));
  await paso('Reporte de consistencia', () => archivoConsistencia(r));
  if (r.proyecto.origen) {
    progreso?.('Informe de revisión');
    const a = await archivoObservaciones(r);
    if (a) out.push(a);
  }
  await paso('MS Project', () => archivoMsProject(r));
  await paso('PDF consolidado', () => archivoPdf(r, render));
  await paso('Informe ejecutivo', () => archivoEjecutivo(r, render));
  await paso('Reporte gerencial', () => archivoGerencial(r));
  await paso('Proyecto', () => archivoProyecto(r));
  return out;
}

export async function empaquetarZip(archivos: Archivo[], carpeta: string): Promise<Uint8Array> {
  const zip = new JSZip();
  const dir = zip.folder(carpeta)!;
  for (const a of archivos) dir.file(a.nombre, a.datos);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
