// Exportación a Excel (.xlsx) totalmente editable: arma el libro con las hojas vinculadas por fórmulas (ver comun.ts).
import ExcelJS from 'exceljs';
import { datosCabecera, logoBytes } from '../../engine/cabecera';
import type { Resultados, TipoInsumo } from '../../engine/types';
import { compararCodigos } from '../../engine/util';
import { F_MONEDA, COL, Hoja, Ctx, NDL, DIAS, hojaCalendarioLaboral, cron } from './comun';
import { hojaDatos } from './datos';
import { planInsumos, hojaInsumos, hojaMetrados, hojaResumenMetrados, hojaApu, hojaPresupuesto, completarGGPresupuesto, hojaResumen } from './costos';
import { hojaGG, hojaPolinomica } from './gg';
import { hojaPrograma, Bloque, planPeriodos, apuPeriodos, insumosAnticipacion, hojaDistribucion, filasValorizado, hojaValorizado, hojaCalendario, hojaDesembolsos } from './programa';
import { hojaFlete, hojaControles, hojaCumplimiento } from './controles';
import { crearHojasSubpresupuestos, hojasSubpresupuestos } from './subpresupuestos';

export async function generarXlsx(r: Resultados): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const c = datosCabecera(r.proyecto);
  wb.creator = c.proyectista || 'Expediente Pro';
  wb.title = r.proyecto.meta.nombre;
  wb.company = c.proyectista;
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const ctx: Ctx = {
    r,
    wb,
    datos: {},
    insumoFila: new Map(),
    apuPU: new Map(),
    apuRend: new Map(),
    metTotal: new Map(),
    ppto: new Map(),
    refs: {},
    totalesGrupoInsumo: {} as Record<TipoInsumo, string>,
    plazoMeses: r.programa.plazoMeses,
    apuFilas: [],
  };
  if (c.logoProyectista) {
    const b = logoBytes(c.logoProyectista);
    ctx.imgProyectista = { id: wb.addImage({ buffer: b.datos as unknown as ExcelJS.Buffer, extension: b.tipo === 'jpg' ? 'jpeg' : 'png' }), ancho: c.logoProyectista.ancho, alto: c.logoProyectista.alto };
  }
  if (c.logoCliente) {
    const b = logoBytes(c.logoCliente);
    ctx.imgCliente = { id: wb.addImage({ buffer: b.datos as unknown as ExcelJS.Buffer, extension: b.tipo === 'jpg' ? 'jpeg' : 'png' }), ancho: c.logoCliente.ancho, alto: c.logoCliente.alto };
  }

  // orden de pestañas
  hojaDatos(ctx);
  const hRes = new Hoja(wb, 'Resumen');
  const hSub = crearHojasSubpresupuestos(wb, r); // subpresupuestos y consolidado, junto al Resumen
  const hPpto = new Hoja(wb, 'Presupuesto');
  const hApu = new Hoja(wb, 'APU');
  const hIns = new Hoja(wb, 'Insumos');
  const hMet = new Hoja(wb, 'Metrados');
  const hResMet = new Hoja(wb, 'Resumen metrados');
  const hGG = new Hoja(wb, 'Gastos generales');
  const hPol = new Hoja(wb, 'Fórmula polinómica');
  const hFle = r.proyecto.meta.fleteTarifaTon ? new Hoja(wb, 'Flete') : null;
  const hProg = new Hoja(wb, 'Cronograma');
  const hVal = new Hoja(wb, 'Valorizado');
  const hAdq = new Hoja(wb, 'Adquisiciones');
  const hEq = new Hoja(wb, 'Equipos');
  const hPer = new Hoja(wb, 'Personal');
  const hDes = new Hoja(wb, 'Desembolsos');
  const hDist = new Hoja(wb, 'Distribución %');
  const hCtl = new Hoja(wb, 'Controles');
  const hCum = r.proyecto.tdr.entregables.length ? new Hoja(wb, 'Cumplimiento TdR') : null;
  const hCal = new Hoja(wb, 'Calendario', { state: 'hidden' });
  hojaCalendarioLaboral(ctx, hCal);

  // dependencias: metrados → filas de presupuesto → APU → insumos → presupuesto → GG → resto
  planInsumos(ctx);
  hojaMetrados(ctx, hMet);
  const filaPptoDe = new Map<string, number>();
  hojaPresupuesto(ctx, hPpto, filaPptoDe, true); // solo reserva filas
  hojaApu(ctx, hApu, hPpto, filaPptoDe);
  // presupuesto real (necesita APU y metrados); CD se usa en insumos y GG
  const plan = new Map(filaPptoDe);
  hojaPresupuesto(ctx, hPpto, filaPptoDe);
  for (const [k, v] of plan) if (filaPptoDe.get(k) !== v) throw new Error('Desfase de filas en el presupuesto');
  hojaInsumos(ctx, hIns, hApu);
  insumosAnticipacion(ctx, hIns);
  hojaGG(ctx, hGG);
  completarGGPresupuesto(ctx, hPpto);
  hojaResumenMetrados(ctx, hResMet);
  hojaResumen(ctx, hRes, filaPptoDe);
  if (hSub) hojasSubpresupuestos(ctx, hSub, filaPptoDe);
  hojaPolinomica(ctx, hPol);
  if (hFle) hojaFlete(ctx, hFle);
  hojaPrograma(ctx, hProg);
  planPeriodos(ctx);
  apuPeriodos(ctx, hApu);

  // distribución por periodos (fracciones calculadas por el motor)
  const etiquetas = r.programa.periodos.map((x) => x.etiqueta);
  const frac = (vals: number[], total: number) => vals.map((v) => (total ? v / total : 0));
  const per = ctx.per!;
  const apuA = hApu.rango(1, 1, 20000, 1);
  const apuH = hApu.rango(1, 8, 20000, 8);
  const porInsumo = (col0: number) => (f: number, i: number) => {
    const tot = `SUMIF(${apuA},$A${f},${apuH})`;
    return `=IF(${tot}=0,0,SUMIF(${apuA},$A${f},${hApu.rango(1, col0 + i, 20000, col0 + i)})/${tot})`;
  };
  const avance = (_f: number, i: number, clave: string) => {
    const rp = ctx.prog?.fila.get(clave);
    if (!rp) return '=0';
    const H = cron('H', rp), I = cron('I', rp), J = cron('J', rp);
    return `=IF(${H}=0,0,${DIAS(I, J, per.ini[i], per.finCalc[i])}/${H})`;
  };
  const bloques: Bloque[] = [
    { titulo: 'Avance de partidas', periodos: etiquetas, formula: avance, filas: filasValorizado(r).map((x) => ({ clave: x.clave, codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad, fracciones: frac(x.valores, x.total) })) },
    { titulo: 'Compra de materiales', periodos: ['Previo', ...etiquetas], formula: porInsumo(10), filas: r.adquisiciones.map((x) => ({ clave: x.codigo, codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad, fracciones: frac(x.valores, x.total) })) },
    { titulo: 'Uso de equipos', periodos: etiquetas, formula: porInsumo(11), filas: r.equipos.map((x) => ({ clave: x.codigo, codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad, fracciones: frac(x.valores, x.total) })) },
    { titulo: 'Mano de obra', periodos: etiquetas, formula: porInsumo(11), filas: r.personal.map((x) => ({ clave: x.codigo, codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad, fracciones: frac(x.valores, x.total) })) },
  ];
  const dist = hojaDistribucion(ctx, hDist, bloques);
  hojaValorizado(ctx, hVal, dist.get('Avance de partidas')!);
  hojaCalendario(ctx, hAdq, 'Calendario de adquisición de materiales', r.adquisiciones, dist.get('Compra de materiales')!, true, (f, ini, fin, P) => {
    const h = hAdq;
    h.v(f, 2, `Monto de compras (${r.proyecto.meta.moneda})`, { negrita: true, h: 'right' });
    for (let i = 0; i < P; i++) {
      const c2 = COL(6 + i);
      const monto = r.adquisiciones.reduce((a, x) => a + (x.montos?.[i] ?? 0), 0);
      h.fx(f, 6 + i, `=SUMPRODUCT(ROUND(${c2}${ini}:${c2}${fin}*$E$${ini}:$E$${fin},2))`, monto, { fmt: F_MONEDA, negrita: true });
    }
    h.fila(f, 1, 5 + P, { borde: 'arriba' });
    return f + 1;
  });
  hojaCalendario(ctx, hEq, 'Calendario de utilización de equipos (horas-máquina)', r.equipos, dist.get('Uso de equipos')!, false);
  hojaCalendario(ctx, hPer, 'Histograma de personal (horas-hombre)', r.personal, dist.get('Mano de obra')!, false, (f, ini, fin, P) => {
    const h = hPer;
    h.v(f, 2, 'Total horas-hombre', { negrita: true, h: 'right' });
    for (let i = 0; i < P; i++) {
      const c2 = COL(6 + i);
      const hh = r.personal.reduce((a, x) => a + (x.valores[i] ?? 0), 0);
      h.fx(f, 6 + i, `=SUM(${c2}${ini}:${c2}${fin})`, hh, { fmt: '#,##0.00', negrita: true });
    }
    h.fila(f, 1, 5 + P, { borde: 'arriba' });
    f++;
    h.v(f, 2, 'Días laborables del periodo', { cursiva: true, h: 'right' });
    r.programa.periodos.forEach((p, i) => h.fx(f, 6 + i, `=${NDL(per.ini[i], per.fin[i])}`, p.diasLaborables, { fmt: '0' }));
    f++;
    h.v(f, 2, 'Trabajadores promedio (equivalentes)', { negrita: true, h: 'right' });
    for (let i = 0; i < P; i++) {
      const c2 = COL(6 + i);
      h.fx(f, 6 + i, `=IF(${c2}${f - 1}>0,ROUND(${c2}${f - 2}/(JORNADA*${c2}${f - 1}),1),0)`, r.personalEquivalente[i] ?? 0, { fmt: '0.0', negrita: true });
    }
    return f + 1;
  });
  hojaDesembolsos(ctx, hDes, hVal);
  hojaControles(ctx, hCtl);
  if (hCum) hojaCumplimiento(ctx, hCum);
  void compararCodigos;
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
