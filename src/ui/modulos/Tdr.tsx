import { ENTREGABLES_BASE } from '../../data/proyectos';
import { NOMBRE_DOC } from '../../engine/documentos';
import type { DocKey, EntregableTdR } from '../../engine/types';
import { uid } from '../../engine/util';
import { AreaTexto, Campo, EntradaTexto, IconoMas, Insignia, TablaEditable } from '../componentes';
import type { Contexto } from '../estado';

const OPCIONES = [{ valor: '', texto: '— Sin asignar —' }, ...(Object.keys(NOMBRE_DOC) as DocKey[]).map((k) => ({ valor: k, texto: NOMBRE_DOC[k] }))];

const EXTRA_PUBLICO: { descripcion: string; documento: DocKey }[] = [
  { descripcion: 'Fórmula polinómica', documento: 'polinomica' },
  { descripcion: 'Calendario de utilización de equipos', documento: 'equipos' },
  { descripcion: 'Cronograma de desembolsos', documento: 'desembolsos' },
  { descripcion: 'Planos de ejecución de obra', documento: 'externo' },
  { descripcion: 'Estudio de mecánica de suelos', documento: 'externo' },
];
const EXTRA_PRIVADO: { descripcion: string; documento: DocKey }[] = [
  { descripcion: 'Carta de presentación de la oferta', documento: 'carta' },
  { descripcion: 'Histograma de personal', documento: 'personal' },
  { descripcion: 'Calendario de utilización de equipos', documento: 'equipos' },
];

export function ModTdr({ ctx }: { ctx: Contexto }) {
  const { proyecto: p, actualizar } = ctx;
  const ent = p.tdr.entregables;
  const set = (i: number, f: (e: EntregableTdR) => void) => actualizar((d) => f(d.tdr.entregables[i] as EntregableTdR));
  const cargarTipicos = () =>
    actualizar((d) => {
      const extra = d.meta.modo === 'publico' ? EXTRA_PUBLICO : EXTRA_PRIVADO;
      for (const e of [...ENTREGABLES_BASE, ...extra]) {
        if (d.tdr.entregables.some((x) => x.descripcion.toLowerCase() === e.descripcion.toLowerCase())) continue;
        d.tdr.entregables.push({ id: uid('tdr'), descripcion: e.descripcion, documento: e.documento, obligatorio: true, observacion: e.documento === 'externo' ? 'Lo proporciona el cliente o un especialista' : '' });
      }
    });
  const pendientes = ent.filter((e) => e.obligatorio && !e.documento).length;
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Términos de referencia</h1>
          <p className="proposito">Copie aquí cada entregable que exige el TdR o la norma y asígnele el documento del expediente que lo cubre. La matriz de cumplimiento se genera con esta lista.</p>
        </div>
      </div>
      <div className="rejilla">
        <Campo etiqueta="Título del TdR o requerimiento" className="ancho-total">
          <EntradaTexto valor={p.tdr.titulo} alCambiar={(v) => actualizar((d) => { d.tdr.titulo = v; })} />
        </Campo>
        <Campo etiqueta="Resumen del alcance" className="ancho-total">
          <AreaTexto valor={p.tdr.resumen} filas={3} alCambiar={(v) => actualizar((d) => { d.tdr.resumen = v; })} />
        </Campo>
      </div>
      <div className="fila-flex" style={{ margin: '22px 0 10px' }}>
        <h2 style={{ margin: 0 }}>Entregables exigidos</h2>
        {pendientes > 0 ? <Insignia estado="error">{pendientes} sin documento</Insignia> : ent.length ? <Insignia estado="ok">Todos asignados</Insignia> : null}
        <span className="separador" />
        <button className="boton" onClick={cargarTipicos}>Agregar entregables típicos</button>
        <button className="boton primario" onClick={() => actualizar((d) => { d.tdr.entregables.push({ id: uid('tdr'), descripcion: '', documento: '', obligatorio: true, observacion: '' }); })}>
          <IconoMas /> Agregar entregable
        </button>
      </div>
      <TablaEditable
        etiqueta="Entregables del TdR"
        filas={ent}
        clave={(e) => e.id}
        alEliminar={(_, i) => actualizar((d) => { d.tdr.entregables.splice(i, 1); })}
        vacio={<div className="vacio" style={{ border: 0 }}><p>Aún no hay entregables. Agregue los típicos y luego ajuste la lista al TdR.</p><button className="boton" onClick={cargarTipicos}>Agregar entregables típicos</button></div>}
        columnas={[
          { clave: 'n', titulo: 'N°', ancho: 40, valor: (_, i) => i + 1 },
          { clave: 'd', titulo: 'Entregable exigido', valor: (e) => e.descripcion, cambiar: (_, v, i) => set(i, (e) => (e.descripcion = String(v))), placeholder: 'Escriba el entregable tal como figura en el TdR' },
          { clave: 'doc', titulo: 'Documento del expediente', tipo: 'select', ancho: 270, opciones: OPCIONES, valor: (e) => e.documento, cambiar: (_, v, i) => set(i, (e) => (e.documento = v as DocKey | '')) },
          { clave: 'o', titulo: 'Obligatorio', tipo: 'casilla', ancho: 90, valor: (e) => e.obligatorio, cambiar: (_, v, i) => set(i, (e) => (e.obligatorio = !!v)) },
          { clave: 'obs', titulo: 'Observación o responsable', ancho: 240, valor: (e) => e.observacion ?? '', cambiar: (_, v, i) => set(i, (e) => (e.observacion = String(v))) },
          {
            clave: 'est',
            titulo: 'Estado',
            ancho: 110,
            valor: (e) => e.documento,
            formato: (e) => (!e.documento ? <Insignia estado={e.obligatorio ? 'error' : 'neutra'}>Pendiente</Insignia> : e.documento === 'externo' ? <Insignia estado="neutra">Externo</Insignia> : <Insignia estado="ok">Se genera</Insignia>),
          },
        ]}
      />
    </div>
  );
}
