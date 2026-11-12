// Punto de entrada del motor: calcula todos los entregables a partir del Proyecto.
import { calcularApu, calcularGG, calcularPie, construirPresupuesto, costoDirecto, mapaInsumos, metradosPorPartida, relacionInsumos, type ResolverSubpartida } from './compute';
import { generarEett } from './eett';
import { calcularPolinomica } from './polinomica';
import { calcularDesembolsos, calcularPrograma, calcularValorizado, distribuirInsumos } from './schedule';
import { type Apu, type ApuCalc, type FilaPresupuesto, type FleteCalc, type GGCalc, type Insumo, type Pie, type PieSubpresupuesto, prefijoSubpartida, type Proyecto, type RelacionInsumos, type Resultados } from './types';
import { num, redondear } from './util';
import { validar } from './validate';

export * from './types';

export function calcularFlete(p: Proyecto, rel: RelacionInsumos): FleteCalc {
  const items: FleteCalc['items'] = [];
  const sinPeso: string[] = [];
  for (const it of rel.items) {
    if (it.insumo.tipo !== 'MAT') continue;
    const peso = num(it.insumo.pesoKg);
    if (!peso) {
      sinPeso.push(it.insumo.codigo);
      continue;
    }
    const toneladas = (it.cantidad * peso) / 1000;
    items.push({ insumo: it.insumo, cantidad: it.cantidad, pesoKg: peso, toneladas: redondear(toneladas, 3), flete: redondear(toneladas * num(p.meta.fleteTarifaTon), 2) });
  }
  const toneladas = redondear(items.reduce((a, i) => a + i.toneladas, 0), 3);
  return { items, sinPeso, toneladas, total: redondear(items.reduce((a, i) => a + i.flete, 0), 2) };
}

// ---------------------------------------------------------------- cálculo incremental
// La interfaz edita con immer: lo que no cambia conserva su referencia. Se aprovecha en dos niveles:
//  1. recalcular(): si solo cambió el control de obra, el presupuesto y el cronograma no se vuelven a calcular.
//  2. un APU y una especificación se reutilizan mientras no cambien el análisis, el catálogo de insumos ni la jornada.
// Las cachés van por referencia, así que solo las usa recalcular(); calcularTodo() siempre calcula desde cero
// (la línea de comandos, los importadores y las pruebas modifican el proyecto en el sitio).

const cacheApu = new WeakMap<Apu, Map<string, { insumos: Insumo[]; tc: unknown; base: string; jornada: number; res: ApuCalc }>>();

function apuEnCache(id: string, apu: Apu | undefined, p: Proyecto, mapa: Map<string, Insumo>, jornada: number, sp: ResolverSubpartida): ApuCalc {
  // un análisis con subpartidas depende de otros análisis: no se guarda en caché
  if (!apu || apu.items.some((it) => !mapa.has(it.insumo))) return calcularApu(id, apu, mapa, jornada, sp);
  let porId = cacheApu.get(apu);
  const c = porId?.get(id);
  // el tipo de cambio, la fecha base y la moneda cambian el precio de los insumos en otra moneda
  const base = `${p.meta.fechaBase}|${p.meta.moneda}`;
  if (c && c.insumos === p.insumos && c.tc === p.meta.tiposCambio && c.base === base && c.jornada === jornada) return c.res;
  const res = calcularApu(id, apu, mapa, jornada, sp);
  if (!porId) cacheApu.set(apu, (porId = new Map()));
  porId.set(id, { insumos: p.insumos, tc: p.meta.tiposCambio, base, jornada, res });
  return res;
}

