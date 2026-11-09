// Tablero de indicadores clave de todas las fases.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { resumenCalidad } from '../calidad';
import { ccpmDePrograma, puntosFiebre } from '../ccpm';
import { resumenKanban } from '../kanban';
import { type ResumenRiesgo } from '../riesgo';
import { type Resultados } from '../types';
import { num, redondear } from '../util';
import { calcularMetas } from '../valor';
import { nivelRiesgo, type ResumenCambios, resumirCambios } from './cambios';
import { calcularEvm } from './evm';
import { hoyIso } from './fechas';
import { puntajeInspeccion, rendimientosPorPartida, resumenCarta } from './lean';
import { calcularPpc, resumenRestricciones } from './lps';
import { type Control } from './modelo';

// ======================================================================= tablero

export interface Tablero {
  hayLineaBase: boolean;
  avanceProgramado: number | null;
  avanceReal: number | null;
  spi: number | null;
  cpi: number | null;
  eac: number | null;
  finEstimado: string | null;
  ultimoCorte: string | null;
  ppcUltimo: number | null;
  ppcPromedio: number | null;
  restriccionesAbiertas: number;
  restriccionesVencidas: number;
  riesgosCriticos: number;
  riesgosAbiertos: number;
  contingencia: number;
  cambios: ResumenCambios;
  registrosAbiertos: number;
  registrosVencidos: number;
  ipPromedio: number | null;
  desviacionMo: number;
  tpPromedio: number | null;
  inspeccionPromedio: number | null;
  dmaicActivos: number;
  // versión 2.5
  spiT: number | null; // Earned Schedule
  svT: number | null; // días laborables
  finEstimadoES: string | null;
  riesgo: ResumenRiesgo | null; // último resultado guardado de Monte Carlo
  riesgoDesactualizado: boolean;
  colchonConsumo: number | null; // % del colchón del proyecto consumido (cadena crítica)
  colchonZona: 'verde' | 'amarillo' | 'rojo' | null;
  avanceCadena: number | null;
  kanbanQuiebres: number;
  kanbanPorPedir: number;
  liberacionCalidad: number | null; // % de protocolos liberados
  pncAbiertos: number;
  brechaMeta: number | null; // estimado con alternativas aprobadas − costo meta
  brechaMetaPct: number | null;
}

export function calcularTablero(r: Resultados, c: Control, hoy = hoyIso(), huellaRiesgo?: string): Tablero {
  const evm = calcularEvm(r, c);
  const fiebre = c.lineaBase && c.cortes.length ? puntosFiebre(r, ccpmDePrograma(r, c.ccpm), c.lineaBase, c.cortes) : [];
  const ultF = fiebre[fiebre.length - 1];
  const kb = resumenKanban(c, c.cortes.reduce((m, k) => (k.fecha > m ? k.fecha : m), '') || hoy); // logística al último corte
  const cal = resumenCalidad(c);
  const hayMetas = c.valor.costoPermitido !== null || c.valor.reduccionPct > 0 || Object.keys(c.valor.metas).length > 0;
  const metas = hayMetas ? calcularMetas(r, c.valor) : null;
  const ppc = calcularPpc(c);
  const rest = resumenRestricciones(c, hoy);
  const abiertos = c.riesgos.filter((x) => x.estado !== 'cerrado');
  const rend = rendimientosPorPartida(r, c);
  const conIp = rend.filter((x) => x.ip !== null);
  const hhPlan = conIp.reduce((s, x) => s + x.hhUnidadPlan * x.cantidad, 0);
  const hhReal = conIp.reduce((s, x) => s + x.hh, 0);
  const cartas = c.cartas.map(resumenCarta).filter((x) => x.total > 0);
  const insp = c.inspecciones.map(puntajeInspeccion).filter((x): x is number => x !== null);
  const regAb = c.registros.filter((x) => x.estado === 'abierto');
  return {
    hayLineaBase: !!c.lineaBase,
    avanceProgramado: evm?.ultimo ? evm.ultimo.pvPct : null,
    avanceReal: evm?.ultimo ? evm.ultimo.evPct : null,
    spi: evm?.ultimo ? evm.ultimo.spi : null,
    cpi: evm?.ultimo?.cpi ?? null,
    eac: evm?.ultimo?.eac ?? null,
    finEstimado: evm?.ultimo?.finEstimado ?? null,
    ultimoCorte: evm?.ultimo?.fecha ?? null,
    ppcUltimo: ppc.ultimo?.ppc ?? null,
    ppcPromedio: ppc.promedio,
    restriccionesAbiertas: rest.abiertas,
    restriccionesVencidas: rest.vencidas,
    riesgosCriticos: abiertos.filter((x) => nivelRiesgo(x) >= 15).length,
    riesgosAbiertos: abiertos.length,
    contingencia: redondear(abiertos.reduce((s, x) => s + num(x.contingencia), 0)),
    cambios: resumirCambios(r, c),
    registrosAbiertos: regAb.length,
    registrosVencidos: regAb.filter((x) => x.fechaLimite && x.fechaLimite < hoy).length,
    ipPromedio: hhReal > 0 ? hhPlan / hhReal : null,
    desviacionMo: redondear(rend.reduce((s, x) => s + x.desviacionMo, 0)),
    tpPromedio: cartas.length ? cartas.reduce((s, x) => s + x.tp, 0) / cartas.length : null,
    inspeccionPromedio: insp.length ? insp.reduce((a, b) => a + b, 0) / insp.length : null,
    dmaicActivos: c.dmaic.filter((x) => x.fase !== 'cerrado').length,
    spiT: evm?.ultimo?.spiT ?? null,
    svT: evm?.ultimo ? evm.ultimo.svT : null,
    finEstimadoES: evm?.ultimo?.finEstimadoES || null,
    riesgo: c.riesgo.resumen,
    riesgoDesactualizado: !!c.riesgo.resumen && !!huellaRiesgo && c.riesgo.resumen.huella !== huellaRiesgo,
    colchonConsumo: ultF ? ultF.consumoPct : null,
    colchonZona: ultF ? ultF.zona : null,
    avanceCadena: ultF ? ultF.avancePct : null,
    kanbanQuiebres: kb.quiebres,
    kanbanPorPedir: kb.porPedirVencidas,
    liberacionCalidad: cal.indiceLiberacion,
    pncAbiertos: cal.pncAbiertos,
    brechaMeta: metas ? metas.brecha : null,
    brechaMetaPct: metas ? metas.brechaPct : null,
  };
}
