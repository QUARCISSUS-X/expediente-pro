// Fotos y adjuntos de obra (por partida, protocolo o asiento del cuaderno): el archivo va al almacén `adjuntos` de IndexedDB
// y el proyecto solo guarda la referencia (control.adjuntos), así el proyecto no crece con las fotos.
import type { Adjunto } from '../engine/control';
import type { Logo } from '../engine/types';
import { abrirDb, tx } from './almacen';

interface RegistroAdjunto {
  id: string;
  proyectoId: string;
  datos: Blob;
}

const ANCHO_MAX = 1600; // las fotos se reducen a este ancho antes de guardarse

export const nuevoIdAdjunto = () => `adj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function base(): Promise<IDBDatabase> {
  const db = await abrirDb();
  if (!db) throw new Error('Este navegador no permite guardar fotos y adjuntos (sin IndexedDB).');
  return db;
}

/** Reduce una foto grande (JPEG) para que el informe y el almacén no pesen de más. */
async function reducirImagen(f: File): Promise<{ blob: Blob; ancho: number; alto: number }> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error(`No se pudo leer la imagen ${f.name}.`)); i.src = url; });
    const k = Math.min(1, ANCHO_MAX / Math.max(1, img.naturalWidth));
    const ancho = Math.round(img.naturalWidth * k), alto = Math.round(img.naturalHeight * k);
    if (k === 1 && /jpe?g|png/i.test(f.type)) return { blob: f, ancho, alto };
    const cv = document.createElement('canvas');
    cv.width = ancho;
    cv.height = alto;
    cv.getContext('2d')!.drawImage(img, 0, 0, ancho, alto);
    const blob = await new Promise<Blob>((ok) => cv.toBlob((b) => ok(b ?? f), 'image/jpeg', 0.85));
    return { blob, ancho, alto };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Guarda el archivo y devuelve la referencia que se agrega al proyecto. */
export async function guardarAdjunto(proyectoId: string, f: File, datos: Partial<Adjunto>): Promise<Adjunto> {
  const db = await base();
  const esImagen = /^image\//.test(f.type);
  const { blob, ancho, alto } = esImagen ? await reducirImagen(f) : { blob: f as Blob, ancho: undefined, alto: undefined };
  const id = nuevoIdAdjunto();
  await tx(db, 'readwrite', (s) => s.put({ id, proyectoId, datos: blob } satisfies RegistroAdjunto), 'adjuntos');
  const fecha = datos.fecha || new Date(f.lastModified || Date.now()).toISOString().slice(0, 10);
  return { id, nombre: f.name, tipo: blob.type || f.type || 'application/octet-stream', tamano: blob.size, fecha, descripcion: '', ...datos, ...(ancho ? { ancho, alto } : {}) };
}

export async function leerAdjunto(id: string): Promise<Blob | null> {
  const db = await base();
  const r = await tx<RegistroAdjunto | undefined>(db, 'readonly', (s) => s.get(id) as IDBRequest<RegistroAdjunto | undefined>, 'adjuntos');
  return r?.datos ?? null;
}

export async function eliminarAdjunto(id: string): Promise<void> {
  const db = await base();
  await tx(db, 'readwrite', (s) => s.delete(id), 'adjuntos');
}

const comoDataUrl = (b: Blob) => new Promise<string>((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => mal(fr.error); fr.readAsDataURL(b); });

/** Imágenes de los adjuntos (para el informe): id → Logo. Las que no se encuentran se omiten. */
export async function imagenesDe(adjuntos: Adjunto[]): Promise<Record<string, Logo>> {
  const out: Record<string, Logo> = {};
  for (const a of adjuntos) {
    try {
      const b = await leerAdjunto(a.id);
      if (b) out[a.id] = { dataUrl: await comoDataUrl(b), ancho: a.ancho ?? 800, alto: a.alto ?? 600 };
    } catch {
      /* foto no disponible en este equipo */
    }
  }
  return out;
}
