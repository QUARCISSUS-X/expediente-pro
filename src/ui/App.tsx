import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { proyectoEjemplo, proyectoEnBlanco } from '../data/proyectos';
import { calcularTodo } from '../engine/index';
import type { DocKey, Proyecto } from '../engine/types';
import { fechaCorta, fmt } from '../engine/util';
import { importarPlantilla } from '../io/plantilla';
import { leerCompacto } from '../io/compacto';
import { migrarProyecto } from '../io/migrar';
import { accionesPartida, generarArchivo, NOMBRE_EXPORT, type TipoExport } from './acciones';
import { crearProyecto, leerProyecto, listarProyectos, olvidarV1, proyectoV1, ultimoAbierto } from './almacen';
import { Cinta } from './Cinta';
import { escritorio, parametrosInicio, publicarApiPagina } from './escritorio';
import { Marca } from './componentes';
import { Barrera } from './Barrera';
import { Copias } from './Copias';
import { repararIntegridad } from '../engine/integridad';
import { MODULOS, NAV } from './modulos/registro';

async function esPlantillaDeCarga(f: File): Promise<boolean> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await f.arrayBuffer());
    return !!wb.getWorksheet('PARTIDAS') && !!wb.getWorksheet('APU');
  } catch {
    return false;
  }
}
import { Dialogos } from './Dialogos';
import { descargar, elegirArchivos, useProyecto, type Contexto, type Dialogo, type ModuloId } from './estado';
import { importarExpediente, type ResultadoImportacion } from '../io/importarExpediente';
import ExcelJS from 'exceljs';
import { Modal } from './componentes';


type ManejadorArchivo = { name: string; createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> };

/** Carga el último proyecto abierto (o migra el de la versión 1, o crea el ejemplo) antes de mostrar la aplicación. */
export function App() {
  const [inicial, setInicial] = useState<{ id: string; proyecto: Proyecto; modulo?: ModuloId } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      // pestaña de la app de escritorio: proyecto indicado o proyecto nuevo
      const ini = parametrosInicio();
      if (ini.proyecto) {
        const r = await leerProyecto(ini.proyecto);
        if (r) return setInicial({ id: r.id, proyecto: r.proyecto });
      }
      if (ini.nuevo) {
        const p = ini.nuevo === 'ejemplo' ? proyectoEjemplo() : proyectoEnBlanco();
        const reg = await crearProyecto(p, calcularTodo(p));
        if (history.replaceState) history.replaceState(null, '', `?proyecto=${encodeURIComponent(reg.id)}`);
        return setInicial({ id: reg.id, proyecto: p, modulo: ini.nuevo === 'ejemplo' ? 'presupuesto' : 'proyecto' });
      }
      const ult = ultimoAbierto();
      if (ult) {
        const r = await leerProyecto(ult);
        if (r) return setInicial({ id: r.id, proyecto: r.proyecto });
      }
      const v1 = proyectoV1();
      if (v1) {
        const reg = await crearProyecto(v1, calcularTodo(v1));
        olvidarV1();
        return setInicial({ id: reg.id, proyecto: v1 });
      }
      const lista = (await listarProyectos()).filter((x) => !x.archivado);
      if (lista.length) {
        const r = await leerProyecto(lista[0].id);
        if (r) return setInicial({ id: r.id, proyecto: r.proyecto });
      }
      const p = proyectoEjemplo();
      const reg = await crearProyecto(p, calcularTodo(p));
      setInicial({ id: reg.id, proyecto: p });
    })().catch((e) => setError((e as Error).message));
  }, []);
  if (error) return <div className="cargando">No se pudo abrir el almacén de proyectos: {error}</div>;
  if (!inicial) return <div className="cargando">Abriendo proyectos…</div>;
  return <Aplicacion inicial={inicial} />;
}

