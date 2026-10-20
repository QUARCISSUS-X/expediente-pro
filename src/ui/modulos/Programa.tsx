import { useMemo, useState } from 'react';
import type { ActividadCalc, Resultados } from '../../engine/types';
import { fechaCorta, fmt } from '../../engine/util';
import { generarMsProject } from '../../export/msproject';
import { parsearPreds, textoPreds } from '../../io/plantilla';
import { Campo, EntradaTexto, Insignia, TablaEditable } from '../componentes';
import { descargar, type Contexto } from '../estado';

function Gantt({ r, sel, alElegir, dependencias }: { r: Resultados; sel: string | null; alElegir: (id: string) => void; dependencias: boolean }) {
  const acts = r.programa.actividades;
  const T = Math.max(1, r.programa.diasLaborables);
  const etiquetaW = 330;
  const px = Math.max(5, Math.min(14, 900 / T));
  const W = etiquetaW + T * px + 20;
  const filaH = 22;
  const cabH = 40;
  const H = cabH + acts.length * filaH + 8;
  const x = (d: number) => etiquetaW + d * px;
  const indice = new Map(acts.map((a, i) => [a.partidaId, i]));
  const inicioPer = r.programa.periodos.map((p) => r.programa.diaFecha.findIndex((f) => f >= p.inicio)).map((v) => (v < 0 ? T : v));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Diagrama de Gantt del programa de obra" style={{ display: 'block', fontFamily: 'var(--fuente)' }}>
      <rect x={etiquetaW} y={0} width={T * px} height={cabH - 4} fill="var(--hoja-2)" />
      {r.programa.periodos.map((p, i) => {
        const a = inicioPer[i];
        const b = i + 1 < inicioPer.length ? inicioPer[i + 1] : T;
        if (a >= T) return null;
        return (
          <g key={p.n}>
            <line x1={x(a)} x2={x(a)} y1={0} y2={H} stroke="var(--linea)" />
            <text x={(x(a) + x(b)) / 2} y={15} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--texto-2)">{p.etiqueta}</text>
            <text x={(x(a) + x(b)) / 2} y={29} textAnchor="middle" fontSize="10.5" fill="var(--texto-3)">{fechaCorta(p.inicio).slice(0, 5)} – {fechaCorta(p.fin).slice(0, 5)}</text>
          </g>
        );
      })}
      <text x={8} y={24} fontSize="11.5" fontWeight="600" fill="var(--texto-2)">Actividad</text>
      {acts.map((a, i) => {
        const y = cabH + i * filaH;
        const elegida = sel === a.partidaId;
        return (
          <g key={a.partidaId} onClick={() => alElegir(a.partidaId)} style={{ cursor: 'pointer' }}>
            <rect x={0} y={y} width={W} height={filaH} fill={elegida ? 'var(--patina-tinte)' : i % 2 ? '#fafbf9' : '#fff'} />
            <text x={8} y={y + 15} fontSize="11.5" fill="var(--texto-2)">{a.codigo}</text>
            <text x={58} y={y + 15} fontSize="11.5" fill="var(--texto)">{a.descripcion.length > 44 ? a.descripcion.slice(0, 42) + '…' : a.descripcion}</text>
            {a.holgura > 0 && <line x1={x(a.ef)} x2={x(a.lf)} y1={y + 11} y2={y + 11} stroke="var(--texto-3)" strokeDasharray="2 2" />}
            <rect x={x(a.es)} y={y + 5} width={Math.max(2, a.duracion * px)} height={12} rx={2} fill={a.critica ? 'var(--sello)' : 'var(--patina)'} />
            <title>{`${a.codigo} ${a.descripcion}\n${a.duracion} días · ${fechaCorta(a.inicio)} a ${fechaCorta(a.fin)}\nHolgura ${a.holgura} d${a.critica ? ' · ruta crítica' : ''}`}</title>
          </g>
        );
      })}
      {dependencias &&
        acts.flatMap((a) =>
          a.predecesoras.map((pr) => {
            const j = indice.get(pr.id);
            const b = j !== undefined ? acts[j] : undefined;
            if (!b || j === undefined) return null;
            const i = indice.get(a.partidaId)!;
            const x1 = pr.tipo === 'CC' ? x(b.es) : x(b.ef);
            const y1 = cabH + j * filaH + 11;
            const x2 = pr.tipo === 'FF' ? x(a.ef) : x(a.es);
            const y2 = cabH + i * filaH + 11;
            const mx = pr.tipo === 'FF' ? Math.max(x1, x2) + 6 : Math.min(x1 + 6, x2 - 2);
            return <path key={`${a.partidaId}-${pr.id}-${pr.tipo}`} d={`M${x1} ${y1} H${mx} V${y2} H${x2}`} fill="none" stroke="var(--texto-3)" strokeWidth="0.8" opacity="0.7" />;
          }),
        )}
    </svg>
  );
}

