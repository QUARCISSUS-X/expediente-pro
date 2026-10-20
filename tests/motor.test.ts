import { describe, expect, it } from 'vitest';
import { proyectoEjemplo, proyectoEnBlanco } from '../src/data/proyectos';
import { calcularApu, parcialMetrado } from '../src/engine/compute';
import { calcularTodo } from '../src/engine/index';
import type { Proyecto } from '../src/engine/types';
import { montoEnLetras, redondear, redondearMilesimo } from '../src/engine/util';
import { exportarPlantilla, importarPlantilla, parsearPreds } from '../src/io/plantilla';
import { generarMsProject } from '../src/export/msproject';
import { generarXlsx } from '../src/export/xlsx';
import { generarDocx } from '../src/export/docx';
import { especificacionesTecnicas } from '../src/engine/documentos';
import { migrarProyecto } from '../src/io/migrar';
import { codigoItem, importarExpediente } from '../src/io/importarExpediente';
import ExcelJS from 'exceljs';

const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const regla = (p: Proyecto, n: number) => calcularTodo(p).validacion.find((v) => v.regla === n)!;

describe('utilidades', () => {
  it('redondea a 2 decimales y al milésimo', () => {
    expect(redondear(1.005)).toBe(1.01);
    expect(redondearMilesimo(0.1235)).toBe(0.124);
    expect(redondearMilesimo(0.1234)).toBe(0.123);
  });
  it('escribe montos en letras', () => {
    expect(montoEnLetras(1428109.56)).toBe('UN MILLÓN CUATROCIENTOS VEINTIOCHO MIL CIENTO NUEVE CON 56/100 SOLES');
    expect(montoEnLetras(21000)).toBe('VEINTIÚN MIL CON 00/100 SOLES');
    expect(montoEnLetras(100)).toBe('CIEN CON 00/100 SOLES');
  });
});

describe('metrados y APU', () => {
  it('parcial = veces × dimensiones o veces × cantidad', () => {
    expect(parcialMetrado({ id: 'a', partidaId: 'x', descripcion: '', veces: 3, largo: 2, ancho: 0.5, alto: null })).toBe(3);
    expect(parcialMetrado({ id: 'a', partidaId: 'x', descripcion: '', veces: 3, cantidad: 420 })).toBe(1260);
    expect(parcialMetrado({ id: 'a', partidaId: 'x', descripcion: '', largo: 10 })).toBe(10);
  });
  it('calcula cantidades de MO por cuadrilla y rendimiento, y herramientas como %MO', () => {
    const p = proyectoEnBlanco();
    const ins = new Map(p.insumos.map((i) => [i.codigo, i]));
    const a = calcularApu('x', { rendimiento: 4, items: [{ insumo: 'MO04', cuadrilla: 1 }, { insumo: 'MO01', cuadrilla: 0.1 }, { insumo: 'EQ01', porcentaje: 5 }] }, ins, 8);
    expect(a.items[0].cantidad).toBe(2); // 1 × 8 / 4
    expect(a.items[1].cantidad).toBe(0.2);
    const mo = a.subtotales.MO;
    expect(a.items[2].parcial).toBe(redondear(mo * 0.05));
    expect(a.pu).toBe(redondear(a.items.reduce((s, i) => s + i.parcial, 0)));
  });
});

describe('proyecto de ejemplo', () => {
  const r = calcularTodo(proyectoEjemplo());
  it('no tiene errores de consistencia', () => {
    expect(r.resumenValidacion.errores).toBe(0);
  });
  it('el pie cuadra', () => {
    const { costoDirecto, gg, utilidad, subtotal, igv, total } = r.pie;
    expect(redondear(costoDirecto + gg + utilidad)).toBe(subtotal);
    expect(redondear(subtotal + igv)).toBe(total);
    expect(gg).toBe(r.gg.total);
  });
  it('el valorizado suma el costo directo y el total', () => {
    expect(redondear(r.valorizado.cd.reduce((a, b) => a + b, 0))).toBe(r.pie.costoDirecto);
    expect(redondear(r.valorizado.total.reduce((a, b) => a + b, 0))).toBe(r.pie.total);
    expect(r.valorizado.acumuladoPct.at(-1)).toBe(100);
  });
  it('la fórmula polinómica cumple el D.S. 011-79-VC', () => {
    expect(r.polinomica.suma).toBe(1);
    expect(r.polinomica.monomios.length).toBeLessThanOrEqual(8);
    for (const m of r.polinomica.monomios) {
      expect(m.coeficiente).toBeGreaterThanOrEqual(0.05);
      expect(m.indices.length).toBeLessThanOrEqual(3);
    }
  });
  it('el calendario de materiales cuadra con la relación de insumos', () => {
    for (const f of r.adquisiciones) {
      const rel = r.insumos.items.find((i) => i.insumo.codigo === f.codigo)!;
      expect(Math.abs(f.valores.reduce((a, b) => a + b, 0) - rel.cantidad)).toBeLessThan(0.05);
    }
  });
  it('los desembolsos netos suman el total', () => {
    expect(r.desembolsos.at(-1)!.acumulado).toBe(r.pie.total);
  });
  it('genera XML de MS Project con todas las actividades', () => {
    const xml = generarMsProject(r);
    expect((xml.match(/<Summary>0<\/Summary>/g) ?? []).length).toBe(r.programa.actividades.length);
  });
});

