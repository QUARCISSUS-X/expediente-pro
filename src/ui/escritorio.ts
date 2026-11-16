// Puente con la app de escritorio (Electron, carpeta electron/). En el navegador no existe y nada cambia.
// La app de escritorio abre cada proyecto en una pestaña propia y envía los comandos de su menú.
import type { ModuloId } from './estado';

export type ComandoEscritorio =
  | { tipo: 'ir'; modulo: ModuloId }
  | { tipo: 'guardar' }
  | { tipo: 'importar' }
  | { tipo: 'nuevo' }
  | { tipo: 'buscar' }
  | { tipo: 'deshacer' }
  | { tipo: 'rehacer' }
  | { tipo: 'atajos' }
  | { tipo: 'abrir-vinculado' };

export interface InfoPestana {
  id: string;
  nombre: string;
  codigo: string;
  guardando: boolean;
}

interface PuenteEscritorio {
  /** Informa a la ventana qué proyecto muestra esta pestaña (título, código y estado de guardado). */
  proyectoAbierto: (info: InfoPestana) => void;
  /** Si el proyecto ya está abierto en otra pestaña, la activa y devuelve true. */
  enfocarSiAbierto: (id: string) => Promise<boolean>;
  /** Abre el proyecto en una pestaña nueva (o activa la que ya lo tiene). */
  abrirEnPestanaNueva: (id: string) => void;
  /** Cierra las demás pestañas que mostraban un proyecto eliminado. */
  proyectoEliminado: (id: string) => void;
  /** 2.12: archivos en carpetas del usuario (solo rutas elegidas en un diálogo o abiertas con doble clic). */
  archivos?: ArchivosEscritorio;
}

export interface ArchivosEscritorio {
  guardarComo: (sugerido: string, filtros: { name: string; extensions: string[] }[]) => Promise<string | null>;
  abrir: (filtros: { name: string; extensions: string[] }[]) => Promise<string | null>;
  leer: (ruta: string) => Promise<{ datos: Uint8Array; modificado: number } | null>;
  escribir: (ruta: string, datos: Uint8Array) => Promise<number>;
  info: (ruta: string) => Promise<{ modificado: number } | null>;
}

export const escritorio: PuenteEscritorio | null =
  typeof window !== 'undefined' ? ((window as unknown as { expedienteEscritorio?: PuenteEscritorio }).expedienteEscritorio ?? null) : null;

/** Parámetros con los que la app de escritorio abre una pestaña: ?proyecto=<id> o ?nuevo=blanco|ejemplo. */
export function parametrosInicio(): { proyecto?: string; nuevo?: 'blanco' | 'ejemplo'; archivo?: string } {
  if (typeof location === 'undefined') return {};
  const q = new URLSearchParams(location.search);
  const nuevo = q.get('nuevo');
  return {
    proyecto: q.get('proyecto') || undefined,
    nuevo: nuevo === 'blanco' || nuevo === 'ejemplo' ? nuevo : undefined,
    archivo: q.get('archivo') || undefined, // ruta abierta con doble clic (.expediente, .expediente.json o .epdb)
  };
}

/** Funciones que la ventana de escritorio llama directamente en la página (lista de proyectos y guardado inmediato). */
export interface ApiPagina {
  listar: () => Promise<{ id: string; nombre: string; codigo: string; archivado: boolean; actualizado: string }[]>;
  guardarYa: () => Promise<void>;
  /** Comandos del menú de la ventana (se ejecutan con gesto de usuario, para poder abrir selectores de archivos). */
  comando: (c: ComandoEscritorio) => void;
}

export function publicarApiPagina(api: ApiPagina) {
  (window as unknown as { __expedientePro?: ApiPagina }).__expedientePro = api;
}
