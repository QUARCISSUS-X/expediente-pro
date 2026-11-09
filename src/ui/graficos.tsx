// Gráficos SVG livianos para los módulos de control (sin librerías externas).
import type { ReactNode } from 'react';
import { fmt } from '../engine/util';

export const COLOR = {
  plan: '#1e6b5e',
  real: '#2e6da4',
  costo: '#a8372a',
  ocre: '#a9731a',
  suave: '#c8ddd7',
  gris: '#8a969b',
};

const recortar = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const ejeY = (min: number, max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => min + ((max - min) * i) / n);

export interface Serie {
  nombre: string;
  color: string;
  puntos: { x: number; y: number }[];
  discontinua?: boolean;
  marcadores?: boolean;
  etiquetas?: boolean;
}

/** Gráfico de líneas sobre un eje X numérico (días, índices…). */
export function GraficoLineas({ series, etiquetaX, yMax, yMin = 0, formatoY = (v) => fmt(v, 0), alto = 240, lineasH = [], titulo }: {
  series: Serie[];
  etiquetaX: (x: number) => string;
  yMax?: number;
  yMin?: number;
  formatoY?: (v: number) => string;
  alto?: number;
  lineasH?: { y: number; texto: string; color: string }[];
  titulo: string;
}) {
  const todos = series.flatMap((s) => s.puntos);
  if (!todos.length) return null;
  const W = 900, H = alto, iz = 58, de = 14, ar = 16, ab = 30;
  const xMin = Math.min(...todos.map((p) => p.x));
  const xMax = Math.max(...todos.map((p) => p.x), xMin + 1);
  const yM = yMax ?? Math.max(...todos.map((p) => p.y), ...lineasH.map((l) => l.y), 1) * 1.08;
  const X = (x: number) => iz + ((W - iz - de) * (x - xMin)) / (xMax - xMin);
  const Y = (y: number) => ar + (H - ar - ab) * (1 - (y - yMin) / (yM - yMin || 1));
  const marcasX = Array.from({ length: 7 }, (_, i) => xMin + ((xMax - xMin) * i) / 6);
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
        {ejeY(yMin, yM).map((g, i) => (
          <g key={i}>
            <line x1={iz} x2={W - de} y1={Y(g)} y2={Y(g)} stroke="var(--linea-2)" />
            <text x={iz - 6} y={Y(g) + 4} textAnchor="end" fontSize="11" fill="var(--texto-3)">{formatoY(g)}</text>
          </g>
        ))}
        {marcasX.map((x, i) => (
          <text key={i} x={X(x)} y={H - 10} textAnchor={i === 0 ? 'start' : i === 6 ? 'end' : 'middle'} fontSize="11" fill="var(--texto-2)">{etiquetaX(x)}</text>
        ))}
        {lineasH.map((l, i) => (
          <g key={i}>
            <line x1={iz} x2={W - de} y1={Y(l.y)} y2={Y(l.y)} stroke={l.color} strokeDasharray="5 4" />
            <text x={W - de - 2} y={Y(l.y) - 4} textAnchor="end" fontSize="11" fill={l.color}>{l.texto}</text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.nombre}>
            <polyline points={s.puntos.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.2" strokeDasharray={s.discontinua ? '6 4' : undefined} />
            {s.marcadores && s.puntos.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={3.4} fill={s.color} />)}
            {s.etiquetas && s.puntos.map((p, i) => <text key={i} x={X(p.x)} y={Y(p.y) - 7} textAnchor="middle" fontSize="10.5" fill={s.color}>{formatoY(p.y)}</text>)}
          </g>
        ))}
      </svg>
      <div className="leyenda">
        {series.map((s) => (
          <span key={s.nombre}><i style={{ background: s.color, height: 3 }} />{s.nombre}</span>
        ))}
      </div>
    </div>
  );
}

