// Núcleo de costos: metrados, APU, presupuesto, gastos generales, pie e insumos.
import type {
  Apu, ApuCalc, ApuItemCalc, FilaPresupuesto, GGCalc, Insumo, InsumoTotal, MetradoFila, Pie, Proyecto,
  RelacionInsumos, TipoInsumo,
} from './types';
import { codigoPadre, compararCodigos, nivelDeCodigo, num, redondear } from './util';

const lleno = (x: unknown) => x !== null && x !== undefined && x !== '';

export const CAMPOS_METRADO = ['veces', 'cantidad', 'factor', 'largo', 'ancho', 'alto', 'area', 'volumen'] as const;

/** Parcial = producto de los campos llenos (N° veces, cantidad, factor, largo, ancho, alto, área, volumen),
 *  igual que =PRODUCTO() en la planilla de metrados. Sin campos llenos, el parcial es cero. */
export function parcialMetrado(f: MetradoFila): number {
  const llenos = CAMPOS_METRADO.map((k) => f[k]).filter(lleno);
  if (llenos.length === 0) return 0;
  return llenos.reduce<number>((a, b) => a * num(b, 0), 1);
}

export function metradosPorPartida(p: Proyecto): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of p.metrados) out[f.partidaId] = (out[f.partidaId] ?? 0) + parcialMetrado(f);
  for (const k of Object.keys(out)) out[k] = redondear(out[k], 2);
  return out;
}

export function mapaInsumos(p: Proyecto): Map<string, Insumo> {
  const m = new Map<string, Insumo>();
  for (const i of p.insumos) m.set(i.codigo, i);
  return m;
}

const VACIO: Record<TipoInsumo, number> = { MO: 0, MAT: 0, EQ: 0, SC: 0 };

export function calcularApu(partidaId: string, apu: Apu | undefined, insumos: Map<string, Insumo>, jornada: number): ApuCalc {
  const j = apu && apu.jornada !== null && apu.jornada !== undefined && num(apu.jornada) > 0 ? num(apu.jornada) : jornada;
  const res: ApuCalc = { partidaId, rendimiento: num(apu?.rendimiento), jornada: j, items: [], subtotales: { ...VACIO }, pu: 0, faltantes: [] };
  if (!apu) return res;
  const rend = num(apu.rendimiento);
  const pendientes: { item: ApuItemCalc }[] = [];
  for (const [origen, it] of apu.items.entries()) {
    const ins = insumos.get(it.insumo);
    if (!ins) {
      res.faltantes.push(it.insumo);
      continue;
    }
    const esPorc = ins.unidad.toLowerCase().startsWith('%') || (it.porcentaje !== null && it.porcentaje !== undefined && (it.porcentaje as unknown) !== '');
    let cantidad = 0;
    const cuadrilla = it.cuadrilla === null || it.cuadrilla === undefined || (it.cuadrilla as unknown) === '' ? null : num(it.cuadrilla);
    if (esPorc) {
      cantidad = num(it.porcentaje ?? it.cantidad);
    } else if (cuadrilla !== null && (ins.tipo === 'MO' || ins.tipo === 'EQ')) {
      cantidad = rend > 0 ? (cuadrilla * j) / rend : 0;
    } else {
      cantidad = num(it.cantidad);
    }
    cantidad = redondear(cantidad, 4);
    const calc: ApuItemCalc = {
      origen,
      insumo: ins,
      cuadrilla,
      cantidad,
      precio: ins.precio,
      parcial: esPorc ? 0 : redondear(cantidad * num(ins.precio), 2),
      porcentaje: esPorc ? cantidad : null,
    };
    res.items.push(calc);
    if (esPorc) pendientes.push({ item: calc });
    else res.subtotales[ins.tipo] = redondear(res.subtotales[ins.tipo] + calc.parcial, 2);
  }
  // rubros porcentuales (herramientas manuales = % de mano de obra)
  for (const { item } of pendientes) {
    const base = item.insumo.unidad.toLowerCase().includes('mat') ? res.subtotales.MAT : res.subtotales.MO;
    item.parcial = redondear((item.cantidad / 100) * base, 2);
    res.subtotales[item.insumo.tipo] = redondear(res.subtotales[item.insumo.tipo] + item.parcial, 2);
  }
  res.pu = redondear(res.subtotales.MO + res.subtotales.MAT + res.subtotales.EQ + res.subtotales.SC, 2);
  return res;
}

export function ordenarPartidas(p: Proyecto): Proyecto['partidas'] {
  return [...p.partidas].sort((a, b) => compararCodigos(a.codigo, b.codigo));
}

