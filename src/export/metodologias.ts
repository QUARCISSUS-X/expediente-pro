// Hojas de la versión 2.5 para el informe de control (y su vista en pantalla): riesgo Monte Carlo, cadena crítica,
// kanban de materiales, plan de calidad ISO 9001 e ingeniería de valor.
import { alertaTarjeta, analisisMateriales, ESTADOS_KANBAN } from '../engine/kanban';
import { ccpmDePrograma, puntosFiebre } from '../engine/ccpm';
import { DISPOSICIONES_PNC, liberacionPorFrente, protocoloLiberado, RESULTADOS_PROTOCOLO } from '../engine/calidad';
import { cortesOrdenados, type Control } from '../engine/control';
import { entradaSimulacion, type ResultadoRiesgo, simularRiesgo } from '../engine/riesgo';
import type { Resultados } from '../engine/types';
import { calcularMetas, costoActual, costoAlternativa, indiceValor, nombreAmbito, puntajePonderado } from '../engine/valor';
import { fechaCorta } from '../engine/util';
import type { Fila, Tabla } from './tablas';

const T = (clave: string, titulo: string, cabecera: string[], filas: Fila[], alinear: ('l' | 'r' | 'c')[], decimales: (number | null)[], anchos?: number[]): Tabla => ({
  clave, titulo, cabecera, filas, alinear, decimales, anchos: anchos ?? cabecera.map((c, i) => (i === 1 ? 44 : Math.max(10, c.length + 2))),
});
const f = (celdas: Fila['celdas'], estilo?: Fila['estilo']): Fila => ({ celdas, estilo });
const fc = (s: string) => (s ? fechaCorta(s) : '');
const partida = (r: Resultados, id: string) => {
  const p = r.hojas.find((h) => h.partida.id === id)?.partida;
  return p ? `${p.codigo} ${p.descripcion}` : '';
};
const frente = (c: Control, id: string) => c.frentes.find((x) => x.id === id)?.nombre ?? '';

// La simulación es determinista (semilla fija): se guarda el último resultado por huella para no repetirla.
let cache: { huella: string; x: ResultadoRiesgo } | null = null;
export function riesgoActual(r: Resultados, c: Control): ResultadoRiesgo {
  const lb = c.lineaBase ? { fin: c.lineaBase.fin, costoDirecto: c.lineaBase.costoDirecto } : null;
  const h = entradaSimulacion(r, c.riesgo, lb).huella;
  if (cache?.huella !== h) cache = { huella: h, x: simularRiesgo(r, c.riesgo, lb) };
  return cache.x;
}

