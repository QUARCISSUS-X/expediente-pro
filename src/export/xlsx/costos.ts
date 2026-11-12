// Excel del expediente: insumos, metrados, resumen de metrados, APU, presupuesto y resumen de costos.
import type { Resultados, TipoInsumo } from '../../engine/types';
import { isoAFecha, num, redondear } from '../../engine/util';
import { AZUL, AZUL_INPUT, GRIS, GRIS2, F_MONEDA, F_CANT, F_MET, F_PCT, F_FECHA, Hoja, Ctx, finMembrete, membrete, configurarImpresion } from './comun';
import { formulaExcel } from '../../engine/expresion';

export const TIPOS: { t: TipoInsumo; n: string }[] = [
  { t: 'MO', n: 'MANO DE OBRA' },
  { t: 'MAT', n: 'MATERIALES' },
  { t: 'EQ', n: 'EQUIPOS' },
  { t: 'SC', n: 'SUBCONTRATOS' },
];

export function insumosUsados(r: Resultados) {
  const usados = new Map(r.insumos.items.map((i) => [i.insumo.codigo, i]));
  // también los insumos usados en APU de partidas sin metrado
  for (const a of Object.values(r.apus)) for (const it of a.items) if (!usados.has(it.insumo.codigo)) usados.set(it.insumo.codigo, { insumo: it.insumo, cantidad: 0, precio: it.insumo.precio, parcial: 0 });
  return usados;
}

/** Fija de antemano la fila de cada insumo en la hoja Insumos (los APU se escriben antes y la referencian). */
export function planInsumos(ctx: Ctx) {
  const usados = insumosUsados(ctx.r);
  let f = finMembrete(ctx) + 1;
  for (const { t } of TIPOS) {
    const its = [...usados.values()].filter((x) => x.insumo.tipo === t).sort((a, b) => a.insumo.descripcion.localeCompare(b.insumo.descripcion));
    if (!its.length) continue;
    f++;
    for (const it of its) ctx.insumoFila.set(it.insumo.codigo, f++);
  }
}

