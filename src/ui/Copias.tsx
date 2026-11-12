// Versiones del proyecto abierto: puntos de restauración automáticos (uno por día de trabajo) y manuales, y bitácora de cambios.
import { useEffect, useMemo, useState } from 'react';
import { bitacoraEntre, MAX_BITACORA } from '../engine/bitacora';
import { fmt } from '../engine/util';
import { type CopiaProyecto, crearCopia, eliminarCopia, listarCopias, modoAlmacen, resumir } from './almacen';
import { Insignia, Modal } from './componentes';
import type { Contexto } from './estado';

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Copias({ ctx, alCerrar }: { ctx: Contexto; alCerrar: () => void }) {
  const [lista, setLista] = useState<CopiaProyecto[] | null>(null);
  const [nota, setNota] = useState('');
  const [disponible, setDisponible] = useState(true);
  const cargar = () => listarCopias(ctx.id).then(setLista);
  const bitacora = useMemo(() => bitacoraEntre(ctx.proyecto), [ctx.proyecto]);
  useEffect(() => {
    void modoAlmacen().then((m) => setDisponible(m === 'indexeddb'));
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.id]);

  const guardar = async () => {
    await ctx.guardarAhora();
    await crearCopia({ id: ctx.id, proyecto: ctx.proyecto, resumen: resumir(ctx.proyecto, ctx.resultados) }, nota.trim() || 'Versión guardada a mano');
    setNota('');
    await cargar();
    ctx.avisar('Versión guardada.');
  };
  const restaurar = (c: CopiaProyecto) => {
    if (!window.confirm(`Se reemplazará el contenido actual por la versión del ${fechaHora(c.fecha)}. Puede deshacerlo con Ctrl+Z. ¿Continuar?`)) return;
    ctx.reemplazar(c.proyecto, `Versión restaurada: ${c.nota} (${fechaHora(c.fecha)})`);
    ctx.avisar(`Versión del ${fechaHora(c.fecha)} restaurada (Ctrl+Z para deshacer).`);
    alCerrar();
  };

  return (
    <Modal titulo="Versiones del proyecto" alCerrar={alCerrar}>
      <p className="pequeno" style={{ marginTop: 0 }}>El programa guarda solo una versión con el primer cambio de cada día (conserva las últimas 12). Antes de un cambio grande, guarde una versión con nombre: no se borra sola.</p>
      {!disponible && <div className="aviso advertencia">Este navegador no permite guardar versiones. Use «Guardar» para descargar copias .json.</div>}
      <div className="fila-flex" style={{ marginBottom: 12 }}>
        <input className="entrada" style={{ flex: 1, minWidth: 200 }} placeholder="Nombre de la versión (por ejemplo: antes de ajustar metrados)" value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void guardar(); }} aria-label="Nombre de la versión" />
        <button className="boton primario" disabled={!disponible} onClick={() => void guardar()}>Guardar versión</button>
      </div>
      {lista === null ? <p className="pequeno">Cargando…</p> : lista.length === 0 ? (
        <div className="vacio"><p>Todavía no hay versiones guardadas de este proyecto.</p></div>
      ) : (
        <div className="tabla-marco" style={{ maxHeight: 360 }}>
          <table className="tabla">
            <thead><tr><th style={{ width: 130 }}>Fecha</th><th>Versión</th><th className="num">Total</th><th className="num">Partidas</th><th style={{ width: 170 }} /></tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td>{fechaHora(c.fecha)}</td>
                  <td>{c.nota} {c.automatica && <Insignia estado="neutra">Automática</Insignia>}</td>
                  <td className="num">{c.resumen.moneda} {fmt(c.resumen.total)}</td>
                  <td className="num">{c.resumen.partidas}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="boton chico" onClick={() => restaurar(c)}>Restaurar</button>{' '}
                    <button className="boton chico peligro" onClick={() => { if (window.confirm('¿Eliminar esta versión?')) void eliminarCopia(c.id).then(cargar); }}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3 style={{ margin: '16px 0 6px' }}>Bitácora de cambios</h3>
      <p className="pequeno" style={{ marginTop: 0 }}>Los últimos {MAX_BITACORA} cambios con nombre (metrados, precios, análisis, partidas, versiones restauradas). Viaja con el archivo del proyecto y alimenta los informes.</p>
      {bitacora.length === 0 ? <div className="vacio"><p>Todavía no hay cambios anotados.</p></div> : (
        <div className="tabla-marco" style={{ maxHeight: 260 }}>
          <table className="tabla" aria-label="Bitácora de cambios">
            <thead><tr><th style={{ width: 130 }}>Fecha</th><th>Cambio</th></tr></thead>
            <tbody>
              {bitacora.map((e, i) => (
                <tr key={`${e.fecha}-${i}`}><td>{fechaHora(e.fecha)}</td><td>{e.texto}{e.veces && e.veces > 1 ? <span className="pequeno"> ({e.veces} ediciones)</span> : null}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
