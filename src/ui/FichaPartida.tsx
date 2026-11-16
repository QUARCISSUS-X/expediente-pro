// Ficha de partida: reúne en un panel todo lo de una partida (metrado, análisis, especificación, actividad, avance,
// valorizado, cambios, restricciones, protocolos y materiales). Se abre desde cualquier módulo y desde la búsqueda global.
import { useMemo } from 'react';
import { protocoloLiberado } from '../engine/calidad';
import { calcularEvm, calcularValorizaciones, hoyIso } from '../engine/control';
import { metradosVigentes, todasLasRestricciones } from '../engine/integracion';
import { alertaTarjeta, ESTADOS_KANBAN } from '../engine/kanban';
import { fmt } from '../engine/util';
import { Insignia, Modal } from './componentes';
import type { Contexto } from './estado';

export function FichaPartida({ ctx, id, alCerrar }: { ctx: Contexto; id: string; alCerrar: () => void }) {
  const { resultados: r, proyecto: p } = ctx;
  const c = p.control;
  const hoy = hoyIso();
  const f = r.hojas.find((x) => x.partida.id === id);
  const datos = useMemo(() => {
    if (!c) return null;
    const evm = calcularEvm(r, c);
    const vals = calcularValorizaciones(r, c);
    return {
      avance: evm?.partidas.find((x) => x.base.id === id) ?? null,
      valorizado: vals.reduce((s, v) => s + v.partidas.filter((x) => x.base.id === id).reduce((a, x) => a + x.monto, 0), 0),
      vigente: metradosVigentes(r, c)[id],
      restricciones: todasLasRestricciones(r, c, hoy).filter((x) => x.partidaId === id),
    };
  }, [r, c, id, hoy]);
  if (!f) return <Modal titulo="Ficha de partida" alCerrar={alCerrar}><p>La partida ya no existe.</p></Modal>;
  const pt = f.partida;
  const apu = r.apus[id];
  const act = r.programa.actividades.find((a) => a.partidaId === id);
  const eett = r.eett.find((e) => e.partida.id === id);
  const cambios = (c?.cambios ?? []).filter((x) => x.partidas?.some((y) => y.partidaId === id));
  const puntos = (c?.calidad.puntos ?? []).filter((x) => x.partidaId === id);
  const protocolos = (c?.calidad.protocolos ?? []).filter((x) => x.partidaId === id);
  const tarjetas = (c?.kanban.tarjetas ?? []).filter((x) => x.partidaId === id);
  const m = p.meta.moneda;
  const seccion = (titulo: string, contenido: React.ReactNode, vacio = false) => (
    <div style={{ marginTop: 12 }}>
      <div className="seccion-titulo" style={{ margin: '0 0 4px' }}>{titulo}</div>
      {vacio ? <p className="pequeno" style={{ margin: 0 }}>—</p> : contenido}
    </div>
  );
  const ir = (mod: Parameters<Contexto['ir']>[0]) => { alCerrar(); ctx.ir(mod, mod === 'presupuesto' ? id : undefined); };
  return (
    <Modal titulo={`Ficha de partida ${pt.codigo}`} alCerrar={alCerrar} pie={<><button className="boton" onClick={() => ir('presupuesto')}>Ir al presupuesto</button><button className="boton primario" onClick={alCerrar}>Cerrar</button></>}>
      <h3 style={{ marginTop: 0 }}>{pt.descripcion} <span className="pequeno">({pt.unidad})</span></h3>
      <div className="cifras">
        <div><span>Metrado</span><strong>{fmt(f.metrado)}</strong>{datos && datos.vigente !== f.metrado && <small className="pequeno">vigente {fmt(datos.vigente)}</small>}</div>
        <div><span>Precio unitario</span><strong>{m} {fmt(f.pu)}</strong></div>
        <div><span>Parcial</span><strong>{m} {fmt(f.parcial)}</strong></div>
        <div><span>Incidencia</span><strong>{r.pie.costoDirecto ? fmt((f.parcial / r.pie.costoDirecto) * 100) : '0.00'} %</strong></div>
      </div>
      {seccion('Análisis de precio', apu && (
        <p className="pequeno" style={{ margin: 0 }}>
          Rendimiento {fmt(apu.rendimiento, 2)} {pt.unidad}/día · MO {fmt(apu.subtotales.MO)} · Materiales {fmt(apu.subtotales.MAT)} · Equipos {fmt(apu.subtotales.EQ)} · Subcontratos {fmt(apu.subtotales.SC)}.{' '}
          Principales: {[...apu.items].sort((a, b) => b.parcial - a.parcial).slice(0, 4).map((x) => `${x.insumo.descripcion} (${fmt(x.parcial)})`).join(', ')}.
        </p>
      ), !apu)}
      {seccion('Especificación técnica', eett && <p className="pequeno" style={{ margin: 0 }}>{(eett.secciones.descripcion || '').slice(0, 260)}{(eett.secciones.descripcion || '').length > 260 ? '…' : ''}</p>, !eett)}
      {seccion('Actividad en el cronograma', act && <p className="pequeno" style={{ margin: 0 }}>Del {act.inicio} al {act.fin} · {act.duracion} días laborables · holgura {act.holgura} d {act.critica && <Insignia estado="error">Ruta crítica</Insignia>}</p>, !act)}
      {c && seccion('Avance y valorizado', datos?.avance ? (
        <p className="pequeno" style={{ margin: 0 }}>Ejecutado {fmt(datos.avance.ejecutado)} {pt.unidad} ({fmt(datos.avance.avancePct, 1)} %) · valor ganado {m} {fmt(datos.avance.ev)} · planificado {m} {fmt(datos.avance.pv)} · valorizado {m} {fmt(datos.valorizado)}{datos.avance.excedente > 0 ? ` · mayor metrado ${fmt(datos.avance.excedente)}` : ''}</p>
      ) : <p className="pequeno" style={{ margin: 0 }}>Sin línea base o sin avance registrado.</p>)}
      {c && seccion(`Cambios (${cambios.length})`, <ul className="pequeno" style={{ margin: 0 }}>{cambios.map((x) => <li key={x.id}>{x.numero} {x.tipo} · {x.estado} · {fmt(x.partidas!.filter((y) => y.partidaId === id).reduce((s, y) => s + y.metrado, 0))} {pt.unidad}: {x.descripcion}</li>)}</ul>, !cambios.length)}
      {c && seccion(`Restricciones (${datos?.restricciones.filter((x) => !x.liberada).length ?? 0} abiertas)`, <ul className="pequeno" style={{ margin: 0 }}>{datos?.restricciones.map((x) => <li key={x.id}>{x.liberada ? '✓' : '•'} {x.tipo}: {x.descripcion}{'automatica' in x ? ' (automática)' : ''}{x.fechaRequerida ? ` · para el ${x.fechaRequerida}` : ''}</li>)}</ul>, !datos?.restricciones.length)}
      {c && seccion(`Calidad (${puntos.length} puntos, ${protocolos.filter(protocoloLiberado).length}/${protocolos.length} protocolos liberados)`, <ul className="pequeno" style={{ margin: 0 }}>{puntos.map((x) => <li key={x.id}>{x.tipo} · {x.control}: {protocolos.filter((y) => y.puntoId === x.id).map((y) => `${y.numero} ${protocoloLiberado(y) ? 'liberado' : y.resultado}`).join(', ') || 'sin protocolo'}</li>)}</ul>, !puntos.length)}
      {c && seccion(`Materiales (${tarjetas.length} tarjetas)`, <ul className="pequeno" style={{ margin: 0 }}>{tarjetas.map((x) => <li key={x.id}>{x.descripcion}: {fmt(x.cantidad)} {x.unidad} · {ESTADOS_KANBAN.find((e) => e.id === x.estado)?.texto} · necesario el {x.fechaNecesaria}{alertaTarjeta(x, hoy) === 'quiebre' ? ' · atrasado' : ''}{x.proveedor ? ` · ${x.proveedor}` : ''}</li>)}</ul>, !tarjetas.length)}
    </Modal>
  );
}
