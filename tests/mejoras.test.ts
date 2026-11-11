// Versión 2.6: cálculo incremental, calendario, análisis gerencial, integridad y organización del código.
import { readFileSync } from 'node:fs';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { proyectoEjemplo } from '../src/data/proyectos';
import { analizar, clasificarAbc } from '../src/engine/analisis';
import { controlDemostracion, calcularEvm } from '../src/engine/control';
import { calcularTodo, mismoCalculo, recalcular } from '../src/engine/index';
import { repararIntegridad, resumenIntegridad, revisarIntegridad } from '../src/engine/integridad';
import { Calendario } from '../src/engine/schedule';
import type { Proyecto, Resultados } from '../src/engine/types';
import { diaSemana, sumarDias } from '../src/engine/util';
import { tablasGerenciales } from '../src/export/gerencial';

const cifras = (r: Resultados) => ({ pie: r.pie, filas: r.filas.map((f) => [f.partida.codigo, f.metrado, f.pu, f.parcial]), plazo: r.programa.plazoDias, val: r.validacion.map((v) => v.estado), insumos: r.insumos.total, eett: r.eett.map((e) => e.secciones), polinomica: r.polinomica.formula });

describe('cálculo incremental', () => {
  it('da lo mismo que el cálculo completo después de cada edición', () => {
    let p: Proyecto = produce(proyectoEjemplo(), () => {});
    let r = recalcular(p, null);
    const hojas = p.partidas.filter((x) => !x.titulo);
    const ediciones: ((d: Proyecto) => void)[] = [
      (d) => { d.metrados[3].largo = 17.5; },
      (d) => { d.apus[hojas[2].id].rendimiento = 33; },
      (d) => { d.insumos[4].precio = 99.9; },
      (d) => { d.insumos[1].descripcion = 'Insumo renombrado'; },
      (d) => { d.meta.jornadaHoras = 10; },
      (d) => { d.partidas.find((x) => x.id === hojas[5].id)!.descripcion = 'Excavación de zanja con otro nombre'; },
      (d) => { d.apus[hojas[1].id].items.pop(); },
      (d) => { d.meta.utilidadPct = 12; },
      (d) => { d.plantillasEett[0].descripcion = 'Texto nuevo {{partida}}'; },
    ];
    for (const e of ediciones) {
      p = produce(p, e);
      r = recalcular(p, r);
      expect(cifras(r)).toEqual(cifras(calcularTodo(JSON.parse(JSON.stringify(p)))));
    }
  });
  it('no recalcula el presupuesto cuando solo cambia el control de obra', () => {
    const p = produce(proyectoEjemplo(), () => {});
    const r = recalcular(p, null);
    const p2 = produce(p, (d) => { d.control = controlDemostracion(r) as never; });
    expect(mismoCalculo(p, p2)).toBe(true);
    const r2 = recalcular(p2, r);
    expect(r2.filas).toBe(r.filas);
    expect(r2.proyecto).toBe(p2);
    const p3 = produce(p2, (d) => { d.gg[0].precio += 1; });
    expect(mismoCalculo(p2, p3)).toBe(false);
    expect(recalcular(p3, r2).pie.gg).not.toBe(r.pie.gg);
  });
});

describe('calendario', () => {
  it('cuenta días laborables igual que el conteo día por día', () => {
    const feriados = ['2026-12-08', '2026-12-25', '2027-01-01'];
    const cal = new Calendario('2026-11-02', [1, 2, 3, 4, 5, 6], feriados);
    const lento = (a: string, b: string) => { let n = 0; for (let d = a; d <= b; d = sumarDias(d, 1)) if (diaSemana(d) !== 0 && !feriados.includes(d)) n++; return n; };
    for (const [a, b] of [['2026-11-02', '2026-11-02'], ['2026-11-08', '2026-11-08'], ['2026-11-02', '2027-02-12'], ['2026-12-06', '2026-12-27'], ['2026-12-25', '2027-01-01'], ['2026-10-01', '2026-11-20'], ['2027-01-05', '2026-12-01']]) {
      expect(cal.laborablesEntre(a, b)).toBe(lento(a, b));
    }
  });
  it('el valor ganado de la demostración se mantiene', () => {
    const r = calcularTodo(proyectoEjemplo());
    const evm = calcularEvm(r, controlDemostracion(r))!;
    expect(evm.pvDias.length).toBe(r.programa.diasLaborables);
    expect(evm.pvDias[evm.pvDias.length - 1]).toBeCloseTo(evm.bac, 2);
  });
});

