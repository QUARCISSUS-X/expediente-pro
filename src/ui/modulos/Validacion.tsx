import { useMemo, useState } from 'react';
import { repararIntegridad, resumenIntegridad, revisarIntegridad } from '../../engine/integridad';
import { fmt } from '../../engine/util';
import { Insignia } from '../componentes';
import type { Contexto, ModuloId } from '../estado';

const DESTINO: Record<number, ModuloId> = {
  1: 'presupuesto', 2: 'presupuesto', 3: 'presupuesto', 4: 'insumos', 5: 'insumos', 6: 'cronogramas', 7: 'gg', 8: 'cronogramas',
  9: 'cronogramas', 10: 'polinomica', 11: 'gg', 12: 'presupuesto', 13: 'proyecto', 14: 'programa', 15: 'tdr',
};

const EXPLICACION: Record<number, string> = {
  1: 'La suma de partidas es igual al costo directo y la jerarquía de códigos es correcta.',
  2: 'El precio unitario de cada partida es exactamente la suma de su análisis.',
  3: 'Cada partida tiene metrado con sustento, APU, especificación técnica y lugar en el programa.',
  4: 'Cada insumo existe una sola vez en el catálogo, con precio e índice unificado.',
  5: 'La relación de insumos suma el costo directo (salvo redondeo de los APU).',
  6: 'El cronograma valorizado suma el costo directo y llega al 100 %.',
  7: 'El plazo del programa es el mismo que usan los gastos generales variables.',
  8: 'El calendario de compras cuadra con la relación de insumos y se compra antes de usar.',
  9: 'Las horas-hombre del histograma coinciden con las de los APU.',
  10: 'La fórmula polinómica cumple el D.S. 011-79-VC.',
  11: 'El pie de presupuesto cuadra y usa el desagregado de gastos generales.',
  12: 'Cada partida tiene una unidad válida, la misma del metrado y de su especificación.',
  13: 'La memoria no tiene cifras escritas a mano que contradigan el presupuesto o el plazo.',
  14: 'Las precedencias no forman ciclos y las actividades están encadenadas.',
  15: 'Cada entregable exigido por el TdR está cubierto por un documento.',
};

