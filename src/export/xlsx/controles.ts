// Excel del expediente: flete, controles de consistencia y cumplimiento del TdR.
import { NOMBRE_DOC } from '../../engine/documentos';
import type { DocKey } from '../../engine/types';
import { redondear } from '../../engine/util';
import { AZUL, F_MONEDA, Valor, Hoja, Ctx, membrete, configurarImpresion } from './comun';

export function hojaFlete(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  h.anchos([12, 46, 7, 13, 12, 12, 14]);
  let f = membrete(h, ctx, 'Cálculo de flete terrestre', 7, [['Tarifa por tonelada', ctx.datos.flete, r.proyecto.meta.fleteTarifaTon]]);
  const filaCab = f;
  h.cabecera(f++, ['Código', 'Material', 'Und', 'Cantidad', 'Peso unit. (kg)', 'Toneladas', `Flete (${mon})`]);
  const ini = f;
  for (const it of r.flete.items) {
    const fi = ctx.insumoFila.get(it.insumo.codigo);
    h.v(f, 1, it.insumo.codigo, { borde: 'hair' });
    h.v(f, 2, it.insumo.descripcion, { borde: 'hair' });
    h.v(f, 3, it.insumo.unidad, { h: 'center', borde: 'hair' });
    h.link(f, 4, fi ? `='Insumos'!$I$${fi}` : '=0', it.cantidad, { fmt: '#,##0.00', borde: 'hair' });
    h.dato(f, 5, it.pesoKg, { fmt: '#,##0.00', borde: 'hair' });
    h.fx(f, 6, `=ROUND(D${f}*E${f}/1000,3)`, it.toneladas, { fmt: '#,##0.000', borde: 'hair' });
    h.fx(f, 7, `=ROUND(D${f}*E${f}/1000*TARIFA_FLETE,2)`, it.flete, { fmt: F_MONEDA, borde: 'hair' });
    f++;
  }
  h.v(f, 2, 'TOTAL', { negrita: true });
  h.fx(f, 6, `=SUM(F${ini}:F${Math.max(ini, f - 1)})`, r.flete.toneladas, { fmt: '#,##0.000', negrita: true });
  h.fx(f, 7, `=SUM(G${ini}:G${Math.max(ini, f - 1)})`, r.flete.total, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 7, { borde: 'arriba' });
  configurarImpresion(h, ctx, filaCab, false);
}

