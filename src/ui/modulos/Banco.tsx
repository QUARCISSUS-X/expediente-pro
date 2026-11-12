// Banco de datos (fuera de los proyectos): insumos, precios con fecha y fuente, análisis, cuadrillas, plantillas y proveedores;
// importar con revisión de fusión, exportar (.epdb, Excel, CSV), puntos de restauración e historial de precios.
import { produce } from 'immer';
import JSZip from 'jszip';
import { useEffect, useMemo, useState } from 'react';
import {
  type Banco, bancoDesdeProyecto, bancoInicial, FUENTES_PRECIO, type FuentePrecio, historialPrecio, normalizarBanco, type PlantillaBanco, precioVigente, resumenBanco,
  type Tabla, TABLAS,
} from '../../engine/banco';
import type { GGItem, PlantillaEett, TipoInsumo } from '../../engine/types';
import { fmt, isoAFecha } from '../../engine/util';
import { escribirEpdb, exportarBancoCsv, exportarBancoXlsx, textoRenglones } from '../../io/banco';
import { agregarAnalisis, Fusion, ImportarAlBanco } from '../BancoDialogos';
import { alCambiarBanco, guardarBanco, leerBanco, listarPuntos, type PuntoBanco, restaurarPunto } from '../bancoAlmacen';
import { Campo, Insignia, Modal, Pestanas, TablaEditable } from '../componentes';
import { descargar, type Contexto } from '../estado';
import { COLOR, GraficoLineas } from '../graficos';

const hoy = () => new Date().toISOString().slice(0, 10);
const TIPOS: { valor: TipoInsumo; texto: string }[] = [{ valor: 'MO', texto: 'Mano de obra' }, { valor: 'MAT', texto: 'Material' }, { valor: 'EQ', texto: 'Equipo' }, { valor: 'SC', texto: 'Subcontrato' }];
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Banco del navegador, con escritura (cada edición se guarda; las grandes dejan punto de restauración). */
function useBanco() {
  const [banco, setBanco] = useState<Banco | null>(null);
  useEffect(() => {
    void leerBanco().then(setBanco);
    return alCambiarBanco(setBanco);
  }, []);
  const editar = (f: (b: Banco) => void, nota?: string) => {
    if (!banco) return;
    const n = normalizarBanco(produce(banco, f));
    setBanco(n);
    void guardarBanco(n, nota);
  };
  return { banco, editar };
}

