// Análisis gerencial del expediente: costo por título, composición, clasificación ABC, curva S, índices y alertas.
// Solo lee los Resultados del motor; lo usan el módulo Resumen y los reportes gerenciales.
import type { Resultados, TipoInsumo } from './types';
import { redondear } from './util';

export type ClaseAbc = 'A' | 'B' | 'C';

export interface ItemAbc {
  clave: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio: number;
  monto: number;
  pct: number; // incidencia en el costo directo
  acumPct: number;
  clase: ClaseAbc;
}

export interface Abc {
  items: ItemAbc[]; // de mayor a menor monto
  total: number;
  clases: Record<ClaseAbc, { n: number; monto: number; pct: number }>;
}

export interface ParteCosto {
  clave: string;
  nombre: string;
  monto: number;
  pct: number;
}

export interface Analisis {
  costoDirecto: number;
  total: number;
  porTitulo: ParteCosto[]; // títulos de primer nivel, % del costo directo
  composicion: ParteCosto[]; // mano de obra, materiales, equipos, subcontratos
  estructura: ParteCosto[]; // costo directo, gastos generales, utilidad, IGV (% del total)
  abcPartidas: Abc;
  abcInsumos: Abc;
  curva: { etiqueta: string; monto: number; avancePct: number; acumuladoPct: number }[];
  indices: {
    partidas: number;
    titulos: number;
    insumos: number;
    plazoDias: number;
    diasLaborables: number;
    costoPorDia: number; // costo directo por día calendario
    horasHombre: number;
    horasMaquina: number;
    personalPico: number;
    actividadesCriticas: number;
    pctCostoCritico: number; // % del costo directo en la ruta crítica
    ggPct: number;
    utilidadPct: number;
    preciosConFuente: number; // % de insumos usados que indican fuente o cotización
    eettGenericas: number;
  };
  alertas: { nivel: 'error' | 'advertencia' | 'info'; texto: string }[];
}

const NOMBRE_TIPO: Record<TipoInsumo, string> = { MO: 'Mano de obra', MAT: 'Materiales', EQ: 'Equipos', SC: 'Subcontratos' };

/** Clasificación ABC (Pareto): A hasta el 80 % acumulado, B hasta el 95 %, C el resto. */
export function clasificarAbc(datos: Omit<ItemAbc, 'pct' | 'acumPct' | 'clase'>[], base?: number): Abc {
  const orden = datos.filter((x) => x.monto > 0).sort((a, b) => b.monto - a.monto);
  const total = redondear(orden.reduce((s, x) => s + x.monto, 0), 2);
  const ref = base && base > 0 ? base : total;
  const clases: Abc['clases'] = { A: { n: 0, monto: 0, pct: 0 }, B: { n: 0, monto: 0, pct: 0 }, C: { n: 0, monto: 0, pct: 0 } };
  let acum = 0;
  const items = orden.map((x) => {
    const antes = total > 0 ? (acum / total) * 100 : 0;
    acum += x.monto;
    // la clase la decide el acumulado ANTES del elemento, para que el que cruza el 80 % siga siendo A
    const clase: ClaseAbc = antes < 80 ? 'A' : antes < 95 ? 'B' : 'C';
    clases[clase].n++;
    clases[clase].monto += x.monto;
    return { ...x, pct: ref > 0 ? (x.monto / ref) * 100 : 0, acumPct: total > 0 ? (acum / total) * 100 : 0, clase };
  });
  for (const k of ['A', 'B', 'C'] as ClaseAbc[]) {
    clases[k].monto = redondear(clases[k].monto, 2);
    clases[k].pct = total > 0 ? (clases[k].monto / total) * 100 : 0;
  }
  return { items, total, clases };
}

