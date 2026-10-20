import { ggPlantilla } from '../../data/proyectos';
import type { GGItem, GrupoGG } from '../../engine/types';
import { fmt, uid } from '../../engine/util';
import { IconoMas, TablaEditable } from '../componentes';
import type { Contexto } from '../estado';

export function ModGG({ ctx }: { ctx: Contexto }) {
  const { proyecto: p, resultados: r, actualizar } = ctx;
  const calc = new Map(r.gg.items.map((i) => [i.id, i]));
  const set = (gi: number, f: (g: GGItem) => void) => actualizar((d) => f(d.gg[gi] as GGItem));
  const agregar = (grupo: GrupoGG) =>
    actualizar((d) => {
      d.gg.push({
        id: uid('gg'),
        grupo,
        rubro: grupo === 'variable' ? 'Personal técnico' : grupo === 'financiero' ? 'Garantías' : 'Varios',
        descripcion: grupo === 'financiero' ? 'Costo financiero de la carta fianza' : '',
        unidad: grupo === 'variable' ? 'mes' : grupo === 'financiero' ? '%CD' : 'glb',
        cantidad: grupo === 'financiero' ? 0.03 : 1,
        duracion: 1,
        precio: 0,
        participacion: 100,
        ligadoAlPlazo: grupo === 'variable',
      });
    });
  const TITULO: Record<GrupoGG, string> = { variable: 'Gastos generales variables', fijo: 'Gastos generales fijos', financiero: 'Gastos financieros' };
  const AYUDA: Record<GrupoGG, string> = {
    variable: 'Dependen del plazo de obra.',
    fijo: 'No dependen del plazo. Unidad %CD = porcentaje del costo directo.',
    financiero: 'Cartas fianza, seguros e intereses. Unidad %CD = porcentaje del costo directo.',
  };

  const tabla = (grupo: GrupoGG) => {
    const filas = p.gg.map((g, gi) => ({ g, gi })).filter((x) => (x.g.grupo ?? 'variable') === grupo);
    const total = grupo === 'fijo' ? r.gg.fijos : grupo === 'financiero' ? r.gg.financieros : r.gg.variables;
    return (
      <>
        <div className="fila-flex" style={{ margin: '22px 0 8px' }}>
          <h2 style={{ margin: 0 }}>{TITULO[grupo]}</h2>
          <span className="pequeno">{AYUDA[grupo]}</span>
          <span className="separador" />
          <button className="boton" onClick={() => agregar(grupo)}><IconoMas /> {grupo === 'financiero' ? 'Gasto financiero' : `Gasto ${grupo}`}</button>
        </div>
        <TablaEditable
          etiqueta={grupo}
          filas={filas}
          clave={(x) => x.g.id}
          alEliminar={(x) => actualizar((d) => { d.gg.splice(x.gi, 1); })}
          columnas={[
            { clave: 'r', titulo: 'Rubro', ancho: 170, valor: (x) => x.g.rubro, cambiar: (x, v) => set(x.gi, (g) => (g.rubro = String(v))) },
            { clave: 'd', titulo: 'Descripción', valor: (x) => x.g.descripcion, cambiar: (x, v) => set(x.gi, (g) => (g.descripcion = String(v))), placeholder: 'Concepto' },
            { clave: 'u', titulo: 'Und', ancho: 60, valor: (x) => x.g.unidad, cambiar: (x, v) => set(x.gi, (g) => (g.unidad = String(v))) },
            { clave: 'c', titulo: 'Cantidad', tipo: 'numero', ancho: 80, valor: (x) => x.g.cantidad, cambiar: (x, v) => set(x.gi, (g) => (g.cantidad = (v as number) ?? 0)) },
            ...(grupo === 'variable'
              ? [{ clave: 'l', titulo: 'Todo el plazo', tipo: 'casilla' as const, ancho: 92, valor: (x: { g: GGItem }) => !!x.g.ligadoAlPlazo, cambiar: (x: { gi: number }, v: unknown) => set(x.gi, (g) => (g.ligadoAlPlazo = !!v)) }]
              : []),
            {
              clave: 'du', titulo: 'Duración', tipo: 'numero', ancho: 84,
              valor: (x) => (x.g.grupo === 'variable' && x.g.ligadoAlPlazo ? calc.get(x.g.id)?.duracionUsada ?? null : x.g.duracion),
              cambiar: (x, v) => set(x.gi, (g) => { g.duracion = (v as number) ?? 1; g.ligadoAlPlazo = false; }),
            },
            { clave: 'p', titulo: 'Precio', tipo: 'numero', ancho: 98, valor: (x) => (x.g.unidad.toLowerCase() === '%cd' ? null : x.g.precio), cambiar: (x, v) => set(x.gi, (g) => (g.precio = (v as number) ?? 0)) },
            { clave: 'pa', titulo: '% part.', tipo: 'numero', ancho: 70, decimales: 0, valor: (x) => x.g.participacion, cambiar: (x, v) => set(x.gi, (g) => (g.participacion = (v as number) ?? 100)) },
            { clave: 't', titulo: 'Total', num: true, ancho: 108, valor: (x) => calc.get(x.g.id)?.total ?? 0 },
          ]}
          pie={
            <tr>
              <td colSpan={grupo === 'variable' ? 8 : 7}>Subtotal</td>
              <td className="num">{fmt(total)}</td>
              <td />
            </tr>
          }
        />
      </>
    );
  };

  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Gastos generales</h1>
          <p className="proposito">Desagregado de gastos variables, fijos y financieros. Los variables marcados “Todo el plazo” toman la duración del programa de obra, así que cambian solos si cambia el plazo.</p>
        </div>
        <div className="herramientas">
          <button className="boton" onClick={() => { if (window.confirm('¿Reemplazar los gastos generales por la plantilla típica?')) actualizar((d) => { d.gg = ggPlantilla(); }); }}>Usar plantilla típica</button>
        </div>
      </div>
      <div className="cifras">
        <div><span>Plazo de obra</span><strong>{r.programa.plazoDias} días ({fmt(r.programa.plazoMeses)} meses)</strong></div>
        <div><span>Gastos variables</span><strong>{fmt(r.gg.variables)}</strong></div>
        <div><span>Gastos fijos</span><strong>{fmt(r.gg.fijos)}</strong></div>
        <div><span>Gastos financieros</span><strong>{fmt(r.gg.financieros)}</strong></div>
        <div><span>Total</span><strong>{fmt(r.gg.total)}</strong></div>
        <div><span>Incidencia sobre el costo directo</span><strong>{fmt(r.pie.ggPct)} %</strong></div>
      </div>
      {tabla('variable')}
      {tabla('fijo')}
      {tabla('financiero')}
    </div>
  );
}
