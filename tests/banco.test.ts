// Versión 2.8 (etapa 2 del plan 3.0): banco de datos, sus formatos de intercambio, la fusión y el uso desde el proyecto.
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { proyectoEjemplo } from '../src/data/proyectos';
import {
  aplicarPrecios, type Banco, bancoDesdeProyecto, bancoInicial, bancoVacio, compararBancos, compararPrecios, completarInsumos, fusionarBancos, historialPrecio,
  normalizarBanco, ordenarBanco, precioVigente, resumenBanco,
} from '../src/engine/banco';
import { calcularTodo } from '../src/engine/index';
import { redondear } from '../src/engine/util';
import { generarXlsx } from '../src/export/xlsx';
import { bancoDeListaPrecios, escribirEpdb, exportarBancoCsv, exportarBancoXlsx, leerArchivoBanco, leerCsv, leerEpdb, leerRenglones, textoRenglones } from '../src/io/banco';

const OP = { fecha: '2026-11-01', lugar: 'Lima', fuente: 'revista' as const, referencia: 'Revista de prueba' };
const ejemplo = (): Banco => {
  const b = bancoInicial();
  b.proveedores.push({ ruc: '20123456789', razonSocial: 'Ferretería Andina S.A.C.', contacto: 'Ana Pérez', rubros: ['Cemento', 'Acero'], cotizaciones: [{ fecha: '2026-10-20', referencia: 'COT-15', insumos: ['MA01'] }] });
  b.precios.push({ insumo: 'MA01', precio: 27.1, moneda: 'S/', fecha: '2026-11-05', lugar: 'Cusco', fuente: 'cotizacion', referencia: 'COT-15', proveedorRuc: '20123456789', vigenciaDias: 30 });
  return ordenarBanco(b);
};

describe('banco de datos: formatos', () => {
  it('exportar a .epdb, borrar e importar lo deja idéntico', async () => {
    const b = ejemplo();
    const datos = await escribirEpdb({ banco: b });
    const vacio = bancoVacio();
    const leido = await leerEpdb(datos);
    expect(leido.manifiesto.conteos).toEqual(resumenBanco(b));
    const c = compararBancos(vacio, leido.banco);
    expect(fusionarBancos(vacio, c)).toEqual(b);
  });
  it('un .epdb alterado se rechaza por su suma de comprobación', async () => {
    const zip = await JSZip.loadAsync(await escribirEpdb({ banco: ejemplo() }));
    const precios = JSON.parse(await zip.file('banco/precios.json')!.async('string'));
    precios[0].precio += 1;
    zip.file('banco/precios.json', JSON.stringify(precios));
    await expect(leerEpdb(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/suma de comprobación de Precios/);
  });
  it('el Excel del banco se vuelve a importar igual', async () => {
    const b = ejemplo();
    const r = await leerArchivoBanco({ nombre: 'banco.xlsx', datos: await exportarBancoXlsx(b) }, OP);
    expect(r.origen).toMatch(/Banco de datos en Excel/);
    expect(r.banco).toEqual(b);
  });
  it('cada CSV se vuelve a importar igual', async () => {
    const b = ejemplo();
    let x = bancoVacio();
    for (const f of exportarBancoCsv(b)) {
      const r = await leerArchivoBanco({ nombre: f.nombre, datos: new TextEncoder().encode(f.texto) }, OP);
      x = fusionarBancos(x, compararBancos(x, r.banco));
    }
    expect(x).toEqual(b);
    expect(leerCsv('a;"b;c";"d ""e"""\r\n1;2;3\n')).toEqual([['a', 'b;c', 'd "e"'], ['1', '2', '3']]);
  });
  it('los renglones de un APU pasan a texto y vuelven', () => {
    const items = proyectoEjemplo().apus[proyectoEjemplo().partidas.find((p) => !p.titulo)!.id].items;
    expect(leerRenglones(textoRenglones(items))).toEqual(items.map((i) => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== null && v !== undefined))));
  });
});

describe('banco de datos: fusión', () => {
  it('importar dos veces el mismo archivo no duplica', async () => {
    const datos = await escribirEpdb({ banco: ejemplo() });
    let b = bancoVacio();
    for (let i = 0; i < 2; i++) b = fusionarBancos(b, compararBancos(b, (await leerEpdb(datos)).banco));
    expect(b).toEqual(ejemplo());
    const c = compararBancos(b, (await leerEpdb(datos)).banco);
    expect(c.conteo).toEqual({ nuevo: 0, igual: c.filas.length, conflicto: 0 });
  });
  it('en conflicto gana lo más reciente por defecto y se respeta lo elegido', () => {
    const a = normalizarBanco({ insumos: [{ codigo: 'X1', descripcion: 'Viejo', unidad: 'und', tipo: 'MAT', iu: '39', actualizado: '2026-01-01' }, { codigo: 'X2', descripcion: 'Dos', unidad: 'und', tipo: 'MAT', iu: '39' }] });
    const e = normalizarBanco({ insumos: [{ codigo: 'X1', descripcion: 'Nuevo', unidad: 'und', tipo: 'MAT', iu: '39', actualizado: '2026-06-01' }, { codigo: 'X2', descripcion: 'Dos bis', unidad: 'und', tipo: 'MAT', iu: '39' }, { codigo: 'X3', descripcion: 'Tres', unidad: 'und', tipo: 'MAT', iu: '39' }] });
    const c = compararBancos(a, e);
    expect(c.conteo).toEqual({ nuevo: 1, igual: 0, conflicto: 2 });
    expect(fusionarBancos(a, c).insumos.map((i) => i.descripcion)).toEqual(['Nuevo', 'Dos', 'Tres']); // X2 sin fechas: se conserva
    const b = fusionarBancos(a, c, { 'insumos:X1': 'conservar', 'insumos:X2': 'ambos' });
    expect(b.insumos.map((i) => `${i.codigo} ${i.descripcion}`)).toEqual(['X1 Viejo', 'X2 Dos', 'X2-2 Dos bis', 'X3 Tres']);
    expect(a.insumos.length).toBe(2); // el banco actual no se toca
  });
});

