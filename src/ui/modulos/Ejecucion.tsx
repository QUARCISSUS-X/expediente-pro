// Ejecución con Lean Construction: frentes de trabajo, control de rendimientos, cartas balance, pérdidas e inspecciones 5S.
import { useMemo, useState } from 'react';
import {
  CATEGORIAS_CARTA, type CartaBalance, type Frente, hoyIso, type Inspeccion, type Medicion, pareto, type Perdida, PLANTILLAS_INSPECCION,
  puntajeInspeccion, rendimientoMedicion, rendimientosPorPartida, resumenCarta, TIPOS_PERDIDA,
} from '../../engine/control';
import { fmt, num, uid } from '../../engine/util';
import { tablaRendimientos } from '../../export/control';
import { Campo, EntradaNumero, EntradaTexto, IconoMas, Insignia, Pestanas, TablaEditable } from '../componentes';
import { estadoIndice, fc, fechaCortaDM, ind, opciones, opcionesFrentes, opcionesPartidas, pct, useControl } from '../control';
import type { Contexto } from '../estado';
import { BarraApilada, COLOR, GraficoBarras, GraficoPareto, Indicador } from '../graficos';
import { VistaTabla } from '../VistaTabla';

type Pest = 'frentes' | 'rendimientos' | 'carta' | 'perdidas' | 'inspecciones';

export function ModEjecucion({ ctx }: { ctx: Contexto }) {
  const [pest, setPest] = useState<Pest>('rendimientos');
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Ejecución lean</h1>
          <p className="proposito">Control de los frentes de trabajo durante la obra: rendimientos reales contra los APU, uso del tiempo de las cuadrillas, pérdidas y orden del frente.</p>
        </div>
      </div>
      <Pestanas
        valor={pest}
        alCambiar={setPest}
        opciones={[
          { id: 'frentes', texto: 'Frentes de trabajo' },
          { id: 'rendimientos', texto: 'Control de rendimientos' },
          { id: 'carta', texto: 'Carta balance y nivel de actividad' },
          { id: 'perdidas', texto: 'Pérdidas' },
          { id: 'inspecciones', texto: '5S e inspecciones' },
        ]}
      />
      {pest === 'frentes' && <Frentes ctx={ctx} />}
      {pest === 'rendimientos' && <Rendimientos ctx={ctx} />}
      {pest === 'carta' && <Cartas ctx={ctx} />}
      {pest === 'perdidas' && <Perdidas ctx={ctx} />}
      {pest === 'inspecciones' && <Inspecciones ctx={ctx} />}
    </div>
  );
}

// ------------------------------------------------------------------ frentes

