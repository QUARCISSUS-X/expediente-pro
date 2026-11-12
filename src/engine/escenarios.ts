// Versiones del presupuesto (oferta, negociado, contractual…): copia con nombre de lo que entra al cálculo,
// comparación lado a lado por partida, insumo y total, y presupuesto vigente (contractual + adicionales − deductivos).
import { calcularTodo } from './index';
import type { Escenario, Proyecto, Resultados, TipoEscenario } from './types';
import { redondear, uid } from './util';

export const TIPOS_ESCENARIO: { valor: TipoEscenario; texto: string }[] = [
  { valor: 'oferta', texto: 'Oferta' },
  { valor: 'negociado', texto: 'Negociado' },
  { valor: 'contractual', texto: 'Contractual' },
  { valor: 'otro', texto: 'Otra' },
];

const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Guarda el presupuesto actual como versión con nombre (con su resumen de cifras). */
export function crearEscenario(p: Proyecto, r: Resultados, nombre: string, tipo: TipoEscenario, nota = '', ahora = new Date().toISOString()): Escenario {
  return {
    id: uid('esc'),
    nombre: nombre.trim() || 'Versión sin nombre',
    tipo,
    fecha: ahora,
    ...(nota ? { nota } : {}),
    datos: clonar({ partidas: p.partidas, metrados: p.metrados, apus: p.apus, insumos: p.insumos, gg: p.gg, programa: p.programa, meta: p.meta, subpresupuestos: p.subpresupuestos ?? [], subpartidas: p.subpartidas ?? [] }),
    resumen: { costoDirecto: r.pie.costoDirecto, gg: r.pie.gg, utilidad: r.pie.utilidad, subtotal: r.pie.subtotal, igv: r.pie.igv, total: r.pie.total, plazoDias: r.programa.plazoDias },
  };
}

/** El proyecto tal como estaba en la versión (el control de obra y lo demás no cambian). */
export function proyectoDeEscenario(p: Proyecto, e: Escenario): Proyecto {
  return { ...p, ...clonar(e.datos) };
}

/** Lleva el presupuesto del proyecto (borrador de immer u objeto) al de una versión guardada. */
export function restaurarEscenario(d: Proyecto, e: Escenario): void {
  const x = clonar(e.datos);
  d.partidas = x.partidas;
  d.metrados = x.metrados;
  d.apus = x.apus;
  d.insumos = x.insumos;
  d.gg = x.gg;
  d.programa = x.programa;
  d.meta = x.meta;
  d.subpresupuestos = x.subpresupuestos ?? [];
  d.subpartidas = x.subpartidas ?? [];
}

/** Resultados de una versión (se calcula desde cero). */
export const resultadosDeEscenario = (p: Proyecto, e: Escenario) => calcularTodo(proyectoDeEscenario(p, e));

/** La versión marcada como contractual (la más reciente si hay varias). */
export const escenarioContractual = (p: Pick<Proyecto, 'escenarios'>): Escenario | null =>
  [...(p.escenarios ?? [])].filter((e) => e.tipo === 'contractual').sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;

// ------------------------------------------------------------ comparación

export interface FilaComparacionPartida {
  clave: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  metradoA: number;
  puA: number;
  parcialA: number;
  metradoB: number;
  puB: number;
  parcialB: number;
  diferencia: number;
  estado: 'igual' | 'cambia' | 'solo A' | 'solo B';
}

export interface FilaComparacionInsumo {
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidadA: number;
  precioA: number;
  parcialA: number;
  cantidadB: number;
  precioB: number;
  parcialB: number;
  diferencia: number;
}

export interface ComparacionPresupuestos {
  partidas: FilaComparacionPartida[];
  insumos: FilaComparacionInsumo[];
  totales: { concepto: string; a: number; b: number; diferencia: number }[];
}

/**
 * Compara dos presupuestos partida por partida (por identificador; si no, por código y descripción), insumo por
 * insumo y en el pie. La suma de las diferencias por partida es la diferencia de costo directo.
 */
export function compararPresupuestos(ra: Resultados, rb: Resultados): ComparacionPresupuestos {
  const llave = (f: { partida: { id: string; codigo: string; descripcion: string } }) => f.partida.id;
  const alterna = (f: { partida: { codigo: string; descripcion: string } }) => `${f.partida.codigo}|${f.partida.descripcion.trim().toLowerCase()}`;
  const deB = new Map(rb.hojas.map((f) => [llave(f), f]));
  const deBAlt = new Map(rb.hojas.map((f) => [alterna(f), f]));
  const usadas = new Set<string>();
  const partidas: FilaComparacionPartida[] = [];
  for (const a of ra.hojas) {
    const b = deB.get(llave(a)) ?? deBAlt.get(alterna(a));
    if (b) usadas.add(llave(b));
    const parcialB = b?.parcial ?? 0;
    partidas.push({
      clave: llave(a), codigo: a.partida.codigo, descripcion: a.partida.descripcion, unidad: a.partida.unidad,
      metradoA: a.metrado, puA: a.pu, parcialA: a.parcial, metradoB: b?.metrado ?? 0, puB: b?.pu ?? 0, parcialB,
      diferencia: redondear(parcialB - a.parcial, 2),
      estado: !b ? 'solo A' : b.metrado === a.metrado && b.pu === a.pu ? 'igual' : 'cambia',
    });
  }
  for (const b of rb.hojas) {
    if (usadas.has(llave(b))) continue;
    partidas.push({ clave: llave(b), codigo: b.partida.codigo, descripcion: b.partida.descripcion, unidad: b.partida.unidad, metradoA: 0, puA: 0, parcialA: 0, metradoB: b.metrado, puB: b.pu, parcialB: b.parcial, diferencia: b.parcial, estado: 'solo B' });
  }
  const insA = new Map(ra.insumos.items.map((i) => [i.insumo.codigo, i]));
  const insB = new Map(rb.insumos.items.map((i) => [i.insumo.codigo, i]));
  const insumos: FilaComparacionInsumo[] = [...new Set([...insA.keys(), ...insB.keys()])].map((c) => {
    const a = insA.get(c);
    const b = insB.get(c);
    const i = (b ?? a)!.insumo;
    return { codigo: c, descripcion: i.descripcion, unidad: i.unidad, cantidadA: a?.cantidad ?? 0, precioA: a?.precio ?? 0, parcialA: a?.parcial ?? 0, cantidadB: b?.cantidad ?? 0, precioB: b?.precio ?? 0, parcialB: b?.parcial ?? 0, diferencia: redondear((b?.parcial ?? 0) - (a?.parcial ?? 0), 2) };
  }).sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia) || x.codigo.localeCompare(y.codigo));
  const t = (concepto: string, a: number, b: number) => ({ concepto, a, b, diferencia: redondear(b - a, 2) });
  return {
    partidas,
    insumos,
    totales: [
      t('Costo directo', ra.pie.costoDirecto, rb.pie.costoDirecto),
      t('Gastos generales', ra.pie.gg, rb.pie.gg),
      t('Utilidad', ra.pie.utilidad, rb.pie.utilidad),
      t('Subtotal', ra.pie.subtotal, rb.pie.subtotal),
      t('IGV', ra.pie.igv, rb.pie.igv),
      t('Total', ra.pie.total, rb.pie.total),
      t('Plazo (días)', ra.programa.plazoDias, rb.programa.plazoDias),
    ],
  };
}