describe('programación CPM', () => {
  it('respeta FC, CC y FF con desfases', () => {
    const p = proyectoEjemplo();
    const r = calcularTodo(p);
    const a = (c: string) => r.programa.actividades.find((x) => x.codigo === c)!;
    expect(a('01.03').es).toBe(a('01.01').ef); // FC
    expect(a('01.02').es).toBe(a('01.01').es + 2); // CC+2
    expect(a('04.05').ef).toBeGreaterThanOrEqual(a('04.04').ef + 2); // FF+2
  });
  it('detecta ciclos', () => {
    const p = proyectoEjemplo();
    p.programa['p0101'].predecesoras = [{ id: 'p0103', tipo: 'FC', desfase: 0 }];
    expect(regla(p, 14).estado).toBe('error');
  });
  it('interpreta predecesoras escritas como texto', () => {
    const m = new Map([['01.01', 'a'], ['03.02', 'b']]);
    const { preds, errores } = parsearPreds('01.01FC; 03.02CC+2, 9.9', m);
    expect(preds).toEqual([{ id: 'a', tipo: 'FC', desfase: 0 }, { id: 'b', tipo: 'CC', desfase: 2 }]);
    expect(errores.length).toBe(1);
  });
});

describe('las reglas detectan errores sembrados', () => {
  it('regla 2: partida sin APU', () => {
    const p = proyectoEjemplo();
    p.apus['p0302'].items = [];
    expect(regla(p, 2).estado).toBe('error');
  });
  it('regla 3: partida sin metrado', () => {
    const p = proyectoEjemplo();
    p.metrados = p.metrados.filter((m) => m.partidaId !== 'p0302');
    expect(regla(p, 3).estado).toBe('error');
  });
  it('regla 4: insumo duplicado o inexistente', () => {
    const p = proyectoEjemplo();
    p.insumos.push(clonar(p.insumos[0]));
    expect(regla(p, 4).estado).toBe('error');
    const q = proyectoEjemplo();
    q.apus['p0301'].items.push({ insumo: 'NOEXISTE', cantidad: 1 });
    expect(regla(q, 4).estado).toBe('error');
  });
  it('regla 7: gasto variable con duración distinta al plazo', () => {
    const p = proyectoEjemplo();
    p.gg[0].ligadoAlPlazo = false;
    p.gg[0].unidad = 'mes';
    p.gg[0].duracion = 12;
    expect(regla(p, 7).estado).toBe('advertencia');
  });
  it('regla 11: falta fecha base', () => {
    const p = proyectoEjemplo();
    p.meta.fechaBase = '';
    expect(regla(p, 11).estado).toBe('error');
  });
  it('regla 13: plazo escrito a mano en la memoria que no coincide', () => {
    const p = proyectoEjemplo();
    p.memoria.alcance += ' La obra se ejecutará en 90 días calendario.';
    expect(regla(p, 13).estado).toBe('error');
  });
  it('regla 15: entregable del TdR sin documento', () => {
    const p = proyectoEjemplo();
    p.tdr.entregables.push({ id: 'x', descripcion: 'Plan de manejo de residuos', documento: '', obligatorio: true });
    expect(regla(p, 15).estado).toBe('error');
  });
  it('regla 1: código sin título padre', () => {
    const p = proyectoEjemplo();
    p.partidas.push({ id: 'z', codigo: '09.01', descripcion: 'Huérfana', unidad: 'm2' });
    expect(regla(p, 1).estado).toBe('error');
  });
});

describe('plantilla de carga Excel', () => {
  it('exporta e importa sin perder el presupuesto', async () => {
    const p = proyectoEjemplo();
    const r1 = calcularTodo(p);
    const xlsx = await exportarPlantilla(p);
    const { proyecto, avisos } = await importarPlantilla(xlsx);
    const r2 = calcularTodo(proyecto);
    expect(avisos.filter((a) => !a.includes('vacía'))).toEqual([]);
    expect(r2.pie.total).toBe(r1.pie.total);
    expect(r2.programa.plazoDias).toBe(r1.programa.plazoDias);
    expect(r2.resumenValidacion.errores).toBe(0);
  });
});

