// Comparación de dos presupuestos en Excel (totales, partidas e insumos): la usan Versiones y el comando «comparar».
import type { ComparacionPresupuestos } from '../engine/escenarios';
import type { Tabla } from './tablas';

export function tablasComparacion(c: ComparacionPresupuestos, nombreA: string, nombreB: string): { hoja: string; tabla: Tabla }[] {
  const t = (clave: string, titulo: string, cabecera: string[], filas: (string | number)[][], dec: (number | null)[]): Tabla => ({
    clave, titulo, subtitulo: `${nombreA} (A) frente a ${nombreB} (B)`, cabecera, filas: filas.map((celdas) => ({ celdas })),
    anchos: cabecera.map((_, i) => (i === 1 ? 46 : 13)), alinear: cabecera.map((_, i) => (i <= 2 ? 'l' : 'r')), decimales: dec,
  });
  return [
    { hoja: 'Totales', tabla: t('tot', 'Comparación de totales', ['Concepto', 'A', 'B', 'Diferencia'], c.totales.map((x) => [x.concepto, x.a, x.b, x.diferencia]), [null, 2, 2, 2]) },
    { hoja: 'Partidas', tabla: t('par', 'Comparación por partida', ['Ítem', 'Descripción', 'Und', 'Metrado A', 'P.U. A', 'Parcial A', 'Metrado B', 'P.U. B', 'Parcial B', 'Diferencia'], c.partidas.map((x) => [x.codigo, x.descripcion, x.unidad, x.metradoA, x.puA, x.parcialA, x.metradoB, x.puB, x.parcialB, x.diferencia]), [null, null, null, 2, 2, 2, 2, 2, 2, 2]) },
    { hoja: 'Insumos', tabla: t('ins', 'Comparación por insumo', ['Código', 'Insumo', 'Und', 'Cantidad A', 'Precio A', 'Parcial A', 'Cantidad B', 'Precio B', 'Parcial B', 'Diferencia'], c.insumos.map((x) => [x.codigo, x.descripcion, x.unidad, x.cantidadA, x.precioA, x.parcialA, x.cantidadB, x.precioB, x.parcialB, x.diferencia]), [null, null, null, 4, 2, 2, 4, 2, 2, 2]) },
  ];
}