export function ModValidacion({ ctx }: { ctx: Contexto }) {
  const { resultados: r, proyecto: p, ir } = ctx;
  const [abiertas, setAbiertas] = useState<Set<number>>(() => new Set(r.validacion.filter((v) => v.estado !== 'ok').map((v) => v.regla)));
  const s = r.resumenValidacion;
  const porCodigo = new Map(p.partidas.map((x) => [x.codigo, x.id]));
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Validación</h1>
          <p className="proposito">Quince controles de consistencia del expediente y una revisión de la integridad de los datos, que se recalculan con cada cambio. Un error impide que el expediente sea consistente; una advertencia pide revisión.</p>
        </div>
      </div>
      <div className="cifras">
        <div><span>Conformes</span><strong style={{ color: 'var(--patina)' }}>{s.ok}</strong></div>
        <div><span>Con advertencias</span><strong style={{ color: 'var(--ocre)' }}>{s.advertencias}</strong></div>
        <div><span>Con errores</span><strong style={{ color: 'var(--sello)' }}>{s.errores}</strong></div>
      </div>
      <Integridad ctx={ctx} />
      {p.origen && <ObservacionesOrigen ctx={ctx} />}
      <h2>Reglas de consistencia</h2>
      <div className="reglas">
        {r.validacion.map((v) => {
          const abierta = abiertas.has(v.regla);
          return (
            <div className="regla" key={v.regla}>
              <button
                aria-expanded={abierta}
                onClick={() => setAbiertas((a) => { const n = new Set(a); if (n.has(v.regla)) n.delete(v.regla); else n.add(v.regla); return n; })}
              >
                <span className="num">{v.regla}</span>
                <span>
                  <strong style={{ fontWeight: 620 }}>{v.control}</strong>
                  <span className="pequeno" style={{ display: 'block' }}>{EXPLICACION[v.regla]}</span>
                </span>
                <Insignia estado={v.estado === 'ok' ? 'ok' : v.estado}>{v.estado === 'ok' ? 'Conforme' : v.estado === 'error' ? 'Error' : 'Advertencia'}</Insignia>
                <span className="pequeno">{v.hallazgos.length ? `${v.hallazgos.length}` : ''}</span>
              </button>
              {abierta && v.hallazgos.length > 0 && (
                <ul>
                  {v.hallazgos.map((h, i) => (
                    <li key={i} style={{ color: h.severidad === 'error' ? 'var(--sello)' : undefined }}>
                      {h.mensaje}
                      {h.referencia && porCodigo.has(h.referencia) ? (
                        <button onClick={() => ir(DESTINO[v.regla] === 'presupuesto' || DESTINO[v.regla] === 'programa' ? DESTINO[v.regla] : 'presupuesto', porCodigo.get(h.referencia!))}>Ir a la partida</button>
                      ) : (
                        <button onClick={() => ir(DESTINO[v.regla])}>Revisar</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ObservacionesOrigen({ ctx }: { ctx: Contexto }) {
  const { proyecto: p, resultados: r } = ctx;
  const o = p.origen!;
  const [doc, setDoc] = useState('');
  const [tipo, setTipo] = useState('');
  const docs = useMemo(() => [...new Set(o.observaciones.map((x) => x.documento))], [o.observaciones]);
  const lista = o.observaciones.filter((x) => (!doc || x.documento === doc) && (!tipo || x.tipo === tipo));
  const comp: [string, number | undefined, number][] = [
    ['Costo directo', o.original.costoDirecto, r.pie.costoDirecto],
    ['Gastos generales', o.original.gg, r.pie.gg],
    ['Utilidad', o.original.utilidad, r.pie.utilidad],
    ['Subtotal', o.original.subtotal, r.pie.subtotal],
  ];
  return (
    <>
      <h2>Revisión del expediente original</h2>
      <p className="pequeno" style={{ marginTop: -4 }}>Importado el {o.fecha} desde {o.archivos.join(', ')}. Las cifras se recalcularon con este programa; las observaciones describen lo que se encontró en los documentos originales y cómo se corrigió.</p>
      <div className="cifras">
        {comp.map(([n, a, b]) => (
          <div key={n}><span>{n}: original / recalculado</span><strong>{a === undefined ? '—' : fmt(a)} / {fmt(b)}</strong></div>
        ))}
        <div><span>Plazo original / recalculado</span><strong>{o.original.plazoDias ?? '—'} / {r.programa.plazoDias} días</strong></div>
      </div>
      <div className="fila-flex" style={{ marginBottom: 8 }}>
        <select className="entrada" value={doc} onChange={(e) => setDoc(e.target.value)} aria-label="Documento">
          <option value="">Todos los documentos ({o.observaciones.length})</option>
          {docs.map((d) => <option key={d} value={d}>{d} ({o.observaciones.filter((x) => x.documento === d).length})</option>)}
        </select>
        <select className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {['Consistencia', 'Cálculo', 'Formato', 'Información'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <span className="separador" />
        <button className="boton" disabled={!!ctx.ocupado} onClick={() => ctx.exportar('informe')}>Descargar informe de revisión (Word)</button>
      </div>
      <div className="tabla-marco" style={{ maxHeight: 420, marginBottom: 18 }}>
        <table className="tabla tabla-observaciones">
          <thead><tr><th style={{ width: 150 }}>Documento</th><th style={{ width: 160 }}>Ubicación</th><th style={{ width: 96 }}>Tipo</th><th>Observación</th><th style={{ width: '30%' }}>Corrección</th></tr></thead>
          <tbody>
            {lista.map((x, i) => (
              <tr key={i}>
                <td>{x.documento}</td>
                <td>{x.ubicacion}</td>
                <td><Insignia estado={x.tipo === 'Cálculo' || x.tipo === 'Consistencia' ? 'advertencia' : x.tipo === 'Formato' ? 'neutra' : 'ok'}>{x.tipo}</Insignia></td>
                <td>{x.detalle}</td>
                <td className="pequeno">{x.correccion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Integridad de los datos: referencias rotas, repetidos y números no válidos, con reparación en un clic. */
function Integridad({ ctx }: { ctx: Contexto }) {
  const lista = useMemo(() => revisarIntegridad(ctx.proyecto), [ctx.proyecto]);
  const s = resumenIntegridad(lista);
  const reparar = () => {
    const rep = repararIntegridad(ctx.proyecto);
    const n = rep.reparados.reduce((a, x) => a + x.cantidad, 0);
    if (!n) return;
    ctx.reemplazar(rep.proyecto);
    ctx.avisar(`Se repararon ${n} datos (Ctrl+Z para deshacer).${rep.pendientes.length ? ` Quedan ${rep.pendientes.length} por corregir a mano.` : ''}`);
  };
  return (
    <>
      <h2>Integridad de los datos</h2>
      {lista.length === 0 ? (
        <div className="aviso info">El proyecto no tiene datos sueltos, repetidos ni dañados.</div>
      ) : (
        <div className="panel" style={{ padding: 14, marginBottom: 18 }}>
          <div className="fila-flex" style={{ marginBottom: 8 }}>
            <span>{s.errores} errores y {s.avisos} avisos en los datos del proyecto.</span>
            <span className="separador" />
            <button className="boton chico" onClick={() => ctx.abrirDialogo('copias')}>Versiones</button>
            {s.reparables > 0 && <button className="boton primario" onClick={reparar}>Reparar {s.reparables} automáticamente</button>}
          </div>
          <table className="tabla">
            <thead><tr><th style={{ width: 96 }}>Tipo</th><th>Problema</th><th className="num" style={{ width: 70 }}>Casos</th><th>Ejemplos</th><th style={{ width: 110 }}>Solución</th></tr></thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.clave}>
                  <td><Insignia estado={x.nivel === 'error' ? 'error' : 'advertencia'}>{x.nivel === 'error' ? 'Error' : 'Aviso'}</Insignia></td>
                  <td>{x.mensaje}</td>
                  <td className="num">{x.cantidad}</td>
                  <td className="pequeno">{x.detalle.slice(0, 4).join(' · ')}{x.cantidad > 4 ? ' …' : ''}</td>
                  <td className="pequeno">{x.reparable ? 'Automática' : 'A mano'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