describe('banco de datos: precios', () => {
  it('elige el precio vigente a la fecha y el lugar', () => {
    const b = ejemplo();
    b.precios.push({ insumo: 'MA01', precio: 26, moneda: 'S/', fecha: '2026-12-01', lugar: 'Lima', fuente: 'revista' });
    expect(precioVigente(b, 'MA01', '2026-11-10', 'Cusco')!.precio).toBe(27.1);
    expect(precioVigente(b, 'MA01', '2026-11-10', 'Lima')!.precio).toBe(25.5);
    expect(precioVigente(b, 'MA01', '2026-12-31', 'Lima')!.precio).toBe(26);
    expect(precioVigente(b, 'MA01', '2026-11-10', 'Piura')!.precio).toBe(27.1); // sin precios del lugar: el más reciente de cualquiera
    expect(precioVigente(b, 'MA01', '2025-01-01')).toBeNull();
    expect(historialPrecio(b, 'MA01').map((p) => p.fecha)).toEqual(['2026-12-01', '2026-11-05', '2026-10-01']);
  });
  it('actualizar precios desde el banco conserva 0 diferencias entre el Excel y el motor', async () => {
    const p = proyectoEjemplo();
    const r0 = calcularTodo(p);
    const b = ejemplo();
    for (const i of p.insumos.slice(0, 12)) b.precios.push({ insumo: i.codigo, precio: redondear(i.precio * 1.0837, 4), moneda: 'S/', fecha: '2026-11-01', lugar: 'Lima', fuente: 'revista', referencia: 'Costos nov-2026' });
    const cant = new Map(r0.insumos.items.map((x) => [x.insumo.codigo, x.cantidad]));
    const dif = compararPrecios(p, cant, b, '2026-11-30', 'Lima');
    expect(dif.length).toBeGreaterThan(5);
    expect(aplicarPrecios(p, dif)).toBe(dif.length);
    expect(p.insumos[0].fuente).toMatch(/Revista: Costos nov-2026 \(Lima\)/);
    const r = calcularTodo(p);
    expect(r.pie.costoDirecto).not.toBe(r0.pie.costoDirecto);
    for (const f of r.hojas) expect(f.parcial).toBe(redondear(f.metrado * f.pu, 2));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await generarXlsx(r)).buffer as ArrayBuffer);
    let cd: number | undefined;
    wb.getWorksheet('Presupuesto')!.eachRow((row) => { if (row.getCell(2).value === 'COSTO DIRECTO') cd = (row.getCell(6).value as { result: number }).result; });
    expect(cd).toBe(r.pie.costoDirecto);
    expect(compararPrecios(p, cant, b, '2026-11-30', 'Lima')).toEqual([]);
  }, 30_000);
});

describe('banco de datos: proyecto y fuentes externas', () => {
  it('enviar un proyecto al banco lleva sus insumos, precios y análisis, y vuelve a servir para armar partidas', () => {
    const p = proyectoEjemplo();
    const b = bancoDesdeProyecto(p, { lugar: 'Cusco', fecha: '2026-11-01', referencia: 'Obra de prueba', ahora: '2026-11-12T00:00:00Z' });
    expect(b.insumos.length).toBe(p.insumos.length);
    expect(b.analisis.length).toBe(p.partidas.filter((x) => !x.titulo && p.apus[x.id]?.items.length).length);
    expect(b.precios.every((x) => x.fuente === 'proyecto' && x.lugar === 'Cusco')).toBe(true);
    const q = proyectoEjemplo();
    q.insumos = q.insumos.filter((i) => i.codigo !== b.analisis[0].items[0].insumo);
    const { agregados, faltan } = completarInsumos(q, b, b.analisis[0], '2026-12-01', 'Cusco');
    expect(agregados).toEqual([b.analisis[0].items[0].insumo]);
    expect(faltan).toEqual([]);
  });
  it('lee una lista de precios sin códigos con un código estable', () => {
    const filas = [['Lista de precios noviembre'], ['Descripción', 'Und.', 'Precio S/'], ['Cemento portland tipo I', 'bls', '27.90'], ['Fierro corrugado 1/2"', 'var', '1,234.50'], ['Sin precio', 'und', '—']];
    const r = bancoDeListaPrecios(filas, OP);
    expect(r.banco.precios.map((x) => x.precio).sort()).toEqual([1234.5, 27.9]);
    expect(r.banco.insumos.every((i) => /^L[0-9A-F]{6}$/.test(i.codigo))).toBe(true);
    expect(bancoDeListaPrecios(filas, OP).banco).toEqual(r.banco);
    expect(r.avisos.length).toBe(2);
  });
  it('lee el expediente de otro programa exportado a Excel como análisis y precios', async () => {
    const r = await leerArchivoBanco({ nombre: 'ejemplo.xlsx', datos: await generarXlsx(calcularTodo(proyectoEjemplo())) }, OP);
    expect(r.origen).toMatch(/^Expediente/);
    expect(r.banco.analisis.length).toBeGreaterThan(10);
    expect(r.banco.precios.length).toBeGreaterThan(10);
  }, 30_000);
});
