// Portafolio: todos los proyectos en una tabla (monto, vigente, avance, CPI, SPI, alertas) y su resumen consolidado.
import { calcularTablero, hoyIso, normalizarControl } from './control';
import type { Resultados } from './types';
import { redondear } from './util';

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'sin control';

export interface FilaPortafolio {
  id: string;
  nombre: string;
  codigo: string;
  cliente: string;
  moneda: string;
  monto: number; // total del presupuesto (con IGV si corresponde)
  vigente: number | null; // monto contractual más adicionales menos deductivos (sin IGV), con control
  plazoDias: number;
  avanceProgramado: number | null;
  avanceReal: number | null;
  spi: number | null;
  cpi: number | null;
  eac: number | null;
  ultimoCorte: string | null;
  finEstimado: string | null;
  alertas: string[];
  semaforo: Semaforo;
}

export function filaPortafolio(id: string, r: Resultados, hoy = hoyIso()): FilaPortafolio {
  const p = r.proyecto;
  const c = normalizarControl(p.control);
  const t = calcularTablero(r, c, hoy);
  const alertas: string[] = [];
  if (r.resumenValidacion.errores) alertas.push(`${r.resumenValidacion.errores} errores de validación`);
  if (t.spi !== null && t.spi < 0.9) alertas.push(`Atraso: SPI ${t.spi.toFixed(2)}`);
  if (t.cpi !== null && t.cpi < 0.9) alertas.push(`Sobrecosto: CPI ${t.cpi.toFixed(2)}`);
  if (t.restriccionesVencidas) alertas.push(`${t.restriccionesVencidas} restricciones vencidas`);
  if (t.riesgosCriticos) alertas.push(`${t.riesgosCriticos} riesgos críticos`);
  if (t.pncAbiertos) alertas.push(`${t.pncAbiertos} no conformidades abiertas`);
  if (t.registrosVencidos) alertas.push(`${t.registrosVencidos} consultas vencidas`);
  if (t.cambios.alerta) alertas.push('Adicionales sobre el 15 %');
  const peor = Math.min(t.spi ?? 1, t.cpi ?? 1);
  const semaforo: Semaforo = !t.hayLineaBase ? 'sin control' : peor < 0.9 || t.riesgosCriticos > 0 ? 'rojo' : peor < 0.97 || alertas.length ? 'amarillo' : 'verde';
  return {
    id,
    nombre: p.meta.nombre || 'Proyecto sin nombre',
    codigo: p.meta.codigo || '',
    cliente: p.entidades?.cliente?.nombre || '',
    moneda: p.meta.moneda || 'S/',
    monto: r.pie.total,
    vigente: t.hayLineaBase ? t.cambios.vigente : null,
    plazoDias: r.programa.plazoDias,
    avanceProgramado: t.avanceProgramado,
    avanceReal: t.avanceReal,
    spi: t.spi,
    cpi: t.cpi,
    eac: t.eac,
    ultimoCorte: t.ultimoCorte,
    finEstimado: t.finEstimado,
    alertas,
    semaforo,
  };
}

export interface ResumenPortafolio {
  proyectos: number;
  conControl: number;
  porMoneda: { moneda: string; monto: number; proyectos: number }[];
  avancePonderado: number | null; // % real ponderado por monto (proyectos con control)
  spiPonderado: number | null;
  cpiPonderado: number | null;
  semaforos: Record<Semaforo, number>;
  alertas: number;
}

export function resumenPortafolio(filas: FilaPortafolio[]): ResumenPortafolio {
  const mon = new Map<string, { monto: number; proyectos: number }>();
  for (const f of filas) {
    const x = mon.get(f.moneda) ?? { monto: 0, proyectos: 0 };
    x.monto += f.monto;
    x.proyectos++;
    mon.set(f.moneda, x);
  }
  const pond = (k: 'avanceReal' | 'spi' | 'cpi') => {
    const con = filas.filter((f) => f[k] !== null && f.monto > 0);
    const w = con.reduce((s, f) => s + f.monto, 0);
    return w > 0 ? con.reduce((s, f) => s + (f[k] as number) * f.monto, 0) / w : null;
  };
  const semaforos: Record<Semaforo, number> = { verde: 0, amarillo: 0, rojo: 0, 'sin control': 0 };
  for (const f of filas) semaforos[f.semaforo]++;
  return {
    proyectos: filas.length,
    conControl: filas.filter((f) => f.semaforo !== 'sin control').length,
    porMoneda: [...mon.entries()].map(([moneda, x]) => ({ moneda, monto: redondear(x.monto), proyectos: x.proyectos })),
    avancePonderado: pond('avanceReal'),
    spiPonderado: pond('spi'),
    cpiPonderado: pond('cpi'),
    semaforos,
    alertas: filas.reduce((s, f) => s + f.alertas.length, 0),
  };
}
