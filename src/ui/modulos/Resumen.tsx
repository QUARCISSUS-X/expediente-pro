// Resumen del proyecto: indicadores, gráficos y puntos de atención calculados con engine/analisis.ts.
import { useMemo, useState } from 'react';
import { analizar, type Abc } from '../../engine/analisis';
import { resumenIntegridad, revisarIntegridad } from '../../engine/integridad';
import { fmt } from '../../engine/util';
import { Insignia, Pestanas } from '../componentes';
import type { Contexto } from '../estado';
import { TableroObra } from './Control';
import { BarraApilada, COLOR, GraficoBarras, GraficoLineas, GraficoPareto, Indicador } from '../graficos';

const PALETA = [COLOR.plan, COLOR.real, COLOR.ocre, COLOR.costo, COLOR.gris];
const corto = (t: string, n = 16) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

/**
 * Tablero único: en la etapa de expediente muestra el resumen del presupuesto; con línea base de control, el tablero de
 * obra (valor ganado, plazo, Last Planner, calidad, materiales…), y se puede pasar de uno a otro.
 */
export function ModResumen({ ctx }: { ctx: Contexto }) {
  const conObra = !!ctx.proyecto.control?.lineaBase;
  const [etapa, setEtapa] = useState<'expediente' | 'obra'>(conObra ? 'obra' : 'expediente');
  if (!conObra) return <ResumenExpediente ctx={ctx} />;
  return (
    <>
      <div style={{ padding: '14px 24px 0' }}>
        <Pestanas valor={etapa} alCambiar={setEtapa} opciones={[{ id: 'expediente', texto: 'Etapa de expediente: presupuesto' }, { id: 'obra', texto: 'Etapa de obra: control' }]} />
      </div>
      {etapa === 'obra' ? (
        <div className="modulo">
          <div className="modulo-cabecera"><div><h1>Tablero del proyecto</h1><p className="proposito">El proyecto está en ejecución: indicadores de valor ganado, plazo, Last Planner, calidad y materiales en una sola vista. El presupuesto sigue en la otra pestaña.</p></div></div>
          <TableroObra ctx={ctx} />
        </div>
      ) : <ResumenExpediente ctx={ctx} />}
    </>
  );
}