export function hojaInsumos(ctx: Ctx, h: Hoja, hApu: Hoja) {
  const { r } = ctx;
  const usados = insumosUsados(r);
  h.anchos([12, 52, 8, 6, 6, 13, 30, 12, 14, 15]);
  let f = membrete(h, ctx, 'Relación y cotización de insumos', 10);
  const filaCab = f;
  h.cabecera(f++, ['Código', 'Descripción del insumo', 'Unidad', 'Tipo', 'IU', `Precio (${r.proyecto.meta.moneda})`, 'Fuente / cotización', 'Fecha cot.', 'Cantidad', `Parcial (${r.proyecto.meta.moneda})`]);
  const subtotales: string[] = [];
  const sumRango = `${hApu.rango(1, 1, 20000, 1)}`;
  for (const { t, n } of TIPOS) {
    const its = [...usados.values()].filter((x) => x.insumo.tipo === t).sort((a, b) => a.insumo.descripcion.localeCompare(b.insumo.descripcion));
    if (!its.length) continue;
    const fGrupo = f++;
    h.v(fGrupo, 2, n, { negrita: true });
    h.fila(fGrupo, 1, 10, { fondo: GRIS, negrita: true });
    const ini = f;
    for (const it of its) {
      const i = it.insumo;
      const pct = i.unidad.trim().startsWith('%');
      h.v(f, 1, i.codigo, { borde: 'hair' });
      h.v(f, 2, i.descripcion, { borde: 'hair' });
      h.v(f, 3, i.unidad, { h: 'center', borde: 'hair' });
      h.v(f, 4, i.tipo, { h: 'center', borde: 'hair' });
      h.v(f, 5, i.iu || '39', { h: 'center', borde: 'hair' });
      if (pct) h.v(f, 6, null, { borde: 'hair' });
      else h.dato(f, 6, i.precio, { fmt: F_MONEDA, borde: 'hair' });
      h.dato(f, 7, i.fuente ?? '', { borde: 'hair', tam: 7.5 });
      h.dato(f, 8, i.fechaPrecio ? isoAFecha(i.fechaPrecio) : null, { fmt: F_FECHA, borde: 'hair', tam: 7.5 });
      if (pct) {
        h.v(f, 9, null, { borde: 'hair' });
        h.fx(f, 10, `=ROUND(SUMIF(${sumRango},$A${f},${hApu.rango(1, 9, 20000, 9)}),2)`, it.parcial, { fmt: F_MONEDA, borde: 'hair' });
      } else {
        h.fx(f, 9, `=ROUND(SUMIF(${sumRango},$A${f},${hApu.rango(1, 8, 20000, 8)}),4)`, it.cantidad, { fmt: F_CANT, borde: 'hair' });
        h.fx(f, 10, `=ROUND(I${f}*F${f},2)`, it.parcial, { fmt: F_MONEDA, borde: 'hair' });
      }
      if (ctx.insumoFila.get(i.codigo) !== f) throw new Error(`Desfase de filas en Insumos (${i.codigo})`);
      f++;
    }
    h.fx(fGrupo, 10, `=SUM(J${ini}:J${f - 1})`, r.insumos.porTipo[t], { fmt: F_MONEDA, negrita: true, fondo: GRIS });
    ctx.totalesGrupoInsumo[t] = h.ref(fGrupo, 10);
    subtotales.push(`J${fGrupo}`);
  }
  f++;
  h.v(f, 2, 'TOTAL DE INSUMOS', { negrita: true });
  h.fx(f, 10, `=${subtotales.join('+') || 0}`, r.insumos.total, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 10, { borde: 'arriba', negrita: true });
  ctx.refs.INS_TOTAL = h.ref(f, 10);
  f++;
  h.v(f, 2, 'Diferencia por redondeo de los análisis de precios unitarios', { cursiva: true, tam: 7.5 });
  h.fx(f, 10, `=${ctx.refs.CD}-J${f - 1}`, r.insumos.diferenciaRedondeo, { fmt: F_MONEDA, cursiva: true, tam: 7.5 });
  f++;
  h.v(f, 2, 'COSTO DIRECTO', { negrita: true });
  h.link(f, 10, `=${ctx.refs.CD}`, r.pie.costoDirecto, { fmt: F_MONEDA, negrita: true });
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, false);
}

// ------------------------------------------------------------ Metrados

export function hojaMetrados(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const p = r.proyecto;
  h.anchos([13, 46, 6, 18, 8, 9, 8, 9, 9, 9, 10, 10, 12, 13]);
  let f = membrete(h, ctx, 'Planilla de sustento de metrados', 14);
  const filaCab = f;
  h.cabecera(f++, ['Ítem', 'Descripción', 'Und', 'Referencia (plano N.º)', 'N.º veces', 'Cantidad', 'Factor', 'Largo (m)', 'Ancho (m)', 'Alto (m)', 'Área CAD (m²)', 'Volumen CAD (m³)', 'Metrado parcial', 'Metrado total']);
  const porPartida = new Map<string, typeof p.metrados>();
  for (const m of p.metrados) {
    const l = porPartida.get(m.partidaId) ?? [];
    l.push(m);
    porPartida.set(m.partidaId, l);
  }
  for (const fp of r.filas) {
    const pt = fp.partida;
    if (fp.esTitulo) {
      h.v(f, 1, pt.codigo, { negrita: true });
      h.v(f, 2, pt.descripcion, { negrita: true });
      h.fila(f, 1, 14, { fondo: fp.nivel === 1 ? GRIS : GRIS2, negrita: true });
      f++;
      continue;
    }
    const fP = f++;
    h.v(fP, 1, pt.codigo, { negrita: true });
    h.v(fP, 2, pt.descripcion, { negrita: true, ajustar: true });
    h.v(fP, 3, pt.unidad, { h: 'center', negrita: true });
    const lineas = porPartida.get(pt.id) ?? [];
    const ini = f;
    for (const m of lineas) {
      h.v(f, 2, m.descripcion, { sangria: 1, borde: 'hair' });
      h.dato(f, 4, m.referencia ?? '', { borde: 'hair', tam: 7.5 });
      (['veces', 'cantidad', 'factor', 'largo', 'ancho', 'alto', 'area', 'volumen'] as const).forEach((k, i) => {
        const val = m[k];
        const formula = m.formulas?.[k];
        // un campo con fórmula («2*(3.5+4.2)») va como fórmula de Excel con su resultado
        if (formula && val !== null && val !== undefined) h.fx(f, 5 + i, `=${formulaExcel(formula)}`, num(val), { fmt: '#,##0.00##', borde: 'hair', color: AZUL_INPUT });
        else h.dato(f, 5 + i, val === null || val === undefined || (val as unknown) === '' ? null : num(val), { fmt: '#,##0.00##', borde: 'hair' });
      });
      const llenos = (['veces', 'cantidad', 'factor', 'largo', 'ancho', 'alto', 'area', 'volumen'] as const).map((k) => m[k]).filter((x) => x !== null && x !== undefined && (x as unknown) !== '');
      const parcial = llenos.length ? llenos.reduce<number>((a, b) => a * num(b), 1) : 0;
      h.fx(f, 13, `=IF(COUNT(E${f}:L${f})=0,0,PRODUCT(E${f}:L${f}))`, parcial, { fmt: F_MET, borde: 'hair' });
      f++;
    }
    const total = r.metradoPorPartida[pt.id] ?? 0;
    h.fx(fP, 14, lineas.length ? `=ROUND(SUM(M${ini}:M${f - 1}),2)` : '=0', total, { fmt: F_MET, negrita: true });
    ctx.metTotal.set(pt.id, h.ref(fP, 14));
  }
  h.ws.views = [{ state: 'frozen', ySplit: filaCab, xSplit: 2 }];
  configurarImpresion(h, ctx, filaCab, true);
}

