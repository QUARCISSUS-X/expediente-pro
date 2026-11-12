// Ventanas del banco de datos: importar con revisión de fusión, actualizar precios del proyecto, agregar insumos y partidas del banco.
import { produce } from 'immer';
import { useEffect, useMemo, useState } from 'react';
import {
  type AnalisisBanco, aplicarPrecios, type Banco, compararBancos, compararPrecios, type Comparacion, completarInsumos, type Decision, type DiferenciaPrecio,
  FUENTES_PRECIO, type FuentePrecio, fusionarBancos, insumoDesdeBanco, partidaTipoDe, precioVigente, TABLAS,
} from '../engine/banco';
import { calcularTodo } from '../engine/index';
import { fmt } from '../engine/util';
import { leerArchivoBanco, type OpcionesImportacion, type ResultadoBanco } from '../io/banco';
import { agregarPartida } from './arbol';
import { guardarBanco, leerBanco } from './bancoAlmacen';
import { Campo, Insignia, Modal } from './componentes';
import { elegirArchivos, type Contexto } from './estado';

const hoy = () => new Date().toISOString().slice(0, 10);
const NOMBRE_TABLA = Object.fromEntries(TABLAS.map((t) => [t.id, t.nombre])) as Record<string, string>;

/** Texto corto de una fila del banco para la pantalla de fusión. */
function resumenFila(f: unknown): string {
  const x = f as Record<string, unknown>;
  if (x.precio !== undefined) return `${x.moneda ?? ''} ${fmt(Number(x.precio), 2)} · ${x.fecha} · ${x.lugar || 'sin lugar'}${x.referencia ? ` · ${x.referencia}` : ''}`;
  if (x.rendimiento !== undefined) return `${x.descripcion} · ${x.rendimiento} ${x.unidad}/día · ${(x.items as unknown[])?.length ?? 0} renglones`;
  return String(x.descripcion ?? x.razonSocial ?? x.nombre ?? x.codigo ?? '');
}

/**
 * Pantalla de fusión: muestra nuevos, iguales y en conflicto; por cada conflicto se elige conservar, reemplazar o guardar
 * ambos (por defecto gana lo más reciente). Nada se escribe hasta confirmar, y el banco anterior queda como punto de restauración.
 */
