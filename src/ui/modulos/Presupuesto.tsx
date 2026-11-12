import { useEffect, useMemo, useState } from 'react';
import { detectarPlantilla, SECCIONES_EETT } from '../../engine/eett';
import type { ApuItem, MetradoFila, Partida, TipoInsumo } from '../../engine/types';
import { fechaCorta, fmt, uid } from '../../engine/util';
import { CAMPOS_METRADO, parcialMetrado } from '../../engine/compute';
import { parsearPreds, textoPreds } from '../../io/plantilla';
import { AreaTexto, Campo, EntradaNumero, EntradaTexto, Espaciador, IconoMas, Insignia, Pestanas, TablaEditable, useFilasVirtuales } from '../componentes';
import type { Contexto } from '../estado';
import { Icono } from '../iconos';
import { accionesPartida } from '../acciones';
import { CampoSubpresupuesto, filasDeSubpresupuesto, GestionPresupuesto, guardarComoSubpartida, PiesSubpresupuestos, SeccionSubpartidas, SelectorSubpresupuesto } from './PresupuestoAvanzado';
import { prefijoSubpartida } from '../../engine/types';

const TIPOS: { t: TipoInsumo; n: string }[] = [
  { t: 'MO', n: 'Mano de obra' },
  { t: 'MAT', n: 'Materiales' },
  { t: 'EQ', n: 'Equipos' },
  { t: 'SC', n: 'Subcontratos' },
];

