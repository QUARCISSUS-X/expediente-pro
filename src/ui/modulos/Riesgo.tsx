// Riesgo de plazo y costo: simulación Monte Carlo / PERT sobre la red CPM del cronograma.
import { useEffect, useMemo, useRef, useState } from 'react';
import { hoyIso } from '../../engine/control';
import {
  type ConfigRiesgo, entradaSimulacion, type EstimacionActividad, mediaPert, mediaTriangular, type ResultadoRiesgo, resumirRiesgo, Simulacion,
} from '../../engine/riesgo';
import { fmt, num } from '../../engine/util';
import { tablaCriticidad } from '../../export/metodologias';
import { Campo, EntradaNumero, Insignia, Pestanas, TablaEditable } from '../componentes';
import { fc, pct, useControl } from '../control';
import { enSegundoPlano } from '../trabajo';
import type { Contexto } from '../estado';
import { COLOR, GraficoProbabilidad, Indicador } from '../graficos';
import { VistaTabla } from '../VistaTabla';

type Pest = 'simulacion' | 'estimaciones';

export function ModRiesgo({ ctx }: { ctx: Contexto }) {
  const [pest, setPest] = useState<Pest>('simulacion');
  const r = ctx.resultados;
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Riesgo de plazo y costo</h1>
          <p className="proposito">Simulación Monte Carlo sobre la red del cronograma (predecesoras FC, CC y FF con desfase) con duraciones PERT-Beta o triangulares: probabilidad de cumplir el plazo y el presupuesto, P50, P80, P90 e índice de criticidad.</p>
        </div>
      </div>
      <Pestanas
        valor={pest}
        alCambiar={setPest}
        opciones={[
          { id: 'simulacion', texto: 'Simulación' },
          { id: 'estimaciones', texto: 'Estimaciones por actividad' },
        ]}
      />
      {!r.programa.actividades.length ? (
        <div className="vacio"><p>El cronograma no tiene actividades. Agregue partidas con metrado y duración para simular.</p></div>
      ) : pest === 'simulacion' ? <SimulacionVista ctx={ctx} /> : <Estimaciones ctx={ctx} />}
    </div>
  );
}

