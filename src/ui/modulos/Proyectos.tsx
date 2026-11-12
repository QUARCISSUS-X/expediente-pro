// Panel de proyectos: crear, abrir, duplicar, archivar, restaurar, eliminar, exportar y respaldar.
import { useEffect, useMemo, useState } from 'react';
import { fechaCorta, fmt } from '../../engine/util';
import { MIME } from '../../export/paquete';
import { leerJson } from '../../io/estructura';
import { escribirEpdb, leerEpdb, type ResultadoBanco } from '../../io/banco';
import { Fusion } from '../BancoDialogos';
import { leerBanco } from '../bancoAlmacen';
import { conEsquema } from '../../io/migrar';
import {
  archivarProyecto, DIAS_PAPELERA, diasEnPapelera, duplicarProyecto, eliminarDefinitivo, eliminarProyecto, leerProyecto, listarPapelera, listarProyectos, modoAlmacen,
  respaldoCompleto, restaurarDePapelera, restaurarRespaldo, todasLasCopias, type CopiaProyecto, type RegistroProyecto,
} from '../almacen';
import { Insignia, Modal, Pestanas } from '../componentes';
import { escritorio } from '../escritorio';
import { descargar, elegirArchivo, type Contexto } from '../estado';
import { Icono } from '../iconos';

type Filtro = 'activos' | 'archivados' | 'todos' | 'papelera';

export function ModProyectos({ ctx }: { ctx: Contexto }) {
  const [lista, setLista] = useState<RegistroProyecto[] | null>(null);
  const [papelera, setPapelera] = useState<RegistroProyecto[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('activos');
  const [q, setQ] = useState('');
  const [borrar, setBorrar] = useState<RegistroProyecto | null>(null);
  const [modo, setModo] = useState<'indexeddb' | 'localstorage' | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    void listarProyectos().then((l) => vivo && setLista(l));
    void listarPapelera().then((l) => vivo && setPapelera(l));
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
    descargar(`${(r.proyecto.meta.codigo || 'proyecto').replace(/[^\w.-]+/g, '_')}.expediente.json`, JSON.stringify(conEsquema(r.proyecto), null, 2), MIME.json);
  };
  // respaldo completo: un .epdb con los proyectos, sus versiones y el banco de datos
  const respaldo = async () => {
    const r = await respaldoCompleto();
    const copias = (await todasLasCopias()).filter((c) => r.proyectos.some((x) => x.id === c.proyectoId));
    descargar(`Respaldo_Expediente_Pro_${new Date().toISOString().slice(0, 10)}.epdb`, await escribirEpdb({ banco: await leerBanco(), proyectos: r.proyectos, copias }), 'application/zip');
    ctx.avisar(`Respaldo descargado: ${r.proyectos.length} proyecto(s), ${copias.length} versión(es) y el banco de datos.`);
  };
  const [bancoRespaldo, setBancoRespaldo] = useState<ResultadoBanco | null>(null);
  const restaurar = async () => {
    const f = await elegirArchivo('.epdb,.json');
    if (!f) return;
    try {
      if (/\.epdb$/i.test(f.name)) {
        const c = await leerEpdb(new Uint8Array(await f.arrayBuffer()));
        const n = c.proyectos ? await restaurarRespaldo({ formato: 'expediente-pro-respaldo', version: 1, fecha: c.manifiesto.fecha, proyectos: c.proyectos as RegistroProyecto[] }, (c.copias ?? []) as CopiaProyecto[]) : 0;
        ctx.avisar(`Se restauraron ${n} proyecto(s). Revise ahora qué entra del banco de datos del respaldo.`);
        setBancoRespaldo({ banco: c.banco, avisos: [], origen: `Banco del respaldo ${f.name}` });
      } else {
        const n = await restaurarRespaldo(leerJson(await f.text(), f.name) as never);
        ctx.avisar(`Se restauraron ${n} proyecto(s).`);
      }
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
            { id: 'papelera', texto: `Papelera${papelera.length ? ` (${papelera.length})` : ''}` },
          ]}
        />
        <span className="separador" />
        <input className="entrada" style={{ width: 280 }} placeholder="Buscar por nombre, código o cliente…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar proyecto" />
        <button className="boton chico" onClick={respaldo} title="Descargar un .epdb con todos los proyectos, sus versiones y el banco de datos">Respaldo</button>
        <button className="boton chico" onClick={restaurar} title="Agregar los proyectos de un respaldo (.epdb o .json de versiones anteriores)">Restaurar respaldo</button>
      </div>

      {filtro === 'papelera' ? (
        <Papelera ctx={ctx} lista={papelera} alCambiar={refrescar} />
      ) : lista === null ? (
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

      {bancoRespaldo && <Fusion ctx={ctx} entrante={bancoRespaldo} titulo="Banco de datos del respaldo" alCerrar={() => setBancoRespaldo(null)} />}
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
                  ctx.avisar(`Proyecto enviado a la papelera: ${borrar.resumen.nombre}. Se puede restaurar durante ${DIAS_PAPELERA} días.`);
                  escritorio?.proyectoEliminado(id);
                  if (id === ctx.id) await ctx.trasEliminar(id);
                  refrescar();
                }}
              >
                Enviar a la papelera
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}><strong>{borrar.resumen.nombre}</strong> pasará a la papelera con todos sus datos y versiones. Se puede restaurar durante {DIAS_PAPELERA} días; después se borra solo.</p>
          <p className="pequeno">Si solo quiere quitarlo de la lista, use Archivar.</p>
        </Modal>
      )}
    </div>
  );
}

