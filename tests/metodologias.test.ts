// Pruebas de la versión 2.5: Earned Schedule, Monte Carlo / PERT, cadena crítica, kanban de materiales,
// plan de calidad ISO 9001 e ingeniería de valor.
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { proyectoEjemplo } from '../src/data/proyectos';
import { calcularTodo } from '../src/engine/index';
import type { Resultados } from '../src/engine/types';
import {
  calcularEvm, calcularTablero, controlDemostracion, controlVacio, cronogramaGanado, crearLineaBase, curvaPvDiaria, lookahead, normalizarControl,
} from '../src/engine/control';
import {
  configRiesgoVacia, estadistica, generador, mediaPert, mediaTriangular, muestraPert, muestraTriangular, percentil, Simulacion, simularRiesgo, entradaSimulacion,
} from '../src/engine/riesgo';
import { avancePlanCadena, calcularCcpm, ccpmDePrograma, diaPlanParaAvance, puntosFiebre, tamanoColchon, zonaFiebre } from '../src/engine/ccpm';
import { alertaTarjeta, analisisMateriales, generarTarjetas, moverTarjeta, tarjetasDesdeCronograma, type TarjetaKanban } from '../src/engine/kanban';
import { dmaicDesdePnc, firmasPorDefecto, liberacionPorFrente, protocoloLiberado, puntosSugeridos, resumenCalidad, type Protocolo } from '../src/engine/calidad';
import { aplicarAlternativa, calcularMetas, costoAlternativa, deshacerAlternativa, indiceValor, puntajePonderado, valorVacio, type Alternativa } from '../src/engine/valor';
import { generarXlsxControl } from '../src/export/control';
import { sumarDias } from '../src/engine/util';

const r = calcularTodo(proyectoEjemplo());

// ======================================================================= Earned Schedule

describe('Earned Schedule', () => {
  it('interpola el cronograma ganado en la curva PV', () => {
    const pv = [10, 20, 30, 40];
    expect(cronogramaGanado(pv, 0)).toBe(0);
    expect(cronogramaGanado(pv, 5)).toBeCloseTo(0.5, 9);
    expect(cronogramaGanado(pv, 10)).toBeCloseTo(1, 9);
    expect(cronogramaGanado(pv, 25)).toBeCloseTo(2.5, 9);
    expect(cronogramaGanado(pv, 40)).toBe(4);
    expect(cronogramaGanado(pv, 99)).toBe(4);
  });
  it('ES, SPI(t), SV(t) e IEAC(t) con un corte conocido', () => {
    const lb = crearLineaBase(r);
    const { fechas, pv } = curvaPvDiaria(r, lb);
    const pd = fechas.length;
    expect(pd).toBe(r.programa.diasLaborables);
    expect(pv[pd - 1]).toBeCloseTo(r.pie.costoDirecto, 0);
    // al día 20 el valor ganado equivale a lo planificado al día 10
    const b = lb.partidas.reduce((a, x) => (x.parcial > a.parcial ? x : a));
    const c = controlVacio();
    c.lineaBase = lb;
    c.cortes.push({ id: 'k', fecha: fechas[19], nombre: 'S', metrados: { [b.id]: pv[9] / b.pu }, costoReal: null, nota: '' });
    const u = calcularEvm(r, c)!.ultimo!;
    expect(u.ev).toBeCloseTo(pv[9], 0);
    expect(u.es).toBeCloseTo(10, 4);
    expect(u.at).toBe(20);
    expect(u.spiT).toBeCloseTo(0.5, 4);
    expect(u.svT).toBeCloseTo(-10, 4);
    expect(u.ieacT).toBeCloseTo(pd / 0.5, 2);
    expect(u.finEstimadoES > lb.fin).toBe(true);
  });
  it('SPI(t) = 1 cuando el avance sigue el plan', () => {
    const lb = crearLineaBase(r);
    const { fechas, pv } = curvaPvDiaria(r, lb);
    const b = lb.partidas.reduce((a, x) => (x.parcial > a.parcial ? x : a));
    const c = controlVacio();
    c.lineaBase = lb;
    c.cortes.push({ id: 'k', fecha: fechas[11], nombre: 'S', metrados: { [b.id]: pv[11] / b.pu }, costoReal: null, nota: '' });
    expect(pv[11]).toBeLessThan(b.parcial);
    const u = calcularEvm(r, c)!.ultimo!;
    expect(u.spiT).toBeCloseTo(1, 4);
    expect(u.finEstimadoES).toBe(lb.fin);
  });
  it('el tablero muestra SPI(t)', () => {
    const t = calcularTablero(r, controlDemostracion(r), '2099-01-01');
    expect(t.spiT).not.toBeNull();
    expect(t.finEstimadoES).toBeTruthy();
  });
});