export function tablaRiesgo(r: Resultados, c: Control): Tabla {
  const x = riesgoActual(r, c);
  const e = x.entrada;
  const m = r.proyecto.meta.moneda;
  const filas: Fila[] = [
    f(['Parámetros', null, null], 'subtitulo'),
    f(['Distribución', e.config.distribucion === 'pert' ? 'PERT-Beta' : 'Triangular', null]),
    f(['Iteraciones · semilla', `${x.iteraciones} · ${e.config.semilla}`, null]),
    f(['Duración optimista / pesimista por defecto (%)', `−${e.config.optimistaPct} / +${e.config.pesimistaPct}`, null]),
    f(['Costo', e.config.costoModo === 'ninguno' ? 'Sin incertidumbre' : e.config.costoModo === 'global' ? `−${e.config.costoOptimistaPct} / +${e.config.costoPesimistaPct} % general` : 'Tres valores por partida', null]),
    f(['Plazo', null, null], 'subtitulo'),
    f(['Duración del cronograma (días laborables)', fc(r.programa.fin), e.deterministaDias]),
    f(['Plazo contractual (días laborables)', fc(e.metaFecha), e.metaDias]),
    f(['P50 (días laborables)', fc(x.fechas.p50), x.plazo.p50]),
    f(['P80 (días laborables)', fc(x.fechas.p80), x.plazo.p80]),
    f(['P90 (días laborables)', fc(x.fechas.p90), x.plazo.p90]),
    f(['Media · desviación estándar', null, x.plazo.media]),
    f(['Desviación estándar (días)', null, x.plazo.desviacion]),
    f(['Probabilidad de cumplir el plazo (%)', null, x.probPlazo]),
  ];
  if (x.costo) {
    filas.push(
      f([`Costo directo (${m})`, null, null], 'subtitulo'),
      f(['Costo directo del presupuesto', null, e.deterministaCosto]),
      f(['Presupuesto meta', null, e.metaCosto]),
      f(['P50', null, x.costo.p50]),
      f(['P80', null, x.costo.p80]),
      f(['P90', null, x.costo.p90]),
      f(['Contingencia al P80 (P80 − presupuesto)', null, x.costo.p80 - e.deterministaCosto]),
      f(['Probabilidad de cumplir el presupuesto (%)', null, x.probCosto]),
      f(['Probabilidad de cumplir plazo y presupuesto (%)', null, x.probAmbos]),
    );
  }
  filas.push(f(['Curva S de probabilidad del plazo', null, null], 'subtitulo'));
  for (const p of [10, 20, 30, 40, 50, 60, 70, 80, 90, 95]) {
    const k = x.plazo.acumulada.find((a) => a.pct >= p) ?? x.plazo.acumulada[x.plazo.acumulada.length - 1];
    filas.push(f([`P${p}`, null, k?.x ?? null]));
  }
  return T('ctl_riesgo', 'RIESGO DE PLAZO Y COSTO (SIMULACIÓN MONTE CARLO)', ['Indicador', 'Fecha / detalle', 'Valor'], filas, ['l', 'l', 'r'], [null, null, 2], [52, 24, 18]);
}

export function tablaCriticidad(r: Resultados, c: Control): Tabla {
  const x = riesgoActual(r, c);
  const act = new Map(x.entrada.actividades.map((a) => [a.partidaId, a]));
  const cpm = new Map(r.programa.actividades.map((a) => [a.partidaId, a]));
  const filas = x.criticidad.map((k) => {
    const a = act.get(k.partidaId)!;
    return f([k.codigo, k.descripcion, a.o, a.m, a.p, k.duracionMedia, cpm.get(k.partidaId)?.critica ? 'Sí' : 'No', k.indice]);
  });
  return T('ctl_criticidad', 'ÍNDICE DE CRITICIDAD POR ACTIVIDAD', ['Código', 'Actividad', 'Optimista', 'Más probable', 'Pesimista', 'Media simulada', 'Crítica en CPM', '% veces crítica'], filas, ['l', 'l', 'r', 'r', 'r', 'r', 'c', 'r'], [null, null, 1, 1, 1, 2, null, 1], [10, 50, 11, 12, 11, 13, 12, 13]);
}

export function tablaCcpm(r: Resultados, c: Control): Tabla {
  const x = ccpmDePrograma(r, c.ccpm);
  const filas: Fila[] = [
    f(['Resumen', null, null, null, null, null], 'subtitulo'),
    f(['Duración CPM (días laborables)', null, null, null, null, x.duracionCpm]),
    f(['Cadena crítica con duraciones agresivas', `Recorte ${c.ccpm.recortePct} %`, null, null, null, x.largoCadena]),
    f([`Colchón del proyecto (${c.ccpm.metodo === 'rss' ? 'raíz de la suma de cuadrados' : '50 % de la seguridad'})`, null, null, null, null, x.colchonProyecto]),
    f(['Duración CCPM (cadena + colchón)', null, null, null, null, x.duracionCcpm]),
    f(['Actividades', null, null, null, null, null], 'subtitulo'),
    ...x.actividades.map((a) => f([`${a.codigo} ${a.descripcion}`, a.enCadena ? 'Cadena crítica' : '', a.duracion, a.agresiva, a.seguridad, a.holgura])),
    f(['Colchones de alimentación', null, null, null, null, null], 'subtitulo'),
    ...x.alimentacion.map((b) => f([b.cadena.map((id) => r.hojas.find((h) => h.partida.id === id)?.partida.codigo ?? '').join(' → '), b.alimenta ? `Alimenta ${partida(r, b.alimenta)}` : 'Llega al fin del proyecto', null, b.tamano, b.excede ? 'Excede holgura' : 'Cabe', b.holgura])),
    f(['Gráfico de fiebre por corte', null, null, null, null, null], 'subtitulo'),
    ...puntosFiebre(r, x, c.lineaBase, cortesOrdenados(c)).map((p) => f([`${p.nombre} (${fc(p.fecha)})`, `Zona ${p.zona}`, p.avancePct, p.atraso, p.consumoPct, null])),
  ];
  return T('ctl_ccpm', 'CADENA CRÍTICA (CCPM) Y CONSUMO DE COLCHONES', ['Concepto / actividad', 'Detalle', 'Duración · % cadena', 'Agresiva · atraso', 'Seguridad · % colchón', 'Holgura · valor'], filas, ['l', 'l', 'r', 'r', 'r', 'r'], [null, null, 1, 1, 1, 1], [58, 34, 16, 16, 18, 14]);
}

