// Informe de control de obra: las mismas tablas se ven en pantalla y se exportan a Excel (una hoja por tabla).
import ExcelJS from 'exceljs';
import { datosCabecera } from '../engine/cabecera';
import {
  calcularEvm, calcularPpc, calcularTablero, calcularValorizaciones, capacidadProceso, CATEGORIAS_CARTA, causasNoCumplimiento, claseRiesgo,
  type Control, mejoraDmaic, nivelRiesgo, pareto, puntajeInspeccion, recursosSemanales, rendimientosPorPartida, resumenCarta,
  hoyIso, resumenRestricciones, resumirCambios,
} from '../engine/control';
import { fechaAnalisis, riesgoActual, tablasMetodologias } from './metodologias';
import { entradaSimulacion } from '../engine/riesgo';
import type { Resultados } from '../engine/types';
import { fechaCorta, fmt, num } from '../engine/util';
import type { Fila, Tabla } from './tablas';

const T = (clave: string, titulo: string, cabecera: string[], filas: Fila[], alinear: ('l' | 'r' | 'c')[], decimales: (number | null)[], anchos?: number[]): Tabla => ({
  clave,
  titulo,
  cabecera,
  filas,
  alinear,
  decimales,
  anchos: anchos ?? cabecera.map((c, i) => (i === 1 ? 44 : Math.max(10, c.length + 2))),
});
const f = (celdas: Fila['celdas'], estilo?: Fila['estilo']): Fila => ({ celdas, estilo });
const pctOrNull = (v: number | null | undefined) => (v === null || v === undefined ? null : v);
const nombreFrente = (c: Control, id: string) => c.frentes.find((x) => x.id === id)?.nombre ?? '';
const nombrePartida = (r: Resultados, id: string) => {
  const p = r.hojas.find((h) => h.partida.id === id)?.partida;
  return p ? `${p.codigo} ${p.descripcion}` : '';
};

