// Acciones compartidas por la barra de herramientas, los menús y los módulos.
import type { DocKey, Proyecto, Resultados } from '../engine/types';
import {
  archivoCarta, archivoConsistencia, archivoObservaciones, archivoEett, archivoExcel, archivoMatriz, archivoMemoria, archivoMsProject, archivoPdf, archivoProyecto,
  archivoEjecutivo, archivoGerencial, empaquetarZip, generarTodos, MIME, nombreBase, type Archivo,
} from '../export/paquete';
import { renderPdfBrowser } from '../export/render-browser';
import { exportarPlantilla } from '../io/plantilla';
import { escribirCompacto } from '../io/compacto';
import { agregarPartida, agregarTitulo, aumentarNivel, disminuirNivel, duplicar, eliminar, mover, renumerar } from './arbol';
import type { Contexto } from './estado';

export type TipoExport = 'xlsx' | 'eett' | 'memoria' | 'carta' | 'matriz' | 'consistencia' | 'informe' | 'msp' | 'pdf' | 'ejecutivo' | 'gerencial' | 'zip' | 'json' | 'plantilla' | 'compacto';

export const NOMBRE_EXPORT: Record<TipoExport, string> = {
  xlsx: 'Excel con fórmulas',
  eett: 'Especificaciones técnicas',
  memoria: 'Memoria descriptiva',
  carta: 'Carta de presentación',
  matriz: 'Matriz del TdR',
  consistencia: 'Reporte de consistencia',
  informe: 'Informe de revisión',
  msp: 'MS Project',
  pdf: 'PDF consolidado',
  ejecutivo: 'Informe ejecutivo',
  gerencial: 'Reporte gerencial',
  zip: 'Todos los entregables',
  json: 'Proyecto',
  plantilla: 'Plantilla de carga',
  compacto: 'Formato compacto',
};

export async function generarArchivo(r: Resultados, p: Proyecto, tipo: TipoExport, progreso?: (paso: string) => void, secciones?: DocKey[]): Promise<Archivo> {
  switch (tipo) {
    case 'xlsx': return archivoExcel(r);
    case 'eett': return archivoEett(r);
    case 'memoria': return archivoMemoria(r);
    case 'carta': return archivoCarta(r);
    case 'matriz': return archivoMatriz(r);
    case 'consistencia': return archivoConsistencia(r);
    case 'informe': {
      const a = await archivoObservaciones(r);
      if (!a) throw new Error('El proyecto no se importó de un expediente existente.');
      return a;
    }
    case 'msp': return archivoMsProject(r);
    case 'pdf': return archivoPdf(r, renderPdfBrowser, secciones);
    case 'ejecutivo': return archivoEjecutivo(r, renderPdfBrowser);
    case 'gerencial': return archivoGerencial(r);
    case 'json': return archivoProyecto(r);
    case 'compacto': return { nombre: `${nombreBase(r)}.exp.txt`, tipo: 'text/plain;charset=utf-8', datos: new TextEncoder().encode(escribirCompacto(p)) };
    case 'plantilla': return { nombre: `${nombreBase(r)}_Plantilla_de_carga.xlsx`, tipo: MIME.xlsx, datos: await exportarPlantilla(p) };
    case 'zip': {
      const archivos = await generarTodos(r, renderPdfBrowser, progreso);
      return { nombre: `${nombreBase(r)}_Entregables.zip`, tipo: MIME.zip, datos: await empaquetarZip(archivos, nombreBase(r)) };
    }
  }
}

// ------------------------------------------------------------ partidas

const seleccion = (ctx: Contexto) => ctx.proyecto.partidas.find((x) => x.id === ctx.partidaSel) ?? null;

export const accionesPartida = {
  titulo(ctx: Contexto) {
    let id = '';
    ctx.actualizar((d) => { id = agregarTitulo(d, seleccion(ctx)); });
    ctx.ir('presupuesto', id);
  },
  subtitulo(ctx: Contexto) {
    const sel = seleccion(ctx);
    if (!sel?.titulo) return ctx.avisar('Seleccione un título para agregarle un subtítulo.', true);
    let id = '';
    ctx.actualizar((d) => { id = agregarTitulo(d, sel, true); });
    ctx.ir('presupuesto', id);
  },
  partida(ctx: Contexto) {
    let id: string | null = null;
    ctx.actualizar((d) => { id = agregarPartida(d, seleccion(ctx)); });
    if (id) ctx.ir('presupuesto', id);
  },
  duplicar(ctx: Contexto) {
    const sel = seleccion(ctx);
    if (!sel || sel.titulo) return ctx.avisar('Seleccione una partida para duplicarla.', true);
    let id: string | null = null;
    ctx.actualizar((d) => { id = duplicar(d, sel.id); });
    if (id) ctx.ir('presupuesto', id);
  },
  eliminar(ctx: Contexto) {
    const sel = seleccion(ctx);
    if (!sel) return ctx.avisar('Seleccione el título o la partida que desea eliminar.', true);
    const n = ctx.proyecto.partidas.filter((x) => x.codigo.startsWith(sel.codigo + '.')).length;
    if (n && !window.confirm(`Se eliminará "${sel.descripcion}" con sus ${n} subpartidas. ¿Continuar?`)) return;
    ctx.actualizar((d) => eliminar(d, sel.id));
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
    ctx.actualizar((d) => renumerar(d));
    ctx.avisar('Ítems numerados de nuevo (01, 01.01, 01.02…).');
  },
};