function Frentes({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [selId, setSel] = useState<string | null>(c.frentes[0]?.id ?? null);
  const [buscar, setBuscar] = useState('');
  const sel = c.frentes.find((f) => f.id === selId) ?? null;
  const set = (x: Frente, campo: keyof Frente, v: unknown) => mut((d) => { const y = d.frentes.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[campo] = v; });
  const rend = useMemo(() => rendimientosPorPartida(r, c), [r, c]);
  const resumen = (f: Frente) => {
    const ms = c.mediciones.filter((m) => m.frenteId === f.id);
    const hh = ms.reduce((s, m) => s + num(m.trabajadores) * num(m.horas), 0);
    const plan = ms.reduce((s, m) => s + rendimientoMedicion(r, m).hhUnidadPlan * num(m.cantidad), 0);
    const insp = c.inspecciones.filter((i) => i.frenteId === f.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    return { ip: hh ? plan / hh : null, perdidas: c.perdidas.filter((p) => p.frenteId === f.id).reduce((s, p) => s + num(p.horas), 0), insp: insp ? puntajeInspeccion(insp) : null };
  };
  const partidas = r.hojas.filter((h) => h.metrado > 0 && (!buscar || `${h.partida.codigo} ${h.partida.descripcion}`.toLowerCase().includes(buscar.toLowerCase())));
  return (
    <>
      <div className="herramientas" style={{ marginBottom: 8 }}>
        <button
          className="boton chico"
          onClick={() => {
            const id = uid('fte');
            mut((d) => void d.frentes.push({ id, nombre: `Frente ${d.frentes.length + 1}`, ubicacion: '', responsable: '', estado: 'activo', partidas: [], nota: '' }));
            setSel(id);
          }}
        >
          <IconoMas /> Frente
        </button>
        <span className="pequeno">Un frente agrupa partidas que ejecuta una misma cuadrilla o en un mismo lugar (tramo, nivel, bocamina, sector).</span>
      </div>
      <TablaEditable
        filas={c.frentes}
        clave={(x) => x.id}
        etiqueta="Frentes de trabajo"
        alClicFila={(x) => setSel(x.id)}
        claseFila={(x) => (x.id === selId ? 'seleccionada' : undefined)}
        alEliminar={(x) => mut((d) => { d.frentes = d.frentes.filter((y) => y.id !== x.id); })}
        vacio={<div className="vacio"><p>Cree los frentes de trabajo de la obra.</p></div>}
        columnas={[
          { clave: 'n', titulo: 'Frente', tipo: 'texto', valor: (x) => x.nombre, cambiar: (x, v) => set(x, 'nombre', v) },
          { clave: 'u', titulo: 'Ubicación', ancho: 160, tipo: 'texto', valor: (x) => x.ubicacion, cambiar: (x, v) => set(x, 'ubicacion', v) },
          { clave: 'r', titulo: 'Responsable', ancho: 140, tipo: 'texto', valor: (x) => x.responsable, cambiar: (x, v) => set(x, 'responsable', v) },
          { clave: 'e', titulo: 'Estado', ancho: 100, tipo: 'select', opciones: [{ valor: 'activo', texto: 'Activo' }, { valor: 'pausado', texto: 'Pausado' }, { valor: 'cerrado', texto: 'Cerrado' }], valor: (x) => x.estado, cambiar: (x, v) => set(x, 'estado', v) },
          { clave: 'p', titulo: 'Partidas', ancho: 70, num: true, decimales: 0, valor: (x) => x.partidas.length },
          { clave: 'ip', titulo: 'IP', ancho: 64, valor: (x) => resumen(x).ip, formato: (x) => ind(resumen(x).ip), clase: (x) => { const e = estadoIndice(resumen(x).ip, 1, 0.9); return e === 'ok' ? 'bien' : e === 'error' ? 'mal' : e === 'advertencia' ? 'regular' : undefined; } },
          { clave: 'pe', titulo: 'Pérdidas (h)', ancho: 90, num: true, decimales: 1, valor: (x) => resumen(x).perdidas },
          { clave: 'i', titulo: 'Última inspección', ancho: 110, valor: (x) => resumen(x).insp, formato: (x) => pct(resumen(x).insp, 0) },
        ]}
      />
      {sel && (
        <>
          <div className="seccion-titulo">Partidas de «{sel.nombre}»</div>
          <div className="fila-flex" style={{ marginBottom: 8 }}>
            <input className="entrada" placeholder="Buscar partida…" value={buscar} onChange={(e) => setBuscar(e.target.value)} style={{ width: 280 }} />
            <span className="pequeno">{sel.partidas.length} seleccionadas</span>
          </div>
          <TablaEditable
            filas={partidas}
            clave={(h) => h.partida.id}
            alto="340px"
            etiqueta="Partidas del frente"
            columnas={[
              { clave: 's', titulo: 'En el frente', ancho: 90, tipo: 'casilla', valor: (h) => sel.partidas.includes(h.partida.id), cambiar: (h, v) => mut((d) => { const f = d.frentes.find((z) => z.id === sel.id); if (!f) return; f.partidas = v ? [...new Set([...f.partidas, h.partida.id])] : f.partidas.filter((p) => p !== h.partida.id); }) },
              { clave: 'c', titulo: 'Ítem', ancho: 80, valor: (h) => h.partida.codigo },
              { clave: 'd', titulo: 'Partida', valor: (h) => h.partida.descripcion },
              { clave: 'u', titulo: 'Und.', ancho: 50, valor: (h) => h.partida.unidad },
              { clave: 'm', titulo: 'Metrado', ancho: 100, num: true, valor: (h) => h.metrado },
              { clave: 'ip', titulo: 'IP medido', ancho: 90, valor: (h) => rend.find((x) => x.partidaId === h.partida.id)?.ip ?? null, formato: (h) => ind(rend.find((x) => x.partidaId === h.partida.id)?.ip) },
            ]}
          />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ rendimientos

function Rendimientos({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [nueva, setNueva] = useState<Medicion>(() => ({ id: '', fecha: hoyIso(), frenteId: c.frentes[0]?.id ?? '', partidaId: '', cantidad: 0, trabajadores: 4, horas: num(r.proyecto.meta.jornadaHoras, 8), nota: '' }));
  const [filtro, setFiltro] = useState('');
  const resumen = useMemo(() => rendimientosPorPartida(r, c), [r, c]);
  const set = (x: Medicion, campo: keyof Medicion, v: unknown) => mut((d) => { const y = d.mediciones.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[campo] = v; });
  const filas = c.mediciones.filter((m) => !filtro || m.partidaId === filtro).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const partidasFrente = nueva.frenteId ? c.frentes.find((f) => f.id === nueva.frenteId)?.partidas ?? [] : [];
  const opcionesNueva = opcionesPartidas(r, '— Elija la partida —').filter((o) => !o.valor || !partidasFrente.length || partidasFrente.includes(o.valor));
  const m = r.proyecto.meta.moneda;
  const prev = nueva.partidaId ? rendimientoMedicion(r, nueva) : null;
  const claseIp = (ip: number | null) => { const e = estadoIndice(ip, 1, 0.9); return e === 'ok' ? 'bien' : e === 'error' ? 'mal' : e === 'advertencia' ? 'regular' : undefined; };
  return (
    <>
      <div className="panel" style={{ padding: 12, marginBottom: 14 }}>
        <div className="seccion-titulo" style={{ marginTop: 0 }}>Registrar medición del día</div>
        <div className="rejilla">
          <Campo etiqueta="Fecha"><EntradaTexto type="date" valor={nueva.fecha} alCambiar={(v) => setNueva({ ...nueva, fecha: v })} /></Campo>
          <Campo etiqueta="Frente"><select value={nueva.frenteId} onChange={(e) => setNueva({ ...nueva, frenteId: e.target.value })}>{opcionesFrentes(c).map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}</select></Campo>
          <Campo etiqueta="Partida" className="ancho-2"><select value={nueva.partidaId} onChange={(e) => setNueva({ ...nueva, partidaId: e.target.value })}>{opcionesNueva.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}</select></Campo>
          <Campo etiqueta="Cantidad producida"><EntradaNumero valor={nueva.cantidad || null} alCambiar={(v) => setNueva({ ...nueva, cantidad: num(v) })} /></Campo>
          <Campo etiqueta="Trabajadores"><EntradaNumero valor={nueva.trabajadores} decimales={0} alCambiar={(v) => setNueva({ ...nueva, trabajadores: num(v) })} /></Campo>
          <Campo etiqueta="Horas trabajadas"><EntradaNumero valor={nueva.horas} decimales={1} alCambiar={(v) => setNueva({ ...nueva, horas: num(v) })} /></Campo>
          <Campo etiqueta="Nota"><EntradaTexto valor={nueva.nota} alCambiar={(v) => setNueva({ ...nueva, nota: v })} /></Campo>
        </div>
        <div className="fila-flex" style={{ marginTop: 10 }}>
          <button
            className="boton primario"
            disabled={!nueva.partidaId || !(nueva.cantidad > 0) || !(nueva.trabajadores > 0) || !(nueva.horas > 0)}
            onClick={() => {
              mut((d) => void d.mediciones.push({ ...nueva, id: uid('med') }));
              setNueva({ ...nueva, cantidad: 0, nota: '' });
              ctx.avisar('Medición registrada');
            }}
          >
            Registrar
          </button>
          {prev && prev.hhUnidadReal !== null && (
            <span className="pequeno">
              {fmt(prev.hh, 1)} HH · {fmt(prev.hhUnidadReal, 4)} HH/u real contra {fmt(prev.hhUnidadPlan, 4)} HH/u del APU · IP <strong className={claseIp(prev.ip)}>{ind(prev.ip)}</strong>
              {prev.rendimientoEquivalente !== null && <> · equivale a {fmt(prev.rendimientoEquivalente, 2)} und/día (APU {fmt(r.apus[nueva.partidaId]?.rendimiento ?? 0, 2)})</>}
            </span>
          )}
        </div>
      </div>
      {resumen.length > 0 && (
        <>
          <div className="seccion-titulo">Índice de productividad por partida (HH del APU ÷ HH reales)</div>
          <GraficoBarras
            titulo="Índice de productividad por partida"
            datos={resumen.map((x) => ({ etiqueta: x.codigo, valor: x.ip ?? 0 }))}
            formato={(v) => fmt(v, 2)}
            referencia={{ y: 1, texto: 'IP = 1 (rendimiento del APU)' }}
            colorDe={(v) => (v >= 1 ? COLOR.plan : v >= 0.9 ? COLOR.ocre : COLOR.costo)}
            alto={190}
          />
          <VistaTabla t={tablaRendimientos(r, c)} alto="260px" />
          <p className="pequeno">IP mayor que 1: la cuadrilla rinde más que lo presupuestado. La desviación de MO ({m}) es el costo de las horas-hombre reales menos las del APU para lo producido, al costo por HH del análisis.</p>
        </>
      )}
      <div className="fila-flex" style={{ margin: '16px 0 8px' }}>
        <div className="seccion-titulo" style={{ margin: 0 }}>Mediciones</div>
        <span className="separador" />
        <select className="entrada" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 320 }} aria-label="Filtrar por partida">
          {opcionesPartidas(r, 'Todas las partidas').map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      </div>
      <TablaEditable
        filas={filas}
        clave={(x) => x.id}
        etiqueta="Mediciones de rendimiento"
        alto="420px"
        alEliminar={(x) => mut((d) => { d.mediciones = d.mediciones.filter((y) => y.id !== x.id); })}
        vacio={<div className="vacio"><p>Registre cada día lo que produjo una cuadrilla y con cuántas horas-hombre.</p></div>}
        columnas={[
          { clave: 'f', titulo: 'Fecha', ancho: 128, tipo: 'fecha', valor: (x) => x.fecha, cambiar: (x, v) => set(x, 'fecha', v) },
          { clave: 'fr', titulo: 'Frente', ancho: 150, tipo: 'select', opciones: opcionesFrentes(c), valor: (x) => x.frenteId, cambiar: (x, v) => set(x, 'frenteId', v) },
          { clave: 'p', titulo: 'Partida', tipo: 'select', opciones: opcionesPartidas(r), valor: (x) => x.partidaId, cambiar: (x, v) => set(x, 'partidaId', v) },
          { clave: 'q', titulo: 'Producido', ancho: 90, tipo: 'numero', valor: (x) => x.cantidad, cambiar: (x, v) => set(x, 'cantidad', num(v)) },
          { clave: 't', titulo: 'Trab.', ancho: 60, tipo: 'numero', decimales: 0, valor: (x) => x.trabajadores, cambiar: (x, v) => set(x, 'trabajadores', num(v)) },
          { clave: 'h', titulo: 'Horas', ancho: 64, tipo: 'numero', decimales: 1, valor: (x) => x.horas, cambiar: (x, v) => set(x, 'horas', num(v)) },
          { clave: 'hh', titulo: 'HH', ancho: 64, num: true, decimales: 1, valor: (x) => num(x.trabajadores) * num(x.horas) },
          { clave: 'ru', titulo: 'HH/u real', ancho: 84, num: true, decimales: 4, valor: (x) => rendimientoMedicion(r, x).hhUnidadReal ?? 0 },
          { clave: 'pu', titulo: 'HH/u APU', ancho: 84, num: true, decimales: 4, valor: (x) => rendimientoMedicion(r, x).hhUnidadPlan },
          { clave: 'ip', titulo: 'IP', ancho: 60, valor: (x) => rendimientoMedicion(r, x).ip, formato: (x) => ind(rendimientoMedicion(r, x).ip), clase: (x) => claseIp(rendimientoMedicion(r, x).ip) },
        ]}
      />
    </>
  );
}

// ------------------------------------------------------------------ carta balance

function Cartas({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [selId, setSel] = useState<string | null>(c.cartas[c.cartas.length - 1]?.id ?? null);
  const sel = c.cartas.find((x) => x.id === selId) ?? null;
  const editar = (fn: (x: CartaBalance) => void) => mut((d) => { const y = d.cartas.find((z) => z.id === selId); if (y) fn(y); });
  const s = sel ? resumenCarta(sel) : null;
  const historia = c.cartas.map((x) => ({ x, s: resumenCarta(x) })).filter((h) => h.s.total > 0).sort((a, b) => a.x.fecha.localeCompare(b.x.fecha));
  return (
    <>
      <p className="pequeno" style={{ marginTop: 0 }}>
        Observe a la cuadrilla a intervalos regulares (por ejemplo, cada minuto durante una hora) y anote qué hace cada trabajador. Se clasifica en trabajo productivo (TP), contributorio (TC: apoya pero no avanza la partida) y no contributorio (TNC: pérdidas). El nivel general de actividad es el mismo muestreo sobre todo el frente.
      </p>
      <div className="lista-cortes">
        {c.cartas.map((x) => <button key={x.id} className="chip" aria-pressed={x.id === selId} onClick={() => setSel(x.id)}>{x.tipo === 'nga' ? 'NGA' : 'Carta'} · {fechaCortaDM(x.fecha)}</button>)}
        <button className="boton chico" onClick={() => { const id = uid('cb'); mut((d) => void d.cartas.push({ id, fecha: hoyIso(), tipo: 'carta', frenteId: c.frentes[0]?.id ?? '', partidaId: '', cuadrilla: '', conteos: {}, nota: '' })); setSel(id); }}><IconoMas /> Nueva medición</button>
      </div>
      {!sel ? (
        <div className="vacio"><p>Registre una carta balance de una cuadrilla o un muestreo de nivel general de actividad del frente.</p></div>
      ) : (
        <div className="dos-columnas">
          <div>
            <div className="rejilla" style={{ marginBottom: 10 }}>
              <Campo etiqueta="Fecha"><EntradaTexto type="date" valor={sel.fecha} alCambiar={(v) => editar((x) => { x.fecha = v; })} /></Campo>
              <Campo etiqueta="Tipo"><select value={sel.tipo} onChange={(e) => editar((x) => { x.tipo = e.target.value as CartaBalance['tipo']; })}><option value="carta">Carta balance (cuadrilla)</option><option value="nga">Nivel general de actividad</option></select></Campo>
              <Campo etiqueta="Frente"><select value={sel.frenteId} onChange={(e) => editar((x) => { x.frenteId = e.target.value; })}>{opcionesFrentes(c).map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}</select></Campo>
              <Campo etiqueta="Partida" className="ancho-2"><select value={sel.partidaId} onChange={(e) => editar((x) => { x.partidaId = e.target.value; })}>{opcionesPartidas(r).map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}</select></Campo>
              <Campo etiqueta="Cuadrilla"><EntradaTexto valor={sel.cuadrilla} placeholder="1 op + 3 peones" alCambiar={(v) => editar((x) => { x.cuadrilla = v; })} /></Campo>
            </div>
            <TablaEditable
              filas={CATEGORIAS_CARTA}
              clave={(x) => x.clave}
              etiqueta="Conteo de observaciones"
              columnas={[
                { clave: 'g', titulo: 'Grupo', ancho: 60, valor: (x) => x.grupo, formato: (x) => <Insignia estado={x.grupo === 'TP' ? 'ok' : x.grupo === 'TC' ? 'advertencia' : 'error'}>{x.grupo}</Insignia> },
                { clave: 't', titulo: 'Categoría', valor: (x) => x.texto },
                { clave: 'n', titulo: 'Observaciones', ancho: 110, tipo: 'numero', decimales: 0, valor: (x) => sel.conteos[x.clave] ?? null, cambiar: (x, v) => editar((y) => { if (v === null) delete y.conteos[x.clave]; else y.conteos[x.clave] = num(v); }) },
                { clave: 'p', titulo: '%', ancho: 70, num: true, decimales: 1, valor: (x) => (s && s.total ? (num(sel.conteos[x.clave]) / s.total) * 100 : 0) },
              ]}
            />
            <button className="boton chico peligro" style={{ marginTop: 8 }} onClick={() => { if (confirm('¿Eliminar esta medición?')) { mut((d) => { d.cartas = d.cartas.filter((x) => x.id !== sel.id); }); setSel(null); } }}>Eliminar medición</button>
          </div>
          <div>
            {s && s.total > 0 ? (
              <>
                <div className="indicadores">
                  <Indicador titulo="Trabajo productivo" valor={pct(s.tp)} estado="ok" />
                  <Indicador titulo="Contributorio" valor={pct(s.tc)} estado="advertencia" />
                  <Indicador titulo="No contributorio" valor={pct(s.tnc)} estado="error" />
                  <Indicador titulo="Observaciones" valor={s.total} />
                </div>
                <BarraApilada titulo="Distribución del tiempo de la cuadrilla" partes={[{ texto: 'TP', valor: s.conteos.TP, color: COLOR.plan }, { texto: 'TC', valor: s.conteos.TC, color: COLOR.ocre }, { texto: 'TNC', valor: s.conteos.TNC, color: COLOR.costo }]} />
              </>
            ) : (
              <div className="vacio"><p>Ingrese el conteo de observaciones por categoría.</p></div>
            )}
          </div>
        </div>
      )}
      {sel && s && s.total > 0 && (
        <>
          <div className="seccion-titulo">Dónde se va el tiempo no productivo</div>
          <GraficoPareto titulo="Pareto del tiempo contributorio y no contributorio" items={pareto(Object.fromEntries(CATEGORIAS_CARTA.filter((x) => x.grupo !== 'TP').map((x) => [x.texto, num(sel.conteos[x.clave])])))} />
        </>
      )}
      {historia.length > 1 && (
        <>
          <div className="seccion-titulo">Evolución del trabajo productivo</div>
          <GraficoBarras titulo="Trabajo productivo por medición" datos={historia.map((h) => ({ etiqueta: fechaCortaDM(h.x.fecha), valor: h.s.tp }))} formato={(v) => `${fmt(v, 0)}%`} alto={170} />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ pérdidas

function Perdidas({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [por, setPor] = useState<'horas' | 'costo'>('horas');
  const set = (x: Perdida, campo: keyof Perdida, v: unknown) => mut((d) => { const y = d.perdidas.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[campo] = v; });
  const datos: Record<string, number> = {};
  for (const p of c.perdidas) datos[p.tipo] = (datos[p.tipo] ?? 0) + num(por === 'horas' ? p.horas : p.costo);
  const m = r.proyecto.meta.moneda;
  return (
    <>
      <div className="cifras">
        <div><span>Registros</span><strong>{c.perdidas.length}</strong></div>
        <div><span>Horas perdidas</span><strong>{fmt(c.perdidas.reduce((s, p) => s + num(p.horas), 0), 1)}</strong></div>
        <div><span>Costo estimado</span><strong>{m} {fmt(c.perdidas.reduce((s, p) => s + num(p.costo), 0))}</strong></div>
      </div>
      {c.perdidas.length > 0 && (
        <>
          <div className="fila-flex" style={{ marginBottom: 6 }}>
            <div className="seccion-titulo" style={{ margin: 0 }}>Pareto de pérdidas</div>
            <div className="segmentado">
              <button aria-pressed={por === 'horas'} className="si" onClick={() => setPor('horas')}>Por horas</button>
              <button aria-pressed={por === 'costo'} className="si" onClick={() => setPor('costo')}>Por costo</button>
            </div>
          </div>
          <GraficoPareto titulo="Pareto de pérdidas" items={pareto(datos)} />
        </>
      )}
      <div className="herramientas" style={{ marginBottom: 8 }}>
        <button className="boton chico" onClick={() => mut((d) => void d.perdidas.push({ id: uid('prd'), fecha: hoyIso(), frenteId: c.frentes[0]?.id ?? '', partidaId: '', tipo: 'Esperas', descripcion: '', horas: 0, costo: 0 }))}><IconoMas /> Pérdida</button>
        <span className="pequeno">Las 8 pérdidas del lean: esperas, transporte, movimientos, sobreprocesamiento, inventario, sobreproducción, defectos y talento no aprovechado.</span>
      </div>
      <TablaEditable
        filas={[...c.perdidas].sort((a, b) => b.fecha.localeCompare(a.fecha))}
        clave={(x) => x.id}
        etiqueta="Registro de pérdidas"
        alEliminar={(x) => mut((d) => { d.perdidas = d.perdidas.filter((y) => y.id !== x.id); })}
        vacio={<div className="vacio"><p>Registre las pérdidas observadas en campo para atacar las más frecuentes.</p></div>}
        columnas={[
          { clave: 'f', titulo: 'Fecha', ancho: 128, tipo: 'fecha', valor: (x) => x.fecha, cambiar: (x, v) => set(x, 'fecha', v) },
          { clave: 'fr', titulo: 'Frente', ancho: 150, tipo: 'select', opciones: opcionesFrentes(c), valor: (x) => x.frenteId, cambiar: (x, v) => set(x, 'frenteId', v) },
          { clave: 'p', titulo: 'Partida', ancho: 230, tipo: 'select', opciones: opcionesPartidas(r), valor: (x) => x.partidaId, cambiar: (x, v) => set(x, 'partidaId', v) },
          { clave: 't', titulo: 'Tipo', ancho: 170, tipo: 'select', opciones: opciones(TIPOS_PERDIDA), valor: (x) => x.tipo, cambiar: (x, v) => set(x, 'tipo', v) },
          { clave: 'd', titulo: 'Descripción', tipo: 'texto', valor: (x) => x.descripcion, cambiar: (x, v) => set(x, 'descripcion', v) },
          { clave: 'h', titulo: 'Horas', ancho: 70, tipo: 'numero', decimales: 1, valor: (x) => x.horas, cambiar: (x, v) => set(x, 'horas', num(v)) },
          { clave: 'c', titulo: `Costo (${m})`, ancho: 96, tipo: 'numero', valor: (x) => x.costo, cambiar: (x, v) => set(x, 'costo', num(v)) },
        ]}
      />
    </>
  );
}

// ------------------------------------------------------------------ 5S e inspecciones

function Inspecciones({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const ordenadas = [...c.inspecciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const [selId, setSel] = useState<string | null>(ordenadas[ordenadas.length - 1]?.id ?? null);
  const sel = c.inspecciones.find((x) => x.id === selId) ?? null;
  const editar = (fn: (x: Inspeccion) => void) => mut((d) => { const y = d.inspecciones.find((z) => z.id === selId); if (y) fn(y); });
  const nueva = (plantilla: Inspeccion['plantilla']) => {
    const id = uid('ins');
    mut((d) => void d.inspecciones.push({ id, fecha: hoyIso(), plantilla, frenteId: c.frentes[0]?.id ?? '', responsable: '', items: PLANTILLAS_INSPECCION[plantilla].items.map((texto) => ({ texto, resultado: 'si', nota: '' })), nota: '' }));
    setSel(id);
  };
  const puntaje = sel ? puntajeInspeccion(sel) : null;
  return (
    <>
      <div className="lista-cortes">
        {ordenadas.map((x) => <button key={x.id} className="chip" aria-pressed={x.id === selId} onClick={() => setSel(x.id)}>{x.plantilla === '5s' ? '5S' : 'Frente'} · {fechaCortaDM(x.fecha)} · {pct(puntajeInspeccion(x), 0)}</button>)}
        <button className="boton chico" onClick={() => nueva('5s')}><IconoMas /> Inspección 5S</button>
        <button className="boton chico" onClick={() => nueva('frente')}><IconoMas /> Liberación de frente</button>
      </div>
      {!sel ? (
        <div className="vacio"><p>Use la lista 5S para el orden del frente y la de liberación para confirmar que el frente está listo antes de iniciar una actividad.</p></div>
      ) : (
        <div className="dos-columnas">
          <div>
            <div className="rejilla" style={{ marginBottom: 10 }}>
              <Campo etiqueta="Fecha"><EntradaTexto type="date" valor={sel.fecha} alCambiar={(v) => editar((x) => { x.fecha = v; })} /></Campo>
              <Campo etiqueta="Frente"><select value={sel.frenteId} onChange={(e) => editar((x) => { x.frenteId = e.target.value; })}>{opcionesFrentes(c).map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}</select></Campo>
              <Campo etiqueta="Responsable"><EntradaTexto valor={sel.responsable} alCambiar={(v) => editar((x) => { x.responsable = v; })} /></Campo>
            </div>
            <div className="lista-check panel">
              {sel.items.map((it, i) => (
                <div className="item" key={i}>
                  <span>{it.texto}</span>
                  <div className="segmentado" role="group" aria-label={it.texto}>
                    {(['si', 'no', 'na'] as const).map((v) => (
                      <button key={v} className={v} aria-pressed={it.resultado === v} onClick={() => editar((x) => { x.items[i].resultado = v; })}>{v === 'si' ? 'Sí' : v === 'no' ? 'No' : 'N. A.'}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Campo etiqueta="Observaciones" className="ancho-total"><EntradaTexto valor={sel.nota} alCambiar={(v) => editar((x) => { x.nota = v; })} /></Campo>
            <button className="boton chico peligro" style={{ marginTop: 8 }} onClick={() => { if (confirm('¿Eliminar esta inspección?')) { mut((d) => { d.inspecciones = d.inspecciones.filter((x) => x.id !== sel.id); }); setSel(null); } }}>Eliminar inspección</button>
          </div>
          <div>
            <div className="indicadores">
              <Indicador titulo={PLANTILLAS_INSPECCION[sel.plantilla].nombre} valor={pct(puntaje, 0)} estado={estadoIndice(puntaje === null ? null : puntaje / 100, 0.85, 0.7)} detalle={`${sel.items.filter((x) => x.resultado === 'no').length} no conformidades · ${fc(sel.fecha)}`} />
            </div>
            {sel.plantilla === 'frente' && puntaje !== null && puntaje < 100 && <div className="aviso advertencia">El frente no está completamente liberado: resuelva los puntos marcados «No» o regístrelos como restricciones en Last Planner.</div>}
            {ordenadas.length > 1 && <GraficoBarras titulo="Puntaje de inspecciones" datos={ordenadas.map((x) => ({ etiqueta: `${x.plantilla === '5s' ? '5S' : 'Fr'} ${fechaCortaDM(x.fecha)}`, valor: puntajeInspeccion(x) ?? 0 }))} formato={(v) => `${fmt(v, 0)}%`} referencia={{ y: 85, texto: 'Meta 85 %' }} alto={180} />}
          </div>
        </div>
      )}
    </>
  );
}