function Configuracion({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const x = c.riesgo;
  const set = <K extends keyof ConfigRiesgo>(k: K, v: ConfigRiesgo[K]) => mut((d) => { d.riesgo[k] = v; });
  return (
    <div className="formulario-fila" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
      <Campo etiqueta="Distribución">
        <select value={x.distribucion} onChange={(e) => set('distribucion', e.target.value as ConfigRiesgo['distribucion'])}>
          <option value="pert">PERT-Beta</option>
          <option value="triangular">Triangular</option>
        </select>
      </Campo>
      <Campo etiqueta="Iteraciones" ayuda="De 1 000 a 10 000">
        <select value={x.iteraciones} onChange={(e) => set('iteraciones', Number(e.target.value))}>
          {[1000, 2000, 5000, 10000].map((n) => <option key={n} value={n}>{fmt(n, 0)}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Semilla" ayuda="Misma semilla, mismos resultados">
        <EntradaNumero valor={x.semilla} decimales={0} permitirVacio={false} alCambiar={(v) => set('semilla', Math.round(num(v, 1)))} />
      </Campo>
      <Campo etiqueta="Duración optimista (−%)">
        <EntradaNumero valor={x.optimistaPct} decimales={1} permitirVacio={false} alCambiar={(v) => set('optimistaPct', Math.min(95, Math.max(0, num(v))))} />
      </Campo>
      <Campo etiqueta="Duración pesimista (+%)">
        <EntradaNumero valor={x.pesimistaPct} decimales={1} permitirVacio={false} alCambiar={(v) => set('pesimistaPct', Math.max(0, num(v)))} />
      </Campo>
      <Campo etiqueta="Incertidumbre del costo">
        <select value={x.costoModo} onChange={(e) => set('costoModo', e.target.value as ConfigRiesgo['costoModo'])}>
          <option value="ninguno">Sin incertidumbre</option>
          <option value="global">± % general</option>
          <option value="partida">Tres valores por partida</option>
        </select>
      </Campo>
      {x.costoModo !== 'ninguno' && (
        <>
          <Campo etiqueta="Costo optimista (−%)">
            <EntradaNumero valor={x.costoOptimistaPct} decimales={1} permitirVacio={false} alCambiar={(v) => set('costoOptimistaPct', Math.min(95, Math.max(0, num(v))))} />
          </Campo>
          <Campo etiqueta="Costo pesimista (+%)">
            <EntradaNumero valor={x.costoPesimistaPct} decimales={1} permitirVacio={false} alCambiar={(v) => set('costoPesimistaPct', Math.max(0, num(v)))} />
          </Campo>
        </>
      )}
      <Campo etiqueta="Plazo contractual (fin)" ayuda="Vacío: fin de la línea base o del cronograma">
        <input type="date" value={x.plazoMeta} onChange={(e) => set('plazoMeta', e.target.value)} />
      </Campo>
      <Campo etiqueta={`Presupuesto meta CD (${ctx.resultados.proyecto.meta.moneda})`} ayuda="Vacío: costo directo contractual">
        <EntradaNumero valor={x.presupuestoMeta} decimales={2} alCambiar={(v) => set('presupuestoMeta', v === null || v === undefined || (v as unknown) === '' ? null : num(v))} />
      </Campo>
    </div>
  );
}

function SimulacionVista({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const base = c.lineaBase ? { fin: c.lineaBase.fin, costoDirecto: c.lineaBase.costoDirecto } : null;
  const entrada = useMemo(() => entradaSimulacion(r, c.riesgo, base), [r, c.riesgo, c.lineaBase]); // eslint-disable-line react-hooks/exhaustive-deps
  const [res, setRes] = useState<ResultadoRiesgo | null>(null);
  const [avance, setAvance] = useState<number | null>(null);
  const trabajo = useRef(0);
  const enCurso = useRef<(() => void) | null>(null);
  const simular = () => {
    const id = ++trabajo.current;
    enCurso.current?.();
    setAvance(0);
    // respaldo sin worker: bloques de ~30 ms en la página para que la interfaz no se congele
    const enPagina = () => new Promise<ResultadoRiesgo>((resolver) => {
      const s = new Simulacion(r, entrada);
      const paso = () => {
        if (id !== trabajo.current) return; // se lanzó otra simulación o se salió de la pestaña
        const t0 = performance.now();
        while (!s.terminado && performance.now() - t0 < 30) s.avanzar(50);
        setAvance(s.progreso);
        if (s.terminado) resolver(s.resultado());
        else window.setTimeout(paso, 0);
      };
      window.setTimeout(paso, 0);
    });
    const t = enSegundoPlano<ResultadoRiesgo>(
      { tarea: 'simular', programa: r.programa, meta: { diasLaborables: r.proyecto.meta.diasLaborables, feriados: r.proyecto.meta.feriados }, entrada },
      enPagina,
      (x) => { if (id === trabajo.current && typeof x === 'number') setAvance(x); },
    );
    enCurso.current = t.cancelar;
    void t.promesa.then((x) => {
      if (id !== trabajo.current) return;
      enCurso.current = null;
      setRes(x);
      setAvance(null);
      mut((d) => { d.riesgo.resumen = resumirRiesgo(x, hoyIso()); });
    });
  };
  // corre sola al abrir y cuando cambian los datos (la huella no incluye el resumen guardado, así que no se repite en bucle)
  useEffect(() => {
    if (!res || res.entrada.huella !== entrada.huella) simular();
    return () => { trabajo.current++; enCurso.current?.(); };
  }, [entrada.huella]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = r.proyecto.meta.moneda;
  const vigente = res && res.entrada.huella === entrada.huella ? res : null;
  return (
    <>
      <Configuracion ctx={ctx} />
      <div className="fila-flex" style={{ gap: 10, alignItems: 'center' }}>
        <button className="boton primario" onClick={simular} disabled={avance !== null}>{avance !== null ? 'Simulando…' : 'Volver a simular'}</button>
        <span className="pequeno">{entrada.actividades.filter((a) => a.propia).length} actividades con tres valores propios · el resto usa −{c.riesgo.optimistaPct} % / +{c.riesgo.pesimistaPct} % sobre su duración.</span>
      </div>
      {avance !== null && <div className="progreso" aria-label="Avance de la simulación"><div style={{ width: `${avance * 100}%` }} /></div>}
      {vigente && <Resultados ctx={ctx} x={vigente} moneda={m} />}
    </>
  );
}

function Resultados({ ctx, x, moneda }: { ctx: Contexto; x: ResultadoRiesgo; moneda: string }) {
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const e = x.entrada;
  const est = (p: number) => (p >= 80 ? 'ok' : p >= 50 ? 'advertencia' : 'error') as 'ok' | 'advertencia' | 'error';
  return (
    <>
      <div className="seccion-titulo">Plazo <span className="pequeno">· {fmt(x.iteraciones, 0)} iteraciones, en días laborables desde el {fc(e.inicio)}</span></div>
      <div className="indicadores">
        <Indicador titulo="Cronograma (determinista)" valor={`${fmt(e.deterministaDias, 0)} d`} detalle={`Termina el ${fc(r.programa.fin)}`} />
        <Indicador titulo="P50" valor={fc(x.fechas.p50)} detalle={`${fmt(x.plazo.p50, 1)} d laborables · ${x.plazoCalendario.p50} d calendario`} />
        <Indicador titulo="P80" valor={fc(x.fechas.p80)} detalle={`${fmt(x.plazo.p80, 1)} d laborables · ${x.plazoCalendario.p80} d calendario`} />
        <Indicador titulo="P90" valor={fc(x.fechas.p90)} detalle={`${fmt(x.plazo.p90, 1)} d laborables · ${x.plazoCalendario.p90} d calendario`} />
        <Indicador titulo="Probabilidad de cumplir el plazo" valor={pct(x.probPlazo, 1)} detalle={`Plazo contractual ${fc(e.metaFecha)} (${e.metaDias} d)`} estado={est(x.probPlazo)} />
      </div>
      <GraficoProbabilidad
        titulo="Distribución del plazo y curva S de probabilidad"
        barras={x.plazo.histograma}
        acumulada={x.plazo.acumulada}
        formatoX={(v) => `${fmt(v, 0)} d`}
        marcas={[
          { x: e.deterministaDias, texto: `CPM ${fmt(e.deterministaDias, 0)}`, color: COLOR.gris },
          { x: e.metaDias, texto: `Contrato ${e.metaDias}`, color: COLOR.costo },
          { x: x.plazo.p50, texto: `P50 ${fmt(x.plazo.p50, 0)}`, color: COLOR.plan },
          { x: x.plazo.p80, texto: `P80 ${fmt(x.plazo.p80, 0)}`, color: COLOR.ocre },
          { x: x.plazo.p90, texto: `P90 ${fmt(x.plazo.p90, 0)}`, color: COLOR.real },
        ]}
      />
      {x.costo && (
        <>
          <div className="seccion-titulo">Costo directo ({moneda})</div>
          <div className="indicadores">
            <Indicador titulo="Presupuesto (determinista)" valor={fmt(e.deterministaCosto, 0)} />
            <Indicador titulo="P50" valor={fmt(x.costo.p50, 0)} />
            <Indicador titulo="P80" valor={fmt(x.costo.p80, 0)} detalle={`Contingencia ${fmt(x.costo.p80 - e.deterministaCosto, 0)}`} />
            <Indicador titulo="P90" valor={fmt(x.costo.p90, 0)} />
            <Indicador titulo="Probabilidad de cumplir el presupuesto" valor={pct(x.probCosto, 1)} detalle={`Meta ${fmt(e.metaCosto, 0)} · plazo y costo: ${pct(x.probAmbos, 1)}`} estado={est(x.probCosto ?? 0)} />
          </div>
          <GraficoProbabilidad
            titulo="Distribución del costo directo"
            barras={x.costo.histograma}
            acumulada={x.costo.acumulada}
            formatoX={(v) => fmt(v / 1000, 0) + ' mil'}
            marcas={[
              { x: e.metaCosto, texto: 'Meta', color: COLOR.costo },
              { x: x.costo.p50, texto: 'P50', color: COLOR.plan },
              { x: x.costo.p80, texto: 'P80', color: COLOR.ocre },
              { x: x.costo.p90, texto: 'P90', color: COLOR.real },
            ]}
          />
        </>
      )}
      <div className="seccion-titulo">Índice de criticidad <span className="pequeno">· % de iteraciones en que la actividad quedó en la ruta crítica</span></div>
      <VistaTabla t={tablaCriticidad(r, c)} alto="360px" />
    </>
  );
}

function Estimaciones({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const cfg = c.riesgo;
  const entrada = useMemo(() => entradaSimulacion(r, cfg), [r, cfg]);
  const media = cfg.distribucion === 'pert' ? mediaPert : mediaTriangular;
  type Fila = (typeof entrada.actividades)[number];
  const set = (a: Fila, campo: keyof EstimacionActividad, v: unknown) =>
    mut((d) => {
      const e = d.riesgo.estimaciones[a.partidaId] ?? { optimista: null, probable: null, pesimista: null, costoOptimista: null, costoProbable: null, costoPesimista: null };
      e[campo] = v === null || v === undefined || (v as unknown) === '' ? null : num(v);
      d.riesgo.estimaciones[a.partidaId] = e;
    });
  const propio = (a: Fila, k: keyof EstimacionActividad) => cfg.estimaciones[a.partidaId]?.[k] ?? null;
  const columnasCosto = cfg.costoModo === 'partida'
    ? [
      { clave: 'co', titulo: 'Costo optimista', ancho: 110, tipo: 'numero' as const, decimales: 2, valor: (a: Fila) => propio(a, 'costoOptimista'), cambiar: (a: Fila, v: unknown) => set(a, 'costoOptimista', v) },
      { clave: 'cm', titulo: 'Costo más probable', ancho: 110, tipo: 'numero' as const, decimales: 2, valor: (a: Fila) => propio(a, 'costoProbable'), cambiar: (a: Fila, v: unknown) => set(a, 'costoProbable', v) },
      { clave: 'cp', titulo: 'Costo pesimista', ancho: 110, tipo: 'numero' as const, decimales: 2, valor: (a: Fila) => propio(a, 'costoPesimista'), cambiar: (a: Fila, v: unknown) => set(a, 'costoPesimista', v) },
    ]
    : [];
  return (
    <>
      <p className="pequeno">Deje vacías las celdas para usar el ± % general (la columna «Usados» muestra los valores que entran a la simulación). La duración más probable es, por defecto, la del cronograma.</p>
      <TablaEditable
        etiqueta="Estimaciones de tres valores"
        filas={entrada.actividades}
        clave={(a) => a.partidaId}
        alto="calc(100vh - 290px)"
        columnas={[
          { clave: 'c', titulo: 'Ítem', ancho: 64, valor: (a) => a.codigo },
          { clave: 'd', titulo: 'Actividad', valor: (a) => a.descripcion, formato: (a) => <>{a.descripcion} {r.programa.actividades.find((x) => x.partidaId === a.partidaId)?.critica && <Insignia estado="error">Crítica</Insignia>}</> },
          { clave: 'dur', titulo: 'Duración (d)', ancho: 86, num: true, valor: (a) => a.duracion },
          { clave: 'o', titulo: 'Optimista', ancho: 90, tipo: 'numero', decimales: 1, valor: (a) => propio(a, 'optimista'), cambiar: (a, v) => set(a, 'optimista', v) },
          { clave: 'm', titulo: 'Más probable', ancho: 96, tipo: 'numero', decimales: 1, valor: (a) => propio(a, 'probable'), cambiar: (a, v) => set(a, 'probable', v) },
          { clave: 'p', titulo: 'Pesimista', ancho: 90, tipo: 'numero', decimales: 1, valor: (a) => propio(a, 'pesimista'), cambiar: (a, v) => set(a, 'pesimista', v) },
          { clave: 'u', titulo: 'Usados (o · m · p)', ancho: 140, valor: (a) => `${fmt(a.o, 1)} · ${fmt(a.m, 1)} · ${fmt(a.p, 1)}` },
          { clave: 'med', titulo: 'Media', ancho: 76, num: true, valor: (a) => fmt(media(a.o, a.m, a.p), 2) },
          ...columnasCosto,
        ]}
      />
    </>
  );
}

