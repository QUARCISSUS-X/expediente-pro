// Registro único de entregables: cada archivo de salida se declara una sola vez aquí y de esta lista salen el ZIP,
// las tarjetas de la pantalla Exportar, la barra de herramientas y el trabajo en segundo plano.
// Para agregar un entregable: una entrada en EXPORTADORES (con su función `generar`) y nada más.
import type { DocKey, Resultados } from '../engine/types';
import { escribirCompacto } from '../io/compacto';
import { exportarPlantilla } from '../io/plantilla';
import {
  archivoCarta, archivoConsistencia, archivoEett, archivoEjecutivo, archivoExcel, archivoGerencial, archivoMatriz, archivoMemoria, archivoMsProject,
  archivoObservaciones, archivoPdf, archivoProyecto, empaquetarZip, MIME, nombreBase, type Archivo, type RenderPdf,
} from './paquete';

export interface OpcionesExport {
  render: RenderPdf;
  secciones?: DocKey[];
  progreso?: (paso: string) => void;
}

export interface Exportador {
  tipo: string;
  nombre: string; // texto de los avisos («Generando …»)
  titulo?: string; // título de la tarjeta (si es distinto del nombre)
  formato: string; // «Excel .xlsx»
  icono: string;
  descripcion?: (r: Resultados) => string; // con descripción, sale como tarjeta en Exportar
  disponible?: (r: Resultados) => boolean;
  enZip: boolean;
  paso?: string; // texto del avance dentro del ZIP
  sinArchivo?: string; // mensaje cuando `generar` no devuelve archivo
  generar: (r: Resultados, o: OpcionesExport) => Promise<Archivo | null> | Archivo | null;
}

const texto = (s: string) => new TextEncoder().encode(s);
const privado = (r: Resultados) => r.proyecto.meta.modo === 'privado';