function Papelera({ ctx, lista, alCambiar }: { ctx: Contexto; lista: RegistroProyecto[]; alCambiar: () => void }) {
  if (!lista.length) return <div className="vacio"><p>La papelera está vacía. Los proyectos eliminados quedan aquí {DIAS_PAPELERA} días antes de borrarse.</p></div>;
  const borrarYa = async (x: RegistroProyecto) => {
    if (!window.confirm(`Se borrará definitivamente «${x.resumen.nombre}» con sus versiones. Esta acción no se puede deshacer. ¿Continuar?`)) return;
    await eliminarDefinitivo(x.id);
    ctx.avisar(`Proyecto borrado: ${x.resumen.nombre}`);
    alCambiar();
  };
  const vaciar = async () => {
    if (!window.confirm(`Se borrarán definitivamente ${lista.length} proyecto(s) de la papelera. Esta acción no se puede deshacer. ¿Continuar?`)) return;
    for (const x of lista) await eliminarDefinitivo(x.id);
    ctx.avisar('Papelera vaciada.');
    alCambiar();
  };
  return (
    <>
      <div className="tabla-marco">
        <table className="tabla" aria-label="Papelera">
          <thead><tr><th>Proyecto</th><th className="num">Total</th><th>Eliminado</th><th>Se borra en</th><th style={{ width: 230 }}>Acciones</th></tr></thead>
          <tbody>
            {lista.map((x) => (
              <tr key={x.id}>
                <td><strong>{x.resumen.nombre}</strong> <span className="pequeno">{x.resumen.codigo}</span></td>
                <td className="num">{x.resumen.moneda} {fmt(x.resumen.total)}</td>
                <td className="pequeno">{fechaCorta(x.eliminado!.slice(0, 10))}</td>
                <td>{Math.max(0, DIAS_PAPELERA - diasEnPapelera(x))} días</td>
                <td>
                  <div className="fila-flex" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <button className="boton chico" onClick={async () => { await restaurarDePapelera(x.id); ctx.avisar(`Proyecto restaurado: ${x.resumen.nombre}`); alCambiar(); }}>Restaurar</button>
                    <button className="boton chico peligro" onClick={() => void borrarYa(x)}>Borrar ya</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fila-flex" style={{ marginTop: 10 }}><button className="boton chico peligro" onClick={() => void vaciar()}>Vaciar papelera</button></div>
    </>
  );
}
