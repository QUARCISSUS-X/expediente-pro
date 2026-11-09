// Estado del proyecto abierto: edición inmutable (immer), deshacer/rehacer y autoguardado en el almacén local.
import { produce, type Draft } from 'immer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calcularTodo } from '../engine/index';
import type { Proyecto, Resultados } from '../engine/types';
import { guardarProyecto, recordarUltimo } from './almacen';

interface Historia {
  id: string;
  actual: Proyecto;
  pasado: Proyecto[];
  futuro: Proyecto[];
}

export type Actualizar = (fn: (d: Draft<Proyecto>) => void) => void;

export function useProyecto(inicial: { id: string; proyecto: Proyecto }) {
  const [h, setH] = useState<Historia>(() => ({ id: inicial.id, actual: inicial.proyecto, pasado: [], futuro: [] }));
  const [guardadoLocal, setGuardadoLocal] = useState<'guardado' | 'pendiente' | 'error'>('guardado');
  const [version, setVersion] = useState(0); // cambia cuando se guarda (para refrescar el panel de proyectos)

  const actualizar: Actualizar = useCallback((fn) => {
    setH((s) => {
      const n = produce(s.actual, fn);
      if (n === s.actual) return s;
      return { ...s, actual: n, pasado: [...s.pasado.slice(-79), s.actual], futuro: [] };
    });
  }, []);

  /** Reemplaza el contenido del proyecto abierto (queda en el historial). */
  const reemplazar = useCallback((p: Proyecto) => {
    setH((s) => ({ ...s, actual: p, pasado: [...s.pasado.slice(-79), s.actual], futuro: [] }));
  }, []);

  /** Abre otro proyecto del almacén (historial nuevo). */
  const omitir = useRef(true); // no se vuelve a guardar un proyecto solo por abrirlo
  const abrir = useCallback((id: string, p: Proyecto) => {
    omitir.current = true;
    setH({ id, actual: p, pasado: [], futuro: [] });
    recordarUltimo(id);
  }, []);

  const deshacer = useCallback(() => {
    setH((s) => (s.pasado.length ? { ...s, actual: s.pasado[s.pasado.length - 1], pasado: s.pasado.slice(0, -1), futuro: [s.actual, ...s.futuro] } : s));
  }, []);
  const rehacer = useCallback(() => {
    setH((s) => (s.futuro.length ? { ...s, actual: s.futuro[0], pasado: [...s.pasado, s.actual], futuro: s.futuro.slice(1) } : s));
  }, []);

  const resultados: Resultados = useMemo(() => calcularTodo(h.actual), [h.actual]);

  // autoguardado en el almacén del navegador
  const temporizador = useRef<number | undefined>(undefined);
  const pendiente = useRef<{ id: string; actual: Proyecto; resultados: Resultados } | null>(null);
  const escribir = useCallback(async () => {
    const p = pendiente.current;
    if (!p) return;
    pendiente.current = null;
    window.clearTimeout(temporizador.current);
    try {
      await guardarProyecto(p.id, p.actual, p.resultados);
      setGuardadoLocal('guardado');
      setVersion((v) => v + 1);
    } catch {
      setGuardadoLocal('error');
    }
  }, []);
  useEffect(() => {
    if (omitir.current) {
      omitir.current = false;
      recordarUltimo(h.id);
      return;
    }
    setGuardadoLocal('pendiente');
    window.clearTimeout(temporizador.current);
    pendiente.current = { id: h.id, actual: h.actual, resultados };
    temporizador.current = window.setTimeout(() => void escribir(), 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.actual, h.id]);
  // al desmontar (o cerrar la pestaña de escritorio) no se pierde el último cambio
  useEffect(() => () => void escribir(), [escribir]);

  /** Guarda de inmediato el cambio pendiente (sin esperar el autoguardado). */
  const guardarAhora = escribir;

  // atajos Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); rehacer(); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [deshacer, rehacer]);

  return {
    id: h.id,
    proyecto: h.actual,
    resultados,
    actualizar,
    reemplazar,
    abrir,
    deshacer,
    rehacer,
    puedeDeshacer: h.pasado.length > 0,
    puedeRehacer: h.futuro.length > 0,
    guardadoLocal,
    guardarAhora,
    version,
  };
}

export type Dialogo = 'biblioteca' | 'buscar' | 'calculadoraHH' | 'cuadrilla' | 'nuevo' | 'atajos' | null;

export type Contexto = ReturnType<typeof useProyecto> & {
  ir: (modulo: ModuloId, partidaId?: string) => void;
  avisar: (texto: string, error?: boolean) => void;
  partidaSel: string | null;
  setPartidaSel: (id: string | null) => void;
  dialogo: Dialogo;
  abrirDialogo: (d: Dialogo) => void;
  consultaInsumo: string;
  setConsultaInsumo: (q: string) => void;
  exportar: (tipo: import('./acciones').TipoExport, secciones?: import('../engine/types').DocKey[]) => void;
  ocupado: string | null;
  abrirArchivo: () => void;
  guardarArchivo: () => void;
  abrirProyectoId: (id: string) => Promise<void>;
  nuevoProyecto: (tipo: 'blanco' | 'ejemplo' | 'importar') => void;
  /** Llamar después de eliminar el proyecto abierto: abre otro o crea uno en blanco. */
  trasEliminar: (id: string) => Promise<void>;
};

export type ModuloId =
  | 'proyectos'
  | 'proyecto'
  | 'tdr'
  | 'presupuesto'
  | 'insumos'
  | 'gg'
  | 'programa'
  | 'cronogramas'
  | 'polinomica'
  | 'documentos'
  | 'validacion'
  | 'exportar';

export function descargar(nombre: string, datos: Uint8Array | string, tipo: string) {
  const blob = new Blob([typeof datos === 'string' ? datos : (datos as BlobPart)], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function elegirArchivos(aceptar: string): Promise<File[]> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = aceptar;
    i.multiple = true;
    i.onchange = () => resolve(i.files ? [...i.files] : []);
    i.click();
  });
}

export function elegirArchivo(aceptar: string): Promise<File | null> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = aceptar;
    i.onchange = () => resolve(i.files?.[0] ?? null);
    i.click();
  });
}

/** Lee una imagen (png, jpg o svg), la reduce si es muy grande y la devuelve como logo (PNG o JPG en base64). */
export async function leerLogo(f: File, maxAncho = 900): Promise<{ dataUrl: string; ancho: number; alto: number }> {
  const url = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(f);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('La imagen no se pudo leer.'));
    i.src = url;
  });
  const w0 = img.naturalWidth || 300;
  const h0 = img.naturalHeight || 120;
  const esSvg = /svg/i.test(f.type) || /\.svg$/i.test(f.name);
  const k = Math.min(1, maxAncho / w0);
  if (!esSvg && k === 1 && /^data:image\/(png|jpe?g)/i.test(url) && f.size < 400_000) return { dataUrl: url, ancho: w0, alto: h0 };
  const w = Math.round(esSvg ? Math.min(maxAncho, w0 * 2) : w0 * k);
  const h = Math.round((h0 / w0) * w);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, w, h);
  const foto = /jpe?g/i.test(f.type);
  return { dataUrl: c.toDataURL(foto ? 'image/jpeg' : 'image/png', 0.88), ancho: w, alto: h };
}