/** Barras verticales con etiqueta; opcionalmente una segunda serie y una línea de referencia. */
export function GraficoBarras({ datos, titulo, formato = (v) => fmt(v, 0), alto = 200, referencia, colorDe, segunda }: {
  datos: { etiqueta: string; valor: number }[];
  titulo: string;
  formato?: (v: number) => string;
  alto?: number;
  referencia?: { y: number; texto: string };
  colorDe?: (v: number, i: number) => string;
  segunda?: { nombre: string; valores: number[]; color: string; primera: string };
}) {
  if (!datos.length) return null;
  const W = 900, H = alto, iz = 50, de = 10, ar = 18, ab = 30;
  const max = Math.max(1, ...datos.map((d) => d.valor), ...(segunda?.valores ?? []), referencia?.y ?? 0) * 1.1;
  const ancho = (W - iz - de) / datos.length;
  const Y = (v: number) => ar + (H - ar - ab) * (1 - v / max);
  const paso = Math.ceil(datos.length / 18);
  const bw = segunda ? ancho * 0.36 : ancho * 0.6;
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
        <line x1={iz} x2={W - de} y1={Y(0)} y2={Y(0)} stroke="var(--linea)" />
        {ejeY(0, max, 4).map((g, i) => (
          <text key={i} x={iz - 6} y={Y(g) + 4} textAnchor="end" fontSize="11" fill="var(--texto-3)">{formato(g)}</text>
        ))}
        {datos.map((d, i) => {
          const x0 = iz + ancho * i + (ancho - (segunda ? bw * 2 + 2 : bw)) / 2;
          return (
            <g key={i}>
              <rect x={x0} y={Y(d.valor)} width={bw} height={Math.max(0, Y(0) - Y(d.valor))} fill={colorDe ? colorDe(d.valor, i) : COLOR.plan}><title>{`${d.etiqueta}: ${formato(d.valor)}`}</title></rect>
              {segunda && <rect x={x0 + bw + 2} y={Y(segunda.valores[i] ?? 0)} width={bw} height={Math.max(0, Y(0) - Y(segunda.valores[i] ?? 0))} fill={segunda.color} />}
              {datos.length <= 16 && <text x={x0 + (segunda ? bw : bw / 2)} y={Y(Math.max(d.valor, segunda?.valores[i] ?? 0)) - 5} textAnchor="middle" fontSize="10.5" fill="var(--texto)">{formato(d.valor)}</text>}
              {i % paso === 0 && <text x={iz + ancho * i + ancho / 2} y={H - 10} textAnchor="middle" fontSize="10.5" fill="var(--texto-2)">{d.etiqueta}</text>}
            </g>
          );
        })}
        {referencia && (
          <g>
            <line x1={iz} x2={W - de} y1={Y(referencia.y)} y2={Y(referencia.y)} stroke={COLOR.costo} strokeDasharray="5 4" />
            <text x={W - de - 2} y={Y(referencia.y) - 5} textAnchor="end" fontSize="11" fill={COLOR.costo}>{referencia.texto}</text>
          </g>
        )}
      </svg>
      {segunda && (
        <div className="leyenda">
          <span><i style={{ background: COLOR.plan }} />{segunda.primera}</span>
          <span><i style={{ background: segunda.color }} />{segunda.nombre}</span>
        </div>
      )}
    </div>
  );
}

