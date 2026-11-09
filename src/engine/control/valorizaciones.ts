// Valorizaciones mensuales con reajuste por fórmula polinómica, adelantos e IGV.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { type Resultados } from '../types';
import { num, redondear } from '../util';
import { mesDe } from './fechas';
import { type Control, type PartidaBase } from './modelo';

// ======================================================================= valorizaciones mensuales

export interface Valorizacion {
  mes: string; // yyyy-mm
  numero: number;
  partidas: { base: PartidaBase; metrado: number; monto: number; acumulado: number; acumuladoPct: number; mayorMetrado: number }[];
  costoDirecto: number;
  gg: number;
  utilidad: number;
  valorizacion: number; // sin IGV, sin reajuste
  k: number | null;
  reajuste: number;
  amortizacionDirecto: number;
  amortizacionMateriales: number;
  subtotal: number;
  igv: number;
  neto: number;
  acumulado: number; // valorizaciones acumuladas (sin reajuste ni IGV)
  acumuladoPct: number;
  indicesFaltantes: string[];
}

/** Coeficiente de reajuste K = Σ coef × Σ peso × (Ir / Io). Devuelve null si faltan índices. */
export function coeficienteK(r: Resultados, c: Control, mes: string): { k: number | null; faltantes: string[] } {
  const base = c.indices.base ?? {};
  const delMes = c.indices[mes] ?? {};
  const faltantes = new Set<string>();
  let k = 0;
  for (const m of r.polinomica.monomios) {
    let s = 0;
    for (const ix of m.indices) {
      const io = num(base[ix.iu]);
      const ir = num(delMes[ix.iu]);
      if (!(io > 0) || !(ir > 0)) faltantes.add(ix.iu);
      else s += ix.peso * (ir / io);
    }
    k += m.coeficiente * s;
  }
  return faltantes.size ? { k: null, faltantes: [...faltantes] } : { k: redondear(k, 3), faltantes: [] };
}

export function calcularValorizaciones(r: Resultados, c: Control): Valorizacion[] {
  const lb = c.lineaBase;
  if (!lb) return [];
  const meses = [...new Set(c.cortes.map((k) => mesDe(k.fecha)))].sort();
  const factorGG = lb.costoDirecto > 0 ? lb.gg / lb.costoDirecto : 0;
  const factorUt = lb.costoDirecto > 0 ? lb.utilidad / lb.costoDirecto : 0;
  const m = r.proyecto.meta;
  const igvPct = m.incluirIgv === false ? 0 : num(m.igvPct);
  const acumPartida: Record<string, number> = {};
  let acumulado = 0;
  return meses.map((mes, i) => {
    const delMes: Record<string, number> = {};
    for (const k of c.cortes) if (mesDe(k.fecha) === mes) for (const [id, v] of Object.entries(k.metrados)) delMes[id] = (delMes[id] ?? 0) + num(v);
    const partidas = lb.partidas
      .filter((b) => (delMes[b.id] ?? 0) !== 0)
      .map((b) => {
        const ejec = delMes[b.id] ?? 0;
        const antes = acumPartida[b.id] ?? 0;
        acumPartida[b.id] = antes + ejec;
        // se valoriza hasta el metrado contractual; el exceso es mayor metrado (requiere aprobación)
        const met = Math.max(0, Math.min(acumPartida[b.id], b.metrado) - Math.min(antes, b.metrado));
        return {
          base: b,
          metrado: met,
          mayorMetrado: redondear(ejec - met, 4),
          monto: redondear(met * b.pu),
          acumulado: acumPartida[b.id],
          acumuladoPct: b.metrado > 0 ? (acumPartida[b.id] / b.metrado) * 100 : 0,
        };
      });
    const cd = redondear(partidas.reduce((s, p) => s + p.monto, 0));
    const gg = redondear(cd * factorGG);
    const ut = redondear(cd * factorUt);
    const v = redondear(cd + gg + ut);
    const { k, faltantes } = coeficienteK(r, c, mes);
    const reajuste = k === null ? 0 : redondear(v * (k - 1));
    const amD = redondear((v * num(m.adelantoDirectoPct)) / 100);
    const amM = redondear((v * num(m.adelantoMaterialesPct)) / 100);
    const subtotal = redondear(v + reajuste - amD - amM);
    const igv = redondear((subtotal * igvPct) / 100);
    acumulado += v;
    return {
      mes,
      numero: i + 1,
      partidas,
      costoDirecto: cd,
      gg,
      utilidad: ut,
      valorizacion: v,
      k,
      reajuste,
      amortizacionDirecto: amD,
      amortizacionMateriales: amM,
      subtotal,
      igv,
      neto: redondear(subtotal + igv),
      acumulado: redondear(acumulado),
      acumuladoPct: lb.subtotal > 0 ? (acumulado / lb.subtotal) * 100 : 0,
      indicesFaltantes: faltantes,
    };
  });
}
