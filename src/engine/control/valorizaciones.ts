// Valorizaciones mensuales con reajuste por fórmula polinómica, adelantos e IGV.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { metradoLiberado } from '../integracion';
import { type Resultados } from '../types';
import { num, redondear } from '../util';
import { mesDe } from './fechas';
import { type Control, type PartidaBase } from './modelo';

// ======================================================================= valorizaciones mensuales

export interface Valorizacion {
  mes: string; // yyyy-mm
  numero: number;
  partidas: { base: PartidaBase; metrado: number; monto: number; acumulado: number; acumuladoPct: number; mayorMetrado: number; observado: number; retenido: number }[];
  observado: number; // costo directo valorizado sin liberación de calidad (modo «observar»)
  retenido: number; // costo directo que no se valoriza hasta liberarse (modo «liberado»)
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
  const valorizadoPartida: Record<string, number> = {};
  const soloLiberado = c.valorizarLiberado === 'liberado';
  const metradoBase = (id: string) => lb.partidas.find((b) => b.id === id)?.metrado ?? 0;
  let acumulado = 0;
  return meses.map((mes, i) => {
    const delMes: Record<string, number> = {};
    for (const k of c.cortes) if (mesDe(k.fecha) === mes) for (const [id, v] of Object.entries(k.metrados)) delMes[id] = (delMes[id] ?? 0) + num(v);
    // calidad → valorización: metrado liberado por protocolos hasta el fin del mes (sin puntos de inspección: no se controla)
    const liberado = metradoLiberado(c, `${mes}-31`, metradoBase);
    const partidas = lb.partidas
      .filter((b) => (delMes[b.id] ?? 0) !== 0 || (soloLiberado && Math.min(acumPartida[b.id] ?? 0, b.metrado) > (valorizadoPartida[b.id] ?? 0)))
      .map((b) => {
        const ejec = delMes[b.id] ?? 0;
        const antes = acumPartida[b.id] ?? 0;
        acumPartida[b.id] = antes + ejec;
        // se valoriza hasta el metrado contractual; el exceso es mayor metrado (requiere aprobación)
        const contractual = Math.min(acumPartida[b.id], b.metrado);
        const tope = liberado.has(b.id) ? Math.min(contractual, liberado.get(b.id)!) : contractual;
        const previo = valorizadoPartida[b.id] ?? Math.min(antes, b.metrado);
        const met = Math.max(0, (soloLiberado ? tope : contractual) - previo);
        valorizadoPartida[b.id] = previo + met;
        const sinLiberar = Math.max(0, contractual - tope);
        return {
          base: b,
          metrado: met,
          mayorMetrado: redondear(Math.max(0, acumPartida[b.id] - b.metrado) - Math.max(0, antes - b.metrado), 4),
          monto: redondear(met * b.pu),
          acumulado: acumPartida[b.id],
          acumuladoPct: b.metrado > 0 ? (acumPartida[b.id] / b.metrado) * 100 : 0,
          observado: soloLiberado ? 0 : redondear(Math.min(sinLiberar, met) * b.pu),
          retenido: soloLiberado ? redondear(sinLiberar * b.pu) : 0,
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
      observado: redondear(partidas.reduce((s, p) => s + p.observado, 0)),
      retenido: redondear(partidas.reduce((s, p) => s + p.retenido, 0)),
    };
  });
}