/** Calcula las subpartidas a pedido (con su propio análisis en apus['sp:' + código]); un ciclo cuenta como faltante. */
function resolverSubpartidas(p: Proyecto, mapa: Map<string, Insumo>, jornada: number): { resolver: ResolverSubpartida; calculadas: Record<string, ApuCalc> } {
  const existe = new Set((p.subpartidas ?? []).map((s) => s.codigo));
  const calculadas: Record<string, ApuCalc> = {};
  const enCurso = new Set<string>();
  const resolver: ResolverSubpartida = (codigo) => {
    if (!existe.has(codigo) || enCurso.has(codigo)) return null;
    if (calculadas[codigo]) return calculadas[codigo];
    enCurso.add(codigo);
    const r = calcularApu(prefijoSubpartida + codigo, p.apus[prefijoSubpartida + codigo], mapa, jornada, resolver);
    enCurso.delete(codigo);
    return (calculadas[codigo] = r);
  };
  for (const c of existe) resolver(c);
  return { resolver, calculadas };
}

/**
 * Pie de cada subpresupuesto: costo directo de sus títulos, GG prorrateados por costo directo, utilidad e IGV.
 * El último absorbe los redondeos, así la suma de los pies es exactamente el pie consolidado.
 */
export function piesSubpresupuestos(p: Proyecto, filas: FilaPresupuesto[], pie: Pie, gg: GGCalc): PieSubpresupuesto[] {
  const subs = p.subpresupuestos ?? [];
  if (!subs.length) return [];
  const validos = new Set(subs.map((s) => s.id));
  const grupos = [...subs.map((s) => ({ id: s.id, nombre: s.nombre })), { id: '', nombre: 'Sin subpresupuesto' }].map((g) => ({ ...g, titulos: [] as string[], cd: 0 }));
  for (const f of filas) {
    if (f.nivel !== 1) continue;
    const id = f.partida.subpresupuesto && validos.has(f.partida.subpresupuesto) ? f.partida.subpresupuesto : '';
    const g = grupos.find((x) => x.id === id)!;
    g.titulos.push(f.partida.id);
    g.cd += f.parcial;
  }
  const usados = grupos.filter((g) => g.id || g.titulos.length);
  const cdTotal = pie.costoDirecto;
  const reparto = (total: number, k: number, valores: number[]) => (k === usados.length - 1 ? redondear(total - valores.reduce((a, b) => a + b, 0), 2) : redondear(cdTotal > 0 ? (total * redondear(usados[k].cd, 2)) / cdTotal : 0, 2));
  const acum = { cd: [] as number[], gg: [] as number[], gf: [] as number[], gv: [] as number[], ut: [] as number[], igv: [] as number[] };
  return usados.map((g, k) => {
    // mismas operaciones que la hoja del subpresupuesto en el Excel (0 diferencias)
    const cd = k === usados.length - 1 ? redondear(cdTotal - acum.cd.reduce((a, b) => a + b, 0), 2) : redondear(g.cd, 2);
    acum.cd.push(cd);
    const ggS = reparto(gg.total, k, acum.gg); acum.gg.push(ggS);
    const ggFijos = reparto(gg.fijos, k, acum.gf); acum.gf.push(ggFijos);
    const ggVariables = reparto(gg.variables, k, acum.gv); acum.gv.push(ggVariables);
    const ggFinancieros = redondear(ggS - ggFijos - ggVariables, 2);
    const utilidad = reparto(pie.utilidad, k, acum.ut); acum.ut.push(utilidad);
    const subtotal = redondear(cd + ggS + utilidad, 2);
    const igv = reparto(pie.igv, k, acum.igv); acum.igv.push(igv);
    return {
      id: g.id, nombre: g.nombre, titulos: g.titulos,
      pie: { costoDirecto: cd, ggFijos, ggVariables, ggFinancieros, gg: ggS, ggPct: cd > 0 ? redondear((ggS / cd) * 100, 2) : 0, utilidad, subtotal, igv, total: redondear(subtotal + igv, 2) },
    };
  });
}

/** Datos del proyecto que no entran al cálculo del expediente (se editan sin recalcular). */
const FUERA_DEL_CALCULO = new Set<string>(['control', 'bitacora', 'esquema', 'escenarios']);