export function analizar(r: Resultados): Analisis {
  const cd = r.pie.costoDirecto;
  const pct = (v: number, base = cd) => (base > 0 ? (v / base) * 100 : 0);

  const porTitulo: ParteCosto[] = r.filas
    .filter((f) => f.nivel === 1)
    .map((f) => ({ clave: f.partida.id, nombre: `${f.partida.codigo} ${f.partida.descripcion}`, monto: f.parcial, pct: pct(f.parcial) }));

  const composicion: ParteCosto[] = (['MO', 'MAT', 'EQ', 'SC'] as TipoInsumo[])
    .map((t) => ({ clave: t, nombre: NOMBRE_TIPO[t], monto: r.insumos.porTipo[t], pct: pct(r.insumos.porTipo[t], r.insumos.total) }))
    .filter((x) => x.monto > 0);

  const estructura: ParteCosto[] = [
    { clave: 'cd', nombre: 'Costo directo', monto: cd },
    { clave: 'gg', nombre: 'Gastos generales', monto: r.pie.gg },
    { clave: 'ut', nombre: 'Utilidad', monto: r.pie.utilidad },
    { clave: 'igv', nombre: 'IGV', monto: r.pie.igv },
  ]
    .filter((x) => x.monto > 0)
    .map((x) => ({ ...x, pct: pct(x.monto, r.pie.total) }));

  const abcPartidas = clasificarAbc(
    r.hojas.map((h) => ({ clave: h.partida.id, codigo: h.partida.codigo, descripcion: h.partida.descripcion, unidad: h.partida.unidad, cantidad: h.metrado, precio: h.pu, monto: h.parcial })),
    cd,
  );
  const abcInsumos = clasificarAbc(
    r.insumos.items.map((i) => ({ clave: i.insumo.codigo, codigo: i.insumo.codigo, descripcion: i.insumo.descripcion, unidad: i.insumo.unidad, cantidad: i.cantidad, precio: i.precio, monto: i.parcial })),
    r.insumos.total,
  );

  const v = r.valorizado;
  const curva = r.programa.periodos.map((p, i) => ({ etiqueta: p.etiqueta, monto: v.cd[i] ?? 0, avancePct: v.avancePct[i] ?? 0, acumuladoPct: v.acumuladoPct[i] ?? 0 }));

  const criticas = r.programa.actividades.filter((a) => a.critica);
  const usados = r.insumos.items.filter((i) => !i.insumo.unidad.startsWith('%'));
  const conFuente = usados.filter((i) => (i.insumo.fuente || '').trim()).length;
  const sum = (t: TipoInsumo) => r.insumos.items.filter((i) => i.insumo.tipo === t && !i.insumo.unidad.startsWith('%')).reduce((s, i) => s + i.cantidad, 0);
  const indices: Analisis['indices'] = {
    partidas: r.hojas.length,
    titulos: r.filas.length - r.hojas.length,
    insumos: r.insumos.items.length,
    plazoDias: r.programa.plazoDias,
    diasLaborables: r.programa.diasLaborables,
    costoPorDia: r.programa.plazoDias > 0 ? redondear(cd / r.programa.plazoDias, 2) : 0,
    horasHombre: redondear(sum('MO'), 2),
    horasMaquina: redondear(sum('EQ'), 2),
    personalPico: r.personalPico,
    actividadesCriticas: criticas.length,
    pctCostoCritico: pct(criticas.reduce((s, a) => s + a.parcial, 0)),
    ggPct: r.pie.ggPct,
    utilidadPct: pct(r.pie.utilidad),
    preciosConFuente: usados.length ? (conFuente / usados.length) * 100 : 0,
    eettGenericas: r.eett.filter((e) => e.generica).length,
  };

  const alertas: Analisis['alertas'] = [];
  const { errores, advertencias } = r.resumenValidacion;
  if (errores) alertas.push({ nivel: 'error', texto: `${errores} regla(s) de consistencia con errores: el expediente no está listo para entregar.` });
  if (advertencias) alertas.push({ nivel: 'advertencia', texto: `${advertencias} regla(s) de consistencia con advertencias por revisar.` });
  const mayor = abcPartidas.items[0];
  if (mayor && mayor.pct >= 25) alertas.push({ nivel: 'advertencia', texto: `La partida ${mayor.codigo} ${mayor.descripcion} concentra el ${mayor.pct.toFixed(1)} % del costo directo: revise su metrado y su análisis con especial cuidado.` });
  const insumoMayor = abcInsumos.items[0];
  if (insumoMayor && insumoMayor.pct >= 20) alertas.push({ nivel: 'info', texto: `El insumo ${insumoMayor.descripcion} representa el ${insumoMayor.pct.toFixed(1)} % del costo directo: una cotización formal reduce el riesgo de precio.` });
  if (usados.length && indices.preciosConFuente < 50) alertas.push({ nivel: 'info', texto: `Solo el ${indices.preciosConFuente.toFixed(0)} % de los insumos indica la fuente de su precio (cotización, revista o proveedor).` });
  if (indices.eettGenericas) alertas.push({ nivel: 'info', texto: `${indices.eettGenericas} partida(s) usan la especificación técnica genérica.` });
  if (r.programa.actividades.length > 3 && criticas.length / r.programa.actividades.length > 0.6) alertas.push({ nivel: 'advertencia', texto: `El ${((criticas.length / r.programa.actividades.length) * 100).toFixed(0)} % de las actividades está en la ruta crítica: el cronograma casi no tiene holgura.` });
  if (cd > 0 && indices.ggPct > 35) alertas.push({ nivel: 'advertencia', texto: `Los gastos generales son el ${indices.ggPct.toFixed(1)} % del costo directo, un valor alto: revise el desagregado.` });

  return { costoDirecto: cd, total: r.pie.total, porTitulo, composicion, estructura, abcPartidas, abcInsumos, curva, indices, alertas };
}