export function hojaResumenMetrados(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  h.anchos([13, 70, 8, 14]);
  let f = membrete(h, ctx, 'Resumen de metrados', 4);
  const filaCab = f;
  h.cabecera(f++, ['Ítem', 'Descripción', 'Und', 'Metrado']);
  for (const fp of r.filas) {
    h.v(f, 1, fp.partida.codigo, { negrita: fp.esTitulo, borde: 'hair' });
    h.v(f, 2, fp.partida.descripcion, { negrita: fp.esTitulo, sangria: fp.nivel - 1, borde: 'hair' });
    if (!fp.esTitulo) {
      h.v(f, 3, fp.partida.unidad, { h: 'center', borde: 'hair' });
      h.link(f, 4, `=${ctx.metTotal.get(fp.partida.id)}`, fp.metrado, { fmt: F_MET, borde: 'hair' });
    } else h.fila(f, 1, 4, { fondo: fp.nivel === 1 ? GRIS : GRIS2 });
    f++;
  }
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, false);
}

// ------------------------------------------------------------ APU (formato estándar)

export function hojaApu(ctx: Ctx, h: Hoja, hPpto: Hoja, filaPptoDe: Map<string, number>) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  h.anchos([13, 48, 7, 10, 11, 11, 12, 12, 12]);
  let f = membrete(h, ctx, 'Análisis de precios unitarios', 7);
  for (const fp of r.hojas) {
    const pt = fp.partida;
    const a = r.apus[pt.id];
    if (!a) continue;
    h.v(f, 1, 'Partida', { negrita: true, fondo: GRIS });
    h.v(f, 2, `${pt.codigo}   ${pt.descripcion}`, { negrita: true, fondo: GRIS, ajustar: true });
    h.ws.mergeCells(f, 2, f, 7);
    f++;
    const fRend = f;
    h.v(f, 1, 'Rendimiento', { negrita: true });
    h.dato(f, 2, a.rendimiento, { fmt: `#,##0.0000" ${pt.unidad.replace(/"/g, '')}/día"`, h: 'left' });
    // jornada del análisis: la del proyecto (vínculo) o una propia de este APU (dato)
    const apuP = r.proyecto.apus[pt.id];
    if (apuP?.jornada) h.dato(f, 3, a.jornada, { fmt: '0.0" h/día"', tam: 7.5 });
    else h.link(f, 3, '=JORNADA', a.jornada, { fmt: '0.0" h/día"', tam: 7.5 });
    h.v(f, 4, `Costo unitario directo por: ${pt.unidad}`, { negrita: true, h: 'right' });
    h.ws.mergeCells(f, 4, f, 6);
    const refRend = `$B$${fRend}`;
    ctx.apuRend.set(pt.id, h.ref(fRend, 2));
    f++;
    h.cabecera(f++, ['Código', 'Descripción del recurso', 'Unidad', 'Cuadrilla', 'Cantidad', `Precio (${mon})`, `Parcial (${mon})`]);
    const metRef = `'${hPpto.nombre}'!$D$${filaPptoDe.get(pt.id)}`;
    // primera pasada: filas de cada grupo y de cada recurso (los % de MO/MAT se calculan sobre los recursos no porcentuales)
    const grupos = TIPOS.filter(({ t }) => a.items.some((x) => x.insumo.tipo === t));
    const plan: { t: TipoInsumo; n: string; fila: number; items: { it: (typeof a.items)[number]; fila: number }[] }[] = [];
    const noPct: Record<string, number[]> = { MO: [], MAT: [], EQ: [], SC: [] };
    let g = f;
    for (const { t, n } of grupos) {
      const fG = g++;
      const items = a.items.filter((x) => x.insumo.tipo === t).map((it) => ({ it, fila: g++ }));
      for (const x of items) if (x.it.porcentaje === null && !x.it.subpartida) noPct[t].push(x.fila); // base de los %: solo recursos propios
      plan.push({ t, n, fila: fG, items });
    }
    const subt: string[] = [];
    for (const grp of plan) {
      h.v(grp.fila, 2, grp.n.charAt(0) + grp.n.slice(1).toLowerCase(), { negrita: true });
      for (const { it, fila: fr } of grp.items) {
        const fi = ctx.insumoFila.get(it.insumo.codigo);
        const pct = it.porcentaje !== null;
        h.v(fr, 1, it.subpartida ? `${it.insumo.codigo} (${it.subpartida})` : it.insumo.codigo, { borde: 'hair' });
        h.link(fr, 2, fi ? `='Insumos'!$B$${fi}` : `="${it.insumo.descripcion.replace(/"/g, '""')}"`, it.insumo.descripcion, { borde: 'hair', color: 'FF20262A' });
        h.v(fr, 3, it.insumo.unidad, { h: 'center', borde: 'hair' });
        if (pct && it.subpartida) {
          // % de una subpartida desglosada: monto fijo (cantidad de la subpartida × su parcial)
          h.v(fr, 4, null, { borde: 'hair' });
          h.v(fr, 5, it.cantidad, { fmt: '0.00"%"', borde: 'hair' });
          h.v(fr, 6, null, { borde: 'hair' });
          h.dato(fr, 7, it.parcial, { fmt: F_MONEDA, borde: 'hair' });
          h.v(fr, 8, null);
          h.fx(fr, 9, `=G${fr}*${metRef}`, it.parcial * fp.metrado, { fmt: F_MONEDA });
        } else if (pct) {
          const deMat = it.insumo.unidad.toLowerCase().includes('mat');
          const base = noPct[deMat ? 'MAT' : 'MO'];
          const baseVal = a.items.filter((x) => x.porcentaje === null && !x.subpartida && x.insumo.tipo === (deMat ? 'MAT' : 'MO')).reduce((acc, x) => acc + x.parcial, 0);
          h.v(fr, 4, null, { borde: 'hair' });
          h.dato(fr, 5, it.cantidad, { fmt: '0.00"%"', borde: 'hair' });
          h.fx(fr, 6, base.length ? `=${base.map((x) => `G${x}`).join('+')}` : '=0', redondear(baseVal, 2), { fmt: F_MONEDA, borde: 'hair' });
          h.fx(fr, 7, `=ROUND(E${fr}/100*F${fr},2)`, it.parcial, { fmt: F_MONEDA, borde: 'hair' });
          h.v(fr, 8, null);
          h.fx(fr, 9, `=G${fr}*${metRef}`, it.parcial * fp.metrado, { fmt: F_MONEDA });
        } else {
          const conCuadrilla = it.cuadrilla !== null && (grp.t === 'MO' || grp.t === 'EQ');
          if (conCuadrilla) {
            h.dato(fr, 4, it.cuadrilla, { fmt: '0.0000', borde: 'hair' });
            h.fx(fr, 5, `=IF(${refRend}>0,ROUND(D${fr}*$C$${fRend}/${refRend},4),0)`, it.cantidad, { fmt: F_CANT, borde: 'hair' });
          } else {
            h.v(fr, 4, null, { borde: 'hair' });
            h.dato(fr, 5, it.cantidad, { fmt: F_CANT, borde: 'hair' });
          }
          h.link(fr, 6, fi ? `='Insumos'!$F$${fi}` : '=0', it.precio, { fmt: F_MONEDA, borde: 'hair' });
          h.fx(fr, 7, `=ROUND(E${fr}*F${fr},2)`, it.parcial, { fmt: F_MONEDA, borde: 'hair' });
          h.fx(fr, 8, `=E${fr}*${metRef}`, it.cantidad * fp.metrado, { fmt: F_CANT });
          ctx.apuFilas.push({ fila: fr, partidaId: pt.id, codigo: it.insumo.codigo, tipo: it.insumo.tipo, total: it.cantidad * fp.metrado });
          h.fx(fr, 9, `=G${fr}*${metRef}`, it.parcial * fp.metrado, { fmt: F_MONEDA });
        }
      }
      const ini = grp.fila + 1;
      const ult = grp.items.length ? grp.items[grp.items.length - 1].fila : grp.fila;
      h.fx(grp.fila, 7, ult > grp.fila ? `=SUM(G${ini}:G${ult})` : '=0', a.subtotales[grp.t], { fmt: F_MONEDA, negrita: true });
      subt.push(`G${grp.fila}`);
    }
    f = g;
    h.fx(fRend, 7, `=ROUND(${subt.join('+') || 0},2)`, a.pu, { fmt: F_MONEDA, negrita: true, fondo: GRIS });
    ctx.apuPU.set(pt.id, h.ref(fRend, 7));
    f += 1;
  }
  // columnas auxiliares para la relación de insumos (cantidad y parcial por el metrado)
  h.ws.getColumn(8).hidden = true;
  h.ws.getColumn(9).hidden = true;
  h.ws.getCell(5, 8).value = 'Aux: cantidad × metrado';
  h.ws.getCell(5, 9).value = 'Aux: parcial × metrado';
  configurarImpresion(h, ctx, 0, false);
  h.ws.pageSetup.printTitlesRow = undefined;
}

