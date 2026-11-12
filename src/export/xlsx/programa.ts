// Excel del expediente: cronograma, distribución por periodos, valorizado, calendarios y desembolsos.
import type { Resultados } from '../../engine/types';
import { fechaCorta, isoAFecha, num, sumarDias } from '../../engine/util';
import { AZUL, GRIS, GRIS2, BORDE_HAIR, F_MONEDA, F_CANT, F_MET, F_PCT, F_FECHA, Estilo, COL, Hoja, Ctx, NDL, WDL, DIAS, CRON, serieCuadrada, cron, diasEnVentana, finMembrete, membrete, configurarImpresion } from './comun';
import { filaUltimoDescendiente } from './costos';

export function hojaPrograma(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const prog = r.programa;
  const acts = new Map(prog.actividades.map((a) => [a.partidaId, a]));
  const cod = new Map(r.proyecto.partidas.map((x) => [x.id, x.codigo]));
  const diario = prog.plazoDias <= 120;
  const paso = diario ? 1 : 7;
  // margen de 25 % para que el Gantt siga mostrando las barras si el plazo crece al editar el libro
  const nCols = Math.max(1, Math.ceil((Math.max(1, prog.plazoDias) * 1.25) / paso));
  const C0 = 14; // primera columna del Gantt
  // con un ciclo en las precedencias el cálculo en fórmulas sería circular: se dejan las fechas del motor
  const estatico = prog.errores.some((e) => /ciclo/i.test(e));
  h.anchos([12, 42, 6, 11, 10, 8, 9, 8, 11, 11, 7, 7, 18]);
  for (let i = 0; i < nCols; i++) h.ws.getColumn(C0 + i).width = diario ? 3.2 : 4.2;
  let f = membrete(h, ctx, 'Cronograma de ejecución de obra', 13, [['Plazo (días calendario)', ctx.datos.plazoDias, prog.plazoDias]]);
  const filaFechas = f;
  for (let i = 0; i < nCols; i++) {
    const d = isoAFecha(sumarDias(prog.inicio, i * paso));
    if (estatico) h.v(filaFechas, C0 + i, d, { fmt: diario ? 'dd' : 'dd/mm', tam: 6.5, h: 'center', fondo: GRIS });
    else h.fx(filaFechas, C0 + i, `=FECHA_INICIO+${i * paso}`, d, { fmt: diario ? 'dd' : 'dd/mm', tam: 6.5, h: 'center', fondo: GRIS });
  }
  h.ws.getRow(filaFechas).height = 14;
  f++;
  const filaCab = f;
  h.cabecera(f++, ['Ítem', 'Actividad', 'Und', 'Metrado', 'Rend./día', 'Cuadrillas', 'Duración fija', 'Duración (d)', 'Inicio', 'Fin', 'Holgura', 'Crítica', 'Predecesoras']);
  for (let i = 0; i < nCols; i++) {
    const e = { tam: 6, h: 'center' as const, fondo: AZUL, color: 'FFFFFFFF' };
    if (diario && !estatico) h.fx(filaCab, C0 + i, `=DAY(${COL(C0 + i)}${filaFechas})`, isoAFecha(sumarDias(prog.inicio, i)).getUTCDate(), e);
    else h.v(filaCab, C0 + i, diario ? isoAFecha(sumarDias(prog.inicio, i)).getUTCDate() : `S${i + 1}`, e);
  }
  // columnas auxiliares (ocultas) del cálculo de ruta crítica, en días laborables desde el inicio
  const cES = C0 + nCols, cEF = cES + 1, cLS = cES + 2, cLF = cES + 3;
  const [ES, EF, LS, LF] = [cES, cEF, cLS, cLF].map(COL);
  ['Inicio temprano (día lab.)', 'Fin temprano', 'Inicio tardío', 'Fin tardío'].forEach((t, i) => {
    h.v(filaCab, cES + i, t, { tam: 6 });
    h.ws.getColumn(cES + i).hidden = true;
  });
  const ini = f;
  const filaDe = new Map<string, number>();
  r.filas.forEach((fp) => filaDe.set(fp.partida.id, f++));
  const fin = f - 1;
  const FIN = `$${EF}$${fin + 1}`;
  const esPartida = new Set(r.hojas.map((x) => x.partida.id));
  // predecesoras y sucesoras entre partidas (no títulos)
  const preds = new Map<string, { id: string; tipo: string; lag: number }[]>();
  const sucs = new Map<string, { id: string; tipo: string; lag: number }[]>();
  for (const fp of r.hojas) {
    const lista = (r.proyecto.programa[fp.partida.id]?.predecesoras ?? []).filter((x) => esPartida.has(x.id) && x.id !== fp.partida.id).map((x) => ({ id: x.id, tipo: x.tipo, lag: num(x.desfase) }));
    preds.set(fp.partida.id, lista);
    for (const x of lista) (sucs.get(x.id) ?? sucs.set(x.id, []).get(x.id)!).push({ id: fp.partida.id, tipo: x.tipo, lag: x.lag });
  }
  const mas = (n: number) => (n ? (n > 0 ? `+${n}` : `${n}`) : '');
  r.filas.forEach((fp, idx) => {
    const fi = filaDe.get(fp.partida.id)!;
    const pt = fp.partida;
    h.v(fi, 1, pt.codigo, { negrita: fp.esTitulo, borde: 'hair' });
    h.v(fi, 2, pt.descripcion, { negrita: fp.esTitulo, sangria: Math.min(4, fp.nivel - 1), borde: 'hair' });
    const a = acts.get(pt.id);
    if (fp.esTitulo) {
      const ult = filaDe.get(r.filas[filaUltimoDescendiente(r, idx)].partida.id)!;
      if (ult > fi) {
        const desc = r.filas.slice(idx + 1, filaUltimoDescendiente(r, idx) + 1).map((x) => acts.get(x.partida.id)).filter(Boolean);
        const iniT = desc.length ? desc.reduce((m, x) => (x!.inicio < m ? x!.inicio : m), desc[0]!.inicio) : '';
        const finT = desc.length ? desc.reduce((m, x) => (x!.fin > m ? x!.fin : m), desc[0]!.fin) : '';
        h.fx(fi, 9, `=IF(COUNT(I${fi + 1}:I${ult})=0,"",MIN(I${fi + 1}:I${ult}))`, iniT ? isoAFecha(iniT) : '', { fmt: F_FECHA, negrita: true, borde: 'hair' });
        h.fx(fi, 10, `=IF(COUNT(J${fi + 1}:J${ult})=0,"",MAX(J${fi + 1}:J${ult}))`, finT ? isoAFecha(finT) : '', { fmt: F_FECHA, negrita: true, borde: 'hair' });
      }
      h.v(fi, 12, 'T', { tam: 6, color: 'FFB0B8BF', h: 'center' });
      h.fila(fi, 1, 13, { fondo: fp.nivel === 1 ? GRIS : GRIS2 });
      return;
    }
    const cfg = r.proyecto.programa[pt.id] ?? { predecesoras: [] };
    h.v(fi, 3, pt.unidad, { h: 'center', borde: 'hair' });
    const pp = ctx.ppto.get(pt.id);
    h.link(fi, 4, pp ? `=${pp.met}` : '=0', fp.metrado, { fmt: F_MET, borde: 'hair' });
    h.link(fi, 5, ctx.apuRend.has(pt.id) ? `=${ctx.apuRend.get(pt.id)}` : '=0', r.apus[pt.id]?.rendimiento ?? 0, { fmt: '#,##0.00', borde: 'hair' });
    h.dato(fi, 6, num(cfg.cuadrillas, 1), { fmt: '0', borde: 'hair' });
    h.dato(fi, 7, cfg.duracionManual ? num(cfg.duracionManual) : null, { fmt: '0', borde: 'hair' });
    h.fx(fi, 8, `=IF(D${fi}=0,0,IF(G${fi}>0,ROUNDUP(G${fi},0),IF(E${fi}*MAX(1,F${fi})>0,MAX(1,ROUNDUP(D${fi}/(E${fi}*MAX(1,F${fi}))-1E-9,0)),1)))`, a ? a.duracion : 0, { fmt: '0', borde: 'hair' });
    h.v(fi, 13, (cfg.predecesoras ?? []).filter((x) => esPartida.has(x.id)).map((x) => `${cod.get(x.id) ?? '?'}${x.tipo}${x.desfase ? (x.desfase > 0 ? '+' : '') + x.desfase : ''}`).join('; '), { borde: 'hair', tam: 7 });
    if (estatico) {
      if (a) {
        h.dato(fi, 9, isoAFecha(a.inicio), { fmt: F_FECHA, borde: 'hair' });
        h.dato(fi, 10, isoAFecha(a.fin), { fmt: F_FECHA, borde: 'hair' });
        h.v(fi, 11, a.holgura, { fmt: '0', borde: 'hair', h: 'center' });
        h.v(fi, 12, a.critica ? 'Sí' : 'No', { borde: 'hair', h: 'center' });
      } else h.v(fi, 12, '', { borde: 'hair' });
      return;
    }
    // pasada hacia adelante: inicio temprano según el tipo de relación (FC, CC, FF) y el desfase
    const tES = (preds.get(pt.id) ?? []).map((x) => {
      const rb = filaDe.get(x.id)!;
      const e = x.tipo === 'CC' ? `${ES}${rb}${mas(x.lag)}` : x.tipo === 'FF' ? `${EF}${rb}${mas(x.lag)}-H${fi}` : `${EF}${rb}${mas(x.lag)}`;
      return `IF(H${rb}=0,0,${e})`;
    });
    const finLab = prog.diasLaborables;
    h.fx(fi, cES, tES.length ? `=IF(H${fi}=0,0,MAX(0,${tES.join(',')}))` : '=0', a?.es ?? 0, { fmt: '0' });
    h.fx(fi, cEF, `=${ES}${fi}+H${fi}`, a?.ef ?? 0, { fmt: '0' });
    // pasada hacia atrás desde las sucesoras
    const tLF = (sucs.get(pt.id) ?? []).map((x) => {
      const rs = filaDe.get(x.id)!;
      const e = x.tipo === 'CC' ? `${LS}${rs}${mas(-x.lag)}+H${fi}` : x.tipo === 'FF' ? `${LF}${rs}${mas(-x.lag)}` : `${LS}${rs}${mas(-x.lag)}`;
      return `IF(H${rs}=0,${FIN},${e})`;
    });
    h.fx(fi, cLF, tLF.length ? `=MIN(${FIN},${tLF.join(',')})` : `=${FIN}`, a?.lf ?? finLab, { fmt: '0' });
    h.fx(fi, cLS, `=${LF}${fi}-H${fi}`, a?.ls ?? finLab, { fmt: '0' });
    h.fx(fi, 9, `=IF(H${fi}=0,"",${WDL(`${ES}${fi}+1`)})`, a ? isoAFecha(a.inicio) : '', { fmt: F_FECHA, borde: 'hair' });
    h.fx(fi, 10, `=IF(H${fi}=0,"",${WDL(`${EF}${fi}`)})`, a ? isoAFecha(a.fin) : '', { fmt: F_FECHA, borde: 'hair' });
    h.fx(fi, 11, `=IF(H${fi}=0,"",${LS}${fi}-${ES}${fi})`, a ? a.holgura : '', { fmt: '0', borde: 'hair', h: 'center' });
    h.fx(fi, 12, `=IF(H${fi}=0,"",IF(K${fi}<=0,"Sí","No"))`, a ? (a.critica ? 'Sí' : 'No') : '', { borde: 'hair', h: 'center' });
  });
  ctx.prog = { fila: filaDe, finLab: `'${CRON}'!${FIN}` };
  if (!estatico) {
    h.fx(fin + 1, cEF, `=MAX(${EF}${ini}:${EF}${fin})`, prog.diasLaborables, { fmt: '0' });
    // el plazo del libro sale de aquí: Datos › PLAZO_DIAS → PLAZO_MESES → gastos generales variables
    if (ctx.hDatos && ctx.filaPlazo)
      ctx.hDatos.fx(ctx.filaPlazo, 2, `=IF(${ctx.prog.finLab}=0,0,${WDL(ctx.prog.finLab)}-FECHA_INICIO+1)`, prog.plazoDias, { fmt: '0', borde: 'hair', h: 'left' });
  }
  // Gantt con formato condicional: las barras siguen a las fechas de inicio y fin
  const c1 = COL(C0);
  const c2 = COL(C0 + nCols - 1);
  const ref = `${c1}${ini}:${c2}${fin}`;
  const cond = diario ? `AND(${c1}$${filaFechas}>=$I${ini},${c1}$${filaFechas}<=$J${ini})` : `AND(${c1}$${filaFechas}<=$J${ini},${c1}$${filaFechas}+6>=$I${ini})`;
  h.ws.addConditionalFormatting({
    ref,
    rules: [
      { type: 'expression', priority: 1, formulae: [`AND(ISNUMBER($I${ini}),$L${ini}="T",${cond})`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF5B6B7C' } } } },
      { type: 'expression', priority: 2, formulae: [`AND(ISNUMBER($I${ini}),$L${ini}="Sí",${cond})`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC0392B' } } } },
      { type: 'expression', priority: 3, formulae: [`AND(ISNUMBER($I${ini}),${cond})`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF2E6DA4' } } } },
    ],
  });
  for (let fi = ini; fi <= fin; fi++) for (let i = 0; i < nCols; i++) h.celda(fi, C0 + i).border = { left: BORDE_HAIR, bottom: BORDE_HAIR };
  f = fin + 2;
  h.v(f, 2, `Barras: azul = actividad, rojo = ruta crítica, gris = título. Columnas ${diario ? 'diarias' : 'semanales'} desde la fecha de inicio, con un margen de 25 % sobre el plazo.`, { cursiva: true, tam: 7.5 });
  h.ws.views = [{ state: 'frozen', ySplit: filaCab, xSplit: 2 }];
  configurarImpresion(h, ctx, filaCab, true);
}

// ------------------------------------------------------------ Distribución, valorizado y calendarios

export interface Bloque {
  titulo: string;
  filas: { clave: string; codigo: string; descripcion: string; unidad: string; fracciones: number[] }[];
  periodos: string[];
  /** Fórmula de la fracción del periodo i (si falta, la fracción es un dato fijo). */
  formula?: (f: number, i: number, clave: string) => string;
}

/** Ubica la tabla de periodos en la hoja Distribución % (se usa antes de escribir esa hoja). */
export function planPeriodos(ctx: Ctx) {
  const P = ctx.r.programa.periodos.length;
  const fila = finMembrete(ctx) + 2;
  const c = (i: number, k: number) => `'Distribución %'!$${COL(4 + i)}$${fila + k}`;
  const idx = [...Array(P).keys()];
  ctx.per = { fila, ini: idx.map((i) => c(i, 2)), fin: idx.map((i) => c(i, 3)), finCalc: idx.map((i) => (i === P - 1 ? 'DATE(2200,12,31)' : c(i, 3))) };
}

/** Columnas auxiliares del APU: cantidad de cada recurso en cada periodo (J = previo, K… = periodos). */
export function apuPeriodos(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const per = ctx.per!;
  const P = per.ini.length;
  const pers = r.programa.periodos;
  const acts = new Map(r.programa.actividades.map((a) => [a.partidaId, a]));
  const def = r.proyecto.meta.plazoCompraDefecto;
  const plazo = new Map(r.proyecto.insumos.map((i) => [i.codigo, num(i.plazoCompraDias ?? def, def)]));
  h.ws.getCell(5, 10).value = 'Aux: cantidad por periodo (previo, periodo 1, 2 …) según el cronograma';
  for (let c = 10; c <= 10 + P; c++) h.ws.getColumn(c).hidden = true;
  for (const x of ctx.apuFilas) {
    const rp = ctx.prog?.fila.get(x.partidaId);
    if (!rp) continue;
    const H = cron('H', rp), I = cron('I', rp), J = cron('J', rp);
    const a = acts.get(x.partidaId);
    const mat = x.tipo === 'MAT';
    const fi = ctx.insumoFila.get(x.codigo);
    const ant = mat && fi ? `'Insumos'!$K$${fi}` : '0';
    const antV = mat ? plazo.get(x.codigo) ?? def : 0;
    const sh = (ref: string) => (mat ? `${ref}+${ant}` : ref);
    const q = (dias: number) => (a && a.duracion ? (x.total * dias) / a.duracion : 0);
    h.fx(x.fila, 10, `=IF(${H}=0,0,$H${x.fila}*${DIAS(I, J, '1', `FECHA_INICIO+${ant}-1`)}/${H})`, q(diasEnVentana(r, a, antV, null, pers[0] ? sumarDias(pers[0].inicio, -1) : null)), { fmt: F_CANT });
    for (let i = 0; i < P; i++)
      h.fx(x.fila, 11 + i, `=IF(${H}=0,0,$H${x.fila}*${DIAS(I, J, sh(per.ini[i]), sh(per.finCalc[i]))}/${H})`, q(diasEnVentana(r, a, antV, pers[i].inicio, i === P - 1 ? null : pers[i].fin)), { fmt: F_CANT });
  }
}

/** Anticipación de compra de cada material (columna K oculta de Insumos), usada por el calendario de adquisiciones. */
export function insumosAnticipacion(ctx: Ctx, h: Hoja) {
  const { r } = ctx;
  const def = r.proyecto.meta.plazoCompraDefecto;
  h.ws.getCell(5, 11).value = 'Aux: anticipación de compra (días)';
  h.ws.getColumn(11).hidden = true;
  for (const [codigo, fi] of ctx.insumoFila) {
    const ins = r.proyecto.insumos.find((i) => i.codigo === codigo);
    if (ins?.tipo === 'MAT') h.dato(fi, 11, num(ins.plazoCompraDias ?? def, def), { fmt: '0' });
  }
}

export function hojaDistribucion(ctx: Ctx, h: Hoja, bloques: Bloque[]): Map<string, Map<string, number>> {
  // devuelve, por bloque, la fila de cada clave
  const out = new Map<string, Map<string, number>>();
  const maxP = Math.max(1, ...bloques.map((b) => b.periodos.length));
  h.anchos([12, 46, 7, ...new Array(maxP).fill(10), 10]);
  let f = membrete(h, ctx, 'Distribución programada por periodo (%)', 3 + maxP);
  h.ws.mergeCells(f, 1, f, 3 + maxP);
  h.v(f++, 1, 'Porcentaje de cada partida o insumo que se ejecuta o compra en cada periodo. Se calcula con fórmulas desde las fechas del cronograma (días laborables de cada actividad dentro del periodo); cada fila suma 100 %.', { cursiva: true, tam: 7.5, ajustar: true });
  f++;
  const per = ctx.per;
  if (per && f === per.fila) {
    const pers = ctx.r.programa.periodos;
    const porMes = ctx.r.proyecto.meta.periodo === 'mes';
    h.v(f++, 1, 'PERIODOS DE LOS CRONOGRAMAS', { negrita: true, color: AZUL });
    h.cabecera(f++, ['N.º', 'Periodo', '', ...pers.map((x) => x.etiqueta)]);
    h.v(f, 2, 'Inicio', { borde: 'hair' });
    h.v(f + 1, 2, 'Fin', { borde: 'hair' });
    h.v(f + 2, 2, 'Días laborables', { borde: 'hair' });
    pers.forEach((x, i) => {
      const c = COL(4 + i);
      h.fx(f, 4 + i, porMes ? (i === 0 ? '=FECHA_INICIO' : `=EOMONTH(FECHA_INICIO,${i - 1})+1`) : `=FECHA_INICIO+${30 * i}`, isoAFecha(x.inicio), { fmt: F_FECHA, borde: 'hair' });
      h.fx(f + 1, 4 + i, porMes ? `=EOMONTH(FECHA_INICIO,${i})` : `=${c}${f}+29`, isoAFecha(x.fin), { fmt: F_FECHA, borde: 'hair' });
      h.fx(f + 2, 4 + i, `=${NDL(`${c}${f}`, `${c}${f + 1}`)}`, x.diasLaborables, { fmt: '0', borde: 'hair' });
    });
    f += 4;
  }
  for (const b of bloques) {
    const mapa = new Map<string, number>();
    h.v(f++, 1, b.titulo.toUpperCase(), { negrita: true, color: AZUL });
    h.cabecera(f++, ['Código', 'Descripción', 'Und', ...b.periodos, 'Suma']);
    for (const x of b.filas) {
      h.v(f, 1, x.codigo, { borde: 'hair' });
      h.v(f, 2, x.descripcion, { borde: 'hair' });
      h.v(f, 3, x.unidad, { h: 'center', borde: 'hair' });
      x.fracciones.forEach((v, i) => (b.formula ? h.fx(f, 4 + i, b.formula(f, i, x.clave), v, { fmt: '0.00%', borde: 'hair' }) : h.dato(f, 4 + i, v, { fmt: '0.00%', borde: 'hair' })));
      const cU = COL(3 + b.periodos.length);
      h.fx(f, 4 + b.periodos.length, `=SUM(D${f}:${cU}${f})`, x.fracciones.reduce((a, c) => a + c, 0), { fmt: '0.00%', borde: 'hair' });
      mapa.set(x.clave, f);
      f++;
    }
    out.set(b.titulo, mapa);
    f += 2;
  }
  configurarImpresion(h, ctx, 0, true);
  h.ws.pageSetup.printTitlesRow = undefined;
  return out;
}

/** Filas del valorizado: todas las partidas (las de metrado cero quedan en cero hasta que se llene el metrado). */
export function filasValorizado(r: Resultados) {
  const P = r.programa.periodos.length;
  const val = new Map(r.valorizado.filas.map((x) => [x.clave, x]));
  return r.hojas.map((fp) => val.get(fp.partida.id) ?? { clave: fp.partida.id, codigo: fp.partida.codigo, descripcion: fp.partida.descripcion, unidad: fp.partida.unidad, total: fp.parcial, valores: new Array(P).fill(0) });
}

export function hojaValorizado(ctx: Ctx, h: Hoja, filasDist: Map<string, number>) {
  const { r } = ctx;
  const per = r.programa.periodos;
  const P = per.length;
  const mon = r.proyecto.meta.moneda;
  h.anchos([12, 44, 14, ...new Array(P).fill(13)]);
  let f = membrete(h, ctx, 'Cronograma valorizado de avance de obra', 3 + P);
  const filaCab = f;
  h.cabecera(f++, ['Ítem', 'Descripción', `Parcial (${mon})`, ...per.map((x) => `${x.etiqueta}\n${fechaCorta(x.inicio).slice(0, 5)}–${fechaCorta(x.fin).slice(0, 5)}`)]);
  if (ctx.per)
    per.forEach((x, i) => {
      h.celda(filaCab, 4 + i).value = { formula: `"${x.etiqueta}"&CHAR(10)&TEXT(${ctx.per!.ini[i]},"dd/mm")&"–"&TEXT(${ctx.per!.fin[i]},"dd/mm")`, result: `${x.etiqueta}\n${fechaCorta(x.inicio).slice(0, 5)}–${fechaCorta(x.fin).slice(0, 5)}` };
    });
  const ini = f;
  for (const fila of filasValorizado(r)) {
    const pp = ctx.ppto.get(fila.clave);
    const fd = filasDist.get(fila.clave);
    h.v(f, 1, fila.codigo, { borde: 'hair' });
    h.v(f, 2, fila.descripcion, { borde: 'hair' });
    h.link(f, 3, pp ? `=${pp.parcial}` : '=0', fila.total, { fmt: F_MONEDA, borde: 'hair' });
    const cols = per.map((_, i) => COL(4 + i));
    fila.valores.forEach((v, i) => {
      h.fx(f, 4 + i, fd ? `=${serieCuadrada((c) => `$C${f}*'Distribución %'!${c}${fd}`, `$C${f}`, cols, i)}` : '=0', v, { fmt: F_MONEDA, borde: 'hair' });
    });
    f++;
  }
  const fin = f - 1;
  const v = r.valorizado;
  const filaTot = (n: string, vals: number[], formula: (c: string, i: number) => string, total: string, totalVal: number, e: Estilo = {}) => {
    h.v(f, 2, n, { negrita: e.negrita, h: 'right' });
    h.fx(f, 3, total, totalVal, { fmt: e.fmt ?? F_MONEDA, negrita: e.negrita });
    vals.forEach((x, i) => h.fx(f, 4 + i, formula(COL(4 + i), i), x, { fmt: e.fmt ?? F_MONEDA, negrita: e.negrita }));
    if (e.borde) h.fila(f, 1, 3 + P, { borde: e.borde });
    return f++;
  };
  const fCD = filaTot('COSTO DIRECTO', v.cd, (c) => `=SUM(${c}${ini}:${c}${fin})`, `=SUM(C${ini}:C${fin})`, r.pie.costoDirecto, { negrita: true, borde: 'arriba' });
  const colsP = per.map((_, i) => COL(4 + i));
  const prop = (ref: string) => (c: string, i: number) => `=IF($C$${fCD}>0,${serieCuadrada((x) => `${ref}*${x}${fCD}/$C$${fCD}`, ref, colsP, i)},0)`;
  const fGG = filaTot('Gastos generales', v.gg, prop(ctx.refs.GG), `=${ctx.refs.GG}`, r.pie.gg);
  const fUt = filaTot('Utilidad', v.utilidad, prop(ctx.refs.UTIL), `=${ctx.refs.UTIL}`, r.pie.utilidad);
  const fSub = filaTot('SUBTOTAL', v.subtotal, (c) => `=${c}${fCD}+${c}${fGG}+${c}${fUt}`, `=C${fCD}+C${fGG}+C${fUt}`, r.pie.subtotal, { negrita: true, borde: 'arriba' });
  const fIgv = filaTot('IGV', v.igv, prop(ctx.refs.IGV), `=${ctx.refs.IGV}`, r.pie.igv);
  const fTot = filaTot('TOTAL', v.total, (c) => `=${c}${fSub}+${c}${fIgv}`, `=C${fSub}+C${fIgv}`, r.pie.total, { negrita: true, borde: 'arriba' });
  filaTot('Avance del periodo (%)', v.avancePct.map((x) => x / 100), (c) => `=IF($C$${fCD}>0,${c}${fCD}/$C$${fCD},0)`, `=1`, 1, { fmt: F_PCT });
  filaTot('Avance acumulado (%)', v.acumuladoPct.map((x) => x / 100), (c, i) => `=IF($C$${fCD}>0,SUM($D$${fCD}:${c}${fCD})/$C$${fCD},0)`, `=1`, 1, { fmt: F_PCT });
  filaTot('Monto acumulado', v.acumulado, (c) => `=SUM($D$${fTot}:${c}${fTot})`, `=C${fTot}`, r.pie.total);
  ctx.refs.VAL_TOTAL_FILA = String(fTot);
  ctx.refs.VAL_CD = `SUM('${h.nombre}'!$D$${fCD}:$${COL(3 + P)}$${fCD})`;
  h.ws.views = [{ state: 'frozen', ySplit: filaCab, xSplit: 3 }];
  configurarImpresion(h, ctx, filaCab, true);
}

export function hojaCalendario(
  ctx: Ctx,
  h: Hoja,
  titulo: string,
  filas: Resultados['adquisiciones'],
  filasDist: Map<string, number>,
  conPrevio: boolean,
  extra?: (f: number, ini: number, fin: number, P: number) => number,
) {
  const { r } = ctx;
  const per = [...(conPrevio ? ['Previo'] : []), ...r.programa.periodos.map((x) => x.etiqueta)];
  const P = per.length;
  const mon = r.proyecto.meta.moneda;
  h.anchos([12, 40, 7, 12, 11, ...new Array(P).fill(11)]);
  let f = membrete(h, ctx, titulo, 5 + P);
  const filaCab = f;
  h.cabecera(f++, ['Código', 'Descripción', 'Und', 'Cantidad total', `Precio (${mon})`, ...per]);
  const ini = f;
  for (const x of filas) {
    const fi = ctx.insumoFila.get(x.codigo);
    const fd = filasDist.get(x.codigo);
    h.v(f, 1, x.codigo, { borde: 'hair' });
    h.v(f, 2, x.descripcion, { borde: 'hair' });
    h.v(f, 3, x.unidad, { h: 'center', borde: 'hair' });
    h.link(f, 4, fi ? `='Insumos'!$I$${fi}` : '=0', x.total, { fmt: '#,##0.00', borde: 'hair' });
    h.link(f, 5, fi ? `='Insumos'!$F$${fi}` : '=0', r.proyecto.insumos.find((i) => i.codigo === x.codigo)?.precio ?? 0, { fmt: F_MONEDA, borde: 'hair' });
    const idx = x.valores.map((_, i) => String(i));
    x.valores.forEach((v, i) => h.fx(f, 6 + i, fd ? `=${serieCuadrada((k) => `$D${f}*'Distribución %'!${COL(4 + Number(k))}${fd}`, `ROUND($D${f},2)`, idx, i)}` : '=0', v, { fmt: '#,##0.00', borde: 'hair' }));
    f++;
  }
  const fin = f - 1;
  if (extra) f = extra(f, ini, fin, P);
  h.ws.views = [{ state: 'frozen', ySplit: filaCab, xSplit: 2 }];
  configurarImpresion(h, ctx, filaCab, true);
  return { ini, fin, P };
}

export function hojaDesembolsos(ctx: Ctx, h: Hoja, hVal: Hoja) {
  const { r } = ctx;
  const mon = r.proyecto.meta.moneda;
  const fTot = Number(ctx.refs.VAL_TOTAL_FILA);
  h.anchos([14, 18, 16, 16, 18, 18]);
  let f = membrete(h, ctx, 'Cronograma de desembolsos', 6);
  const filaCab = f;
  h.cabecera(f++, ['Periodo', `Valorización (${mon})`, 'Adelantos', 'Amortización', 'Desembolso neto', 'Acumulado']);
  const fAd = f;
  const ad = r.desembolsos.find((d) => d.periodo === 'Adelantos');
  h.v(f, 1, 'Adelantos', { borde: 'hair' });
  h.v(f, 2, 0, { fmt: F_MONEDA, borde: 'hair' });
  h.fx(f, 3, `=ROUND(${ctx.refs.TOTAL}*ADELANTO_DIRECTO,2)+ROUND(${ctx.refs.TOTAL}*ADELANTO_MATERIALES,2)`, ad ? ad.adelantoDirecto + ad.adelantoMateriales : 0, { fmt: F_MONEDA, borde: 'hair' });
  h.v(f, 4, 0, { fmt: F_MONEDA, borde: 'hair' });
  h.fx(f, 5, `=B${f}+C${f}-D${f}`, ad?.neto ?? 0, { fmt: F_MONEDA, borde: 'hair' });
  h.fx(f, 6, `=E${f}`, ad?.acumulado ?? 0, { fmt: F_MONEDA, borde: 'hair' });
  f++;
  const filas = r.desembolsos.filter((d) => d.periodo !== 'Adelantos');
  filas.forEach((d, i) => {
    const col = COL(4 + i);
    h.v(f, 1, d.periodo, { borde: 'hair' });
    h.link(f, 2, `='${hVal.nombre}'!${col}${fTot}`, d.valorizacion, { fmt: F_MONEDA, borde: 'hair' });
    h.v(f, 3, 0, { fmt: F_MONEDA, borde: 'hair' });
    const filasB = filas.map((_, k) => `B${fAd + 1 + k}`);
    h.fx(f, 4, `=IF(${ctx.refs.TOTAL}>0,${serieCuadrada((b) => `$C$${fAd}*${b}/${ctx.refs.TOTAL}`, `$C$${fAd}`, filasB, i)},0)`, d.amortizacion, { fmt: F_MONEDA, borde: 'hair' });
    h.fx(f, 5, `=B${f}+C${f}-D${f}`, d.neto, { fmt: F_MONEDA, borde: 'hair' });
    h.fx(f, 6, `=F${f - 1}+E${f}`, d.acumulado, { fmt: F_MONEDA, borde: 'hair' });
    f++;
  });
  h.v(f, 1, 'TOTAL', { negrita: true });
  h.fx(f, 2, `=SUM(B${fAd}:B${f - 1})`, r.pie.total, { fmt: F_MONEDA, negrita: true });
  h.fx(f, 5, `=SUM(E${fAd}:E${f - 1})`, r.pie.total, { fmt: F_MONEDA, negrita: true });
  h.fila(f, 1, 6, { borde: 'arriba' });
  h.ws.views = [{ state: 'frozen', ySplit: filaCab }];
  configurarImpresion(h, ctx, filaCab, false);
}