export function Fusion({ ctx, entrante, titulo, alCerrar, alTerminar }: { ctx: Contexto; entrante: ResultadoBanco; titulo: string; alCerrar: () => void; alTerminar?: () => void }) {
  const [actual, setActual] = useState<Banco | null>(null);
  const [decisiones, setDecisiones] = useState<Record<string, Decision>>({});
  const [verIguales, setVerIguales] = useState(false);
  useEffect(() => { void leerBanco().then(setActual); }, []);
  const c: Comparacion | null = useMemo(() => (actual ? compararBancos(actual, entrante.banco) : null), [actual, entrante]);
  if (!c || !actual) return <Modal titulo={titulo} alCerrar={alCerrar}><p>Comparando con el banco…</p></Modal>;
  const conflictos = c.filas.filter((f) => f.estado === 'conflicto');
  const nuevos = c.filas.filter((f) => f.estado === 'nuevo');
  const porTabla = (l: typeof c.filas) => TABLAS.map((t) => [t.nombre, l.filter((f) => f.tabla === t.id).length] as const).filter(([, n]) => n);
  const confirmar = async () => {
    await guardarBanco(fusionarBancos(actual, c, decisiones), `Antes de importar: ${entrante.origen}`);
    ctx.avisar(`Banco actualizado: ${c.conteo.nuevo} registro(s) nuevo(s) y ${conflictos.length} conflicto(s) resuelto(s). El banco anterior quedó como punto de restauración.`);
    alTerminar?.();
    alCerrar();
  };
  const todos = (d: Decision) => setDecisiones(Object.fromEntries(conflictos.map((f) => [`${f.tabla}:${f.clave}`, d])));
  return (
    <Modal
      titulo={titulo}
      alCerrar={alCerrar}
      pie={<>
        <button className="boton" onClick={alCerrar}>Cancelar</button>
        <button className="boton primario" disabled={!c.conteo.nuevo && !conflictos.length} onClick={() => void confirmar()}>Escribir en el banco</button>
      </>}
    >
      <p className="pequeno" style={{ marginTop: 0 }}><strong>{entrante.origen}</strong>. Nada se escribe hasta que confirme; el banco actual queda como punto de restauración.</p>
      {entrante.avisos.map((a) => <div key={a} className="aviso info" style={{ marginBottom: 6 }}>{a}</div>)}
      {entrante.proyectos?.length ? <div className="aviso advertencia">El archivo trae {entrante.proyectos.length} proyecto(s): para recuperarlos use «Restaurar respaldo» en el panel de proyectos. Aquí solo se importa el banco.</div> : null}
      <div className="fila-flex" style={{ margin: '8px 0 12px' }}>
        <Insignia estado="ok">{c.conteo.nuevo} nuevos</Insignia>
        <Insignia estado="neutra">{c.conteo.igual} iguales</Insignia>
        <Insignia estado={conflictos.length ? 'advertencia' : 'neutra'}>{conflictos.length} en conflicto</Insignia>
        <span className="pequeno">{porTabla(nuevos).map(([t, n]) => `${t}: ${n}`).join(' · ')}</span>
      </div>
      {conflictos.length > 0 && (
        <>
          <div className="fila-flex" style={{ marginBottom: 6 }}>
            <strong>Conflictos</strong>
            <span className="pequeno">Por defecto gana lo más reciente; sin fecha se conserva lo que ya está.</span>
            <span className="separador" />
            <button className="boton chico" onClick={() => todos('conservar')}>Conservar todos</button>
            <button className="boton chico" onClick={() => todos('reemplazar')}>Reemplazar todos</button>
            <button className="boton chico" onClick={() => setDecisiones({})}>Regla por defecto</button>
          </div>
          <div className="tabla-marco" style={{ maxHeight: 320 }}>
            <table className="tabla" aria-label="Conflictos">
              <thead><tr><th>Tabla</th><th>Clave</th><th>En el banco</th><th>Lo que llega</th><th style={{ width: 150 }}>Decisión</th></tr></thead>
              <tbody>
                {conflictos.map((f) => {
                  const k = `${f.tabla}:${f.clave}`;
                  return (
                    <tr key={k}>
                      <td>{NOMBRE_TABLA[f.tabla]}</td>
                      <td className="pequeno">{f.clave}</td>
                      <td className="pequeno" style={{ whiteSpace: 'normal' }}>{resumenFila(f.actual)}</td>
                      <td className="pequeno" style={{ whiteSpace: 'normal' }}>{resumenFila(f.entrante)}</td>
                      <td>
                        <select className="entrada" aria-label={`Decisión para ${f.clave}`} value={decisiones[k] ?? f.sugerida} onChange={(e) => setDecisiones((d) => ({ ...d, [k]: e.target.value as Decision }))}>
                          <option value="conservar">Conservar</option>
                          <option value="reemplazar">Reemplazar</option>
                          {f.tabla !== 'plantillas' && <option value="ambos">Guardar ambos</option>}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {c.conteo.igual > 0 && (
        <p className="pequeno"><button className="boton chico" onClick={() => setVerIguales((v) => !v)}>{verIguales ? 'Ocultar' : 'Ver'} iguales</button> {verIguales && porTabla(c.filas.filter((f) => f.estado === 'igual')).map(([t, n]) => `${t}: ${n}`).join(' · ')}</p>
      )}
    </Modal>
  );
}

/** Opciones de importación (para listas de precios y proyectos) y elección de archivos; luego pasa a la fusión. */
export function ImportarAlBanco({ ctx, alCerrar, alTerminar }: { ctx: Contexto; alCerrar: () => void; alTerminar?: () => void }) {
  const m = ctx.proyecto.meta;
  const [o, setO] = useState<OpcionesImportacion>({ fecha: hoy(), lugar: m.departamento || 'Lima', fuente: 'revista', referencia: '', moneda: m.moneda });
  const [leido, setLeido] = useState<ResultadoBanco | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const elegir = async () => {
    const fs = await elegirArchivos('.epdb,.zip,.xlsx,.csv,.txt,.json');
    if (!fs.length) return;
    setLeyendo(true);
    try {
      let junto: ResultadoBanco | null = null;
      for (const f of fs) {
        const r = await leerArchivoBanco({ nombre: f.name, datos: new Uint8Array(await f.arrayBuffer()) }, { ...o, referencia: o.referencia || f.name.replace(/\.[^.]+$/, ''), insumos: (await leerBanco()).insumos });
        junto = junto ? { ...r, banco: fusionarBancos(junto.banco, compararBancos(junto.banco, r.banco)), avisos: [...junto.avisos, ...r.avisos], origen: `${junto.origen} + ${r.origen}` } : r;
      }
      setLeido(junto);
    } catch (e) {
      ctx.avisar(`No se pudo leer: ${(e as Error).message}`, true);
    } finally {
      setLeyendo(false);
    }
  };
  if (leido) return <Fusion ctx={ctx} entrante={leido} titulo="Importar al banco de datos" alCerrar={alCerrar} alTerminar={alTerminar} />;
  return (
    <Modal titulo="Importar al banco de datos" alCerrar={alCerrar} pie={<><button className="boton" onClick={alCerrar}>Cancelar</button><button className="boton primario" disabled={leyendo} onClick={() => void elegir()}>{leyendo ? 'Leyendo…' : 'Elegir archivos'}</button></>}>
      <p className="pequeno" style={{ marginTop: 0 }}>
        Acepta el banco del programa (.epdb, Excel o CSV), listas de precios en Excel o CSV (Revista Costos, presupuestos.pe, proveedores), expedientes de S10, Delphin o
        PowerCost exportados a Excel, plantillas de carga y proyectos .expediente.json. Antes de escribir verá lo nuevo, lo igual y lo que está en conflicto.
      </p>
      <p className="pequeno">Para los precios que no traen fecha, lugar o fuente:</p>
      <div className="rejilla">
        <Campo etiqueta="Fecha de los precios"><input className="entrada" type="date" value={o.fecha} onChange={(e) => setO({ ...o, fecha: e.target.value })} /></Campo>
        <Campo etiqueta="Lugar"><input className="entrada" value={o.lugar} onChange={(e) => setO({ ...o, lugar: e.target.value })} /></Campo>
        <Campo etiqueta="Fuente">
          <select className="entrada" value={o.fuente} onChange={(e) => setO({ ...o, fuente: e.target.value as FuentePrecio })}>
            {FUENTES_PRECIO.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Referencia" ayuda="Revista, proveedor u obra (vacío: el nombre del archivo)"><input className="entrada" value={o.referencia} onChange={(e) => setO({ ...o, referencia: e.target.value })} /></Campo>
      </div>
    </Modal>
  );
}

/** Compara los precios del proyecto con el banco a una fecha y lugar; muestra el efecto en el costo directo y aplica lo elegido. */
export function ActualizarPrecios({ ctx, alCerrar }: { ctx: Contexto; alCerrar: () => void }) {
  const { proyecto: p, resultados: r } = ctx;
  const [banco, setBanco] = useState<Banco | null>(null);
  const [fecha, setFecha] = useState(p.meta.fechaBase || hoy());
  const [lugar, setLugar] = useState(p.meta.departamento || '');
  const [quitados, setQuitados] = useState<Set<string>>(new Set());
  useEffect(() => { void leerBanco().then(setBanco); }, []);
  const cant = useMemo(() => new Map(r.insumos.items.map((x) => [x.insumo.codigo, x.cantidad])), [r.insumos]);
  const dif = useMemo(() => (banco ? compararPrecios(p, cant, banco, fecha, lugar) : []), [banco, p, cant, fecha, lugar]);
  const elegidos = dif.filter((d) => !quitados.has(d.codigo));
  // efecto exacto: el proyecto se recalcula con los precios elegidos
  const efecto = useMemo(() => (elegidos.length ? calcularTodo(produce(p, (d) => { aplicarPrecios(d as never, elegidos); })).pie : r.pie), [elegidos, p, r.pie]); // eslint-disable-line react-hooks/exhaustive-deps
  const lugares = useMemo(() => [...new Set(banco?.precios.map((x) => x.lugar).filter(Boolean) ?? [])].sort(), [banco]);
  const aplicar = () => {
    ctx.actualizar((d) => { aplicarPrecios(d as never, elegidos); }, `Precios actualizados desde el banco (${elegidos.length} insumos, ${fecha}${lugar ? `, ${lugar}` : ''})`);
    ctx.avisar(`Se actualizaron ${elegidos.length} precio(s). Puede deshacer con Ctrl+Z.`);
    alCerrar();
  };
  const mon = p.meta.moneda;
  return (
    <Modal titulo="Actualizar precios desde el banco" alCerrar={alCerrar} pie={<><button className="boton" onClick={alCerrar}>Cancelar</button><button className="boton primario" disabled={!elegidos.length} onClick={aplicar}>Aplicar {elegidos.length} precio(s)</button></>}>
      <div className="rejilla" style={{ marginBottom: 10 }}>
        <Campo etiqueta="Precios vigentes al"><input className="entrada" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
        <Campo etiqueta="Lugar" ayuda="Si no hay precio del lugar, se usa el más reciente de cualquier lugar">
          <select className="entrada" value={lugar} onChange={(e) => setLugar(e.target.value)}>
            <option value="">Cualquiera</option>
            {lugares.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Campo>
      </div>
      {!banco ? <p>Leyendo el banco…</p> : dif.length === 0 ? <div className="vacio"><p>Los precios del proyecto ya coinciden con el banco a esa fecha y lugar.</p></div> : (
        <>
          <div className="aviso info" style={{ marginBottom: 8 }}>
            Costo directo: {mon} {fmt(r.pie.costoDirecto)} → <strong>{mon} {fmt(efecto.costoDirecto)}</strong> ({efecto.costoDirecto >= r.pie.costoDirecto ? '+' : ''}{fmt(efecto.costoDirecto - r.pie.costoDirecto)}). Total: {mon} {fmt(r.pie.total)} → <strong>{mon} {fmt(efecto.total)}</strong>.
          </div>
          <div className="tabla-marco" style={{ maxHeight: 360 }}>
            <table className="tabla" aria-label="Diferencias de precio">
              <thead><tr><th style={{ width: 30 }}><input type="checkbox" aria-label="Elegir todos" checked={!quitados.size} onChange={(e) => setQuitados(e.target.checked ? new Set() : new Set(dif.map((d) => d.codigo)))} /></th><th>Insumo</th><th className="num">Proyecto</th><th className="num">Banco</th><th>Fuente</th><th className="num">Efecto en CD</th></tr></thead>
              <tbody>
                {dif.map((d: DiferenciaPrecio) => (
                  <tr key={d.codigo}>
                    <td><input type="checkbox" aria-label={`Actualizar ${d.codigo}`} checked={!quitados.has(d.codigo)} onChange={(e) => setQuitados((q) => { const n = new Set(q); if (e.target.checked) n.delete(d.codigo); else n.add(d.codigo); return n; })} /></td>
                    <td style={{ whiteSpace: 'normal' }}><strong>{d.codigo}</strong> {d.descripcion} <span className="pequeno">({d.unidad})</span></td>
                    <td className="num">{fmt(d.actual, 2)}</td>
                    <td className="num">{fmt(d.banco, 2)}</td>
                    <td className="pequeno">{d.precio.fecha} · {d.precio.lugar} · {FUENTES_PRECIO.find((f) => f.valor === d.precio.fuente)?.texto}</td>
                    <td className={`num ${d.efecto > 0 ? 'texto-error' : ''}`}>{d.efecto > 0 ? '+' : ''}{fmt(d.efecto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Busca insumos del banco que el proyecto no tiene y los agrega con el precio vigente. */
export function AgregarInsumosBanco({ ctx, alCerrar }: { ctx: Contexto; alCerrar: () => void }) {
  const [banco, setBanco] = useState<Banco | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { void leerBanco().then(setBanco); }, []);
  const p = ctx.proyecto;
  const fecha = p.meta.fechaBase || hoy();
  const tiene = new Set(p.insumos.map((i) => i.codigo));
  const lista = (banco?.insumos ?? []).filter((i) => !tiene.has(i.codigo) && `${i.codigo} ${i.descripcion}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  const agregar = (codigo: string) => {
    const i = banco && insumoDesdeBanco(banco, codigo, fecha, p.meta.departamento, p.meta.moneda);
    if (!i) return;
    ctx.actualizar((d) => { d.insumos.push(i); }, `Insumo agregado del banco: ${i.codigo} ${i.descripcion}`);
    ctx.avisar(`Agregado: ${i.codigo} ${i.descripcion} (${p.meta.moneda} ${fmt(i.precio, 2)})`);
  };
  return (
    <Modal titulo="Agregar insumos del banco" alCerrar={alCerrar}>
      <input className="entrada" style={{ width: '100%', marginBottom: 10 }} placeholder="Buscar por código o descripción…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Buscar insumo en el banco" />
      {!banco ? <p>Leyendo el banco…</p> : lista.length === 0 ? <div className="vacio"><p>No hay insumos del banco que falten en el proyecto con ese texto.</p></div> : (
        <div className="tabla-marco" style={{ maxHeight: 380 }}>
          <table className="tabla">
            <tbody>
              {lista.map((i) => {
                const v = precioVigente(banco, i.codigo, fecha, p.meta.departamento, p.meta.moneda);
                return (
                  <tr key={i.codigo}>
                    <td style={{ width: 70 }}>{i.codigo}</td>
                    <td>{i.descripcion}</td>
                    <td style={{ width: 50 }}>{i.unidad}</td>
                    <td className="num" style={{ width: 90 }}>{v ? fmt(v.precio, 2) : '—'}</td>
                    <td style={{ width: 90 }}><button className="boton chico" onClick={() => agregar(i.codigo)}>Agregar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** Agrega al presupuesto una partida con el análisis del banco, completando los insumos que falten. */
export function agregarAnalisis(ctx: Contexto, banco: Banco, a: AnalisisBanco) {
  const destino = ctx.proyecto.partidas.find((x) => x.id === ctx.partidaSel) ?? null;
  let nuevo: string | null = null;
  let info = { agregados: [] as string[], faltan: [] as string[] };
  ctx.actualizar((d) => {
    info = completarInsumos(d as never, banco, a, ctx.proyecto.meta.fechaBase || hoy(), ctx.proyecto.meta.departamento);
    nuevo = agregarPartida(d, destino, partidaTipoDe(a));
  }, `Partida agregada del banco: ${a.descripcion}`);
  if (nuevo) ctx.ir('presupuesto', nuevo);
  ctx.avisar(`Partida agregada: ${a.descripcion}${info.agregados.length ? `. Insumos agregados del banco: ${info.agregados.join(', ')}` : ''}${info.faltan.length ? `. Faltan en el banco: ${info.faltan.join(', ')}` : ''}`, info.faltan.length > 0);
}