export function tablaKanban(r: Resultados, c: Control, hoy: string): Tabla {
  const est = Object.fromEntries(ESTADOS_KANBAN.map((e) => [e.id, e.texto]));
  const al = { quiebre: 'QUIEBRE', pedir: 'Pedir ya', proxima: 'Próxima', ok: '' };
  const filas: Fila[] = [
    f(['Stock por material', null, null, null, null, null, null, null, null, null], 'subtitulo'),
    ...analisisMateriales(r, c, hoy).map((m) => f([m.descripcion, m.unidad, m.anticipacion, m.consumoDiario, m.stockMinimo, m.puntoPedido, m.enAlmacen, m.enCamino, m.demandaAnticipacion, m.alerta === 'ok' ? '' : m.alerta.toUpperCase()])),
    f(['Tarjetas', null, null, null, null, null, null, null, null, null], 'subtitulo'),
    ...c.kanban.tarjetas.map((t) => f([`${t.descripcion} · ${partida(r, t.partidaId)}`, t.unidad, null, t.cantidad, fc(t.fechaPedido), fc(t.fechaNecesaria), est[t.estado], t.proveedor, t.ordenCompra, al[alertaTarjeta(t, hoy)]])),
  ];
  return T('ctl_kanban', `KANBAN DE MATERIALES (al ${fc(hoy)})`, ['Material / tarjeta', 'Und.', 'Anticip. (d)', 'Consumo diario · cantidad', 'Stock mín. · pedir el', 'Punto pedido · necesario', 'En almacén · estado', 'En camino · proveedor', 'Demanda · O/C', 'Alerta'], filas, ['l', 'c', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'c'], [null, null, 0, 2, 2, 2, 2, 2, 2, null], [56, 7, 10, 14, 14, 14, 16, 18, 14, 10]);
}

export function tablaPuntosInspeccion(r: Resultados, c: Control): Tabla {
  const filas = c.calidad.puntos.map((p) => f([partida(r, p.partidaId), p.control, p.tipo, p.norma, p.metodo, p.frecuencia, p.criterio, p.responsable, p.registro, c.series.find((s) => s.id === p.serieId)?.nombre ?? '']));
  return T('ctl_ppi', 'PLAN DE PUNTOS DE INSPECCIÓN (ISO 9001)', ['Partida', 'Qué se controla', 'Tipo', 'Norma', 'Método', 'Frecuencia', 'Criterio de aceptación', 'Responsable', 'Registro', 'Serie de ensayos'], filas, ['l', 'l', 'c', 'l', 'l', 'l', 'l', 'l', 'l', 'l'], Array(10).fill(null), [36, 30, 6, 28, 20, 20, 40, 20, 26, 22]);
}