export const EXPORTADORES = [
  {
    tipo: 'xlsx', nombre: 'Excel con fórmulas', titulo: 'Presupuesto, APU y cronogramas', formato: 'Excel .xlsx', icono: 'excel', enZip: true, paso: 'Excel',
    descripcion: () => 'Libro editable con fórmulas vinculadas: datos, metrados, APU, relación de insumos, presupuesto, resumen de costos, gastos generales, fórmula polinómica, cronograma, valorizado, calendarios y controles. Al cambiar un metrado, rendimiento, precio o porcentaje se recalcula todo.',
    generar: (r) => archivoExcel(r),
  },
  {
    tipo: 'eett', nombre: 'Especificaciones técnicas', formato: 'Word .docx', icono: 'word', enZip: true,
    descripcion: (r) => `Carátula, control del documento, aviso, tabla de contenido, especificaciones generales y una especificación por partida (${r.eett.length}) con el orden y la codificación del presupuesto.`,
    generar: (r) => archivoEett(r),
  },
  {
    tipo: 'memoria', nombre: 'Memoria descriptiva', formato: 'Word .docx', icono: 'word', enZip: true,
    descripcion: () => 'Generalidades, ubicación, alcance, componentes, metas, presupuesto, plazo, fórmula polinómica y firmas.',
    generar: (r) => archivoMemoria(r),
  },
  {
    tipo: 'carta', nombre: 'Carta de presentación', formato: 'Word .docx', icono: 'word', enZip: true, disponible: privado,
    descripcion: () => 'Monto en letras, plazo, validez y condiciones de la oferta, del proyectista al cliente.',
    generar: (r) => archivoCarta(r),
  },
  {
    tipo: 'matriz', nombre: 'Matriz del TdR', titulo: 'Matriz de cumplimiento del TdR', formato: 'Word .docx', icono: 'word', enZip: true,
    descripcion: () => 'Cada entregable exigido y el documento que lo cubre.',
    generar: (r) => archivoMatriz(r),
  },
  {
    tipo: 'consistencia', nombre: 'Reporte de consistencia', formato: 'Word .docx', icono: 'word', enZip: true,
    descripcion: () => 'Resultado de las 15 reglas con sus observaciones.',
    generar: (r) => archivoConsistencia(r),
  },
  {
    tipo: 'informe', nombre: 'Informe de revisión', formato: 'Word .docx', icono: 'word', enZip: true, disponible: (r) => !!r.proyecto.origen,
    sinArchivo: 'El proyecto no se importó de un expediente existente.',
    generar: (r) => archivoObservaciones(r),
  },
  {
    tipo: 'msp', nombre: 'MS Project', titulo: 'Cronograma de ejecución', formato: 'MS Project .xml', icono: 'msproject', enZip: true,
    descripcion: () => 'Actividades con la codificación del presupuesto, duraciones, predecesoras y calendario para abrir en MS Project.',
    generar: (r) => archivoMsProject(r),
  },
  { tipo: 'pdf', nombre: 'PDF consolidado', formato: 'PDF', icono: 'pdf', enZip: true, generar: (r, o) => archivoPdf(r, o.render, o.secciones) },
  {
    tipo: 'ejecutivo', nombre: 'Informe ejecutivo', formato: 'PDF', icono: 'pdf', enZip: true,
    descripcion: () => 'Resumen para la gerencia o el cliente: indicadores, costo por título, composición, clasificación ABC de partidas e insumos, curva S y estado de consistencia, con gráficos.',
    generar: (r, o) => archivoEjecutivo(r, o.render),
  },
  {
    tipo: 'gerencial', nombre: 'Reporte gerencial', formato: 'Excel .xlsx', icono: 'excel', enZip: true,
    descripcion: () => 'Las mismas tablas del informe ejecutivo en hojas de Excel, con el detalle completo de la clasificación ABC.',
    generar: (r) => archivoGerencial(r),
  },
  {
    tipo: 'json', nombre: 'Proyecto', formato: 'Expediente Pro .json', icono: 'guardar', enZip: true,
    descripcion: () => 'Archivo de trabajo para volver a abrirlo en este programa o en otra computadora.',
    generar: (r) => archivoProyecto(r),
  },
  {
    tipo: 'plantilla', nombre: 'Plantilla de carga', formato: 'Excel .xlsx', icono: 'importar', enZip: false,
    descripcion: () => 'Este proyecto en hojas de Excel simples (partidas, metrados, APU, insumos, GG, TdR) para editarlo fuera y cargarlo de nuevo.',
    generar: async (r) => ({ nombre: `${nombreBase(r)}_Plantilla_de_carga.xlsx`, tipo: MIME.xlsx, datos: await exportarPlantilla(r.proyecto) }),
  },
  {
    tipo: 'compacto', nombre: 'Formato compacto', formato: 'Texto .exp.txt', icono: 'importar', enZip: false,
    descripcion: () => 'Todo el proyecto en un texto corto (partidas con su APU, metrados, insumos, GG, TdR y textos). Se edita con cualquier editor y se vuelve a abrir con Importar.',
    generar: (r) => ({ nombre: `${nombreBase(r)}.exp.txt`, tipo: 'text/plain;charset=utf-8', datos: texto(escribirCompacto(r.proyecto)) }),
  },
  {
    tipo: 'zip', nombre: 'Todos los entregables', formato: 'ZIP', icono: 'exportar', enZip: false,
    generar: async (r, o) => {
      const archivos = await generarTodos(r, o.render, o.progreso);
      o.progreso?.('Comprimiendo');
      return { nombre: `${nombreBase(r)}_Entregables.zip`, tipo: MIME.zip, datos: await empaquetarZip(archivos, nombreBase(r)) };
    },
  },
] as const satisfies readonly Exportador[];

export type TipoExport = (typeof EXPORTADORES)[number]['tipo'];

export const exportador = (tipo: TipoExport): Exportador => EXPORTADORES.find((e) => e.tipo === tipo)!;

export const NOMBRE_EXPORT = Object.fromEntries(EXPORTADORES.map((e) => [e.tipo, e.nombre])) as Record<TipoExport, string>;

/** Genera un entregable del registro. */
export async function generarExport(r: Resultados, tipo: TipoExport, o: OpcionesExport): Promise<Archivo> {
  const e = exportador(tipo);
  if (!e) throw new Error(`Entregable desconocido: ${tipo}`);
  const a = await e.generar(r, o);
  if (!a) throw new Error(e.sinArchivo ?? `${e.nombre}: no hay nada que generar para este proyecto.`);
  return a;
}

/** Todos los archivos del ZIP, en el orden del registro (los no disponibles para el proyecto se omiten). */
export async function generarTodos(r: Resultados, render: RenderPdf, progreso?: (paso: string) => void): Promise<Archivo[]> {
  const out: Archivo[] = [];
  for (const e of EXPORTADORES as readonly Exportador[]) {
    if (!e.enZip || (e.disponible && !e.disponible(r))) continue;
    progreso?.(e.paso ?? e.nombre);
    const a = await e.generar(r, { render });
    if (a) out.push(a);
  }
  return out;
}
