// Versión 2.7 (etapa 1 del plan 3.0): esquema y migraciones, estructura del archivo, bitácora, cronograma incremental y registro de exportadores.
import { readdirSync } from 'node:fs';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { proyectoEjemplo } from '../src/data/proyectos';
import { controlDemostracion } from '../src/engine/control';
import { anotarBitacora, bitacoraEntre, MAX_BITACORA } from '../src/engine/bitacora';
import { calcularTodo, recalcular } from '../src/engine/index';
import type { Proyecto } from '../src/engine/types';
import { EXPORTADORES, generarTodos, NOMBRE_EXPORT } from '../src/export/registro';
import { renderPdfNode } from '../src/export/render-node';
import { ErrorEstructura, leerJson, revisarEstructura } from '../src/io/estructura';
import { ESQUEMA_ACTUAL, MIGRACIONES, esquemaDe } from '../src/io/migraciones';
import { conEsquema, esSoloLectura, migrarProyecto } from '../src/io/migrar';

const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const cifras = (p: Proyecto) => {
  const r = calcularTodo(p);
  return { pie: r.pie, plazo: r.programa.plazoDias, filas: r.filas.map((f) => [f.partida.codigo, f.metrado, f.pu, f.parcial]), val: r.validacion.map((v) => v.estado) };
};

describe('esquema versionado y migraciones', () => {
  it('las migraciones están numeradas en orden, una por archivo', () => {
    expect(MIGRACIONES.map((m) => m.desde)).toEqual(MIGRACIONES.map((_, i) => i + 1));
    const archivos = readdirSync(new URL('../src/io/migraciones', import.meta.url)).filter((f) => /^\d\d-/.test(f)).sort();
    expect(archivos.map((f) => +f.slice(0, 2))).toEqual(MIGRACIONES.map((m) => m.desde));
    expect(ESQUEMA_ACTUAL).toBe(4);
  });
  it('un proyecto de 2.0 a 2.6 abre igual y queda en el esquema actual', () => {
    const viejo = clonar(proyectoEjemplo()) as unknown as Record<string, unknown>;
    delete viejo.esquema;
    delete viejo.bitacora;
    viejo.control = clonar(controlDemostracion(calcularTodo(proyectoEjemplo())));
    expect(esquemaDe(viejo)).toBe(2);
    const p = migrarProyecto(viejo);
    expect(p.esquema).toBe(ESQUEMA_ACTUAL);
    expect(p.bitacora).toEqual([]);
    expect(cifras(p)).toEqual(cifras(proyectoEjemplo()));
    expect(p.control!.cortes.length).toBe((viejo.control as { cortes: unknown[] }).cortes.length);
    expect(esSoloLectura(p)).toBe(false);
  });
  it('un proyecto de la versión 1 pasa por las dos migraciones', () => {
    const v1 = clonar(proyectoEjemplo()) as unknown as Record<string, unknown>;
    (v1.meta as Record<string, unknown>).cliente = 'Cliente Uno';
    delete v1.entidades;
    delete v1.responsables;
    expect(esquemaDe(v1)).toBe(1);
    const p = migrarProyecto(v1);
    expect(p.entidades.cliente.nombre).toBe('Cliente Uno');
    expect(p.esquema).toBe(ESQUEMA_ACTUAL);
    expect(cifras(p)).toEqual(cifras(proyectoEjemplo()));
  });
  it('un proyecto de un esquema más nuevo se abre solo para leer y conserva su número', () => {
    const p = migrarProyecto({ ...clonar(proyectoEjemplo()), esquema: ESQUEMA_ACTUAL + 4 });
    expect(p.esquema).toBe(ESQUEMA_ACTUAL + 4);
    expect(esSoloLectura(p)).toBe(true);
    expect(conEsquema(p).esquema).toBe(ESQUEMA_ACTUAL + 4);
    expect(conEsquema(proyectoEjemplo()).esquema).toBe(ESQUEMA_ACTUAL);
  });
  it('migrar dos veces da lo mismo', () => {
    const una = migrarProyecto(clonar(proyectoEjemplo()));
    expect(migrarProyecto(clonar(una))).toEqual(una);
  });
});

describe('estructura del archivo al importar', () => {
  it('acepta un proyecto y rechaza archivos ajenos con un mensaje claro', () => {
    expect(revisarEstructura(clonar(proyectoEjemplo()))).toEqual([]);
    expect(revisarEstructura([1, 2])[0]).toMatch(/lista/);
    expect(revisarEstructura({ formato: 'expediente-pro-respaldo', proyectos: [] })[0]).toMatch(/Restaurar respaldo/);
    expect(revisarEstructura({ meta: {} })).toContain('Falta la lista de partidas.');
    expect(revisarEstructura({ meta: {}, partidas: [{ id: 'x' }], insumos: 'no' })).toEqual(['1 partida(s) sin identificador o sin código.', '«insumos» debería ser una lista.']);
    expect(() => migrarProyecto({ hola: 1 })).toThrow(ErrorEstructura);
    expect(() => migrarProyecto(null)).toThrow(/no es un proyecto de Expediente Pro/);
  });
  it('distingue un archivo truncado de uno que no es JSON', () => {
    const t = JSON.stringify(proyectoEjemplo());
    expect(() => leerJson(t.slice(0, 300), 'obra.json')).toThrow(/obra\.json está incompleto/);
    expect(() => leerJson('hola', 'x.json')).toThrow(/no es un archivo JSON/);
    expect(() => leerJson('  ')).toThrow(/vacío/);
    expect(leerJson('﻿' + t)).toEqual(JSON.parse(t));
  });
});