// ======================================================================= Monte Carlo / PERT

/** Resultados mínimos con una red de prueba (solo lo que usa la simulación). */
function redPrueba(acts: { id: string; d: number; costo?: number; preds?: { id: string; tipo: 'FC' | 'CC' | 'FF'; desfase: number }[] }[], dias: number): Resultados {
  return {
    proyecto: { meta: { diasLaborables: [1, 2, 3, 4, 5, 6, 0], feriados: [] } },
    pie: { costoDirecto: acts.reduce((s, a) => s + (a.costo ?? 0), 0) },
    programa: {
      inicio: '2027-01-01',
      fin: sumarDias('2027-01-01', dias - 1),
      diasLaborables: dias,
      actividades: acts.map((a) => ({ partidaId: a.id, codigo: a.id, descripcion: a.id, duracion: a.d, parcial: a.costo ?? 0, predecesoras: a.preds ?? [] })),
    },
  } as unknown as Resultados;
}

describe('Monte Carlo y PERT', () => {
  it('medias conocidas de PERT-Beta y triangular', () => {
    const u = generador(1);
    let sp = 0;
    let st = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) {
      const p = muestraPert(2, 5, 14, u);
      const t = muestraTriangular(2, 5, 14, u);
      expect(p).toBeGreaterThanOrEqual(2);
      expect(p).toBeLessThanOrEqual(14);
      expect(t).toBeGreaterThanOrEqual(2);
      expect(t).toBeLessThanOrEqual(14);
      sp += p;
      st += t;
    }
    expect(mediaPert(2, 5, 14)).toBe(6);
    expect(mediaTriangular(2, 5, 14)).toBe(7);
    expect(sp / n).toBeCloseTo(6, 1);
    expect(st / n).toBeCloseTo(7, 1);
  });
  it('percentiles por interpolación', () => {
    expect(percentil([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentil([0, 10], 80)).toBeCloseTo(8, 9);
    const e = estadistica([3, 1, 2, 4]);
    expect(e.media).toBe(2.5);
    expect(e.histograma.reduce((s, h) => s + h.n, 0)).toBe(4);
  });
  it('sin incertidumbre reproduce el CPM del cronograma', () => {
    const cfg = { ...configRiesgoVacia(), optimistaPct: 0, pesimistaPct: 0, costoModo: 'ninguno' as const, iteraciones: 1000 };
    const x = simularRiesgo(r, cfg);
    expect(x.plazo.p50).toBeCloseTo(r.programa.diasLaborables, 6);
    expect(x.plazo.p90).toBeCloseTo(r.programa.diasLaborables, 6);
    expect(x.fechas.p50).toBe(r.programa.fin);
    expect(x.probPlazo).toBe(100);
    for (const a of r.programa.actividades) {
      const k = x.criticidad.find((y) => y.partidaId === a.partidaId)!;
      expect(k.indice).toBe(a.critica ? 100 : 0);
    }
  });
  it('dos actividades en serie suman sus medias', () => {
    const rr = redPrueba([{ id: 'A', d: 10, costo: 100 }, { id: 'B', d: 10, costo: 100, preds: [{ id: 'A', tipo: 'FC', desfase: 0 }] }], 20);
    const cfg = { ...configRiesgoVacia(), distribucion: 'triangular' as const, optimistaPct: 20, pesimistaPct: 20, costoModo: 'ninguno' as const, iteraciones: 5000 };
    const x = simularRiesgo(rr, cfg);
    expect(x.plazo.media).toBeCloseTo(20, 1);
    expect(x.plazo.p50).toBeCloseTo(20, 0);
    expect(x.plazo.min).toBeGreaterThanOrEqual(16);
    expect(x.plazo.max).toBeLessThanOrEqual(24);
    expect(x.probPlazo).toBeGreaterThan(40);
    expect(x.probPlazo).toBeLessThan(60);
  });
  it('índice de criticidad: la rama corta nunca es crítica', () => {
    const rr = redPrueba([{ id: 'A', d: 10 }, { id: 'C', d: 3 }, { id: 'B', d: 5, preds: [{ id: 'A', tipo: 'FC', desfase: 0 }, { id: 'C', tipo: 'FC', desfase: 0 }] }], 15);
    const x = simularRiesgo(rr, { ...configRiesgoVacia(), costoModo: 'ninguno', iteraciones: 2000 });
    const idx = Object.fromEntries(x.criticidad.map((k) => [k.partidaId, k.indice]));
    expect(idx.A).toBe(100);
    expect(idx.B).toBe(100);
    expect(idx.C).toBe(0);
  });
  it('costo con ± % global: media PERT conocida', () => {
    const rr = redPrueba([{ id: 'A', d: 10, costo: 1000 }, { id: 'B', d: 10, costo: 3000 }], 10);
    const x = simularRiesgo(rr, { ...configRiesgoVacia(), costoModo: 'global', costoOptimistaPct: 5, costoPesimistaPct: 15, iteraciones: 10000 });
    expect(x.costo!.media).toBeCloseTo(4000 * mediaPert(0.95, 1, 1.15), -1);
    expect(x.probCosto).toBeGreaterThan(0);
    expect(x.probCosto).toBeLessThan(100);
  });
  it('misma semilla, mismos resultados; por bloques igual que de una vez', () => {
    const cfg = { ...configRiesgoVacia(), iteraciones: 1500 };
    const a = simularRiesgo(r, cfg);
    const s = new Simulacion(r, entradaSimulacion(r, cfg));
    while (!s.terminado) s.avanzar(100);
    const b = s.resultado();
    expect(b.plazo.p80).toBe(a.plazo.p80);
    expect(b.costo!.p90).toBe(a.costo!.p90);
    const c = simularRiesgo(r, { ...cfg, semilla: 99 });
    expect(c.plazo.media).not.toBe(a.plazo.media);
    expect(a.plazo.p50).toBeLessThanOrEqual(a.plazo.p80);
    expect(a.plazo.p80).toBeLessThanOrEqual(a.plazo.p90);
  });
  it('tres valores propios reemplazan al ± % general', () => {
    const cfg = configRiesgoVacia();
    const a = r.programa.actividades[0];
    cfg.estimaciones[a.partidaId] = { optimista: 1, probable: 2, pesimista: 9, costoOptimista: null, costoProbable: null, costoPesimista: null };
    const e = entradaSimulacion(r, cfg).actividades[0];
    expect([e.o, e.m, e.p]).toEqual([1, 2, 9]);
    expect(e.propia).toBe(true);
  });
});

// ======================================================================= cadena crítica

describe('cadena crítica (CCPM)', () => {
  const nodos = [
    { partidaId: 'A', codigo: 'A', descripcion: 'A', duracion: 10, predecesoras: [] },
    { partidaId: 'B', codigo: 'B', descripcion: 'B', duracion: 10, predecesoras: [{ id: 'A', tipo: 'FC' as const, desfase: 0 }, { id: 'C', tipo: 'FC' as const, desfase: 0 }] },
    { partidaId: 'C', codigo: 'C', descripcion: 'C', duracion: 4, predecesoras: [] },
  ];
  it('recorte, colchón del proyecto (50 %) y colchón de alimentación', () => {
    const x = calcularCcpm(nodos, { recortePct: 50, metodo: 'mitad' });
    expect(x.cadena).toEqual(['A', 'B']);
    expect(x.largoCadena).toBe(10);
    expect(x.colchonProyecto).toBe(5);
    expect(x.duracionCcpm).toBe(15);
    expect(x.duracionCpm).toBe(20);
    expect(x.alimentacion).toHaveLength(1);
    const f = x.alimentacion[0];
    expect(f.entrada).toBe('C');
    expect(f.alimenta).toBe('B');
    expect(f.tamano).toBe(1);
    expect(f.holgura).toBe(3);
    expect(f.excede).toBe(false);
  });
  it('raíz de la suma de cuadrados', () => {
    expect(tamanoColchon([5, 5], 'rss')).toBeCloseTo(Math.sqrt(50), 9);
    const x = calcularCcpm(nodos, { recortePct: 50, metodo: 'rss' });
    expect(x.colchonProyecto).toBeCloseTo(7.1, 1);
  });
  it('curva de avance de la cadena y su inversa', () => {
    const x = calcularCcpm(nodos, { recortePct: 50, metodo: 'mitad' });
    expect(avancePlanCadena(x, 5)).toBeCloseTo(50, 9);
    expect(avancePlanCadena(x, 10)).toBeCloseTo(100, 9);
    expect(diaPlanParaAvance(x, 25)).toBeCloseTo(2.5, 6);
  });
  it('zonas del gráfico de fiebre', () => {
    expect(zonaFiebre(50, 20)).toBe('verde');
    expect(zonaFiebre(50, 45)).toBe('amarillo');
    expect(zonaFiebre(50, 70)).toBe('rojo');
  });
  it('sin avance, el atraso de la cadena es el tiempo transcurrido', () => {
    const lb = crearLineaBase(r);
    const x = ccpmDePrograma(r, { recortePct: 50, metodo: 'mitad' });
    expect(x.cadena.length).toBeGreaterThan(0);
    expect(x.largoCadena).toBeLessThan(r.programa.diasLaborables);
    const fecha = sumarDias(lb.inicio, 13);
    const pts = puntosFiebre(r, x, lb, [{ id: 'k', fecha, nombre: 'S', metrados: {}, costoReal: null, nota: '' }]);
    expect(pts[0].avancePct).toBe(0);
    expect(pts[0].atraso).toBe(pts[0].dia);
    expect(pts[0].consumoPct).toBeCloseTo((pts[0].dia / x.colchonProyecto) * 100, 6);
  });
  it('el cronograma del ejemplo tiene colchones de alimentación', () => {
    const x = ccpmDePrograma(r, { recortePct: 50, metodo: 'mitad' });
    expect(x.alimentacion.length).toBeGreaterThan(0);
    expect(x.alimentacion.every((f) => f.tamano >= 0)).toBe(true);
  });
});

// ======================================================================= kanban

describe('kanban de materiales', () => {
  it('las tarjetas suman la relación de insumos de cada material', () => {
    const ts = tarjetasDesdeCronograma(r);
    for (const it of r.insumos.items.filter((i) => i.insumo.tipo === 'MAT')) {
      const suma = ts.filter((t) => t.insumo === it.insumo.codigo).reduce((s, t) => s + t.cantidad, 0);
      expect(suma).toBeCloseTo(it.cantidad, 0);
    }
  });
  it('fecha de pedido = fecha necesaria − anticipación de compra', () => {
    const t = tarjetasDesdeCronograma(r).find((x) => x.insumo === 'MA14')!;
    const ins = r.proyecto.insumos.find((i) => i.codigo === 'MA14')!;
    expect(t.fechaPedido).toBe(sumarDias(t.fechaNecesaria, -(ins.plazoCompraDias ?? 0)));
  });
  it('un material no recibido bloquea la actividad en el lookahead', () => {
    const c = controlVacio();
    generarTarjetas(r, c, true, '2026-10-01');
    const t = c.kanban.tarjetas.find((x) => x.insumo === 'MA14')!;
    expect(c.restricciones.find((x) => x.id === t.restriccionId)!.liberada).toBe(false);
    const fila = () => lookahead(r, c, t.fechaNecesaria, 2).filas.find((f) => f.partidaId === t.partidaId)!;
    expect(fila().lista).toBe(false);
    for (const x of c.kanban.tarjetas.filter((y) => y.partidaId === t.partidaId)) moverTarjeta(c, x.id, 'almacen', '2026-10-05');
    expect(c.restricciones.find((x) => x.id === t.restriccionId)!.liberada).toBe(true);
    expect(fila().lista).toBe(true);
    moverTarjeta(c, t.id, 'transito', '2026-10-06');
    expect(fila().lista).toBe(false);
    expect(t.historial.map((h) => h.estado)).toEqual(['almacen', 'transito']);
  });
  it('alertas de quiebre y de pedido', () => {
    const t = { estado: 'por_pedir', fechaNecesaria: '2026-11-20', fechaPedido: '2026-11-10' } as TarjetaKanban;
    expect(alertaTarjeta(t, '2026-11-01')).toBe('ok');
    expect(alertaTarjeta(t, '2026-11-11')).toBe('pedir');
    expect(alertaTarjeta(t, '2026-11-15')).toBe('pedir');
    expect(alertaTarjeta({ ...t, estado: 'pedido' }, '2026-11-15')).toBe('proxima');
    expect(alertaTarjeta(t, '2026-11-20')).toBe('quiebre');
    expect(alertaTarjeta({ ...t, estado: 'almacen' }, '2026-11-25')).toBe('ok');
  });
  it('punto de pedido por defecto = consumo diario × anticipación + stock mínimo', () => {
    const c = controlVacio();
    generarTarjetas(r, c, false, '2026-10-01');
    const a = analisisMateriales(r, c, '2026-10-01').find((x) => x.codigo === 'MA01')!;
    expect(a.consumoDiario).toBeGreaterThan(0);
    expect(a.stockMinimo).toBeCloseTo(a.consumoDiario * 3, 1);
    expect(a.puntoPedido).toBeCloseTo(a.consumoDiario * a.anticipacion + a.stockMinimo, 1);
    c.kanban.materiales.MA01 = { stockMinimo: 10, puntoPedido: 50 };
    const b = analisisMateriales(r, c, '2026-10-01').find((x) => x.codigo === 'MA01')!;
    expect([b.stockMinimo, b.puntoPedido]).toEqual([10, 50]);
  });
  it('la demostración tiene quiebres y tarjetas en todos los estados de llegada', () => {
    const c = controlDemostracion(r);
    const hoy = c.cortes[c.cortes.length - 1].fecha;
    expect(c.kanban.tarjetas.length).toBeGreaterThan(10);
    expect(c.kanban.tarjetas.some((t) => alertaTarjeta(t, hoy) === 'quiebre')).toBe(true);
    expect(c.kanban.tarjetas.some((t) => t.estado === 'frente')).toBe(true);
  });
});

// ======================================================================= calidad ISO 9001

describe('plan de calidad ISO 9001', () => {
  const prot = (resultado: Protocolo['resultado'], firmas: boolean[]): Protocolo => ({
    id: 'p', numero: 'PC-1', puntoId: '', partidaId: '', frenteId: '', fecha: '', ubicacion: '', metrado: null, resultado, observaciones: '',
    firmas: firmas.map((f, i) => ({ ...firmasPorDefecto()[i], firmado: f })),
  });
  it('un protocolo se libera solo conforme y con todas las firmas', () => {
    expect(protocoloLiberado(prot('conforme', [true, true, true]))).toBe(true);
    expect(protocoloLiberado(prot('conforme', [true, true, false]))).toBe(false);
    expect(protocoloLiberado(prot('observado', [true, true, true]))).toBe(false);
    expect(protocoloLiberado(prot('conforme', []))).toBe(false);
  });
  it('plan de inspección sugerido desde las especificaciones', () => {
    const pts = puntosSugeridos(r);
    expect(pts.length).toBe(r.hojas.filter((h) => h.metrado > 0).length);
    expect(pts.every((p) => p.criterio.length > 0)).toBe(true);
  });
  it('índice de liberación por frente', () => {
    const c = controlDemostracion(r);
    const fr = liberacionPorFrente(c);
    const s = resumenCalidad(c);
    expect(s.protocolos).toBeGreaterThan(0);
    expect(fr.reduce((a, x) => a + x.emitidos, 0)).toBe(s.protocolos);
    for (const x of fr) if (x.emitidos) expect(x.indice).toBeCloseTo((x.liberados / x.emitidos) * 100, 9);
    expect(s.indiceLiberacion).toBeCloseTo((s.liberados / s.protocolos) * 100, 9);
    expect(s.pncAbiertos).toBe(1);
    expect(s.pncCerrados).toBe(1);
    expect(c.calidad.puntos.some((p) => p.serieId === c.series[0].id)).toBe(true);
  });
  it('un PNC pasa a proyecto DMAIC con sus acciones', () => {
    const c = controlDemostracion(r);
    const x = c.calidad.pnc[0];
    const d = dmaicDesdePnc(x, 'Partida');
    expect(d.acciones.length).toBe(x.acciones.length);
    expect(d.causaRaiz).toBe(x.causaRaiz);
    expect(d.planControl).toBe(x.verificacion);
  });
});

// ======================================================================= ingeniería de valor

describe('ingeniería de valor y Target Value Design', () => {
  const alt = (o: Partial<Alternativa>): Alternativa => ({
    id: 'a1', codigo: 'VE-01', ambitoId: 'p0404', descripcion: 'Alternativa', costo: null, plazoDias: null, funcion: 5, ventajas: '', riesgos: '',
    puntajes: {}, estado: 'aprobada', aplicacion: null, respaldo: null, ...o,
  });
  it('costo meta por reducción y por costo permitido', () => {
    const v = valorVacio();
    v.reduccionPct = 10;
    const m = calcularMetas(r, v);
    for (const f of m.filas) expect(f.meta).toBeCloseTo(f.estimado * 0.9, 1);
    v.costoPermitido = 800000;
    const m2 = calcularMetas(r, v);
    expect(m2.meta).toBeCloseTo(800000, 0);
    expect(m2.brecha).toBeCloseTo(r.pie.costoDirecto - 800000, 0);
  });
  it('índice de valor y ahorro de las alternativas aprobadas', () => {
    const v = valorVacio();
    const fila = r.hojas.find((h) => h.partida.id === 'p0404')!;
    const a = alt({ aplicacion: { modo: 'pu', pu: fila.pu * 0.9, apuDe: '', metrado: null, descripcion: '' } });
    v.alternativas.push(a);
    v.funcionActual.p0404 = 5;
    expect(costoAlternativa(r, a)).toBeCloseTo(fila.parcial * 0.9, 0);
    expect(indiceValor(r, v, a)).toBeCloseTo(1 / 0.9, 3);
    const m = calcularMetas(r, v);
    const t = m.filas.find((f) => f.codigo === '04')!;
    expect(t.ahorroAprobado).toBeCloseTo(fila.parcial * 0.1, 0);
  });
  it('matriz de decisión ponderada', () => {
    const k = [{ id: 'x', nombre: 'X', peso: 60 }, { id: 'y', nombre: 'Y', peso: 40 }];
    expect(puntajePonderado(k, { x: 5, y: 0 })).toBeCloseTo(3, 9);
    expect(puntajePonderado(k, { x: 4, y: 4 })).toBeCloseTo(4, 9);
    expect(puntajePonderado(k, {})).toBeNull();
  });
  it('aplica una alternativa al presupuesto y la deshace', () => {
    const p = proyectoEjemplo();
    const r0 = calcularTodo(p);
    const fila = r0.hojas.find((h) => h.partida.id === 'p0404')!;
    const a = alt({ aplicacion: { modo: 'pu', pu: 20, apuDe: '', metrado: null, descripcion: 'Geomembrana alternativa' } });
    p.control = controlVacio();
    p.control.valor.alternativas.push(a);
    expect(aplicarAlternativa(p, a, fila.parcial, '2026-11-08')).toBeNull();
    const r1 = calcularTodo(p);
    expect(r1.pie.costoDirecto).toBeCloseTo(r0.pie.costoDirecto - fila.parcial + 20 * fila.metrado, 1);
    expect(p.partidas.find((x) => x.id === 'p0404')!.descripcion).toBe('Geomembrana alternativa');
    expect(p.control.valor.alternativas[0].estado).toBe('aplicada');
    expect(calcularMetas(r1, p.control.valor).ahorroAplicado).toBeCloseTo(fila.parcial - 20 * fila.metrado, 1);
    expect(deshacerAlternativa(p, a.id)).toBeNull();
    const r2 = calcularTodo(p);
    expect(r2.pie.costoDirecto).toBe(r0.pie.costoDirecto);
    expect(p.insumos.length).toBe(proyectoEjemplo().insumos.length);
    expect(p.control.valor.alternativas[0].estado).toBe('aprobada');
  });
  it('copia el APU de otra partida y cambia el metrado', () => {
    const p = proyectoEjemplo();
    const r0 = calcularTodo(p);
    const a = alt({ ambitoId: 'p0503', aplicacion: { modo: 'apu', pu: null, apuDe: 'p0305', metrado: 90, descripcion: '' } });
    p.control = controlVacio();
    p.control.valor.alternativas.push(a);
    expect(costoAlternativa(r0, a)).toBeCloseTo(r0.apus.p0305.pu * 90, 1);
    aplicarAlternativa(p, a, r0.hojas.find((h) => h.partida.id === 'p0503')!.parcial, '2026-11-08');
    const r1 = calcularTodo(p);
    expect(r1.hojas.find((h) => h.partida.id === 'p0503')!.parcial).toBeCloseTo(r0.apus.p0305.pu * 90, 1);
    deshacerAlternativa(p, a.id);
    expect(calcularTodo(p).pie.costoDirecto).toBe(r0.pie.costoDirecto);
  });
});

// ======================================================================= integración

describe('integración de la versión 2.5', () => {
  it('los archivos viejos se completan con las secciones nuevas', () => {
    const c = normalizarControl({ cortes: [] });
    expect(c.riesgo.iteraciones).toBe(2000);
    expect(c.ccpm.recortePct).toBe(50);
    expect(c.kanban.tarjetas).toEqual([]);
    expect(c.calidad.puntos).toEqual([]);
    expect(c.valor.criterios.length).toBeGreaterThan(0);
    expect(normalizarControl({ riesgo: { iteraciones: 50000 } }).riesgo.iteraciones).toBe(10000);
  });
  it('tablero con los indicadores nuevos', () => {
    const c = controlDemostracion(r);
    const t = calcularTablero(r, c, c.cortes[c.cortes.length - 1].fecha, entradaSimulacion(r, c.riesgo, c.lineaBase).huella);
    expect(t.riesgo).not.toBeNull();
    expect(t.riesgoDesactualizado).toBe(false);
    expect(t.riesgo!.p80Dias).toBeGreaterThanOrEqual(t.riesgo!.p50Dias);
    expect(t.colchonConsumo).not.toBeNull();
    expect(t.kanbanQuiebres).toBeGreaterThan(0);
    expect(t.liberacionCalidad).not.toBeNull();
    expect(t.brechaMeta).not.toBeNull();
  });
  it('informe de control con las hojas nuevas', async () => {
    const p = proyectoEjemplo();
    p.control = controlDemostracion(r);
    const datos = await generarXlsxControl(calcularTodo(p), p.control);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(datos as unknown as ArrayBuffer);
    const hojas = wb.worksheets.map((w) => w.name);
    for (const h of ['Riesgo Monte Carlo', 'Criticidad', 'Cadena crítica', 'Kanban materiales', 'Plan de inspección', 'Protocolos', 'PNC', 'Liberación por frente', 'Costo meta', 'Alternativas VE']) expect(hojas).toContain(h);
    const ve = wb.getWorksheet('Valor ganado')!;
    expect(ve.getRow(5).values).toContain('SPI(t)');
  });
});
