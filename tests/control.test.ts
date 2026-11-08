import { describe, expect, it } from 'vitest';
import { proyectoEjemplo } from '../src/data/proyectos';
import { calcularTodo } from '../src/engine/index';
import {
  calcularEvm, calcularPpc, calcularTablero, calcularValorizaciones, capacidadProceso, cartaIMR, causasNoCumplimiento, coeficienteK,
  controlDemostracion, controlVacio, crearLineaBase, leerValores, lookahead, lunesDe, normalizarControl, pareto, programarFase,
  pvALaFecha, recursosSemanales, rendimientoMedicion, resumenCarta, resumirCambios,
} from '../src/engine/control';
import { migrarProyecto } from '../src/io/migrar';
import { generarXlsxControl } from '../src/export/control';
import ExcelJS from 'exceljs';

const r = calcularTodo(proyectoEjemplo());

describe('línea base y valor ganado', () => {
  const lb = crearLineaBase(r);
  it('congela el presupuesto y el cronograma', () => {
    expect(lb.costoDirecto).toBeCloseTo(r.pie.costoDirecto, 2);
    expect(lb.partidas.reduce((s, b) => s + b.parcial, 0)).toBeCloseTo(r.pie.costoDirecto, 0);
    expect(lb.partidas.every((b) => b.inicio <= b.fin)).toBe(true);
    expect(lb.partidas.some((b) => b.hhUnidad > 0)).toBe(true);
  });
  it('el valor planificado va de 0 al costo directo', () => {
    expect(pvALaFecha(r, lb, '2000-01-01')).toBe(0);
    expect(pvALaFecha(r, lb, lb.fin)).toBeCloseTo(r.pie.costoDirecto, 0);
    const medio = pvALaFecha(r, lb, r.programa.periodos[0].fin);
    expect(medio).toBeGreaterThan(0);
    expect(medio).toBeLessThan(r.pie.costoDirecto);
  });
  it('EV, PV, AC e índices con un corte conocido', () => {
    const c = controlVacio();
    c.lineaBase = lb;
    const b = lb.partidas[0];
    c.cortes.push({ id: 'k1', fecha: b.fin, nombre: 'S1', metrados: { [b.id]: b.metrado / 2 }, costoReal: (b.parcial / 2) * 1.25, nota: '' });
    const e = calcularEvm(r, c)!;
    const p = e.ultimo!;
    expect(p.ev).toBeCloseTo(b.parcial / 2, 1);
    expect(p.cpi).toBeCloseTo(0.8, 3);
    expect(p.eac).toBeCloseTo(e.bac / 0.8, 0);
    expect(p.spi).toBeCloseTo(p.ev / p.pv, 6);
    expect(e.partidas.find((x) => x.base.id === b.id)!.avancePct).toBeCloseTo(50, 3);
  });
  it('sin costo real no calcula CPI', () => {
    const c = controlVacio();
    c.lineaBase = lb;
    c.cortes.push({ id: 'k1', fecha: lb.inicio, nombre: 'S1', metrados: {}, costoReal: null, nota: '' });
    expect(calcularEvm(r, c)!.ultimo!.cpi).toBeNull();
  });
});

describe('valorizaciones y reajuste', () => {
  it('K = 1 cuando los índices no cambian y reajuste nulo', () => {
    const c = controlDemostracion(r);
    const mes = c.cortes[0].fecha.slice(0, 7);
    const ius = [...new Set(r.polinomica.monomios.flatMap((m) => m.indices.map((i) => i.iu)))];
    c.indices = { base: Object.fromEntries(ius.map((iu) => [iu, 400])), [mes]: Object.fromEntries(ius.map((iu) => [iu, 400])) };
    expect(coeficienteK(r, c, mes).k).toBeCloseTo(1, 3);
    const v = calcularValorizaciones(r, c).find((x) => x.mes === mes)!;
    expect(v.reajuste).toBe(0);
    expect(v.valorizacion).toBeCloseTo(v.costoDirecto + v.gg + v.utilidad, 1);
  });
  it('K sube 10 % si todos los índices suben 10 %', () => {
    const c = controlDemostracion(r);
    const mes = c.cortes[0].fecha.slice(0, 7);
    const ius = [...new Set(r.polinomica.monomios.flatMap((m) => m.indices.map((i) => i.iu)))];
    c.indices = { base: Object.fromEntries(ius.map((iu) => [iu, 400])), [mes]: Object.fromEntries(ius.map((iu) => [iu, 440])) };
    expect(coeficienteK(r, c, mes).k).toBeCloseTo(1.1, 2);
  });
  it('la suma de valorizaciones es el avance valorizado', () => {
    const c = controlDemostracion(r);
    const vals = calcularValorizaciones(r, c);
    const evm = calcularEvm(r, c)!;
    const cd = vals.reduce((s, v) => s + v.costoDirecto, 0);
    expect(cd).toBeCloseTo(evm.ultimo!.ev, -1);
    expect(vals[vals.length - 1].indicesFaltantes.length).toBeGreaterThan(0); // sin índices cargados
  });
});

