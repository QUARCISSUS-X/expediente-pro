import { useState } from 'react';
import { datosCabecera } from '../../engine/cabecera';
import type { DocKey } from '../../engine/types';
import { SECCIONES_PDF } from '../../export/pdfdoc';
import type { TipoExport } from '../acciones';
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
        {tarjeta('excel', 'Presupuesto, APU y cronogramas', 'Libro editable con fórmulas vinculadas: datos, metrados, APU, relación de insumos, presupuesto, resumen de costos, gastos generales, fórmula polinómica, cronograma, valorizado, calendarios y controles. Al cambiar un metrado, rendimiento, precio o porcentaje se recalcula todo.', 'Excel .xlsx', 'xlsx')}
        {tarjeta('word', 'Especificaciones técnicas', `Carátula, control del documento, aviso, tabla de contenido, especificaciones generales y una especificación por partida (${r.eett.length}) con el orden y la codificación del presupuesto.`, 'Word .docx', 'eett')}
        {tarjeta('word', 'Memoria descriptiva', 'Generalidades, ubicación, alcance, componentes, metas, presupuesto, plazo, fórmula polinómica y firmas.', 'Word .docx', 'memoria')}
        {p.meta.modo === 'privado' && tarjeta('word', 'Carta de presentación', 'Monto en letras, plazo, validez y condiciones de la oferta, del proyectista al cliente.', 'Word .docx', 'carta')}
        {tarjeta('word', 'Matriz de cumplimiento del TdR', 'Cada entregable exigido y el documento que lo cubre.', 'Word .docx', 'matriz')}
        {tarjeta('word', 'Reporte de consistencia', 'Resultado de las 15 reglas con sus observaciones.', 'Word .docx', 'consistencia')}
        {tarjeta('pdf', 'Informe ejecutivo', 'Resumen para la gerencia o el cliente: indicadores, costo por título, composición, clasificación ABC de partidas e insumos, curva S y estado de consistencia, con gráficos.', 'PDF', 'ejecutivo')}
        {tarjeta('excel', 'Reporte gerencial', 'Las mismas tablas del informe ejecutivo en hojas de Excel, con el detalle completo de la clasificación ABC.', 'Excel .xlsx', 'gerencial')}
        {tarjeta('msproject', 'Cronograma de ejecución', 'Actividades con la codificación del presupuesto, duraciones, predecesoras y calendario para abrir en MS Project.', 'MS Project .xml', 'msp')}
        {tarjeta('guardar', 'Proyecto', 'Archivo de trabajo para volver a abrirlo en este programa o en otra computadora.', 'Expediente Pro .json', 'json')}
        {tarjeta('importar', 'Plantilla de carga', 'Este proyecto en hojas de Excel simples (partidas, metrados, APU, insumos, GG, TdR) para editarlo fuera y cargarlo de nuevo.', 'Excel .xlsx', 'plantilla')}
        {tarjeta('importar', 'Formato compacto', 'Todo el proyecto en un texto corto (partidas con su APU, metrados, insumos, GG, TdR y textos). Se edita con cualquier editor y se vuelve a abrir con Importar.', 'Texto .exp.txt', 'compacto')}
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