describe('versión 2: formatos y configuración', () => {
  it('el parcial de metrados es el producto de las casillas llenas', () => {
    expect(parcialMetrado({ id: 'a', partidaId: 'x', descripcion: '', veces: 2, cantidad: 4, factor: 1, largo: 1, ancho: 1.3 })).toBeCloseTo(10.4, 9);
    expect(parcialMetrado({ id: 'a', partidaId: 'x', descripcion: '', veces: 1, factor: 1.25, volumen: 90 })).toBeCloseTo(112.5, 9);
    expect(parcialMetrado({ id: 'a', partidaId: 'x', descripcion: '' })).toBe(0);
  });
  it('cada APU puede tener su propia jornada', () => {
    const p = proyectoEjemplo();
    const id = 'p0103';
    const antes = calcularTodo(p).apus[id];
    p.apus[id].jornada = 10;
    const despues = calcularTodo(p).apus[id];
    const mo = (a: typeof antes) => a.items.find((i) => i.cuadrilla !== null)!.cantidad;
    expect(despues.jornada).toBe(10);
    expect(mo(despues)).toBeCloseTo(redondear((mo(antes) * 10) / 8, 4), 3);
  });
  it('sin IGV el total es el subtotal', () => {
    const p = proyectoEjemplo();
    p.meta.incluirIgv = false;
    const r = calcularTodo(p);
    expect(r.pie.igv).toBe(0);
    expect(r.pie.total).toBe(r.pie.subtotal);
  });
  it('los gastos financieros entran al total de gastos generales', () => {
    const p = proyectoEjemplo();
    const r = calcularTodo(p);
    expect(r.gg.financieros).toBeGreaterThan(0);
    expect(r.gg.total).toBeCloseTo(r.gg.variables + r.gg.fijos + r.gg.financieros, 2);
  });
  it('migra un proyecto de la versión 1 a entidades y responsables', () => {
    const v1 = clonar(proyectoEjemplo()) as unknown as Record<string, unknown>;
    const meta = v1.meta as Record<string, unknown>;
    meta.cliente = 'Cliente Uno';
    meta.empresa = 'Consultora Dos';
    meta.elaborador = 'Ing. Tres';
    delete v1.entidades;
    delete v1.responsables;
    const p = migrarProyecto(v1);
    expect(p.entidades.cliente.nombre).toBe('Cliente Uno');
    expect(p.entidades.proyectista.nombre).toBe('Consultora Dos');
    expect(p.responsables.elaboro.nombre).toBe('Ing. Tres');
    expect((p.meta as unknown as Record<string, unknown>).cliente).toBeUndefined();
  });
  it('normaliza los ítems numéricos de Excel', () => {
    expect(codigoItem(1)).toBe('01');
    expect(codigoItem(1.05)).toBe('01.05');
    expect(codigoItem('1.5.2.1')).toBe('01.05.02.01');
  });
});

describe('Excel con fórmulas vinculadas', () => {
  it('guarda fórmulas (no valores) con nombres definidos y su resultado', async () => {
    const r = calcularTodo(proyectoEjemplo());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await generarXlsx(r)).buffer as ArrayBuffer);
    const nombres = ['Datos', 'Resumen', 'Presupuesto', 'APU', 'Insumos', 'Metrados', 'Gastos generales', 'Fórmula polinómica', 'Cronograma', 'Valorizado', 'Adquisiciones', 'Controles'];
    for (const n of nombres) expect(wb.getWorksheet(n), n).toBeTruthy();
    let formulas = 0;
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { if (c.formula) formulas++; })));
    expect(formulas).toBeGreaterThan(500);
    // el costo directo del presupuesto es una fórmula con el valor del motor
    const pp = wb.getWorksheet('Presupuesto')!;
    let cd: ExcelJS.Cell | null = null;
    pp.eachRow((row) => { if (row.getCell(2).value === 'COSTO DIRECTO') cd = row.getCell(6); });
    expect(cd!.formula).toMatch(/SUBTOTAL\(9/);
    expect(cd!.result).toBe(r.pie.costoDirecto);
  });
  it('genera el Word de EETT con carátula, índice y encabezado', async () => {
    const r = calcularTodo(proyectoEjemplo());
    const datos = await generarDocx(especificacionesTecnicas(r), r);
    expect(datos.length).toBeGreaterThan(10000);
  });
});

