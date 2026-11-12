// Acciones compartidas por la barra de herramientas, los menús y los módulos.
import type { DocKey, Proyecto, Resultados } from '../engine/types';
import type { Archivo } from '../export/paquete';
import { generarExport, NOMBRE_EXPORT, type TipoExport } from '../export/registro';
import { renderPdfBrowser } from '../export/render-browser';
import { agregarPartida, agregarTitulo, aumentarNivel, disminuirNivel, duplicar, eliminar, mover, renumerar } from './arbol';
import type { Contexto } from './estado';
import { enSegundoPlano } from './trabajo';

export { NOMBRE_EXPORT, type TipoExport };

/** Archivos que se generan en un instante: no vale la pena abrir un worker. */
const LIVIANOS = new Set<TipoExport>(['json', 'msp', 'compacto']);

/** Genera un entregable del registro; los pesados (Excel, Word, PDF, ZIP) en segundo plano. */
export async function generarArchivo(r: Resultados, p: Proyecto, tipo: TipoExport, progreso?: (paso: string) => void, secciones?: DocKey[]): Promise<Archivo> {
  const enPagina = () => generarExport(r, tipo, { render: renderPdfBrowser, secciones, progreso });
  if (LIVIANOS.has(tipo)) return enPagina();
  return enSegundoPlano<Archivo>({ tarea: 'exportar', proyecto: p, tipo, secciones }, enPagina, (x) => typeof x === 'string' && progreso?.(x)).promesa;
}

// ------------------------------------------------------------ partidas

const seleccion = (ctx: Contexto) => ctx.proyecto.partidas.find((x) => x.id === ctx.partidaSel) ?? null;

export const accionesPartida = {
  titulo(ctx: Contexto) {
    let id = '';
    ctx.actualizar((d) => { id = agregarTitulo(d, seleccion(ctx)); }, 'Título agregado');
    ctx.ir('presupuesto', id);
  },
  subtitulo(ctx: Contexto) {
    const sel = seleccion(ctx);
    if (!sel?.titulo) return ctx.avisar('Seleccione un título para agregarle un subtítulo.', true);
    let id = '';
    ctx.actualizar((d) => { id = agregarTitulo(d, sel, true); }, `Subtítulo agregado en ${sel.codigo}`);
    ctx.ir('presupuesto', id);
  },
  partida(ctx: Contexto) {
    let id: string | null = null;
    ctx.actualizar((d) => { id = agregarPartida(d, seleccion(ctx)); }, 'Partida agregada');
    if (id) ctx.ir('presupuesto', id);
  },
  duplicar(ctx: Contexto) {
    const sel = seleccion(ctx);
    if (!sel || sel.titulo) return ctx.avisar('Seleccione una partida para duplicarla.', true);
    let id: string | null = null;
    ctx.actualizar((d) => { id = duplicar(d, sel.id); }, `Partida duplicada: ${sel.codigo}`);
    if (id) ctx.ir('presupuesto', id);
  },
  eliminar(ctx: Contexto) {
    const sel = seleccion(ctx);
    if (!sel) return ctx.avisar('Seleccione el título o la partida que desea eliminar.', true);
    const n = ctx.proyecto.partidas.filter((x) => x.codigo.startsWith(sel.codigo + '.')).length;
    if (n && !window.confirm(`Se eliminará "${sel.descripcion}" con sus ${n} subpartidas. ¿Continuar?`)) return;
    ctx.actualizar((d) => eliminar(d, sel.id), `Eliminado: ${sel.codigo} ${sel.descripcion}`);
    ctx.setPartidaSel(null);
    ctx.avisar(`Eliminado: ${sel.codigo} ${sel.descripcion} (puede deshacer con Ctrl+Z).`);
  },
  subir(ctx: Contexto) {
    const sel = seleccion(ctx);
    if (sel) ctx.actualizar((d) => mover(d, sel.id, -1));
  },
  bajar(ctx: Contexto) {
    const sel = seleccion(ctx);
    if (sel) ctx.actualizar((d) => mover(d, sel.id, 1));
  },
  aumentarNivel(ctx: Contexto) {
    const sel = seleccion(ctx);
    if (!sel) return;
    let ok = false;
    ctx.actualizar((d) => { ok = aumentarNivel(d, sel.id); });
    if (!ok) ctx.avisar('Para aumentar el nivel, la fila debe estar justo debajo de un título del mismo nivel.', true);
  },
  disminuirNivel(ctx: Contexto) {
    const sel = seleccion(ctx);
    if (!sel) return;
    let ok = false;
    ctx.actualizar((d) => { ok = disminuirNivel(d, sel.id); });
    if (!ok) ctx.avisar('No se puede disminuir el nivel: una partida debe quedar dentro de un título.', true);
  },
  renumerar(ctx: Contexto) {
    ctx.actualizar((d) => renumerar(d), 'Ítems numerados de nuevo');
    ctx.avisar('Ítems numerados de nuevo (01, 01.01, 01.02…).');
  },
};