/** Diagrama de Pareto: barras ordenadas y línea de porcentaje acumulado con referencia del 80 %. */
export function GraficoPareto({ items, titulo, unidad = '' }: { items: { clave: string; valor: number; acumuladoPct: number }[]; titulo: string; unidad?: string }) {
  if (!items.length) return <div className="vacio"><p>Sin datos para el diagrama de Pareto.</p></div>;
  const W = 900, H = 250, iz = 50, de = 46, ar = 18, ab = 46;
  const max = Math.max(...items.map((i) => i.valor)) * 1.1;
  const ancho = (W - iz - de) / items.length;
  const Y = (v: number) => ar + (H - ar - ab) * (1 - v / max);
  const P = (p: number) => ar + (H - ar - ab) * (1 - p / 100);
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
        <line x1={iz} x2={W - de} y1={Y(0)} y2={Y(0)} stroke="var(--linea)" />
        <line x1={iz} x2={W - de} y1={P(80)} y2={P(80)} stroke={COLOR.gris} strokeDasharray="4 4" />
        <text x={W - de + 4} y={P(80) + 4} fontSize="11" fill="var(--texto-3)">80 %</text>
        {[0, 50, 100].map((p) => <text key={p} x={W - de + 4} y={P(p) + 4} fontSize="11" fill="var(--texto-3)">{p} %</text>)}
        {items.map((it, i) => (
          <g key={it.clave}>
            <rect x={iz + ancho * i + ancho * 0.15} y={Y(it.valor)} width={ancho * 0.7} height={Y(0) - Y(it.valor)} fill={it.acumuladoPct <= 80.0001 || i === 0 ? COLOR.costo : '#d9a39b'} />
            <text x={iz + ancho * i + ancho / 2} y={Y(it.valor) - 5} textAnchor="middle" fontSize="11" fill="var(--texto)">{fmt(it.valor, it.valor % 1 ? 1 : 0)}{unidad}</text>
            <text x={iz + ancho * i + ancho / 2} y={H - 28} textAnchor="middle" fontSize="10.5" fill="var(--texto-2)"><title>{it.clave}</title>{recortar(it.clave, Math.max(5, Math.floor(ancho / 6.6)))}</text>
          </g>
        ))}
        <polyline points={items.map((it, i) => `${iz + ancho * i + ancho / 2},${P(it.acumuladoPct)}`).join(' ')} fill="none" stroke={COLOR.plan} strokeWidth="2" />
        {items.map((it, i) => <circle key={i} cx={iz + ancho * i + ancho / 2} cy={P(it.acumuladoPct)} r={3} fill={COLOR.plan} />)}
      </svg>
      <div className="leyenda">
        <span><i style={{ background: COLOR.costo }} />Causas que suman el 80 % (las pocas vitales)</span>
        <span><i style={{ background: COLOR.plan, height: 3 }} />% acumulado</span>
      </div>
    </div>
  );
}

