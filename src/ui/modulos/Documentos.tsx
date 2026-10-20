import { useState } from 'react';
import { cartaPresentacion, memoriaDescriptiva } from '../../engine/documentos';
import { SECCIONES_EETT } from '../../engine/eett';
import type { PlantillaEett, SeccionesEett } from '../../engine/types';
import { AreaTexto, Campo, EntradaTexto, Insignia, Pestanas } from '../componentes';
import type { Contexto } from '../estado';
import { VistaDocumento } from '../VistaTabla';

const SECCIONES = SECCIONES_EETT;

export function ModDocumentos({ ctx }: { ctx: Contexto }) {
  const { proyecto: p, resultados: r, actualizar, ir, setPartidaSel } = ctx;
  const [pest, setPest] = useState<'eett' | 'plantillas' | 'memoria' | 'carta'>('eett');
  const [pl, setPl] = useState<string>(p.plantillasEett[0]?.clave ?? '');
  const plantilla = p.plantillasEett.find((x) => x.clave === pl);
  const idx = p.plantillasEett.findIndex((x) => x.clave === pl);
  const setPlantilla = (f: (x: PlantillaEett) => void) => actualizar((d) => { if (idx >= 0) f(d.plantillasEett[idx] as PlantillaEett); });
  const genericas = r.eett.filter((e) => e.generica).length;
  const uso = new Map<string, number>();
  for (const e of r.eett) uso.set(e.plantilla, (uso.get(e.plantilla) ?? 0) + 1);
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Documentos</h1>
          <p className="proposito">Especificaciones técnicas, memoria descriptiva y carta se escriben con plantillas y se llenan con los datos del presupuesto: listas de materiales y equipos del APU, unidades, montos y plazo.</p>
        </div>
      </div>
      <Pestanas
        valor={pest}
        alCambiar={setPest}
        opciones={[
          { id: 'eett', texto: 'Especificaciones por partida', extra: genericas ? <Insignia estado="advertencia">{genericas}</Insignia> : undefined },
          { id: 'plantillas', texto: 'Plantillas de especificaciones' },
          { id: 'memoria', texto: 'Memoria descriptiva' },
          { id: 'carta', texto: p.meta.modo === 'publico' ? 'Carta de remisión' : 'Carta de presentación' },
        ]}
      />
      {pest === 'eett' && (
        <div className="tabla-marco">
          <table className="tabla">
            <thead><tr><th style={{ width: 80 }}>Ítem</th><th>Partida</th><th style={{ width: 230 }}>Plantilla usada</th><th style={{ width: 120 }}>Estado</th><th style={{ width: 90 }} /></tr></thead>
            <tbody>
              {r.eett.map((e) => (
                <tr key={e.partida.id}>
                  <td>{e.partida.codigo}</td>
                  <td>{e.partida.descripcion}</td>
                  <td>{p.plantillasEett.find((x) => x.clave === e.plantilla)?.nombre ?? e.plantilla}</td>
                  <td>{e.generica ? <Insignia estado="advertencia">Genérica</Insignia> : e.partida.eettTexto ? <Insignia estado="ok">Texto propio</Insignia> : e.partida.eett ? <Insignia estado="ok">Asignada</Insignia> : <Insignia estado="neutra">Detectada</Insignia>}</td>
                  <td><button className="boton chico" onClick={() => { setPartidaSel(e.partida.id); ir('presupuesto', e.partida.id); }}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pest === 'plantillas' && (
        <div className="dividido" style={{ gridTemplateColumns: '280px 1fr' }}>
          <div className="tabla-marco">
            <table className="tabla">
              <tbody>
                {p.plantillasEett.map((x) => (
                  <tr key={x.clave} className={`clic ${x.clave === pl ? 'seleccionada' : ''}`} onClick={() => setPl(x.clave)}>
                    <td>{x.nombre}</td>
                    <td className="num apagado" style={{ width: 40 }}>{uso.get(x.clave) ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plantilla && (
            <div className="rejilla" style={{ gridTemplateColumns: '1fr' }}>
              <Campo etiqueta="Nombre">
                <EntradaTexto valor={plantilla.nombre} alCambiar={(v) => setPlantilla((x) => (x.nombre = v))} />
              </Campo>
              <Campo etiqueta="Palabras clave para detectar la plantilla" ayuda="Separadas por coma; se buscan en la descripción de la partida sin tildes">
                <EntradaTexto valor={plantilla.palabras.join(', ')} alCambiar={(v) => setPlantilla((x) => (x.palabras = v.split(',').map((s) => s.trim()).filter(Boolean)))} />
              </Campo>
              <p className="pequeno" style={{ margin: 0 }}>Variables: {'{{codigo}} {{partida}} {{unidad}} {{unidadTexto}} {{materiales}} {{equipos}} {{manoObra}}'}. Las listas salen del APU de cada partida.</p>
              {SECCIONES.map((s) => (
                <Campo key={s.k} etiqueta={s.n}>
                  <AreaTexto valor={plantilla[s.k]} filas={3} alCambiar={(v) => setPlantilla((x) => (x[s.k] = v))} />
                </Campo>
              ))}
            </div>
          )}
        </div>
      )}
      {pest === 'memoria' && (
        <>
          <div className="aviso info">Los textos libres (antecedentes, objetivo, alcance…) se editan en <button className="boton chico" onClick={() => ir('proyecto')}>Configuración general</button> (pestaña Textos). Montos, metas y plazo se completan desde el presupuesto y el programa.</div>
          <VistaDocumento d={memoriaDescriptiva(r)} />
        </>
      )}
      {pest === 'carta' && <VistaDocumento d={cartaPresentacion(r)} />}
    </div>
  );
}
