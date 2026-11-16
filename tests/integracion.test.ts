// Versión 2.10 (etapa 4 del plan 3.0): integración de apartados — un dato se registra una vez y los demás módulos lo leen.
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { proyectoEjemplo } from '../src/data/proyectos';
import { ccpmDePrograma } from '../src/engine/ccpm';
import { calcularEvm, calcularValorizaciones, type Control, controlDemostracion, lookahead, resumirCambios } from '../src/engine/control';
import { calcularTodo } from '../src/engine/index';
import { centroPendientes, contingenciaRiesgo, metradosVigentes, montoDeCambio, requerimientoMateriales, restriccionesAutomaticas, todasLasRestricciones } from '../src/engine/integracion';
import { generarTarjetas } from '../src/engine/kanban';
import type { Proyecto } from '../src/engine/types';
import { redondear, sumarDias } from '../src/engine/util';

function demo(): Proyecto {
  const p = proyectoEjemplo();
  p.control = controlDemostracion(calcularTodo(p));
  return p;
}
const totalReq = (p: Proyecto) => requerimientoMateriales(calcularTodo(p), p.control).reduce((s, x) => s + x.total, 0);

describe('cambios aprobados → vigente, EAC y materiales', () => {
  it('aprobar un adicional cambia el vigente, el EAC y el requerimiento de materiales sin tocar nada más', () => {
    const p = demo();
    const r = calcularTodo(p);
    const partida = r.hojas.find((h) => h.metrado > 0 && r.apus[h.partida.id].items.some((i) => i.insumo.tipo === 'MAT'))!;
    const partidas = [{ partidaId: partida.partida.id, metrado: redondear(partida.metrado * 0.25, 2) }];
    const monto = montoDeCambio(r, partidas);
    expect(monto).toBeGreaterThan(0);
    const propuesto = produce(p, (d) => { d.control!.cambios.push({ id: 'cmb-x', numero: 'ADC-99', tipo: 'adicional', fecha: '2026-12-01', descripcion: 'Mayor metrado de prueba', causa: 'Mayor metrado', monto, plazoDias: 5, estado: 'propuesto', partidas }); });
    const aprobado = produce(propuesto, (d) => { d.control!.cambios.find((x) => x.id === 'cmb-x')!.estado = 'aprobado'; });
    const rp = calcularTodo(propuesto);
    const ra = calcularTodo(aprobado);
    // vigente
    expect(resumirCambios(ra, aprobado.control!).vigente).toBeCloseTo(resumirCambios(rp, propuesto.control!).vigente + monto, 1);
    // EAC (con el mismo CPI, crece con el presupuesto vigente)
    const ep = calcularEvm(rp, propuesto.control!)!.ultimo!;
    const ea = calcularEvm(ra, aprobado.control!)!.ultimo!;
    expect(ep.cpi).not.toBeNull();
    expect(ea.eac!).toBeGreaterThan(ep.eac!);
    // requerimiento de materiales
    expect(metradosVigentes(ra, aprobado.control)[partida.partida.id]).toBeCloseTo(partida.metrado * 1.25, 2);
    expect(totalReq(aprobado)).toBeGreaterThan(totalReq(propuesto));
    // el presupuesto no cambia
    expect(ra.pie).toEqual(rp.pie);
  });
  it('un deductivo aprobado resta metrado vigente y el requerimiento coincide con el APU', () => {
    const p = demo();
    const r = calcularTodo(p);
    const h = r.hojas.find((x) => x.metrado > 2 && r.apus[x.partida.id].items.some((i) => i.insumo.tipo === 'MAT'))!;
    p.control!.cambios.push({ id: 'd', numero: 'DED-9', tipo: 'deductivo', fecha: '2026-12-01', descripcion: '', causa: '', monto: 0, plazoDias: 0, estado: 'aprobado', partidas: [{ partidaId: h.partida.id, metrado: 1 }] });
    expect(metradosVigentes(r, p.control)[h.partida.id]).toBeCloseTo(h.metrado - 1, 4);
    const mat = r.apus[h.partida.id].items.find((i) => i.insumo.tipo === 'MAT' && i.porcentaje === null)!;
    const usoBase = requerimientoMateriales(r, null).find((x) => x.codigo === mat.insumo.codigo)!.total;
    const usoVig = requerimientoMateriales(r, p.control).find((x) => x.codigo === mat.insumo.codigo)!.total;
    expect(usoBase - usoVig).toBeCloseTo(mat.cantidad, 1);
  });
});

