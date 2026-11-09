// Kanban de materiales: tablero por estados, stock mínimo y punto de pedido, alertas y enlace con Last Planner.
import { useMemo, useState } from 'react';
import { hoyIso } from '../../engine/control';
import {
  alertaTarjeta, analisisMateriales, eliminarTarjeta, enlazarRestriccion, ESTADOS_KANBAN, type EstadoKanban, generarTarjetas, moverTarjeta,
  type ParametroMaterial, recibido, resumenKanban, type TarjetaKanban,
} from '../../engine/kanban';
import { fmt, num, uid } from '../../engine/util';
import { fechaAnalisis } from '../../export/metodologias';
import { Campo, EntradaNumero, EntradaTexto, Insignia, Pestanas, TablaEditable } from '../componentes';
import { fc, fechaCortaDM, opcionesPartidas, pct, useControl } from '../control';
import type { Contexto } from '../estado';
import { Indicador } from '../graficos';

type Pest = 'tablero' | 'materiales' | 'lista';

const TEXTO_ALERTA = { quiebre: 'Quiebre', pedir: 'Pedir ya', proxima: 'Próxima', ok: '' };
const ESTADO_ALERTA = { quiebre: 'error', pedir: 'advertencia', proxima: 'neutra', ok: 'ok' } as const;

export function ModLogistica({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [pest, setPest] = useState<Pest>('tablero');
  const [fecha, setFecha] = useState(() => fechaAnalisis(c, hoyIso()));
  const [restr, setRestr] = useState(true);
  const s = resumenKanban(c, fecha);
  const generar = () => {
    let n = 0;
    mut((d) => { n = generarTarjetas(r, d, restr, fecha); });
    ctx.avisar(n ? `${n} tarjetas agregadas desde la relación de insumos y el cronograma` : 'No hay tarjetas nuevas: todas ya están en el tablero');
  };
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Kanban de materiales</h1>
          <p className="proposito">Cada tarjeta es un material que una actividad necesita, con la fecha en que debe estar en obra y la fecha en que hay que pedirlo según su anticipación de compra. Mientras no llegue, su restricción bloquea la actividad en el lookahead de Last Planner.</p>
        </div>
        <div className="herramientas">
          <label className="pequeno" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={restr} onChange={(e) => setRestr(e.target.checked)} /> Crear restricciones en Last Planner
          </label>
          <button className="boton primario" onClick={generar} disabled={!r.programa.actividades.length}>Generar tarjetas</button>
        </div>
      </div>
      <div className="fila-flex" style={{ gap: 12, alignItems: 'flex-end', marginBottom: 10 }}>
        <Campo etiqueta="Fecha de análisis" ayuda="Por defecto, el último corte de avance">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value || hoyIso())} />
        </Campo>
      </div>
      <div className="indicadores">
        <Indicador titulo="Tarjetas" valor={s.total} detalle={`${pct(s.recibidasPct, 0)} recibidas`} />
        <Indicador titulo="Quiebres de stock" valor={s.quiebres} detalle="se necesitan y no llegaron" estado={s.quiebres ? 'error' : 'ok'} />
        <Indicador titulo="Pedidos vencidos" valor={s.porPedirVencidas} detalle="pasó la fecha de pedido" estado={s.porPedirVencidas ? 'advertencia' : 'ok'} />
        <Indicador titulo="Necesarias en 7 días" valor={s.proximas} detalle="aún no recibidas" estado={s.proximas ? 'advertencia' : 'neutra'} />
      </div>
      <Pestanas
        valor={pest}
        alCambiar={setPest}
        opciones={[
          { id: 'tablero', texto: 'Tablero', extra: s.quiebres ? <Insignia estado="error">{s.quiebres}</Insignia> : undefined },
          { id: 'materiales', texto: 'Stock y punto de pedido' },
          { id: 'lista', texto: 'Lista de tarjetas' },
        ]}
      />
      {!c.kanban.tarjetas.length ? (
        <div className="vacio">
          <p><strong>El tablero está vacío.</strong></p>
          <p>Genere las tarjetas desde la relación de insumos y el cronograma: una por material y actividad.</p>
          <button className="boton primario" onClick={generar} disabled={!r.programa.actividades.length}>Generar tarjetas</button>
        </div>
      ) : (
        <>
          {pest === 'tablero' && <Tablero ctx={ctx} fecha={fecha} />}
          {pest === 'materiales' && <Materiales ctx={ctx} fecha={fecha} />}
          {pest === 'lista' && <Lista ctx={ctx} fecha={fecha} />}
        </>
      )}
    </div>
  );
}