export function ModPrograma({ ctx }: { ctx: Contexto }) {
  const { proyecto: p, resultados: r, actualizar, partidaSel, setPartidaSel, avisar } = ctx;
  const [dep, setDep] = useState(false);
  const acts = r.programa.actividades;
  const idPorCodigo = useMemo(() => new Map(p.partidas.filter((x) => !x.titulo).map((x) => [x.codigo, x.id])), [p.partidas]);
  const set = (id: string, f: (c: { cuadrillas?: number | null; duracionManual?: number | null; predecesoras: { id: string; tipo: 'FC' | 'CC' | 'FF'; desfase: number }[] }) => void) =>
    actualizar((d) => { const c = d.programa[id] ?? (d.programa[id] = { cuadrillas: 1, duracionManual: null, predecesoras: [] }); f(c); });
  const criticas = acts.filter((a) => a.critica).length;
  const encadenar = () => {
    if (!window.confirm('Cada actividad quedará con una sola predecesora: la anterior del presupuesto (fin-comienzo). ¿Continuar?')) return;
    actualizar((d) => {
      acts.forEach((a, i) => {
        const c = d.programa[a.partidaId] ?? (d.programa[a.partidaId] = { cuadrillas: 1, duracionManual: null, predecesoras: [] });
        c.predecesoras = i === 0 ? [] : [{ id: acts[i - 1].partidaId, tipo: 'FC', desfase: 0 }];
      });
    });
  };
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Programación</h1>
          <p className="proposito">La duración sale del metrado, el rendimiento del APU y las cuadrillas. Con las predecesoras se calcula la ruta crítica y el plazo, que usan los gastos generales, la memoria y todos los cronogramas.</p>
        </div>
        <div className="herramientas">
          <button className="boton" onClick={encadenar}>Encadenar en secuencia</button>
          <button className="boton" onClick={() => descargar(`${p.meta.codigo}_Programa_MSProject.xml`, generarMsProject(r), 'application/xml')}>Exportar a MS Project</button>
        </div>
      </div>
      <div className="cifras">
        <div><span>Inicio</span><strong>{fechaCorta(r.programa.inicio)}</strong></div>
        <div><span>Fin</span><strong>{fechaCorta(r.programa.fin)}</strong></div>
        <div><span>Plazo</span><strong>{r.programa.plazoDias} días calendario</strong></div>
        <div><span>Días laborables</span><strong>{r.programa.diasLaborables}</strong></div>
        <div><span>Actividades críticas</span><strong>{criticas} de {acts.length}</strong></div>
        <div style={{ alignSelf: 'end' }}>
          <Campo etiqueta="Inicio de obra">
            <EntradaTexto type="date" valor={p.meta.fechaInicio} alCambiar={(v) => v && actualizar((d) => { d.meta.fechaInicio = v; })} />
          </Campo>
        </div>
      </div>
      {r.programa.errores.length > 0 && <div className="aviso error">{r.programa.errores.map((e) => <div key={e}>{e}</div>)}</div>}
      {acts.length === 0 ? (
        <div className="vacio">No hay actividades: las partidas entran al programa cuando tienen metrado.</div>
      ) : (
        <>
          <div className="fila-flex" style={{ marginBottom: 6 }}>
            <div className="leyenda" style={{ marginTop: 0 }}>
              <span><i style={{ background: 'var(--patina)' }} />Actividad</span>
              <span><i style={{ background: 'var(--sello)' }} />Ruta crítica</span>
              <span><i style={{ borderTop: '1px dashed var(--texto-3)', height: 0 }} />Holgura</span>
            </div>
            <span className="separador" />
            <label className="casilla"><input type="checkbox" checked={dep} onChange={(e) => setDep(e.target.checked)} /> Mostrar dependencias</label>
          </div>
          <div className="gantt-marco">
            <Gantt r={r} sel={partidaSel} dependencias={dep} alElegir={(id) => setPartidaSel(id)} />
          </div>
          <h2>Actividades</h2>
          <TablaEditable<ActividadCalc>
            etiqueta="Actividades del programa"
            filas={acts}
            clave={(a) => a.partidaId}
            claseFila={(a) => (a.partidaId === partidaSel ? 'seleccionada' : undefined)}
            alClicFila={(a) => setPartidaSel(a.partidaId)}
            columnas={[
              { clave: 'c', titulo: 'Ítem', ancho: 64, valor: (a) => a.codigo },
              { clave: 'd', titulo: 'Actividad', valor: (a) => a.descripcion },
              { clave: 'm', titulo: 'Metrado', num: true, ancho: 86, valor: (a) => a.metrado },
              { clave: 're', titulo: 'Rend./día', num: true, ancho: 76, valor: (a) => a.rendimiento },
              { clave: 'cu', titulo: 'Cuadrillas', tipo: 'numero', ancho: 78, decimales: 0, valor: (a) => p.programa[a.partidaId]?.cuadrillas ?? 1, cambiar: (a, v) => set(a.partidaId, (c) => { c.cuadrillas = Math.max(1, (v as number) ?? 1); }) },
              { clave: 'df', titulo: 'Duración fija', tipo: 'numero', ancho: 86, decimales: 0, valor: (a) => p.programa[a.partidaId]?.duracionManual ?? null, cambiar: (a, v) => set(a.partidaId, (c) => { c.duracionManual = v as number | null; }), placeholder: 'auto' },
              { clave: 'du', titulo: 'Días', num: true, ancho: 50, decimales: 0, valor: (a) => a.duracion },
              {
                clave: 'pr', titulo: 'Predecesoras', ancho: 170,
                valor: (a) => textoPreds(p, p.programa[a.partidaId]?.predecesoras ?? []),
                cambiar: (a, v) => {
                  const { preds, errores } = parsearPreds(String(v), idPorCodigo);
                  if (errores.length) avisar(errores.join(' '), true);
                  set(a.partidaId, (c) => { c.predecesoras = preds.filter((x) => x.id !== a.partidaId); });
                },
              },
              { clave: 'i', titulo: 'Inicio', ancho: 84, valor: (a) => fechaCorta(a.inicio) },
              { clave: 'f', titulo: 'Fin', ancho: 84, valor: (a) => fechaCorta(a.fin) },
              { clave: 'h', titulo: 'Holgura', num: true, ancho: 64, decimales: 0, valor: (a) => a.holgura },
              { clave: 'cr', titulo: 'Crítica', ancho: 70, valor: (a) => a.critica, formato: (a) => (a.critica ? <Insignia estado="error">Sí</Insignia> : '') },
            ]}
          />
          <p className="pequeno">Predecesoras: FC fin-comienzo, CC comienzo-comienzo, FF fin-fin; el desfase va en días laborables (01.03FC+2). Monto programado: {fmt(r.pie.costoDirecto)}.</p>
        </>
      )}
    </div>
  );
}
