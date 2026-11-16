// Ingeniería de valor y Target Value Design: costo meta por título, alternativas con índice de valor, matriz de
// decisión ponderada, seguimiento de la brecha y aplicación de una alternativa aprobada al presupuesto (con deshacer).
import { useMemo, useState } from 'react';
import { produce } from 'immer';
import { hoyIso } from '../../engine/control';
import { crearEscenario } from '../../engine/escenarios';
import { calcularTodo } from '../../engine/index';
import { fmt, num, uid } from '../../engine/util';
import {
  type Alternativa, aplicarAlternativa, calcularMetas, costoActual, costoAlternativa, deshacerAlternativa, esPartida, indiceValor, nombreAmbito,
  puntajePonderado, tituloDe,
} from '../../engine/valor';
import { AreaTexto, Campo, EntradaNumero, EntradaTexto, Insignia, Pestanas, TablaEditable } from '../componentes';
import { fc, pct, useControl } from '../control';
import type { Contexto } from '../estado';
import { COLOR, GraficoBarras, GraficoLineas, Indicador } from '../graficos';

type Pest = 'metas' | 'alternativas' | 'matriz';

const ESTADOS = [
  { valor: 'propuesta', texto: 'Propuesta' },
  { valor: 'aprobada', texto: 'Aprobada' },
  { valor: 'rechazada', texto: 'Rechazada' },
  { valor: 'aplicada', texto: 'Aplicada al presupuesto' },
];
const ESTADO_INS = { propuesta: 'neutra', aprobada: 'advertencia', rechazada: 'error', aplicada: 'ok' } as const;

export function ModValor({ ctx }: { ctx: Contexto }) {
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const [pest, setPest] = useState<Pest>('metas');
  const m = useMemo(() => calcularMetas(r, c.valor), [r, c.valor]);
  const mon = r.proyecto.meta.moneda;
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Ingeniería de valor y costo meta</h1>
          <p className="proposito">Target Value Design: se fija un costo meta por título y se diseña hacia él con alternativas evaluadas por su función, costo, plazo y riesgos. Útil para cotizaciones privadas con precio objetivo del cliente.</p>
        </div>
      </div>
      <div className="indicadores">
        <Indicador titulo={`Costo directo estimado (${mon})`} valor={fmt(m.estimado, 0)} />
        <Indicador titulo={`Costo meta (${mon})`} valor={fmt(m.meta, 0)} detalle={m.estimado ? `${fmt((1 - m.meta / m.estimado) * 100, 1)} % de reducción` : ''} />
        <Indicador titulo="Estimado con alternativas aprobadas" valor={fmt(m.estimadoConAprobadas, 0)} detalle={`Ahorro aprobado ${fmt(m.estimado - m.estimadoConAprobadas, 0)}`} />
        <Indicador titulo="Brecha contra la meta" valor={fmt(m.brecha, 0)} detalle={m.brechaPct === null ? '' : `${fmt(m.brechaPct, 1)} % ${m.brecha > 0 ? 'por reducir' : 'bajo la meta'}`} estado={m.brecha <= 0 ? 'ok' : (m.brechaPct ?? 0) <= 3 ? 'advertencia' : 'error'} />
        <Indicador titulo="Ahorro ya aplicado al presupuesto" valor={fmt(m.ahorroAplicado, 0)} estado={m.ahorroAplicado > 0 ? 'ok' : 'neutra'} />
      </div>
      <Pestanas
        valor={pest}
        alCambiar={setPest}
        opciones={[
          { id: 'metas', texto: 'Costo meta y brecha' },
          { id: 'alternativas', texto: 'Alternativas', extra: c.valor.alternativas.length ? <Insignia estado="neutra">{c.valor.alternativas.length}</Insignia> : undefined },
          { id: 'matriz', texto: 'Matriz de decisión' },
        ]}
      />
      {!r.hojas.some((h) => h.metrado > 0) ? (
        <div className="vacio"><p>El presupuesto no tiene partidas con metrado.</p></div>
      ) : pest === 'metas' ? <Metas ctx={ctx} /> : pest === 'alternativas' ? <Alternativas ctx={ctx} /> : <Matriz ctx={ctx} />}
    </div>
  );
}

