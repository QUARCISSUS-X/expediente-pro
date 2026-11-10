// Punto de entrada del motor: calcula todos los entregables a partir del Proyecto.
import { calcularApu, calcularGG, calcularPie, construirPresupuesto, costoDirecto, mapaInsumos, metradosPorPartida, relacionInsumos } from './compute';
import { generarEett } from './eett';
import { calcularPolinomica } from './polinomica';
import { calcularDesembolsos, calcularPrograma, calcularValorizado, distribuirInsumos } from './schedule';
import type { Apu, ApuCalc, FleteCalc, Insumo, Proyecto, RelacionInsumos, Resultados } from './types';
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

const cacheApu = new WeakMap<Apu, Map<string, { insumos: Insumo[]; jornada: number; res: ApuCalc }>>();

function apuEnCache(id: string, apu: Apu | undefined, p: Proyecto, mapa: Map<string, Insumo>, jornada: number): ApuCalc {
  if (!apu) return calcularApu(id, apu, mapa, jornada);
  let porId = cacheApu.get(apu);
  const c = porId?.get(id);
  if (c && c.insumos === p.insumos && c.jornada === jornada) return c.res;
  const res = calcularApu(id, apu, mapa, jornada);
  if (!porId) cacheApu.set(apu, (porId = new Map()));
  porId.set(id, { insumos: p.insumos, jornada, res });
  return res;
}

/** Datos del proyecto que no entran al cálculo del expediente (se editan sin recalcular). */
const FUERA_DEL_CALCULO = new Set<string>(['control']);

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
  const apus: Record<string, ApuCalc> = {};
  for (const pt of p.partidas) if (!pt.titulo) apus[pt.id] = incremental ? apuEnCache(pt.id, p.apus[pt.id], p, insumos, jornada) : calcularApu(pt.id, p.apus[pt.id], insumos, jornada);
  const metradoPorPartida = metradosPorPartida(p);
  const filas = construirPresupuesto(p, apus, metradoPorPartida);
  const hojas = filas.filter((f) => !f.esTitulo);
  const cd = costoDirecto(filas);
  const programa = calcularPrograma(p, filas, apus);
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
  };
  const validacion = validar(parcial);
  const resumenValidacion = {
    errores: validacion.filter((v) => v.estado === 'error').length,
    advertencias: validacion.filter((v) => v.estado === 'advertencia').length,
    ok: validacion.filter((v) => v.estado === 'ok').length,
  };
  return { ...parcial, validacion, resumenValidacion };
}