export function tablaTablero(r: Resultados, c: Control): Tabla {
  const t = calcularTablero(r, c, hoyIso(), entradaSimulacion(r, c.riesgo, c.lineaBase).huella);
  const s = t.cambios;
  const rg = r.programa.actividades.length ? riesgoActual(r, c) : null;
  const m = r.proyecto.meta.moneda;
  const filas: Fila[] = [
    f(['Plazo y costo', null, null], 'subtitulo'),
    f(['Último corte de control', t.ultimoCorte ? fechaCorta(t.ultimoCorte) : 'Sin cortes', null]),
    f(['Avance programado', null, pctOrNull(t.avanceProgramado)]),
    f(['Avance real (valor ganado)', null, pctOrNull(t.avanceReal)]),
    f(['SPI – índice de desempeño del cronograma', null, pctOrNull(t.spi)]),
    f(['CPI – índice de desempeño del costo', null, pctOrNull(t.cpi)]),
    f([`EAC – costo estimado al terminar (${m})`, null, pctOrNull(t.eac)]),
    f(['Fin estimado según SPI', t.finEstimado ? fechaCorta(t.finEstimado) : '', null]),
    f(['SPI(t) – Earned Schedule', null, pctOrNull(t.spiT)]),
    f(['SV(t) – variación del cronograma (días laborables)', null, pctOrNull(t.svT)]),
    f(['Fin estimado IEAC(t)', t.finEstimadoES ? fechaCorta(t.finEstimadoES) : '', null]),
    f(['Riesgo y cadena crítica', null, null], 'subtitulo'),
    f(['Plazo P80 (días laborables)', rg ? fechaCorta(rg.fechas.p80) : '', rg ? rg.plazo.p80 : null]),
    f(['Probabilidad de cumplir el plazo (%)', null, rg ? rg.probPlazo : null]),
    f([`Costo directo P80 (${m})`, null, rg?.costo ? rg.costo.p80 : null]),
    f(['Probabilidad de cumplir el presupuesto (%)', null, rg ? rg.probCosto : null]),
    f(['Avance de la cadena crítica (%)', null, pctOrNull(t.avanceCadena)]),
    f(['Colchón del proyecto consumido (%)', t.colchonZona ? `Zona ${t.colchonZona}` : '', pctOrNull(t.colchonConsumo)]),
    f(['Cambios', null, null], 'subtitulo'),
    f([`Monto contractual (${m})`, null, s.contractual]),
    f([`Adicionales aprobados (${m})`, null, s.adicionales]),
    f([`Deductivos aprobados (${m})`, null, s.deductivos]),
    f([`Presupuesto vigente (${m})`, null, s.vigente]),
    f(['Incidencia neta de adicionales (%)', null, s.incidenciaPct]),
    f(['Plazo vigente (días)', null, s.plazoVigente]),
    f(['Last Planner', null, null], 'subtitulo'),
    f(['PPC de la última semana (%)', null, pctOrNull(t.ppcUltimo)]),
    f(['PPC promedio (%)', null, pctOrNull(t.ppcPromedio)]),
    f(['Restricciones abiertas', null, t.restriccionesAbiertas]),
    f(['Restricciones vencidas', null, t.restriccionesVencidas]),
    f(['Riesgos y registros', null, null], 'subtitulo'),
    f(['Riesgos abiertos', null, t.riesgosAbiertos]),
    f(['Riesgos críticos', null, t.riesgosCriticos]),
    f([`Contingencia de riesgos abiertos (${m})`, null, t.contingencia]),
    f(['Consultas y asientos abiertos', null, t.registrosAbiertos]),
    f(['Productividad y calidad', null, null], 'subtitulo'),
    f(['Índice de productividad promedio (HH plan ÷ HH real)', null, pctOrNull(t.ipPromedio)]),
    f([`Desviación de costo de mano de obra (${m})`, null, t.desviacionMo]),
    f(['Trabajo productivo promedio en cartas balance (%)', null, pctOrNull(t.tpPromedio)]),
    f(['Puntaje promedio de inspecciones (%)', null, pctOrNull(t.inspeccionPromedio)]),
    f(['Proyectos DMAIC activos', null, t.dmaicActivos]),
    f(['Protocolos liberados (%)', null, pctOrNull(t.liberacionCalidad)]),
    f(['Productos no conformes abiertos', null, t.pncAbiertos]),
    f(['Logística e ingeniería de valor', null, null], 'subtitulo'),
    f(['Materiales en quiebre (kanban)', null, t.kanbanQuiebres]),
    f(['Pedidos vencidos sin emitir', null, t.kanbanPorPedir]),
    f([`Brecha contra el costo meta (${m})`, t.brechaMetaPct !== null ? `${t.brechaMetaPct.toFixed(1)} %` : '', pctOrNull(t.brechaMeta)]),
  ];
  return T('ctl_tablero', 'TABLERO DE CONTROL DEL PROYECTO', ['Indicador', 'Detalle', 'Valor'], filas, ['l', 'l', 'r'], [null, null, 2], [56, 18, 18]);
}

export function tablaEvm(r: Resultados, c: Control): Tabla {
  const e = calcularEvm(r, c);
  const filas = (e?.puntos ?? []).map((p) =>
    f([p.nombre, fechaCorta(p.fecha), p.pv, p.ev, p.ac, p.pvPct, p.evPct, p.sv, p.cv, p.spi, p.cpi, p.eac, p.vac, p.tcpi, fechaCorta(p.finEstimado), p.es, p.at, p.spiT, p.svT, p.finEstimadoES ? fechaCorta(p.finEstimadoES) : '']),
  );
  return T(
    'ctl_evm',
    'VALOR GANADO POR CORTE DE CONTROL',
    ['Corte', 'Fecha', 'PV', 'EV', 'AC', '% prog.', '% real', 'SV', 'CV', 'SPI', 'CPI', 'EAC', 'VAC', 'TCPI', 'Fin estimado', 'ES (d)', 'AT (d)', 'SPI(t)', 'SV(t) (d)', 'Fin IEAC(t)'],
    filas,
    ['l', 'c', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'c', 'r', 'r', 'r', 'r', 'c'],
    [null, null, 2, 2, 2, 2, 2, 2, 2, 3, 3, 2, 2, 3, null, 1, 0, 3, 1, null],
    [14, 12, 14, 14, 14, 9, 9, 13, 13, 8, 8, 14, 13, 8, 12, 8, 7, 8, 9, 12],
  );
}

