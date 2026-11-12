// Versiones del presupuesto (oferta, negociado, contractual…): guardar, restaurar, comparar lado a lado por partida, insumo y
// total (exportable a Excel) y presupuesto vigente = contractual + adicionales − deductivos aprobados.
import { useMemo, useState } from 'react';
import { resumirCambios } from '../../engine/control';
import { compararPresupuestos, crearEscenario, escenarioContractual, restaurarEscenario, resultadosDeEscenario, TIPOS_ESCENARIO } from '../../engine/escenarios';
import type { Resultados, TipoEscenario } from '../../engine/types';
import { fmt } from '../../engine/util';
import { generarXlsxTablas } from '../../export/control';
import type { Tabla } from '../../export/tablas';
import { MIME_XLSX } from '../control';
import { Campo, Insignia, Pestanas, TablaEditable } from '../componentes';
import { descargar, type Contexto } from '../estado';

const ACTUAL = 'actual';
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ModVersiones({ ctx }: { ctx: Contexto }) {
  const { proyecto: p, resultados: r } = ctx;
  const versiones = p.escenarios ?? [];
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoEscenario>('oferta');
  const [a, setA] = useState<string>(() => versiones[0]?.id ?? ACTUAL);
  const [b, setB] = useState<string>(ACTUAL);
  const [vista, setVista] = useState<'totales' | 'partidas' | 'insumos'>('totales');
  const [soloCambios, setSoloCambios] = useState(true);

  const resultadosDe = (id: string): Resultados | null => {
    if (id === ACTUAL) return r;
    const e = versiones.find((x) => x.id === id);
    return e ? resultadosDeEscenario(p, e) : null;
  };
  const nombreDe = (id: string) => (id === ACTUAL ? 'Presupuesto actual' : versiones.find((x) => x.id === id)?.nombre ?? '—');
  const ra = useMemo(() => resultadosDe(a), [a, versiones, r]); // eslint-disable-line react-hooks/exhaustive-deps
  const rb = useMemo(() => resultadosDe(b), [b, versiones, r]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = useMemo(() => (ra && rb ? compararPresupuestos(ra, rb) : null), [ra, rb]);

  const guardar = () => {
    const e = crearEscenario(p, r, nombre || `${TIPOS_ESCENARIO.find((t) => t.valor === tipo)!.texto} ${new Date().toLocaleDateString('es-PE')}`, tipo);
    ctx.actualizar((d) => { (d.escenarios ??= []).push(e); }, `Versión del presupuesto guardada: ${e.nombre}`);
    setNombre('');
    setA(e.id);
    ctx.avisar(`Versión guardada: ${e.nombre}`);
  };
  const restaurar = (id: string) => {
    const e = versiones.find((x) => x.id === id)!;
    if (!window.confirm(`El presupuesto (partidas, metrados, análisis, insumos, GG y programación) volverá a la versión «${e.nombre}». Puede deshacerlo con Ctrl+Z. ¿Continuar?`)) return;
    ctx.actualizar((d) => restaurarEscenario(d as never, e), `Presupuesto restaurado a la versión ${e.nombre}`);
    ctx.avisar(`Presupuesto restaurado a «${e.nombre}».`);
  };

  const exportar = async () => {
    if (!c) return;
    const t = (clave: string, titulo: string, cabecera: string[], filas: (string | number)[][], dec: (number | null)[]): Tabla => ({
      clave, titulo, subtitulo: `${nombreDe(a)} (A) frente a ${nombreDe(b)} (B)`, cabecera, filas: filas.map((celdas) => ({ celdas })),
      anchos: cabecera.map((_, i) => (i === 1 ? 46 : 13)), alinear: cabecera.map((_, i) => (i <= 2 ? 'l' : 'r')), decimales: dec,
    });
    const tablas = [
      { hoja: 'Totales', tabla: t('tot', 'Comparación de totales', ['Concepto', 'A', 'B', 'Diferencia'], c.totales.map((x) => [x.concepto, x.a, x.b, x.diferencia]), [null, 2, 2, 2]) },
      { hoja: 'Partidas', tabla: t('par', 'Comparación por partida', ['Ítem', 'Descripción', 'Und', 'Metrado A', 'P.U. A', 'Parcial A', 'Metrado B', 'P.U. B', 'Parcial B', 'Diferencia'], c.partidas.map((x) => [x.codigo, x.descripcion, x.unidad, x.metradoA, x.puA, x.parcialA, x.metradoB, x.puB, x.parcialB, x.diferencia]), [null, null, null, 2, 2, 2, 2, 2, 2, 2]) },
      { hoja: 'Insumos', tabla: t('ins', 'Comparación por insumo', ['Código', 'Insumo', 'Und', 'Cantidad A', 'Precio A', 'Parcial A', 'Cantidad B', 'Precio B', 'Parcial B', 'Diferencia'], c.insumos.map((x) => [x.codigo, x.descripcion, x.unidad, x.cantidadA, x.precioA, x.parcialA, x.cantidadB, x.precioB, x.parcialB, x.diferencia]), [null, null, null, 4, 2, 2, 4, 2, 2, 2]) },
    ];
    descargar(`${(p.meta.codigo || 'Proyecto').replace(/[^\w.-]+/g, '_')}_Comparacion_de_versiones.xlsx`, await generarXlsxTablas(r, 'Comparación de versiones del presupuesto', tablas), MIME_XLSX);
  };

  const contractual = escenarioContractual(p);
  const cambios = p.control ? resumirCambios(r, p.control) : null;
  const opciones = [{ id: ACTUAL, nombre: 'Presupuesto actual' }, ...versiones.map((v) => ({ id: v.id, nombre: v.nombre }))];
  const filasPartidas = c ? (soloCambios ? c.partidas.filter((x) => x.estado !== 'igual') : c.partidas) : [];
  const filasInsumos = c ? (soloCambios ? c.insumos.filter((x) => x.diferencia !== 0) : c.insumos) : [];
  const m = p.meta.moneda;

  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Versiones del presupuesto</h1>
          <p className="proposito">Guarde el presupuesto con nombre en cada momento (oferta, negociado, contractual) para compararlos lado a lado por partida, insumo y total. La versión contractual es la base del presupuesto vigente que usa el control de obra.</p>
        </div>
      </div>

      <div className="panel" style={{ padding: 14, marginBottom: 14 }}>
        <div className="rejilla" style={{ gridTemplateColumns: 'minmax(220px, 2fr) 160px auto', alignItems: 'end' }}>
          <Campo etiqueta="Nombre de la versión"><input className="entrada" value={nombre} placeholder="Por ejemplo: Oferta técnica-económica" onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardar()} /></Campo>
          <Campo etiqueta="Tipo"><select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEscenario)}>{TIPOS_ESCENARIO.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}</select></Campo>
          <button className="boton primario" onClick={guardar}>Guardar el presupuesto actual como versión</button>
        </div>
      </div>

      <TablaEditable
        etiqueta="Versiones guardadas"
        filas={versiones.map((v, gi) => ({ v, gi }))}
        clave={(x) => x.v.id}
        vacio={<div className="vacio"><p>Todavía no hay versiones. Guarde la oferta antes de negociar y la contractual al firmar.</p></div>}
        alEliminar={(x) => { if (window.confirm(`¿Eliminar la versión «${x.v.nombre}»?`)) ctx.actualizar((d) => { d.escenarios!.splice(x.gi, 1); }, `Versión eliminada: ${x.v.nombre}`); }}
        columnas={[
          { clave: 'n', titulo: 'Versión', tipo: 'texto', valor: (x) => x.v.nombre, cambiar: (x, v) => ctx.actualizar((d) => { d.escenarios![x.gi].nombre = String(v) || 'Sin nombre'; }, 'Versiones del presupuesto') },
          { clave: 't', titulo: 'Tipo', tipo: 'select', ancho: 130, opciones: TIPOS_ESCENARIO, valor: (x) => x.v.tipo, cambiar: (x, v) => ctx.actualizar((d) => { d.escenarios![x.gi].tipo = v as TipoEscenario; }, `Tipo de la versión ${x.v.nombre}`) },
          { clave: 'f', titulo: 'Guardada', ancho: 130, valor: (x) => fechaHora(x.v.fecha) },
          { clave: 'cd', titulo: 'Costo directo', num: true, ancho: 120, valor: (x) => x.v.resumen?.costoDirecto ?? 0 },
          { clave: 'to', titulo: `Total (${m})`, num: true, ancho: 120, valor: (x) => x.v.resumen?.total ?? 0 },
          { clave: 'a', titulo: '', ancho: 200, valor: () => '', formato: (x) => <span className="fila-flex" style={{ gap: 4, flexWrap: 'nowrap' }}><button className="boton chico" onClick={() => { setA(x.v.id); setB(ACTUAL); }}>Comparar</button><button className="boton chico" onClick={() => restaurar(x.v.id)}>Restaurar</button></span> },
        ]}
      />

      <h2>Presupuesto vigente</h2>
      <div className="cifras">
        <div><span>Contractual</span><strong>{cambios ? `${m} ${fmt(cambios.contractual)}` : contractual?.resumen ? `${m} ${fmt(contractual.resumen.subtotal)}` : '—'}</strong><small className="pequeno">{contractual ? `versión «${contractual.nombre}»` : cambios?.origenContractual === 'lineaBase' ? 'línea base (no hay versión contractual)' : 'marque una versión como contractual'}</small></div>
        <div><span>Adicionales aprobados</span><strong>{fmt(cambios?.adicionales ?? 0)}</strong></div>
        <div><span>Deductivos aprobados</span><strong>{fmt(cambios?.deductivos ?? 0)}</strong></div>
        <div><span>Vigente (sin IGV)</span><strong>{cambios ? `${m} ${fmt(cambios.vigente)}` : contractual?.resumen ? `${m} ${fmt(contractual.resumen.subtotal)}` : '—'}</strong></div>
      </div>
      <p className="pequeno">Los adicionales y deductivos se registran en Control y valor ganado › Cambios. El valor ganado usa el vigente para el costo estimado al término (EAC), la variación (VAC) y el TCPI.</p>

      <h2>Comparar</h2>
      <div className="fila-flex" style={{ marginBottom: 10 }}>
        <Campo etiqueta="A"><select className="entrada" value={a} onChange={(e) => setA(e.target.value)}>{opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></Campo>
        <Campo etiqueta="B"><select className="entrada" value={b} onChange={(e) => setB(e.target.value)}>{opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></Campo>
        <span className="separador" />
        <label className="casilla"><input type="checkbox" checked={soloCambios} onChange={(e) => setSoloCambios(e.target.checked)} /> Solo lo que cambia</label>
        <button className="boton chico" disabled={!c} onClick={() => void exportar()}>Exportar comparación (Excel)</button>
      </div>
      <Pestanas valor={vista} alCambiar={setVista} opciones={[{ id: 'totales', texto: 'Totales' }, { id: 'partidas', texto: `Partidas (${filasPartidas.length})` }, { id: 'insumos', texto: `Insumos (${filasInsumos.length})` }]} />
      {c && vista === 'totales' && (
        <div className="tabla-marco" style={{ maxWidth: 720 }}>
          <table className="tabla" aria-label="Comparación de totales">
            <thead><tr><th>Concepto</th><th className="num">{nombreDe(a)}</th><th className="num">{nombreDe(b)}</th><th className="num">Diferencia</th></tr></thead>
            <tbody>{c.totales.map((x) => <tr key={x.concepto} className={x.concepto === 'Total' ? 'total' : ''}><td>{x.concepto}</td><td className="num">{fmt(x.a, x.concepto.startsWith('Plazo') ? 0 : 2)}</td><td className="num">{fmt(x.b, x.concepto.startsWith('Plazo') ? 0 : 2)}</td><td className="num">{x.diferencia > 0 ? '+' : ''}{fmt(x.diferencia, x.concepto.startsWith('Plazo') ? 0 : 2)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {c && vista === 'partidas' && (
        <TablaEditable
          etiqueta="Comparación por partida"
          alto="calc(100vh - 360px)"
          filas={filasPartidas}
          clave={(x) => x.clave}
          vacio={<div className="vacio"><p>Las partidas son iguales en las dos versiones.</p></div>}
          columnas={[
            { clave: 'c', titulo: 'Ítem', ancho: 80, valor: (x) => x.codigo },
            { clave: 'd', titulo: 'Partida', valor: (x) => x.descripcion },
            { clave: 'e', titulo: 'Estado', ancho: 80, valor: (x) => x.estado, formato: (x) => <Insignia estado={x.estado === 'igual' ? 'neutra' : x.estado === 'cambia' ? 'advertencia' : 'error'}>{x.estado}</Insignia> },
            { clave: 'ma', titulo: 'Metrado A', num: true, ancho: 90, valor: (x) => x.metradoA },
            { clave: 'pa', titulo: 'P.U. A', num: true, ancho: 80, valor: (x) => x.puA },
            { clave: 'mb', titulo: 'Metrado B', num: true, ancho: 90, valor: (x) => x.metradoB },
            { clave: 'pb', titulo: 'P.U. B', num: true, ancho: 80, valor: (x) => x.puB },
            { clave: 'df', titulo: 'Diferencia', num: true, ancho: 100, valor: (x) => x.diferencia },
          ]}
          pie={<tr><td colSpan={7}>Suma de diferencias (= diferencia de costo directo)</td><td className="num">{fmt(c.partidas.reduce((s, x) => s + x.diferencia, 0))}</td></tr>}
        />
      )}
      {c && vista === 'insumos' && (
        <TablaEditable
          etiqueta="Comparación por insumo"
          alto="calc(100vh - 360px)"
          filas={filasInsumos}
          clave={(x) => x.codigo}
          vacio={<div className="vacio"><p>Los insumos son iguales en las dos versiones.</p></div>}
          columnas={[
            { clave: 'c', titulo: 'Código', ancho: 70, valor: (x) => x.codigo },
            { clave: 'd', titulo: 'Insumo', valor: (x) => x.descripcion },
            { clave: 'ca', titulo: 'Cantidad A', num: true, ancho: 96, decimales: 4, valor: (x) => x.cantidadA },
            { clave: 'pa', titulo: 'Precio A', num: true, ancho: 80, valor: (x) => x.precioA },
            { clave: 'cb', titulo: 'Cantidad B', num: true, ancho: 96, decimales: 4, valor: (x) => x.cantidadB },
            { clave: 'pb', titulo: 'Precio B', num: true, ancho: 80, valor: (x) => x.precioB },
            { clave: 'df', titulo: 'Diferencia', num: true, ancho: 100, valor: (x) => x.diferencia },
          ]}
        />
      )}
    </div>
  );
}