export function ModPresupuesto({ ctx }: { ctx: Contexto }) {
  const { proyecto: p, resultados: r, partidaSel, setPartidaSel } = ctx;
  const sel = p.partidas.find((x) => x.id === partidaSel) ?? null;
  const observadas = useMemo(() => {
    const m = new Map<string, 'error' | 'advertencia'>();
    for (const v of r.validacion) for (const h of v.hallazgos) if (h.referencia && (m.get(h.referencia) !== 'error')) m.set(h.referencia, h.severidad);
    return m;
  }, [r.validacion]);
  // subpresupuesto que se muestra (null = todos)
  const [verSub, setVerSub] = useState<string | null>(null);
  const [gestion, setGestion] = useState(false);
  const filas = useMemo(() => {
    if (verSub === null || !(p.subpresupuestos ?? []).length) return r.filas;
    const ids = filasDeSubpresupuesto(ctx, verSub);
    return r.filas.filter((f) => ids.has(f.partida.id));
  }, [verSub, r.filas, p.subpresupuestos]); // eslint-disable-line react-hooks/exhaustive-deps
  // más de 300 filas: solo se dibujan las visibles; al elegir con flechas o desde otro módulo, la fila se lleva a la vista
  const v = useFilasVirtuales(filas.length);
  useEffect(() => {
    if (partidaSel) v.irA(filas.findIndex((f) => f.partida.id === partidaSel));
  }, [partidaSel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Presupuesto</h1>
          <p className="proposito">Árbol de títulos y partidas. Seleccione una fila para editar su análisis de precio unitario, su planilla de metrados, su programación y su especificación técnica. Use la barra de herramientas (Partidas) para agregar, mover, cambiar de nivel o eliminar.</p>
        </div>
        <div className="herramientas">
          <span className="pequeno">{r.hojas.length} partidas · {r.filas.length - r.hojas.length} títulos</span>
          <SelectorSubpresupuesto ctx={ctx} valor={verSub} alCambiar={setVerSub} />
          <button className="boton chico" onClick={() => setGestion(true)} title="Subpresupuestos con su propio pie y subpartidas reutilizables">Subpresupuestos y subpartidas</button>
        </div>
      </div>

      <div className="dividido">
        <div>
          {r.filas.length === 0 ? (
            <div className="vacio">
              <p>El presupuesto está vacío. Agregue un título y luego partidas, o tómelas de la biblioteca con su APU de referencia.</p>
              <div className="fila-flex" style={{ justifyContent: 'center' }}>
                <button className="boton" onClick={() => accionesPartida.titulo(ctx)}><Icono n="titulo" t={16} /> Agregar título</button>
                <button className="boton primario" onClick={() => ctx.abrirDialogo('biblioteca')}><Icono n="biblioteca" t={16} /> Abrir biblioteca de partidas</button>
              </div>
            </div>
          ) : (
            <div className="tabla-marco" ref={v.marco} style={{ maxHeight: 'calc(100vh - 330px)' }}>
              <table className="tabla tabla-presupuesto" aria-label="Presupuesto" aria-rowcount={v.activa ? r.filas.length + 2 : undefined}>
                <thead>
                  <tr>
                    <th style={{ width: 92 }}>Ítem</th>
                    <th>Descripción</th>
                    <th style={{ width: 48 }}>Und.</th>
                    <th className="num" style={{ width: 92 }}>Metrado</th>
                    <th className="num" style={{ width: 88 }}>Precio</th>
                    <th className="num" style={{ width: 108 }}>Parcial</th>
                  </tr>
                </thead>
                <tbody>
                  <Espaciador alto={v.arriba} columnas={6} />
                  {filas.slice(v.desde, v.hasta).map((f) => {
                    const obs = observadas.get(f.partida.codigo);
                    return (
                      <tr
                        key={f.partida.id}
                        data-v=""
                        data-partida={f.partida.id}
                        className={['clic', f.esTitulo ? (f.nivel === 1 ? 'titulo' : 'titulo-2') : '', partidaSel === f.partida.id ? 'seleccionada' : ''].join(' ')}
                        onClick={() => setPartidaSel(f.partida.id)}
                      >
                        <td className="arbol-codigo">
                          {obs && <span className="marca-estado" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 5, background: obs === 'error' ? 'var(--sello)' : 'var(--ocre)' }} />}
                          {f.partida.codigo}
                        </td>
                        <td className={`sangria-${Math.min(4, f.nivel)}`}>{f.partida.descripcion}</td>
                        <td>{f.partida.unidad}</td>
                        <td className="num">{f.esTitulo ? '' : fmt(f.metrado)}</td>
                        <td className="num">{f.esTitulo ? '' : fmt(f.pu)}</td>
                        <td className="num">{fmt(f.parcial)}</td>
                      </tr>
                    );
                  })}
                  <Espaciador alto={v.abajo} columnas={6} />
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>Costo directo</td>
                    <td className="num">{fmt(r.pie.costoDirecto)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <PieResumen ctx={ctx} />
          <PiesSubpresupuestos ctx={ctx} />
        </div>

        <div className="pegajoso" style={{ top: 0 }}>
          {!sel ? (
            <div className="vacio">Seleccione una partida del presupuesto para ver y editar su detalle. Con ↑ y ↓ se recorre el presupuesto.</div>
          ) : sel.titulo ? (
            <DetalleTitulo ctx={ctx} pt={sel} />
          ) : (
            <DetallePartida ctx={ctx} pt={sel} />
          )}
        </div>
      </div>
      {gestion && <GestionPresupuesto ctx={ctx} alCerrar={() => setGestion(false)} editor={(pt) => <EditorApu ctx={ctx} pt={pt} />} />}
    </div>
  );
}

function PieResumen({ ctx }: { ctx: Contexto }) {
  const { resultados: r, proyecto: p } = ctx;
  const filas: [string, number, boolean][] = [
    ['Costo directo', r.pie.costoDirecto, true],
    [`Gastos generales (${fmt(r.pie.ggPct)} %)`, r.pie.gg, false],
    [`Utilidad (${fmt(p.meta.utilidadPct)} %)`, r.pie.utilidad, false],
    ['Subtotal', r.pie.subtotal, true],
  ];
  if (p.meta.incluirIgv !== false) filas.push([`IGV (${fmt(p.meta.igvPct)} %)`, r.pie.igv, false]);
  filas.push([p.meta.modo === 'publico' ? 'Valor referencial' : p.meta.incluirIgv === false ? 'Presupuesto total (sin IGV)' : 'Presupuesto total', r.pie.total, true]);
  return (
    <div className="tabla-marco" style={{ marginTop: 12, maxWidth: 420, marginLeft: 'auto' }}>
      <table className="tabla" aria-label="Pie de presupuesto">
        <tbody>
          {filas.map(([n, v, t]) => (
            <tr key={n} className={t ? 'total' : ''}>
              <td>{n}</td>
              <td className="num">{p.meta.moneda} {fmt(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetalleTitulo({ ctx, pt }: { ctx: Contexto; pt: Partida }) {
  const { actualizar, resultados: r } = ctx;
  const f = r.filas.find((x) => x.partida.id === pt.id);
  const n = r.filas.filter((x) => x.partida.codigo.startsWith(pt.codigo + '.') && !x.esTitulo).length;
  return (
    <div className="panel">
      <div className="panel-cabecera">
        <div className="codigo">Título {pt.codigo}</div>
        <Campo etiqueta="Descripción">
          <EntradaTexto valor={pt.descripcion} alCambiar={(v) => actualizar((d) => { const x = d.partidas.find((y) => y.id === pt.id); if (x) x.descripcion = v; }, `Descripción de ${pt.codigo}`)} />
        </Campo>
      </div>
      <div className="panel-cuerpo">
        <div className="cifras">
          <div><span>Subtotal</span><strong>{fmt(f?.parcial ?? 0)}</strong></div>
          <div><span>Partidas</span><strong>{n}</strong></div>
          <div><span>Incidencia en el costo directo</span><strong>{r.pie.costoDirecto ? fmt(((f?.parcial ?? 0) / r.pie.costoDirecto) * 100) : '0.00'} %</strong></div>
        </div>
        <CampoSubpresupuesto ctx={ctx} pt={pt} />
        <p className="pequeno">Use Partida o Biblioteca en la barra de herramientas para agregar partidas dentro de este título; Nivel + y Nivel − lo mueven en el árbol.</p>
      </div>
    </div>
  );
}

function DetallePartida({ ctx, pt }: { ctx: Contexto; pt: Partida }) {
  const { actualizar, resultados: r, proyecto: p } = ctx;
  const [pest, setPest] = useState<'apu' | 'metrados' | 'programa' | 'eett'>('apu');
  const fila = r.filas.find((x) => x.partida.id === pt.id);
  const act = r.programa.actividades.find((a) => a.partidaId === pt.id);
  const upd = (f: (x: Partida) => void) => actualizar((d) => { const x = d.partidas.find((y) => y.id === pt.id); if (x) f(x as Partida); }, `Partida ${pt.codigo}`);
  return (
    <div className="panel">
      <div className="panel-cabecera">
        <div className="codigo">Partida {pt.codigo}</div>
        <div className="rejilla" style={{ gridTemplateColumns: '1fr 90px', marginTop: 4 }}>
          <Campo etiqueta="Descripción">
            <EntradaTexto valor={pt.descripcion} alCambiar={(v) => upd((x) => (x.descripcion = v))} />
          </Campo>
          <Campo etiqueta="Unidad">
            <EntradaTexto valor={pt.unidad} lista="unidades" alCambiar={(v) => upd((x) => (x.unidad = v))} />
          </Campo>
        </div>
        <datalist id="unidades">{['m', 'm2', 'm3', 'kg', 'und', 'glb', 'ha', 'km', 'mes', 'pto', 't', 'est'].map((u) => <option key={u} value={u} />)}</datalist>
        <div className="cifras">
          <div><span>Metrado</span><strong>{fmt(fila?.metrado ?? 0)} {pt.unidad}</strong></div>
          <div><span>Precio unitario</span><strong>{fmt(fila?.pu ?? 0)}</strong></div>
          <div><span>Parcial</span><strong>{fmt(fila?.parcial ?? 0)}</strong></div>
          <div><span>Duración</span><strong>{act ? `${act.duracion} d` : '—'}</strong></div>
        </div>
        <Pestanas
          valor={pest}
          alCambiar={setPest}
          opciones={[
            { id: 'apu', texto: 'Análisis de precio' },
            { id: 'metrados', texto: 'Metrados' },
            { id: 'programa', texto: 'Programación' },
            { id: 'eett', texto: 'Especificación' },
          ]}
        />
      </div>
      <div className="panel-cuerpo">
        {pest === 'apu' && <EditorApu ctx={ctx} pt={pt} />}
        {pest === 'metrados' && <EditorMetrados ctx={ctx} pt={pt} />}
        {pest === 'programa' && <EditorPrograma ctx={ctx} pt={pt} />}
        {pest === 'eett' && <EditorEett ctx={ctx} pt={pt} />}
        {void p}
      </div>
    </div>
  );
}

function EditorApu({ ctx, pt }: { ctx: Contexto; pt: Partida }) {
  const { proyecto: p, resultados: r, actualizar } = ctx;
  const apu = p.apus[pt.id] ?? { rendimiento: 0, items: [] };
  const calc = r.apus[pt.id] ?? (pt.id.startsWith(prefijoSubpartida) ? r.subpartidas[pt.id.slice(prefijoSubpartida.length)] : undefined);
  const esSubpartida = pt.id.startsWith(prefijoSubpartida);
  const subs = useMemo(() => new Map((p.subpartidas ?? []).map((s) => [s.codigo, s])), [p.subpartidas]);
  const [nuevo, setNuevo] = useState('');
  const ins = useMemo(() => new Map(p.insumos.map((i) => [i.codigo, i])), [p.insumos]);
  const setItem = (i: number, f: (x: ApuItem) => void) => actualizar((d) => { const a = d.apus[pt.id]; if (a) f(a.items[i] as ApuItem); }, `Análisis de ${pt.codigo}`);
  const agregar = () => {
    const codigo = nuevo.split(' — ')[0].trim();
    if (subs.has(codigo)) {
      if (pt.id === prefijoSubpartida + codigo) { ctx.avisar('Una subpartida no puede usarse dentro de sí misma.', true); return; }
      actualizar((d) => { (d.apus[pt.id] ?? (d.apus[pt.id] = { rendimiento: 1, items: [] })).items.push({ insumo: codigo, cantidad: 1 }); }, `Análisis de ${pt.codigo}`);
      setNuevo('');
      return;
    }
    const i = ins.get(codigo);
    if (!i) { ctx.avisar(`No existe el insumo ni la subpartida "${codigo}".`, true); return; }
    actualizar((d) => {
      const a = d.apus[pt.id] ?? (d.apus[pt.id] = { rendimiento: 1, items: [] });
      a.items.push(i.unidad.startsWith('%') ? { insumo: codigo, porcentaje: 3 } : i.tipo === 'MO' || i.tipo === 'EQ' ? { insumo: codigo, cuadrilla: 1 } : { insumo: codigo, cantidad: 1 });
    });
    setNuevo('');
  };
  const filas = calc ? [...calc.items] : [];
  const faltantes = apu.items.map((it, i) => ({ it, i })).filter(({ it }) => !ins.has(it.insumo) && !subs.has(it.insumo));
  return (
    <div>
      <div className="rejilla" style={{ gridTemplateColumns: '150px 110px 1fr', alignItems: 'end' }}>
        <Campo etiqueta={`Rendimiento (${pt.unidad || 'und'}/día)`}>
          <EntradaNumero valor={apu.rendimiento} decimales={4} alCambiar={(v) => actualizar((d) => { const a = d.apus[pt.id] ?? (d.apus[pt.id] = { rendimiento: 0, items: [] }); a.rendimiento = v ?? 0; }, `Rendimiento de ${pt.codigo}`)} />
        </Campo>
        <Campo etiqueta="Jornada (h/día)">
          <EntradaNumero valor={apu.jornada ?? null} decimales={1} placeholder={String(p.meta.jornadaHoras)} alCambiar={(v) => actualizar((d) => { const a = d.apus[pt.id] ?? (d.apus[pt.id] = { rendimiento: 0, items: [] }); a.jornada = v && v !== p.meta.jornadaHoras ? v : null; })} />
        </Campo>
        <p className="pequeno" style={{ margin: '0 0 6px' }}>
          Jornada {calc?.jornada ?? p.meta.jornadaHoras} h{apu.jornada ? ' (propia de este análisis)' : ' (la del proyecto)'}. En mano de obra y equipos escriba la cuadrilla; cantidad = cuadrilla × jornada ÷ rendimiento.
        </p>
      </div>
      {faltantes.length > 0 && (
        <div className="aviso error" style={{ marginTop: 10 }}>
          Insumos que no están en el catálogo: {faltantes.map((f) => f.it.insumo).join(', ')}.{' '}
          <button className="boton chico" onClick={() => actualizar((d) => { const a = d.apus[pt.id]; if (a) a.items = a.items.filter((x) => ins.has(x.insumo)); })}>Quitarlos</button>
        </div>
      )}
      {TIPOS.map(({ t, n }) => {
        const its = filas.filter((x) => x.insumo.tipo === t);
        if (!its.length) return null;
        return (
          <div key={t} style={{ marginTop: 12 }}>
            <div className="fila-flex" style={{ marginBottom: 4 }}>
              <h3 style={{ margin: 0 }}>{n}</h3>
              <span className="separador" />
              <span className="pequeno">Subtotal {fmt(calc?.subtotales[t] ?? 0)}</span>
            </div>
            <TablaEditable
              etiqueta={n}
              filas={its}
              clave={(x) => String(x.origen)}
              alEliminar={(x) => { if (x.subpartida) return ctx.avisar(`Este recurso viene de la subpartida ${x.subpartida}: quítela en la sección Subpartidas.`, true); actualizar((d) => { d.apus[pt.id]?.items.splice(x.origen, 1); }, `Análisis de ${pt.codigo}`); }}
              claseFila={(x) => (x.subpartida ? 'apagado' : undefined)}
              columnas={[
                { clave: 'c', titulo: 'Código', ancho: 66, valor: (x) => x.insumo.codigo, formato: (x) => (x.subpartida ? <span title={`De la subpartida ${x.subpartida}`}>{x.insumo.codigo} <small>de {x.subpartida}</small></span> : x.insumo.codigo) },
                { clave: 'd', titulo: 'Insumo', valor: (x) => x.insumo.descripcion },
                { clave: 'u', titulo: 'Und', ancho: 44, valor: (x) => x.insumo.unidad },
                ...(t === 'MO' || t === 'EQ'
                  ? [{
                      clave: 'cu',
                      titulo: 'Cuadrilla',
                      tipo: 'numero' as const,
                      ancho: 76,
                      decimales: 2,
                      valor: (x: (typeof its)[number]) => x.cuadrilla,
                      cambiar: (x: (typeof its)[number], v: unknown) => { if (!x.subpartida) setItem(x.origen, (it) => { it.cuadrilla = v as number | null; }); },
                    }]
                  : []),
                {
                  clave: 'ca',
                  titulo: t === 'EQ' ? 'Cantidad / %' : 'Cantidad',
                  tipo: 'numero',
                  ancho: 86,
                  decimales: 4,
                  valor: (x) => x.cantidad,
                  cambiar: (x, v) =>
                    x.subpartida ? ctx.avisar(`Las cantidades de ${x.subpartida} se cambian en su análisis o en la cantidad de la subpartida.`, true) : setItem(x.origen, (it) => {
                      if (x.porcentaje !== null) it.porcentaje = v as number | null;
                      else { it.cantidad = v as number | null; it.cuadrilla = null; }
                    }),
                },
                { clave: 'pr', titulo: 'Precio', num: true, ancho: 74, valor: (x) => (x.porcentaje !== null ? '% MO' : x.precio), formato: (x) => (x.porcentaje !== null ? <span className="apagado">% MO</span> : fmt(x.precio)) },
                { clave: 'pa', titulo: 'Parcial', num: true, ancho: 80, valor: (x) => x.parcial },
              ]}
            />
          </div>
        );
      })}
      <div className="fila-flex" style={{ marginTop: 14 }}>
        <input className="entrada" style={{ flex: 1 }} list="catalogo-insumos" placeholder="Buscar insumo por código o nombre…" value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} aria-label="Insumo a agregar" />
        <datalist id="catalogo-insumos">
          {p.insumos.map((i) => <option key={i.codigo} value={`${i.codigo} — ${i.descripcion} (${i.unidad})`} />)}
          {[...subs.values()].map((s) => <option key={s.codigo} value={`${s.codigo} — Subpartida: ${s.descripcion} (${s.unidad})`} />)}
        </datalist>
        <button className="boton" onClick={agregar}><IconoMas /> Agregar insumo</button>
        {!esSubpartida && <button className="boton chico" onClick={() => guardarComoSubpartida(ctx, pt)} title="Copia este análisis como subpartida para usarlo dentro de otros análisis">Guardar como subpartida</button>}
      </div>
      <SeccionSubpartidas ctx={ctx} pt={pt} calc={calc} />
      <div className="cifras" style={{ borderBottom: 0, borderTop: '1px solid var(--linea-2)', marginTop: 14, marginBottom: 0 }}>
        <div><span>Costo unitario directo</span><strong className="cifra-grande">{fmt(calc?.pu ?? 0)}</strong></div>
        <div><span>Por</span><strong>{pt.unidad}</strong></div>
      </div>
    </div>
  );
}

const ETQ_METRADO: Record<(typeof CAMPOS_METRADO)[number], string> = {
  veces: 'N.º veces',
  cantidad: 'Cantidad',
  factor: 'Factor',
  largo: 'Largo',
  ancho: 'Ancho',
  alto: 'Alto',
  area: 'Área',
  volumen: 'Volumen',
};

function EditorMetrados({ ctx, pt }: { ctx: Contexto; pt: Partida }) {
  const { proyecto: p, actualizar, resultados: r } = ctx;
  const filas = p.metrados.map((m, gi) => ({ m, gi })).filter((x) => x.m.partidaId === pt.id);
  const set = (gi: number, f: (m: MetradoFila) => void) => actualizar((d) => f(d.metrados[gi] as MetradoFila), `Metrado de ${pt.codigo}`);
  const num = (k: (typeof CAMPOS_METRADO)[number]) => ({
    clave: k,
    titulo: ETQ_METRADO[k],
    tipo: 'numero' as const,
    ancho: k === 'veces' || k === 'factor' ? 54 : 62,
    decimales: 2,
    valor: (x: { m: MetradoFila }) => x.m[k] ?? null,
    cambiar: (x: { gi: number }, v: unknown) => set(x.gi, (m) => { m[k] = v as number | null; }),
    // admite fórmulas («2*(3.5+4.2)»): se guarda el resultado y la fórmula (que va al Excel como fórmula)
    formula: (x: { m: MetradoFila }) => x.m.formulas?.[k],
    cambiarFormula: (x: { gi: number }, v: number | null, fo: string | undefined) => set(x.gi, (m) => {
      m[k] = v;
      if (fo) m.formulas = { ...(m.formulas ?? {}), [k]: fo };
      else if (m.formulas?.[k]) { const { [k]: _q, ...resto } = m.formulas; m.formulas = Object.keys(resto).length ? resto : undefined; }
    }),
  });
  return (
    <div>
      <p className="pequeno" style={{ marginTop: 0 }}>Parcial = producto de las casillas llenas (N.º veces × cantidad × factor × largo × ancho × alto × área × volumen). Las vacías no cuentan. Cada casilla acepta fórmulas, por ejemplo 2*(3.5+4.2); se guarda la fórmula y pasa al Excel como fórmula. Indique el plano que sustenta cada línea; el área y el volumen sirven para valores tomados del CAD.</p>
      <TablaEditable
        etiqueta="Metrados"
        filas={filas}
        clave={(x) => x.m.id}
        alEliminar={(x) => actualizar((d) => { d.metrados.splice(x.gi, 1); }, `Metrado de ${pt.codigo}`)}
        columnas={[
          { clave: 'd', titulo: 'Descripción', valor: (x) => x.m.descripcion, cambiar: (x, v) => set(x.gi, (m) => (m.descripcion = String(v))) },
          { clave: 'r', titulo: 'Referencia', ancho: 92, valor: (x) => x.m.referencia ?? '', cambiar: (x, v) => set(x.gi, (m) => (m.referencia = String(v))), placeholder: 'Plano…' },
          ...CAMPOS_METRADO.map((k) => num(k)),
          { clave: 'p', titulo: 'Parcial', num: true, ancho: 76, valor: (x) => parcialMetrado(x.m) },
        ]}
        pie={
          <tr>
            <td colSpan={2 + CAMPOS_METRADO.length}>Total ({pt.unidad})</td>
            <td className="num">{fmt(r.metradoPorPartida[pt.id] ?? 0)}</td>
            <td />
          </tr>
        }
      />
      <button className="boton" style={{ marginTop: 10 }} onClick={() => actualizar((d) => { d.metrados.push({ id: uid('m'), partidaId: pt.id, descripcion: '', referencia: '', veces: null, cantidad: null, factor: null, largo: null, ancho: null, alto: null, area: null, volumen: null }); })}>
        <IconoMas /> Agregar línea
      </button>
    </div>
  );
}

function EditorPrograma({ ctx, pt }: { ctx: Contexto; pt: Partida }) {
  const { proyecto: p, resultados: r, actualizar } = ctx;
  const cfg = p.programa[pt.id] ?? { cuadrillas: 1, duracionManual: null, predecesoras: [] };
  const act = r.programa.actividades.find((a) => a.partidaId === pt.id);
  const [errores, setErrores] = useState<string[]>([]);
  const set = (f: (c: typeof cfg) => void) => actualizar((d) => { const c = d.programa[pt.id] ?? (d.programa[pt.id] = { cuadrillas: 1, duracionManual: null, predecesoras: [] }); f(c as typeof cfg); }, `Programación de ${pt.codigo}`);
  const idPorCodigo = useMemo(() => new Map(p.partidas.filter((x) => !x.titulo).map((x) => [x.codigo, x.id])), [p.partidas]);
  return (
    <div>
      <div className="rejilla" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Campo etiqueta="Cuadrillas en paralelo">
          <EntradaNumero valor={cfg.cuadrillas ?? 1} decimales={0} alCambiar={(v) => set((c) => { c.cuadrillas = Math.max(1, v ?? 1); })} />
        </Campo>
        <Campo etiqueta="Duración fija (días laborables)" ayuda="Vacío = metrado ÷ (rendimiento × cuadrillas)">
          <EntradaNumero valor={cfg.duracionManual ?? null} decimales={0} alCambiar={(v) => set((c) => { c.duracionManual = v; })} />
        </Campo>
        <Campo etiqueta="Predecesoras" className="ancho-total" ayuda="Ejemplo: 01.03FC; 03.02CC+2; 04.04FF-1 (FC fin-comienzo, CC comienzo-comienzo, FF fin-fin, desfase en días laborables)">
          <EntradaTexto
            valor={textoPreds(p, cfg.predecesoras)}
            alCambiar={(v) => {
              const { preds, errores: e } = parsearPreds(v, idPorCodigo);
              setErrores(e);
              set((c) => { c.predecesoras = preds.filter((x) => x.id !== pt.id); });
            }}
          />
        </Campo>
      </div>
      {errores.length > 0 && <div className="aviso error" style={{ marginTop: 10 }}>{errores.join(' · ')}</div>}
      {act ? (
        <div className="cifras" style={{ marginTop: 12 }}>
          <div><span>Duración</span><strong>{act.duracion} días</strong></div>
          <div><span>Inicio</span><strong>{fechaCorta(act.inicio)}</strong></div>
          <div><span>Fin</span><strong>{fechaCorta(act.fin)}</strong></div>
          <div><span>Holgura</span><strong>{act.holgura} d</strong></div>
          <div><span>Ruta crítica</span><strong>{act.critica ? <Insignia estado="error">Crítica</Insignia> : 'No'}</strong></div>
        </div>
      ) : (
        <div className="aviso advertencia" style={{ marginTop: 12 }}>La partida entra al programa cuando tenga metrado.</div>
      )}
    </div>
  );
}

const SECCIONES = SECCIONES_EETT;

function EditorEett({ ctx, pt }: { ctx: Contexto; pt: Partida }) {
  const { proyecto: p, resultados: r, actualizar } = ctx;
  const e = r.eett.find((x) => x.partida.id === pt.id);
  const detectada = detectarPlantilla(pt.descripcion, p.plantillasEett);
  const [editar, setEditar] = useState(!!pt.eettTexto && Object.values(pt.eettTexto).some((x) => x));
  const upd = (f: (x: Partida) => void) => actualizar((d) => { const x = d.partidas.find((y) => y.id === pt.id); if (x) f(x as Partida); });
  return (
    <div>
      <div className="rejilla" style={{ gridTemplateColumns: '1fr auto', alignItems: 'end' }}>
        <Campo etiqueta="Plantilla">
          <select value={pt.eett ?? ''} onChange={(ev) => upd((x) => { x.eett = ev.target.value || undefined; })}>
            <option value="">Automática{detectada ? ` (detectada: ${detectada.nombre})` : ' (genérica)'}</option>
            {p.plantillasEett.map((pl) => <option key={pl.clave} value={pl.clave}>{pl.nombre}</option>)}
          </select>
        </Campo>
        <label className="casilla" style={{ marginBottom: 7 }}>
          <input type="checkbox" checked={editar} onChange={(ev) => { setEditar(ev.target.checked); if (!ev.target.checked) upd((x) => { delete x.eettTexto; }); }} />
          Texto propio
        </label>
      </div>
      {e?.generica && <div className="aviso advertencia" style={{ marginTop: 10 }}>Se usa la plantilla genérica. Elija una plantilla o redacte un texto propio.</div>}
      {!editar ? (
        <div className="texto-eett" style={{ marginTop: 10 }}>
          {e && SECCIONES.map((s) => (
            <div key={s.k}>
              <h4>{s.n}</h4>
              <p>{e.secciones[s.k].replace(/^- /gm, '• ')}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rejilla" style={{ gridTemplateColumns: '1fr', marginTop: 10 }}>
          <p className="pequeno" style={{ margin: 0 }}>Deje vacía una sección para usar el texto de la plantilla. Variables: {'{{materiales}}'}, {'{{equipos}}'}, {'{{unidad}}'}, {'{{codigo}}'}.</p>
          {SECCIONES.map((s) => (
            <Campo key={s.k} etiqueta={s.n}>
              <AreaTexto valor={pt.eettTexto?.[s.k] ?? ''} filas={3} placeholder={e?.secciones[s.k]} alCambiar={(v) => upd((x) => { x.eettTexto = { ...(x.eettTexto ?? {}), [s.k]: v }; })} />
            </Campo>
          ))}
        </div>
      )}
    </div>
  );
}
