// Las 15 reglas de consistencia del expediente.
import type { Hallazgo, ReglaResultado, Resultados, Severidad } from './types';
import { codigoPadre, num, redondear, unidadConocida } from './util';

type Parcial = Omit<Resultados, 'validacion' | 'resumenValidacion'>;

const CONTROLES: Record<number, string> = {
  1: 'Presupuesto detallado vs resumen',
  2: 'APU vs precio unitario',
  3: 'Completitud por partida',
  4: 'Catálogo único de insumos',
  5: 'Relación de insumos vs costo directo',
  6: 'Cronograma valorizado',
  7: 'Plazo único',
  8: 'Calendario de adquisición de materiales',
  9: 'Personal (horas-hombre)',
  10: 'Fórmula polinómica',
  11: 'Pie de presupuesto',
  12: 'Unidades',
  13: 'Memoria descriptiva',
  14: 'Precedencias',
  15: 'Cumplimiento del TdR',
};

export function validar(r: Parcial): ReglaResultado[] {
  const h: Hallazgo[] = [];
  const add = (regla: number, severidad: Severidad, mensaje: string, referencia?: string) =>
    h.push({ regla, control: CONTROLES[regla], severidad, mensaje, referencia });
  const p = r.proyecto;
  const cd = r.pie.costoDirecto;
  const tolerancia = (n: number) => Math.max(0.05, n * 0.005);

  // 1. detallado vs resumen y jerarquía
  const codigos = new Set(p.partidas.map((x) => x.codigo));
  const vistos = new Set<string>();
  for (const pt of p.partidas) {
    if (vistos.has(pt.codigo)) add(1, 'error', `Código de partida duplicado: ${pt.codigo}.`, pt.codigo);
    vistos.add(pt.codigo);
    const padre = codigoPadre(pt.codigo);
    if (padre && !codigos.has(padre)) add(1, 'error', `La partida ${pt.codigo} no tiene título padre ${padre}.`, pt.codigo);
  }
  const tieneHijos = new Set(p.partidas.map((x) => codigoPadre(x.codigo)));
  for (const pt of p.partidas) {
    if (!pt.titulo && tieneHijos.has(pt.codigo)) add(1, 'error', `La partida ${pt.codigo} tiene subpartidas; debe marcarse como título.`, pt.codigo);
  }
  const sumaTitulos = redondear(r.filas.filter((f) => f.nivel === 1).reduce((a, f) => a + f.parcial, 0), 2);
  if (Math.abs(sumaTitulos - cd) > tolerancia(r.hojas.length) * 0.02 + 0.01)
    add(1, 'error', `La suma de títulos (${sumaTitulos.toFixed(2)}) difiere del costo directo (${cd.toFixed(2)}).`);

  // 2. APU vs PU / 3. completitud
  const eettPorId = new Map(r.eett.map((e) => [e.partida.id, e]));
  const actPorId = new Map(r.programa.actividades.map((a) => [a.partidaId, a]));
  for (const f of r.hojas) {
    const pt = f.partida;
    const apu = r.apus[pt.id];
    if (!apu || apu.items.length === 0) add(2, 'error', `La partida ${pt.codigo} no tiene APU.`, pt.codigo);
    else {
      const suma = redondear(apu.items.reduce((a, i) => a + i.parcial, 0), 2);
      if (Math.abs(suma - apu.pu) > 0.001) add(2, 'error', `El PU de ${pt.codigo} (${apu.pu}) no es la suma de su APU (${suma}).`, pt.codigo);
      if (apu.pu <= 0) add(2, 'error', `La partida ${pt.codigo} tiene precio unitario cero.`, pt.codigo);
      const tieneMO = apu.items.some((i) => i.insumo.tipo === 'MO' || i.insumo.tipo === 'EQ');
      if (tieneMO && apu.rendimiento <= 0) add(2, 'advertencia', `La partida ${pt.codigo} usa cuadrilla pero no tiene rendimiento.`, pt.codigo);
    }
    if (f.metrado <= 0) add(3, 'error', `La partida ${pt.codigo} no tiene metrado.`, pt.codigo);
    else {
      const filasMet = p.metrados.filter((m) => m.partidaId === pt.id);
      if (filasMet.every((m) => !m.referencia || !m.referencia.trim()))
        add(3, 'advertencia', `El metrado de ${pt.codigo} no indica plano o sustento.`, pt.codigo);
    }
    const e = eettPorId.get(pt.id);
    if (!e) add(3, 'error', `La partida ${pt.codigo} no tiene especificación técnica.`, pt.codigo);
    else if (e.generica) add(3, 'advertencia', `La EETT de ${pt.codigo} usa la plantilla genérica; asigne una plantilla o redacte el texto.`, pt.codigo);
    if (f.metrado > 0 && !actPorId.has(pt.id)) add(3, 'error', `La partida ${pt.codigo} no está en el programa de obra.`, pt.codigo);
  }

  // 4. catálogo
  const cod = new Set<string>();
  for (const i of p.insumos) {
    if (cod.has(i.codigo)) add(4, 'error', `Insumo duplicado: ${i.codigo}.`, i.codigo);
    cod.add(i.codigo);
    if (!i.unidad.startsWith('%') && num(i.precio) <= 0) {
      const usado = Object.values(r.apus).some((a) => a.items.some((x) => x.insumo.codigo === i.codigo));
      if (usado) add(4, 'error', `El insumo ${i.codigo} (${i.descripcion}) se usa y no tiene precio.`, i.codigo);
    }
    if (!i.iu) add(4, 'advertencia', `El insumo ${i.codigo} no tiene índice unificado.`, i.codigo);
  }
  for (const a of Object.values(r.apus)) for (const c of a.faltantes) {
    const pt = p.partidas.find((x) => x.id === a.partidaId);
    add(4, 'error', `El APU de ${pt?.codigo ?? '?'} usa el insumo ${c}, que no existe en el catálogo.`, pt?.codigo);
  }

  // 5. insumos vs CD
  if (Math.abs(r.insumos.diferenciaRedondeo) > Math.max(1, cd * 0.001))
    add(5, 'error', `La relación de insumos (${r.insumos.total.toFixed(2)}) difiere del costo directo en ${r.insumos.diferenciaRedondeo.toFixed(2)}.`);

  // 6. valorizado
  const sumaVal = redondear(r.valorizado.cd.reduce((a, b) => a + b, 0), 2);
  const actConCosto = r.programa.actividades.reduce((a, x) => a + x.parcial, 0);
  if (Math.abs(sumaVal - cd) > 0.05) add(6, 'error', `El cronograma valorizado suma ${sumaVal.toFixed(2)} y el costo directo es ${cd.toFixed(2)}.`);
  const ultimo = r.valorizado.acumuladoPct[r.valorizado.acumuladoPct.length - 1] ?? 0;
  if (cd > 0 && Math.abs(ultimo - 100) > 0.05) add(6, 'error', `El avance acumulado termina en ${ultimo}% y debe llegar a 100%.`);
  void actConCosto;

  // 7. plazo único
  for (const g of r.gg.items) {
    if (g.grupo === 'variable' && !g.ligadoAlPlazo && (g.unidad || '').toLowerCase() === 'mes' && g.duracionUsada > r.programa.plazoMeses + 0.01)
      add(7, 'advertencia', `El gasto variable "${g.descripcion}" dura ${g.duracionUsada} meses y el plazo de obra es ${r.programa.plazoMeses} meses.`);
  }
  if (r.programa.plazoDias <= 0 && r.hojas.length) add(7, 'error', 'No se pudo determinar el plazo de obra.');

  // 8. adquisiciones
  const relQty = new Map(r.insumos.items.map((i) => [i.insumo.codigo, i.cantidad]));
  for (const f of r.adquisiciones) {
    const q = relQty.get(f.codigo) ?? 0;
    const s = f.valores.reduce((a, b) => a + b, 0);
    if (Math.abs(s - q) > Math.max(0.05, q * 0.001)) add(8, 'error', `El calendario de ${f.descripcion} suma ${s.toFixed(2)} y la relación de insumos ${q.toFixed(2)}.`, f.codigo);
  }
  const sinPlazo = p.insumos.filter((i) => i.tipo === 'MAT' && (i.plazoCompraDias === null || i.plazoCompraDias === undefined) && r.adquisiciones.some((a) => a.codigo === i.codigo));
  if (sinPlazo.length) add(8, 'advertencia', `${sinPlazo.length} materiales usan la anticipación de compra por defecto (${p.meta.plazoCompraDefecto} días).`);

  // 9. personal
  const hhRel = r.insumos.items.filter((i) => i.insumo.tipo === 'MO').reduce((a, i) => a + i.cantidad, 0);
  const hhCron = r.personal.reduce((a, f) => a + f.valores.reduce((x, y) => x + y, 0), 0);
  if (Math.abs(hhRel - hhCron) > Math.max(0.5, hhRel * 0.001)) add(9, 'advertencia', `El histograma suma ${hhCron.toFixed(2)} hh y la relación de insumos ${hhRel.toFixed(2)} hh.`);
  if (p.meta.personalMaximo && r.personalPico > p.meta.personalMaximo)
    add(9, 'advertencia', `El pico de personal (${r.personalPico.toFixed(1)} trabajadores) supera el máximo indicado (${p.meta.personalMaximo}).`);

  // 10. polinómica
  const pol = r.polinomica;
  if (cd > 0) {
    if (Math.abs(pol.suma - 1) > 0.0005) add(10, 'error', `Los coeficientes suman ${pol.suma.toFixed(3)} y deben sumar 1.000.`);
    if (pol.monomios.length > 8) add(10, 'error', `La fórmula tiene ${pol.monomios.length} monomios (máximo 8).`);
    for (const m of pol.monomios) {
      if (m.coeficiente < 0.05 && pol.monomios.length > 1) add(10, 'error', `El monomio ${m.simbolo} tiene coeficiente ${m.coeficiente.toFixed(3)} (mínimo 0.050).`);
      if (m.indices.length > 3) add(10, 'error', `El monomio ${m.simbolo} tiene más de 3 índices.`);
    }
  }

  // 11. pie
  if (Math.abs(r.pie.gg - r.gg.total) > 0.005) add(11, 'error', 'Los gastos generales del pie no coinciden con el desagregado.');
  const tot = redondear(r.pie.costoDirecto + r.pie.gg + r.pie.utilidad, 2);
  if (Math.abs(tot - r.pie.subtotal) > 0.01 || Math.abs(redondear(r.pie.subtotal + r.pie.igv, 2) - r.pie.total) > 0.01) add(11, 'error', 'El pie de presupuesto no cuadra.');
  if (!p.meta.fechaBase) add(11, 'error', 'Falta la fecha de determinación del presupuesto.');
  if (r.gg.items.length === 0) add(11, 'advertencia', 'No hay desagregado de gastos generales.');

  // 12. unidades
  for (const f of r.hojas) {
    if (!f.partida.unidad) add(12, 'error', `La partida ${f.partida.codigo} no tiene unidad.`, f.partida.codigo);
    else if (!unidadConocida(f.partida.unidad)) add(12, 'advertencia', `Unidad poco usual en ${f.partida.codigo}: "${f.partida.unidad}".`, f.partida.codigo);
  }

  // 13. memoria: cifras escritas a mano que no coinciden
  const textos = Object.values(p.memoria).join(' ');
  const plazoRe = /(\d{2,4})\s*d[ií]as\s+calendario/gi;
  let m: RegExpExecArray | null;
  while ((m = plazoRe.exec(textos))) {
    if (parseInt(m[1], 10) !== r.programa.plazoDias) add(13, 'error', `La memoria menciona "${m[0]}" y el plazo calculado es ${r.programa.plazoDias} días calendario.`);
  }
  const montoRe = /S\/\s*([\d.,]{4,})/g;
  while ((m = montoRe.exec(textos))) {
    const v = parseFloat(m[1].replace(/,/g, ''));
    const conocidos = [r.pie.total, r.pie.costoDirecto, r.pie.subtotal].map((x) => redondear(x, 2));
    if (!conocidos.some((c) => Math.abs(c - v) < 0.01)) add(13, 'advertencia', `La memoria menciona el monto ${m[0]}, que no coincide con el presupuesto.`);
  }

  // 14. precedencias
  for (const e of r.programa.errores) add(14, e.includes('ciclo') ? 'error' : 'advertencia', e);
  const sinPred = r.programa.actividades.filter((a) => a.predecesoras.length === 0);
  if (sinPred.length > 1) add(14, 'advertencia', `${sinPred.length} actividades no tienen predecesora y empiezan el día 1: ${sinPred.slice(0, 6).map((a) => a.codigo).join(', ')}${sinPred.length > 6 ? '…' : ''}.`);

  // 15. TdR
  for (const e of p.tdr.entregables) {
    if (e.obligatorio && !e.documento) add(15, 'error', `El entregable "${e.descripcion}" no está asignado a ningún documento.`);
    if (e.documento === 'externo' && !(e.observacion || '').trim()) add(15, 'advertencia', `El entregable externo "${e.descripcion}" no indica responsable u observación.`);
  }
  if (p.tdr.entregables.length === 0) add(15, 'advertencia', 'No se cargó la lista de entregables del TdR.');

  const out: ReglaResultado[] = [];
  for (let n = 1; n <= 15; n++) {
    const hs = h.filter((x) => x.regla === n);
    const estado = hs.some((x) => x.severidad === 'error') ? 'error' : hs.length ? 'advertencia' : 'ok';
    out.push({
      regla: n,
      control: CONTROLES[n],
      estado,
      detalle: estado === 'ok' ? 'Conforme' : `${hs.length} observación(es)`,
      hallazgos: hs,
    });
  }
  return out;
}

export { CONTROLES };
