// Versión 2.11 (etapa 5 del plan 3.0): informes de obra, constructor de reportes, plantillas de Word propias,
// Excel de control con fórmulas, portafolio y fotos y adjuntos guardados aparte.
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { describe, expect, it } from 'vitest';
import { proyectoEjemplo } from '../src/data/proyectos';
import { calcularTablero, controlDemostracion, normalizarControl } from '../src/engine/control';
import { calcularTodo } from '../src/engine/index';
import { datosInforme, documentoInforme, periodoDe, periodosConAvance, plantillaInicial, SECCIONES_INFORME, variablesInforme } from '../src/engine/informe';
import { filaPortafolio, resumenPortafolio } from '../src/engine/portafolio';
import type { Proyecto } from '../src/engine/types';
import { generarXlsxControl } from '../src/export/control';
import { informePdf, informeWord, llenarPlantillaWord } from '../src/export/informeObra';
import { xlsxPortafolio } from '../src/export/portafolio';
import { renderPdfNode } from '../src/export/render-node';

function demo(): Proyecto {
  const p = proyectoEjemplo();
  p.control = controlDemostracion(calcularTodo(p));
  return p;
}

describe('informes de obra', () => {
  it('el informe mensual de la demostración sale completo y sus cifras coinciden con el tablero', async () => {
    const p = demo();
    const r = calcularTodo(p);
    const meses = periodosConAvance(r, 'mensual');
    expect(meses.length).toBeGreaterThan(0);
    const d = datosInforme(r, meses[0]); // el mes del último corte
    const t = calcularTablero(r, normalizarControl(p.control));
    expect(d.tablero.avanceReal).toBeCloseTo(t.avanceReal!, 6);
    expect(d.tablero.avanceProgramado).toBeCloseTo(t.avanceProgramado!, 6);
    expect(d.tablero.spi).toBeCloseTo(t.spi!, 6);
    expect(d.tablero.cpi).toBeCloseTo(t.cpi!, 6);
    expect(d.tablero.eac).toBe(t.eac);
    expect(d.tablero.ultimoCorte).toBe(t.ultimoCorte);
    expect(d.partidas.length).toBeGreaterThan(0);
    expect(d.avancePeriodoReal).toBeGreaterThan(0);
    expect(d.valorizacion).not.toBeNull();
    // el monto del periodo es la suma de las partidas
    expect(d.partidas.reduce((s, x) => s + x.montoPeriodo, 0)).toBeCloseTo(d.montoPeriodo, 0);
    const doc = documentoInforme(r, d);
    const titulos = doc.bloques.filter((b) => b.t === 'h1').map((b) => (b as { texto: string }).texto);
    expect(titulos.length).toBe(SECCIONES_INFORME.filter((s) => s.id !== 'firmas').length);
    const textos = JSON.stringify(doc.bloques);
    for (const vacio of ['Sin línea base', 'No hay valorización', 'Sin cortes de avance', 'Sin metrados ejecutados', 'Sin plan semanal']) expect(textos).not.toContain(vacio);
    expect(doc.bloques.some((b) => b.t === 'curva')).toBe(true);
    // Word y PDF
    const word = await informeWord(r, d);
    const xml = await (await JSZip.loadAsync(word)).file('word/document.xml')!.async('string');
    expect(xml).toContain('Valor ganado');
    const pdf = await renderPdfNode(informePdf(r, d));
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  }, 60000);

  it('el semanal toma solo su semana y el constructor respeta secciones, orden y logos', () => {
    const p = demo();
    const r = calcularTodo(p);
    const semana = periodosConAvance(r, 'semanal')[1];
    expect(semana.fin).toBe(periodoDe('semanal', semana.inicio).fin);
    const d = datosInforme(r, semana);
    expect(d.cortes.every((k) => k.fecha <= semana.fin)).toBe(true);
    const pl = { ...plantillaInicial('semanal'), secciones: ['evm', 'resumen'] as const as ('evm' | 'resumen')[], logoCliente: false };
    const doc = documentoInforme(r, d, { plantilla: pl });
    const h = doc.bloques.filter((b) => b.t === 'h1').map((b) => (b as { texto: string }).texto);
    expect(h).toEqual(['Valor ganado', 'Resumen del periodo']);
  });

  it('llena una plantilla de Word propia aunque Word parta los marcadores en varios fragmentos', async () => {
    const p = demo();
    const r = calcularTodo(p);
    const d = datosInforme(r, periodosConAvance(r, 'mensual')[0]);
    const vars = variablesInforme(r, d, '2026-11-15');
    const plantilla = new Document({ sections: [{ children: [
      new Paragraph({ children: [new TextRun('Avance real: {{avan'), new TextRun({ text: 'ce_real}} al ', bold: true }), new TextRun('{{fecha_fin}}')] }),
      new Paragraph({ children: [new TextRun('Partidas: {{partidas_periodo}} y {{no_existe}}')] }),
    ] }] });
    const bytes = new Uint8Array(await Packer.toArrayBuffer(plantilla));
    const { datos, faltantes } = await llenarPlantillaWord(bytes, vars);
    const xml = await (await JSZip.loadAsync(datos)).file('word/document.xml')!.async('string');
    expect(xml).toContain(vars.avance_real.replace(' %', ''));
    expect(xml).toContain(vars.fecha_fin);
    expect(xml).not.toContain('{{avan');
    expect(xml).toContain('<w:br/>'); // varias partidas, una por línea
    expect(faltantes).toEqual(['no_existe']);
  });
});

