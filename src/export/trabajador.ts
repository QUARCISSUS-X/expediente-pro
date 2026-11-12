// Trabajo en segundo plano (web worker): genera entregables y corre la simulación Monte Carlo sin congelar la pantalla.
// Lo usa src/ui/trabajo.ts; si el navegador no permite workers, el mismo trabajo corre en la página.
/// <reference lib="webworker" />
import { calcularTodo } from '../engine/index';
import { Simulacion, type EntradaSimulacion } from '../engine/riesgo';
import type { Proyecto, Resultados } from '../engine/types';
import { generarExport, type TipoExport } from './registro';
import { renderPdfBrowser } from './render-browser';

export type MensajeTrabajo =
  | { tarea: 'exportar'; proyecto: Proyecto; tipo: TipoExport; secciones?: import('../engine/types').DocKey[] }
  | { tarea: 'simular'; programa: Resultados['programa']; meta: Pick<Proyecto['meta'], 'diasLaborables' | 'feriados'>; entrada: EntradaSimulacion };

export type RespuestaTrabajo = { id: number; progreso: string | number } | { id: number; ok: true; valor: unknown } | { id: number; ok: false; error: string };

const yo = self as unknown as DedicatedWorkerGlobalScope;
const enviar = (m: RespuestaTrabajo, transferir: Transferable[] = []) => yo.postMessage(m, transferir);

/** Simulación por bloques, informando el avance cada ~100 ms. */
function simular(id: number, m: Extract<MensajeTrabajo, { tarea: 'simular' }>) {
  const s = new Simulacion({ programa: m.programa, proyecto: { meta: m.meta } } as unknown as Resultados, m.entrada);
  let t = performance.now();
  while (!s.terminado) {
    s.avanzar(100);
    if (performance.now() - t > 100) {
      enviar({ id, progreso: s.progreso });
      t = performance.now();
    }
  }
  return s.resultado();
}

yo.onmessage = async (e: MessageEvent<MensajeTrabajo & { id: number }>) => {
  const { id } = e.data;
  try {
    if (e.data.tarea === 'exportar') {
      const r = calcularTodo(e.data.proyecto);
      const a = await generarExport(r, e.data.tipo, { render: renderPdfBrowser, secciones: e.data.secciones, progreso: (paso) => enviar({ id, progreso: paso }) });
      enviar({ id, ok: true, valor: a }, [a.datos.buffer as ArrayBuffer]);
    } else if (e.data.tarea === 'simular') {
      enviar({ id, ok: true, valor: simular(id, e.data) });
    }
  } catch (err) {
    enviar({ id, ok: false, error: (err as Error)?.message ?? String(err) });
  }
};
