// Versión 2.9 (etapa 3 del plan 3.0): subpresupuestos, versiones del presupuesto, vigente, monedas, fórmulas en metrados y subpartidas.
import ExcelJS from 'exceljs';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { proyectoEjemplo } from '../src/data/proyectos';
import { insumosSinTipoCambio } from '../src/engine/compute';
import { calcularEvm, controlDemostracion, resumirCambios } from '../src/engine/control';
import { compararPresupuestos, crearEscenario, escenarioContractual, proyectoDeEscenario, restaurarEscenario } from '../src/engine/escenarios';
import { ErrorExpresion, esFormula, evaluarExpresion, formulaExcel } from '../src/engine/expresion';
import { calcularTodo, recalcular } from '../src/engine/index';
import { revisarIntegridad } from '../src/engine/integridad';
import { type Pie, prefijoSubpartida, type Proyecto } from '../src/engine/types';
import { redondear } from '../src/engine/util';
import { generarXlsx } from '../src/export/xlsx';
import { migrarProyecto } from '../src/io/migrar';

const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const CAMPOS: (keyof Pie)[] = ['costoDirecto', 'gg', 'ggFijos', 'ggVariables', 'ggFinancieros', 'utilidad', 'subtotal', 'igv', 'total'];

/** Ejemplo con tres subpresupuestos repartidos entre sus títulos de primer nivel. */
function conSubpresupuestos(): Proyecto {
  const p = proyectoEjemplo();
  p.subpresupuestos = [{ id: 'sp-e', nombre: 'Estructuras' }, { id: 'sp-a', nombre: 'Arquitectura' }, { id: 'sp-i', nombre: 'Instalaciones' }];
  const titulos = p.partidas.filter((x) => x.titulo && !x.codigo.includes('.'));
  titulos.forEach((t, i) => { t.subpresupuesto = p.subpresupuestos![i % 3].id; });
  return p;
}

const libro = async (datos: Uint8Array) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(datos.buffer as ArrayBuffer); return wb; };

describe('subpresupuestos', () => {
  it('cada uno tiene su pie y la suma es exactamente el pie del presupuesto', () => {
    const r = calcularTodo(conSubpresupuestos());
    expect(r.subpresupuestos.map((s) => s.nombre)).toEqual(['Estructuras', 'Arquitectura', 'Instalaciones']);
    for (const c of CAMPOS) expect(redondear(r.subpresupuestos.reduce((a, s) => a + s.pie[c], 0), 2)).toBe(r.pie[c]);
    for (const s of r.subpresupuestos) {
      expect(s.pie.subtotal).toBe(redondear(s.pie.costoDirecto + s.pie.gg + s.pie.utilidad, 2));
      expect(s.pie.costoDirecto).toBeCloseTo(r.filas.filter((f) => s.titulos.includes(f.partida.id)).reduce((a, f) => a + f.parcial, 0), 2);
    }
    expect(calcularTodo(proyectoEjemplo()).subpresupuestos).toEqual([]);
  });
  it('los títulos sin subpresupuesto forman su propio grupo', () => {
    const p = conSubpresupuestos();
    p.partidas.find((x) => x.titulo && !x.codigo.includes('.'))!.subpresupuesto = undefined;
    const r = calcularTodo(p);
    expect(r.subpresupuestos[r.subpresupuestos.length - 1].nombre).toBe('Sin subpresupuesto');
    expect(redondear(r.subpresupuestos.reduce((a, s) => a + s.pie.total, 0), 2)).toBe(r.pie.total);
  });
  it('genera una hoja por subpresupuesto y el consolidado en el Excel', async () => {
    const r = calcularTodo(conSubpresupuestos());
    const wb = await libro(await generarXlsx(r));
    expect(wb.worksheets.map((w) => w.name).filter((n) => n.startsWith('SP ') || n === 'Consolidado')).toEqual(['Consolidado', 'SP Estructuras', 'SP Arquitectura', 'SP Instalaciones']);
    const res = (ws: string, etiqueta: string, col: number) => {
      let v: unknown;
      wb.getWorksheet(ws)!.eachRow((row) => { if (row.getCell(col === 6 ? 2 : 1).value === etiqueta) v = (row.getCell(col).value as { result: number }).result; });
      return v;
    };
    r.subpresupuestos.forEach((s) => expect(res(`SP ${s.nombre}`, 'TOTAL', 6)).toBe(s.pie.total));
    expect(res('Consolidado', 'CONSOLIDADO', 7)).toBe(r.pie.total);
  }, 30_000);
});

