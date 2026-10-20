import { useState } from 'react';
import type { Resultados } from '../../engine/types';
import { fmt } from '../../engine/util';
import { tablaAdquisiciones, tablaDesembolsos, tablaEquipos, tablaPersonal, tablaValorizado } from '../../export/tablas';
import { Pestanas } from '../componentes';
import type { Contexto } from '../estado';
import { VistaTabla } from '../VistaTabla';

function CurvaS({ r }: { r: Resultados }) {
  const v = r.valorizado;
  const n = v.cd.length;
  if (!n) return null;
  const W = 900, H = 236, iz = 44, ab = 30, ar = 26;
  const ancho = (W - iz - 10) / n;
  const y = (pct: number) => ar + (H - ar - ab) * (1 - pct / 100);
  const pts = v.acumuladoPct.map((p, i) => `${iz + ancho * (i + 1)},${y(p)}`);
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Curva S del avance programado">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={iz} x2={W - 10} y1={y(g)} y2={y(g)} stroke="var(--linea-2)" />
            <text x={iz - 6} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--texto-3)">{g}%</text>
          </g>
        ))}
        {v.avancePct.map((p, i) => (
          <rect key={i} x={iz + ancho * i + ancho * 0.22} y={y(p)} width={ancho * 0.56} height={y(0) - y(p)} fill="#c8ddd7" />
        ))}
        <polyline points={`${iz},${y(0)} ${pts.join(' ')}`} fill="none" stroke="var(--patina)" strokeWidth="2.2" />
        {v.acumuladoPct.map((p, i) => (
          <g key={i}>
            <circle cx={iz + ancho * (i + 1)} cy={y(p)} r={3.5} fill="var(--patina)" />
            <text x={iz + ancho * (i + 1)} y={y(p) - 8} textAnchor="end" fontSize="11" fill="var(--texto-2)">{fmt(p, 1)}%</text>
          </g>
        ))}
        {r.programa.periodos.map((p, i) => (
          <text key={p.n} x={iz + ancho * i + ancho / 2} y={H - 10} textAnchor="middle" fontSize="11.5" fill="var(--texto-2)">{p.etiqueta}</text>
        ))}
      </svg>
      <div className="leyenda">
        <span><i style={{ background: 'var(--patina)', height: 3 }} />Avance acumulado</span>
        <span><i style={{ background: '#c8ddd7' }} />Avance del periodo (% del costo directo)</span>
      </div>
    </div>
  );
}

function Histograma({ r }: { r: Resultados }) {
  const v = r.personalEquivalente;
  if (!v.length) return null;
  const W = 900, H = 180, iz = 44, ab = 28, ar = 16;
  const max = Math.max(1, ...v, r.proyecto.meta.personalMaximo ?? 0);
  const ancho = (W - iz - 10) / v.length;
  const y = (x: number) => ar + (H - ar - ab) * (1 - x / max);
  const lim = r.proyecto.meta.personalMaximo;
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Histograma de trabajadores promedio por periodo">
        <line x1={iz} x2={W - 10} y1={y(0)} y2={y(0)} stroke="var(--linea)" />
        {v.map((x, i) => (
          <g key={i}>
            <rect x={iz + ancho * i + ancho * 0.22} y={y(x)} width={ancho * 0.56} height={y(0) - y(x)} fill="var(--patina)" />
            <text x={iz + ancho * i + ancho / 2} y={y(x) - 5} textAnchor="middle" fontSize="11.5" fill="var(--texto)">{fmt(x, 1)}</text>
            <text x={iz + ancho * i + ancho / 2} y={H - 9} textAnchor="middle" fontSize="11.5" fill="var(--texto-2)">{r.programa.periodos[i]?.etiqueta}</text>
          </g>
        ))}
        {lim ? (
          <g>
            <line x1={iz} x2={W - 10} y1={y(lim)} y2={y(lim)} stroke="var(--sello)" strokeDasharray="5 4" />
            <text x={W - 12} y={y(lim) - 5} textAnchor="end" fontSize="11" fill="var(--sello)">Máximo indicado: {lim}</text>
          </g>
        ) : null}
      </svg>
      <div className="leyenda">
        <span><i style={{ background: 'var(--patina)' }} />Trabajadores promedio por periodo (pico diario: {fmt(r.personalPico, 1)})</span>
      </div>
    </div>
  );
}

type Pest = 'valorizado' | 'adquisiciones' | 'equipos' | 'personal' | 'desembolsos';

export function ModCronogramas({ ctx }: { ctx: Contexto }) {
  const { resultados: r } = ctx;
  const [pest, setPest] = useState<Pest>('valorizado');
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Cronogramas</h1>
          <p className="proposito">Se calculan solos distribuyendo cada partida en sus días de trabajo. Todos suman lo mismo que el presupuesto y la relación de insumos.</p>
        </div>
      </div>
      <Pestanas
        valor={pest}
        alCambiar={setPest}
        opciones={[
          { id: 'valorizado', texto: 'Valorizado y curva S' },
          { id: 'adquisiciones', texto: 'Adquisición de materiales' },
          { id: 'equipos', texto: 'Equipos' },
          { id: 'personal', texto: 'Personal' },
          { id: 'desembolsos', texto: 'Desembolsos' },
        ]}
      />
      {pest === 'valorizado' && (<><CurvaS r={r} /><VistaTabla t={tablaValorizado(r)} /></>)}
      {pest === 'adquisiciones' && (
        <>
          <p className="pequeno" style={{ marginTop: 0 }}>Cada material se compra con la anticipación indicada en el catálogo (columna “Compra (d)”); “Previo” agrupa las compras anteriores al inicio de obra.</p>
          <VistaTabla t={tablaAdquisiciones(r)} />
        </>
      )}
      {pest === 'equipos' && <VistaTabla t={tablaEquipos(r)} />}
      {pest === 'personal' && (<><Histograma r={r} /><VistaTabla t={tablaPersonal(r)} /></>)}
      {pest === 'desembolsos' && <VistaTabla t={tablaDesembolsos(r)} />}
    </div>
  );
}