describe('restricciones automáticas de Last Planner', () => {
  it('un material por pedir crea su restricción, bloquea la actividad y se levanta al recibirse', () => {
    const p = proyectoEjemplo();
    const r = calcularTodo(p);
    const c = controlDemostracion(r) as Control;
    c.kanban.tarjetas = [];
    c.restricciones = [];
    const hoy = sumarDias(r.programa.inicio, -10);
    generarTarjetas(r, c, false, hoy); // sin restricciones enlazadas: nacen solas
    const auto = restriccionesAutomaticas(r, c, hoy).filter((x) => x.origen === 'kanban');
    expect(auto.length).toBeGreaterThan(0);
    const id = auto[0].partidaId;
    const la = lookahead(r, c, r.programa.inicio, 4, hoy);
    expect(la.filas.find((f) => f.partidaId === id)?.lista).toBe(false);
    for (const t of c.kanban.tarjetas.filter((x) => x.partidaId === id)) t.estado = 'almacen';
    expect(restriccionesAutomaticas(r, c, hoy).some((x) => x.partidaId === id && x.origen === 'kanban')).toBe(false);
  });
  it('una consulta abierta con partida restringe la actividad hasta que se responde', () => {
    const p = demo();
    const r = calcularTodo(p);
    const c = p.control!;
    const id = r.hojas[3].partida.id;
    c.registros.push({ id: 'rfi-x', tipo: 'rfi', numero: 'RFI-099', fecha: '2026-11-01', asunto: 'Detalle de anclaje', detalle: '', autor: '', destinatario: 'Proyectista', fechaLimite: '2026-11-05', respuesta: '', fechaRespuesta: '', estado: 'abierto', partidaId: id });
    expect(todasLasRestricciones(r, c, '2026-11-02').some((x) => x.partidaId === id && x.id === 'auto:rfi:rfi-x')).toBe(true);
    c.registros.find((x) => x.id === 'rfi-x')!.estado = 'respondido';
    expect(todasLasRestricciones(r, c, '2026-11-02').some((x) => x.id === 'auto:rfi:rfi-x')).toBe(false);
  });
});

describe('calidad → valorización', () => {
  it('en modo «observar» los montos no cambian; en «liberado» solo se valoriza lo liberado', () => {
    const p = demo();
    const r = calcularTodo(p);
    const c = p.control!;
    const antes = calcularValorizaciones(r, c);
    const total = (v: typeof antes) => redondear(v.reduce((s, x) => s + x.costoDirecto, 0));
    expect(c.valorizarLiberado ?? 'observar').toBe('observar');
    const conPuntos = new Set(c.calidad.puntos.map((x) => x.partidaId));
    expect(conPuntos.size).toBeGreaterThan(0);
    const soloLib = calcularValorizaciones(r, { ...c, valorizarLiberado: 'liberado' });
    expect(total(soloLib)).toBeLessThanOrEqual(total(antes));
    const retenido = soloLib.reduce((s, v) => s + v.retenido, 0);
    expect(redondear(total(soloLib) + retenido, 0)).toBeGreaterThanOrEqual(redondear(total(antes), 0) - 1);
    // sin puntos de inspección no se controla nada: igual que antes
    expect(total(calcularValorizaciones(r, { ...c, valorizarLiberado: 'liberado', calidad: { ...c.calidad, puntos: [] } }))).toBe(total(antes));
  });
});

describe('riesgo → gastos generales y cadena crítica', () => {
  it('propone la contingencia P80 y el colchón fijado se usa en la cadena crítica', () => {
    const p = demo();
    const r = calcularTodo(p);
    const c = p.control!;
    c.riesgo.resumen = { ...c.riesgo.resumen!, p50Dias: 80, p80Dias: 92, p80Costo: r.pie.costoDirecto + 12345.67 };
    expect(contingenciaRiesgo(r, c)).toEqual({ monto: 12345.67, dias: 12, fecha: c.riesgo.resumen.fecha });
    const sin = ccpmDePrograma(r, c.ccpm);
    const con = ccpmDePrograma(r, { ...c.ccpm, colchonDias: 12 });
    expect(con.colchonProyecto).toBe(12);
    expect(con.duracionCcpm).toBeCloseTo(sin.duracionCcpm - sin.colchonProyecto + 12, 1);
  });
});

describe('centro de pendientes', () => {
  it('junta los pendientes de todos los apartados, primero los urgentes', () => {
    const p = demo();
    const r = calcularTodo(p);
    const l = centroPendientes(r, '2027-06-01');
    expect(new Set(l.map((x) => x.grupo)).size).toBeGreaterThan(2);
    const niveles = l.map((x) => ({ error: 0, advertencia: 1, info: 2 })[x.nivel]);
    expect([...niveles].sort((a, b) => a - b)).toEqual(niveles);
    expect(centroPendientes(calcularTodo(proyectoEjemplo()), '2027-06-01').every((x) => x.modulo === 'validacion')).toBe(true);
  });
});