/** Verdadero si entre los dos proyectos solo cambiaron datos que no entran al cálculo. */
export function mismoCalculo(a: Proyecto, b: Proyecto): boolean {
  if (a === b) return true;
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) if (!FUERA_DEL_CALCULO.has(k) && ra[k] !== rb[k]) return false;
  return true;
}

/** Como calcularTodo, pero reutiliza el resultado anterior cuando el cambio no afecta al cálculo. */
export function recalcular(p: Proyecto, previo?: Resultados | null): Resultados {
  if (previo && mismoCalculo(previo.proyecto, p)) return previo.proyecto === p ? previo : { ...previo, proyecto: p };
  return calcularTodo(p, true);
}

export function calcularTodo(p: Proyecto, incremental = false): Resultados {
  const insumos = mapaInsumos(p);
  const jornada = num(p.meta.jornadaHoras, 8) || 8;
  const { resolver, calculadas: subpartidas } = resolverSubpartidas(p, insumos, jornada);
  const apus: Record<string, ApuCalc> = {};
  for (const pt of p.partidas) if (!pt.titulo) apus[pt.id] = incremental ? apuEnCache(pt.id, p.apus[pt.id], p, insumos, jornada, resolver) : calcularApu(pt.id, p.apus[pt.id], insumos, jornada, resolver);
  const metradoPorPartida = metradosPorPartida(p);
  const filas = construirPresupuesto(p, apus, metradoPorPartida);
  const hojas = filas.filter((f) => !f.esTitulo);
  const cd = costoDirecto(filas);
  const programa = calcularPrograma(p, filas, apus, incremental);
  const gg = calcularGG(p, cd, programa.plazoMeses);
  const pie = calcularPie(p, cd, gg);
  const rel = relacionInsumos(filas, apus, cd);
  const polinomica = calcularPolinomica(rel, pie);
  const flete = calcularFlete(p, rel);
  const valorizado = calcularValorizado(programa, pie);
  const plazoCompra = new Map(p.insumos.map((i) => [i.codigo, i.plazoCompraDias ?? p.meta.plazoCompraDefecto]));
  const adq = distribuirInsumos(programa, apus, { tipos: ['MAT'], conPrevio: true, anticipacion: (c) => num(plazoCompra.get(c), p.meta.plazoCompraDefecto) });
  const eq = distribuirInsumos(programa, apus, { tipos: ['EQ'], conPrevio: false });
  const mo = distribuirInsumos(programa, apus, { tipos: ['MO'], conPrevio: false });
  const personalEquivalente = programa.periodos.map((per, i) => {
    const hh = mo.filas.reduce((a, f) => a + (f.valores[i] ?? 0), 0);
    return per.diasLaborables > 0 ? redondear(hh / (jornada * per.diasLaborables), 1) : 0;
  });
  let personalPico = 0;
  for (let d = 0; d < programa.diasLaborables; d++) {
    let hh = 0;
    for (const serie of mo.diario.values()) hh += serie[d] ?? 0;
    personalPico = Math.max(personalPico, hh / jornada);
  }
  const desembolsos = calcularDesembolsos(p, programa, valorizado, pie);
  const eett = generarEett(hojas, apus, p.plantillasEett, incremental);
  const parcial = {
    proyecto: p,
    apus,
    filas,
    hojas,
    metradoPorPartida,
    pie,
    insumos: rel,
    gg,
    polinomica,
    flete,
    programa,
    valorizado,
    adquisiciones: adq.filas,
    equipos: eq.filas,
    personal: mo.filas,
    personalEquivalente,
    personalPico: redondear(personalPico, 1),
    desembolsos,
    eett,
    subpresupuestos: piesSubpresupuestos(p, filas, pie, gg),
    subpartidas,
  };
  const validacion = validar(parcial);
  const resumenValidacion = {
    errores: validacion.filter((v) => v.estado === 'error').length,
    advertencias: validacion.filter((v) => v.estado === 'advertencia').length,
    ok: validacion.filter((v) => v.estado === 'ok').length,
  };
  return { ...parcial, validacion, resumenValidacion };
}