describe('cambios, recursos y tablero', () => {
  it('presupuesto vigente con adicionales y deductivos', () => {
    const c = controlDemostracion(r);
    const s = resumirCambios(r, c);
    expect(s.vigente).toBeCloseTo(s.contractual + s.adicionales - s.deductivos, 2);
    expect(s.plazoVigente).toBe(s.plazoContractual + 7);
  });
  it('las HH planificadas por semana suman las HH del presupuesto', () => {
    const sem = recursosSemanales(r, controlVacio());
    const total = sem.reduce((s, x) => s + x.hhPlan, 0);
    const hhPpto = r.personal.reduce((s, f) => s + f.total, 0);
    expect(total).toBeCloseTo(hhPpto, -1);
  });
  it('tablero completo con datos de demostración', () => {
    const t = calcularTablero(r, controlDemostracion(r), '2099-01-01');
    expect(t.hayLineaBase).toBe(true);
    expect(t.spi).toBeGreaterThan(0.5);
    expect(t.cpi).toBeGreaterThan(0.5);
    expect(t.ppcPromedio).not.toBeNull();
    expect(t.riesgosAbiertos).toBe(3);
    expect(t.ipPromedio).toBeGreaterThan(0.5);
  });
});

describe('Last Planner', () => {
  const c = controlDemostracion(r);
  it('PPC por semana y causas de no cumplimiento', () => {
    const p = calcularPpc(c);
    expect(p.semanas.length).toBe(c.semanas.length);
    const s = c.semanas[0];
    const ev = s.compromisos.filter((x) => x.cumplido !== null);
    expect(p.semanas[0].ppc).toBeCloseTo((ev.filter((x) => x.cumplido).length / ev.length) * 100, 6);
    const cnc = causasNoCumplimiento(c);
    expect(cnc[cnc.length - 1].acumuladoPct).toBeCloseTo(100, 6);
  });
  it('lookahead marca actividades con restricciones abiertas', () => {
    const res = c.restricciones.find((x) => !x.liberada)!;
    const act = r.programa.actividades.find((a) => a.partidaId === res.partidaId)!;
    const la = lookahead(r, c, act.inicio, 4);
    const fila = la.filas.find((f) => f.partidaId === res.partidaId)!;
    expect(fila.lista).toBe(false);
    expect(la.lunes[0]).toBe(lunesDe(act.inicio));
  });
  it('programación pull hacia atrás desde el hito', () => {
    const h = c.hitos[0];
    const f = programarFase(r, c, h.id);
    expect(f.length).toBe(4);
    expect(f[0].fin < h.fecha).toBe(true);
    for (let i = 1; i < f.length; i++) expect(f[i].fin < f[i - 1].inicio).toBe(true);
  });
});

describe('lean y six sigma', () => {
  it('índice de productividad de una medición', () => {
    const c = controlDemostracion(r);
    const m = c.mediciones[0];
    const x = rendimientoMedicion(r, m);
    expect(x.hh).toBe(m.trabajadores * m.horas);
    expect(x.ip).toBeCloseTo(x.hhUnidadPlan / (x.hh / m.cantidad), 6);
  });
  it('carta balance suma 100 %', () => {
    const s = resumenCarta({ conteos: { productivo: 50, transporte: 30, esperas: 20 } });
    expect(s.tp + s.tc + s.tnc).toBeCloseTo(100, 6);
    expect(s.tp).toBeCloseTo(50, 6);
  });
  it('carta I-MR detecta un punto fuera de control', () => {
    const v = [10, 10.2, 9.9, 10.1, 9.8, 10, 10.1, 9.9, 14, 10];
    const k = cartaIMR(v)!;
    expect(k.fuera).toContain(8);
    expect(k.enControl).toBe(false);
    expect(cartaIMR([1, 2, 1, 2, 1, 2])!.enControl).toBe(true);
  });
  it('Cp y Cpk de un proceso centrado', () => {
    const v = [9, 10, 11, 9, 10, 11, 9, 10, 11, 10];
    const k = capacidadProceso(v, 7, 13)!;
    expect(k.media).toBeCloseTo(10, 6);
    expect(k.cp).toBeCloseTo(k.cpk!, 6);
    expect(k.cp).toBeCloseTo(6 / (6 * k.sigma), 6);
    expect(k.histograma.reduce((s, h) => s + h.n, 0)).toBe(10);
  });
  it('pareto ordenado y acumulado', () => {
    const p = pareto({ a: 1, b: 5, c: 4 });
    expect(p.map((x) => x.clave)).toEqual(['b', 'c', 'a']);
    expect(p[1].acumuladoPct).toBeCloseTo(90, 6);
  });
  it('lee números escritos a mano', () => {
    expect(leerValores('97,2; 96.8\n98 abc 95')).toEqual([97.2, 96.8, 98, 95]);
  });
});

describe('guardado e informe', () => {
  it('el control sobrevive a la migración del archivo', () => {
    const p = proyectoEjemplo();
    p.control = controlDemostracion(r);
    const q = migrarProyecto(JSON.parse(JSON.stringify(p)));
    expect(q.control!.cortes.length).toBe(p.control.cortes.length);
    expect(normalizarControl({ cortes: [] }).semanas).toEqual([]);
  });
  it('genera el informe de control en Excel', async () => {
    const p = proyectoEjemplo();
    p.control = controlDemostracion(r);
    const rr = calcularTodo(p);
    const datos = await generarXlsxControl(rr, p.control);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(datos as unknown as ArrayBuffer);
    const hojas = wb.worksheets.map((w) => w.name);
    expect(hojas).toContain('Tablero');
    expect(hojas).toContain('Valor ganado');
    expect(hojas).toContain('PPC');
    expect(hojas.length).toBeGreaterThanOrEqual(10);
  });
});
