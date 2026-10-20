// Muestra en pantalla las mismas tablas que van a Excel y PDF.
import type { Bloque, Documento } from '../engine/documentos';
import { fmt } from '../engine/util';
import type { Tabla } from '../export/tablas';

export function VistaTabla({ t, alto }: { t: Tabla; alto?: string }) {
  const clase = (e?: string) => (e === 'titulo' ? 'titulo' : e === 'subtitulo' ? 'titulo-2' : e === 'total' ? 'total' : e === 'encabezado' ? 'encabezado' : e === 'separador' ? 'separador' : e === 'grupo' ? 'grupo' : undefined);
  return (
    <div className="tabla-marco" style={{ maxHeight: alto ?? 'calc(100vh - 340px)' }}>
      <table className="tabla" aria-label={t.titulo}>
        {!t.sinCabecera && (
          <thead>
            <tr>
              {t.cabecera.map((c, i) => (
                <th key={i} className={t.alinear[i] === 'r' ? 'num' : undefined} style={i === 1 ? { minWidth: 220 } : undefined}>{c}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {t.filas.map((f, fi) => {
            const celdas: React.ReactNode[] = [];
            for (let i = 0; i < t.cabecera.length; i++) {
              const comb = f.combinar?.find((c) => c.desde === i);
              const v = f.celdas[i];
              const oculto = t.ocultarCeros && i >= (t.columnasFijas ?? 0) && typeof v === 'number' && Math.abs(v) < 0.005;
              const texto = v === null || v === undefined || oculto ? '' : typeof v === 'number' && f.estilo !== 'encabezado' ? fmt(v, t.decimales[i] ?? 2) : v;
              celdas.push(
                <td key={i} colSpan={comb ? comb.hasta - comb.desde + 1 : undefined} className={[t.alinear[i] === 'r' && !comb ? 'num' : '', f.estilo === 'nota' ? 'apagado' : ''].join(' ')} style={f.estilo === 'nota' ? { fontStyle: 'italic', fontSize: 12 } : undefined}>
                  {texto}
                </td>,
              );
              if (comb) i = comb.hasta;
            }
            return <tr key={fi} className={clase(f.estilo)}>{celdas}</tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

export function VistaDocumento({ d }: { d: Documento }) {
  return (
    <div className="texto-eett" style={{ maxWidth: '86ch' }}>
      {d.bloques.map((b, i) => <BloqueVista key={i} b={b} />)}
    </div>
  );
}

function BloqueVista({ b }: { b: Bloque }) {
  switch (b.t) {
    case 'h1':
      return <h2>{b.texto}</h2>;
    case 'h2':
      return <h3 style={{ marginTop: 18 }}>{b.texto}</h3>;
    case 'h3':
      return <h4>{b.texto}</h4>;
    case 'h4':
      return <h4 style={{ color: 'var(--texto)' }}>{b.texto}</h4>;
    case 'p':
      return <p style={{ fontWeight: b.negrita ? 650 : undefined, textAlign: b.alinear === 'der' ? 'right' : b.alinear === 'just' ? 'justify' : undefined }}>{b.etiqueta ? <><strong>{b.etiqueta}:</strong> {b.texto}</> : b.texto}</p>;
    case 'firmas':
      return (
        <div className="firmas-vista">
          {b.firmas.map((f) => (
            <div key={f.rol}>
              <span className="pequeno">{f.rol}</span>
              <strong>{f.nombre || '—'}</strong>
              <span>{f.cargo}</span>
              {f.detalle && <span className="pequeno">{f.detalle}</span>}
            </div>
          ))}
        </div>
      );
    case 'lista':
      return <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>{b.items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case 'kv':
      return (
        <div className="tabla-marco" style={{ marginBottom: 10 }}>
          <table className="tabla"><tbody>{b.pares.map(([k, v]) => <tr key={k}><td style={{ width: '34%', fontWeight: 600 }}>{k}</td><td>{v}</td></tr>)}</tbody></table>
        </div>
      );
    case 'tabla':
      return (
        <div className="tabla-marco" style={{ marginBottom: 10 }}>
          <table className="tabla">
            <thead><tr>{b.cabecera.map((c) => <th key={c} className={undefined}>{c}</th>)}</tr></thead>
            <tbody>{b.filas.map((f, fi) => <tr key={fi} className={b.negritas?.includes(fi) ? 'total' : undefined}>{f.map((v, i) => <td key={i} className={b.alinear?.[i] === 'r' ? 'num' : undefined}>{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case 'firma':
      return <p style={{ textAlign: 'center', marginTop: 28 }}>______________________<br /><strong>{b.nombre}</strong><br />{b.cargo}{b.detalle ? <><br />{b.detalle}</> : null}</p>;
    default:
      return null;
  }
}
