// Six Sigma / Lean Six Sigma: cartas de control, capacidad de proceso, Pareto, Ishikawa y proyectos DMAIC.
import { useMemo, useState } from 'react';
import {
  capacidadProceso, CATEGORIAS_6M, cartaIMR, causasNoCumplimiento, type FaseDmaic, hoyIso, leerValores, mejoraDmaic, nivelRiesgo, pareto,
  type ProyectoDmaic, rendimientoMedicion, type SerieCalidad,
} from '../../engine/control';
import { fmt, num, uid } from '../../engine/util';
import { tablaCalidad } from '../../export/control';
import { AreaTexto, Campo, EntradaNumero, EntradaTexto, IconoMas, Pestanas, TablaEditable } from '../componentes';
import { fechaCortaDM, ind, opcionesPartidas, pct, useControl } from '../control';
import type { Contexto } from '../estado';
import { DiagramaIshikawa, GraficoControl, GraficoHistograma, GraficoPareto, Indicador } from '../graficos';
import { VistaTabla } from '../VistaTabla';

type Pest = 'control' | 'capacidad' | 'pareto' | 'ishikawa' | 'dmaic';

export function ModSigma({ ctx }: { ctx: Contexto }) {
  const [pest, setPest] = useState<Pest>('control');
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Calidad y mejora (Six Sigma)</h1>
          <p className="proposito">Herramientas estadísticas sobre los datos de obra: estabilidad de rendimientos y ensayos, capacidad frente a las especificaciones, causas principales y proyectos de mejora DMAIC.</p>
        </div>
      </div>
      <Pestanas
        valor={pest}
        alCambiar={setPest}
        opciones={[
          { id: 'control', texto: 'Gráficos de control' },
          { id: 'capacidad', texto: 'Capacidad de proceso' },
          { id: 'pareto', texto: 'Pareto' },
          { id: 'ishikawa', texto: 'Ishikawa' },
          { id: 'dmaic', texto: 'Proyectos DMAIC' },
        ]}
      />
      {pest === 'control' && <Cartas ctx={ctx} />}
      {pest === 'capacidad' && <Capacidad ctx={ctx} />}
      {pest === 'pareto' && <Pareto ctx={ctx} />}
      {pest === 'ishikawa' && <Ishikawas ctx={ctx} />}
      {pest === 'dmaic' && <Dmaic ctx={ctx} />}
    </div>
  );
}

// ------------------------------------------------------------------ gráficos de control

