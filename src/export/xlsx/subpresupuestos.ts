// Excel del expediente: una hoja por subpresupuesto (sus partidas vinculadas al Presupuesto y su propio pie) y el consolidado.
import ExcelJS from 'exceljs';
import type { Resultados } from '../../engine/types';
import { F_MONEDA, F_MET, GRIS, GRIS2, Hoja, type Ctx, configurarImpresion, membrete } from './comun';

/** Nombre de hoja válido para Excel (31 caracteres, sin []:*?/\). */
const nombreHoja = (n: string, usados: Set<string>) => {
  let base = `SP ${n}`.replace(/[[\]:*?/\\]/g, ' ').slice(0, 28).trim();
  let s = base;
  for (let k = 2; usados.has(s.toLowerCase()); k++) s = `${base.slice(0, 26)} ${k}`;
  usados.add(s.toLowerCase());
  return s;
};

/** Crea (vacías) las hojas de los subpresupuestos y la del consolidado, para que queden junto al Resumen. */
export function crearHojasSubpresupuestos(wb: ExcelJS.Workbook, r: Resultados): { subs: Hoja[]; consolidado: Hoja } | null {
  if (!r.subpresupuestos.length) return null;
  const usados = new Set(wb.worksheets.map((w) => w.name.toLowerCase()));
  const consolidado = new Hoja(wb, 'Consolidado');
  return { consolidado, subs: r.subpresupuestos.map((s) => new Hoja(wb, nombreHoja(s.nombre, usados))) };
}

/**
 * Llena cada hoja de subpresupuesto: partidas vinculadas a la hoja Presupuesto, costo directo de sus títulos y GG, utilidad
 * e IGV prorrateados por costo directo (el último toma el saldo, como el motor), y el consolidado que suma los pies.
 */
export function hojasSubpresupuestos(ctx: Ctx, hojas: { subs: Hoja[]; consolidado: Hoja }, filaPptoDe: Map<string, number>) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  const pp = (c: string, fi: number) => `'Presupuesto'!$${c}$${fi}`;
  const refsPie: Record<string, string>[] = [];
  const n = r.subpresupuestos.length;
  r.subpresupuestos.forEach((s, k) => {
    const h = hojas.subs[k];
    const ultimo = k === n - 1;
    h.anchos([13, 60, 7, 13, 13, 15]);
    let f = membrete(h, ctx, `Subpresupuesto: ${s.nombre}`, 6);
    const filaCab = f;
    h.cabecera(f++, ['Ítem', 'Descripción', 'Und', 'Metrado', `Precio (${mon})`, `Parcial (${mon})`]);
    const titulos = new Set(s.titulos);
    const raices: number[] = [];
    let dentro = false;
    for (const fp of r.filas) {
      if (fp.nivel === 1) dentro = titulos.has(fp.partida.id);
      if (!dentro) continue;
      const fi = filaPptoDe.get(fp.partida.id)!;
      h.v(f, 1, fp.partida.codigo, { negrita: fp.esTitulo, borde: 'hair' });
      h.v(f, 2, fp.partida.descripcion, { negrita: fp.esTitulo, sangria: fp.nivel - 1, borde: 'hair', ajustar: true });
      if (!fp.esTitulo) {
        h.v(f, 3, fp.partida.unidad, { h: 'center', borde: 'hair' });
        h.link(f, 4, `=${pp('D', fi)}`, fp.metrado, { fmt: F_MET, borde: 'hair' });
        h.link(f, 5, `=${pp('E', fi)}`, fp.pu, { fmt: F_MONEDA, borde: 'hair' });
      }
      h.link(f, 6, `=${pp('F', fi)}`, fp.parcial, { fmt: F_MONEDA, borde: 'hair', negrita: fp.esTitulo });
      if (fp.esTitulo) h.fila(f, 1, 6, { fondo: fp.nivel === 1 ? GRIS : GRIS2 });
      if (fp.nivel === 1) raices.push(f);
      f++;
    }
    f++;
    const prorrateo = (total: string, clave: string) => (ultimo ? `=${total}-(${refsPie.length ? refsPie.map((x) => x[clave]).join('+') : '0'})` : `=IF(${ctx.refs.CD}>0,ROUND(${total}*$F$${f0}/${ctx.refs.CD},2),0)`);
    const f0 = f;
    const p = s.pie;
    const refs: Record<string, string> = {};
    const fila = (nombre: string, formula: string, valor: number, clave: string, neg = false) => {
      h.v(f, 2, nombre, { negrita: neg, h: 'right' });
      h.fx(f, 6, formula, valor, { fmt: F_MONEDA, negrita: neg });
      if (neg) h.fila(f, 1, 6, { borde: 'arriba' });
      refs[clave] = h.ref(f, 6);
      f++;
    };
    fila('COSTO DIRECTO', ultimo ? `=${ctx.refs.CD}-(${refsPie.length ? refsPie.map((x) => x.CD).join('+') : '0'})` : `=ROUND(${raices.map((x) => `F${x}`).join('+') || '0'},2)`, p.costoDirecto, 'CD', true);
    fila('Gastos generales (prorrateados por costo directo)', prorrateo(ctx.refs.GG, 'GG'), p.gg, 'GG');
    fila('Utilidad', prorrateo(ctx.refs.UTIL, 'UTIL'), p.utilidad, 'UTIL');
    fila('SUBTOTAL', `=F${f0}+F${f0 + 1}+F${f0 + 2}`, p.subtotal, 'SUB', true);
    fila('IGV', prorrateo(ctx.refs.IGV, 'IGV'), p.igv, 'IGV');
    fila('TOTAL', `=F${f0 + 3}+F${f0 + 4}`, p.total, 'TOTAL', true);
    refsPie.push(refs);
    h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
    configurarImpresion(h, ctx, filaCab, false);
  });

  // consolidado: un renglón por subpresupuesto y la suma, igual al pie del presupuesto
  const h = hojas.consolidado;
  h.anchos([42, 15, 15, 15, 15, 15, 15]);
  let f = membrete(h, ctx, 'Presupuesto consolidado por subpresupuestos', 7);
  const filaCab = f;
  const cols = ['CD', 'GG', 'UTIL', 'SUB', 'IGV', 'TOTAL'] as const;
  const campo = { CD: 'costoDirecto', GG: 'gg', UTIL: 'utilidad', SUB: 'subtotal', IGV: 'igv', TOTAL: 'total' } as const;
  h.cabecera(f++, ['Subpresupuesto', 'Costo directo', 'Gastos generales', 'Utilidad', 'Subtotal', 'IGV', 'Total']);
  const ini = f;
  r.subpresupuestos.forEach((s, k) => {
    h.v(f, 1, s.nombre, { borde: 'hair' });
    cols.forEach((c, i) => h.link(f, 2 + i, `=${refsPie[k][c]}`, s.pie[campo[c]], { fmt: F_MONEDA, borde: 'hair' }));
    f++;
  });
  h.v(f, 1, 'CONSOLIDADO', { negrita: true });
  cols.forEach((c, i) => {
    const col = String.fromCharCode(66 + i);
    h.fx(f, 2 + i, `=SUM(${col}${ini}:${col}${f - 1})`, r.pie[campo[c]], { fmt: F_MONEDA, negrita: true });
  });
  h.fila(f, 1, 7, { borde: 'arriba' });
  f++;
  h.v(f, 1, 'Control: diferencia con el pie del presupuesto', { cursiva: true });
  h.fx(f, 7, `=G${f - 1}-${ctx.refs.TOTAL}`, 0, { fmt: F_MONEDA, cursiva: true });
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, true);
}