function Aplicacion({ inicial }: { inicial: { id: string; proyecto: Proyecto; modulo?: ModuloId } }) {
  const st = useProyecto(inicial);
  const { proyecto, resultados: r } = st;
  const [modulo, setModulo] = useState<ModuloId>(inicial.modulo ?? 'presupuesto');
  const [partidaSel, setPartidaSel] = useState<string | null>(null);
  const [toast, setToast] = useState<{ texto: string; error?: boolean } | null>(null);
  const [dialogo, abrirDialogo] = useState<Dialogo>(null);
  const [consultaInsumo, setConsultaInsumo] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const archivo = useRef<ManejadorArchivo | null>(null);

  const avisar = useCallback((texto: string, error?: boolean) => {
    setToast({ texto, error });
    window.setTimeout(() => setToast((t) => (t && t.texto === texto ? null : t)), error ? 6500 : 3200);
  }, []);
  const ir = useCallback((m: ModuloId, partidaId?: string) => {
    setModulo(m);
    if (partidaId) setPartidaSel(partidaId);
    if (!partidaId) document.querySelector('.trabajo')?.scrollTo({ top: 0 });
  }, []);

  // ---------------------------------------------------------- proyectos
  const abrirProyecto = useCallback((id: string, p: Proyecto, aviso?: string) => {
    st.abrir(id, p);
    setPartidaSel(null);
    archivo.current = null;
    if (aviso) avisar(aviso);
  }, [st, avisar]);

  const abrirProyectoId = useCallback(async (id: string) => {
    // en la app de escritorio, un proyecto abierto en otra pestaña no se abre dos veces
    if (escritorio && (await escritorio.enfocarSiAbierto(id))) return;
    const reg = await leerProyecto(id);
    if (!reg) return avisar('No se encontró el proyecto.', true);
    abrirProyecto(reg.id, reg.proyecto, `Proyecto abierto: ${reg.resumen.nombre}`);
    setModulo('proyecto');
  }, [abrirProyecto, avisar]);

  const crearYAbrir = useCallback(async (p: Proyecto, aviso: string, mod: ModuloId = 'proyecto') => {
    const reg = await crearProyecto(p, calcularTodo(p));
    abrirProyecto(reg.id, p, aviso);
    setModulo(mod);
  }, [abrirProyecto]);

  const [importado, setImportado] = useState<ResultadoImportacion | null>(null);
  const importar = useCallback(async () => {
    const fs = await elegirArchivos('.json,.xlsx,.xml,.docx,.mpp,.txt,.exp');
    if (!fs.length) return;
    try {
      const mpp = fs.filter((f) => /\.mpp$/i.test(f.name));
      if (mpp.length) avisar(`${mpp.map((f) => f.name).join(', ')}: guarde el cronograma como XML desde MS Project (Archivo › Guardar como › Formato XML) e impórtelo junto a los demás archivos.`, true);
      const resto = fs.filter((f) => !/\.mpp$/i.test(f.name));
      if (!resto.length) return;
      if (resto.length === 1 && /\.json$/i.test(resto[0].name)) {
        const datos = JSON.parse(await resto[0].text());
        if (datos?.formato === 'expediente-pro-respaldo') return avisar('Es un respaldo de varios proyectos: use “Restaurar respaldo” en el panel de proyectos.', true);
        const rep = repararIntegridad(migrarProyecto(datos));
        const n = rep.reparados.reduce((s, x) => s + x.cantidad, 0);
        return void (await crearYAbrir(rep.proyecto, `Proyecto abierto desde ${resto[0].name}${n ? `. Se repararon ${n} datos sueltos o dañados del archivo.` : ''}`, 'presupuesto'));
      }
      if (resto.length === 1 && /\.(txt|exp)$/i.test(resto[0].name)) {
        const { proyecto: p, avisos, imagenes } = leerCompacto(await resto[0].text());
        if (imagenes.length) avisos.push(`Las imágenes (${imagenes.map((i) => i.archivo).join(', ')}) se cargan desde Configuración general.`);
        return void (await crearYAbrir(p, avisos.length ? `Formato compacto importado con ${avisos.length} aviso(s): ${avisos.slice(0, 2).join(' ')}` : 'Formato compacto importado como proyecto nuevo.', 'presupuesto'));
      }
      if (resto.length === 1 && /\.xlsx$/i.test(resto[0].name) && (await esPlantillaDeCarga(resto[0]))) {
        const { proyecto: p, avisos } = await importarPlantilla(await resto[0].arrayBuffer());
        return void (await crearYAbrir(p, avisos.length ? `Plantilla importada como proyecto nuevo, con ${avisos.length} aviso(s): ${avisos.slice(0, 2).join(' ')}` : 'Plantilla importada como proyecto nuevo.', 'presupuesto'));
      }
      setOcupado('Importando expediente');
      const res = await importarExpediente(await Promise.all(resto.filter((f) => !/\.json$/i.test(f.name)).map(async (f) => ({ nombre: f.name, datos: new Uint8Array(await f.arrayBuffer()) }))));
      await crearYAbrir(res.proyecto, `Expediente importado: ${res.proyecto.meta.nombre}`, 'presupuesto');
      setImportado(res);
    } catch (e) {
      avisar(`No se pudo importar: ${(e as Error).message}`, true);
    } finally {
      setOcupado(null);
    }
  }, [crearYAbrir, avisar]);

  const nuevoProyecto = useCallback((tipo: 'blanco' | 'ejemplo' | 'importar') => {
    if (tipo === 'importar') return void importar();
    if (tipo === 'blanco') void crearYAbrir(proyectoEnBlanco(), 'Proyecto nuevo en blanco. Complete primero la configuración general.');
    else void crearYAbrir(proyectoEjemplo(), 'Proyecto creado desde el ejemplo.', 'presupuesto');
  }, [crearYAbrir, importar]);

  const trasEliminar = useCallback(async (id: string) => {
    const otros = (await listarProyectos()).filter((x) => x.id !== id && !x.archivado);
    if (otros.length) {
      const reg = await leerProyecto(otros[0].id);
      if (reg) return abrirProyecto(reg.id, reg.proyecto, `Se abrió ${reg.resumen.nombre}.`);
    }
    await crearYAbrir(proyectoEnBlanco(), 'No quedan proyectos activos: se creó uno en blanco.', 'proyectos');
  }, [abrirProyecto, crearYAbrir]);

  const guardarArchivo = useCallback(async () => {
    const datos = JSON.stringify(proyecto, null, 2);
    const nombre = `${(proyecto.meta.codigo || 'proyecto').replace(/[^\w.-]+/g, '_')}.expediente.json`;
    const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<ManejadorArchivo> };
    try {
      if (w.showSaveFilePicker) {
        if (!archivo.current) archivo.current = await w.showSaveFilePicker({ suggestedName: nombre, types: [{ description: 'Proyecto de Expediente Pro', accept: { 'application/json': ['.json'] } }] });
        const s = await archivo.current.createWritable();
        await s.write(new Blob([datos], { type: 'application/json' }));
        await s.close();
        avisar(`Copia guardada en ${archivo.current.name}`);
      } else {
        descargar(nombre, datos, 'application/json');
        avisar('Proyecto descargado como archivo .json');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') avisar(`No se pudo guardar: ${(e as Error).message}`, true);
    }
  }, [proyecto, avisar]);

  // ---------------------------------------------------------- reportes
  const exportar = useCallback(async (tipo: TipoExport, secciones?: DocKey[]) => {
    setOcupado(NOMBRE_EXPORT[tipo]);
    try {
      await new Promise((res) => setTimeout(res, 30));
      const a = await generarArchivo(r, proyecto, tipo, (paso) => setOcupado(`${NOMBRE_EXPORT[tipo]}: ${paso}`), secciones);
      descargar(a.nombre, a.datos, a.tipo);
      avisar(`Descargado: ${a.nombre}`);
    } catch (e) {
      avisar(`No se pudo generar ${NOMBRE_EXPORT[tipo]}: ${(e as Error).message}`, true);
    } finally {
      setOcupado(null);
    }
  }, [r, proyecto, avisar]);

  const ctx: Contexto = {
    ...st,
    ir,
    avisar,
    partidaSel,
    setPartidaSel,
    dialogo,
    abrirDialogo,
    consultaInsumo,
    setConsultaInsumo,
    exportar: (t, s) => void exportar(t, s),
    ocupado,
    abrirArchivo: () => void importar(),
    guardarArchivo: () => void guardarArchivo(),
    abrirProyectoId,
    nuevoProyecto,
    trasEliminar,
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // ---------------------------------------------------------- app de escritorio
  const m0 = proyecto.meta;
  useEffect(() => {
    document.title = `${m0.codigo ? `${m0.codigo} · ` : ''}${m0.nombre || 'Proyecto'} — Expediente Pro`;
    escritorio?.proyectoAbierto({ id: st.id, nombre: m0.nombre || 'Proyecto sin nombre', codigo: m0.codigo || '', guardando: st.guardadoLocal === 'pendiente' });
    if (history.replaceState && new URLSearchParams(location.search).has('proyecto')) history.replaceState(null, '', `?proyecto=${encodeURIComponent(st.id)}`);
  }, [st.id, m0.nombre, m0.codigo, st.guardadoLocal]);
  useEffect(() => {
    publicarApiPagina({
      listar: async () => (await listarProyectos()).map((x) => ({ id: x.id, nombre: x.resumen.nombre, codigo: x.resumen.codigo, archivado: x.archivado, actualizado: x.actualizado })),
      guardarYa: () => ctxRef.current.guardarAhora(),
      comando: (c) => {
      const x = ctxRef.current;
      switch (c.tipo) {
        case 'ir': return x.ir(c.modulo);
        case 'guardar': return x.guardarArchivo();
        case 'importar': return x.abrirArchivo();
        case 'nuevo': return x.abrirDialogo('nuevo');
        case 'buscar': return x.abrirDialogo('buscar');
        case 'deshacer': return x.deshacer();
        case 'rehacer': return x.rehacer();
        case 'atajos': return x.abrirDialogo('atajos');
      }
      },
    });
  }, []);

  // ---------------------------------------------------------- atajos de teclado
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const c = ctxRef.current;
      const t = e.target as HTMLElement;
      const enCampo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); c.guardarArchivo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'f') { e.preventDefault(); c.abrirDialogo('buscar'); return; }
      if (enCampo || c.dialogo || modulo !== 'presupuesto') return;
      if (e.key === 'Insert') { e.preventDefault(); accionesPartida.partida(c); return; }
      if (!c.partidaSel) return;
      if (e.key === 'Delete') { e.preventDefault(); accionesPartida.eliminar(c); return; }
      if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); accionesPartida.subir(c); return; }
      if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); accionesPartida.bajar(c); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); accionesPartida.aumentarNivel(c); return; }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); accionesPartida.disminuirNivel(c); return; }
      if (!e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const filas = c.resultados.filas;
        const i = filas.findIndex((x) => x.partida.id === c.partidaSel);
        const j = i + (e.key === 'ArrowUp' ? -1 : 1);
        if (i >= 0 && j >= 0 && j < filas.length) {
          e.preventDefault();
          c.setPartidaSel(filas[j].partida.id);
          document.querySelector(`[data-partida="${filas[j].partida.id}"]`)?.scrollIntoView({ block: 'nearest' });
        }
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [modulo]);

  const estadoReglas = useMemo(() => new Map(r.validacion.map((v) => [v.regla, v.estado])), [r.validacion]);
  const estadoModulo = (reglas: number[]) => {
    const e = reglas.map((n) => estadoReglas.get(n));
    if (e.includes('error')) return 'var(--sello)';
    if (e.includes('advertencia')) return 'var(--ocre)';
    return null;
  };

  const m = proyecto.meta;
  const publico = m.modo === 'publico';
  const cliente = proyecto.entidades.cliente.nombre;
  const Mod = MODULOS[modulo];

  return (
    <div className="app">
      <header className="barra">
        <div className="marca">
          <Marca /> <span>Expediente Pro</span>
        </div>
        <button className="nombre-proyecto" title={`${m.nombre} — abrir el panel de proyectos`} onClick={() => ir('proyectos')}>
          {m.codigo && <span className="codigo-proyecto">{m.codigo}</span>}
          {m.nombre}
        </button>
        <select className="entrada nav-movil" aria-label="Módulo" value={modulo} onChange={(e) => ir(e.target.value as ModuloId)}>
          {NAV.flatMap((g) => g.items).map((i) => (
            <option key={i.id} value={i.id}>{i.texto}</option>
          ))}
        </select>
        <div className="acciones">
          <span className="estado-guardado solo-escritorio" title={escritorio ? 'Los cambios se guardan solos en esta app' : 'Los cambios se guardan solos en este navegador'}>
            {st.guardadoLocal === 'guardado' ? 'Guardado' : st.guardadoLocal === 'pendiente' ? 'Guardando…' : 'Sin guardar'}
          </span>
          <button className="boton chico solo-escritorio" onClick={() => abrirDialogo('atajos')} title="Atajos de teclado" aria-label="Atajos de teclado">⌨</button>
          <button className="boton chico solo-escritorio" onClick={() => abrirDialogo('copias')} title="Versiones guardadas de este proyecto: restaurar o guardar una nueva">Versiones</button>
          <button className="boton chico siempre" onClick={() => void guardarArchivo()} title="Guardar una copia .json (Ctrl+S)">Guardar</button>
          <button className="boton chico primario" onClick={() => ir('exportar')}>Exportar entregables</button>
        </div>
      </header>

      <Cinta ctx={ctx} />

      <nav className="nav" aria-label="Módulos">
        {NAV.map((g) => (
          <div key={g.grupo}>
            <div className="nav-grupo">{g.grupo}</div>
            {g.items.map((i) => {
              const color = i.id === 'validacion' ? (r.resumenValidacion.errores ? 'var(--sello)' : r.resumenValidacion.advertencias ? 'var(--ocre)' : null) : estadoModulo(i.reglas);
              return (
                <button key={i.id} aria-current={modulo === i.id ? 'page' : undefined} onClick={() => ir(i.id)}>
                  <span>{i.texto}</span>
                  {color && <span className="marca-estado" style={{ background: color }} aria-label="Tiene observaciones" />}
                </button>
              );
            })}
          </div>
        ))}
        <div className="pequeno" style={{ padding: '18px 16px 0', lineHeight: 1.5 }}>
          {st.guardadoLocal === 'error' ? 'No se pudo guardar en el navegador; use Guardar para descargar una copia.' : escritorio ? 'Cada cambio se guarda solo en el panel de proyectos de la app.' : 'Cada cambio se guarda solo en el panel de proyectos de este navegador.'}
        </div>
      </nav>

      <main className="trabajo">
        {st.editadoFuera && (
          <div className="aviso advertencia" style={{ margin: '12px 18px 0' }}>
            Este proyecto se modificó en otra pestaña del navegador. Para no pisar esos cambios, trabaje en una sola pestaña.{' '}
            <button className="boton chico" onClick={() => void leerProyecto(st.id).then((reg) => reg && abrirProyecto(reg.id, reg.proyecto, 'Se cargó la última versión guardada.'))}>Cargar la última versión</button>
          </div>
        )}
        <Barrera key={`${st.id}:${modulo}`} alDeshacer={st.deshacer} alDescargar={() => void guardarArchivo()} alIrAValidacion={() => ir('validacion')}>
          <Mod ctx={ctx} />
        </Barrera>
      </main>

      <footer className="rotulo" aria-label="Rótulo del expediente">
        <div>
          <span className="etq">{m.codigo || 'Proyecto'}</span>
          <span className="val pequeno" title={m.nombre}>{cliente || m.nombre}</span>
        </div>
        <div>
          <span className="etq">Costo directo</span>
          <span className="val">{fmt(r.pie.costoDirecto)}</span>
        </div>
        <div>
          <span className="etq">{publico ? 'Valor referencial' : m.incluirIgv === false ? 'Total sin IGV' : 'Total con IGV'}</span>
          <span className="val">{m.moneda} {fmt(r.pie.total)}</span>
        </div>
        <div>
          <span className="etq">Plazo</span>
          <span className="val">{r.programa.plazoDias} días</span>
        </div>
        <div>
          <span className="etq">Precios a</span>
          <span className="val pequeno">{fechaCorta(m.fechaBase)}</span>
        </div>
        <div>
          <span className="etq">
            Consistencia: {r.resumenValidacion.errores ? `${r.resumenValidacion.errores} con errores` : r.resumenValidacion.advertencias ? `${r.resumenValidacion.advertencias} con advertencias` : 'conforme'}
          </span>
          <div className="sello-celdas">
            {r.validacion.map((v) => (
              <button key={v.regla} className={v.estado} title={`${v.regla}. ${v.control}: ${v.detalle}`} aria-label={`Regla ${v.regla}, ${v.control}: ${v.estado}`} onClick={() => ir('validacion')}>
                {v.regla}
              </button>
            ))}
          </div>
        </div>
      </footer>

      <Dialogos ctx={ctx} alNuevo={nuevoProyecto} />
      {dialogo === 'copias' && <Copias ctx={ctx} alCerrar={() => abrirDialogo(null)} />}
      {importado && (
        <Modal
          titulo="Expediente importado"
          alCerrar={() => setImportado(null)}
          pie={
            <>
              <button className="boton" onClick={() => { setImportado(null); ir('validacion'); }}>Ver observaciones ({importado.observaciones.length})</button>
              <button className="boton" onClick={() => { setImportado(null); ir('proyecto'); }}>Completar configuración</button>
              <button className="boton primario" onClick={() => setImportado(null)}>Continuar</button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>Se leyeron estos documentos:</p>
          <ul className="pequeno" style={{ marginTop: 0 }}>{importado.hojas.map((h) => <li key={h}>{h}</li>)}</ul>
          <div className="tabla-marco" style={{ marginBottom: 10 }}>
            <table className="tabla">
              <thead><tr><th>Concepto</th><th className="num">Original</th><th className="num">Recalculado</th></tr></thead>
              <tbody>
                {([['Costo directo', importado.original.costoDirecto, r.pie.costoDirecto], ['Gastos generales', importado.original.gg, r.pie.gg], ['Utilidad', importado.original.utilidad, r.pie.utilidad], ['Subtotal', importado.original.subtotal, r.pie.subtotal], ['Plazo (días)', importado.original.plazoDias, r.programa.plazoDias]] as [string, number | undefined, number][]).map(([n, a, b]) => (
                  <tr key={n}><td>{n}</td><td className="num">{a === undefined ? '—' : fmt(a, n.startsWith('Plazo') ? 0 : 2)}</td><td className="num">{fmt(b, n.startsWith('Plazo') ? 0 : 2)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {importado.avisos.map((a) => <p key={a} className="pequeno" style={{ margin: '2px 0' }}>{a}</p>)}
          <div className="aviso info" style={{ marginTop: 10 }}>Se registraron {importado.observaciones.length} observaciones de formato y consistencia del expediente original. Revíselas en Validación y descargue el informe de revisión en Word. Complete los logos y responsables en Configuración general.</div>
        </Modal>
      )}
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role="status">{toast.texto}</div>}
    </div>
  );
}