// ------------------------------------------------------------ Presupuesto

export function filaUltimoDescendiente(r: Resultados, idx: number): number {
  const base = r.filas[idx];
  let j = idx;
  while (j + 1 < r.filas.length && r.filas[j + 1].partida.codigo.startsWith(base.partida.codigo + '.')) j++;
  return j;
}

export function hojaPresupuesto(ctx: Ctx, h: Hoja, filaPptoDe: Map<string, number>, soloPlan = false) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  h.anchos([14, 58, 7, 12, 12, 15, 4]);
  let f = soloPlan ? finMembrete(ctx) : membrete(h, ctx, r.proyecto.meta.modo === 'publico' ? 'Presupuesto de obra' : 'Presupuesto', 6);
  const filaCab = f;
  if (!soloPlan) h.cabecera(f, ['Ítem', 'Descripción', 'Und.', 'Metrado', `Precio (${mon})`, `Parcial (${mon})`]);
  f++;
  const ini = f;
  // primera pasada: filas (el APU necesita conocer la fila del metrado de cada partida)
  r.filas.forEach((fp) => {
    filaPptoDe.set(fp.partida.id, f);
    f++;
  });
  if (soloPlan) return;
  const fin = f - 1;
  r.filas.forEach((fp, idx) => {
    const fi = filaPptoDe.get(fp.partida.id)!;
    const pt = fp.partida;
    h.v(fi, 1, pt.codigo, { negrita: fp.esTitulo, borde: 'hair' });
    h.v(fi, 2, pt.descripcion, { negrita: fp.esTitulo, sangria: Math.min(4, fp.nivel - 1), ajustar: true, borde: 'hair' });
    h.v(fi, 7, fp.esTitulo ? 'T' : 'P', { tam: 6, color: 'FFB0B8BF' });
    if (fp.esTitulo) {
      const ult = filaPptoDe.get(r.filas[filaUltimoDescendiente(r, idx)].partida.id)!;
      h.fx(fi, 6, ult > fi ? `=SUBTOTAL(9,F${fi + 1}:F${ult})` : '=0', fp.parcial, { fmt: F_MONEDA, negrita: true, borde: 'hair' });
      h.fila(fi, 1, 6, { fondo: fp.nivel === 1 ? GRIS : GRIS2 });
    } else {
      h.v(fi, 3, pt.unidad, { h: 'center', borde: 'hair' });
      h.link(fi, 4, `=${ctx.metTotal.get(pt.id)}`, fp.metrado, { fmt: F_MET, borde: 'hair' });
      h.link(fi, 5, `=${ctx.apuPU.get(pt.id)}`, fp.pu, { fmt: F_MONEDA, borde: 'hair' });
      h.fx(fi, 6, `=ROUND(D${fi}*E${fi},2)`, fp.parcial, { fmt: F_MONEDA, borde: 'hair' });
      ctx.ppto.set(pt.id, { met: h.ref(fi, 4), pu: h.ref(fi, 5), parcial: h.ref(fi, 6), fila: fi });
    }
  });
  h.ws.getColumn(7).hidden = true;
  f = fin + 2;
  const pie = r.pie;
  const fCD = f;
  h.v(f, 2, 'COSTO DIRECTO', { negrita: true, h: 'right' });
  h.fx(f, 6, `=SUBTOTAL(9,F${ini}:F${fin})`, pie.costoDirecto, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 6, { borde: 'arriba' });
  ctx.refs.CD = h.ref(f, 6);
  f++;
  const fGG = f;
  h.v(f, 2, 'GASTOS GENERALES', { h: 'right' });
  h.fx(f, 5, `=IF(F${fCD}>0,F${f}/F${fCD},0)`, pie.costoDirecto ? pie.gg / pie.costoDirecto : 0, { fmt: F_PCT });
  ctx.refs.GG_FILA = String(f);
  f++;
  const fUt = f;
  h.v(f, 2, 'UTILIDAD', { h: 'right' });
  h.link(f, 5, `=UTILIDAD`, r.proyecto.meta.utilidadPct / 100, { fmt: F_PCT });
  h.fx(f, 6, `=ROUND(F${fCD}*E${f},2)`, pie.utilidad, { fmt: F_MONEDA });
  ctx.refs.UTIL = h.ref(f, 6);
  f++;
  const fSub = f;
  h.v(f, 2, 'SUBTOTAL', { negrita: true, h: 'right' });
  h.fx(f, 6, `=F${fCD}+F${fGG}+F${fUt}`, pie.subtotal, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 6, { borde: 'arriba' });
  ctx.refs.SUB = h.ref(f, 6);
  f++;
  const fIgv = f;
  h.v(f, 2, 'IGV', { h: 'right' });
  h.fx(f, 5, `=IGV*INCLUIR_IGV`, r.proyecto.meta.incluirIgv === false ? 0 : r.proyecto.meta.igvPct / 100, { fmt: F_PCT });
  h.fx(f, 6, `=ROUND(F${fSub}*E${f},2)`, pie.igv, { fmt: F_MONEDA });
  ctx.refs.IGV = h.ref(f, 6);
  f++;
  h.v(f, 2, r.proyecto.meta.modo === 'publico' ? 'VALOR REFERENCIAL' : 'PRESUPUESTO TOTAL', { negrita: true, h: 'right' });
  h.fx(f, 6, `=F${fSub}+F${fIgv}`, pie.total, { fmt: F_MONEDA, negrita: true, fondo: GRIS });
  h.fila(f, 1, 6, { borde: 'arriba' });
  ctx.refs.TOTAL = h.ref(f, 6);
  ctx.refs.PPTO_FILAS = `${ini}:${fin}`;
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, false);
}