export function ModBanco({ ctx }: { ctx: Contexto }) {
  const { banco, editar } = useBanco();
  const [tabla, setTabla] = useState<Tabla>('insumos');
  const [q, setQ] = useState('');
  const [dialogo, setDialogo] = useState<'importar' | 'enviar' | 'puntos' | null>(null);
  const [insumoSel, setInsumoSel] = useState<string | null>(null);
  if (!banco) return <div className="modulo"><p>Abriendo el banco de datos…</p></div>;
  const conteo = resumenBanco(banco);
  const base = `Banco_Expediente_Pro_${hoy()}`;
  const exportar = async (f: 'epdb' | 'xlsx' | 'csv') => {
    try {
      if (f === 'epdb') descargar(`${base}.epdb`, await escribirEpdb({ banco }), 'application/zip');
      else if (f === 'xlsx') descargar(`${base}.xlsx`, await exportarBancoXlsx(banco), MIME_XLSX);
      else {
        const zip = new JSZip();
        for (const c of exportarBancoCsv(banco)) zip.file(c.nombre, c.texto);
        descargar(`${base}_CSV.zip`, await zip.generateAsync({ type: 'uint8array' }), 'application/zip');
      }
      ctx.avisar('Banco exportado.');
    } catch (e) {
      ctx.avisar(`No se pudo exportar: ${(e as Error).message}`, true);
    }
  };
  const p = ctx.proyecto;
  const enviado = dialogo === 'enviar' ? { banco: bancoDesdeProyecto(p, { lugar: p.meta.departamento || '', fecha: p.meta.fechaBase || hoy(), referencia: p.meta.nombre || 'Proyecto' }), avisos: [], origen: `Proyecto abierto: ${p.meta.nombre}` } : null;

  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Banco de datos</h1>
          <p className="proposito">Insumos, precios con fecha, lugar y fuente, análisis de precios, cuadrillas, plantillas y proveedores, fuera de los proyectos: cualquier proyecto los toma o los devuelve. Se guarda en este equipo; use .epdb para llevarlo a otro equipo o compartirlo.</p>
        </div>
        <div className="herramientas">
          <button className="boton primario" onClick={() => setDialogo('importar')}>Importar…</button>
          <button className="boton" onClick={() => setDialogo('enviar')} title="Los insumos, precios y análisis afinados del proyecto abierto vuelven al banco">Enviar este proyecto al banco</button>
        </div>
      </div>
      <div className="fila-flex" style={{ marginBottom: 12 }}>
        <Pestanas valor={tabla} alCambiar={(t) => { setTabla(t); setQ(''); }} opciones={TABLAS.map((t) => ({ id: t.id, texto: `${t.nombre} (${conteo[t.id]})` }))} />
        <span className="separador" />
        <input className="entrada" style={{ width: 240 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el banco" />
        <button className="boton chico" onClick={() => void exportar('epdb')} title="Respaldo y traslado: un ZIP con un JSON por tabla y suma de comprobación">Exportar .epdb</button>
        <button className="boton chico" onClick={() => void exportar('xlsx')} title="Una hoja por tabla, editable y reimportable">Excel</button>
        <button className="boton chico" onClick={() => void exportar('csv')} title="Un CSV por tabla, para otros programas">CSV</button>
        <button className="boton chico" onClick={() => setDialogo('puntos')}>Puntos de restauración</button>
      </div>

      {tabla === 'insumos' && <Insumos banco={banco} editar={editar} q={q} sel={insumoSel} setSel={setInsumoSel} />}
      {tabla === 'precios' && <Precios banco={banco} editar={editar} q={q} />}
      {tabla === 'analisis' && <Analisis ctx={ctx} banco={banco} editar={editar} q={q} />}
      {tabla === 'cuadrillas' && <Cuadrillas banco={banco} editar={editar} q={q} />}
      {tabla === 'plantillas' && <Plantillas ctx={ctx} banco={banco} editar={editar} q={q} />}
      {tabla === 'proveedores' && <Proveedores banco={banco} editar={editar} q={q} />}

      {dialogo === 'importar' && <ImportarAlBanco ctx={ctx} alCerrar={() => setDialogo(null)} />}
      {enviado && <Fusion ctx={ctx} entrante={enviado} titulo="Enviar el proyecto al banco" alCerrar={() => setDialogo(null)} />}
      {dialogo === 'puntos' && <Puntos ctx={ctx} alCerrar={() => setDialogo(null)} />}
    </div>
  );
}

type Editar = (f: (b: Banco) => void, nota?: string) => void;
const coincide = (q: string, ...t: (string | undefined)[]) => !q || t.join(' ').toLowerCase().includes(q.toLowerCase());

function Insumos({ banco, editar, q, sel, setSel }: { banco: Banco; editar: Editar; q: string; sel: string | null; setSel: (c: string | null) => void }) {
  const filas = banco.insumos.map((i, gi) => ({ i, gi })).filter(({ i }) => coincide(q, i.codigo, i.descripcion, i.grupo));
  const set = (gi: number, f: (x: Banco['insumos'][number]) => void) => editar((b) => { f(b.insumos[gi]); b.insumos[gi].actualizado = new Date().toISOString(); });
  return (
    <div className="dividido">
      <TablaEditable
        etiqueta="Insumos del banco"
        alto="calc(100vh - 300px)"
        filas={filas}
        clave={(x) => x.i.codigo}
        claseFila={(x) => (x.i.codigo === sel ? 'seleccionada' : undefined)}
        alClicFila={(x) => setSel(x.i.codigo)}
        alEliminar={(x) => { if (window.confirm(`¿Quitar ${x.i.codigo} del banco con sus precios?`)) editar((b) => { b.insumos.splice(x.gi, 1); b.precios = b.precios.filter((p) => p.insumo !== x.i.codigo); }, `Antes de quitar el insumo ${x.i.codigo}`); }}
        columnas={[
          { clave: 'c', titulo: 'Código', ancho: 80, valor: (x) => x.i.codigo },
          { clave: 'd', titulo: 'Descripción', tipo: 'texto', valor: (x) => x.i.descripcion, cambiar: (x, v) => set(x.gi, (i) => { i.descripcion = String(v); }) },
          { clave: 'u', titulo: 'Und.', tipo: 'texto', ancho: 60, valor: (x) => x.i.unidad, cambiar: (x, v) => set(x.gi, (i) => { i.unidad = String(v); }) },
          { clave: 't', titulo: 'Tipo', tipo: 'select', ancho: 110, opciones: TIPOS, valor: (x) => x.i.tipo, cambiar: (x, v) => set(x.gi, (i) => { i.tipo = v as TipoInsumo; }) },
          { clave: 'iu', titulo: 'IU', tipo: 'texto', ancho: 50, valor: (x) => x.i.iu, cambiar: (x, v) => set(x.gi, (i) => { i.iu = String(v); }) },
          { clave: 'p', titulo: 'Precio vigente', num: true, ancho: 100, valor: (x) => precioVigente(banco, x.i.codigo, hoy())?.precio ?? null, formato: (x) => { const v = precioVigente(banco, x.i.codigo, hoy()); return v ? fmt(v.precio, 2) : '—'; } },
        ]}
      />
      <div className="pegajoso" style={{ top: 0 }}>{sel ? <Historial banco={banco} codigo={sel} /> : <div className="vacio">Elija un insumo para ver el historial de su precio por lugar y fuente.</div>}</div>
    </div>
  );
}

/** Historial del precio de un insumo: gráfico por lugar y tabla de todas sus cotizaciones. */
function Historial({ banco, codigo }: { banco: Banco; codigo: string }) {
  const i = banco.insumos.find((x) => x.codigo === codigo);
  const h = historialPrecio(banco, codigo);
  const lugares = [...new Set(h.map((p) => p.lugar || 'Sin lugar'))];
  const colores = [COLOR.real, COLOR.plan, COLOR.ocre, COLOR.costo, COLOR.gris];
  const dia = (iso: string) => Math.round(isoAFecha(iso).getTime() / 86_400_000);
  const series = lugares.map((l, k) => ({ nombre: l, color: colores[k % colores.length], marcadores: true, puntos: h.filter((p) => (p.lugar || 'Sin lugar') === l).map((p) => ({ x: dia(p.fecha), y: p.precio })).sort((a, b) => a.x - b.x) }));
  return (
    <div className="panel" style={{ padding: 14 }}>
      <h3 style={{ marginTop: 0 }}>{codigo} · {i?.descripcion} <span className="pequeno">({i?.unidad})</span></h3>
      {h.length > 1 ? (
        <GraficoLineas titulo="Precio en el tiempo" series={series} etiquetaX={(x) => new Date(x * 86_400_000).toISOString().slice(0, 10)} formatoY={(v) => fmt(v, 2)} yMin={Math.min(...h.map((p) => p.precio)) * 0.9} alto={200} />
      ) : <p className="pequeno">Con dos precios o más se dibuja el gráfico.</p>}
      <div className="tabla-marco" style={{ maxHeight: 260, marginTop: 8 }}>
        <table className="tabla" aria-label="Historial de precios">
          <thead><tr><th>Fecha</th><th>Lugar</th><th>Fuente</th><th className="num">Precio</th></tr></thead>
          <tbody>{h.map((p) => <tr key={`${p.fecha}${p.lugar}${p.fuente}`}><td>{p.fecha}</td><td>{p.lugar}</td><td className="pequeno">{FUENTES_PRECIO.find((f) => f.valor === p.fuente)?.texto}{p.referencia ? `: ${p.referencia}` : ''}</td><td className="num">{p.moneda} {fmt(p.precio, 2)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function Precios({ banco, editar, q }: { banco: Banco; editar: Editar; q: string }) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [lugar, setLugar] = useState('');
  const [fuente, setFuente] = useState<FuentePrecio | ''>('');
  const lugares = useMemo(() => [...new Set(banco.precios.map((p) => p.lugar).filter(Boolean))].sort(), [banco.precios]);
  const nombre = useMemo(() => new Map(banco.insumos.map((i) => [i.codigo, i.descripcion])), [banco.insumos]);
  const filas = banco.precios.map((p, gi) => ({ p, gi })).filter(({ p }) => (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta) && (!lugar || p.lugar === lugar) && (!fuente || p.fuente === fuente) && coincide(q, p.insumo, nombre.get(p.insumo), p.referencia, p.lugar))
    .sort((a, b) => b.p.fecha.localeCompare(a.p.fecha) || a.p.insumo.localeCompare(b.p.insumo));
  const set = (gi: number, f: (x: Banco['precios'][number]) => void) => editar((b) => f(b.precios[gi]));
  return (
    <>
      <div className="rejilla" style={{ marginBottom: 10 }}>
        <Campo etiqueta="Desde"><input className="entrada" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Campo>
        <Campo etiqueta="Hasta"><input className="entrada" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Campo>
        <Campo etiqueta="Lugar"><select className="entrada" value={lugar} onChange={(e) => setLugar(e.target.value)}><option value="">Todos</option>{lugares.map((l) => <option key={l}>{l}</option>)}</select></Campo>
        <Campo etiqueta="Fuente"><select className="entrada" value={fuente} onChange={(e) => setFuente(e.target.value as FuentePrecio | '')}><option value="">Todas</option>{FUENTES_PRECIO.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}</select></Campo>
      </div>
      <TablaEditable
        etiqueta="Precios del banco"
        alto="calc(100vh - 380px)"
        filas={filas}
        clave={(x) => `${x.p.insumo}|${x.p.fecha}|${x.p.lugar}|${x.p.fuente}`}
        alEliminar={(x) => editar((b) => { b.precios.splice(x.gi, 1); })}
        vacio={<div className="vacio"><p>No hay precios con esos filtros.</p></div>}
        columnas={[
          { clave: 'i', titulo: 'Insumo', ancho: 70, valor: (x) => x.p.insumo },
          { clave: 'n', titulo: 'Descripción', valor: (x) => nombre.get(x.p.insumo) ?? '' },
          { clave: 'pr', titulo: 'Precio', tipo: 'numero', ancho: 90, valor: (x) => x.p.precio, cambiar: (x, v) => set(x.gi, (p) => { p.precio = Number(v) || 0; }) },
          { clave: 'm', titulo: 'Mon.', ancho: 46, valor: (x) => x.p.moneda },
          { clave: 'f', titulo: 'Fecha', tipo: 'fecha', ancho: 130, valor: (x) => x.p.fecha, cambiar: (x, v) => set(x.gi, (p) => { if (v) p.fecha = String(v); }) },
          { clave: 'l', titulo: 'Lugar', tipo: 'texto', ancho: 100, valor: (x) => x.p.lugar, cambiar: (x, v) => set(x.gi, (p) => { p.lugar = String(v); }) },
          { clave: 'fu', titulo: 'Fuente', tipo: 'select', ancho: 130, opciones: FUENTES_PRECIO, valor: (x) => x.p.fuente, cambiar: (x, v) => set(x.gi, (p) => { p.fuente = v as FuentePrecio; }) },
          { clave: 'r', titulo: 'Referencia', tipo: 'texto', valor: (x) => x.p.referencia ?? '', cambiar: (x, v) => set(x.gi, (p) => { p.referencia = String(v); }) },
        ]}
      />
      <p className="pequeno">{filas.length} de {banco.precios.length} precio(s). Para cargar muchos precios a la vez use Importar con una lista de Excel o CSV.</p>
    </>
  );
}

function Analisis({ ctx, banco, editar, q }: { ctx: Contexto; banco: Banco; editar: Editar; q: string }) {
  const filas = banco.analisis.map((a, gi) => ({ a, gi })).filter(({ a }) => coincide(q, a.codigo, a.descripcion, a.especialidad));
  return (
    <TablaEditable
      etiqueta="Análisis del banco"
      alto="calc(100vh - 300px)"
      filas={filas}
      clave={(x) => x.a.codigo}
      alEliminar={(x) => { if (window.confirm(`¿Quitar el análisis «${x.a.descripcion}» del banco?`)) editar((b) => { b.analisis.splice(x.gi, 1); }, `Antes de quitar el análisis ${x.a.codigo}`); }}
      columnas={[
        { clave: 'e', titulo: 'Especialidad', ancho: 150, valor: (x) => x.a.especialidad },
        { clave: 'd', titulo: 'Partida', valor: (x) => x.a.descripcion },
        { clave: 'u', titulo: 'Und.', ancho: 50, valor: (x) => x.a.unidad },
        { clave: 'r', titulo: 'Rend./día', tipo: 'numero', ancho: 90, decimales: 2, valor: (x) => x.a.rendimiento, cambiar: (x, v) => editar((b) => { b.analisis[x.gi].rendimiento = Number(v) || 1; b.analisis[x.gi].actualizado = new Date().toISOString(); }) },
        { clave: 'it', titulo: 'Renglones', valor: (x) => textoRenglones(x.a.items), clase: () => 'pequeno' },
        { clave: 'ag', titulo: '', ancho: 92, valor: () => '', formato: (x) => <button className="boton chico" onClick={(e) => { e.stopPropagation(); agregarAnalisis(ctx, banco, x.a); }}>Al presupuesto</button> },
      ]}
    />
  );
}

function Cuadrillas({ banco, editar, q }: { banco: Banco; editar: Editar; q: string }) {
  const filas = banco.cuadrillas.map((c, gi) => ({ c, gi })).filter(({ c }) => coincide(q, c.nombre, c.descripcion));
  const nombre = new Map(banco.insumos.map((i) => [i.codigo, i.descripcion]));
  return (
    <TablaEditable
      etiqueta="Cuadrillas del banco"
      filas={filas}
      clave={(x) => x.c.nombre}
      alEliminar={(x) => editar((b) => { b.cuadrillas.splice(x.gi, 1); })}
      columnas={[
        { clave: 'n', titulo: 'Nombre', ancho: 260, valor: (x) => x.c.nombre },
        { clave: 'd', titulo: 'Descripción', tipo: 'texto', valor: (x) => x.c.descripcion ?? '', cambiar: (x, v) => editar((b) => { b.cuadrillas[x.gi].descripcion = String(v); }) },
        { clave: 'c', titulo: 'Composición', valor: (x) => x.c.items.map((i) => `${i.cuadrilla} ${nombre.get(i.insumo) ?? i.insumo}`).join(' + ') },
      ]}
    />
  );
}

function Plantillas({ ctx, banco, editar, q }: { ctx: Contexto; banco: Banco; editar: Editar; q: string }) {
  const filas = banco.plantillas.map((p, gi) => ({ p, gi })).filter(({ p }) => coincide(q, p.clave, p.nombre, p.tipo));
  const aplicar = (pl: PlantillaBanco) => {
    if (pl.tipo === 'gg') {
      if (!window.confirm(`¿Reemplazar los gastos generales del proyecto por «${pl.nombre}»?`)) return;
      ctx.actualizar((d) => { d.gg = JSON.parse(JSON.stringify(pl.datos)) as GGItem[]; }, `Gastos generales desde el banco: ${pl.nombre}`);
    } else if (pl.tipo === 'eett') {
      const e = pl.datos as PlantillaEett;
      ctx.actualizar((d) => { const i = d.plantillasEett.findIndex((x) => x.clave === e.clave); if (i >= 0) d.plantillasEett[i] = JSON.parse(JSON.stringify(e)); else d.plantillasEett.push(JSON.parse(JSON.stringify(e))); }, `Plantilla de EETT desde el banco: ${pl.nombre}`);
    } else return ctx.avisar('Este tipo de plantilla se aplica desde su módulo.', true);
    ctx.avisar(`Plantilla aplicada al proyecto: ${pl.nombre}`);
  };
  const guardarGG = () => editar((b) => {
    const nombre = window.prompt('Nombre de la plantilla de gastos generales', `GG de ${ctx.proyecto.meta.nombre}`)?.trim();
    if (!nombre) return;
    const clave = `gg:${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    b.plantillas = b.plantillas.filter((x) => x.clave !== clave);
    b.plantillas.push({ clave, tipo: 'gg', nombre, datos: JSON.parse(JSON.stringify(ctx.proyecto.gg)), actualizado: new Date().toISOString() });
  });
  return (
    <>
      <div className="fila-flex" style={{ marginBottom: 8 }}><button className="boton chico" onClick={guardarGG}>Guardar los gastos generales del proyecto como plantilla</button></div>
      <TablaEditable
        etiqueta="Plantillas del banco"
        filas={filas}
        clave={(x) => x.p.clave}
        alEliminar={(x) => editar((b) => { b.plantillas.splice(x.gi, 1); })}
        columnas={[
          { clave: 't', titulo: 'Tipo', ancho: 110, valor: (x) => ({ eett: 'Especificación', gg: 'Gastos generales', calendario: 'Calendario', documento: 'Documento' })[x.p.tipo] },
          { clave: 'n', titulo: 'Nombre', valor: (x) => x.p.nombre },
          { clave: 'a', titulo: '', ancho: 110, valor: () => '', formato: (x) => <button className="boton chico" onClick={(e) => { e.stopPropagation(); aplicar(x.p); }}>Aplicar al proyecto</button> },
        ]}
      />
    </>
  );
}

function Proveedores({ banco, editar, q }: { banco: Banco; editar: Editar; q: string }) {
  const filas = banco.proveedores.map((p, gi) => ({ p, gi })).filter(({ p }) => coincide(q, p.ruc, p.razonSocial, p.rubros.join(' ')));
  const set = (gi: number, f: (x: Banco['proveedores'][number]) => void) => editar((b) => { f(b.proveedores[gi]); b.proveedores[gi].actualizado = new Date().toISOString(); });
  const agregar = () => {
    const ruc = window.prompt('RUC del proveedor (11 dígitos)')?.trim();
    if (!ruc) return;
    if (banco.proveedores.some((p) => p.ruc === ruc)) return void window.alert('Ese RUC ya está en el banco.');
    editar((b) => { b.proveedores.push({ ruc, razonSocial: 'Nuevo proveedor', rubros: [], cotizaciones: [], actualizado: new Date().toISOString() }); });
  };
  return (
    <>
      <div className="fila-flex" style={{ marginBottom: 8 }}><button className="boton chico" onClick={agregar}>Agregar proveedor</button></div>
      <TablaEditable
        etiqueta="Proveedores del banco"
        filas={filas}
        clave={(x) => x.p.ruc}
        alEliminar={(x) => editar((b) => { b.proveedores.splice(x.gi, 1); })}
        vacio={<div className="vacio"><p>Sin proveedores. Agréguelos aquí o impórtelos con el Excel del banco.</p></div>}
        columnas={[
          { clave: 'r', titulo: 'RUC', ancho: 110, valor: (x) => x.p.ruc },
          { clave: 'n', titulo: 'Razón social', tipo: 'texto', valor: (x) => x.p.razonSocial, cambiar: (x, v) => set(x.gi, (p) => { p.razonSocial = String(v); }) },
          { clave: 'c', titulo: 'Contacto', tipo: 'texto', ancho: 140, valor: (x) => x.p.contacto ?? '', cambiar: (x, v) => set(x.gi, (p) => { p.contacto = String(v); }) },
          { clave: 't', titulo: 'Teléfono', tipo: 'texto', ancho: 110, valor: (x) => x.p.telefono ?? '', cambiar: (x, v) => set(x.gi, (p) => { p.telefono = String(v); }) },
          { clave: 'e', titulo: 'Correo', tipo: 'texto', ancho: 170, valor: (x) => x.p.correo ?? '', cambiar: (x, v) => set(x.gi, (p) => { p.correo = String(v); }) },
          { clave: 'ru', titulo: 'Rubros (separados por ;)', tipo: 'texto', valor: (x) => x.p.rubros.join('; '), cambiar: (x, v) => set(x.gi, (p) => { p.rubros = String(v).split(';').map((s) => s.trim()).filter(Boolean); }) },
          { clave: 'co', titulo: 'Cotizaciones', ancho: 90, num: true, valor: (x) => x.p.cotizaciones.length },
        ]}
      />
    </>
  );
}

function Puntos({ ctx, alCerrar }: { ctx: Contexto; alCerrar: () => void }) {
  const [lista, setLista] = useState<PuntoBanco[] | null>(null);
  useEffect(() => { void listarPuntos().then(setLista); }, []);
  const volver = async (p: PuntoBanco) => {
    if (!window.confirm(`¿Volver el banco al estado del ${new Date(p.fecha).toLocaleString('es-PE')}? El banco actual queda como otro punto de restauración.`)) return;
    await restaurarPunto(p);
    ctx.avisar('Banco restaurado.');
    alCerrar();
  };
  const reiniciar = async () => {
    if (!window.confirm('¿Volver al banco inicial del programa (catálogo y biblioteca)? El banco actual queda como punto de restauración.')) return;
    await guardarBanco(bancoInicial(), 'Antes de volver al banco inicial');
    ctx.avisar('Banco inicial restaurado.');
    alCerrar();
  };
  return (
    <Modal titulo="Puntos de restauración del banco" alCerrar={alCerrar} pie={<button className="boton peligro" onClick={() => void reiniciar()}>Volver al banco inicial</button>}>
      <p className="pequeno" style={{ marginTop: 0 }}>Cada importación, fusión o borrado grande guarda antes el banco como estaba (los últimos 10).</p>
      {lista === null ? <p>Cargando…</p> : lista.length === 0 ? <div className="vacio"><p>Todavía no hay puntos de restauración.</p></div> : (
        <div className="tabla-marco" style={{ maxHeight: 360 }}>
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Antes de</th><th>Contenido</th><th /></tr></thead>
            <tbody>{lista.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.fecha).toLocaleString('es-PE')}</td>
                <td style={{ whiteSpace: 'normal' }}>{p.nota}</td>
                <td className="pequeno">{TABLAS.map((t) => `${p.conteos[t.id]} ${t.nombre.toLowerCase()}`).join(' · ')}</td>
                <td><button className="boton chico" onClick={() => void volver(p)}>Volver aquí</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Insignia estado="neutra">Los proyectos no cambian al restaurar el banco.</Insignia>
    </Modal>
  );
}