function Cartas({ ctx }: { ctx: Contexto }) {
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const partidasMedidas = [...new Set(c.mediciones.map((m) => m.partidaId))].filter(Boolean);
  const fuentes = [
    ...partidasMedidas.map((id) => ({ clave: `p:${id}`, texto: `IP – ${opcionesPartidas(r).find((o) => o.valor === id)?.texto ?? id}` })),
    ...c.series.map((s) => ({ clave: `s:${s.id}`, texto: `${s.nombre}${s.unidad ? ` (${s.unidad})` : ''}` })),
  ];
  const [fuente, setFuente] = useState(fuentes[0]?.clave ?? '');
  const datos = useMemo(() => {
    if (fuente.startsWith('p:')) {
      const ms = c.mediciones.filter((m) => m.partidaId === fuente.slice(2)).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const ip = ms.map((m) => rendimientoMedicion(r, m).ip).map((x) => x ?? NaN);
      return { valores: ip.filter(isFinite), etiquetas: ms.filter((_, i) => isFinite(ip[i])).map((m) => fechaCortaDM(m.fecha)), meta: 1, lei: null, les: null, unidad: '' };
    }
    const s = c.series.find((x) => x.id === fuente.slice(2));
    return s ? { valores: s.valores, etiquetas: s.valores.map((_, i) => String(i + 1)), meta: s.objetivo, lei: s.lei, les: s.les, unidad: s.unidad } : null;
  }, [fuente, c, r]);
  const k = datos ? cartaIMR(datos.valores) : null;
  if (!fuentes.length) return <div className="vacio"><p>Registre mediciones de rendimiento (Ejecución lean) o series de ensayos (Capacidad de proceso) para construir las cartas de control.</p></div>;
  const resaltar = new Set([...(k?.fuera ?? []), ...(k?.rachas ?? []), ...(k?.tendencias ?? [])]);
  return (
    <>
      <div className="fila-flex" style={{ marginBottom: 10 }}>
        <Campo etiqueta="Datos">
          <select className="entrada" value={fuente} onChange={(e) => setFuente(e.target.value)} style={{ minWidth: 420 }}>{fuentes.map((f) => <option key={f.clave} value={f.clave}>{f.texto}</option>)}</select>
        </Campo>
      </div>
      {!k ? (
        <div className="vacio"><p>Se necesitan al menos 2 valores.</p></div>
      ) : (
        <>
          <div className="indicadores">
            <Indicador titulo="Estado del proceso" valor={k.enControl ? 'En control' : 'Fuera de control'} estado={k.enControl ? 'ok' : 'error'} detalle={`${k.valores.length} valores`} />
            <Indicador titulo="Media" valor={fmt(k.media, 3)} detalle={datos?.unidad} />
            <Indicador titulo="Límite superior (LCS)" valor={fmt(k.lcs, 3)} />
            <Indicador titulo="Límite inferior (LCI)" valor={fmt(k.lci, 3)} />
            <Indicador titulo="Rango móvil promedio" valor={fmt(k.mrMedia, 3)} detalle={`LCS del rango ${fmt(k.lcsMR, 3)}`} />
          </div>
          <GraficoControl titulo="Carta de control de valores individuales" valores={k.valores} media={k.media} lcs={k.lcs} lci={k.lci} meta={datos?.meta} especificacion={{ lei: datos?.lei ?? null, les: datos?.les ?? null }} resaltar={resaltar} etiquetas={datos?.etiquetas} formato={(v) => fmt(v, 2)} />
          <ul className="pequeno">
            {k.fuera.length > 0 && <li>{k.fuera.length} punto(s) fuera de los límites de control (causa especial: investigar qué pasó ese día).</li>}
            {k.rachas.length > 0 && <li>7 o más puntos seguidos al mismo lado de la media: el proceso cambió de nivel.</li>}
            {k.tendencias.length > 0 && <li>6 o más puntos seguidos subiendo o bajando: hay una tendencia.</li>}
            {k.enControl && <li>Variación solo por causas comunes. Para mejorar hay que cambiar el método, no reaccionar a cada punto.</li>}
            <li>Límites: media ± 2.66 × rango móvil promedio (carta I-MR).</li>
          </ul>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ capacidad de proceso

function Capacidad({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [selId, setSel] = useState<string | null>(c.series[0]?.id ?? null);
  const sel = c.series.find((x) => x.id === selId) ?? null;
  const editar = (fn: (x: SerieCalidad) => void) => mut((d) => { const y = d.series.find((z) => z.id === selId); if (y) fn(y); });
  const k = sel ? capacidadProceso(sel.valores, sel.lei, sel.les) : null;
  const est = (v: number | null) => (v === null ? 'neutra' : v >= 1.33 ? 'ok' : v >= 1 ? 'advertencia' : 'error');
  return (
    <>
      <div className="lista-cortes">
        {c.series.map((x) => <button key={x.id} className="chip" aria-pressed={x.id === selId} onClick={() => setSel(x.id)}>{x.nombre}</button>)}
        <button className="boton chico" onClick={() => { const id = uid('ser'); mut((d) => void d.series.push({ id, nombre: 'Nueva serie de ensayos', unidad: '', lei: null, les: null, objetivo: null, valores: [] })); setSel(id); }}><IconoMas /> Serie de ensayos</button>
      </div>
      {!sel ? (
        <div className="vacio"><p>Cargue resultados de ensayos o mediciones de calidad (compactación, resistencia del concreto, espesores, slump, cotas…) con sus límites de especificación.</p></div>
      ) : (
        <div className="dos-columnas">
          <div>
            <div className="rejilla" style={{ marginBottom: 10 }}>
              <Campo etiqueta="Nombre" className="ancho-2"><EntradaTexto valor={sel.nombre} alCambiar={(v) => editar((x) => { x.nombre = v; })} /></Campo>
              <Campo etiqueta="Unidad"><EntradaTexto valor={sel.unidad} alCambiar={(v) => editar((x) => { x.unidad = v; })} /></Campo>
              <Campo etiqueta="Límite inferior (LEI)"><EntradaNumero valor={sel.lei} decimales={3} alCambiar={(v) => editar((x) => { x.lei = v; })} /></Campo>
              <Campo etiqueta="Límite superior (LES)"><EntradaNumero valor={sel.les} decimales={3} alCambiar={(v) => editar((x) => { x.les = v; })} /></Campo>
              <Campo etiqueta="Valor objetivo"><EntradaNumero valor={sel.objetivo} decimales={3} alCambiar={(v) => editar((x) => { x.objetivo = v; })} /></Campo>
            </div>
            <Campo etiqueta={`Resultados (${sel.valores.length}) — uno por línea o separados por espacios`}>
              <AreaTexto filas={9} valor={sel.valores.join('\n')} alCambiar={(v) => editar((x) => { x.valores = leerValores(v); })} />
            </Campo>
            <button className="boton chico peligro" style={{ marginTop: 8 }} onClick={() => { if (confirm(`¿Eliminar la serie «${sel.nombre}»?`)) { mut((d) => { d.series = d.series.filter((x) => x.id !== sel.id); }); setSel(null); } }}>Eliminar serie</button>
          </div>
          <div>
            {!k ? (
              <div className="vacio"><p>Ingrese al menos 2 resultados.</p></div>
            ) : (
              <>
                <div className="indicadores">
                  <Indicador titulo="Cp" valor={ind(k.cp)} detalle="Potencial (requiere ambos límites)" estado={est(k.cp)} />
                  <Indicador titulo="Cpk" valor={ind(k.cpk)} detalle="Real, considera el centrado" estado={est(k.cpk)} />
                  <Indicador titulo="Media ± σ" valor={`${fmt(k.media, 2)} ± ${fmt(k.sigma, 2)}`} detalle={`n = ${k.n}`} />
                  <Indicador titulo="Fuera de especificación" valor={pct(k.fueraObservadoPct)} detalle={`Esperado ${pct(k.fueraEsperadoPct, 2)} · ${k.dpmo === null ? '—' : fmt(k.dpmo, 0)} DPMO`} estado={(k.fueraObservadoPct ?? 0) > 0 ? 'error' : 'ok'} />
                  <Indicador titulo="Nivel sigma" valor={ind(k.nivelSigma, 1)} detalle="Corto plazo (3·Cpk + 1.5)" />
                </div>
                <p className="pequeno">Cpk ≥ 1.33: proceso capaz · 1.00 a 1.33: ajustado, vigilar · menor que 1.00: produce fuera de especificación. Supone datos aproximadamente normales y un proceso en control (vea la carta de control).</p>
              </>
            )}
          </div>
        </div>
      )}
      {sel && k && (
        <>
          <div className="seccion-titulo">Histograma con límites de especificación</div>
          <GraficoHistograma titulo="Histograma de resultados" barras={k.histograma} lei={sel.lei} les={sel.les} media={k.media} />
        </>
      )}
      {c.series.length > 0 && <VistaTabla t={tablaCalidad(r, c)} alto="240px" />}
    </>
  );
}

// ------------------------------------------------------------------ Pareto

function Pareto({ ctx }: { ctx: Contexto }) {
  const { c } = useControl(ctx);
  const fuentes: { clave: string; texto: string; datos: () => Record<string, number>; unidad?: string }[] = [
    { clave: 'cnc', texto: 'Causas de no cumplimiento (Last Planner)', datos: () => Object.fromEntries(causasNoCumplimiento(c).map((x) => [x.clave, x.valor])) },
    { clave: 'perdidasH', texto: 'Pérdidas por horas (lean)', datos: () => c.perdidas.reduce<Record<string, number>>((a, p) => ({ ...a, [p.tipo]: (a[p.tipo] ?? 0) + num(p.horas) }), {}), unidad: ' h' },
    { clave: 'perdidasC', texto: 'Pérdidas por costo (lean)', datos: () => c.perdidas.reduce<Record<string, number>>((a, p) => ({ ...a, [p.tipo]: (a[p.tipo] ?? 0) + num(p.costo) }), {}) },
    { clave: 'restricciones', texto: 'Restricciones por tipo (Last Planner)', datos: () => c.restricciones.reduce<Record<string, number>>((a, x) => ({ ...a, [x.tipo]: (a[x.tipo] ?? 0) + 1 }), {}) },
    { clave: 'inspecciones', texto: 'No conformidades de inspecciones', datos: () => { const d: Record<string, number> = {}; for (const i of c.inspecciones) for (const it of i.items) if (it.resultado === 'no') { const k = it.texto.split(':')[0]; d[k] = (d[k] ?? 0) + 1; } return d; } },
    { clave: 'riesgos', texto: 'Exposición de riesgos abiertos por categoría (P×I)', datos: () => c.riesgos.filter((x) => x.estado !== 'cerrado').reduce<Record<string, number>>((a, x) => ({ ...a, [x.categoria || 'Sin categoría']: (a[x.categoria || 'Sin categoría'] ?? 0) + nivelRiesgo(x) }), {}) },
    { clave: 'cambios', texto: 'Adicionales por causa (monto)', datos: () => c.cambios.filter((x) => x.tipo === 'adicional' && x.estado !== 'rechazado').reduce<Record<string, number>>((a, x) => ({ ...a, [x.causa || 'Sin causa']: (a[x.causa || 'Sin causa'] ?? 0) + num(x.monto) }), {}) },
  ];
  const [fuente, setFuente] = useState(fuentes[0].clave);
  const f = fuentes.find((x) => x.clave === fuente)!;
  const items = pareto(f.datos());
  const vitales = items.filter((x, i) => i === 0 || items[i - 1].acumuladoPct < 80);
  return (
    <>
      <div className="fila-flex" style={{ marginBottom: 10 }}>
        <Campo etiqueta="Datos"><select className="entrada" value={fuente} onChange={(e) => setFuente(e.target.value)} style={{ minWidth: 380 }}>{fuentes.map((x) => <option key={x.clave} value={x.clave}>{x.texto}</option>)}</select></Campo>
      </div>
      <GraficoPareto titulo={`Pareto: ${f.texto}`} items={items} unidad={f.unidad} />
      {items.length > 0 && (
        <>
          <p className="pequeno">Las pocas vitales (cerca del 80 % del efecto): <strong>{vitales.map((x) => x.clave).join(', ')}</strong>. Llévelas a un diagrama de Ishikawa o a un proyecto DMAIC.</p>
          <TablaEditable
            filas={items}
            clave={(x) => x.clave}
            etiqueta="Tabla de Pareto"
            columnas={[
              { clave: 'c', titulo: 'Categoría', valor: (x) => x.clave },
              { clave: 'v', titulo: 'Valor', ancho: 110, num: true, valor: (x) => x.valor },
              { clave: 'p', titulo: '%', ancho: 80, num: true, decimales: 1, valor: (x) => x.pct },
              { clave: 'a', titulo: '% acumulado', ancho: 100, num: true, decimales: 1, valor: (x) => x.acumuladoPct },
            ]}
          />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Ishikawa

function Ishikawas({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const [selId, setSel] = useState<string | null>(c.ishikawas[0]?.id ?? null);
  const sel = c.ishikawas.find((x) => x.id === selId) ?? null;
  const editar = (fn: (x: (typeof c.ishikawas)[number]) => void) => mut((d) => { const y = d.ishikawas.find((z) => z.id === selId); if (y) fn(y); });
  return (
    <>
      <div className="lista-cortes">
        {c.ishikawas.map((x) => <button key={x.id} className="chip" aria-pressed={x.id === selId} onClick={() => setSel(x.id)}>{x.problema || 'Sin título'}</button>)}
        <button className="boton chico" onClick={() => { const id = uid('ish'); mut((d) => void d.ishikawas.push({ id, problema: 'Nuevo problema', causas: Object.fromEntries(CATEGORIAS_6M.map((k) => [k, ''])), raiz: '' })); setSel(id); }}><IconoMas /> Diagrama</button>
      </div>
      {!sel ? (
        <div className="vacio"><p>Analice las causas de un problema (por ejemplo, la causa principal del Pareto) con las 6M: mano de obra, método, materiales, máquinas, medición y medio ambiente.</p></div>
      ) : (
        <>
          <DiagramaIshikawa problema={sel.problema} causas={Object.fromEntries(CATEGORIAS_6M.map((k) => [k, sel.causas[k] ?? '']))} />
          <div className="rejilla">
            <Campo etiqueta="Problema (efecto)" className="ancho-2"><EntradaTexto valor={sel.problema} alCambiar={(v) => editar((x) => { x.problema = v; })} /></Campo>
            <Campo etiqueta="Causa raíz identificada" className="ancho-2"><EntradaTexto valor={sel.raiz} alCambiar={(v) => editar((x) => { x.raiz = v; })} /></Campo>
            {CATEGORIAS_6M.map((k) => (
              <Campo key={k} etiqueta={`${k} (una causa por línea)`}><AreaTexto filas={4} valor={sel.causas[k] ?? ''} alCambiar={(v) => editar((x) => { x.causas[k] = v; })} /></Campo>
            ))}
          </div>
          <button className="boton chico peligro" style={{ marginTop: 10 }} onClick={() => { if (confirm('¿Eliminar este diagrama?')) { mut((d) => { d.ishikawas = d.ishikawas.filter((x) => x.id !== sel.id); }); setSel(null); } }}>Eliminar diagrama</button>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ DMAIC

const FASES: { id: FaseDmaic; texto: string; ayuda: string }[] = [
  { id: 'D', texto: 'Definir', ayuda: 'Problema, objetivo, alcance y característica crítica (CTQ).' },
  { id: 'M', texto: 'Medir', ayuda: 'Métrica y su valor de línea base con datos reales.' },
  { id: 'A', texto: 'Analizar', ayuda: 'Causa raíz con Pareto e Ishikawa.' },
  { id: 'I', texto: 'Mejorar', ayuda: 'Acciones con responsable y fecha; medir el resultado.' },
  { id: 'C', texto: 'Controlar', ayuda: 'Plan para sostener la mejora (carta de control, estándar).' },
  { id: 'cerrado', texto: 'Cerrado', ayuda: 'Proyecto terminado.' },
];

function Dmaic({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const [selId, setSel] = useState<string | null>(c.dmaic[0]?.id ?? null);
  const sel = c.dmaic.find((x) => x.id === selId) ?? null;
  const editar = (fn: (x: ProyectoDmaic) => void) => mut((d) => { const y = d.dmaic.find((z) => z.id === selId); if (y) fn(y); });
  const mejora = sel ? mejoraDmaic(sel) : null;
  const avanceMeta = sel && sel.lineaBaseValor !== null && sel.metaValor !== null && sel.valorActual !== null && sel.metaValor !== sel.lineaBaseValor ? ((sel.valorActual - sel.lineaBaseValor) / (sel.metaValor - sel.lineaBaseValor)) * 100 : null;
  return (
    <>
      <div className="lista-cortes">
        {c.dmaic.map((x) => <button key={x.id} className="chip" aria-pressed={x.id === selId} onClick={() => setSel(x.id)}>{x.titulo || 'Sin título'} · {FASES.find((f) => f.id === x.fase)?.texto}</button>)}
        <button
          className="boton chico"
          onClick={() => {
            const id = uid('dmc');
            mut((d) => void d.dmaic.push({ id, titulo: 'Nuevo proyecto de mejora', responsable: '', fase: 'D', problema: '', objetivo: '', alcance: '', ctq: '', metrica: '', unidad: '', mayorEsMejor: true, lineaBaseValor: null, metaValor: null, valorActual: null, causaRaiz: '', ishikawaId: '', acciones: [], planControl: '' }));
            setSel(id);
          }}
        >
          <IconoMas /> Proyecto DMAIC
        </button>
      </div>
      {!sel ? (
        <div className="vacio"><p>Un proyecto DMAIC ataca un problema concreto con datos: Definir, Medir, Analizar, Mejorar y Controlar.</p></div>
      ) : (
        <>
          <div className="segmentado" role="group" aria-label="Fase" style={{ marginBottom: 6 }}>
            {FASES.map((f) => <button key={f.id} className="si" aria-pressed={sel.fase === f.id} onClick={() => editar((x) => { x.fase = f.id; })}>{f.texto}</button>)}
          </div>
          <p className="pequeno" style={{ marginTop: 0 }}>{FASES.find((f) => f.id === sel.fase)?.ayuda}</p>
          <div className="indicadores">
            <Indicador titulo="Línea base" valor={sel.lineaBaseValor === null ? '—' : fmt(sel.lineaBaseValor, 2)} detalle={sel.metrica} />
            <Indicador titulo="Meta" valor={sel.metaValor === null ? '—' : fmt(sel.metaValor, 2)} />
            <Indicador titulo="Valor actual" valor={sel.valorActual === null ? '—' : fmt(sel.valorActual, 2)} estado={mejora === null ? 'neutra' : mejora > 0 ? 'ok' : 'error'} />
            <Indicador titulo="Mejora" valor={pct(mejora)} detalle={avanceMeta === null ? '' : `${fmt(avanceMeta, 0)} % del camino a la meta`} estado={mejora === null ? 'neutra' : mejora > 0 ? 'ok' : 'error'} />
            <Indicador titulo="Acciones" valor={`${sel.acciones.filter((a) => a.hecho).length} / ${sel.acciones.length}`} detalle="cumplidas" />
          </div>
          <div className="rejilla">
            <Campo etiqueta="Proyecto" className="ancho-2"><EntradaTexto valor={sel.titulo} alCambiar={(v) => editar((x) => { x.titulo = v; })} /></Campo>
            <Campo etiqueta="Responsable"><EntradaTexto valor={sel.responsable} alCambiar={(v) => editar((x) => { x.responsable = v; })} /></Campo>
            <Campo etiqueta="Alcance"><EntradaTexto valor={sel.alcance} alCambiar={(v) => editar((x) => { x.alcance = v; })} /></Campo>
            <Campo etiqueta="Problema" className="ancho-2"><AreaTexto filas={2} valor={sel.problema} alCambiar={(v) => editar((x) => { x.problema = v; })} /></Campo>
            <Campo etiqueta="Objetivo" className="ancho-2"><AreaTexto filas={2} valor={sel.objetivo} alCambiar={(v) => editar((x) => { x.objetivo = v; })} /></Campo>
            <Campo etiqueta="CTQ (característica crítica)"><EntradaTexto valor={sel.ctq} alCambiar={(v) => editar((x) => { x.ctq = v; })} /></Campo>
            <Campo etiqueta="Métrica"><EntradaTexto valor={sel.metrica} alCambiar={(v) => editar((x) => { x.metrica = v; })} /></Campo>
            <Campo etiqueta="Unidad"><EntradaTexto valor={sel.unidad} alCambiar={(v) => editar((x) => { x.unidad = v; })} /></Campo>
            <Campo etiqueta="Sentido"><select value={sel.mayorEsMejor ? 'mayor' : 'menor'} onChange={(e) => editar((x) => { x.mayorEsMejor = e.target.value === 'mayor'; })}><option value="mayor">Mayor es mejor</option><option value="menor">Menor es mejor</option></select></Campo>
            <Campo etiqueta="Valor de línea base"><EntradaNumero valor={sel.lineaBaseValor} decimales={3} alCambiar={(v) => editar((x) => { x.lineaBaseValor = v; })} /></Campo>
            <Campo etiqueta="Meta"><EntradaNumero valor={sel.metaValor} decimales={3} alCambiar={(v) => editar((x) => { x.metaValor = v; })} /></Campo>
            <Campo etiqueta="Valor actual"><EntradaNumero valor={sel.valorActual} decimales={3} alCambiar={(v) => editar((x) => { x.valorActual = v; })} /></Campo>
            <Campo etiqueta="Diagrama de Ishikawa"><select value={sel.ishikawaId} onChange={(e) => editar((x) => { x.ishikawaId = e.target.value; const ish = c.ishikawas.find((i) => i.id === e.target.value); if (ish?.raiz && !x.causaRaiz) x.causaRaiz = ish.raiz; })}><option value="">—</option>{c.ishikawas.map((i) => <option key={i.id} value={i.id}>{i.problema}</option>)}</select></Campo>
            <Campo etiqueta="Causa raíz" className="ancho-2"><EntradaTexto valor={sel.causaRaiz} alCambiar={(v) => editar((x) => { x.causaRaiz = v; })} /></Campo>
            <Campo etiqueta="Plan de control" className="ancho-total"><AreaTexto filas={2} valor={sel.planControl} alCambiar={(v) => editar((x) => { x.planControl = v; })} /></Campo>
          </div>
          <div className="fila-flex" style={{ margin: '14px 0 8px' }}>
            <div className="seccion-titulo" style={{ margin: 0 }}>Acciones de mejora</div>
            <button className="boton chico" onClick={() => editar((x) => void x.acciones.push({ id: uid('acc'), accion: '', responsable: '', fecha: hoyIso(), hecho: false }))}><IconoMas /> Acción</button>
          </div>
          <TablaEditable
            filas={sel.acciones}
            clave={(a) => a.id}
            etiqueta="Acciones de mejora"
            alEliminar={(a) => editar((x) => { x.acciones = x.acciones.filter((y) => y.id !== a.id); })}
            columnas={[
              { clave: 'a', titulo: 'Acción', tipo: 'texto', valor: (a) => a.accion, cambiar: (a, v) => editar((x) => { const y = x.acciones.find((z) => z.id === a.id); if (y) y.accion = v as string; }) },
              { clave: 'r', titulo: 'Responsable', ancho: 150, tipo: 'texto', valor: (a) => a.responsable, cambiar: (a, v) => editar((x) => { const y = x.acciones.find((z) => z.id === a.id); if (y) y.responsable = v as string; }) },
              { clave: 'f', titulo: 'Fecha', ancho: 132, tipo: 'fecha', valor: (a) => a.fecha, cambiar: (a, v) => editar((x) => { const y = x.acciones.find((z) => z.id === a.id); if (y) y.fecha = v as string; }) },
              { clave: 'h', titulo: 'Hecha', ancho: 70, tipo: 'casilla', valor: (a) => a.hecho, cambiar: (a, v) => editar((x) => { const y = x.acciones.find((z) => z.id === a.id); if (y) y.hecho = !!v; }) },
            ]}
          />
          <button className="boton chico peligro" style={{ marginTop: 10 }} onClick={() => { if (confirm('¿Eliminar este proyecto?')) { mut((d) => { d.dmaic = d.dmaic.filter((x) => x.id !== sel.id); }); setSel(null); } }}>Eliminar proyecto</button>
        </>
      )}
    </>
  );
}