export function tablaAvancePartidas(r: Resultados, c: Control): Tabla {
  const e = calcularEvm(r, c);
  const filas = (e?.partidas ?? []).map((p) => f([p.base.codigo, p.base.descripcion, p.base.unidad, p.base.metrado, p.ejecutado, p.avancePct, p.base.parcial, p.pv, p.ev, p.spi, p.excedente || null]));
  return T(
    'ctl_avance',
    'AVANCE FÍSICO Y VALORIZADO POR PARTIDA',
    ['Ítem', 'Descripción', 'Und.', 'Metrado base', 'Ejecutado', '% avance', 'Parcial base', 'PV', 'EV', 'SPI', 'Mayor metrado'],
    filas,
    ['l', 'l', 'c', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
    [null, null, null, 2, 2, 2, 2, 2, 2, 3, 2],
  );
}

export function tablaValorizaciones(r: Resultados, c: Control): Tabla {
  const vals = calcularValorizaciones(r, c);
  const filas = vals.map((v) =>
    f([v.numero, v.mes, v.costoDirecto, v.gg, v.utilidad, v.valorizacion, v.k, v.reajuste, v.amortizacionDirecto, v.amortizacionMateriales, v.subtotal, v.igv, v.neto, v.acumulado, v.acumuladoPct]),
  );
  return T(
    'ctl_valorizaciones',
    'VALORIZACIONES MENSUALES DE OBRA',
    ['N.°', 'Mes', 'Costo directo', 'GG', 'Utilidad', 'Valorización', 'K', 'Reajuste', 'Amort. adel. directo', 'Amort. adel. materiales', 'Subtotal', 'IGV', 'Neto a pagar', 'Acumulado', '% acum.'],
    filas,
    ['c', 'c', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
    [0, null, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2],
  );
}

export function tablaCambios(r: Resultados, c: Control): Tabla {
  const s = resumirCambios(r, c);
  const filas = c.cambios.map((x) => f([x.numero, x.tipo, fechaCorta(x.fecha), x.descripcion, x.causa, x.monto, x.plazoDias, x.estado]));
  filas.push(f([null, null, null, 'Presupuesto vigente', null, s.vigente, s.plazoVigente, null], 'total'));
  return T('ctl_cambios', 'CONTROL DE CAMBIOS: ADICIONALES, DEDUCTIVOS Y AMPLIACIONES', ['N.°', 'Tipo', 'Fecha', 'Descripción', 'Causa', 'Monto', 'Plazo (d)', 'Estado'], filas, ['l', 'l', 'c', 'l', 'l', 'r', 'r', 'l'], [null, null, null, null, null, 2, 0, null], [10, 12, 11, 44, 22, 14, 9, 12]);
}

export function tablaRiesgos(_r: Resultados, c: Control): Tabla {
  const filas = [...c.riesgos]
    .sort((a, b) => nivelRiesgo(b) - nivelRiesgo(a))
    .map((x) => f([x.categoria, x.descripcion, x.probabilidad, x.impacto, nivelRiesgo(x), claseRiesgo(nivelRiesgo(x)).texto, x.respuesta, x.accion, x.responsable, x.contingencia, x.estado]));
  return T('ctl_riesgos', 'MATRIZ DE RIESGOS', ['Categoría', 'Riesgo', 'P', 'I', 'P×I', 'Nivel', 'Respuesta', 'Acción', 'Responsable', 'Contingencia', 'Estado'], filas, ['l', 'l', 'c', 'c', 'c', 'l', 'l', 'l', 'l', 'r', 'l'], [null, null, 0, 0, 0, null, null, null, null, 2, null], [14, 40, 5, 5, 6, 10, 11, 34, 16, 13, 10]);
}

export function tablaRegistros(_r: Resultados, c: Control): Tabla {
  const nombres = { asiento: 'Asiento de cuaderno', rfi: 'Consulta (RFI)', acta: 'Acta', ocurrencia: 'Ocurrencia' };
  const filas = [...c.registros].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => f([nombres[x.tipo], x.numero, fechaCorta(x.fecha), x.asunto, x.autor, x.destinatario, fechaCorta(x.fechaLimite), x.respuesta, fechaCorta(x.fechaRespuesta), x.estado]));
  return T('ctl_registros', 'CUADERNO DE OBRA, CONSULTAS Y ACTAS', ['Tipo', 'N.°', 'Fecha', 'Asunto', 'De', 'Para', 'Plazo', 'Respuesta', 'Respondido', 'Estado'], filas, ['l', 'l', 'c', 'l', 'l', 'l', 'c', 'l', 'c', 'l'], Array(10).fill(null), [18, 9, 11, 38, 14, 14, 11, 36, 11, 11]);
}

export function tablaRecursos(r: Resultados, c: Control): Tabla {
  const filas = recursosSemanales(r, c).map((s) => f([fechaCorta(s.lunes), s.diasLaborables, s.hhPlan, s.hhReal || null, s.trabajadoresPlan, s.trabajadoresReal || null, s.hmPlan]));
  return T('ctl_recursos', 'HISTOGRAMA DE RECURSOS POR SEMANA', ['Semana (lunes)', 'Días lab.', 'HH plan', 'HH real', 'Trabajadores plan', 'Trabajadores real', 'HM equipos plan'], filas, ['c', 'r', 'r', 'r', 'r', 'r', 'r'], [null, 0, 1, 1, 1, 1, 1]);
}

export function tablaRestricciones(r: Resultados, c: Control): Tabla {
  const s = resumenRestricciones(c);
  const filas = c.restricciones.map((x) => f([nombrePartida(r, x.partidaId), x.tipo, x.descripcion, x.responsable, fechaCorta(x.fechaRequerida), fechaCorta(x.fechaLiberacion), x.liberada ? 'Liberada' : 'Abierta']));
  filas.push(f([`Total ${s.total} · abiertas ${s.abiertas} · vencidas ${s.vencidas}`, null, null, null, null, null, null], 'nota'));
  return T('ctl_restricciones', 'ANÁLISIS DE RESTRICCIONES', ['Actividad', 'Tipo', 'Restricción', 'Responsable', 'Requerida', 'Liberada el', 'Estado'], filas, ['l', 'l', 'l', 'l', 'c', 'c', 'l'], Array(7).fill(null), [40, 16, 40, 18, 11, 11, 10]);
}

export function tablaPlanSemanal(r: Resultados, c: Control): Tabla {
  const filas: Fila[] = [];
  for (const s of [...c.semanas].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    filas.push(f([`Semana del ${fechaCorta(s.inicio)}`, null, null, null, null, null], 'subtitulo'));
    for (const x of s.compromisos) filas.push(f([x.descripcion || nombrePartida(r, x.partidaId), x.responsable, nombreFrente(c, x.frenteId), x.metrado, x.cumplido === null ? 'Sin evaluar' : x.cumplido ? 'Sí' : 'No', x.causa]));
  }
  return T('ctl_plan', 'PLANES SEMANALES (COMPROMISOS)', ['Compromiso', 'Responsable', 'Frente', 'Metrado', 'Cumplido', 'Causa de no cumplimiento'], filas, ['l', 'l', 'l', 'r', 'c', 'l'], [null, null, null, 2, null, null], [48, 18, 26, 11, 11, 26]);
}

export function tablaPpc(_r: Resultados, c: Control): Tabla {
  const p = calcularPpc(c);
  const filas = p.semanas.map((s) => f([fechaCorta(s.lunes), s.total, s.evaluados, s.cumplidos, s.ppc]));
  filas.push(f(['Promedio', null, null, null, p.promedio], 'total'));
  filas.push(f(['Causas de no cumplimiento', null, null, null, null], 'subtitulo'));
  for (const x of causasNoCumplimiento(c)) filas.push(f([x.clave, x.valor, null, null, x.acumuladoPct]));
  return T('ctl_ppc', 'PORCENTAJE DE PLAN CUMPLIDO (PPC)', ['Semana', 'Compromisos', 'Evaluados', 'Cumplidos', 'PPC % / % acumulado'], filas, ['l', 'r', 'r', 'r', 'r'], [null, 0, 0, 0, 1], [28, 13, 12, 12, 20]);
}

export function tablaRendimientos(r: Resultados, c: Control): Tabla {
  const filas = rendimientosPorPartida(r, c).map((x) => f([x.codigo, x.descripcion, x.unidad, x.mediciones, x.cantidad, x.hh, x.hhUnidadPlan, x.hhUnidadReal, x.ip, x.rendimientoApu, x.rendimientoReal, x.desviacionMo]));
  return T('ctl_rendimientos', 'CONTROL DE RENDIMIENTOS (MANO DE OBRA)', ['Ítem', 'Partida', 'Und.', 'Mediciones', 'Producido', 'HH reales', 'HH/u APU', 'HH/u real', 'IP', 'Rend. APU (und/día)', 'Rend. real (und/día)', 'Desviación MO'], filas, ['l', 'l', 'c', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], [null, null, null, 0, 2, 1, 4, 4, 2, 2, 2, 2]);
}

export function tablaCartas(r: Resultados, c: Control): Tabla {
  const filas = c.cartas.map((x) => {
    const s = resumenCarta(x);
    return f([fechaCorta(x.fecha), x.tipo === 'nga' ? 'Nivel general' : 'Carta balance', nombreFrente(c, x.frenteId), nombrePartida(r, x.partidaId), x.cuadrilla, s.total, s.tp, s.tc, s.tnc]);
  });
  return T('ctl_cartas', 'CARTAS BALANCE Y NIVEL GENERAL DE ACTIVIDAD', ['Fecha', 'Tipo', 'Frente', 'Partida', 'Cuadrilla', 'Observaciones', '% TP', '% TC', '% TNC'], filas, ['c', 'l', 'l', 'l', 'l', 'r', 'r', 'r', 'r'], [null, null, null, null, null, 0, 1, 1, 1], [11, 14, 24, 36, 20, 12, 8, 8, 8]);
}

export function tablaPerdidas(r: Resultados, c: Control): Tabla {
  const filas = c.perdidas.map((x) => f([fechaCorta(x.fecha), x.tipo, nombreFrente(c, x.frenteId), nombrePartida(r, x.partidaId), x.descripcion, x.horas, x.costo]));
  const par = pareto(Object.fromEntries(Object.entries(c.perdidas.reduce<Record<string, number>>((a, x) => ({ ...a, [x.tipo]: (a[x.tipo] ?? 0) + num(x.horas) }), {}))));
  filas.push(f(['Pareto por horas', null, null, null, null, null, null], 'subtitulo'));
  for (const p of par) filas.push(f([null, p.clave, null, null, `${fmt(p.pct, 1)} % (acumulado ${fmt(p.acumuladoPct, 1)} %)`, p.valor, null]));
  return T('ctl_perdidas', 'REGISTRO DE PÉRDIDAS (MUDAS)', ['Fecha', 'Tipo', 'Frente', 'Partida', 'Descripción', 'Horas', 'Costo'], filas, ['c', 'l', 'l', 'l', 'l', 'r', 'r'], [null, null, null, null, null, 1, 2], [11, 22, 22, 30, 38, 9, 12]);
}

export function tablaInspecciones(_r: Resultados, c: Control): Tabla {
  const filas = c.inspecciones.map((x) => f([fechaCorta(x.fecha), x.plantilla === '5s' ? '5S' : 'Liberación de frente', nombreFrente(c, x.frenteId), x.responsable, x.items.filter((i) => i.resultado === 'no').map((i) => i.texto).join(' · '), puntajeInspeccion(x)]));
  return T('ctl_inspecciones', 'INSPECCIONES 5S Y LIBERACIÓN DE FRENTES', ['Fecha', 'Tipo', 'Frente', 'Responsable', 'No conformidades', 'Puntaje %'], filas, ['c', 'l', 'l', 'l', 'l', 'r'], [null, null, null, null, null, 1], [11, 18, 24, 16, 60, 10]);
}

export function tablaCalidad(_r: Resultados, c: Control): Tabla {
  const filas = c.series.map((s) => {
    const k = capacidadProceso(s.valores, s.lei, s.les);
    return f([s.nombre, s.unidad, s.lei, s.les, k?.n ?? 0, k?.media ?? null, k?.sigma ?? null, k?.cp ?? null, k?.cpk ?? null, k?.fueraObservadoPct ?? null, k?.nivelSigma ?? null]);
  });
  return T('ctl_calidad', 'CAPACIDAD DE PROCESO (CONTROL DE CALIDAD)', ['Serie', 'Und.', 'LEI', 'LES', 'n', 'Media', 'σ', 'Cp', 'Cpk', '% fuera', 'Nivel σ'], filas, ['l', 'c', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], [null, null, 2, 2, 0, 3, 3, 2, 2, 1, 2]);
}

export function tablaDmaic(_r: Resultados, c: Control): Tabla {
  const fases = { D: 'Definir', M: 'Medir', A: 'Analizar', I: 'Mejorar', C: 'Controlar', cerrado: 'Cerrado' };
  const filas = c.dmaic.map((d) => f([d.titulo, fases[d.fase], d.responsable, d.metrica, d.lineaBaseValor, d.metaValor, d.valorActual, mejoraDmaic(d), d.causaRaiz, `${d.acciones.filter((a) => a.hecho).length}/${d.acciones.length}`]));
  return T('ctl_dmaic', 'PROYECTOS DE MEJORA DMAIC', ['Proyecto', 'Fase', 'Responsable', 'Métrica', 'Línea base', 'Meta', 'Actual', 'Mejora %', 'Causa raíz', 'Acciones'], filas, ['l', 'l', 'l', 'l', 'r', 'r', 'r', 'r', 'l', 'c'], [null, null, null, null, 2, 2, 2, 1, null, null], [36, 11, 18, 22, 11, 10, 10, 10, 34, 9]);
}

export function tablaCartaBalanceDetalle(r: Resultados, c: Control): Tabla {
  const filas: Fila[] = CATEGORIAS_CARTA.map((cat) => f([cat.grupo, cat.texto, ...c.cartas.map((x) => num(x.conteos[cat.clave]))]));
  return T('ctl_cartas_det', 'CARTAS BALANCE: CONTEO POR CATEGORÍA', ['Grupo', 'Categoría', ...c.cartas.map((x) => `${fechaCorta(x.fecha)} ${nombrePartida(r, x.partidaId).split(' ')[0] ?? ''}`)], filas, ['c', 'l', ...c.cartas.map(() => 'r' as const)], [null, null, ...c.cartas.map(() => 0)]);
}

export function tablasControl(r: Resultados, c: Control): { hoja: string; tabla: Tabla }[] {
  return [
    { hoja: 'Tablero', tabla: tablaTablero(r, c) },
    { hoja: 'Valor ganado', tabla: tablaEvm(r, c) },
    { hoja: 'Avance por partida', tabla: tablaAvancePartidas(r, c) },
    { hoja: 'Valorizaciones', tabla: tablaValorizaciones(r, c) },
    { hoja: 'Cambios', tabla: tablaCambios(r, c) },
    { hoja: 'Riesgos', tabla: tablaRiesgos(r, c) },
    { hoja: 'Recursos', tabla: tablaRecursos(r, c) },
    { hoja: 'Cuaderno y RFI', tabla: tablaRegistros(r, c) },
    { hoja: 'Restricciones', tabla: tablaRestricciones(r, c) },
    { hoja: 'Plan semanal', tabla: tablaPlanSemanal(r, c) },
    { hoja: 'PPC', tabla: tablaPpc(r, c) },
    { hoja: 'Rendimientos', tabla: tablaRendimientos(r, c) },
    { hoja: 'Cartas balance', tabla: tablaCartas(r, c) },
    { hoja: 'Conteo cartas', tabla: tablaCartaBalanceDetalle(r, c) },
    { hoja: 'Pérdidas', tabla: tablaPerdidas(r, c) },
    { hoja: 'Inspecciones', tabla: tablaInspecciones(r, c) },
    { hoja: 'Calidad Cp-Cpk', tabla: tablaCalidad(r, c) },
    { hoja: 'DMAIC', tabla: tablaDmaic(r, c) },
    ...tablasMetodologias(r, c, fechaAnalisis(c, hoyIso())),
  ];
}

const VERDE = 'FF1E6B5E';

export async function generarXlsxControl(r: Resultados, c: Control): Promise<Uint8Array> {
  return generarXlsxTablas(r, `Control de obra – ${r.proyecto.meta.nombre}`, tablasControl(r, c));
}

/** Libro de Excel con una hoja por tabla (informe de control, dossier de calidad). */
export async function generarXlsxTablas(r: Resultados, titulo: string, lista: { hoja: string; tabla: Tabla }[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const cab = datosCabecera(r.proyecto);
  wb.creator = cab.proyectista || 'Expediente Pro';
  wb.title = titulo;
  wb.created = new Date();
  for (const { hoja, tabla } of lista) {
    const ws = wb.addWorksheet(hoja, { views: [{ state: 'frozen', ySplit: 5 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    const n = tabla.cabecera.length;
    ws.columns = tabla.cabecera.map((_, i) => ({ width: Math.min(60, Math.max(8, tabla.anchos[i] ?? 12)) }));
    ws.getCell(1, 1).value = tabla.titulo;
    ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: VERDE } };
    ws.getCell(2, 1).value = `${cab.codigoProyecto ? cab.codigoProyecto + ' · ' : ''}${cab.proyecto}`;
    ws.getCell(3, 1).value = [cab.cliente && `Cliente: ${cab.cliente}`, `Moneda: ${cab.monedaNombre}`, `Emitido: ${fechaCorta(new Date().toISOString().slice(0, 10))}`].filter(Boolean).join(' · ');
    ws.getCell(2, 1).font = { bold: true };
    ws.getCell(3, 1).font = { color: { argb: 'FF5D6A70' }, size: 9 };
    const filaCab = ws.getRow(5);
    tabla.cabecera.forEach((t, i) => {
      const cel = filaCab.getCell(i + 1);
      cel.value = t;
      cel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
      cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    filaCab.height = 30;
    let fila = 6;
    for (const fl of tabla.filas) {
      const row = ws.getRow(fila++);
      for (let i = 0; i < n; i++) {
        const v = fl.celdas[i];
        const cel = row.getCell(i + 1);
        cel.value = v === undefined ? null : v;
        if (typeof v === 'number') {
          const d = tabla.decimales[i] ?? 2;
          cel.numFmt = d === 0 ? '#,##0' : `#,##0.${'0'.repeat(d)}`;
        }
        cel.alignment = { horizontal: tabla.alinear[i] === 'r' ? 'right' : tabla.alinear[i] === 'c' ? 'center' : 'left', vertical: 'top', wrapText: typeof v === 'string' && v.length > 30 };
        cel.border = { bottom: { style: 'hair', color: { argb: 'FFD3D8D1' } } };
      }
      if (fl.estilo === 'total' || fl.estilo === 'subtitulo') row.font = { bold: true };
      if (fl.estilo === 'subtitulo') for (let i = 1; i <= n; i++) row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1EEEA' } };
      if (fl.estilo === 'nota') row.font = { italic: true, color: { argb: 'FF5D6A70' } };
    }
    if (!tabla.filas.length) ws.getCell(6, 1).value = 'Sin registros.';
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