export function tablaProtocolos(r: Resultados, c: Control): Tabla {
  const res = Object.fromEntries(RESULTADOS_PROTOCOLO.map((x) => [x.id, x.texto]));
  const orden = [...c.calidad.protocolos].sort((a, b) => partida(r, a.partidaId).localeCompare(partida(r, b.partidaId), 'es', { numeric: true }) || a.numero.localeCompare(b.numero));
  const filas: Fila[] = [];
  let actual = '';
  for (const p of orden) {
    if (p.partidaId !== actual) {
      actual = p.partidaId;
      filas.push(f([partida(r, p.partidaId) || 'Sin partida', null, null, null, null, null, null, null], 'subtitulo'));
    }
    filas.push(f([p.numero, fc(p.fecha), frente(c, p.frenteId), p.ubicacion, p.metrado, res[p.resultado], p.firmas.map((x) => `${x.rol}: ${x.firmado ? x.nombre || 'firmado' : 'pendiente'}`).join(' · '), protocoloLiberado(p) ? 'LIBERADO' : 'Pendiente']));
  }
  return T('ctl_protocolos', 'DOSSIER DE CALIDAD: PROTOCOLOS POR PARTIDA', ['Protocolo', 'Fecha', 'Frente', 'Ubicación', 'Metrado', 'Resultado', 'Firmas', 'Liberación'], filas, ['l', 'c', 'l', 'l', 'r', 'c', 'l', 'c'], [null, null, null, null, 2, null, null, null], [12, 11, 22, 16, 11, 13, 70, 12]);
}

export function tablaPnc(r: Resultados, c: Control): Tabla {
  const disp = Object.fromEntries(DISPOSICIONES_PNC.map((x) => [x.id, x.texto]));
  const est = { abierto: 'Abierto', tratamiento: 'En tratamiento', cerrado: 'Cerrado' };
  const filas = c.calidad.pnc.map((x) => f([x.numero, fc(x.fecha), partida(r, x.partidaId), x.descripcion, disp[x.disposicion] ?? '', x.causaRaiz, x.acciones.map((a) => `${a.hecho ? '✔' : '○'} ${a.accion}`).join(' · '), x.verificacion, x.costo, est[x.estado], fc(x.fechaCierre)]));
  return T('ctl_pnc', 'PRODUCTOS NO CONFORMES Y ACCIONES CORRECTIVAS', ['N.°', 'Fecha', 'Partida', 'Descripción', 'Disposición', 'Causa raíz', 'Acciones', 'Verificación de eficacia', 'Costo', 'Estado', 'Cierre'], filas, ['l', 'c', 'l', 'l', 'l', 'l', 'l', 'l', 'r', 'c', 'c'], [null, null, null, null, null, null, null, null, 2, null, null], [10, 11, 30, 40, 18, 30, 50, 34, 11, 13, 11]);
}

export function tablaLiberacion(_r: Resultados, c: Control): Tabla {
  const filas = liberacionPorFrente(c).map((x) => f([x.nombre, x.emitidos, x.liberados, x.indice, x.puntos, x.cubiertos, x.cobertura, x.pncAbiertos]));
  return T('ctl_liberacion', 'ÍNDICE DE LIBERACIÓN POR FRENTE', ['Frente', 'Protocolos', 'Liberados', 'Índice %', 'Puntos aplicables', 'Puntos cubiertos', 'Cobertura %', 'PNC abiertos'], filas, ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], [null, 0, 0, 1, 0, 0, 1, 0], [34, 12, 12, 11, 14, 14, 12, 12]);
}