function Metas({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const m = useMemo(() => calcularMetas(r, c.valor), [r, c.valor]);
  const mon = r.proyecto.meta.moneda;
  type F = (typeof m.filas)[number];
  const setMeta = (f: F, k: 'modo' | 'valor', v: unknown) =>
    mut((d) => {
      const x = d.valor.metas[f.tituloId] ?? { modo: 'reduccion', valor: null };
      if (k === 'modo') x.modo = v as 'monto' | 'reduccion';
      else x.valor = v === null || v === undefined || (v as unknown) === '' ? null : num(v);
      d.valor.metas[f.tituloId] = x;
    });
  const seg = c.valor.seguimiento;
  return (
    <>
      <div className="fila-flex" style={{ gap: 12, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
        <Campo etiqueta={`Costo directo permitido (${mon})`} ayuda="Precio objetivo del cliente menos gastos generales y utilidad. Se reparte en proporción al estimado.">
          <EntradaNumero valor={c.valor.costoPermitido} decimales={2} alCambiar={(v) => mut((d) => { d.valor.costoPermitido = v === null || (v as unknown) === '' ? null : num(v); })} />
        </Campo>
        <Campo etiqueta="Reducción general (%)" ayuda="Se usa si no hay costo permitido ni meta propia del título">
          <EntradaNumero valor={c.valor.reduccionPct} decimales={1} permitirVacio={false} alCambiar={(v) => mut((d) => { d.valor.reduccionPct = Math.max(0, num(v)); })} />
        </Campo>
      </div>
      <TablaEditable
        etiqueta="Costo meta por título"
        filas={m.filas}
        clave={(f) => f.tituloId}
        columnas={[
          { clave: 't', titulo: 'Título', valor: (f) => `${f.codigo} ${f.descripcion}` },
          { clave: 'e', titulo: 'Estimado', ancho: 120, num: true, valor: (f) => fmt(f.estimado, 2) },
          { clave: 'mo', titulo: 'Meta propia', ancho: 150, tipo: 'select', opciones: [{ valor: 'reduccion', texto: '% de reducción' }, { valor: 'monto', texto: 'Monto meta' }], valor: (f) => c.valor.metas[f.tituloId]?.modo ?? 'reduccion', cambiar: (f, v) => setMeta(f, 'modo', v) },
          { clave: 'v', titulo: 'Valor', ancho: 110, tipo: 'numero', decimales: 2, valor: (f) => c.valor.metas[f.tituloId]?.valor ?? null, cambiar: (f, v) => setMeta(f, 'valor', v) },
          { clave: 'm', titulo: 'Costo meta', ancho: 120, num: true, valor: (f) => fmt(f.meta, 2) },
          { clave: 'a', titulo: 'Ahorro aprobado', ancho: 120, num: true, valor: (f) => fmt(f.ahorroAprobado, 2) },
          { clave: 'ea', titulo: 'Estimado con aprobadas', ancho: 150, num: true, valor: (f) => fmt(f.estimadoConAprobadas, 2) },
          { clave: 'b', titulo: 'Brecha', ancho: 120, num: true, valor: (f) => f.brecha, formato: (f) => <span style={{ color: f.brecha > 0 ? COLOR.costo : COLOR.plan }}>{fmt(f.brecha, 2)}</span> },
          { clave: 'bp', titulo: 'Brecha %', ancho: 90, num: true, valor: (f) => pct(f.brechaPct, 1) },
        ]}
      />
      <GraficoBarras
        titulo="Estimado con alternativas aprobadas contra costo meta por título"
        datos={m.filas.map((f) => ({ etiqueta: f.codigo, valor: f.estimadoConAprobadas }))}
        segunda={{ nombre: 'Costo meta', valores: m.filas.map((f) => f.meta), color: COLOR.ocre, primera: 'Estimado con aprobadas' }}
        formato={(v) => fmt(v / 1000, 0) + ' mil'}
        alto={200}
      />
      <div className="seccion-titulo">Seguimiento de la brecha</div>
      <div className="fila-flex" style={{ marginBottom: 8 }}>
        <button
          className="boton"
          onClick={() => {
            mut((d) => void d.valor.seguimiento.push({ id: uid('seg'), fecha: hoyIso(), estimado: m.estimadoConAprobadas, meta: m.meta, nota: '' }));
            ctx.avisar('Estimado actual registrado en el seguimiento');
          }}
        >
          Registrar el estimado actual
        </button>
        <span className="pequeno">Registre el estimado en cada revisión del diseño para ver cómo se cierra la brecha.</span>
      </div>
      {seg.length > 1 && (
        <GraficoLineas
          titulo="Estimado contra costo meta en el tiempo"
          series={[
            { nombre: 'Estimado', color: COLOR.real, marcadores: true, puntos: seg.map((s, i) => ({ x: i, y: s.estimado })) },
            { nombre: 'Costo meta', color: COLOR.ocre, discontinua: true, puntos: seg.map((s, i) => ({ x: i, y: s.meta })) },
          ]}
          etiquetaX={(x) => fc(seg[Math.round(x)]?.fecha)}
          yMin={Math.min(...seg.map((s) => Math.min(s.estimado, s.meta))) * 0.97}
          formatoY={(v) => fmt(v / 1000, 0) + ' mil'}
          alto={200}
        />
      )}
      <TablaEditable
        etiqueta="Seguimiento de la brecha"
        filas={seg}
        clave={(s) => s.id}
        alEliminar={(s) => mut((d) => { d.valor.seguimiento = d.valor.seguimiento.filter((x) => x.id !== s.id); })}
        vacio="Sin registros."
        columnas={[
          { clave: 'f', titulo: 'Fecha', ancho: 140, tipo: 'fecha', valor: (s) => s.fecha, cambiar: (s, v) => mut((d) => { const x = d.valor.seguimiento.find((y) => y.id === s.id); if (x) x.fecha = String(v); }) },
          { clave: 'e', titulo: 'Estimado', ancho: 130, num: true, valor: (s) => fmt(s.estimado, 2) },
          { clave: 'm', titulo: 'Meta', ancho: 130, num: true, valor: (s) => fmt(s.meta, 2) },
          { clave: 'b', titulo: 'Brecha', ancho: 120, num: true, valor: (s) => fmt(s.estimado - s.meta, 2) },
          { clave: 'n', titulo: 'Nota', tipo: 'texto', valor: (s) => s.nota, cambiar: (s, v) => mut((d) => { const x = d.valor.seguimiento.find((y) => y.id === s.id); if (x) x.nota = String(v); }) },
        ]}
      />
    </>
  );
}

function opcionesAmbito(ctx: Contexto) {
  return [{ valor: '', texto: '— Partida o título —' }, ...ctx.resultados.filas.filter((f) => f.esTitulo || f.metrado > 0).map((f) => ({ valor: f.partida.id, texto: `${f.esTitulo ? '▸ ' : ''}${f.partida.codigo} ${f.partida.descripcion}` }))];
}

function Alternativas({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const v = c.valor;
  const [sel, setSel] = useState<string | null>(v.alternativas[0]?.id ?? null);
  const a = v.alternativas.find((x) => x.id === sel) ?? null;
  const set = (x: Alternativa, k: keyof Alternativa, val: unknown) => mut((d) => { const y = d.valor.alternativas.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[k] = val; });
  const editar = (fn: (y: Alternativa) => void) => mut((d) => { const y = d.valor.alternativas.find((z) => z.id === sel); if (y) fn(y); });
  const aplicar = (x: Alternativa) => {
    const antes = costoActual(r, x.ambitoId);
    const despues = costoAlternativa(r, x) ?? antes;
    const lb = c.lineaBase ? '\n\nLa línea base de control no cambia: queda como estaba al congelarla.' : '';
    if (!window.confirm(`Se aplicará ${x.codigo} al presupuesto.\n\n${nombreAmbito(r, x.ambitoId)}\nCosto directo: ${fmt(antes, 2)} → ${fmt(despues, 2)} (${fmt(despues - antes, 2)})\n\nSe guarda un respaldo para deshacerlo cuando quiera.${lb}`)) return;
    let error: string | null = null;
    ctx.actualizar((d) => { error = aplicarAlternativa(d, x, antes, hoyIso()); });
    ctx.avisar(error ?? `${x.codigo} aplicada al presupuesto`, !!error);
  };
  // ingeniería de valor → versiones: la alternativa se guarda como versión nueva (sin tocar el presupuesto) para compararla
  const comoVersion = (x: Alternativa) => {
    const antes = costoActual(r, x.ambitoId);
    let error: string | null = null;
    const p2 = produce(ctx.proyecto, (d) => { error = aplicarAlternativa(d as never, x, antes, hoyIso()); });
    if (error) return ctx.avisar(error, true);
    const e = crearEscenario(p2, calcularTodo(p2), `Con ${x.codigo}: ${x.descripcion}`.slice(0, 80), 'otro', 'Alternativa de ingeniería de valor');
    ctx.actualizar((d) => { (d.escenarios ??= []).push(e); }, `Versión con la alternativa ${x.codigo}`);
    ctx.avisar(`Versión «${e.nombre}» guardada: compárela en Versiones del presupuesto.`);
    ctx.ir('versiones');
  };
  const deshacer = (x: Alternativa) => {
    if (!window.confirm(`Se devolverá la partida, su APU y sus metrados a como estaban antes de aplicar ${x.codigo}. ¿Continuar?`)) return;
    let error: string | null = null;
    ctx.actualizar((d) => { error = deshacerAlternativa(d, x.id); });
    ctx.avisar(error ?? `${x.codigo} deshecha: el presupuesto volvió a su versión anterior`, !!error);
  };
  return (
    <>
      <TablaEditable
        etiqueta="Alternativas de ingeniería de valor"
        filas={v.alternativas}
        clave={(x) => x.id}
        alto={a ? '300px' : 'calc(100vh - 380px)'}
        alClicFila={(x) => setSel(x.id)}
        claseFila={(x) => (x.id === sel ? 'seleccionada' : undefined)}
        alEliminar={(x) => { if (x.estado === 'aplicada') { ctx.avisar('Primero deshaga la alternativa aplicada', true); return; } mut((d) => { d.valor.alternativas = d.valor.alternativas.filter((z) => z.id !== x.id); }); }}
        vacio="Sin alternativas. Agregue una para la partida o el título que quiera optimizar."
        pie={
          <button
            className="boton chico"
            onClick={() => {
              const id = uid('alt');
              const n = v.alternativas.map((x) => parseInt(x.codigo.replace(/\D+/g, ''), 10)).filter(isFinite);
              mut((d) => void d.valor.alternativas.push({ id, codigo: `VE-${String((n.length ? Math.max(...n) : 0) + 1).padStart(2, '0')}`, ambitoId: '', descripcion: '', costo: null, plazoDias: null, funcion: 5, ventajas: '', riesgos: '', puntajes: {}, estado: 'propuesta', aplicacion: null, respaldo: null }));
              setSel(id);
            }}
          >
            Agregar alternativa
          </button>
        }
        columnas={[
          { clave: 'c', titulo: 'Código', ancho: 80, tipo: 'texto', valor: (x) => x.codigo, cambiar: (x, val) => set(x, 'codigo', val) },
          { clave: 'am', titulo: 'Partida o título', ancho: 210, tipo: 'select', opciones: opcionesAmbito(ctx), valor: (x) => x.ambitoId, cambiar: (x, val) => set(x, 'ambitoId', val) },
          { clave: 'd', titulo: 'Alternativa', ancho: 300, tipo: 'texto', valor: (x) => x.descripcion, cambiar: (x, val) => set(x, 'descripcion', val) },
          { clave: 'ca', titulo: 'Costo actual', ancho: 110, num: true, valor: (x) => fmt(x.estado === 'aplicada' ? x.respaldo?.costoAnterior ?? 0 : costoActual(r, x.ambitoId), 2) },
          { clave: 'cn', titulo: 'Costo alternativa', ancho: 120, num: true, valor: (x) => { const k = costoAlternativa(r, x); return k === null ? '—' : fmt(k, 2); } },
          { clave: 'pl', titulo: 'Δ plazo (d)', ancho: 86, tipo: 'numero', decimales: 0, valor: (x) => x.plazoDias, cambiar: (x, val) => set(x, 'plazoDias', val === null || val === '' ? null : num(val)) },
          { clave: 'fu', titulo: 'Función (1–10)', ancho: 96, tipo: 'numero', decimales: 0, valor: (x) => x.funcion, cambiar: (x, val) => set(x, 'funcion', Math.min(10, Math.max(1, num(val, 5)))) },
          { clave: 'iv', titulo: 'Índice de valor', ancho: 100, num: true, valor: (x) => indiceValor(r, v, x), formato: (x) => { const k = indiceValor(r, v, x); return k === null ? '—' : <Insignia estado={k >= 1.05 ? 'ok' : k >= 0.95 ? 'neutra' : 'error'}>{fmt(k, 2)}</Insignia>; } },
          { clave: 'pp', titulo: 'Puntaje', ancho: 74, num: true, valor: (x) => { const k = puntajePonderado(v.criterios, x.puntajes); return k === null ? '—' : fmt(k, 2); } },
          {
            clave: 'e', titulo: 'Estado', ancho: 150, valor: (x) => x.estado,
            formato: (x) => x.estado === 'aplicada'
              ? <Insignia estado="ok">Aplicada</Insignia>
              : <select value={x.estado} aria-label="Estado" onClick={(e) => e.stopPropagation()} onChange={(e) => set(x, 'estado', e.target.value)}>{ESTADOS.filter((s) => s.valor !== 'aplicada').map((s) => <option key={s.valor} value={s.valor}>{s.texto}</option>)}</select>,
          },
          {
            clave: 'ap', titulo: 'Presupuesto', ancho: 200, valor: () => '',
            formato: (x) => x.estado === 'aplicada'
              ? <button className="boton chico" onClick={(e) => { e.stopPropagation(); deshacer(x); }}>Deshacer</button>
              : <span className="fila-flex" style={{ gap: 4, flexWrap: 'nowrap' }}><button className="boton chico primario" disabled={x.estado !== 'aprobada' || !x.aplicacion || !esPartida(r, x.ambitoId)} title={!esPartida(r, x.ambitoId) ? 'Solo se aplican alternativas de una partida' : !x.aplicacion ? 'Indique cómo llevarla al presupuesto' : x.estado !== 'aprobada' ? 'Apruébela primero' : 'Aplicar al presupuesto'} onClick={(e) => { e.stopPropagation(); aplicar(x); }}>Aplicar</button><button className="boton chico" disabled={!x.aplicacion || !esPartida(r, x.ambitoId)} title="Guardarla como versión del presupuesto para compararla, sin cambiar el presupuesto" onClick={(e) => { e.stopPropagation(); comoVersion(x); }}>Como versión</button></span>,
          },
        ]}
      />
      {a && (
        <div className="panel" style={{ marginTop: 12, padding: 12 }}>
          <div className="seccion-titulo">{a.codigo} · {nombreAmbito(r, a.ambitoId) || 'sin partida'} <Insignia estado={ESTADO_INS[a.estado]}>{ESTADOS.find((s) => s.valor === a.estado)?.texto}</Insignia></div>
          {esPartida(r, a.ambitoId) ? (
            <>
              <div className="fila-flex" style={{ gap: 10, alignItems: 'center' }}>
                <label className="pequeno" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" disabled={a.estado === 'aplicada'} checked={!!a.aplicacion} onChange={(e) => editar((y) => { y.aplicacion = e.target.checked ? { modo: 'pu', pu: r.hojas.find((h) => h.partida.id === y.ambitoId)?.pu ?? null, apuDe: '', metrado: null, descripcion: '' } : null; })} />
                  Se puede llevar al presupuesto (el costo se calcula con el precio unitario y el metrado)
                </label>
              </div>
              {a.aplicacion && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10, marginTop: 8 }}>
                  <Campo etiqueta="Cómo se aplica">
                    <select disabled={a.estado === 'aplicada'} value={a.aplicacion.modo} onChange={(e) => editar((y) => { if (y.aplicacion) y.aplicacion.modo = e.target.value as 'pu' | 'apu'; })}>
                      <option value="pu">Precio unitario propio (subcontrato)</option>
                      <option value="apu">APU de otra partida</option>
                    </select>
                  </Campo>
                  {a.aplicacion.modo === 'pu' ? (
                    <Campo etiqueta={`Precio unitario (${r.proyecto.meta.moneda})`} ayuda={`Actual: ${fmt(r.hojas.find((h) => h.partida.id === a.ambitoId)?.pu ?? 0, 2)}`}>
                      <EntradaNumero valor={a.aplicacion.pu} decimales={2} alCambiar={(val) => editar((y) => { if (y.aplicacion) y.aplicacion.pu = val === null || (val as unknown) === '' ? null : num(val); })} />
                    </Campo>
                  ) : (
                    <Campo etiqueta="Copiar el APU de">
                      <select value={a.aplicacion.apuDe} onChange={(e) => editar((y) => { if (y.aplicacion) y.aplicacion.apuDe = e.target.value; })}>
                        <option value="">— Partida —</option>
                        {r.hojas.filter((h) => h.partida.id !== a.ambitoId).map((h) => <option key={h.partida.id} value={h.partida.id}>{h.partida.codigo} {h.partida.descripcion} (PU {fmt(h.pu, 2)})</option>)}
                      </select>
                    </Campo>
                  )}
                  <Campo etiqueta="Nuevo metrado" ayuda={`Vacío: el actual (${fmt(r.hojas.find((h) => h.partida.id === a.ambitoId)?.metrado ?? 0, 2)})`}>
                    <EntradaNumero valor={a.aplicacion.metrado} decimales={2} alCambiar={(val) => editar((y) => { if (y.aplicacion) y.aplicacion.metrado = val === null || (val as unknown) === '' ? null : num(val); })} />
                  </Campo>
                  <Campo etiqueta="Nueva descripción de la partida" ayuda="Vacío: la misma">
                    <EntradaTexto valor={a.aplicacion.descripcion} alCambiar={(val) => editar((y) => { if (y.aplicacion) y.aplicacion.descripcion = val; })} />
                  </Campo>
                </div>
              )}
            </>
          ) : null}
          {!a.aplicacion && (
            <Campo etiqueta={`Costo directo de la alternativa (${r.proyecto.meta.moneda})`} ayuda={a.ambitoId && !esPartida(r, a.ambitoId) ? 'Las alternativas de un título se evalúan y se siguen, pero se aplican partida por partida' : undefined}>
              <EntradaNumero valor={a.costo} decimales={2} alCambiar={(val) => editar((y) => { y.costo = val === null || (val as unknown) === '' ? null : num(val); })} />
            </Campo>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Campo etiqueta="Ventajas"><AreaTexto filas={2} valor={a.ventajas} alCambiar={(val) => editar((y) => { y.ventajas = val; })} /></Campo>
            <Campo etiqueta="Riesgos"><AreaTexto filas={2} valor={a.riesgos} alCambiar={(val) => editar((y) => { y.riesgos = val; })} /></Campo>
          </div>
          {a.respaldo && <p className="pequeno">Aplicada el {fc(a.respaldo.fecha)}. Respaldo guardado: partida, APU y {a.respaldo.metrados.length} filas de metrado{a.respaldo.insumoCreado ? `; insumo ${a.respaldo.insumoCreado} creado` : ''}.</p>}
        </div>
      )}
    </>
  );
}

function Matriz({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const v = c.valor;
  const ambitos = [...new Set(v.alternativas.map((a) => a.ambitoId).filter(Boolean))];
  const totalPeso = v.criterios.reduce((s, k) => s + num(k.peso), 0);
  return (
    <>
      <div className="seccion-titulo">Criterios y pesos <span className="pequeno">· suman {fmt(totalPeso, 0)}{Math.abs(totalPeso - 100) > 0.01 ? ' (se normalizan)' : ''}</span></div>
      <TablaEditable
        etiqueta="Criterios de decisión"
        filas={v.criterios}
        clave={(k) => k.id}
        alEliminar={(k) => mut((d) => { d.valor.criterios = d.valor.criterios.filter((x) => x.id !== k.id); })}
        pie={<button className="boton chico" onClick={() => mut((d) => void d.valor.criterios.push({ id: uid('crt'), nombre: 'Nuevo criterio', peso: 10 }))}>Agregar criterio</button>}
        columnas={[
          { clave: 'n', titulo: 'Criterio', tipo: 'texto', valor: (k) => k.nombre, cambiar: (k, val) => mut((d) => { const x = d.valor.criterios.find((y) => y.id === k.id); if (x) x.nombre = String(val); }) },
          { clave: 'p', titulo: 'Peso', ancho: 100, tipo: 'numero', decimales: 0, valor: (k) => k.peso, cambiar: (k, val) => mut((d) => { const x = d.valor.criterios.find((y) => y.id === k.id); if (x) x.peso = Math.max(0, num(val)); }) },
          { clave: 'w', titulo: 'Peso normalizado', ancho: 140, num: true, valor: (k) => (totalPeso ? pct((num(k.peso) / totalPeso) * 100, 1) : '—') },
        ]}
      />
      <p className="pequeno">Califique de 1 (malo) a 5 (excelente). El índice de valor compara función y costo con la solución actual: (función ÷ función actual) ÷ (costo ÷ costo actual); mayor que 1 significa más valor.</p>
      {!ambitos.length && <div className="vacio"><p>Agregue alternativas para compararlas.</p></div>}
      {ambitos.map((am) => {
        type Fila = { id: string; nombre: string; costo: number | null; funcion: number; puntajes: Record<string, number>; iv: number | null; actual: boolean; alt?: Alternativa };
        const alts = v.alternativas.filter((a) => a.ambitoId === am);
        const filas: Fila[] = [
          { id: `act_${am}`, nombre: 'Solución actual', costo: alts.find((a) => a.estado === 'aplicada')?.respaldo?.costoAnterior ?? costoActual(r, am), funcion: num(v.funcionActual[am], 5), puntajes: v.puntajesActual[am] ?? {}, iv: 1, actual: true },
          ...alts.map((a) => ({ id: a.id, nombre: `${a.codigo} ${a.descripcion}`, costo: costoAlternativa(r, a), funcion: a.funcion, puntajes: a.puntajes, iv: indiceValor(r, v, a), actual: false, alt: a })),
        ];
        const pond = filas.map((f) => puntajePonderado(v.criterios, f.puntajes) ?? -1);
        const mejor = Math.max(...pond);
        const setP = (f: Fila, k: string, val: unknown) =>
          mut((d) => {
            const n = val === null || val === '' ? undefined : Math.min(5, Math.max(1, num(val)));
            const obj = f.actual ? (d.valor.puntajesActual[am] ??= {}) : d.valor.alternativas.find((x) => x.id === f.id)?.puntajes;
            if (!obj) return;
            if (n === undefined) delete obj[k];
            else obj[k] = n;
          });
        return (
          <div key={am} style={{ marginBottom: 14 }}>
            <div className="seccion-titulo">{nombreAmbito(r, am)} <span className="pequeno">· {tituloDe(r, am) && tituloDe(r, am) !== am ? nombreAmbito(r, tituloDe(r, am)) : ''}</span></div>
            <TablaEditable
              etiqueta={`Matriz de decisión ${nombreAmbito(r, am)}`}
              filas={filas}
              clave={(f) => f.id}
              claseFila={(_, i) => (pond[i] === mejor && mejor > 0 ? 'seleccionada' : undefined)}
              columnas={[
                { clave: 'n', titulo: 'Opción', valor: (f) => f.nombre },
                { clave: 'c', titulo: 'Costo', ancho: 110, num: true, valor: (f) => (f.costo === null ? '—' : fmt(f.costo, 0)) },
                {
                  clave: 'f', titulo: 'Función', ancho: 80, tipo: 'numero', decimales: 0, valor: (f) => f.funcion,
                  cambiar: (f, val) => mut((d) => { const n = Math.min(10, Math.max(1, num(val, 5))); if (f.actual) d.valor.funcionActual[am] = n; else { const x = d.valor.alternativas.find((y) => y.id === f.id); if (x) x.funcion = n; } }),
                },
                ...v.criterios.map((k) => ({ clave: k.id, titulo: k.nombre, ancho: 104, tipo: 'numero' as const, decimales: 0, valor: (f: Fila) => f.puntajes[k.id] ?? null, cambiar: (f: Fila, val: unknown) => setP(f, k.id, val) })),
                { clave: 'p', titulo: 'Ponderado', ancho: 90, num: true, valor: (_f, i) => (pond[i] < 0 ? '—' : fmt(pond[i], 2)) },
                { clave: 'iv', titulo: 'Índice de valor', ancho: 104, num: true, valor: (f) => (f.iv === null ? '—' : fmt(f.iv, 2)) },
              ]}
            />
          </div>
        );
      })}
    </>
  );
}