describe('versiones del presupuesto', () => {
  it('comparar dos versiones cuadra con la resta de totales', () => {
    const p = proyectoEjemplo();
    const r = calcularTodo(p);
    const oferta = crearEscenario(p, r, 'Oferta', 'oferta');
    const q = produce(p, (d) => { d.metrados[2].largo = (d.metrados[2].largo ?? 0) * 1.3; d.insumos[5].precio *= 0.9; d.partidas = d.partidas.filter((x) => x.id !== p.partidas.filter((y) => !y.titulo)[7].id); });
    const rb = calcularTodo(q);
    const c = compararPresupuestos(calcularTodo(proyectoDeEscenario(q, oferta)), rb);
    expect(c.partidas.reduce((a, f) => a + f.diferencia, 0)).toBeCloseTo(rb.pie.costoDirecto - r.pie.costoDirecto, 2);
    expect(c.totales.find((t) => t.concepto === 'Total')!.diferencia).toBe(redondear(rb.pie.total - r.pie.total, 2));
    expect(c.partidas.filter((f) => f.estado === 'solo A').length).toBe(1);
    expect(c.insumos.reduce((a, f) => a + f.diferencia, 0)).toBeCloseTo(rb.insumos.total - r.insumos.total, 1);
    expect(oferta.resumen!.total).toBe(r.pie.total);
  });
  it('restaurar una versión devuelve exactamente su presupuesto y guardarla no recalcula', () => {
    const p = proyectoEjemplo();
    const r = calcularTodo(p);
    const v = crearEscenario(p, r, 'Contractual', 'contractual');
    const q = produce(p, (d) => { d.insumos[0].precio += 3; d.escenarios = [v]; });
    const r1 = recalcular(q, null);
    expect(recalcular(produce(q, (d) => { d.escenarios!.push(clonar(v)); }), r1).filas).toBe(r1.filas);
    const restaurado = produce(q, (d) => restaurarEscenario(d, v));
    expect(calcularTodo(restaurado).pie).toEqual(r.pie);
    expect(escenarioContractual(restaurado)?.id).toBe(v.id);
  });
});

describe('presupuesto vigente', () => {
  it('parte de la versión contractual y el valor ganado usa el vigente', () => {
    const p = proyectoEjemplo();
    const r0 = calcularTodo(p);
    p.control = controlDemostracion(r0);
    const sinVersion = resumirCambios(calcularTodo(p), p.control);
    expect(sinVersion.origenContractual).toBe('lineaBase');
    p.escenarios = [crearEscenario(p, r0, 'Contrato', 'contractual')];
    const r = calcularTodo(p);
    const c = resumirCambios(r, p.control);
    expect(c.origenContractual).toBe('version');
    expect(c.contractual).toBe(r0.pie.subtotal);
    expect(c.vigente).toBe(redondear(c.contractual + c.adicionales - c.deductivos));
    const evm = calcularEvm(r, p.control)!;
    const lb = p.control.lineaBase!;
    expect(evm.bacVigente).toBeCloseTo(evm.bac + ((c.adicionales - c.deductivos) * lb.costoDirecto) / lb.subtotal, 1);
    const u = evm.ultimo!;
    if (u.cpi) expect(u.eac).toBeCloseTo(evm.bacVigente / u.cpi, 0);
  });
});

describe('varias monedas', () => {
  it('convierte el precio de los insumos en otra moneda con el tipo de cambio de la fecha base', () => {
    const p = proyectoEjemplo();
    const base = calcularTodo(p);
    const ins = p.insumos.find((i) => i.tipo === 'EQ' && base.insumos.items.some((x) => x.insumo.codigo === i.codigo))!;
    const precioSoles = ins.precio;
    ins.moneda = 'US$';
    ins.precio = redondear(precioSoles / 3.75, 4);
    expect(insumosSinTipoCambio(p)).toEqual([ins.codigo]);
    p.meta.tiposCambio = [{ moneda: 'US$', fecha: '2026-01-01', valor: 3.6 }, { moneda: 'US$', fecha: p.meta.fechaBase, valor: 3.75 }, { moneda: 'US$', fecha: '2099-01-01', valor: 9 }];
    expect(insumosSinTipoCambio(p)).toEqual([]);
    const r = calcularTodo(p);
    expect(r.insumos.items.find((x) => x.insumo.codigo === ins.codigo)!.precio).toBeCloseTo(precioSoles, 3);
    expect(r.pie.costoDirecto).toBeCloseTo(base.pie.costoDirecto, 0);
    // al cambiar el tipo de cambio, el cálculo incremental da lo mismo que el completo
    let q = produce(p, () => {});
    let rr = recalcular(q, null);
    q = produce(q, (d) => { d.meta.tiposCambio![1].valor = 3.9; });
    rr = recalcular(q, rr);
    expect(rr.pie).toEqual(calcularTodo(clonar(q)).pie);
  });
});

