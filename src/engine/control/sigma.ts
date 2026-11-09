// Six Sigma: cartas I-MR, capacidad de proceso, Pareto, Ishikawa, DMAIC.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { type ProyectoDmaic } from './modelo';

// ======================================================================= Six Sigma: estadística

export interface CartaIMR {
  valores: number[];
  media: number;
  mrMedia: number;
  lcs: number; // límite de control superior
  lci: number;
  lcsMR: number;
  fuera: number[]; // índices fuera de límites
  rachas: number[]; // índices que completan 7 puntos seguidos al mismo lado de la media
  tendencias: number[]; // índices que completan 6 puntos seguidos subiendo o bajando
  enControl: boolean;
}

/** Carta de control de valores individuales y rango móvil (I-MR). */
export function cartaIMR(valores: number[]): CartaIMR | null {
  const v = valores.filter((x) => isFinite(x));
  if (v.length < 2) return null;
  const media = v.reduce((a, b) => a + b, 0) / v.length;
  const mr = v.slice(1).map((x, i) => Math.abs(x - v[i]));
  const mrMedia = mr.reduce((a, b) => a + b, 0) / mr.length;
  const lcs = media + 2.66 * mrMedia;
  const lci = media - 2.66 * mrMedia;
  const fuera = v.map((x, i) => (x > lcs + 1e-12 || x < lci - 1e-12 ? i : -1)).filter((i) => i >= 0);
  const rachas: number[] = [];
  let lado = 0;
  let cuenta = 0;
  v.forEach((x, i) => {
    const s = x > media ? 1 : x < media ? -1 : 0;
    if (s !== 0 && s === lado) cuenta++;
    else {
      lado = s;
      cuenta = s === 0 ? 0 : 1;
    }
    if (cuenta >= 7) rachas.push(i);
  });
  const tendencias: number[] = [];
  let dir = 0;
  let largo = 1;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] > v[i - 1] ? 1 : v[i] < v[i - 1] ? -1 : 0;
    if (d !== 0 && d === dir) largo++;
    else {
      dir = d;
      largo = d === 0 ? 1 : 2;
    }
    if (largo >= 6) tendencias.push(i);
  }
  return { valores: v, media, mrMedia, lcs, lci, lcsMR: 3.267 * mrMedia, fuera, rachas, tendencias, enControl: !fuera.length && !rachas.length && !tendencias.length };
}

/** Función de distribución normal estándar (aproximación de Abramowitz-Stegun). */
export function normalAcumulada(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export interface Capacidad {
  n: number;
  media: number;
  sigma: number; // desviación estándar muestral
  min: number;
  max: number;
  cp: number | null;
  cpk: number | null;
  fueraObservadoPct: number | null;
  fueraEsperadoPct: number | null;
  dpmo: number | null;
  nivelSigma: number | null; // corto plazo (Cpk × 3 + 1.5)
  histograma: { desde: number; hasta: number; n: number }[];
}

export function capacidadProceso(valores: number[], lei: number | null, les: number | null): Capacidad | null {
  const v = valores.filter((x) => isFinite(x));
  if (v.length < 2) return null;
  const n = v.length;
  const media = v.reduce((a, b) => a + b, 0) / n;
  const sigma = Math.sqrt(v.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1));
  const tieneI = lei !== null && lei !== undefined && isFinite(lei);
  const tieneS = les !== null && les !== undefined && isFinite(les);
  let cp: number | null = null;
  let cpk: number | null = null;
  let fueraEsp: number | null = null;
  if (sigma > 0 && (tieneI || tieneS)) {
    if (tieneI && tieneS) cp = (les! - lei!) / (6 * sigma);
    const cpu = tieneS ? (les! - media) / (3 * sigma) : Infinity;
    const cpl = tieneI ? (media - lei!) / (3 * sigma) : Infinity;
    cpk = Math.min(cpu, cpl);
    fueraEsp = ((tieneS ? 1 - normalAcumulada((les! - media) / sigma) : 0) + (tieneI ? normalAcumulada((lei! - media) / sigma) : 0)) * 100;
  }
  const fueraObs = tieneI || tieneS ? (v.filter((x) => (tieneI && x < lei!) || (tieneS && x > les!)).length / n) * 100 : null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const k = Math.max(5, Math.min(12, Math.ceil(Math.sqrt(n)) + 1));
  const ancho = max > min ? (max - min) / k : 1;
  const histograma = Array.from({ length: k }, (_, i) => ({ desde: min + ancho * i, hasta: min + ancho * (i + 1), n: 0 }));
  for (const x of v) histograma[Math.min(k - 1, Math.floor((x - min) / ancho))].n++;
  return {
    n,
    media,
    sigma,
    min,
    max,
    cp,
    cpk,
    fueraObservadoPct: fueraObs,
    fueraEsperadoPct: fueraEsp,
    dpmo: fueraEsp === null ? null : Math.round(fueraEsp * 10000),
    nivelSigma: cpk === null ? null : cpk * 3 + 1.5,
    histograma,
  };
}

/** Lee una lista de números escrita a mano (separados por espacios, punto y coma o saltos de línea). */
export function leerValores(texto: string): number[] {
  return texto
    .split(/[\s;]+/)
    .map((t) => t.trim().replace(',', '.'))
    .filter(Boolean)
    .map((t) => parseFloat(t))
    .filter((n) => isFinite(n));
}

export function mejoraDmaic(d: ProyectoDmaic): number | null {
  if (d.lineaBaseValor === null || d.valorActual === null || !d.lineaBaseValor) return null;
  const cambio = ((d.valorActual - d.lineaBaseValor) / Math.abs(d.lineaBaseValor)) * 100;
  return d.mayorEsMejor ? cambio : -cambio;
}