/** La celda de GG del pie apunta a la hoja de gastos generales (se escribe al final). */
export function completarGGPresupuesto(ctx: Ctx, h: Hoja) {
  const f = Number(ctx.refs.GG_FILA);
  h.link(f, 6, `=${ctx.refs.GG}`, ctx.r.pie.gg, { fmt: F_MONEDA });
}

// ------------------------------------------------------------ Resumen y resumen de costos

export function hojaResumen(ctx: Ctx, h: Hoja, filaPptoDe: Map<string, number>) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  h.anchos([14, 60, 16, 10]);
  let f = membrete(h, ctx, 'Resumen de presupuesto', 4);
  const filaCab = f;
  h.cabecera(f++, ['Ítem', 'Descripción', `Parcial (${mon})`, '% del CD']);
  for (const fp of r.filas) {
    if (!fp.esTitulo || fp.nivel > 2) continue;
    const fi = filaPptoDe.get(fp.partida.id)!;
    h.v(f, 1, fp.partida.codigo, { negrita: fp.nivel === 1, borde: 'hair' });
    h.v(f, 2, fp.partida.descripcion, { negrita: fp.nivel === 1, sangria: fp.nivel - 1, borde: 'hair' });
    h.link(f, 3, `='Presupuesto'!$F$${fi}`, fp.parcial, { fmt: F_MONEDA, negrita: fp.nivel === 1, borde: 'hair' });
    h.fx(f, 4, `=IF(${ctx.refs.CD}>0,C${f}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? fp.parcial / r.pie.costoDirecto : 0, { fmt: F_PCT, borde: 'hair' });
    f++;
  }
  f++;
  const pie: [string, string, number, boolean][] = [
    ['COSTO DIRECTO', ctx.refs.CD, r.pie.costoDirecto, true],
    ['Gastos generales', ctx.refs.GG, r.pie.gg, false],
    ['Utilidad', ctx.refs.UTIL, r.pie.utilidad, false],
    ['SUBTOTAL', ctx.refs.SUB, r.pie.subtotal, true],
    ['IGV', ctx.refs.IGV, r.pie.igv, false],
    [r.proyecto.meta.modo === 'publico' ? 'VALOR REFERENCIAL' : 'PRESUPUESTO TOTAL', ctx.refs.TOTAL, r.pie.total, true],
  ];
  for (const [n, ref, val, neg] of pie) {
    h.v(f, 2, n, { negrita: neg, h: 'right' });
    h.link(f, 3, `=${ref}`, val, { fmt: F_MONEDA, negrita: neg });
    h.fx(f, 4, `=IF(${ctx.refs.CD}>0,C${f}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? val / r.pie.costoDirecto : 0, { fmt: F_PCT });
    if (neg) h.fila(f, 1, 4, { borde: 'arriba' });
    f++;
  }
  // resumen de costos por tipo de insumo
  f += 2;
  h.v(f++, 1, 'RESUMEN DE COSTOS POR TIPO DE INSUMO', { negrita: true, color: AZUL });
  h.cabecera(f++, ['Tipo', 'Descripción', `Monto (${mon})`, '% del CD']);
  const ini = f;
  for (const { t, n } of TIPOS) {
    const ref = ctx.totalesGrupoInsumo[t];
    if (!ref) continue;
    h.v(f, 1, t, { borde: 'hair' });
    h.v(f, 2, n.charAt(0) + n.slice(1).toLowerCase(), { borde: 'hair' });
    h.link(f, 3, `=${ref}`, r.insumos.porTipo[t], { fmt: F_MONEDA, borde: 'hair' });
    h.fx(f, 4, `=IF(${ctx.refs.CD}>0,C${f}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? r.insumos.porTipo[t] / r.pie.costoDirecto : 0, { fmt: F_PCT, borde: 'hair' });
    f++;
  }
  h.v(f, 2, 'Diferencia por redondeo', { cursiva: true, borde: 'hair' });
  h.fx(f, 3, `=${ctx.refs.CD}-SUM(C${ini}:C${f - 1})`, r.insumos.diferenciaRedondeo, { fmt: F_MONEDA, cursiva: true, borde: 'hair' });
  f++;
  h.v(f, 2, 'COSTO DIRECTO', { negrita: true });
  h.fx(f, 3, `=SUM(C${ini}:C${f - 1})`, r.pie.costoDirecto, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 4, { borde: 'arriba' });
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, false);
}

// ------------------------------------------------------------ Gastos generales
