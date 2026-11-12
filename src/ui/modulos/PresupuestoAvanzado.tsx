// Presupuesto avanzado (2.9): subpresupuestos con su pie, subpartidas (análisis reutilizables dentro de otros APU) y piezas
// que usa la pantalla Presupuesto (selector, pies por subpresupuesto, sección de subpartidas del APU y su gestión).
import { useState, type ReactNode } from 'react';
import { type ApuCalc, type Partida, prefijoSubpartida, type Subpartida } from '../../engine/types';
import { fmt, uid } from '../../engine/util';
import { Campo, EntradaNumero, EntradaTexto, IconoQuitar, Modal, Pestanas } from '../componentes';
import type { Contexto } from '../estado';

/** Ids de las filas (títulos y partidas) que pertenecen a un subpresupuesto ('' = sin subpresupuesto). */
export function filasDeSubpresupuesto(ctx: Contexto, id: string): Set<string> {
  const out = new Set<string>();
  const validos = new Set((ctx.proyecto.subpresupuestos ?? []).map((s) => s.id));
  let dentro = false;
  for (const f of ctx.resultados.filas) {
    if (f.nivel === 1) {
      const s = f.partida.subpresupuesto && validos.has(f.partida.subpresupuesto) ? f.partida.subpresupuesto : '';
      dentro = s === id;
    }
    if (dentro) out.add(f.partida.id);
  }
  return out;
}

