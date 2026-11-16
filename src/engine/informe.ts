// Informe semanal y mensual de obra: arma del periodo elegido el avance, la curva S, el valor ganado, el PPC, las restricciones,
// la calidad, los cambios, los riesgos, el cuaderno y las fotos; sale como Documento (Word y PDF) y como variables para plantillas.
import { datosCabecera, variablesProyecto } from './cabecera';
import { protocoloLiberado } from './calidad';
import {
  calcularEvm, calcularPpc, calcularTablero, calcularValorizaciones, type Control, cortesOrdenados, lunesDe, nivelRiesgo, normalizarControl, pareto,
  resumirCambios, type Adjunto, type PlantillaInforme, type SeccionInforme, type Tablero,
} from './control';
import { type Bloque, type Documento, firmasProyecto } from './documentos';
import type { Logo, Resultados } from './types';
import { fechaCorta, fechaLarga, fmt, num, redondear, sumarDias } from './util';

export type TipoInforme = 'semanal' | 'mensual';

export const SECCIONES_INFORME: { id: SeccionInforme; nombre: string }[] = [
  { id: 'resumen', nombre: 'Resumen del periodo e indicadores' },
  { id: 'avance', nombre: 'Avance físico por partida' },
  { id: 'curva', nombre: 'Curva S programada contra real' },
  { id: 'evm', nombre: 'Valor ganado (PV, EV, AC, SPI, CPI)' },
  { id: 'valorizacion', nombre: 'Valorización del mes' },
  { id: 'ppc', nombre: 'Plan semanal: PPC y causas de no cumplimiento' },
  { id: 'restricciones', nombre: 'Restricciones' },
  { id: 'calidad', nombre: 'Calidad: protocolos y no conformidades' },
  { id: 'cambios', nombre: 'Cambios: adicionales, deductivos y ampliaciones' },
  { id: 'riesgos', nombre: 'Riesgos abiertos' },
  { id: 'bitacora', nombre: 'Cuaderno de obra y consultas del periodo' },
  { id: 'fotos', nombre: 'Panel fotográfico' },
  { id: 'firmas', nombre: 'Firmas' },
];

export const NOMBRE_SECCION = Object.fromEntries(SECCIONES_INFORME.map((s) => [s.id, s.nombre])) as Record<SeccionInforme, string>;

/** Plantilla inicial del constructor: todas las secciones (el semanal sin valorización). */
export function plantillaInicial(tipo: TipoInforme): PlantillaInforme {
  return {
    id: `pli-${tipo}`,
    nombre: tipo === 'semanal' ? 'Informe semanal completo' : 'Informe mensual completo',
    tipo,
    secciones: SECCIONES_INFORME.map((s) => s.id).filter((s) => tipo === 'mensual' || s !== 'valorizacion'),
    logoProyectista: true,
    logoCliente: true,
  };
}

// ------------------------------------------------------------ periodos

