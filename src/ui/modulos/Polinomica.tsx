import { AREAS_GEOGRAFICAS } from '../../data/iu';
import { fmt } from '../../engine/util';
import type { Contexto } from '../estado';

export function ModPolinomica({ ctx }: { ctx: Contexto }) {
  const { resultados: r, proyecto: p } = ctx;
  const pol = r.polinomica;
  const regla = r.validacion.find((v) => v.regla === 10);
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Fórmula polinómica</h1>
          <p className="proposito">
            Se arma con los índices unificados del INEI (base diciembre de 2025) de cada insumo, agrupados hasta cumplir el D.S. 011-79-VC: como máximo ocho monomios, cada uno con coeficiente de al menos 0.050 y hasta tres índices; gastos generales y utilidad en un solo monomio.
          </p>
        </div>
      </div>
      {regla && regla.estado !== 'ok' && <div className={`aviso ${regla.estado}`}>{regla.hallazgos.map((h) => <div key={h.mensaje}>{h.mensaje}</div>)}</div>}
      <div className="formula" aria-label="Fórmula">
        K ={' '}
        {pol.monomios.map((m, i) => (
          <span key={m.simbolo}>
            {i > 0 && ' + '}
            {m.coeficiente.toFixed(3)} <b>({m.simbolo}r/{m.simbolo}o)</b>
          </span>
        ))}
      </div>
      <p className="pequeno" style={{ marginTop: -6 }}>
        Área geográfica {p.meta.areaGeografica}: {AREAS_GEOGRAFICAS[p.meta.areaGeografica]}. Suma de coeficientes: {pol.suma.toFixed(3)}. Base de cálculo (costo directo + gastos generales + utilidad): {fmt(pol.base)}.
      </p>
      <h2>Monomios</h2>
      <div className="tabla-marco">
        <table className="tabla">
          <thead>
            <tr><th>Símbolo</th><th className="num">Coeficiente</th><th>Índices representativos (peso dentro del monomio)</th><th>Agrupa además</th></tr>
          </thead>
          <tbody>
            {pol.monomios.map((m) => (
              <tr key={m.simbolo}>
                <td style={{ fontWeight: 650 }}>{m.simbolo}</td>
                <td className="num">{m.coeficiente.toFixed(3)}</td>
                <td>{m.indices.map((i) => `${i.iu} ${i.nombre} (${i.peso.toFixed(3)})`).join('; ')}</td>
                <td className="apagado">{m.miembros.slice(3).map((x) => x.iu).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Incidencia de cada índice</h2>
      <div className="tabla-marco">
        <table className="tabla">
          <thead>
            <tr><th>IU</th><th>Descripción</th><th className="num">Monto</th><th className="num">Incidencia</th></tr>
          </thead>
          <tbody>
            {pol.incidencias.map((i) => (
              <tr key={i.iu}><td>{i.iu}</td><td>{i.nombre}</td><td className="num">{fmt(i.monto)}</td><td className="num">{i.incidencia.toFixed(4)}</td></tr>
            ))}
            <tr><td>39</td><td>Gastos generales y utilidad</td><td className="num">{fmt(r.pie.gg + r.pie.utilidad)}</td><td className="num">{pol.base ? ((r.pie.gg + r.pie.utilidad) / pol.base).toFixed(4) : '0'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