describe('Excel de control con fórmulas vinculadas', () => {
  it('valor ganado y valorizaciones llevan fórmulas con el resultado del programa', async () => {
    const p = demo();
    const r = calcularTodo(p);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await generarXlsxControl(r, normalizarControl(p.control))) as unknown as ArrayBuffer);
    const evm = wb.getWorksheet('Valor ganado')!;
    const sv = evm.getCell('H6').value as { formula: string; result: number };
    expect(sv.formula).toBe('ROUND(D6-C6,2)');
    expect(sv.result).toBeCloseTo(Number(evm.getCell('D6').value) - Number(evm.getCell('C6').value), 1);
    expect((evm.getCell('J7').value as { formula: string }).formula).toContain('D7/C7');
    const val = wb.getWorksheet('Valorizaciones')!;
    const v = val.getCell('F6').value as { formula: string; result: number };
    expect(v.formula).toBe('ROUND(C6+D6+E6,2)');
    expect(v.result).toBeCloseTo(Number(val.getCell('C6').value) + Number(val.getCell('D6').value) + Number(val.getCell('E6').value), 2);
    expect((val.getCell('N7').value as { formula: string }).formula).toBe('SUM(F$6:F7)');
  });
});

describe('portafolio', () => {
  it('reúne los proyectos con su semáforo, alertas y resumen ponderado', async () => {
    const a = demo();
    const b = proyectoEjemplo(); // sin control
    const fa = filaPortafolio('a', calcularTodo(a), '2027-06-30');
    const fb = filaPortafolio('b', calcularTodo(b), '2027-06-30');
    expect(fa.semaforo).not.toBe('sin control');
    expect(fa.spi).not.toBeNull();
    expect(fb.semaforo).toBe('sin control');
    const res = resumenPortafolio([fa, fb]);
    expect(res.proyectos).toBe(2);
    expect(res.conControl).toBe(1);
    expect(res.porMoneda[0].monto).toBeCloseTo(fa.monto + fb.monto, 2);
    expect(res.avancePonderado).toBeCloseTo(fa.avanceReal!, 6); // solo el que tiene control pesa
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await xlsxPortafolio([fa, fb])) as unknown as ArrayBuffer);
    expect(wb.getWorksheet('Portafolio')!.getCell('B6').value).toBe(fa.nombre);
  });
});

describe('fotos y adjuntos', () => {
  it('el proyecto solo guarda la referencia y un control viejo abre sin los campos nuevos', () => {
    const viejo = normalizarControl({ cortes: [] });
    expect(viejo.adjuntos).toEqual([]);
    expect(viejo.plantillasInforme).toEqual([]);
    const p = demo();
    p.control!.adjuntos = [{ id: 'adj-1', nombre: 'vaciado.jpg', tipo: 'image/jpeg', tamano: 120000, fecha: p.control!.cortes[p.control!.cortes.length - 1].fecha, descripcion: 'Vaciado de zapatas' }];
    const r = calcularTodo(p);
    const d = datosInforme(r, periodosConAvance(r, 'mensual')[0]);
    expect(d.fotos.map((x) => x.id)).toEqual(['adj-1']);
    expect(JSON.stringify(p.control!.adjuntos)).not.toContain('data:'); // sin la imagen dentro del proyecto
    // con la imagen leída del almacén, sale en el panel fotográfico
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const doc = documentoInforme(r, d, { imagenes: { 'adj-1': { dataUrl: png, ancho: 1, alto: 1 } } });
    expect(doc.bloques.some((b) => b.t === 'imagen' && b.pie?.includes('Vaciado de zapatas'))).toBe(true);
  });
});
