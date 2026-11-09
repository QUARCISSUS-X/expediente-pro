// Adicionales, deductivos, ampliaciones y matriz de riesgos.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { type Resultados } from '../types';
import { num, redondear } from '../util';
import { type Control, type Riesgo } from './modelo';

// ======================================================================= cambios y riesgos

export interface ResumenCambios {
  contractual: number;
  plazoContractual: number;
  adicionales: number;
  deductivos: number;
  vigente: number;
  incidenciaPct: number; // (adicionales − deductivos) / contractual
  incidenciaAdicionalesPct: number;
  ampliacionDias: number;
  plazoVigente: number;
  pendientes: number;
  alerta: string | null;
}

export function resumirCambios(r: Resultados, c: Control): ResumenCambios {
  const contractual = c.lineaBase?.subtotal ?? r.pie.subtotal;
  const plazo = c.lineaBase?.plazoDias ?? r.programa.plazoDias;
  const ap = c.cambios.filter((x) => x.estado === 'aprobado');
  const adicionales = ap.filter((x) => x.tipo === 'adicional').reduce((s, x) => s + num(x.monto), 0);
  const deductivos = ap.filter((x) => x.tipo === 'deductivo').reduce((s, x) => s + Math.abs(num(x.monto)), 0);
  const ampliacion = ap.reduce((s, x) => s + num(x.plazoDias), 0);
  const inc = contractual > 0 ? ((adicionales - deductivos) / contractual) * 100 : 0;
  const incAd = contractual > 0 ? (adicionales / contractual) * 100 : 0;
  return {
    contractual,
    plazoContractual: plazo,
    adicionales: redondear(adicionales),
    deductivos: redondear(deductivos),
    vigente: redondear(contractual + adicionales - deductivos),
    incidenciaPct: inc,
    incidenciaAdicionalesPct: incAd,
    ampliacionDias: ampliacion,
    plazoVigente: plazo + ampliacion,
    pendientes: c.cambios.filter((x) => x.estado === 'propuesto').length,
    alerta: r.proyecto.meta.modo === 'publico' && inc > 15 ? 'Los adicionales netos superan el 15 % del monto contractual: revise los límites y aprobaciones que exige la normativa de contrataciones vigente.' : null,
  };
}

export const nivelRiesgo = (x: Pick<Riesgo, 'probabilidad' | 'impacto'>) => num(x.probabilidad, 1) * num(x.impacto, 1);
export function claseRiesgo(n: number): { clave: 'bajo' | 'moderado' | 'alto' | 'critico'; texto: string } {
  if (n >= 15) return { clave: 'critico', texto: 'Crítico' };
  if (n >= 10) return { clave: 'alto', texto: 'Alto' };
  if (n >= 5) return { clave: 'moderado', texto: 'Moderado' };
  return { clave: 'bajo', texto: 'Bajo' };
}