/** Carta de control I-MR con media, límites y meta. */
export function GraficoControl({ valores, media, lcs, lci, meta, especificacion, resaltar, titulo, etiquetas, formato = (v) => fmt(v, 2) }: {
  valores: number[];
  media: number;
  lcs: number;
  lci: number;
  meta?: number | null;
  especificacion?: { lei: number | null; les: number | null };
  resaltar: Set<number>;
  titulo: string;
  etiquetas?: string[];
  formato?: (v: number) => string;
}) {
  const W = 900, H = 260, iz = 58, de = 70, ar = 16, ab = 28;
  const extra = [lcs, lci, meta ?? media, especificacion?.lei ?? media, especificacion?.les ?? media];
  const max = Math.max(...valores, ...extra);
  const min = Math.min(...valores, ...extra);
  const rango = max - min || 1;
  const yMax = max + rango * 0.08;
  const yMin = min - rango * 0.08;
  const X = (i: number) => iz + ((W - iz - de) * i) / Math.max(1, valores.length - 1);
  const Y = (v: number) => ar + (H - ar - ab) * (1 - (v - yMin) / (yMax - yMin));
  const linea = (v: number, color: string, texto: string, dash?: string) => (
    <g>
      <line x1={iz} x2={W - de} y1={Y(v)} y2={Y(v)} stroke={color} strokeDasharray={dash} />
      <text x={W - de + 4} y={Y(v) + 4} fontSize="11" fill={color}>{texto} {formato(v)}</text>
    </g>
  );
  const paso = Math.ceil(valores.length / 16);
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
        {linea(lcs, COLOR.costo, 'LCS', '5 4')}
        {linea(media, COLOR.gris, 'Media')}
        {linea(lci, COLOR.costo, 'LCI', '5 4')}
        {meta !== null && meta !== undefined && linea(meta, COLOR.plan, 'Meta', '2 3')}
        {especificacion?.lei !== null && especificacion?.lei !== undefined && linea(especificacion.lei, COLOR.ocre, 'LEI', '8 3')}
        {especificacion?.les !== null && especificacion?.les !== undefined && linea(especificacion.les, COLOR.ocre, 'LES', '8 3')}
        <polyline points={valores.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} fill="none" stroke={COLOR.real} strokeWidth="1.8" />
        {valores.map((v, i) => (
          <circle key={i} cx={X(i)} cy={Y(v)} r={resaltar.has(i) ? 5 : 3.2} fill={resaltar.has(i) ? COLOR.costo : COLOR.real}>
            <title>{`${etiquetas?.[i] ?? i + 1}: ${formato(v)}`}</title>
          </circle>
        ))}
        {valores.map((_, i) => (i % paso === 0 ? <text key={i} x={X(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--texto-2)">{etiquetas?.[i] ?? i + 1}</text> : null))}
      </svg>
      <div className="leyenda">
        <span><i style={{ background: COLOR.real }} />Valor medido</span>
        <span><i style={{ background: COLOR.costo }} />Fuera de control o patrón no aleatorio</span>
      </div>
    </div>
  );
}

/** Histograma con límites de especificación. */
export function GraficoHistograma({ barras, lei, les, media, titulo }: { barras: { desde: number; hasta: number; n: number }[]; lei: number | null; les: number | null; media: number; titulo: string }) {
  if (!barras.length) return null;
  const W = 900, H = 210, iz = 40, de = 10, ar = 16, ab = 30;
  const xMin = Math.min(barras[0].desde, lei ?? Infinity);
  const xMax = Math.max(barras[barras.length - 1].hasta, les ?? -Infinity);
  const max = Math.max(...barras.map((b) => b.n)) * 1.15;
  const X = (x: number) => iz + ((W - iz - de) * (x - xMin)) / (xMax - xMin || 1);
  const Y = (v: number) => ar + (H - ar - ab) * (1 - v / max);
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
        <line x1={iz} x2={W - de} y1={Y(0)} y2={Y(0)} stroke="var(--linea)" />
        {barras.map((b, i) => (
          <g key={i}>
            <rect x={X(b.desde) + 1} y={Y(b.n)} width={Math.max(1, X(b.hasta) - X(b.desde) - 2)} height={Y(0) - Y(b.n)} fill={COLOR.suave} stroke={COLOR.plan} strokeWidth="0.6" />
            {b.n > 0 && <text x={(X(b.desde) + X(b.hasta)) / 2} y={Y(b.n) - 4} textAnchor="middle" fontSize="11" fill="var(--texto)">{b.n}</text>}
            <text x={X(b.desde)} y={H - 10} textAnchor="middle" fontSize="10.5" fill="var(--texto-2)">{fmt(b.desde, 1)}</text>
          </g>
        ))}
        {[['LEI', lei], ['LES', les]].map(([t, v]) =>
          v === null || v === undefined ? null : (
            <g key={t as string}>
              <line x1={X(v as number)} x2={X(v as number)} y1={ar} y2={Y(0)} stroke={COLOR.costo} strokeWidth="1.6" strokeDasharray="5 3" />
              <text x={X(v as number) + 4} y={ar + 10} fontSize="11" fill={COLOR.costo}>{t as string} {fmt(v as number, 2)}</text>
            </g>
          ),
        )}
        <line x1={X(media)} x2={X(media)} y1={ar} y2={Y(0)} stroke={COLOR.plan} strokeWidth="1.4" />
      </svg>
    </div>
  );
}

/** Barra apilada horizontal (TP / TC / TNC, por ejemplo). */
export function BarraApilada({ partes, titulo }: { partes: { texto: string; valor: number; color: string }[]; titulo: string }) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
  let x = 0;
  return (
    <div className="grafico">
      <svg viewBox="0 0 900 46" role="img" aria-label={titulo}>
        {partes.map((p) => {
          const w = (900 * p.valor) / total;
          const el = (
            <g key={p.texto}>
              <rect x={x} y={4} width={w} height={30} fill={p.color} />
              {w > 70 && <text x={x + w / 2} y={24} textAnchor="middle" fontSize="12.5" fill="#fff" fontWeight="600">{fmt((p.valor / total) * 100, 1)} %</text>}
            </g>
          );
          x += w;
          return el;
        })}
      </svg>
      <div className="leyenda">
        {partes.map((p) => (
          <span key={p.texto}><i style={{ background: p.color }} />{p.texto}</span>
        ))}
      </div>
    </div>
  );
}

/** Matriz de probabilidad × impacto 5 × 5 con la cantidad de riesgos en cada celda. */
export function MatrizRiesgos({ riesgos }: { riesgos: { probabilidad: number; impacto: number }[] }) {
  const celda = 58;
  const color = (n: number) => (n >= 15 ? '#c9574a' : n >= 10 ? '#e0a052' : n >= 5 ? '#e9d68a' : '#a9cfc4');
  return (
    <div className="grafico" style={{ maxWidth: 430 }}>
      <svg viewBox={`0 0 ${celda * 5 + 60} ${celda * 5 + 46}`} role="img" aria-label="Matriz de probabilidad por impacto">
        {[5, 4, 3, 2, 1].map((p, fi) =>
          [1, 2, 3, 4, 5].map((im, ci) => {
            const n = riesgos.filter((r) => Math.round(r.probabilidad) === p && Math.round(r.impacto) === im).length;
            return (
              <g key={`${p}-${im}`}>
                <rect x={44 + ci * celda} y={fi * celda} width={celda - 2} height={celda - 2} fill={color(p * im)} rx="3" />
                {n > 0 && <text x={44 + ci * celda + celda / 2 - 1} y={fi * celda + celda / 2 + 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="#20262a">{n}</text>}
              </g>
            );
          }),
        )}
        {[5, 4, 3, 2, 1].map((p, fi) => <text key={p} x={34} y={fi * celda + celda / 2 + 4} textAnchor="end" fontSize="12" fill="var(--texto-2)">{p}</text>)}
        {[1, 2, 3, 4, 5].map((im, ci) => <text key={im} x={44 + ci * celda + celda / 2} y={celda * 5 + 14} textAnchor="middle" fontSize="12" fill="var(--texto-2)">{im}</text>)}
        <text x={44 + (celda * 5) / 2} y={celda * 5 + 36} textAnchor="middle" fontSize="12" fill="var(--texto-2)">Impacto</text>
        <text x={10} y={(celda * 5) / 2} textAnchor="middle" fontSize="12" fill="var(--texto-2)" transform={`rotate(-90 10 ${(celda * 5) / 2})`}>Probabilidad</text>
      </svg>
    </div>
  );
}

/** Diagrama de Ishikawa (espina de pescado) con las 6M. */
export function DiagramaIshikawa({ problema, causas }: { problema: string; causas: Record<string, string> }) {
  const cats = Object.keys(causas);
  const W = 1000, H = 420, ejeY = H / 2, cabeza = 210, x0 = 30, x1 = W - cabeza - 10;
  const arriba = cats.slice(0, 3);
  const abajo = cats.slice(3, 6);
  const paso = (x1 - x0) / 3;
  const rama = (cat: string, i: number, sup: boolean) => {
    const xFin = x0 + paso * (i + 1) - 10;
    const xIni = xFin - 90;
    const yIni = sup ? 34 : H - 34;
    const lineas = (causas[cat] || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 5);
    return (
      <g key={cat}>
        <line x1={xIni} y1={yIni} x2={xFin} y2={ejeY} stroke="var(--grafito)" strokeWidth="1.6" />
        <text x={xIni} y={sup ? yIni - 10 : yIni + 20} fontSize="14" fontWeight="650" fill="var(--patina)">{cat}</text>
        {lineas.map((t, k) => {
          const f = (k + 1) / (lineas.length + 1);
          const x = xIni + (xFin - xIni) * f;
          const y = yIni + (ejeY - yIni) * f;
          return (
            <g key={k}>
              <line x1={x - 150} y1={y} x2={x} y2={y} stroke="var(--linea)" />
              <text x={x - 12} y={y - 4} textAnchor="end" fontSize="11.5" fill="var(--texto)"><title>{t}</title>{recortar(t, 24)}</text>
            </g>
          );
        })}
      </g>
    );
  };
  const palabras = problema.split(/\s+/);
  const renglones: string[] = [];
  for (const p of palabras) {
    if (!renglones.length || (renglones[renglones.length - 1] + ' ' + p).length > 24) renglones.push(p);
    else renglones[renglones.length - 1] += ' ' + p;
  }
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Diagrama de Ishikawa: ${problema}`}>
        <line x1={x0} y1={ejeY} x2={x1} y2={ejeY} stroke="var(--grafito)" strokeWidth="2.6" />
        <polygon points={`${x1},${ejeY - 8} ${x1 + 14},${ejeY} ${x1},${ejeY + 8}`} fill="var(--grafito)" />
        <rect x={x1 + 18} y={ejeY - 60} width={cabeza - 22} height={120} rx="6" fill="var(--sello-tinte)" stroke="var(--sello)" />
        {renglones.slice(0, 5).map((t, i) => (
          <text key={i} x={x1 + 18 + (cabeza - 22) / 2} y={ejeY - (Math.min(5, renglones.length) - 1) * 9 + i * 18 + 4} textAnchor="middle" fontSize="13.5" fontWeight="650" fill="var(--sello)">{t}</text>
        ))}
        {arriba.map((c, i) => rama(c, i, true))}
        {abajo.map((c, i) => rama(c, i, false))}
      </svg>
    </div>
  );
}

/** Tarjeta de indicador para el tablero. */
export function Indicador({ titulo, valor, detalle, estado = 'neutra' }: { titulo: string; valor: ReactNode; detalle?: ReactNode; estado?: 'ok' | 'advertencia' | 'error' | 'neutra' }) {
  return (
    <div className={`indicador ${estado}`}>
      <span className="ind-titulo">{titulo}</span>
      <strong className="ind-valor">{valor}</strong>
      {detalle && <span className="ind-detalle">{detalle}</span>}
    </div>
  );
}

/** Histograma de frecuencias con su curva acumulada (curva S de probabilidad) y líneas de percentiles. */
export function GraficoProbabilidad({ barras, acumulada, marcas, formatoX = (v) => fmt(v, 0), titulo }: {
  barras: { desde: number; hasta: number; n: number }[];
  acumulada: { x: number; pct: number }[];
  marcas: { x: number; texto: string; color: string }[];
  formatoX?: (v: number) => string;
  titulo: string;
}) {
  if (!barras.length) return null;
  const W = 900, H = 260, iz = 46, de = 46, ar = 22, ab = 30;
  const xMin = Math.min(barras[0].desde, ...marcas.map((m) => m.x));
  const xMax = Math.max(barras[barras.length - 1].hasta, ...marcas.map((m) => m.x), xMin + 1e-9);
  const total = barras.reduce((s, b) => s + b.n, 0) || 1;
  const max = Math.max(...barras.map((b) => b.n / total)) * 1.15 || 1;
  const X = (x: number) => iz + ((W - iz - de) * (x - xMin)) / (xMax - xMin || 1);
  const Y = (v: number) => ar + (H - ar - ab) * (1 - v / max);
  const Yp = (p: number) => ar + (H - ar - ab) * (1 - p / 100);
  const marcasX = Array.from({ length: 7 }, (_, i) => xMin + ((xMax - xMin) * i) / 6);
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}>
            <line x1={iz} x2={W - de} y1={Yp(p)} y2={Yp(p)} stroke="var(--linea-2)" />
            <text x={W - de + 6} y={Yp(p) + 4} fontSize="11" fill={COLOR.real}>{p}%</text>
            <text x={iz - 6} y={Yp(p) + 4} textAnchor="end" fontSize="11" fill="var(--texto-3)">{fmt((max * p) / 100 * 100, 1)}%</text>
          </g>
        ))}
        {barras.map((b, i) => (
          <rect key={i} x={X(b.desde) + 0.5} y={Y(b.n / total)} width={Math.max(1, X(b.hasta) - X(b.desde) - 1)} height={Y(0) - Y(b.n / total)} fill={COLOR.suave} stroke={COLOR.plan} strokeWidth="0.5" />
        ))}
        <polyline points={acumulada.map((p) => `${X(p.x)},${Yp(p.pct)}`).join(' ')} fill="none" stroke={COLOR.real} strokeWidth="2.4" />
        {marcas.map((m, i) => (
          <g key={i}>
            <line x1={X(m.x)} x2={X(m.x)} y1={ar - 4} y2={Y(0)} stroke={m.color} strokeWidth="1.5" strokeDasharray="5 3" />
            <text x={X(m.x) + 3} y={ar + 8 + i * 13} fontSize="11" fill={m.color}>{m.texto}</text>
          </g>
        ))}
        {marcasX.map((x, i) => (
          <text key={i} x={X(x)} y={H - 10} textAnchor={i === 0 ? 'start' : i === 6 ? 'end' : 'middle'} fontSize="11" fill="var(--texto-2)">{formatoX(x)}</text>
        ))}
      </svg>
      <div className="leyenda">
        <span><i style={{ background: COLOR.suave, border: `1px solid ${COLOR.plan}` }} />Frecuencia (eje izquierdo)</span>
        <span><i style={{ background: COLOR.real, height: 3 }} />Probabilidad acumulada (eje derecho)</span>
      </div>
    </div>
  );
}

/** Gráfico de fiebre de la cadena crítica: % de cadena completada contra % de colchón consumido. */
export function GraficoFiebre({ puntos, titulo, limiteAmarillo, limiteRojo }: {
  puntos: { avance: number; consumo: number; etiqueta: string }[];
  titulo: string;
  limiteAmarillo: (x: number) => number;
  limiteRojo: (x: number) => number;
}) {
  const W = 900, H = 320, iz = 48, de = 14, ar = 14, ab = 34;
  const yMax = Math.max(120, ...puntos.map((p) => p.consumo * 1.1));
  const X = (x: number) => iz + ((W - iz - de) * x) / 100;
  const Y = (y: number) => ar + (H - ar - ab) * (1 - Math.min(y, yMax) / yMax);
  const poli = (pts: [number, number][]) => pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
        <polygon points={poli([[0, 0], [100, 0], [100, limiteAmarillo(100)], [0, limiteAmarillo(0)]])} fill="#dcefe6" />
        <polygon points={poli([[0, limiteAmarillo(0)], [100, limiteAmarillo(100)], [100, limiteRojo(100)], [0, limiteRojo(0)]])} fill="#f6ead0" />
        <polygon points={poli([[0, limiteRojo(0)], [100, limiteRojo(100)], [100, yMax], [0, yMax]])} fill="#f4d9d5" />
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <text x={X(v)} y={H - 14} textAnchor={v === 0 ? 'start' : v === 100 ? 'end' : 'middle'} fontSize="11" fill="var(--texto-2)">{v}%</text>
            <line x1={X(v)} x2={X(v)} y1={ar} y2={Y(0)} stroke="rgba(0,0,0,.06)" />
          </g>
        ))}
        {ejeY(0, yMax).map((g, i) => (
          <text key={i} x={iz - 6} y={Y(g) + 4} textAnchor="end" fontSize="11" fill="var(--texto-3)">{fmt(g, 0)}%</text>
        ))}
        <text x={(iz + W - de) / 2} y={H - 1} textAnchor="middle" fontSize="11" fill="var(--texto-2)">% de la cadena crítica completada</text>
        <polyline points={puntos.map((p) => `${X(p.avance)},${Y(p.consumo)}`).join(' ')} fill="none" stroke="#1f2b37" strokeWidth="2" />
        {puntos.map((p, i) => (
          <g key={i}>
            <circle cx={X(p.avance)} cy={Y(p.consumo)} r={4.2} fill="#1f2b37" />
            <text x={X(p.avance) + 6} y={Y(p.consumo) - 6} fontSize="10.5" fill="#1f2b37">{p.etiqueta}</text>
          </g>
        ))}
      </svg>
      <div className="leyenda">
        <span><i style={{ background: '#dcefe6' }} />Verde: en control</span>
        <span><i style={{ background: '#f6ead0' }} />Amarillo: preparar acciones</span>
        <span><i style={{ background: '#f4d9d5' }} />Rojo: ejecutar acciones de recuperación</span>
        <span>Eje vertical: % del colchón del proyecto consumido</span>
      </div>
    </div>
  );
}
