// Excel del expediente: gastos generales y fórmula polinómica.
import { num, redondear } from '../../engine/util';
import { AREAS_GEOGRAFICAS } from '../../data/iu';
import { AZUL, GRIS, GRIS2, F_MONEDA, F_PCT, Hoja, Ctx, membrete, configurarImpresion } from './comun';

export function hojaGG(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  h.anchos([10, 50, 8, 9, 10, 10, 13, 14, 14]);
  let f = membrete(h, ctx, 'Desagregado de gastos generales', 9, [['Plazo de ejecución (meses)', ctx.datos.plazoMeses, r.programa.plazoMeses]]);
  const calc = new Map(r.gg.items.map((i) => [i.id, i]));
  const totales: Record<string, string> = {};
  const secciones: { g: 'variable' | 'fijo' | 'financiero'; n: string; total: number }[] = [
    { g: 'variable', n: 'A. GASTOS GENERALES VARIABLES', total: r.gg.variables },
    { g: 'fijo', n: 'B. GASTOS GENERALES FIJOS', total: r.gg.fijos },
    { g: 'financiero', n: 'C. GASTOS FINANCIEROS', total: r.gg.financieros },
  ];
  let filaCab1 = 0;
  for (const s of secciones) {
    const items = r.proyecto.gg.filter((g) => (g.grupo ?? 'variable') === s.g);
    if (!items.length && s.g === 'financiero') continue;
    h.v(f++, 1, s.n, { negrita: true, color: AZUL });
    if (!filaCab1) filaCab1 = f;
    h.cabecera(f++, ['Ítem', 'Descripción', 'Und.', 'Inc. (%)', 'Cantidad', s.g === 'variable' ? 'Meses' : 'Veces', `PU (${mon})`, `Parcial (${mon})`, `Total (${mon})`]);
    const rubros = [...new Set(items.map((g) => g.rubro || 'Varios'))];
    const filasRubro: number[] = [];
    rubros.forEach((rb, ir) => {
      const fR = f++;
      filasRubro.push(fR);
      h.v(fR, 1, String(ir + 1).padStart(2, '0'), { negrita: true });
      h.v(fR, 2, rb.toUpperCase(), { negrita: true });
      h.fila(fR, 1, 9, { fondo: GRIS2 });
      const ini = f;
      items.filter((g) => (g.rubro || 'Varios') === rb).forEach((g, ii) => {
        const c = calc.get(g.id)!;
        const pctCD = (g.unidad || '').toLowerCase() === '%cd';
        h.v(f, 1, `${String(ir + 1).padStart(2, '0')}.${String(ii + 1).padStart(2, '0')}`, { borde: 'hair' });
        h.v(f, 2, g.descripcion, { borde: 'hair', ajustar: true });
        h.v(f, 3, pctCD ? '%CD' : g.unidad, { h: 'center', borde: 'hair' });
        h.dato(f, 4, num(g.participacion, 100) / 100, { fmt: '0.00%', borde: 'hair' });
        if (pctCD) {
          h.dato(f, 5, num(g.cantidad) / 100, { fmt: '0.0000%', borde: 'hair' });
          h.v(f, 6, 1, { fmt: '0.00', borde: 'hair' });
          h.link(f, 7, `=${ctx.refs.CD}`, r.pie.costoDirecto, { fmt: F_MONEDA, borde: 'hair' });
        } else {
          h.dato(f, 5, num(g.cantidad), { fmt: '#,##0.00', borde: 'hair' });
          if (g.grupo === 'variable' && g.ligadoAlPlazo) h.link(f, 6, '=PLAZO_MESES', c.duracionUsada, { fmt: '0.00', borde: 'hair' });
          else h.dato(f, 6, num(g.duracion, 1), { fmt: '0.00', borde: 'hair' });
          h.dato(f, 7, num(g.precio), { fmt: F_MONEDA, borde: 'hair' });
        }
        h.fx(f, 8, `=ROUND(D${f}*E${f}*F${f}*G${f},2)`, c.total, { fmt: F_MONEDA, borde: 'hair' });
        f++;
      });
      const tot = items.filter((g) => (g.rubro || 'Varios') === rb).reduce((a, g) => a + (calc.get(g.id)?.total ?? 0), 0);
      h.fx(fR, 9, f > ini ? `=SUM(H${ini}:H${f - 1})` : '=0', redondear(tot, 2), { fmt: F_MONEDA, negrita: true, fondo: GRIS2 });
    });
    h.v(f, 2, `TOTAL ${s.n.slice(3)}`, { negrita: true, h: 'right' });
    h.fx(f, 9, filasRubro.length ? `=${filasRubro.map((x) => `I${x}`).join('+')}` : '=0', s.total, { fmt: F_MONEDA, negrita: true });
    h.fila(f, 1, 9, { borde: 'arriba' });
    totales[s.g] = `I${f}`;
    f++;
    h.v(f, 2, `Porcentaje del costo directo`, { cursiva: true, h: 'right', tam: 7.5 });
    h.fx(f, 9, `=IF(${ctx.refs.CD}>0,I${f - 1}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? s.total / r.pie.costoDirecto : 0, { fmt: F_PCT, cursiva: true, tam: 7.5 });
    f += 2;
  }
  // resumen
  h.v(f++, 1, 'RESUMEN DE GASTOS GENERALES', { negrita: true, color: AZUL });
  h.cabecera(f++, ['', 'Concepto', '', '', '', '', '', `Monto (${mon})`, '% del CD']);
  const ini = f;
  for (const s of secciones) {
    if (!totales[s.g]) continue;
    h.v(f, 2, s.n.slice(3), { borde: 'hair' });
    h.fx(f, 8, `=${totales[s.g]}`, s.total, { fmt: F_MONEDA, borde: 'hair' });
    h.fx(f, 9, `=IF(${ctx.refs.CD}>0,H${f}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? s.total / r.pie.costoDirecto : 0, { fmt: F_PCT, borde: 'hair' });
    f++;
  }
  h.v(f, 2, 'TOTAL GASTOS GENERALES', { negrita: true });
  h.fx(f, 8, `=SUM(H${ini}:H${f - 1})`, r.gg.total, { fmt: F_MONEDA, negrita: true, fondo: GRIS });
  h.fx(f, 9, `=IF(${ctx.refs.CD}>0,H${f}/${ctx.refs.CD},0)`, r.pie.costoDirecto ? r.gg.total / r.pie.costoDirecto : 0, { fmt: F_PCT, negrita: true });
  h.fila(f, 1, 9, { borde: 'arriba' });
  ctx.refs.GG = h.ref(f, 8);
  if (filaCab1) h.ws.views = [{ state: 'frozen', ySplit: 0 }];
  configurarImpresion(h, ctx, 0, false);
  h.ws.pageSetup.printTitlesRow = undefined;
}

// ------------------------------------------------------------ Fórmula polinómica

export function hojaPolinomica(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const pol = r.polinomica;
  const mon = r.proyecto.meta.moneda;
  h.anchos([10, 54, 16, 13, 40]);
  let f = membrete(h, ctx, 'Fórmula polinómica', 5, [['Área geográfica', ctx.datos.area, `${r.proyecto.meta.areaGeografica} – ${AREAS_GEOGRAFICAS[r.proyecto.meta.areaGeografica] ?? ''}`]]);
  // base
  const fBase = f;
  h.v(f, 2, 'Base de cálculo: costo directo + gastos generales + utilidad', { negrita: true });
  h.fx(f, 3, `=${ctx.refs.CD}+${ctx.refs.GG}+${ctx.refs.UTIL}`, pol.base, { fmt: F_MONEDA, negrita: true });
  f++;
  const fFactor = f;
  h.v(f, 2, 'Factor de ajuste de insumos al costo directo (CD / total de insumos)', { cursiva: true, tam: 7.5 });
  h.fx(f, 3, `=IF(${ctx.refs.INS_TOTAL}>0,${ctx.refs.CD}/${ctx.refs.INS_TOTAL},0)`, r.insumos.total ? r.pie.costoDirecto / r.insumos.total : 0, { fmt: '0.000000', cursiva: true, tam: 7.5 });
  f += 2;
  h.v(f++, 1, 'INCIDENCIA DE CADA ÍNDICE UNIFICADO', { negrita: true, color: AZUL });
  h.cabecera(f++, ['IU', 'Descripción', `Monto (${mon})`, 'Incidencia', '']);
  const filaIU = new Map<string, number>();
  const insIU = `'Insumos'!$E$1:$E$20000`;
  const insParc = `'Insumos'!$J$1:$J$20000`;
  for (const inc of pol.incidencias) {
    h.v(f, 1, inc.iu, { h: 'center', borde: 'hair' });
    h.v(f, 2, inc.nombre, { borde: 'hair' });
    h.fx(f, 3, `=ROUND(SUMIF(${insIU},"${inc.iu}",${insParc})*$C$${fFactor},2)`, inc.monto, { fmt: F_MONEDA, borde: 'hair' });
    h.fx(f, 4, `=IF($C$${fBase}>0,C${f}/$C$${fBase},0)`, inc.incidencia, { fmt: '0.0000', borde: 'hair' });
    filaIU.set(inc.iu, f);
    f++;
  }
  const fGU = f;
  h.v(f, 1, '39', { h: 'center', borde: 'hair' });
  h.v(f, 2, 'Gastos generales y utilidad', { borde: 'hair' });
  h.fx(f, 3, `=${ctx.refs.GG}+${ctx.refs.UTIL}`, r.pie.gg + r.pie.utilidad, { fmt: F_MONEDA, borde: 'hair' });
  h.fx(f, 4, `=IF($C$${fBase}>0,C${f}/$C$${fBase},0)`, pol.base ? (r.pie.gg + r.pie.utilidad) / pol.base : 0, { fmt: '0.0000', borde: 'hair' });
  f += 2;
  h.v(f++, 1, 'MONOMIOS (D.S. 011-79-VC: máximo 8, coeficiente mínimo 0.050, hasta 3 índices por monomio)', { negrita: true, color: AZUL });
  h.cabecera(f++, ['Símbolo', 'Índices agrupados', 'Coeficiente', 'Verificación', 'Índices representativos (peso)']);
  const ini = f;
  const filasCoef: number[] = [];
  pol.monomios.forEach((m, i) => {
    const miembros = m.miembros.map((x) => x.iu);
    const sumas = miembros.filter((iu) => iu !== '39').map((iu) => (filaIU.has(iu) ? `D${filaIU.get(iu)}` : '0'));
    if (miembros.includes('39')) {
      sumas.push(`D${fGU}`);
      if (filaIU.has('39')) sumas.push(`D${filaIU.get('39')}`);
    }
    h.v(f, 1, m.simbolo, { negrita: true, h: 'center', borde: 'hair' });
    h.v(f, 2, miembros.map((iu) => `${iu}`).join(', '), { borde: 'hair' });
    filasCoef.push(f);
    // F (oculta) = coeficiente sin redondear; C = redondeado al milésimo y el resto se asigna al mayor
    h.fx(f, 6, `=${sumas.join('+') || 0}`, m.coeficiente, { fmt: '0.000000' });
    h.fx(f, 4, `=IF(C${f}>=0.05,"Conforme","Menor a 0.050")`, m.coeficiente >= 0.05 ? 'Conforme' : 'Menor a 0.050', { borde: 'hair', h: 'center' });
    h.v(f, 5, m.indices.map((x) => `${x.iu} ${x.nombre} (${x.peso.toFixed(3)})`).join('; '), { borde: 'hair', ajustar: true, tam: 7.5 });
    f++;
  });
  if (filasCoef.length) {
    const fA = filasCoef[0], fZ = filasCoef[filasCoef.length - 1];
    const crudo = `$F$${fA}:$F$${fZ}`;
    filasCoef.forEach((fc, k) =>
      h.fx(fc, 3, `=ROUND(F${fc},3)+IF(MATCH(MAX(${crudo}),${crudo},0)=${k + 1},1-SUMPRODUCT(ROUND(${crudo},3)),0)`, pol.monomios[k].coeficiente, { fmt: '0.000', borde: 'hair' }),
    );
    // G (oculta) = clave de orden: coeficiente con desempate por posición, para escribir la fórmula de mayor a menor
    filasCoef.forEach((fc, k) => h.fx(fc, 7, `=C${fc}-${k + 1}/10000000`, pol.monomios[k].coeficiente - (k + 1) / 1e7, { fmt: '0.000000' }));
    h.ws.getColumn(6).hidden = true;
    h.ws.getColumn(7).hidden = true;
  }
  h.v(f, 2, 'Suma de coeficientes', { negrita: true, h: 'right' });
  h.fx(f, 3, `=SUM(C${ini}:C${f - 1})`, pol.suma, { fmt: '0.000', negrita: true });
  h.fila(f, 1, 5, { borde: 'arriba' });
  ctx.refs.POL_SUMA = h.ref(f, 3);
  ctx.refs.POL_MIN = `MIN('${h.nombre}'!$C$${ini}:$C$${f - 1})`;
  ctx.refs.POL_N = `COUNT('${h.nombre}'!$C$${ini}:$C$${f - 1})`;
  f += 2;
  h.v(f, 1, 'Fórmula', { negrita: true });
  const orden = filasCoef.length ? `$G$${filasCoef[0]}:$G$${filasCoef[filasCoef.length - 1]}` : '';
  const enPos = (k: number, col: string) => `INDEX($${col}$${filasCoef[0]}:$${col}$${filasCoef[filasCoef.length - 1]},MATCH(LARGE(${orden},${k}),${orden},0))`;
  const partes = pol.monomios.map((_, k) => `FIXED(${enPos(k + 1, 'C')},3)&" ("&${enPos(k + 1, 'A')}&"r/"&${enPos(k + 1, 'A')}&"o)"`);
  h.ws.mergeCells(f, 2, f, 5);
  h.fx(f, 2, `="K = "&${partes.join('&" + "&') || '""'}`, pol.formula, { negrita: true, tam: 10, color: AZUL });
  configurarImpresion(h, ctx, 0, false);
  h.ws.pageSetup.printTitlesRow = undefined;
}

// ------------------------------------------------------------ Programa y Gantt