export function tablaMetas(r: Resultados, c: Control): Tabla {
  const m = calcularMetas(r, c.valor);
  const filas: Fila[] = [
    ...m.filas.map((x) => f([`${x.codigo} ${x.descripcion}`, x.estimado, x.meta, x.ahorroAprobado, x.estimadoConAprobadas, x.brecha, x.brechaPct, x.alternativas])),
    f(['TOTAL COSTO DIRECTO', m.estimado, m.meta, m.estimado - m.estimadoConAprobadas, m.estimadoConAprobadas, m.brecha, m.brechaPct, c.valor.alternativas.length], 'total'),
    f(['Seguimiento de la brecha', null, null, null, null, null, null, null], 'subtitulo'),
    ...c.valor.seguimiento.map((s) => f([`${fc(s.fecha)} ${s.nota}`, s.estimado, s.meta, null, null, s.estimado - s.meta, s.meta ? ((s.estimado - s.meta) / s.meta) * 100 : null, null])),
  ];
  return T('ctl_metas', 'TARGET VALUE DESIGN: COSTO META POR TÍTULO', ['Título', 'Estimado', 'Costo meta', 'Ahorro aprobado', 'Estimado con aprobadas', 'Brecha', 'Brecha %', 'Alternativas'], filas, ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], [null, 2, 2, 2, 2, 2, 1, 0], [50, 15, 15, 15, 17, 14, 10, 12]);
}

export function tablaAlternativas(r: Resultados, c: Control): Tabla {
  const v = c.valor;
  const est = { propuesta: 'Propuesta', aprobada: 'Aprobada', rechazada: 'Rechazada', aplicada: 'Aplicada' };
  const filas = v.alternativas.map((a) => {
    const c1 = costoAlternativa(r, a);
    return f([a.codigo, nombreAmbito(r, a.ambitoId), a.descripcion, a.estado === 'aplicada' ? a.respaldo?.costoAnterior ?? null : costoActual(r, a.ambitoId), c1, a.plazoDias, a.funcion, indiceValor(r, v, a), puntajePonderado(v.criterios, a.puntajes), a.ventajas, a.riesgos, est[a.estado]]);
  });
  return T('ctl_alternativas', 'INGENIERÍA DE VALOR: ALTERNATIVAS Y MATRIZ DE DECISIÓN', ['Código', 'Partida / título', 'Alternativa', 'Costo actual', 'Costo alternativa', 'Δ plazo (d)', 'Función', 'Índice de valor', 'Puntaje ponderado', 'Ventajas', 'Riesgos', 'Estado'], filas, ['l', 'l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'l', 'l', 'c'], [null, null, null, 2, 2, 0, 1, 2, 2, null, null, null], [9, 36, 40, 14, 14, 10, 9, 11, 12, 30, 30, 11]);
}

export function tablasMetodologias(r: Resultados, c: Control, hoy: string): { hoja: string; tabla: Tabla }[] {
  const res: { hoja: string; tabla: Tabla }[] = [];
  if (r.programa.actividades.length) {
    res.push({ hoja: 'Riesgo Monte Carlo', tabla: tablaRiesgo(r, c) }, { hoja: 'Criticidad', tabla: tablaCriticidad(r, c) }, { hoja: 'Cadena crítica', tabla: tablaCcpm(r, c) });
  }
  res.push(
    { hoja: 'Kanban materiales', tabla: tablaKanban(r, c, hoy) },
    { hoja: 'Plan de inspección', tabla: tablaPuntosInspeccion(r, c) },
    { hoja: 'Protocolos', tabla: tablaProtocolos(r, c) },
    { hoja: 'PNC', tabla: tablaPnc(r, c) },
    { hoja: 'Liberación por frente', tabla: tablaLiberacion(r, c) },
    { hoja: 'Costo meta', tabla: tablaMetas(r, c) },
    { hoja: 'Alternativas VE', tabla: tablaAlternativas(r, c) },
  );
  return res;
}

/** Fecha de análisis por defecto: el último corte de control o, sin cortes, hoy. */
export const fechaAnalisis = (c: Control, hoy: string) => c.cortes.reduce((m, k) => (k.fecha > m ? k.fecha : m), '') || hoy;

/** Dossier de calidad: plan de inspección, protocolos por partida, PNC e índice de liberación. */
export const tablasDossier = (r: Resultados, c: Control) => [
  { hoja: 'Plan de inspección', tabla: tablaPuntosInspeccion(r, c) },
  { hoja: 'Protocolos', tabla: tablaProtocolos(r, c) },
  { hoja: 'PNC', tabla: tablaPnc(r, c) },
  { hoja: 'Liberación por frente', tabla: tablaLiberacion(r, c) },
];