export function SelectorSubpresupuesto({ ctx, valor, alCambiar }: { ctx: Contexto; valor: string | null; alCambiar: (v: string | null) => void }) {
  const subs = ctx.proyecto.subpresupuestos ?? [];
  if (!subs.length) return null;
  return (
    <select className="entrada" aria-label="Subpresupuesto que se muestra" value={valor ?? '*'} onChange={(e) => alCambiar(e.target.value === '*' ? null : e.target.value)} style={{ width: 210 }}>
      <option value="*">Todos los subpresupuestos</option>
      {subs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      <option value="">Sin subpresupuesto</option>
    </select>
  );
}

/** Selector del subpresupuesto de un título de primer nivel (sus partidas lo heredan). */
export function CampoSubpresupuesto({ ctx, pt }: { ctx: Contexto; pt: Partida }) {
  const subs = ctx.proyecto.subpresupuestos ?? [];
  if (!subs.length || pt.codigo.includes('.')) return null;
  return (
    <Campo etiqueta="Subpresupuesto" ayuda="Todas las partidas de este título quedan en él">
      <select className="entrada" value={pt.subpresupuesto ?? ''} onChange={(e) => ctx.actualizar((d) => { const x = d.partidas.find((y) => y.id === pt.id); if (x) x.subpresupuesto = e.target.value || undefined; }, `Subpresupuesto del título ${pt.codigo}`)}>
        <option value="">Sin subpresupuesto</option>
        {subs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
    </Campo>
  );
}

export function PiesSubpresupuestos({ ctx }: { ctx: Contexto }) {
  const { resultados: r, proyecto: p } = ctx;
  if (!r.subpresupuestos.length) return null;
  return (
    <div className="tabla-marco" style={{ marginTop: 12 }}>
      <table className="tabla" aria-label="Pie por subpresupuesto">
        <thead><tr><th>Subpresupuesto</th><th className="num">Costo directo</th><th className="num">GG</th><th className="num">Utilidad</th><th className="num">Subtotal</th><th className="num">IGV</th><th className="num">Total</th></tr></thead>
        <tbody>
          {r.subpresupuestos.map((s) => (
            <tr key={s.id || 'sin'}><td>{s.nombre}</td><td className="num">{fmt(s.pie.costoDirecto)}</td><td className="num">{fmt(s.pie.gg)}</td><td className="num">{fmt(s.pie.utilidad)}</td><td className="num">{fmt(s.pie.subtotal)}</td><td className="num">{fmt(s.pie.igv)}</td><td className="num">{fmt(s.pie.total)}</td></tr>
          ))}
          <tr className="total"><td>Consolidado ({p.meta.moneda})</td><td className="num">{fmt(r.pie.costoDirecto)}</td><td className="num">{fmt(r.pie.gg)}</td><td className="num">{fmt(r.pie.utilidad)}</td><td className="num">{fmt(r.pie.subtotal)}</td><td className="num">{fmt(r.pie.igv)}</td><td className="num">{fmt(r.pie.total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/** Partida ficticia para editar el análisis de una subpartida con el mismo editor de APU. */
export const partidaDeSubpartida = (s: Subpartida): Partida => ({ id: prefijoSubpartida + s.codigo, codigo: s.codigo, descripcion: s.descripcion, unidad: s.unidad });

/** Subpartidas usadas dentro de un APU: cantidad editable y su costo (desglosado en los grupos de arriba). */
export function SeccionSubpartidas({ ctx, pt, calc }: { ctx: Contexto; pt: Partida; calc: ApuCalc | undefined }) {
  const p = ctx.proyecto;
  const subs = new Map((p.subpartidas ?? []).map((s) => [s.codigo, s]));
  const apu = p.apus[pt.id];
  const usadas = (apu?.items ?? []).map((it, i) => ({ it, i })).filter(({ it }) => subs.has(it.insumo));
  if (!usadas.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ margin: '0 0 4px' }}>Subpartidas</h3>
      <p className="pequeno" style={{ marginTop: 0 }}>Cada subpartida se desglosa en sus recursos (marcados «de SP…» en los grupos de arriba) multiplicados por la cantidad.</p>
      <div className="tabla-marco">
        <table className="tabla" aria-label="Subpartidas del análisis">
          <thead><tr><th style={{ width: 70 }}>Código</th><th>Subpartida</th><th style={{ width: 44 }}>Und</th><th className="num" style={{ width: 90 }}>Cantidad</th><th className="num" style={{ width: 84 }}>Costo</th><th className="acc" /></tr></thead>
          <tbody>
            {usadas.map(({ it, i }) => {
              const s = subs.get(it.insumo)!;
              const costo = (calc?.items ?? []).filter((x) => x.origen === i && x.subpartida === it.insumo).reduce((a, x) => a + x.parcial, 0);
              return (
                <tr key={i}>
                  <td>{s.codigo}</td>
                  <td>{s.descripcion}</td>
                  <td>{s.unidad}</td>
                  <td className="editable num"><EntradaNumero valor={it.cantidad ?? null} decimales={4} ariaLabel={`Cantidad de ${s.codigo}`} alCambiar={(v) => ctx.actualizar((d) => { const x = d.apus[pt.id]?.items[i]; if (x) x.cantidad = v; }, `Análisis de ${pt.codigo}`)} /></td>
                  <td className="num">{fmt(costo)}</td>
                  <td className="acc"><button className="boton-icono" title="Quitar subpartida" aria-label="Quitar subpartida" onClick={() => ctx.actualizar((d) => { d.apus[pt.id]?.items.splice(i, 1); }, `Análisis de ${pt.codigo}`)}><IconoQuitar /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Guarda el análisis de una partida como subpartida nueva (copia). Devuelve su código. */
export function guardarComoSubpartida(ctx: Contexto, pt: Partida): string | null {
  const apu = ctx.proyecto.apus[pt.id];
  if (!apu?.items.length) { ctx.avisar('El análisis está vacío.', true); return null; }
  const usados = new Set((ctx.proyecto.subpartidas ?? []).map((s) => s.codigo));
  let n = usados.size + 1;
  while (usados.has(`SP${String(n).padStart(3, '0')}`)) n++;
  const codigo = `SP${String(n).padStart(3, '0')}`;
  ctx.actualizar((d) => {
    (d.subpartidas ??= []).push({ codigo, descripcion: pt.descripcion, unidad: pt.unidad });
    d.apus[prefijoSubpartida + codigo] = JSON.parse(JSON.stringify(apu));
  }, `Subpartida ${codigo} creada desde ${pt.codigo}`);
  ctx.avisar(`Subpartida ${codigo} creada. Úsela en otros análisis escribiendo su código en «Agregar insumo».`);
  return codigo;
}

/** Ventana para crear y nombrar subpresupuestos y para editar las subpartidas. */
export function GestionPresupuesto({ ctx, alCerrar, editor }: { ctx: Contexto; alCerrar: () => void; editor: (pt: Partida) => ReactNode }) {
  const [pest, setPest] = useState<'subpresupuestos' | 'subpartidas'>('subpresupuestos');
  const [editando, setEditando] = useState<string | null>(null);
  const p = ctx.proyecto;
  const subs = p.subpresupuestos ?? [];
  const sps = p.subpartidas ?? [];
  const usosSp = (codigo: string) => Object.entries(p.apus).filter(([id, a]) => id !== prefijoSubpartida + codigo && a.items.some((it) => it.insumo === codigo)).length;
  const titulos = p.partidas.filter((x) => x.titulo && !x.codigo.includes('.'));
  const sp = editando ? sps.find((s) => s.codigo === editando) : null;
  return (
    <Modal titulo="Subpresupuestos y subpartidas" alCerrar={alCerrar}>
      <Pestanas valor={pest} alCambiar={(v) => { setPest(v); setEditando(null); }} opciones={[{ id: 'subpresupuestos', texto: `Subpresupuestos (${subs.length})` }, { id: 'subpartidas', texto: `Subpartidas (${sps.length})` }]} />
      {pest === 'subpresupuestos' ? (
        <>
          <p className="pequeno">Cada subpresupuesto (estructuras, arquitectura, instalaciones…) agrupa títulos de primer nivel y tiene su propio pie; los gastos generales, la utilidad y el IGV se prorratean por costo directo y la suma da el consolidado. El Excel lleva una hoja por subpresupuesto y el consolidado.</p>
          <div className="tabla-marco">
            <table className="tabla">
              <thead><tr><th>Nombre</th><th>Títulos</th><th className="num">Total</th><th className="acc" /></tr></thead>
              <tbody>
                {subs.map((s, i) => (
                  <tr key={s.id}>
                    <td className="editable"><EntradaTexto valor={s.nombre} ariaLabel="Nombre del subpresupuesto" alCambiar={(v) => ctx.actualizar((d) => { d.subpresupuestos![i].nombre = v || 'Sin nombre'; }, 'Subpresupuestos')} /></td>
                    <td style={{ whiteSpace: 'normal' }} className="pequeno">{titulos.filter((t) => t.subpresupuesto === s.id).map((t) => `${t.codigo} ${t.descripcion}`).join(' · ') || '—'}</td>
                    <td className="num">{fmt(ctx.resultados.subpresupuestos.find((x) => x.id === s.id)?.pie.total ?? 0)}</td>
                    <td className="acc"><button className="boton-icono" aria-label="Quitar subpresupuesto" title="Quitar (sus títulos quedan sin subpresupuesto)" onClick={() => ctx.actualizar((d) => { d.subpresupuestos = d.subpresupuestos!.filter((x) => x.id !== s.id); for (const t of d.partidas) if (t.subpresupuesto === s.id) t.subpresupuesto = undefined; }, `Subpresupuesto quitado: ${s.nombre}`)}><IconoQuitar /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fila-flex" style={{ marginTop: 10 }}>
            <button className="boton" onClick={() => ctx.actualizar((d) => { (d.subpresupuestos ??= []).push({ id: uid('sub'), nombre: `Subpresupuesto ${(d.subpresupuestos?.length ?? 0) + 1}` }); }, 'Subpresupuesto agregado')}>Agregar subpresupuesto</button>
            {subs.length > 0 && <span className="pequeno">Asigne cada título de primer nivel desde su panel en el presupuesto.</span>}
          </div>
          {subs.length > 0 && (
            <div className="rejilla" style={{ marginTop: 12 }}>
              {titulos.map((t) => (
                <Campo key={t.id} etiqueta={`${t.codigo} ${t.descripcion}`}>
                  <select className="entrada" value={t.subpresupuesto ?? ''} onChange={(e) => ctx.actualizar((d) => { const x = d.partidas.find((y) => y.id === t.id); if (x) x.subpresupuesto = e.target.value || undefined; }, `Subpresupuesto del título ${t.codigo}`)}>
                    <option value="">Sin subpresupuesto</option>
                    {subs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </Campo>
              ))}
            </div>
          )}
        </>
      ) : sp ? (
        <>
          <div className="fila-flex" style={{ margin: '10px 0' }}>
            <button className="boton chico" onClick={() => setEditando(null)}>← Subpartidas</button>
            <Campo etiqueta="Descripción"><EntradaTexto valor={sp.descripcion} alCambiar={(v) => ctx.actualizar((d) => { const x = d.subpartidas!.find((y) => y.codigo === sp.codigo); if (x) x.descripcion = v; }, `Subpartida ${sp.codigo}`)} /></Campo>
            <Campo etiqueta="Unidad"><EntradaTexto valor={sp.unidad} alCambiar={(v) => ctx.actualizar((d) => { const x = d.subpartidas!.find((y) => y.codigo === sp.codigo); if (x) x.unidad = v; }, `Subpartida ${sp.codigo}`)} /></Campo>
          </div>
          {editor(partidaDeSubpartida(sp))}
        </>
      ) : (
        <>
          <p className="pequeno">Una subpartida es un análisis reutilizable (mortero, concreto de una resistencia, encofrado tipo…) que se usa dentro de otros análisis con una cantidad. Créela desde el análisis de una partida con «Guardar como subpartida» o aquí en blanco.</p>
          <div className="tabla-marco">
            <table className="tabla">
              <thead><tr><th>Código</th><th>Descripción</th><th>Und</th><th className="num">Costo unitario</th><th>Se usa en</th><th /><th className="acc" /></tr></thead>
              <tbody>
                {sps.map((s) => (
                  <tr key={s.codigo}>
                    <td>{s.codigo}</td><td>{s.descripcion}</td><td>{s.unidad}</td>
                    <td className="num">{fmt(ctx.resultados.subpartidas[s.codigo]?.pu ?? 0)}</td>
                    <td>{usosSp(s.codigo)} análisis</td>
                    <td><button className="boton chico" onClick={() => setEditando(s.codigo)}>Editar análisis</button></td>
                    <td className="acc"><button className="boton-icono" aria-label="Quitar subpartida" disabled={usosSp(s.codigo) > 0} title={usosSp(s.codigo) ? 'Se usa en otros análisis: quítela de ellos primero' : 'Quitar subpartida'} onClick={() => ctx.actualizar((d) => { d.subpartidas = d.subpartidas!.filter((x) => x.codigo !== s.codigo); delete d.apus[prefijoSubpartida + s.codigo]; }, `Subpartida quitada: ${s.codigo}`)}><IconoQuitar /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="boton" style={{ marginTop: 10 }} onClick={() => {
            const usados = new Set(sps.map((s) => s.codigo));
            let n = usados.size + 1;
            while (usados.has(`SP${String(n).padStart(3, '0')}`)) n++;
            const codigo = `SP${String(n).padStart(3, '0')}`;
            ctx.actualizar((d) => { (d.subpartidas ??= []).push({ codigo, descripcion: 'Nueva subpartida', unidad: 'm3' }); d.apus[prefijoSubpartida + codigo] = { rendimiento: 1, items: [] }; }, `Subpartida ${codigo} creada`);
            setEditando(codigo);
          }}>Nueva subpartida</button>
        </>
      )}
    </Modal>
  );
}
