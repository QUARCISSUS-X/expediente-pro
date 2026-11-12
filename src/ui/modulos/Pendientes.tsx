// Centro de pendientes: una sola lista con lo que requiere atención en todos los apartados (validación, restricciones,
// materiales, calidad, consultas, cambios y riesgos), con el enlace al módulo o a la ficha de la partida.
import { useMemo, useState } from 'react';
import { hoyIso } from '../../engine/control';
import { centroPendientes } from '../../engine/integracion';
import { Insignia } from '../componentes';
import type { Contexto, ModuloId } from '../estado';
import { NAV } from './registro';

export function ModPendientes({ ctx }: { ctx: Contexto }) {
  const r = ctx.resultados;
  const hoy = hoyIso();
  const lista = useMemo(() => centroPendientes(r, hoy), [r, hoy]);
  const [grupo, setGrupo] = useState('');
  const grupos = [...new Set(lista.map((x) => x.grupo))];
  const visibles = lista.filter((x) => !grupo || x.grupo === grupo);
  const nombreModulo = new Map(NAV.flatMap((g) => g.items.map((m) => [m.id, m.texto])));
  const codigo = new Map(r.hojas.map((h) => [h.partida.id, h.partida.codigo]));
  const n = (nivel: string) => lista.filter((x) => x.nivel === nivel).length;
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Centro de pendientes</h1>
          <p className="proposito">Todo lo que requiere atención en el expediente y en la obra, en una sola lista: reglas de consistencia, restricciones (también las automáticas), materiales atrasados o por pedir, protocolos sin firmar, productos no conformes, consultas vencidas, cambios por aprobar y riesgos críticos.</p>
        </div>
      </div>
      <div className="fila-flex" style={{ marginBottom: 10 }}>
        <Insignia estado={n('error') ? 'error' : 'ok'}>{n('error')} urgentes</Insignia>
        <Insignia estado={n('advertencia') ? 'advertencia' : 'neutra'}>{n('advertencia')} por atender</Insignia>
        <Insignia estado="neutra">{n('info')} informativos</Insignia>
        <span className="separador" />
        <select className="entrada" style={{ width: 220 }} value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Filtrar por apartado">
          <option value="">Todos los apartados</option>
          {grupos.map((g) => <option key={g} value={g}>{g} ({lista.filter((x) => x.grupo === g).length})</option>)}
        </select>
      </div>
      {!visibles.length ? <div className="vacio"><p>No hay pendientes. {r.proyecto.control ? '' : 'Cuando registre el control de obra, aquí aparecerán también las restricciones, los materiales, la calidad y las consultas.'}</p></div> : (
        <div className="tabla-marco" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <table className="tabla" aria-label="Pendientes">
            <thead><tr><th style={{ width: 90 }}>Nivel</th><th style={{ width: 150 }}>Apartado</th><th>Pendiente</th><th style={{ width: 90 }}>Partida</th><th style={{ width: 100 }}>Fecha</th><th style={{ width: 170 }} /></tr></thead>
            <tbody>
              {visibles.map((x, k) => (
                <tr key={k} className={x.nivel === 'error' ? 'lista-no' : undefined}>
                  <td><Insignia estado={x.nivel === 'error' ? 'error' : x.nivel === 'advertencia' ? 'advertencia' : 'neutra'}>{x.nivel === 'error' ? 'Urgente' : x.nivel === 'advertencia' ? 'Atender' : 'Info'}</Insignia></td>
                  <td>{x.grupo}</td>
                  <td style={{ whiteSpace: 'normal' }}>{x.texto}</td>
                  <td>{x.partidaId ? <button className="boton chico" onClick={() => ctx.abrirFicha(x.partidaId!)}>{codigo.get(x.partidaId) ?? 'ver'}</button> : ''}</td>
                  <td className="pequeno">{x.fecha ?? ''}</td>
                  <td><button className="boton chico" onClick={() => ctx.ir(x.modulo as ModuloId)}>{nombreModulo.get(x.modulo as ModuloId) ?? 'Abrir'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