describe('bitácora de cambios', () => {
  it('junta ediciones seguidas con la misma etiqueta y guarda las últimas 500', () => {
    const p: Pick<Proyecto, 'bitacora'> = {};
    const t0 = new Date('2026-11-12T10:00:00Z');
    anotarBitacora(p, 'Metrado de 02.03', t0);
    anotarBitacora(p, 'Metrado de 02.03', new Date(t0.getTime() + 60_000));
    anotarBitacora(p, 'Precio de cemento', new Date(t0.getTime() + 90_000));
    anotarBitacora(p, 'Metrado de 02.03', new Date(t0.getTime() + 600_000));
    expect(p.bitacora!.map((e) => [e.texto, e.veces ?? 1])).toEqual([['Metrado de 02.03', 2], ['Precio de cemento', 1], ['Metrado de 02.03', 1]]);
    for (let i = 0; i < 600; i++) anotarBitacora(p, `Cambio ${i}`, new Date(t0.getTime() + 1e6 + i * 1000));
    expect(p.bitacora!.length).toBe(MAX_BITACORA);
    expect(p.bitacora![MAX_BITACORA - 1].texto).toBe('Cambio 599');
    expect(bitacoraEntre(p)[0].texto).toBe('Cambio 599');
    expect(bitacoraEntre(p, '2030-01-01')).toEqual([]);
  });
  it('anotar en la bitácora no recalcula el presupuesto', () => {
    const p = produce(proyectoEjemplo(), () => {});
    const r = recalcular(p, null);
    const p2 = produce(p, (d) => anotarBitacora(d, 'Nota'));
    expect(recalcular(p2, r).filas).toBe(r.filas);
  });
});

describe('cronograma incremental', () => {
  it('da lo mismo que el cálculo completo al cambiar precios, duraciones, precedencias y calendario', () => {
    let p: Proyecto = produce(proyectoEjemplo(), () => {});
    let r = recalcular(p, null);
    const hojas = p.partidas.filter((x) => !x.titulo);
    const prog = (q: Proyecto) => { const x = calcularTodo(clonar(q)).programa; return { act: x.actividades, periodos: x.periodos, dias: x.diaFecha, plazo: x.plazoDias, errores: x.errores }; };
    const ediciones: ((d: Proyecto) => void)[] = [
      (d) => { d.insumos[2].precio += 5; }, // no cambia duraciones: reutiliza la red
      (d) => { d.programa[hojas[4].id] = { ...(d.programa[hojas[4].id] ?? { predecesoras: [] }), duracionManual: 9 }; },
      (d) => { d.programa[hojas[6].id] = { ...(d.programa[hojas[6].id] ?? { predecesoras: [] }), predecesoras: [{ id: hojas[1].id, tipo: 'CC', desfase: 2 }] }; },
      (d) => { d.meta.feriados.push('2026-10-15'); },
      (d) => { d.meta.fechaInicio = '2026-10-05'; },
      (d) => { d.metrados[0].largo = (d.metrados[0].largo ?? 0) + 40; },
    ];
    for (const e of ediciones) {
      p = produce(p, e);
      r = recalcular(p, r);
      const x = r.programa;
      expect({ act: x.actividades, periodos: x.periodos, dias: x.diaFecha, plazo: x.plazoDias, errores: x.errores }).toEqual(prog(p));
    }
  });
});

describe('registro de exportadores', () => {
  it('cada entregable tiene un tipo único y su nombre', () => {
    const tipos = EXPORTADORES.map((e) => e.tipo);
    expect(new Set(tipos).size).toBe(tipos.length);
    for (const t of tipos) expect(NOMBRE_EXPORT[t]).toBeTruthy();
  });
  it('el ZIP lleva los mismos archivos y en el mismo orden que la versión 2.6', async () => {
    const r = calcularTodo(proyectoEjemplo());
    const archivos = await generarTodos(r, renderPdfNode);
    expect(archivos.map((a) => a.nombre.replace(/^EXP-DEMO-01_?/, ''))).toEqual([
      'Presupuesto_y_cronogramas.xlsx', 'Especificaciones_tecnicas.docx', 'Memoria_descriptiva.docx', 'Carta_de_presentacion.docx', 'Matriz_cumplimiento_TdR.docx',
      'Reporte_de_consistencia.docx', 'Programa_MSProject.xml', 'Expediente_consolidado.pdf', 'Informe_ejecutivo.pdf', 'Reporte_gerencial.xlsx', '.expediente.json',
    ]);
    expect(JSON.parse(new TextDecoder().decode(archivos[archivos.length - 1].datos)).esquema).toBe(ESQUEMA_ACTUAL);
  }, 60_000);
});
