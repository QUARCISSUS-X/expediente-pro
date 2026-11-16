// Versión 3.0 (etapa 7 del plan): migración de proyectos 2.x, carga con 2 000 partidas, proyecto de demostración con todos
// los enlaces, tema, recorrido inicial y guía de uso.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { proyectoDemostracion } from '../src/data/demostracion';
import { proyectoEjemplo } from '../src/data/proyectos';
import { controlDemostracion, normalizarControl, resumirCambios } from '../src/engine/control';
import { calcularTodo, recalcular } from '../src/engine/index';
import { datosInforme, documentoInforme, periodosConAvance } from '../src/engine/informe';
import { centroPendientes, restriccionesAutomaticas } from '../src/engine/integracion';
import type { Proyecto } from '../src/engine/types';
import { ESQUEMA_ACTUAL, migrarProyecto } from '../src/io/migrar';
import { NAV } from '../src/ui/modulos/registro';
import { PASOS_RECORRIDO } from '../src/ui/Recorrido';
import { siguienteTema } from '../src/ui/tema';

const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** El ejemplo tal como lo habría guardado cada versión 2.x (campos que esa versión no tenía, quitados). */
function comoVersion(v: '1.x' | '2.0-2.6' | '2.7-2.8' | '2.9-2.10'): Record<string, unknown> {
  const p = clonar(proyectoEjemplo()) as unknown as Record<string, unknown>;
  p.control = controlDemostracion(calcularTodo(proyectoEjemplo()));
  const c = p.control as Record<string, unknown>;
  delete c.plantillasInforme; // 2.11
  delete c.adjuntos;
  if (v === '2.9-2.10') return { ...p, esquema: 4 };
  delete p.escenarios;
  delete p.subpresupuestos;
  delete p.subpartidas;
  if (v === '2.7-2.8') return { ...p, esquema: 3 };
  delete p.esquema;
  delete p.bitacora;
  if (v === '2.0-2.6') return p;
  // 1.x: sin entidades ni responsables; cliente y empresa dentro de meta
  const e = p.entidades as { cliente: { nombre: string }; proyectista: { nombre: string } };
  p.meta = { ...(p.meta as object), cliente: e.cliente.nombre, empresa: e.proyectista.nombre };
  delete p.entidades;
  delete p.responsables;
  return p;
}

describe('migración de proyectos 2.x', () => {
  const total = calcularTodo(proyectoEjemplo()).pie.total;
  for (const v of ['1.x', '2.0-2.6', '2.7-2.8', '2.9-2.10'] as const) {
    it(`un proyecto de la versión ${v} abre con el mismo total y el control completo`, () => {
      const viejo = comoVersion(v);
      const p = migrarProyecto(JSON.parse(JSON.stringify(viejo)));
      expect(p.esquema).toBe(ESQUEMA_ACTUAL);
      expect(calcularTodo(p).pie.total).toBe(total);
      const c = normalizarControl(p.control);
      expect(c.adjuntos).toEqual([]);
      expect(c.plantillasInforme).toEqual([]);
      expect(c.cortes.length).toBeGreaterThan(0);
      if (v === '1.x') expect(p.entidades.cliente.nombre).toBe(proyectoEjemplo().entidades.cliente.nombre);
    });
  }
});

describe('carga con 2 000 partidas', () => {
  function grande(n: number): Proyecto {
    const p = proyectoEjemplo();
    const hojas = p.partidas.filter((x) => !x.titulo);
    const partidas: Proyecto['partidas'] = [{ id: 't-g', codigo: '01', descripcion: 'PARTIDAS DE PRUEBA', unidad: '', titulo: true }];
    const apus: Proyecto['apus'] = {};
    const metrados: Proyecto['metrados'] = [];
    for (let i = 0; i < n; i++) {
      const h = hojas[i % hojas.length];
      const id = `g-${i}`;
      partidas.push({ ...h, id, codigo: `01.${String(i + 1).padStart(4, '0')}` });
      apus[id] = p.apus[h.id];
      metrados.push({ id: `mg-${i}`, partidaId: id, descripcion: 'Prueba', cantidad: 1 + (i % 7) });
    }
    return { ...p, partidas, apus, metrados, programa: {} };
  }

  it('calcula y recalcula un metrado en tiempos de uso normal', () => {
    const p = grande(2000);
    let t = performance.now();
    const r = calcularTodo(p);
    const completo = performance.now() - t;
    expect(r.hojas.length).toBe(2000);
    expect(r.pie.total).toBeGreaterThan(0);
    const q = { ...p, metrados: p.metrados.map((m, i) => (i === 10 ? { ...m, cantidad: 99 } : m)) };
    t = performance.now();
    const r2 = recalcular(q, r);
    const parcial = performance.now() - t;
    expect(r2.pie.costoDirecto).not.toBe(r.pie.costoDirecto);
    expect(completo).toBeLessThan(15000);
    expect(parcial).toBeLessThan(completo + 50);
  }, 60000);
});

describe('proyecto de demostración', () => {
  it('muestra los enlaces: contractual y vigente, cambio con partidas, consulta que restringe, plantilla de informe', () => {
    const p = proyectoDemostracion();
    const r = calcularTodo(p);
    const c = normalizarControl(p.control);
    expect(p.escenarios?.map((e) => e.tipo)).toEqual(['oferta', 'contractual']);
    expect(resumirCambios(r, c).origenContractual).toBe('version');
    expect(c.cambios.some((x) => x.estado === 'propuesto' && x.partidas?.length)).toBe(true);
    expect(restriccionesAutomaticas(r, c, '2026-11-15').some((x) => x.origen === 'rfi')).toBe(true);
    expect(c.plantillasInforme.length).toBe(1);
    expect(centroPendientes(r, '2026-11-15').length).toBeGreaterThan(0);
    const d = datosInforme(r, periodosConAvance(r, 'mensual')[0]);
    const doc = documentoInforme(r, d, { plantilla: c.plantillasInforme[0] });
    expect(doc.bloques.filter((b) => b.t === 'h1').length).toBe(c.plantillasInforme[0].secciones.filter((s) => s !== 'firmas').length);
  });
});

describe('experiencia de uso', () => {
  it('el tema rota entre automático, oscuro y claro, y los estilos tienen tema oscuro e impresión', () => {
    expect(siguienteTema('auto')).toBe('oscuro');
    expect(siguienteTema('oscuro')).toBe('claro');
    expect(siguienteTema('claro')).toBe('auto');
    const css = readFileSync('src/ui/estilos.css', 'utf8');
    expect(css).toContain(":root[data-tema='oscuro']");
    expect(css).toContain('prefers-color-scheme: dark');
    expect(css).toContain('@media print');
    // las superficies usan variables (el tema oscuro las cambia)
    expect((css.slice(0, css.indexOf('@media print')).match(/background: #fff;/g) ?? []).length).toBe(0);
  });

  it('el recorrido inicial pasa por módulos que existen', () => {
    const ids = new Set(NAV.flatMap((g) => g.items.map((i) => i.id)));
    for (const p of PASOS_RECORRIDO) expect(ids.has(p.modulo)).toBe(true);
  });

  it('la guía de uso está organizada por flujo de trabajo', () => {
    const g = readFileSync('docs/guia.html', 'utf8');
    for (const t of ['Flujo A · Cotizar', 'Flujo B · Armar un expediente', 'Flujo C · Controlar la obra', 'Flujo D · Mantener el banco', 'informe-obra']) expect(g).toContain(t);
  });
});