describe('importación de expedientes', () => {
  it('importa el Excel que genera el programa y reproduce el costo directo', async () => {
    const r = calcularTodo(proyectoEjemplo());
    const res = await importarExpediente([{ nombre: 'ejemplo.xlsx', datos: await generarXlsx(r) }]);
    const r2 = calcularTodo(res.proyecto);
    expect(r2.hojas.length).toBe(r.hojas.length);
    expect(r2.pie.costoDirecto).toBeCloseTo(r.pie.costoDirecto, 2);
    expect(res.original.costoDirecto).toBeCloseTo(r.pie.costoDirecto, 2);
  });
});

describe('formato compacto', () => {
  it('ida y vuelta del proyecto de ejemplo conserva totales y plazo', async () => {
    const { escribirCompacto, leerCompacto } = await import('../src/io/compacto');
    const a = proyectoEjemplo();
    const txt = escribirCompacto(a);
    const { proyecto: b, avisos } = leerCompacto(txt);
    const ra = calcularTodo(a), rb = calcularTodo(b);
    expect(avisos.filter((x) => !/sin metrado|sin recursos/.test(x))).toEqual([]);
    expect(rb.pie.costoDirecto).toBeCloseTo(ra.pie.costoDirecto, 2);
    expect(rb.pie.total).toBeCloseTo(ra.pie.total, 2);
    expect(rb.programa.plazoDias).toBe(ra.programa.plazoDias);
    expect(txt.length).toBeLessThan(JSON.stringify(a).length / 5);
  });
  it('lee recursos, biblioteca, metrados en línea, encadenado y GG+', async () => {
    const { leerCompacto } = await import('../src/io/compacto');
    const { readFileSync } = await import('node:fs');
    const { proyecto: p, avisos } = leerCompacto(readFileSync('plantillas/Ejemplo_compacto.exp.txt', 'utf8'));
    expect(avisos).toEqual([]);
    const r = calcularTodo(p);
    const cod = (c: string) => p.partidas.find((x) => x.codigo === c)!.id;
    expect(r.metradoPorPartida[cod('02.01')]).toBeCloseTo(150, 4);
    expect(r.metradoPorPartida[cod('02.02')]).toBeCloseTo(187.5, 4);
    expect(r.metradoPorPartida[cod('01.01')]).toBe(1);
    const apu = p.apus[cod('03.02')];
    expect(apu.items).toEqual([{ insumo: 'MO02', cuadrilla: 1 }, { insumo: 'MO04', cuadrilla: 1 }, { insumo: 'MA40', cantidad: 0.1667 }, { insumo: 'EQ01', porcentaje: 3 }]);
    expect(p.programa[cod('03.01')].predecesoras[0]).toMatchObject({ id: cod('02.01'), tipo: 'CC', desfase: 3 });
    expect(p.programa[cod('02.02')].predecesoras[0]).toMatchObject({ id: cod('02.01'), tipo: 'FC' });
    expect(p.insumos.find((i) => i.codigo === 'MA05')!.precio).toBe(34.5);
    expect(p.gg.at(-1)!.descripcion).toBe('Ensayos de resistencia de concreto');
    expect(p.meta.jornadaHoras).toBe(8);
    expect(p.entidades.cliente.ruc).toBe('20000000002');
    expect(p.tdr.entregables).toHaveLength(4);
    expect(p.memoria.objetivo).toMatch(/escorrentía/);
    expect(r.resumenValidacion.errores).toBe(0);
    const extra = leerCompacto('# gg+\nfijo | Calidad | Ensayo extra | und | 2 | 1 | 50\n').proyecto.gg;
    expect(extra.length).toBe(proyectoEnBlanco().gg.length + 1);
  });
});

describe('Excel: cronograma vinculado', () => {
  it('el plazo, las fechas y la distribución por periodos son fórmulas encadenadas', async () => {
    const r = calcularTodo(proyectoEjemplo());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await generarXlsx(r)).buffer as ArrayBuffer);
    const fx = (ws: string, pred: (f: string) => boolean) => {
      let n = 0;
      wb.getWorksheet(ws)!.eachRow((row) => row.eachCell((c) => { const v = c.value as { formula?: string }; if (v && typeof v === 'object' && v.formula && pred(v.formula)) n++; }));
      return n;
    };
    expect(fx('Datos', (f) => f.includes('CAL_FECHA'))).toBe(1); // PLAZO_DIAS sale del cronograma
    expect(fx('Cronograma', (f) => f.includes('INDEX(CAL_FECHA'))).toBe(2 * r.hojas.length); // inicio y fin
    expect(fx('Distribución %', (f) => f.includes('CAL_ACUM') || f.includes('SUMIF'))).toBeGreaterThan(r.hojas.length);
    expect(fx('Personal', (f) => f.includes('CAL_ACUM'))).toBe(r.programa.periodos.length);
    expect(wb.getWorksheet('Calendario')!.state).toBe('hidden');
    expect(wb.definedNames.getRanges('FERIADOS').ranges.length).toBe(1);
  });
});
