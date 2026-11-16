// Proyecto abierto unido a un archivo en una carpeta del usuario: «Guardar» elige el archivo una vez y desde entonces
// cada guardado local también lo escribe (autoguardado al archivo). Al abrir, si el archivo cambió en otra computadora
// (OneDrive, Dropbox), ofrece cargar esa versión.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Proyecto } from '../engine/types';
import { leerJson } from '../io/estructura';
import { conEsquema, esSoloLectura, migrarProyecto } from '../io/migrar';
import { descargar } from './estado';
import { cambioAfuera, desvincular, escribirVinculo, leerArchivoVinculado, leerVinculo, marcarLeido, puedeVincular, SinPermiso, vincularExistente, vincularNuevo, type FiltroArchivo, type Vinculo } from './vinculo';

export const FILTRO_PROYECTO: FiltroArchivo = { descripcion: 'Proyecto de Expediente Pro', extensiones: ['expediente', 'json'], mime: 'application/json' };

export const textoProyecto = (p: Proyecto) => JSON.stringify(conEsquema(p), null, 1);
export const proyectoDeArchivo = (datos: Uint8Array, nombre: string) => migrarProyecto(leerJson(new TextDecoder().decode(datos), nombre));

export type EstadoVinculo = 'ok' | 'escribiendo' | 'permiso' | 'error';

interface Opciones {
  id: string;
  version: number; // cambia con cada guardado local
  proyecto: Proyecto;
  reemplazar: (p: Proyecto) => void;
  avisar: (t: string, error?: boolean) => void;
}

export function useVinculo({ id, version, proyecto, reemplazar, avisar }: Opciones) {
  const [vinculo, setVinculo] = useState<Vinculo | null>(null);
  const [estado, setEstado] = useState<EstadoVinculo>('ok');
  const proyectoRef = useRef(proyecto);
  proyectoRef.current = proyecto;
  const ultimaVersion = useRef(version);

  // al cambiar de proyecto: leer su vínculo y comprobar si el archivo cambió afuera
  useEffect(() => {
    let vivo = true;
    setVinculo(null);
    setEstado('ok');
    ultimaVersion.current = version;
    void (async () => {
      const v = await leerVinculo(id).catch(() => null);
      if (!vivo || !v) return;
      setVinculo(v);
      if (!(await cambioAfuera(v))) return;
      if (!window.confirm(`El archivo ${v.nombre} cambió fuera de este programa (por ejemplo, en otra computadora).\n\n¿Cargar esa versión? Si elige Cancelar, se conserva la de aquí y el archivo se sobrescribe al guardar.`)) return;
      try {
        const l = await leerArchivoVinculado(v);
        const p = proyectoDeArchivo(l.datos, v.nombre);
        setVinculo(await marcarLeido(v, l.modificado));
        reemplazar(p);
        avisar(`Se cargó la versión de ${v.nombre}.`);
      } catch (e) {
        avisar(`No se pudo leer ${v.nombre}: ${(e as Error).message}`, true);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const escribir = useCallback(async (v: Vinculo, pedirPermiso: boolean) => {
    if (esSoloLectura(proyectoRef.current)) return v;
    setEstado('escribiendo');
    try {
      const n = await escribirVinculo(v, textoProyecto(proyectoRef.current), pedirPermiso);
      setVinculo(n);
      setEstado('ok');
      return n;
    } catch (e) {
      setEstado(e instanceof SinPermiso ? 'permiso' : 'error');
      if (!(e instanceof SinPermiso)) avisar(`No se pudo escribir ${v.nombre}: ${(e as Error).message}`, true);
      return v;
    }
  }, [avisar]);

  // autoguardado al archivo: después de cada guardado local
  useEffect(() => {
    if (version === ultimaVersion.current) return;
    ultimaVersion.current = version;
    if (vinculo && estado !== 'permiso') void escribir(vinculo, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  /** Guardar (Ctrl+S): con vínculo, escribe ya; sin vínculo, elige el archivo; sin API de archivos, descarga. */
  const guardar = useCallback(async () => {
    const p = proyectoRef.current;
    const base = (p.meta.codigo || p.meta.nombre || 'proyecto').replace(/[^\w.-]+/g, '_').slice(0, 60);
    try {
      if (vinculo) {
        const n = await escribir(vinculo, true);
        if (n.escrito !== vinculo.escrito) avisar(`Guardado en ${n.nombre}`);
        return;
      }
      if (!puedeVincular()) {
        descargar(`${base}.expediente.json`, textoProyecto(p), 'application/json');
        return avisar('Proyecto descargado como archivo .expediente.json');
      }
      const v = await vincularNuevo(id, `${base}.expediente`, FILTRO_PROYECTO);
      if (!v) return;
      await escribir(v, true);
      avisar(`Guardado en ${v.nombre}. Desde ahora cada cambio se guarda también en ese archivo.`);
    } catch (e) {
      avisar(`No se pudo guardar: ${(e as Error).message}`, true);
    }
  }, [vinculo, escribir, id, avisar]);

  const quitar = useCallback(async () => {
    await desvincular(id);
    setVinculo(null);
    setEstado('ok');
    avisar('El proyecto ya no se guarda en el archivo; sigue guardándose en este equipo.');
  }, [id, avisar]);

  return { vinculo, estado, guardar, quitar, reactivar: () => vinculo && void escribir(vinculo, true) };
}

/** Elige un archivo de proyecto, lo lee y devuelve el proyecto y el vínculo (con id provisional; se reasigna al crearlo). */
export async function abrirProyectoVinculado(): Promise<{ proyecto: Proyecto; vinculo: Vinculo } | null> {
  const r = await vincularExistente('pendiente', FILTRO_PROYECTO);
  if (!r) return null;
  await desvincular('pendiente');
  return { proyecto: proyectoDeArchivo(r.datos, r.vinculo.nombre), vinculo: r.vinculo };
}
