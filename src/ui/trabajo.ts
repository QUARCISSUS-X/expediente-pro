// Lanza trabajos pesados (exportar, Monte Carlo) en un web worker para que la pantalla no se congele.
// Si el worker no se puede crear (política del navegador o de la extensión), el trabajo corre en la página.
import type { MensajeTrabajo, RespuestaTrabajo } from '../export/trabajador';

let disponible: boolean | null = typeof Worker === 'undefined' ? false : null;
let siguiente = 0;

async function crearWorker(): Promise<Worker> {
  // la web y la app de escritorio son un solo HTML: el worker va dentro; la extensión lo lleva en un archivo aparte
  const M = import.meta.env.MODE === 'extension' ? await import('../export/trabajador?worker') : await import('../export/trabajador?worker&inline');
  return new M.default();
}

export interface Trabajo<T> {
  promesa: Promise<T>;
  cancelar: () => void;
}

/** Corre `mensaje` en un worker propio (se cierra al terminar o al cancelar); `enPagina` es el respaldo sin worker. */
export function enSegundoPlano<T>(mensaje: MensajeTrabajo, enPagina: () => Promise<T>, alProgreso?: (p: string | number) => void): Trabajo<T> {
  let w: Worker | null = null;
  let cancelado = false;
  const promesa = (async () => {
    if (disponible === false) return enPagina();
    try {
      w = await crearWorker();
    } catch {
      disponible = false;
      return enPagina();
    }
    const id = ++siguiente;
    return new Promise<T>((resolver, rechazar) => {
      const cerrar = () => { w?.terminate(); w = null; };
      w!.onmessage = (e: MessageEvent<RespuestaTrabajo>) => {
        const m = e.data;
        if (m.id !== id || cancelado) return;
        if ('progreso' in m) return alProgreso?.(m.progreso);
        disponible = true;
        cerrar();
        if (m.ok) resolver(m.valor as T);
        else rechazar(new Error(m.error));
      };
      // el worker no llegó a cargar (p. ej. la política de seguridad no lo permite): se hace en la página
      w!.onerror = (e) => {
        e.preventDefault();
        cerrar();
        if (cancelado) return;
        disponible = false;
        enPagina().then(resolver, rechazar);
      };
      w!.postMessage({ ...mensaje, id });
    });
  })();
  return { promesa, cancelar: () => { cancelado = true; w?.terminate(); w = null; } };
}
