// Recorrido inicial: guía paso a paso por el flujo de trabajo (configurar, presupuestar, programar, validar, exportar y
// controlar la obra). Se ofrece solo en proyectos nuevos sin partidas y se puede abrir otra vez con el botón «?».
import { useState } from 'react';
import type { Contexto, ModuloId } from './estado';

const CLAVE = 'expediente-pro:recorrido-visto';

export const PASOS_RECORRIDO: { modulo: ModuloId; titulo: string; texto: string }[] = [
  { modulo: 'proyecto', titulo: 'Datos del proyecto', texto: 'Nombre, cliente, ubicación, fecha de precios, moneda, plazo y logos. Todo lo demás (documentos, encabezados, cronograma) los toma de aquí.' },
  { modulo: 'banco', titulo: 'Banco de datos', texto: 'Sus insumos, precios con fecha y análisis reutilizables. Importe listas de precios o un banco .epdb; el proyecto toma de aquí y devuelve lo afinado.' },
  { modulo: 'presupuesto', titulo: 'Presupuesto, APU y metrados', texto: 'Títulos y partidas, análisis de precios unitarios y planilla de metrados (acepta fórmulas). Use la biblioteca para traer partidas completas.' },
  { modulo: 'programa', titulo: 'Cronograma', texto: 'Duraciones y predecesoras con ruta crítica. Del cronograma salen el valorizado, los calendarios y la curva S.' },
  { modulo: 'validacion', titulo: 'Validación', texto: 'Quince reglas de consistencia y la revisión de integridad. Corrija lo marcado antes de entregar.' },
  { modulo: 'exportar', titulo: 'Entregables', texto: 'Excel con fórmulas, PDF consolidado, Word de memoria y especificaciones, MS Project y el ZIP completo.' },
  { modulo: 'control', titulo: 'Control de obra', texto: 'Congele la línea base y registre cortes de avance: valor ganado, Last Planner, calidad, logística y los informes de obra semanales y mensuales.' },
];

export function recorridoVisto(): boolean {
  try { return localStorage.getItem(CLAVE) === '1'; } catch { return true; }
}
const marcarVisto = () => { try { localStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento */ } };

export function Recorrido({ ctx, alCerrar }: { ctx: Contexto; alCerrar: () => void }) {
  const [i, setI] = useState(0);
  const p = PASOS_RECORRIDO[i];
  const cerrar = () => { marcarVisto(); alCerrar(); };
  return (
    <div className="recorrido" role="dialog" aria-label="Recorrido inicial" aria-live="polite">
      <div className="pasos">Paso {i + 1} de {PASOS_RECORRIDO.length}</div>
      <h3>{p.titulo}</h3>
      <p>{p.texto}</p>
      <div className="fila-flex" style={{ gap: 6 }}>
        <button className="boton chico primario" onClick={() => ctx.ir(p.modulo)}>Ir a {p.titulo.toLowerCase()}</button>
        <span className="separador" />
        {i > 0 && <button className="boton chico" onClick={() => setI(i - 1)}>Anterior</button>}
        {i < PASOS_RECORRIDO.length - 1 ? <button className="boton chico" onClick={() => { setI(i + 1); ctx.ir(PASOS_RECORRIDO[i + 1].modulo); }}>Siguiente</button> : <button className="boton chico" onClick={cerrar}>Terminar</button>}
        <button className="boton chico" onClick={cerrar} aria-label="Cerrar el recorrido">Cerrar</button>
      </div>
    </div>
  );
}