describe('fórmulas en metrados', () => {
  it('evalúa sin eval y rechaza lo inválido', () => {
    expect(evaluarExpresion('2*(3.5+4.2)')).toBeCloseTo(15.4, 10);
    expect(evaluarExpresion('=12,5/2')).toBe(6.25);
    expect(evaluarExpresion('-3+2^3^2/64*2')).toBe(13);
    expect(evaluarExpresion('1,234.5*2')).toBe(2469);
    expect(evaluarExpresion('2 × 3 ÷ 4')).toBe(1.5);
    for (const malo of ['', '2*', '(1+2', '1/0', '2a', 'alert(1)']) expect(() => evaluarExpresion(malo)).toThrow(ErrorExpresion);
    expect(esFormula('2*3')).toBe(true);
    expect(esFormula('-4.5')).toBe(false);
    expect(formulaExcel('12,5 × 2')).toBe('12.5*2');
  });
  it('la fórmula va al Excel como fórmula con su resultado', async () => {
    const p = proyectoEjemplo();
    const m = p.metrados.find((x) => x.largo)!;
    m.largo = evaluarExpresion('2*(3.5+4.2)');
    m.formulas = { largo: '2*(3.5+4.2)' };
    const r = calcularTodo(p);
    const wb = await libro(await generarXlsx(r));
    let hallada = false;
    wb.getWorksheet('Metrados')!.eachRow((row) => row.eachCell((c) => { const v = c.value as { formula?: string; result?: number }; if (v?.formula === '2*(3.5+4.2)') { hallada = true; expect(v.result).toBeCloseTo(15.4, 10); } }));
    expect(hallada).toBe(true);
    expect(migrarProyecto(clonar(p)).metrados.find((x) => x.id === m.id)!.formulas).toEqual({ largo: '2*(3.5+4.2)' });
  }, 30_000);
});

describe('subpartidas', () => {
  /** SP001 = el análisis de la primera partida con mano de obra; otra partida la usa 0.5 veces. */
  function conSubpartida() {
    const p = proyectoEjemplo();
    const r = calcularTodo(p);
    const fuente = r.hojas.find((f) => r.apus[f.partida.id].items.some((i) => i.insumo.tipo === 'MO') && r.apus[f.partida.id].items.some((i) => i.porcentaje !== null))!;
    p.subpartidas = [{ codigo: 'SP001', descripcion: `Sub: ${fuente.partida.descripcion}`, unidad: fuente.partida.unidad }];
    p.apus[prefijoSubpartida + 'SP001'] = clonar(p.apus[fuente.partida.id]);
    const destino = r.hojas.find((f) => f.partida.id !== fuente.partida.id && f.metrado > 0 && r.apus[f.partida.id].items.some((i) => i.porcentaje !== null))!;
    p.apus[destino.partida.id].items.push({ insumo: 'SP001', cantidad: 0.5 });
    return { p, r0: r, fuente, destino };
  }
  it('se desglosa en el análisis que la usa y suma su costo', () => {
    const { p, r0, destino } = conSubpartida();
    const r = calcularTodo(p);
    const sp = r.subpartidas.SP001;
    expect(sp.pu).toBeGreaterThan(0);
    const a = r.apus[destino.partida.id];
    expect(a.items.filter((i) => i.subpartida === 'SP001').length).toBe(sp.items.length);
    expect(a.pu).toBeCloseTo(r0.apus[destino.partida.id].pu + 0.5 * sp.pu, 1);
    // la herramienta (% de MO) de la partida se calcula solo sobre su mano de obra propia
    const pct = a.items.find((i) => i.porcentaje !== null && !i.subpartida)!;
    expect(pct.parcial).toBe(r0.apus[destino.partida.id].items.find((i) => i.porcentaje !== null)!.parcial);
    expect(revisarIntegridad(p)).toEqual([]);
    // la diferencia por redondeo de la relación de insumos casi no cambia (la del ejemplo ya es de ≈73)
    expect(Math.abs(r.insumos.diferenciaRedondeo - r0.insumos.diferenciaRedondeo)).toBeLessThan(1);
  });
  it('un ciclo de subpartidas se informa como faltante y el Excel se genera', async () => {
    const { p, destino } = conSubpartida();
    p.apus[prefijoSubpartida + 'SP001'].items.push({ insumo: 'SP001', cantidad: 1 });
    const r = calcularTodo(p);
    expect(r.subpartidas.SP001.faltantes).toContain('SP001');
    const wb = await libro(await generarXlsx(r));
    let pu: number | undefined;
    wb.getWorksheet('Presupuesto')!.eachRow((row) => { if (row.getCell(1).value === destino.partida.codigo) pu = (row.getCell(5).value as { result: number }).result; });
    expect(pu).toBe(r.apus[destino.partida.id].pu);
  }, 30_000);
});

describe('migración al esquema 4', () => {
  it('un proyecto de 2.7 abre con las listas nuevas vacías', () => {
    const viejo = { ...clonar(proyectoEjemplo()), esquema: 3 } as Record<string, unknown>;
    delete viejo.subpresupuestos;
    const p = migrarProyecto(viejo);
    expect(p.esquema).toBe(4);
    expect([p.subpresupuestos, p.subpartidas, p.escenarios]).toEqual([[], [], []]);
    expect(calcularTodo(p).pie).toEqual(calcularTodo(proyectoEjemplo()).pie);
  });
});