export function construirPresupuesto(p: Proyecto, apus: Record<string, ApuCalc>, metrados: Record<string, number>): FilaPresupuesto[] {
  const partidas = ordenarPartidas(p);
  const porCodigo = new Map(partidas.map((x) => [x.codigo, x]));
  const filas: FilaPresupuesto[] = partidas.map((pt) => {
    const padre = porCodigo.get(codigoPadre(pt.codigo));
    const esTitulo = !!pt.titulo;
    const metrado = esTitulo ? 0 : metrados[pt.id] ?? 0;
    const pu = esTitulo ? 0 : apus[pt.id]?.pu ?? 0;
    return {
      partida: pt,
      nivel: nivelDeCodigo(pt.codigo),
      esTitulo,
      metrado,
      pu,
      parcial: esTitulo ? 0 : redondear(metrado * pu, 2),
      padreId: padre ? padre.id : null,
    };
  });
  // totales de títulos (de abajo hacia arriba)
  const porId = new Map(filas.map((f) => [f.partida.id, f]));
  const ordenInverso = [...filas].sort((a, b) => b.nivel - a.nivel);
  const acumulado = new Map<string, number>();
  for (const f of ordenInverso) {
    const propio = f.esTitulo ? acumulado.get(f.partida.id) ?? 0 : f.parcial;
    if (f.esTitulo) f.parcial = redondear(propio, 2);
    if (f.padreId) acumulado.set(f.padreId, (acumulado.get(f.padreId) ?? 0) + propio);
  }
  void porId;
  return filas;
}

export function costoDirecto(filas: FilaPresupuesto[]): number {
  return redondear(filas.filter((f) => !f.esTitulo).reduce((a, f) => a + f.parcial, 0), 2);
}

export function calcularGG(p: Proyecto, cd: number, plazoMeses: number): GGCalc {
  const items = p.gg.map((g) => {
    const duracionUsada = g.grupo === 'variable' && g.ligadoAlPlazo ? plazoMeses : num(g.duracion, 1);
    let total: number;
    if ((g.unidad || '').toLowerCase() === '%cd') total = (num(g.cantidad) / 100) * cd * (num(g.participacion, 100) / 100);
    else total = num(g.cantidad) * duracionUsada * num(g.precio) * (num(g.participacion, 100) / 100);
    return { ...g, duracionUsada: redondear(duracionUsada, 2), total: redondear(total, 2) };
  });
  const suma = (g: string) => redondear(items.filter((i) => i.grupo === g).reduce((a, i) => a + i.total, 0), 2);
  const fijos = suma('fijo');
  const variables = suma('variable');
  const financieros = suma('financiero');
  return { items, fijos, variables, financieros, total: redondear(fijos + variables + financieros, 2) };
}

export function calcularPie(p: Proyecto, cd: number, gg: GGCalc): Pie {
  const utilidad = redondear((cd * num(p.meta.utilidadPct)) / 100, 2);
  const subtotal = redondear(cd + gg.total + utilidad, 2);
  const igv = p.meta.incluirIgv === false ? 0 : redondear((subtotal * num(p.meta.igvPct)) / 100, 2);
  return {
    costoDirecto: cd,
    ggFijos: gg.fijos,
    ggVariables: gg.variables,
    ggFinancieros: gg.financieros,
    gg: gg.total,
    ggPct: cd > 0 ? redondear((gg.total / cd) * 100, 2) : 0,
    utilidad,
    subtotal,
    igv,
    total: redondear(subtotal + igv, 2),
  };
}

export function relacionInsumos(filas: FilaPresupuesto[], apus: Record<string, ApuCalc>, cd: number): RelacionInsumos {
  const acum = new Map<string, InsumoTotal>();
  let porcentuales = 0;
  const porTipo: Record<TipoInsumo, number> = { MO: 0, MAT: 0, EQ: 0, SC: 0 };
  for (const f of filas) {
    if (f.esTitulo || f.metrado === 0) continue;
    const a = apus[f.partida.id];
    if (!a) continue;
    for (const it of a.items) {
      if (it.porcentaje !== null) {
        const monto = f.metrado * it.parcial;
        porcentuales += monto;
        porTipo[it.insumo.tipo] += monto;
        const prev = acum.get(it.insumo.codigo);
        if (prev) prev.parcial += monto;
        else acum.set(it.insumo.codigo, { insumo: it.insumo, cantidad: 0, precio: 0, parcial: monto });
        continue;
      }
      const cant = f.metrado * it.cantidad;
      const prev = acum.get(it.insumo.codigo);
      if (prev) prev.cantidad += cant;
      else acum.set(it.insumo.codigo, { insumo: it.insumo, cantidad: cant, precio: it.insumo.precio, parcial: 0 });
    }
  }
  const items = [...acum.values()].map((x) => {
    const esPorc = x.insumo.unidad.startsWith('%');
    const cantidad = esPorc ? 0 : redondear(x.cantidad, 4);
    const parcial = esPorc ? redondear(x.parcial, 2) : redondear(cantidad * x.precio, 2);
    return { ...x, cantidad, parcial };
  });
  const orden: Record<TipoInsumo, number> = { MO: 0, MAT: 1, EQ: 2, SC: 3 };
  items.sort((a, b) => orden[a.insumo.tipo] - orden[b.insumo.tipo] || a.insumo.descripcion.localeCompare(b.insumo.descripcion));
  const tipos: Record<TipoInsumo, number> = { MO: 0, MAT: 0, EQ: 0, SC: 0 };
  for (const it of items) tipos[it.insumo.tipo] += it.parcial;
  for (const k of Object.keys(tipos) as TipoInsumo[]) tipos[k] = redondear(tipos[k], 2);
  const total = redondear(items.reduce((a, i) => a + i.parcial, 0), 2);
  void porTipo;
  return { items, porTipo: tipos, porcentuales: redondear(porcentuales, 2), total, diferenciaRedondeo: redondear(cd - total, 2) };
}