function Tablero({ ctx, fecha }: { ctx: Contexto; fecha: string }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [filtro, setFiltro] = useState('');
  const [arrastrando, setArr] = useState<string | null>(null);
  const [sobre, setSobre] = useState<EstadoKanban | null>(null);
  const cod = (id: string) => r.hojas.find((h) => h.partida.id === id)?.partida.codigo ?? '';
  const q = filtro.trim().toLowerCase();
  const visibles = c.kanban.tarjetas.filter((t) => !q || `${t.descripcion} ${t.insumo} ${cod(t.partidaId)} ${t.proveedor}`.toLowerCase().includes(q));
  const mover = (id: string, e: EstadoKanban) => mut((d) => moverTarjeta(d, id, e, fecha));
  const idx = (e: EstadoKanban) => ESTADOS_KANBAN.findIndex((x) => x.id === e);
  return (
    <>
      <div className="fila-flex" style={{ marginBottom: 8 }}>
        <EntradaTexto valor={filtro} alCambiar={setFiltro} placeholder="Filtrar por material, partida o proveedor…" ariaLabel="Filtrar tarjetas" />
        <span className="pequeno">Arrastre las tarjetas entre columnas o use las flechas.</span>
      </div>
      <div className="kanban">
        {ESTADOS_KANBAN.map((col) => {
          const ts = visibles.filter((t) => t.estado === col.id).sort((a, b) => a.fechaNecesaria.localeCompare(b.fechaNecesaria));
          return (
            <div
              key={col.id}
              className={`kanban-col${sobre === col.id ? ' sobre' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setSobre(col.id); }}
              onDragLeave={() => setSobre((s) => (s === col.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain') || arrastrando;
                if (id) mover(id, col.id);
                setSobre(null);
                setArr(null);
              }}
              data-estado={col.id}
            >
              <h3><span>{col.texto}</span><span className="pequeno">{ts.length}</span></h3>
              {ts.map((t) => {
                const al = alertaTarjeta(t, fecha);
                const i = idx(t.estado);
                return (
                  <div
                    key={t.id}
                    className={`kanban-tarjeta ${al}`}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); setArr(t.id); }}
                    data-tarjeta={t.id}
                  >
                    <strong>{t.descripcion}</strong>
                    <div className="meta">{fmt(t.cantidad, 2)} {t.unidad} · {cod(t.partidaId)}{t.restriccionId ? ' · 🔗 LPS' : ''}</div>
                    <div className="meta">Pedir {fechaCortaDM(t.fechaPedido)} · en obra {fechaCortaDM(t.fechaNecesaria)}</div>
                    {(t.proveedor || t.ordenCompra) && <div className="meta">{[t.proveedor, t.ordenCompra && `O/C ${t.ordenCompra}`].filter(Boolean).join(' · ')}</div>}
                    <div className="acciones">
                      <button className="boton-icono" title="Estado anterior" aria-label="Estado anterior" disabled={i === 0} onClick={() => mover(t.id, ESTADOS_KANBAN[i - 1].id)}>◀</button>
                      {al !== 'ok' ? <Insignia estado={ESTADO_ALERTA[al]}>{TEXTO_ALERTA[al]}</Insignia> : <span />}
                      <button className="boton-icono" title="Estado siguiente" aria-label="Estado siguiente" disabled={i === ESTADOS_KANBAN.length - 1} onClick={() => mover(t.id, ESTADOS_KANBAN[i + 1].id)}>▶</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Materiales({ ctx, fecha }: { ctx: Contexto; fecha: string }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const filas = useMemo(() => analisisMateriales(r, c, fecha), [r, c, fecha]);
  const setPar = (codigo: string, k: keyof ParametroMaterial, v: unknown) =>
    mut((d) => {
      const p = d.kanban.materiales[codigo] ?? { stockMinimo: null, puntoPedido: null };
      p[k] = v === null || v === undefined || (v as unknown) === '' ? null : num(v);
      d.kanban.materiales[codigo] = p;
    });
  const al = { quiebre: ['error', 'Quiebre'], reponer: ['advertencia', 'Reponer'], pedir: ['advertencia', 'Pedir ya'], ok: ['ok', 'Normal'] } as const;
  return (
    <>
      <div className="fila-flex" style={{ gap: 12, alignItems: 'flex-end', marginBottom: 8 }}>
        <Campo etiqueta="Días de seguridad" ayuda="Stock mínimo por defecto = consumo diario × días de seguridad">
          <EntradaNumero valor={c.kanban.diasSeguridad} decimales={0} permitirVacio={false} alCambiar={(v) => mut((d) => { d.kanban.diasSeguridad = Math.max(0, num(v)); })} />
        </Campo>
        <span className="pequeno">Punto de pedido por defecto = consumo diario × anticipación de compra + stock mínimo. Escriba un valor para reemplazarlo.</span>
      </div>
      <TablaEditable
        etiqueta="Stock por material"
        filas={filas}
        clave={(m) => m.codigo}
        alto="calc(100vh - 380px)"
        columnas={[
          { clave: 'c', titulo: 'Código', ancho: 70, valor: (m) => m.codigo },
          { clave: 'd', titulo: 'Material', valor: (m) => m.descripcion },
          { clave: 'u', titulo: 'Und.', ancho: 50, valor: (m) => m.unidad },
          { clave: 'a', titulo: 'Anticip. (d)', ancho: 86, num: true, valor: (m) => m.anticipacion },
          { clave: 'cd', titulo: 'Consumo diario', ancho: 106, num: true, valor: (m) => fmt(m.consumoDiario, 2) },
          { clave: 'sm', titulo: 'Stock mínimo', ancho: 104, tipo: 'numero', decimales: 2, valor: (m) => c.kanban.materiales[m.codigo]?.stockMinimo ?? m.stockMinimo, cambiar: (m, v) => setPar(m.codigo, 'stockMinimo', v) },
          { clave: 'pp', titulo: 'Punto de pedido', ancho: 110, tipo: 'numero', decimales: 2, valor: (m) => c.kanban.materiales[m.codigo]?.puntoPedido ?? m.puntoPedido, cambiar: (m, v) => setPar(m.codigo, 'puntoPedido', v) },
          { clave: 'al', titulo: 'En almacén', ancho: 96, num: true, valor: (m) => fmt(m.enAlmacen, 2) },
          { clave: 'ec', titulo: 'En camino', ancho: 90, num: true, valor: (m) => fmt(m.enCamino, 2) },
          { clave: 'de', titulo: 'Demanda en el plazo de compra', ancho: 130, num: true, valor: (m) => fmt(m.demandaAnticipacion, 2) },
          { clave: 'e', titulo: 'Alerta', ancho: 96, valor: (m) => m.alerta, formato: (m) => <Insignia estado={al[m.alerta][0]}>{al[m.alerta][1]}</Insignia> },
        ]}
      />
    </>
  );
}

function Lista({ ctx, fecha }: { ctx: Contexto; fecha: string }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const set = (t: TarjetaKanban, campo: keyof TarjetaKanban, v: unknown) =>
    mut((d) => {
      const y = d.kanban.tarjetas.find((z) => z.id === t.id);
      if (!y) return;
      if (campo === 'estado') moverTarjeta(d, t.id, v as EstadoKanban, fecha);
      else (y as unknown as Record<string, unknown>)[campo] = campo === 'cantidad' ? num(v) : v;
    });
  const materiales = r.insumos.items.filter((i) => i.insumo.tipo === 'MAT');
  return (
    <TablaEditable
      etiqueta="Tarjetas kanban"
      filas={c.kanban.tarjetas}
      clave={(t) => t.id}
      alto="calc(100vh - 360px)"
      alEliminar={(t) => mut((d) => eliminarTarjeta(d, t.id))}
      pie={
        <button
          className="boton chico"
          onClick={() =>
            mut((d) => {
              const m = materiales[0]?.insumo;
              d.kanban.tarjetas.push({ id: uid('kbn'), insumo: m?.codigo ?? '', descripcion: m?.descripcion ?? 'Material', unidad: m?.unidad ?? 'und', cantidad: 1, partidaId: '', fechaNecesaria: fecha, fechaPedido: fecha, estado: 'por_pedir', proveedor: '', ordenCompra: '', nota: '', restriccionId: '', historial: [] });
            })
          }
        >
          Agregar tarjeta
        </button>
      }
      columnas={[
        { clave: 'm', titulo: 'Material', ancho: 230, tipo: 'select', opciones: materiales.map((i) => ({ valor: i.insumo.codigo, texto: i.insumo.descripcion })), valor: (t) => t.insumo, cambiar: (t, v) => mut((d) => { const y = d.kanban.tarjetas.find((z) => z.id === t.id); const m = materiales.find((i) => i.insumo.codigo === v)?.insumo; if (y && m) { y.insumo = m.codigo; y.descripcion = m.descripcion; y.unidad = m.unidad; } }) },
        { clave: 'q', titulo: 'Cantidad', ancho: 90, tipo: 'numero', decimales: 2, valor: (t) => t.cantidad, cambiar: (t, v) => set(t, 'cantidad', v) },
        { clave: 'u', titulo: 'Und.', ancho: 50, valor: (t) => t.unidad },
        { clave: 'p', titulo: 'Actividad', ancho: 240, tipo: 'select', opciones: opcionesPartidas(r), valor: (t) => t.partidaId, cambiar: (t, v) => set(t, 'partidaId', v) },
        { clave: 'fp', titulo: 'Pedir el', ancho: 130, tipo: 'fecha', valor: (t) => t.fechaPedido, cambiar: (t, v) => set(t, 'fechaPedido', v) },
        { clave: 'fn', titulo: 'En obra el', ancho: 130, tipo: 'fecha', valor: (t) => t.fechaNecesaria, cambiar: (t, v) => set(t, 'fechaNecesaria', v) },
        { clave: 'e', titulo: 'Estado', ancho: 150, tipo: 'select', opciones: ESTADOS_KANBAN.map((e) => ({ valor: e.id, texto: e.texto })), valor: (t) => t.estado, cambiar: (t, v) => set(t, 'estado', v) },
        { clave: 'pr', titulo: 'Proveedor', ancho: 140, tipo: 'texto', valor: (t) => t.proveedor, cambiar: (t, v) => set(t, 'proveedor', v) },
        { clave: 'oc', titulo: 'O/C', ancho: 90, tipo: 'texto', valor: (t) => t.ordenCompra, cambiar: (t, v) => set(t, 'ordenCompra', v) },
        {
          clave: 'r', titulo: 'Last Planner', ancho: 120, valor: (t) => t.restriccionId,
          formato: (t) => t.restriccionId
            ? <Insignia estado={recibido(t.estado) ? 'ok' : 'advertencia'}>{recibido(t.estado) ? 'Liberada' : 'Bloquea'}</Insignia>
            : <button className="boton chico" disabled={!t.partidaId} onClick={() => mut((d) => { const y = d.kanban.tarjetas.find((z) => z.id === t.id); if (y) enlazarRestriccion(d, y, fecha); })}>Enlazar</button>,
        },
        { clave: 'a', titulo: 'Alerta', ancho: 90, valor: (t) => alertaTarjeta(t, fecha), formato: (t) => { const a = alertaTarjeta(t, fecha); return a === 'ok' ? '' : <Insignia estado={ESTADO_ALERTA[a]}>{TEXTO_ALERTA[a]}</Insignia>; } },
        { clave: 'h', titulo: 'Historial', ancho: 160, valor: (t) => t.historial.map((h) => `${ESTADOS_KANBAN.find((e) => e.id === h.estado)?.texto} ${fc(h.fecha)}`).join(' · ') },
      ]}
    />
  );
}