export function hojaControles(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  h.anchos([6, 64, 16, 16]);
  let f = membrete(h, ctx, 'Controles de consistencia', 4);
  h.cabecera(f++, ['N°', 'Control (se recalcula con el libro)', 'Valor', 'Estado']);
  const ppto = `'Presupuesto'!`;
  const [i0, i1] = (ctx.refs.PPTO_FILAS || '1:1').split(':').map(Number);
  const tipo = `${ppto}$G$${i0}:$G$${i1}`;
  const parcial = `${ppto}$F$${i0}:$F$${i1}`;
  const met = `${ppto}$D$${i0}:$D$${i1}`;
  const pu = `${ppto}$E$${i0}:$E$${i1}`;
  const ins = r.insumos.total;
  const controles: [string, string, Valor, string, boolean][] = [
    ['Suma de partidas = costo directo', `=SUMIF(${tipo},"P",${parcial})-${ctx.refs.CD}`, 0, `ABS(C{f})<0.005`, true],
    ['Partidas sin metrado', `=COUNTIFS(${tipo},"P",${met},0)`, r.hojas.filter((x) => x.metrado === 0).length, `C{f}=0`, r.hojas.every((x) => x.metrado > 0)],
    ['Partidas sin precio unitario', `=COUNTIFS(${tipo},"P",${pu},0)`, r.hojas.filter((x) => x.pu === 0).length, `C{f}=0`, r.hojas.every((x) => x.pu > 0)],
    ['Relación de insumos − costo directo (redondeo de APU)', `=${ctx.refs.INS_TOTAL}-${ctx.refs.CD}`, redondear(ins - r.pie.costoDirecto, 2), `ABS(C{f})<=MAX(1,${ctx.refs.CD}*0.001)`, Math.abs(ins - r.pie.costoDirecto) <= Math.max(1, r.pie.costoDirecto * 0.001)],
    ['Cronograma valorizado − costo directo', `=${ctx.refs.VAL_CD}-${ctx.refs.CD}`, 0, `ABS(C{f})<0.05`, true],
    ['Gastos generales del pie = desagregado', `=${ppto}$F$${ctx.refs.GG_FILA}-${ctx.refs.GG}`, 0, `ABS(C{f})<0.005`, true],
    ['Fórmula polinómica: suma de coeficientes', `=${ctx.refs.POL_SUMA}`, r.polinomica.suma, `ABS(C{f}-1)<0.0005`, Math.abs(r.polinomica.suma - 1) < 0.0005],
    ['Fórmula polinómica: coeficiente mínimo (≥ 0.050)', `=${ctx.refs.POL_MIN}`, Math.min(...r.polinomica.monomios.map((x) => x.coeficiente), 1), `C{f}>=0.05`, r.polinomica.monomios.every((x) => x.coeficiente >= 0.05)],
    ['Fórmula polinómica: número de monomios (≤ 8)', `=${ctx.refs.POL_N}`, r.polinomica.monomios.length, `C{f}<=8`, r.polinomica.monomios.length <= 8],
  ];
  controles.forEach(([n, fo, val, cond, ok], i) => {
    h.v(f, 1, i + 1, { h: 'center', borde: 'hair' });
    h.v(f, 2, n, { borde: 'hair' });
    h.fx(f, 3, fo, val, { fmt: typeof val === 'number' && !Number.isInteger(val) ? '#,##0.000' : '#,##0.00', borde: 'hair' });
    h.fx(f, 4, `=IF(${cond.replace(/\{f\}/g, String(f))},"Conforme","Revisar")`, ok ? 'Conforme' : 'Revisar', { h: 'center', negrita: true, borde: 'hair' });
    f++;
  });
  h.ws.addConditionalFormatting({
    ref: `D${f - controles.length}:D${f - 1}`,
    rules: [
      { type: 'containsText', operator: 'containsText', text: 'Revisar', priority: 1, style: { font: { color: { argb: 'FFC0392B' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF5E1DD' } } } },
      { type: 'containsText', operator: 'containsText', text: 'Conforme', priority: 2, style: { font: { color: { argb: 'FF17574C' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE1EEEA' } } } },
    ],
  });
  f += 2;
  h.v(f++, 1, 'Resultado de las 15 reglas de Expediente Pro al exportar', { negrita: true, color: AZUL });
  for (const v of r.validacion) {
    h.v(f, 1, v.regla, { h: 'center', borde: 'hair' });
    h.v(f, 2, v.control, { borde: 'hair' });
    h.v(f, 4, v.estado === 'ok' ? 'Conforme' : v.estado === 'error' ? 'Error' : 'Advertencia', { h: 'center', borde: 'hair' });
    f++;
  }
  configurarImpresion(h, ctx, 0, false);
  h.ws.pageSetup.printTitlesRow = undefined;
}

export function hojaCumplimiento(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  h.anchos([6, 50, 40, 12, 36]);
  let f = membrete(h, ctx, 'Matriz de cumplimiento del TdR', 5);
  h.cabecera(f++, ['N°', 'Entregable exigido', 'Documento del expediente', 'Estado', 'Observación']);
  r.proyecto.tdr.entregables.forEach((e, i) => {
    h.v(f, 1, i + 1, { h: 'center', borde: 'hair' });
    h.v(f, 2, e.descripcion, { borde: 'hair', ajustar: true });
    h.v(f, 3, e.documento ? NOMBRE_DOC[e.documento as DocKey] : '— sin asignar —', { borde: 'hair' });
    h.v(f, 4, !e.documento ? 'Pendiente' : e.documento === 'externo' ? 'Externo' : 'Generado', { h: 'center', borde: 'hair' });
    h.v(f, 5, e.observacion ?? '', { borde: 'hair', ajustar: true });
    f++;
  });
  configurarImpresion(h, ctx, 0, false);
}

// ------------------------------------------------------------ principal