describe('análisis gerencial', () => {
  const r = calcularTodo(proyectoEjemplo());
  const a = analizar(r);
  it('los títulos y la composición suman el costo directo', () => {
    expect(a.porTitulo.reduce((s, x) => s + x.monto, 0)).toBeCloseTo(r.pie.costoDirecto, 2);
    expect(a.composicion.reduce((s, x) => s + x.monto, 0)).toBeCloseTo(r.insumos.total, 1);
    expect(a.estructura.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 6);
  });
  it('clasifica ABC con cortes de 80 % y 95 %', () => {
    const abc = clasificarAbc([50, 30, 10, 6, 4].map((monto, i) => ({ clave: `${i}`, codigo: `${i}`, descripcion: '', unidad: '', cantidad: 1, precio: monto, monto })));
    expect(abc.items.map((x) => x.clase).join('')).toBe('AABBC');
    expect(abc.items[4].acumPct).toBeCloseTo(100, 9);
    expect(a.abcPartidas.total).toBeCloseTo(r.pie.costoDirecto, 2);
    expect(a.abcPartidas.clases.A.n + a.abcPartidas.clases.B.n + a.abcPartidas.clases.C.n).toBe(r.hojas.length);
  });
  it('arma las hojas del reporte gerencial', () => {
    const hojas = tablasGerenciales(r);
    expect(hojas.map((h) => h.hoja)).toEqual(['Resumen ejecutivo', 'Costo por título', 'Composición', 'ABC partidas', 'ABC insumos', 'Curva S', 'Consistencia']);
    for (const h of hojas) for (const f of h.tabla.filas) expect(f.celdas.length).toBe(h.tabla.cabecera.length);
  });
});

describe('integridad de datos', () => {
  it('el ejemplo no tiene problemas', () => {
    expect(revisarIntegridad(proyectoEjemplo())).toEqual([]);
  });
  it('detecta y repara datos sueltos sin cambiar el presupuesto válido', () => {
    const p = proyectoEjemplo();
    const antes = calcularTodo(p).pie.total;
    const hoja = p.partidas.find((x) => !x.titulo)!;
    p.metrados.push({ id: 'm-x', partidaId: 'no-existe', descripcion: 'huérfano', cantidad: 5 });
    p.apus['no-existe'] = { rendimiento: 1, items: [] };
    p.programa['no-existe'] = { predecesoras: [] };
    p.programa[hoja.id] = { ...(p.programa[hoja.id] ?? { predecesoras: [] }), predecesoras: [...(p.programa[hoja.id]?.predecesoras ?? []), { id: 'fantasma', tipo: 'FC', desfase: 0 }, { id: hoja.id, tipo: 'FC', desfase: 0 }] };
    p.meta.feriados.push('31/12/2026');
    p.insumos[0].precio = NaN;
    const lista = revisarIntegridad(p);
    expect(lista.map((x) => x.clave).sort()).toEqual(['apu-huerfano', 'feriado', 'metrado-huerfano', 'numero', 'predecesora-rota', 'programa-huerfano']);
    expect(lista.find((x) => x.clave === 'predecesora-rota')!.cantidad).toBe(2);
    expect(resumenIntegridad(lista).reparables).toBe(7);
    const rep = repararIntegridad(p);
    expect(rep.pendientes).toEqual([]);
    expect(rep.proyecto).not.toBe(p);
    expect(p.metrados.some((m) => m.id === 'm-x')).toBe(true); // el original no se toca
    rep.proyecto.insumos[0].precio = proyectoEjemplo().insumos[0].precio;
    expect(calcularTodo(rep.proyecto).pie.total).toBeCloseTo(antes, 2);
  });
  it('señala lo que no se puede reparar solo', () => {
    const p = proyectoEjemplo();
    p.insumos.push({ ...p.insumos[0] });
    const rep = repararIntegridad(p);
    expect(rep.proyecto).toBe(p);
    expect(rep.pendientes.map((x) => x.clave)).toEqual(['insumo-duplicado']);
  });
});

describe('organización del código', () => {
  const leer = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  it('la lista de módulos coincide en la navegación, los tipos y los componentes', () => {
    const nav = (JSON.parse(leer('electron/modulos.json')) as { items: { id: string; atajo: string }[] }[]).flatMap((g) => g.items);
    const ids = nav.map((x) => x.id).sort();
    const union = [...leer('src/ui/estado.ts').split('export type ModuloId =')[1].split(';')[0].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    const comp = [...leer('src/ui/modulos/registro.ts').split('export const MODULOS')[1].matchAll(/^\s+(\w+): Mod/gm)].map((m) => m[1]).sort();
    expect(union).toEqual(ids);
    expect(comp).toEqual(ids);
    expect(new Set(nav.map((x) => x.atajo)).size).toBe(nav.length);
  });
  it('ningún archivo de código pasa de 1 000 líneas, salvo los ya conocidos', () => {
    const mapa = leer('docs/MAPA.md');
    const grandes = [...mapa.matchAll(/^### `(.+?)` · (\d+) líneas/gm)].filter((m) => +m[2] > 1000).map((m) => m[1]);
    expect(grandes).toEqual(['src/export/xlsx.ts']);
  });
});