function ResumenExpediente({ ctx }: { ctx: Contexto }) {
  const { resultados: r, proyecto: p, ir, exportar, ocupado } = ctx;
  // el análisis solo depende del cálculo: no se repite al editar datos del control de obra
  const a = useMemo(() => analizar(r), [r.filas, r.insumos, r.programa, r.pie, r.validacion]); // eslint-disable-line react-hooks/exhaustive-deps
  const integ = useMemo(() => resumenIntegridad(revisarIntegridad(p)), [p]);
  const [abc, setAbc] = useState<'partidas' | 'insumos'>('partidas');
  const m = p.meta;
  const i = a.indices;
  const v = r.resumenValidacion;

  if (!r.hojas.length) {
    return (
      <div className="modulo">
        <div className="modulo-cabecera"><div><h1>Resumen del proyecto</h1></div></div>
        <div className="vacio"><p>El proyecto todavía no tiene partidas. Cárguelas en el presupuesto para ver sus indicadores y gráficos.</p><button className="boton primario" onClick={() => ir('presupuesto')}>Ir al presupuesto</button></div>
      </div>
    );
  }
  const lista: Abc = abc === 'partidas' ? a.abcPartidas : a.abcInsumos;

  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Resumen del proyecto</h1>
          <p className="proposito">Lo esencial del expediente en una pantalla: dónde está el costo, cómo avanza en el tiempo y qué tan confiable es la información. Se actualiza con cada cambio.</p>
        </div>
        <div className="herramientas">
          <button className="boton" disabled={!!ocupado} onClick={() => exportar('gerencial')}>Reporte gerencial (Excel)</button>
          <button className="boton primario" disabled={!!ocupado} onClick={() => exportar('ejecutivo')}>{ocupado ? `Generando ${ocupado}…` : 'Informe ejecutivo (PDF)'}</button>
        </div>
      </div>

      <div className="indicadores">
        <Indicador titulo={m.incluirIgv === false ? 'Total sin IGV' : 'Total con IGV'} valor={`${m.moneda} ${fmt(r.pie.total)}`} detalle={`Costo directo ${fmt(r.pie.costoDirecto)}`} />
        <Indicador titulo="Plazo" valor={`${i.plazoDias} días`} detalle={`${i.diasLaborables} laborables · ${i.actividadesCriticas} actividades críticas`} />
        <Indicador titulo="Gastos generales" valor={`${fmt(i.ggPct)} %`} detalle={`Utilidad ${fmt(i.utilidadPct)} % del costo directo`} estado={i.ggPct > 35 ? 'advertencia' : 'neutra'} />
        <Indicador titulo="Costo directo por día" valor={`${m.moneda} ${fmt(i.costoPorDia, 0)}`} detalle={`${fmt(i.horasHombre, 0)} hh · pico de ${fmt(i.personalPico, 1)} trabajadores`} />
        <Indicador titulo="Concentración del costo" valor={`${a.abcPartidas.clases.A.n} de ${i.partidas} partidas`} detalle="suman el 80 % del costo directo" />
        <Indicador titulo="Consistencia" valor={v.errores ? `${v.errores} con errores` : v.advertencias ? `${v.advertencias} advertencias` : 'Conforme'} detalle={`${v.ok} de ${r.validacion.length} reglas conformes`} estado={v.errores ? 'error' : v.advertencias ? 'advertencia' : 'ok'} />
        <Indicador titulo="Integridad de datos" valor={integ.errores ? `${integ.errores} errores` : integ.avisos ? `${integ.avisos} avisos` : 'Sin problemas'} detalle={integ.reparables ? `${integ.reparables} reparables en Validación` : 'Sin datos sueltos ni dañados'} estado={integ.errores ? 'error' : integ.avisos ? 'advertencia' : 'ok'} />
        <Indicador titulo="Sustento de precios" valor={`${fmt(i.preciosConFuente, 0)} %`} detalle="de los insumos indica su fuente" estado={i.preciosConFuente >= 80 ? 'ok' : i.preciosConFuente >= 50 ? 'neutra' : 'advertencia'} />
      </div>

      {a.alertas.length > 0 && (
        <div className="panel" style={{ padding: '10px 14px', marginBottom: 16 }}>
          <strong style={{ fontSize: 13 }}>Puntos de atención</strong>
          <ul className="lista-alertas">
            {a.alertas.map((x) => (
              <li key={x.texto}>
                <Insignia estado={x.nivel === 'info' ? 'neutra' : x.nivel}>{x.nivel === 'error' ? 'Error' : x.nivel === 'advertencia' ? 'Advertencia' : 'Nota'}</Insignia> {x.texto}
              </li>
            ))}
          </ul>
          {(v.errores > 0 || v.advertencias > 0 || integ.reparables > 0) && <button className="boton chico" onClick={() => ir('validacion')}>Revisar en Validación</button>}
        </div>
      )}

      <div className="rejilla-graficos">
        <div className="grafico">
          <GraficoBarras titulo={`Costo directo por título (${m.moneda})`} datos={a.porTitulo.map((x) => ({ etiqueta: corto(x.nombre), valor: x.monto }))} />
          <table className="tabla compacta">
            <tbody>
              {a.porTitulo.map((x) => (
                <tr key={x.clave}><td>{x.nombre}</td><td className="num">{fmt(x.monto)}</td><td className="num">{fmt(x.pct, 1)} %</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grafico">
          <BarraApilada titulo="Composición del costo directo" partes={a.composicion.map((x, k) => ({ texto: x.nombre, valor: x.monto, color: PALETA[k % PALETA.length] }))} />
          <BarraApilada titulo="Estructura del precio" partes={a.estructura.map((x, k) => ({ texto: x.nombre, valor: x.monto, color: PALETA[k % PALETA.length] }))} />
          <GraficoLineas
            titulo="Curva S programada (% acumulado del costo directo)"
            alto={200}
            yMax={100}
            formatoY={(y) => `${fmt(y, 0)} %`}
            etiquetaX={(x) => (x === 0 ? 'Inicio' : a.curva[x - 1]?.etiqueta ?? '')}
            series={[{ nombre: 'Acumulado', color: COLOR.plan, marcadores: true, puntos: [{ x: 0, y: 0 }, ...a.curva.map((c, k) => ({ x: k + 1, y: c.acumuladoPct }))] }]}
          />
        </div>
      </div>

      <h2>Clasificación ABC</h2>
      <p className="pequeno" style={{ marginTop: -4 }}>Clase A: lo que suma el 80 % del costo y merece la mayor revisión. Clase B: el 15 % siguiente. Clase C: el 5 % restante.</p>
      <Pestanas valor={abc} alCambiar={setAbc} opciones={[{ id: 'partidas', texto: `Partidas (${a.abcPartidas.items.length})` }, { id: 'insumos', texto: `Insumos (${a.abcInsumos.items.length})` }]} />
      <div className="cifras">
        {(['A', 'B', 'C'] as const).map((k) => (
          <div key={k}><span>Clase {k}</span><strong>{lista.clases[k].n} · {fmt(lista.clases[k].pct, 1)} %</strong></div>
        ))}
      </div>
      <div className="grafico" style={{ marginBottom: 12 }}>
        <GraficoPareto titulo={`Pareto de ${abc}: los 15 de mayor monto (${m.moneda})`} items={lista.items.slice(0, 15).map((x) => ({ clave: corto(abc === 'partidas' ? x.codigo : x.descripcion, 14), valor: x.monto, acumuladoPct: x.acumPct }))} />
      </div>
      <div className="tabla-marco" style={{ maxHeight: 420 }}>
        <table className="tabla">
          <thead><tr><th style={{ width: 54 }}>Clase</th><th style={{ width: 90 }}>Código</th><th>Descripción</th><th style={{ width: 50 }}>Und.</th><th className="num">{abc === 'partidas' ? 'Metrado' : 'Cantidad'}</th><th className="num">Precio</th><th className="num">Parcial</th><th className="num">%</th><th className="num">% acum.</th></tr></thead>
          <tbody>
            {lista.items.map((x) => (
              <tr key={x.clave} className={abc === 'partidas' ? 'clic' : undefined} onClick={abc === 'partidas' ? () => ir('presupuesto', x.clave) : undefined} title={abc === 'partidas' ? 'Abrir la partida en el presupuesto' : undefined}>
                <td><Insignia estado={x.clase === 'A' ? 'ok' : x.clase === 'B' ? 'advertencia' : 'neutra'}>{x.clase}</Insignia></td>
                <td>{x.codigo}</td><td>{x.descripcion}</td><td>{x.unidad}</td>
                <td className="num">{fmt(x.cantidad)}</td><td className="num">{fmt(x.precio)}</td><td className="num">{fmt(x.monto)}</td><td className="num">{fmt(x.pct, 2)}</td><td className="num">{fmt(x.acumPct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