export interface Periodo {
  tipo: TipoInforme;
  inicio: string;
  fin: string;
  titulo: string; // «Semana del 02/03/2026 al 08/03/2026», «Marzo de 2026»
  numero: number; // semana o mes de obra (1 = el del inicio de la línea base)
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function finDeMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes}-${String(d).padStart(2, '0')}`;
}

/** Periodo (semana de lunes a domingo, o mes calendario) que contiene la fecha. */
export function periodoDe(tipo: TipoInforme, fecha: string, inicioObra = fecha): Periodo {
  if (tipo === 'semanal') {
    const inicio = lunesDe(fecha);
    const n = Math.floor((Date.parse(inicio) - Date.parse(lunesDe(inicioObra))) / (7 * 86400000)) + 1;
    return { tipo, inicio, fin: sumarDias(inicio, 6), titulo: `Semana del ${fechaCorta(inicio)} al ${fechaCorta(sumarDias(inicio, 6))}`, numero: Math.max(1, n) };
  }
  const mes = fecha.slice(0, 7);
  const [a, m] = mes.split('-').map(Number);
  const [a0, m0] = inicioObra.slice(0, 7).split('-').map(Number);
  const nombre = MESES[m - 1] ?? mes;
  return { tipo, inicio: `${mes}-01`, fin: finDeMes(mes), titulo: `${nombre[0].toUpperCase()}${nombre.slice(1)} de ${a}`, numero: Math.max(1, (a - a0) * 12 + (m - m0) + 1) };
}

/** Periodos con al menos un corte de avance, del más reciente al más antiguo. */
export function periodosConAvance(r: Resultados, tipo: TipoInforme): Periodo[] {
  const c = normalizarControl(r.proyecto.control);
  const inicio = c.lineaBase?.inicio ?? r.proyecto.meta.fechaInicio ?? '';
  const vistos = new Map<string, Periodo>();
  for (const k of cortesOrdenados(c)) {
    const p = periodoDe(tipo, k.fecha, inicio || k.fecha);
    vistos.set(p.inicio, p);
  }
  return [...vistos.values()].reverse();
}

// ------------------------------------------------------------ datos

const dentro = (f: string | undefined, p: Periodo) => !!f && f >= p.inicio && f <= p.fin;

/** El control tal como estaba al cierre del periodo (los cortes posteriores no cuentan). */
export function controlAlCierre(c: Control, fin: string): Control {
  return { ...c, cortes: c.cortes.filter((k) => k.fecha <= fin) };
}

export interface FilaAvanceInforme {
  partidaId: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  metradoBase: number;
  periodo: number; // metrado ejecutado en el periodo
  acumulado: number;
  avancePct: number;
  montoPeriodo: number; // a costo directo de la línea base
}

export interface DatosInforme {
  periodo: Periodo;
  tablero: Tablero; // al cierre del periodo: las mismas cifras que el tablero de Control a esa fecha
  avancePeriodoReal: number | null; // puntos porcentuales ganados en el periodo
  avancePeriodoProgramado: number | null;
  montoPeriodo: number; // EV ganado en el periodo
  partidas: FilaAvanceInforme[];
  curva: { etiqueta: string; plan: number; real: number | null }[];
  cortes: { nombre: string; fecha: string; pv: number; ev: number; ac: number | null; spi: number; cpi: number | null }[];
  bac: number;
  valorizacion: ReturnType<typeof calcularValorizaciones>[number] | null;
  ppc: { semana: string; comprometidos: number; cumplidos: number; ppc: number | null }[];
  causas: { causa: string; veces: number; pct: number }[];
  restriccionesAbiertas: { partida: string; tipo: string; descripcion: string; responsable: string; requerida: string; vencida: boolean }[];
  restriccionesLiberadas: number;
  protocolos: { numero: string; partida: string; fecha: string; resultado: string; liberado: boolean }[];
  pnc: { numero: string; partida: string; fecha: string; descripcion: string; estado: string }[];
  cambiosPeriodo: { numero: string; tipo: string; fecha: string; descripcion: string; monto: number; plazo: number; estado: string }[];
  cambios: ReturnType<typeof resumirCambios>;
  riesgos: { descripcion: string; nivel: number; respuesta: string; responsable: string }[];
  registros: { tipo: string; numero: string; fecha: string; asunto: string; estado: string }[];
  fotos: Adjunto[];
}

const nombrePartida = (r: Resultados) => {
  const m = new Map(r.hojas.map((h) => [h.partida.id, `${h.partida.codigo} ${h.partida.descripcion}`]));
  return (id: string | undefined) => (id ? m.get(id) ?? '' : '');
};

export function datosInforme(r: Resultados, periodo: Periodo): DatosInforme {
  const c = normalizarControl(r.proyecto.control);
  const cc = controlAlCierre(c, periodo.fin);
  const tablero = calcularTablero(r, cc, periodo.fin);
  const evm = calcularEvm(r, cc);
  const np = nombrePartida(r);
  const puntos = evm?.puntos ?? [];
  const ultimo = puntos[puntos.length - 1] ?? null;
  const previo = [...puntos].reverse().find((p) => p.fecha < periodo.inicio) ?? null;
  const enPeriodo = puntos.filter((p) => dentro(p.fecha, periodo));
  const hayAvance = enPeriodo.length > 0;
  // metrados del periodo por partida
  const delPeriodo: Record<string, number> = {};
  const acum: Record<string, number> = {};
  for (const k of cc.cortes) {
    for (const [id, m] of Object.entries(k.metrados)) {
      acum[id] = (acum[id] ?? 0) + num(m);
      if (dentro(k.fecha, periodo)) delPeriodo[id] = (delPeriodo[id] ?? 0) + num(m);
    }
  }
  const partidas: FilaAvanceInforme[] = (c.lineaBase?.partidas ?? [])
    .filter((b) => (delPeriodo[b.id] ?? 0) !== 0)
    .map((b) => ({
      partidaId: b.id,
      codigo: b.codigo,
      descripcion: b.descripcion,
      unidad: b.unidad,
      metradoBase: b.metrado,
      periodo: redondear(delPeriodo[b.id] ?? 0),
      acumulado: redondear(acum[b.id] ?? 0),
      avancePct: b.metrado > 0 ? Math.min(100, ((acum[b.id] ?? 0) / b.metrado) * 100) : 0,
      montoPeriodo: redondear((delPeriodo[b.id] ?? 0) * b.pu),
    }));
  // curva S: plan semanal hasta el fin de la línea base; real en cada corte hasta el cierre
  const curva: DatosInforme['curva'] = [];
  if (evm) {
    const reales = [...puntos];
    for (const p of evm.curvaPlan) {
      const real = reales.filter((x) => x.fecha <= p.fecha).pop();
      curva.push({ etiqueta: fechaCorta(p.fecha), plan: redondear(p.pct, 2), real: p.fecha <= periodo.fin && real ? redondear(real.evPct, 2) : null });
    }
  }
  // valorización del mes (solo en el informe mensual)
  const vals = periodo.tipo === 'mensual' && c.lineaBase ? calcularValorizaciones(r, cc) : [];
  const valorizacion = vals.find((v) => v.mes === periodo.inicio.slice(0, 7)) ?? null;
  // Last Planner
  const ppcSem = calcularPpc(c).semanas.filter((s) => dentro(s.lunes, periodo) || (periodo.tipo === 'semanal' && s.lunes === periodo.inicio));
  const idsSem = new Set(ppcSem.map((s) => s.semanaId));
  const causasMap: Record<string, number> = {};
  for (const s of c.semanas) if (idsSem.has(s.id)) for (const x of s.compromisos) if (x.cumplido === false) causasMap[x.causa || 'Sin causa registrada'] = (causasMap[x.causa || 'Sin causa registrada'] ?? 0) + 1;
  // restricciones al cierre
  const abiertas = c.restricciones.filter((x) => !x.liberada || (x.fechaLiberacion && x.fechaLiberacion > periodo.fin));
  const q = c.calidad;
  const nombreTipo: Record<string, string> = { adicional: 'Adicional', deductivo: 'Deductivo', ampliacion: 'Ampliación de plazo', otro: 'Otro' };
  return {
    periodo,
    tablero,
    avancePeriodoReal: hayAvance && ultimo ? redondear(ultimo.evPct - (previo?.evPct ?? 0), 2) : null,
    avancePeriodoProgramado: hayAvance && ultimo ? redondear(ultimo.pvPct - (previo?.pvPct ?? 0), 2) : null,
    montoPeriodo: hayAvance && ultimo ? redondear(ultimo.ev - (previo?.ev ?? 0)) : 0,
    partidas,
    curva,
    cortes: puntos.map((p) => ({ nombre: p.nombre, fecha: p.fecha, pv: p.pv, ev: p.ev, ac: p.ac, spi: p.spi, cpi: p.cpi })),
    bac: evm?.bac ?? 0,
    valorizacion,
    ppc: ppcSem.map((s) => ({ semana: fechaCorta(s.lunes), comprometidos: s.total, cumplidos: s.cumplidos, ppc: s.ppc })),
    causas: pareto(causasMap).map((x) => ({ causa: x.clave, veces: x.valor, pct: x.pct })),
    restriccionesAbiertas: abiertas.map((x) => ({ partida: np(x.partidaId), tipo: x.tipo, descripcion: x.descripcion, responsable: x.responsable, requerida: x.fechaRequerida, vencida: !!x.fechaRequerida && x.fechaRequerida < periodo.fin })),
    restriccionesLiberadas: c.restricciones.filter((x) => x.liberada && dentro(x.fechaLiberacion, periodo)).length,
    protocolos: q.protocolos.filter((x) => dentro(x.fecha, periodo)).map((x) => ({ numero: x.numero, partida: np(x.partidaId), fecha: x.fecha, resultado: x.resultado, liberado: protocoloLiberado(x) })),
    pnc: q.pnc.filter((x) => dentro(x.fecha, periodo) || (x.estado !== 'cerrado' && x.fecha <= periodo.fin)).map((x) => ({ numero: x.numero, partida: np(x.partidaId), fecha: x.fecha, descripcion: x.descripcion, estado: x.estado })),
    cambiosPeriodo: c.cambios.filter((x) => dentro(x.fecha, periodo)).map((x) => ({ numero: x.numero, tipo: nombreTipo[x.tipo] ?? x.tipo, fecha: x.fecha, descripcion: x.descripcion, monto: num(x.monto), plazo: num(x.plazoDias), estado: x.estado })),
    cambios: tablero.cambios,
    riesgos: c.riesgos.filter((x) => x.estado !== 'cerrado').map((x) => ({ descripcion: x.descripcion, nivel: nivelRiesgo(x), respuesta: x.respuesta, responsable: x.responsable })).sort((a, b) => b.nivel - a.nivel),
    registros: c.registros.filter((x) => dentro(x.fecha, periodo)).map((x) => ({ tipo: x.tipo, numero: x.numero, fecha: x.fecha, asunto: x.asunto, estado: x.estado })),
    fotos: c.adjuntos.filter((x) => /^image\/(png|jpe?g)/i.test(x.tipo) && dentro(x.fecha, periodo)),
  };
}

// ------------------------------------------------------------ documento

const pct = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '—' : `${fmt(v, d)} %`);
const ind = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmt(v, 3));
const fc = (v: string | null | undefined) => (v ? fechaCorta(v) : '—');

export interface OpcionesInforme {
  plantilla?: PlantillaInforme;
  /** Imágenes de las fotos del periodo (id del adjunto → imagen), leídas del almacén de adjuntos. */
  imagenes?: Record<string, Logo>;
}

export function documentoInforme(r: Resultados, d: DatosInforme, op: OpcionesInforme = {}): Documento {
  const pl = op.plantilla ?? plantillaInicial(d.periodo.tipo);
  const m = r.proyecto.meta;
  const mon = m.moneda || 'S/';
  const t = d.tablero;
  const np = nombrePartida(r);
  const b: Bloque[] = [];
  const titulo = d.periodo.tipo === 'semanal' ? 'Informe semanal de obra' : 'Informe mensual de obra';
  b.push({ t: 'kv', pares: [
    ['Periodo', `${d.periodo.titulo} (${d.periodo.tipo === 'semanal' ? 'semana' : 'mes'} ${d.periodo.numero} de obra)`],
    ['Del – al', `${fechaLarga(d.periodo.inicio)} – ${fechaLarga(d.periodo.fin)}`],
    ['Último corte de avance', fc(t.ultimoCorte)],
  ] });
  for (const s of pl.secciones) {
    const h = (texto: string) => b.push({ t: 'h1', texto });
    switch (s) {
      case 'resumen': {
        h('Resumen del periodo');
        if (!t.hayLineaBase) { b.push({ t: 'p', texto: 'El proyecto todavía no tiene línea base: congele una en Control de obra para medir el avance.' }); break; }
        b.push({ t: 'p', alinear: 'just', texto: d.avancePeriodoReal === null
          ? `En el periodo no se registraron cortes de avance. Al cierre, el avance acumulado real es ${pct(t.avanceReal)} contra ${pct(t.avanceProgramado)} programado.`
          : `En el periodo se ganó ${pct(d.avancePeriodoReal)} de avance (${mon} ${fmt(d.montoPeriodo)} a costo directo) contra ${pct(d.avancePeriodoProgramado)} programado. Al cierre, el avance acumulado real es ${pct(t.avanceReal)} y el programado ${pct(t.avanceProgramado)}; el SPI es ${ind(t.spi)} y el CPI ${ind(t.cpi)}.` });
        b.push({ t: 'tabla', cabecera: ['Indicador', 'Al cierre del periodo'], anchos: [60, 40], alinear: ['l', 'r'], filas: [
          ['Avance programado acumulado', pct(t.avanceProgramado)],
          ['Avance real acumulado', pct(t.avanceReal)],
          ['SPI (índice de desempeño del cronograma)', ind(t.spi)],
          ['CPI (índice de desempeño del costo)', ind(t.cpi)],
          ['SPI(t) – cronograma ganado', ind(t.spiT)],
          [`EAC – costo estimado al término (${mon})`, t.eac === null ? '—' : fmt(t.eac)],
          ['Fin estimado (SPI)', fc(t.finEstimado)],
          ['Fin estimado (Earned Schedule)', fc(t.finEstimadoES)],
          ['PPC de la última semana', pct(t.ppcUltimo, 1)],
          ['PPC promedio', pct(t.ppcPromedio, 1)],
          ['Restricciones abiertas / vencidas', `${t.restriccionesAbiertas} / ${t.restriccionesVencidas}`],
          ['Riesgos abiertos / críticos', `${t.riesgosAbiertos} / ${t.riesgosCriticos}`],
          ['Protocolos liberados', pct(t.liberacionCalidad, 1)],
          ['No conformidades abiertas', String(t.pncAbiertos)],
          [`Monto vigente (${mon})`, fmt(t.cambios.vigente)],
        ] });
        break;
      }
      case 'avance':
        h('Avance físico por partida');
        if (!d.partidas.length) { b.push({ t: 'p', texto: 'Sin metrados ejecutados en el periodo.' }); break; }
        b.push({ t: 'tabla', cabecera: ['Ítem', 'Descripción', 'Und.', 'Metrado base', 'Del periodo', 'Acumulado', '% avance', `Monto periodo (${mon})`], anchos: [9, 35, 6, 11, 10, 10, 8, 11], alinear: ['l', 'l', 'c', 'r', 'r', 'r', 'r', 'r'],
          filas: [
            ...d.partidas.map((p) => [p.codigo, p.descripcion, p.unidad, fmt(p.metradoBase), fmt(p.periodo), fmt(p.acumulado), pct(p.avancePct), fmt(p.montoPeriodo)]),
            ['', 'TOTAL DEL PERIODO', '', '', '', '', '', fmt(redondear(d.partidas.reduce((s, p) => s + p.montoPeriodo, 0)))],
          ], negritas: [d.partidas.length] });
        break;
      case 'curva':
        h('Curva S programada contra real');
        if (!d.curva.length) { b.push({ t: 'p', texto: 'Sin línea base.' }); break; }
        b.push({ t: 'curva', titulo: 'Avance acumulado (% del costo directo de la línea base)', puntos: d.curva });
        break;
      case 'evm':
        h('Valor ganado');
        if (!d.cortes.length) { b.push({ t: 'p', texto: 'Sin cortes de avance.' }); break; }
        b.push({ t: 'p', texto: `Presupuesto a la conclusión (BAC): ${mon} ${fmt(d.bac)} a costo directo.` });
        b.push({ t: 'tabla', cabecera: ['Corte', 'Fecha', 'PV', 'EV', 'AC', 'SPI', 'CPI'], anchos: [22, 12, 15, 15, 15, 10, 10], alinear: ['l', 'c', 'r', 'r', 'r', 'r', 'r'],
          filas: d.cortes.map((k) => [k.nombre, fechaCorta(k.fecha), fmt(k.pv), fmt(k.ev), k.ac === null ? '—' : fmt(k.ac), ind(k.spi), ind(k.cpi)]) });
        break;
      case 'valorizacion': {
        h('Valorización del mes');
        const v = d.valorizacion;
        if (!v) { b.push({ t: 'p', texto: 'No hay valorización para este periodo.' }); break; }
        b.push({ t: 'tabla', cabecera: ['Concepto', `Monto (${mon})`], anchos: [65, 35], alinear: ['l', 'r'], negritas: [5, 9], filas: [
          ['Costo directo valorizado', fmt(v.costoDirecto)],
          ['Gastos generales', fmt(v.gg)],
          ['Utilidad', fmt(v.utilidad)],
          [`Reajuste (K = ${v.k === null ? 'sin índices' : fmt(v.k, 3)})`, fmt(v.reajuste)],
          ['Amortización de adelantos', fmt(-(v.amortizacionDirecto + v.amortizacionMateriales))],
          [`Valorización N.° ${v.numero}`, fmt(v.valorizacion)],
          ['Subtotal', fmt(v.subtotal)],
          ['IGV', fmt(v.igv)],
          ['Neto a pagar', fmt(v.neto)],
          ['Acumulado valorizado', `${fmt(v.acumulado)} (${pct(v.acumuladoPct)})`],
        ] });
        break;
      }
      case 'ppc':
        h('Plan semanal: PPC y causas de no cumplimiento');
        if (!d.ppc.length) { b.push({ t: 'p', texto: 'Sin plan semanal en el periodo.' }); break; }
        b.push({ t: 'tabla', cabecera: ['Semana (lunes)', 'Comprometidos', 'Cumplidos', 'PPC'], anchos: [30, 25, 25, 20], alinear: ['c', 'r', 'r', 'r'], filas: d.ppc.map((s) => [s.semana, String(s.comprometidos), String(s.cumplidos), pct(s.ppc, 1)]) });
        if (d.causas.length) b.push({ t: 'tabla', cabecera: ['Causa de no cumplimiento', 'Veces', '%'], anchos: [60, 20, 20], alinear: ['l', 'r', 'r'], filas: d.causas.map((x) => [x.causa, String(x.veces), pct(x.pct, 1)]) });
        break;
      case 'restricciones':
        h('Restricciones');
        b.push({ t: 'p', texto: `Liberadas en el periodo: ${d.restriccionesLiberadas}. Abiertas al cierre: ${d.restriccionesAbiertas.length} (${d.restriccionesAbiertas.filter((x) => x.vencida).length} vencidas).` });
        if (d.restriccionesAbiertas.length) b.push({ t: 'tabla', cabecera: ['Partida', 'Tipo', 'Restricción', 'Responsable', 'Requerida'], anchos: [28, 14, 30, 16, 12], alinear: ['l', 'l', 'l', 'l', 'c'],
          filas: d.restriccionesAbiertas.map((x) => [x.partida, x.tipo, x.descripcion, x.responsable, `${fc(x.requerida)}${x.vencida ? ' (vencida)' : ''}`]) });
        break;
      case 'calidad':
        h('Calidad');
        b.push({ t: 'p', texto: `Protocolos del periodo: ${d.protocolos.length} (${d.protocolos.filter((x) => x.liberado).length} liberados). Liberación acumulada: ${pct(t.liberacionCalidad, 1)}. No conformidades abiertas: ${t.pncAbiertos}.` });
        if (d.protocolos.length) b.push({ t: 'tabla', cabecera: ['Protocolo', 'Partida', 'Fecha', 'Resultado', 'Liberado'], anchos: [14, 40, 14, 18, 14], alinear: ['l', 'l', 'c', 'l', 'c'], filas: d.protocolos.map((x) => [x.numero, x.partida, fc(x.fecha), x.resultado.replace('_', ' '), x.liberado ? 'Sí' : 'No']) });
        if (d.pnc.length) b.push({ t: 'tabla', cabecera: ['PNC', 'Partida', 'Fecha', 'Descripción', 'Estado'], anchos: [10, 28, 12, 38, 12], alinear: ['l', 'l', 'c', 'l', 'l'], filas: d.pnc.map((x) => [x.numero, x.partida, fc(x.fecha), x.descripcion, x.estado]) });
        break;
      case 'cambios': {
        h('Cambios');
        const k = d.cambios;
        b.push({ t: 'tabla', cabecera: ['Concepto', `Monto (${mon}) / días`], anchos: [65, 35], alinear: ['l', 'r'], filas: [
          ['Monto contractual', fmt(k.contractual)], ['Adicionales aprobados', fmt(k.adicionales)], ['Deductivos aprobados', fmt(k.deductivos)], ['Monto vigente', fmt(k.vigente)],
          ['Incidencia neta', pct(k.incidenciaPct)], ['Plazo vigente (días)', String(k.plazoVigente)], ['Cambios por aprobar', String(k.pendientes)],
        ] });
        if (d.cambiosPeriodo.length) b.push({ t: 'tabla', cabecera: ['N.°', 'Tipo', 'Fecha', 'Descripción', 'Monto', 'Días', 'Estado'], anchos: [9, 14, 11, 36, 12, 7, 11], alinear: ['l', 'l', 'c', 'l', 'r', 'r', 'l'],
          filas: d.cambiosPeriodo.map((x) => [x.numero, x.tipo, fc(x.fecha), x.descripcion, fmt(x.monto), String(x.plazo), x.estado]) });
        if (k.alerta) b.push({ t: 'p', negrita: true, texto: k.alerta });
        break;
      }
      case 'riesgos':
        h('Riesgos abiertos');
        if (!d.riesgos.length) { b.push({ t: 'p', texto: 'Sin riesgos abiertos.' }); break; }
        b.push({ t: 'p', texto: `Contingencia de los riesgos abiertos: ${mon} ${fmt(t.contingencia)}.` });
        b.push({ t: 'tabla', cabecera: ['Riesgo', 'Nivel (P×I)', 'Respuesta', 'Responsable'], anchos: [52, 14, 16, 18], alinear: ['l', 'c', 'l', 'l'], filas: d.riesgos.map((x) => [x.descripcion, `${x.nivel}${x.nivel >= 15 ? ' crítico' : ''}`, x.respuesta, x.responsable]) });
        break;
      case 'bitacora':
        h('Cuaderno de obra y consultas');
        if (!d.registros.length) { b.push({ t: 'p', texto: 'Sin asientos ni consultas en el periodo.' }); break; }
        b.push({ t: 'tabla', cabecera: ['Tipo', 'N.°', 'Fecha', 'Asunto', 'Estado'], anchos: [12, 10, 12, 52, 14], alinear: ['l', 'l', 'c', 'l', 'l'], filas: d.registros.map((x) => [x.tipo.toUpperCase(), x.numero, fc(x.fecha), x.asunto, x.estado]) });
        break;
      case 'fotos': {
        h('Panel fotográfico');
        const conImagen = d.fotos.filter((f) => op.imagenes?.[f.id]);
        if (!conImagen.length) { b.push({ t: 'p', texto: d.fotos.length ? `Hay ${d.fotos.length} fotos del periodo, pero no se pudieron leer.` : 'Sin fotos registradas en el periodo.' }); break; }
        for (const f of conImagen) {
          const ref = [np(f.partidaId), f.protocoloId ? `protocolo ${r.proyecto.control?.calidad?.protocolos?.find((x) => x.id === f.protocoloId)?.numero ?? ''}` : ''].filter(Boolean).join(' · ');
          b.push({ t: 'imagen', imagen: op.imagenes![f.id], anchoMax: 420, pie: `${fechaCorta(f.fecha)} – ${f.descripcion || f.nombre}${ref ? ` (${ref})` : ''}` });
        }
        break;
      }
      case 'firmas':
        b.push(firmasProyecto(r));
        break;
    }
  }
  return { titulo: `${titulo} – ${d.periodo.titulo}`, sigla: d.periodo.tipo === 'semanal' ? 'ISO' : 'IMO', bloques: b, portada: true, indice: false };
}

// ------------------------------------------------------------ plantillas de Word propias

/** Marcadores que se pueden escribir en una plantilla de Word propia, con su explicación. */
export const MARCADORES_INFORME: [string, string][] = [
  ['proyecto', 'Nombre del proyecto'], ['codigo', 'Código del proyecto'], ['cliente', 'Cliente'], ['proyectista', 'Proyectista o contratista'], ['ubicacion', 'Ubicación'],
  ['periodo', 'Título del periodo'], ['tipo_informe', 'Semanal o mensual'], ['numero_periodo', 'N.° de semana o mes de obra'], ['fecha_inicio', 'Inicio del periodo'], ['fecha_fin', 'Fin del periodo'],
  ['fecha_emision', 'Fecha de hoy'], ['avance_programado', '% programado acumulado'], ['avance_real', '% real acumulado'], ['avance_periodo', '% ganado en el periodo'],
  ['monto_periodo', 'EV del periodo'], ['spi', 'SPI'], ['cpi', 'CPI'], ['eac', 'EAC'], ['fin_estimado', 'Fin estimado'], ['ppc', 'PPC de la última semana'],
  ['ppc_promedio', 'PPC promedio'], ['restricciones_abiertas', 'Restricciones abiertas'], ['riesgos_criticos', 'Riesgos críticos'], ['pnc_abiertos', 'No conformidades abiertas'],
  ['monto_vigente', 'Monto vigente'], ['valorizacion', 'Valorización del mes'], ['neto_pagar', 'Neto a pagar del mes'], ['resumen', 'Párrafo de resumen del periodo'],
  ['partidas_periodo', 'Lista de partidas ejecutadas (una por línea)'], ['restricciones', 'Lista de restricciones abiertas'], ['cuaderno', 'Lista de asientos y consultas'],
];

export function variablesInforme(r: Resultados, d: DatosInforme, hoy: string): Record<string, string> {
  const t = d.tablero;
  const mon = r.proyecto.meta.moneda || 'S/';
  const cab = datosCabecera(r.proyecto);
  const doc = documentoInforme(r, d, { plantilla: { ...plantillaInicial(d.periodo.tipo), secciones: ['resumen'] } });
  const resumen = doc.bloques.find((x): x is Extract<Bloque, { t: 'p' }> => x.t === 'p')?.texto ?? '';
  return {
    ...variablesProyecto(r.proyecto),
    proyectista: cab.proyectista,
    cliente: cab.cliente,
    periodo: d.periodo.titulo,
    tipo_informe: d.periodo.tipo === 'semanal' ? 'semanal' : 'mensual',
    numero_periodo: String(d.periodo.numero),
    fecha_inicio: fechaCorta(d.periodo.inicio),
    fecha_fin: fechaCorta(d.periodo.fin),
    fecha_emision: fechaLarga(hoy),
    avance_programado: pct(t.avanceProgramado),
    avance_real: pct(t.avanceReal),
    avance_periodo: pct(d.avancePeriodoReal),
    monto_periodo: `${mon} ${fmt(d.montoPeriodo)}`,
    spi: ind(t.spi),
    cpi: ind(t.cpi),
    eac: t.eac === null ? '—' : `${mon} ${fmt(t.eac)}`,
    fin_estimado: fc(t.finEstimado),
    ppc: pct(t.ppcUltimo, 1),
    ppc_promedio: pct(t.ppcPromedio, 1),
    restricciones_abiertas: String(t.restriccionesAbiertas),
    riesgos_criticos: String(t.riesgosCriticos),
    pnc_abiertos: String(t.pncAbiertos),
    monto_vigente: `${mon} ${fmt(t.cambios.vigente)}`,
    valorizacion: d.valorizacion ? `${mon} ${fmt(d.valorizacion.valorizacion)}` : '—',
    neto_pagar: d.valorizacion ? `${mon} ${fmt(d.valorizacion.neto)}` : '—',
    resumen,
    partidas_periodo: d.partidas.map((p) => `${p.codigo} ${p.descripcion}: ${fmt(p.periodo)} ${p.unidad} (${pct(p.avancePct)} acumulado)`).join('\n') || 'Sin metrados en el periodo.',
    restricciones: d.restriccionesAbiertas.map((x) => `${x.descripcion} – ${x.responsable || 'sin responsable'} – ${fc(x.requerida)}`).join('\n') || 'Sin restricciones abiertas.',
    cuaderno: d.registros.map((x) => `${x.tipo.toUpperCase()} ${x.numero} (${fc(x.fecha)}): ${x.asunto}`).join('\n') || 'Sin asientos en el periodo.',
  };
}
