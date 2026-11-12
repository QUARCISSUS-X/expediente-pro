import { useState } from 'react';
import { datosCabecera } from '../../engine/cabecera';
import type { DocKey } from '../../engine/types';
import { SECCIONES_PDF } from '../../export/pdfdoc';
import { EXPORTADORES, type Exportador, type TipoExport } from '../../export/registro';
import type { Contexto } from '../estado';
import { Icono } from '../iconos';

export function ModExportar({ ctx }: { ctx: Contexto }) {
  const { resultados: r, proyecto: p, ir, ocupado, exportar } = ctx;
  const [secciones, setSecciones] = useState<Set<DocKey>>(() => new Set(SECCIONES_PDF.map((s) => s.clave)));
  const errores = r.resumenValidacion.errores;
  const c = datosCabecera(p);
  const faltan = [
    !c.proyectista && 'proyectista',
    !c.cliente && 'cliente',
    !p.responsables.elaboro.nombre && 'responsable de la elaboración',
    !c.codigoDocumento && 'código del documento',
  ].filter(Boolean) as string[];

  const tarjeta = (icono: string, titulo: string, desc: string, formato: string, tipo: TipoExport) => (
    <div className="salida" key={tipo}>
      <span className="formato"><Icono n={icono} t={15} /> {formato}</span>
      <h3>{titulo}</h3>
      <p>{desc}</p>
      <button className="boton" disabled={!!ocupado} onClick={() => exportar(tipo)}>Descargar</button>
    </div>
  );

  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Exportar entregables</h1>
          <p className="proposito">Todos los archivos salen del mismo cálculo que ve en pantalla, con la carátula, los encabezados y los pies de la configuración general. Se generan en su computadora, sin conexión a internet.</p>
        </div>
        <div className="herramientas">
          <button className="boton primario" disabled={!!ocupado} onClick={() => exportar('zip')}>{ocupado ? `Generando ${ocupado}…` : 'Descargar todo (ZIP)'}</button>
        </div>
      </div>
      {errores > 0 && (
        <div className="aviso error">
          El expediente tiene {errores} regla(s) con errores de consistencia. Puede descargar los archivos, pero revise la <button className="boton chico" onClick={() => ir('validacion')}>validación</button> antes de entregarlos.
        </div>
      )}
      {faltan.length > 0 && (
        <div className="aviso advertencia">
          Faltan datos para las carátulas y encabezados: {faltan.join(', ')}. Complételos en <button className="boton chico" onClick={() => ir('proyecto')}>Configuración general</button>.
        </div>
      )}
      <div className="salidas">
        {(EXPORTADORES as readonly Exportador[]).filter((e) => e.descripcion && (!e.disponible || e.disponible(r))).map((e) => tarjeta(e.icono, e.titulo ?? e.nombre, e.descripcion!(r), e.formato, e.tipo as TipoExport))}
      </div>

      <h2>Expediente consolidado en PDF</h2>
      <p className="pequeno" style={{ marginTop: -4 }}>Carátula, control del documento, índice, secciones elegidas y foliación {p.meta.foliacion}. Las tablas anchas pasan a páginas horizontales.</p>
      <div className="panel" style={{ padding: 14 }}>
        <div className="rejilla" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6 }}>
          {SECCIONES_PDF.filter((s) => !(s.clave === 'carta' && p.meta.modo === 'publico') && !(s.clave === 'flete' && !p.meta.fleteTarifaTon)).map((s) => (
            <label key={s.clave} className="casilla">
              <input
                type="checkbox"
                checked={secciones.has(s.clave)}
                onChange={(e) => setSecciones((x) => { const n = new Set(x); if (e.target.checked) n.add(s.clave); else n.delete(s.clave); return n; })}
              />
              {s.nombre}
            </label>
          ))}
        </div>
        <div className="fila-flex" style={{ marginTop: 12 }}>
          <button className="boton primario" disabled={!!ocupado || secciones.size === 0} onClick={() => exportar('pdf', [...secciones])}>
            {ocupado ? `Generando ${ocupado}…` : 'Descargar PDF consolidado'}
          </button>
          <button className="boton chico" onClick={() => setSecciones(new Set(SECCIONES_PDF.map((s) => s.clave)))}>Marcar todo</button>
          <button className="boton chico" onClick={() => setSecciones(new Set())}>Desmarcar todo</button>
        </div>
      </div>
    </div>
  );
}
