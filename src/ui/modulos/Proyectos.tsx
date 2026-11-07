// Panel de proyectos: crear, abrir, duplicar, archivar, restaurar, eliminar, exportar y respaldar.
import { useEffect, useMemo, useState } from 'react';
import { fechaCorta, fmt } from '../../engine/util';
import { MIME } from '../../export/paquete';
import {
  archivarProyecto, duplicarProyecto, eliminarProyecto, leerProyecto, listarProyectos, modoAlmacen, respaldoCompleto, restaurarRespaldo, type RegistroProyecto,
} from '../almacen';
import { Insignia, Modal, Pestanas } from '../componentes';
import { escritorio } from '../escritorio';
import { descargar, elegirArchivo, type Contexto } from '../estado';
import { Icono } from '../iconos';

type Filtro = 'activos' | 'archivados' | 'todos';

export function ModProyectos({ ctx }: { ctx: Contexto }) {
  const [lista, setLista] = useState<RegistroProyecto[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('activos');
  const [q, setQ] = useState('');
  const [borrar, setBorrar] = useState<RegistroProyecto | null>(null);
  const [modo, setModo] = useState<'indexeddb' | 'localstorage' | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    void listarProyectos().then((l) => vivo && setLista(l));
    void modoAlmacen().then((m) => vivo && setModo(m));
    return () => { vivo = false; };
  }, [ctx.version, recarga, ctx.id]);

  const refrescar = () => setRecarga((x) => x + 1);
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lista ?? [])
      .filter((x) => (filtro === 'todos' ? true : filtro === 'archivados' ? x.archivado : !x.archivado))
      .filter((x) => !t || `${x.resumen.nombre} ${x.resumen.codigo} ${x.resumen.cliente} ${x.resumen.proyectista}`.toLowerCase().includes(t));
  }, [lista, filtro, q]);
  const nArch = (lista ?? []).filter((x) => x.archivado).length;

  const exportarUno = async (id: string) => {
    const r = await leerProyecto(id);
    if (!r) return;
    descargar(`${(r.proyecto.meta.codigo || 'proyecto').replace(/[^\w.-]+/g, '_')}.expediente.json`, JSON.stringify(r.proyecto, null, 2), MIME.json);
  };
  const respaldo = async () => {
    const r = await respaldoCompleto();
    descargar(`Respaldo_Expediente_Pro_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(r), MIME.json);
    ctx.avisar(`Respaldo descargado con ${r.proyectos.length} proyecto(s).`);
  };
  const restaurar = async () => {
    const f = await elegirArchivo('.json');
    if (!f) return;
    try {
      const n = await restaurarRespaldo(JSON.parse(await f.text()));
      ctx.avisar(`Se restauraron ${n} proyecto(s).`);
      refrescar();
    } catch (e) {
      ctx.avisar((e as Error).message, true);
    }
  };

  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Proyectos</h1>
          <p className="proposito">Cada proyecto guarda por separado su configuración, costos, metrados, presupuestos, cronogramas y documentos. Se guardan solos en este navegador; use el respaldo para llevarlos a otra computadora.</p>
        </div>
        <div className="herramientas">
          <button className="boton primario" onClick={() => ctx.nuevoProyecto('blanco')}><Icono n="nuevo" t={16} /> Nuevo en blanco</button>
          <button className="boton" onClick={() => ctx.nuevoProyecto('ejemplo')}>Desde el ejemplo</button>
          <button className="boton" onClick={() => ctx.nuevoProyecto('importar')}><Icono n="importar" t={16} /> Importar expediente</button>
        </div>
      </div>

      <div className="fila-flex" style={{ marginBottom: 12 }}>
        <Pestanas
          valor={filtro}
          alCambiar={setFiltro}
          opciones={[
            { id: 'activos', texto: 'Activos' },
            { id: 'archivados', texto: `Archivados${nArch ? ` (${nArch})` : ''}` },
            { id: 'todos', texto: 'Todos' },
          ]}
        />
        <span className="separador" />
        <input className="entrada" style={{ width: 280 }} placeholder="Buscar por nombre, código o cliente…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar proyecto" />
        <button className="boton chico" onClick={respaldo} title="Descargar todos los proyectos en un archivo">Respaldo</button>
        <button className="boton chico" onClick={restaurar} title="Agregar los proyectos de un archivo de respaldo">Restaurar respaldo</button>
      </div>

      {lista === null ? (
        <div className="vacio">Cargando proyectos…</div>
      ) : visibles.length === 0 ? (
        <div className="vacio"><p>{filtro === 'archivados' ? 'No hay proyectos archivados.' : 'No hay proyectos que coincidan.'}</p></div>
      ) : (
        <div className="tabla-marco">
          <table className="tabla tabla-proyectos" aria-label="Proyectos">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th>Cliente</th>
                <th>Modalidad</th>
                <th className="num">Total</th>
                <th className="num">Plazo</th>
                <th>Estado</th>
                <th>Modificado</th>
                <th style={{ width: 300 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((x) => {
                const actual = x.id === ctx.id;
                return (
                  <tr key={x.id} className={actual ? 'seleccionada' : undefined}>
                    <td>
                      <div style={{ fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.3, padding: '5px 0 1px' }}>{x.resumen.nombre}</div>
                      <div className="pequeno" style={{ paddingBottom: 5 }}>{[x.resumen.codigo, x.resumen.proyectista, `${x.resumen.partidas} partidas`].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td style={{ whiteSpace: 'normal' }}>{x.resumen.cliente || '—'}</td>
                    <td>{x.resumen.modo === 'publico' ? 'Obra pública' : 'Privado'}</td>
                    <td className="num">{x.resumen.moneda} {fmt(x.resumen.total)}</td>
                    <td className="num">{x.resumen.plazoDias} d</td>
                    <td>
                      {actual && <Insignia estado="ok">Abierto</Insignia>}{' '}
                      {x.archivado && <Insignia estado="neutra">Archivado</Insignia>}{' '}
                      {x.resumen.errores > 0 ? <Insignia estado="error">{x.resumen.errores} error(es)</Insignia> : x.resumen.advertencias > 0 ? <Insignia estado="advertencia">{x.resumen.advertencias} adv.</Insignia> : null}
                    </td>
                    <td className="pequeno">{fechaCorta(x.actualizado.slice(0, 10))} {x.actualizado.slice(11, 16)}</td>
                    <td>
                      <div className="fila-flex" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <button className="boton chico" disabled={actual} onClick={() => void ctx.abrirProyectoId(x.id)}>Abrir</button>
                        {escritorio && !actual && <button className="boton chico" title="Abrir en una pestaña nueva" onClick={() => escritorio?.abrirEnPestanaNueva(x.id)}>Pestaña nueva</button>}
                        <button className="boton chico" title="Duplicar" onClick={async () => { const d = await duplicarProyecto(x.id); if (d) { ctx.avisar(`Copia creada: ${d.resumen.nombre}`); refrescar(); } }}><Icono n="duplicar" t={14} /></button>
                        <button className="boton chico" title={x.archivado ? 'Restaurar' : 'Archivar'} onClick={async () => { await archivarProyecto(x.id, !x.archivado); ctx.avisar(x.archivado ? 'Proyecto restaurado.' : 'Proyecto archivado.'); refrescar(); }}><Icono n={x.archivado ? 'restaurar' : 'archivar'} t={14} /></button>
                        <button className="boton chico" title="Exportar .json" onClick={() => void exportarUno(x.id)}><Icono n="exportar" t={14} /></button>
                        <button className="boton chico peligro" title="Eliminar" onClick={() => setBorrar(x)}><Icono n="eliminar" t={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="pequeno" style={{ marginTop: 10 }}>
        {lista?.length ?? 0} proyecto(s) · Almacenamiento: {modo === 'indexeddb' ? 'base de datos del navegador (IndexedDB)' : modo === 'localstorage' ? 'almacenamiento local limitado (localStorage); descargue respaldos con frecuencia' : '…'}. {escritorio ? 'Los proyectos de la app de escritorio son independientes de los del navegador: para pasarlos de uno a otro use Respaldo y Restaurar respaldo.' : 'Borrar los datos del navegador borra los proyectos: guarde respaldos.'}
      </p>

      {borrar && (
        <Modal
          titulo="Eliminar proyecto"
          alCerrar={() => setBorrar(null)}
          pie={
            <>
              <button className="boton" onClick={() => setBorrar(null)}>Cancelar</button>
              <button
                className="boton primario peligro-fondo"
                onClick={async () => {
                  const id = borrar.id;
                  await eliminarProyecto(id);
                  setBorrar(null);
                  ctx.avisar(`Proyecto eliminado: ${borrar.resumen.nombre}`);
                  escritorio?.proyectoEliminado(id);
                  if (id === ctx.id) await ctx.trasEliminar(id);
                  refrescar();
                }}
              >
                Eliminar definitivamente
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>Se eliminará <strong>{borrar.resumen.nombre}</strong> con todos sus datos. Esta acción no se puede deshacer.</p>
          <p className="pequeno">Si quiere conservarlo fuera de la lista, use Archivar o descargue antes su archivo .json.</p>
        </Modal>
      )}
    </div>
  );
}
