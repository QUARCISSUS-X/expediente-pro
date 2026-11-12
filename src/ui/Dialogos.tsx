// Ventanas de la barra de herramientas: biblioteca, búsqueda, calculadoras, nuevo proyecto y atajos.
import { useEffect, useMemo, useState } from 'react';
import type { AnalisisBanco, Banco } from '../engine/banco';
import { agregarAnalisis } from './BancoDialogos';
import { leerBanco } from './bancoAlmacen';
import { PARAMETROS_MO_2026, tarifasMO, type ParametrosMO } from '../data/manoObra';
import { fmt, redondear } from '../engine/util';
import { agregarPartida } from './arbol';
import { Campo, EntradaNumero, Modal } from './componentes';
import { escritorio } from './escritorio';
import type { Contexto } from './estado';

export function Dialogos({ ctx, alNuevo }: { ctx: Contexto; alNuevo: (tipo: 'blanco' | 'ejemplo' | 'importar') => void }) {
  const cerrar = () => ctx.abrirDialogo(null);
  switch (ctx.dialogo) {
    case 'biblioteca': return <Biblioteca ctx={ctx} alCerrar={cerrar} />;
    case 'buscar': return <Buscar ctx={ctx} alCerrar={cerrar} />;
    case 'calculadoraHH': return <CalculadoraHH ctx={ctx} alCerrar={cerrar} />;
    case 'cuadrilla': return <CalculadoraCuadrilla ctx={ctx} alCerrar={cerrar} />;
    case 'nuevo': return <NuevoProyecto alCerrar={cerrar} alElegir={(t) => { cerrar(); alNuevo(t); }} />;
    case 'atajos': return <Atajos alCerrar={cerrar} />;
    default: return null;
  }
}

// ------------------------------------------------------------ biblioteca

/** Partidas con su análisis de referencia, tomadas del banco de datos (la biblioteca del programa es su contenido inicial). */
function Biblioteca({ ctx, alCerrar }: { ctx: Contexto; alCerrar: () => void }) {
  const [q, setQ] = useState('');
  const [banco, setBanco] = useState<Banco | null>(null);
  useEffect(() => { void leerBanco().then(setBanco); }, []);
  const destino = ctx.proyecto.partidas.find((x) => x.id === ctx.partidaSel) ?? null;
  const lista = (banco?.analisis ?? []).filter((b) => (b.descripcion + ' ' + b.especialidad).toLowerCase().includes(q.toLowerCase()));
  const grupos = [...new Set(lista.map((b) => b.especialidad))];
  const elegir = (a: AnalisisBanco) => banco && agregarAnalisis(ctx, banco, a);
  return (
    <Modal titulo="Biblioteca de partidas" alCerrar={alCerrar}>
      <p className="pequeno" style={{ marginTop: 0 }}>
        Partidas del banco de datos con su análisis (rendimiento y cuadrilla). Se agrega {destino ? (destino.titulo ? `dentro de ${destino.codigo} ${destino.descripcion}` : `después de ${destino.codigo}`) : 'al final del presupuesto'}; los insumos que falten se toman del banco con su precio vigente. Ajuste rendimientos y precios a su obra.
      </p>
      <input className="entrada" style={{ width: '100%', marginBottom: 12 }} placeholder="Buscar partida…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Buscar partida" />
      {!banco && <p>Leyendo el banco…</p>}
      {grupos.map((g) => (
        <div key={g}>
          <h3>{g}</h3>
          <div className="tabla-marco">
            <table className="tabla">
              <tbody>
                {lista.filter((b) => b.especialidad === g).map((b) => (
                  <tr key={b.codigo}>
                    <td>{b.descripcion}</td>
                    <td style={{ width: 50 }}>{b.unidad}</td>
                    <td style={{ width: 110 }} className="pequeno">{b.rendimiento} {b.unidad}/día</td>
                    <td style={{ width: 92 }}><button className="boton chico" onClick={() => elegir(b)}>Agregar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Modal>
  );
}

// ------------------------------------------------------------ buscar

function Buscar({ ctx, alCerrar }: { ctx: Contexto; alCerrar: () => void }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const partidas = t ? ctx.proyecto.partidas.filter((x) => `${x.codigo} ${x.descripcion}`.toLowerCase().includes(t)).slice(0, 40) : [];
  const insumos = t ? ctx.proyecto.insumos.filter((x) => `${x.codigo} ${x.descripcion}`.toLowerCase().includes(t)).slice(0, 40) : [];
  const ordenadas = [...partidas].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  return (
    <Modal titulo="Buscar en el proyecto" alCerrar={alCerrar}>
      <input className="entrada" style={{ width: '100%', marginBottom: 12 }} placeholder="Código o descripción de partida o insumo…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Buscar" />
      {t && !partidas.length && !insumos.length && <p className="pequeno">Sin resultados para “{q}”.</p>}
      {ordenadas.length > 0 && (
        <>
          <h3>Partidas y títulos ({partidas.length})</h3>
          <div className="tabla-marco">
            <table className="tabla">
              <tbody>
                {ordenadas.map((x) => (
                  <tr key={x.id} className="clic" onClick={() => { ctx.ir('presupuesto', x.id); alCerrar(); }}>
                    <td style={{ width: 96 }} className="arbol-codigo">{x.codigo}</td>
                    <td style={{ fontWeight: x.titulo ? 600 : undefined }}>{x.descripcion}</td>
                    <td style={{ width: 50 }}>{x.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {insumos.length > 0 && (
        <>
          <h3>Insumos ({insumos.length})</h3>
          <div className="tabla-marco">
            <table className="tabla">
              <tbody>
                {insumos.map((x) => (
                  <tr key={x.codigo} className="clic" onClick={() => { ctx.setConsultaInsumo(x.codigo); ctx.ir('insumos'); alCerrar(); }}>
                    <td style={{ width: 96 }} className="arbol-codigo">{x.codigo}</td>
                    <td>{x.descripcion}</td>
                    <td style={{ width: 50 }}>{x.unidad}</td>
                    <td style={{ width: 90 }} className="num">{fmt(x.precio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------ calculadora de hora-hombre

function CalculadoraHH({ ctx, alCerrar }: { ctx: Contexto; alCerrar: () => void }) {
  const { actualizar, avisar, proyecto: p } = ctx;
  const [pmo, setPmo] = useState<ParametrosMO>({ ...PARAMETROS_MO_2026, horasJornada: p.meta.jornadaHoras || 8 });
  const tar = tarifasMO(pmo);
  const aplicar = () => {
    let n = 0;
    actualizar((d) => {
      for (const i of d.insumos) {
        if (i.tipo !== 'MO') continue;
        const t = i.descripcion.toLowerCase();
        let precio: number | null = null;
        if (t.includes('capataz')) precio = tar.capataz;
        else if (t.includes('oficial')) precio = tar.oficial;
        else if (t.includes('peón') || t.includes('peon') || t.includes('vigía') || t.includes('vigia')) precio = tar.peon;
        else if (t.includes('operario') || t.includes('operador') || t.includes('topógrafo') || t.includes('topografo')) precio = tar.operario;
        if (precio !== null) {
          i.precio = precio;
          i.fuente = 'Calculadora HH (parámetros del proyecto)';
          i.fechaPrecio = new Date().toISOString().slice(0, 10);
          n++;
        }
      }
    });
    avisar(`Se actualizó el precio de ${n} insumos de mano de obra.`);
    alCerrar();
  };
  return (
    <Modal titulo="Costo de hora-hombre (construcción civil)" alCerrar={alCerrar} pie={<><button className="boton" onClick={alCerrar}>Cerrar</button><button className="boton primario" onClick={aplicar}>Aplicar a la mano de obra del catálogo</button></>}>
      <p className="pequeno" style={{ marginTop: 0, maxWidth: '80ch' }}>
        Jornales básicos 2026 del convenio de construcción civil. BUC, leyes sociales y movilidad son editables: contrástelos con la Revista Costos o la tabla CAPECO antes de aplicarlos.
      </p>
      <div className="rejilla">
        {([
          ['jornalOperario', 'Jornal básico operario'],
          ['jornalOficial', 'Jornal básico oficial'],
          ['jornalPeon', 'Jornal básico peón'],
          ['bucOperario', 'BUC operario (%)'],
          ['bucOficial', 'BUC oficial (%)'],
          ['bucPeon', 'BUC peón (%)'],
          ['leyesSociales', 'Leyes sociales (% del jornal básico)'],
          ['movilidadDiaria', 'Movilidad por día'],
          ['horasJornada', 'Horas por jornada'],
        ] as [keyof ParametrosMO, string][]).map(([k, e]) => (
          <Campo key={k} etiqueta={e}>
            <EntradaNumero valor={pmo[k]} alCambiar={(v) => setPmo({ ...pmo, [k]: v ?? 0 })} />
          </Campo>
        ))}
      </div>
      <div className="cifras" style={{ marginTop: 12, borderBottom: 0 }}>
        <div><span>Operario (hh)</span><strong>{fmt(tar.operario)}</strong></div>
        <div><span>Oficial (hh)</span><strong>{fmt(tar.oficial)}</strong></div>
        <div><span>Peón (hh)</span><strong>{fmt(tar.peon)}</strong></div>
        <div><span>Capataz (hh)</span><strong>{fmt(tar.capataz)}</strong></div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ calculadora de cuadrilla y rendimiento

function CalculadoraCuadrilla({ ctx, alCerrar }: { ctx: Contexto; alCerrar: () => void }) {
  const sel = ctx.proyecto.partidas.find((x) => x.id === ctx.partidaSel && !x.titulo) ?? null;
  const apu = sel ? ctx.proyecto.apus[sel.id] : undefined;
  const metradoSel = sel ? ctx.resultados.metradoPorPartida[sel.id] ?? 0 : 0;
  const [metrado, setMetrado] = useState<number>(metradoSel || 100);
  const [rend, setRend] = useState<number>(apu?.rendimiento || 10);
  const [jornada, setJornada] = useState<number>(ctx.proyecto.meta.jornadaHoras || 8);
  const [plazo, setPlazo] = useState<number>(10);
  const [cuad, setCuad] = useState<number>(1);
  const filas = useMemo(() => {
    if (!apu) return [];
    const ins = new Map(ctx.proyecto.insumos.map((i) => [i.codigo, i]));
    return apu.items
      .filter((it) => it.cuadrilla !== null && it.cuadrilla !== undefined && (ins.get(it.insumo)?.tipo === 'MO' || ins.get(it.insumo)?.tipo === 'EQ'))
      .map((it) => ({ codigo: it.insumo, descripcion: ins.get(it.insumo)?.descripcion ?? it.insumo, unidad: ins.get(it.insumo)?.unidad ?? '', cuadrilla: Number(it.cuadrilla) }));
  }, [apu, ctx.proyecto.insumos]);
  const duracion = rend > 0 ? Math.ceil(metrado / (rend * Math.max(1, cuad))) : 0;
  const cuadNecesarias = rend > 0 && plazo > 0 ? Math.ceil(metrado / (rend * plazo)) : 0;
  const aplicar = () => {
    if (!sel) return;
    ctx.actualizar((d) => {
      const a = d.apus[sel.id] ?? (d.apus[sel.id] = { rendimiento: rend, items: [] });
      a.rendimiento = rend;
      const pr = d.programa[sel.id] ?? (d.programa[sel.id] = { cuadrillas: 1, duracionManual: null, predecesoras: [] });
      pr.cuadrillas = Math.max(1, cuad);
    });
    ctx.avisar(`Rendimiento ${fmt(rend)} ${sel.unidad}/día y ${cuad} cuadrilla(s) aplicados a ${sel.codigo}.`);
    alCerrar();
  };
  return (
    <Modal
      titulo="Rendimiento, cuadrilla y duración"
      alCerrar={alCerrar}
      pie={<><button className="boton" onClick={alCerrar}>Cerrar</button>{sel && <button className="boton primario" onClick={aplicar}>Aplicar a {sel.codigo}</button>}</>}
    >
      <p className="pequeno" style={{ marginTop: 0 }}>
        {sel ? `Partida ${sel.codigo} ${sel.descripcion} (${sel.unidad}).` : 'Seleccione una partida en el presupuesto para usar su APU y aplicar el resultado.'} Cantidad del recurso = cuadrilla × jornada ÷ rendimiento.
      </p>
      <div className="rejilla">
        <Campo etiqueta={`Metrado (${sel?.unidad ?? 'und'})`}><EntradaNumero valor={metrado} alCambiar={(v) => setMetrado(v ?? 0)} /></Campo>
        <Campo etiqueta={`Rendimiento (${sel?.unidad ?? 'und'}/día)`}><EntradaNumero valor={rend} decimales={4} alCambiar={(v) => setRend(v ?? 0)} /></Campo>
        <Campo etiqueta="Jornada (h/día)"><EntradaNumero valor={jornada} alCambiar={(v) => setJornada(v ?? 8)} /></Campo>
        <Campo etiqueta="Cuadrillas en paralelo"><EntradaNumero valor={cuad} decimales={0} alCambiar={(v) => setCuad(Math.max(1, v ?? 1))} /></Campo>
        <Campo etiqueta="Plazo deseado (días)" ayuda="Para calcular cuántas cuadrillas se necesitan"><EntradaNumero valor={plazo} decimales={0} alCambiar={(v) => setPlazo(v ?? 0)} /></Campo>
      </div>
      <div className="cifras" style={{ marginTop: 12 }}>
        <div><span>Duración con {cuad} cuadrilla(s)</span><strong>{duracion} {duracion === 1 ? 'día' : 'días'}</strong></div>
        <div><span>Cuadrillas para {plazo} días</span><strong>{cuadNecesarias}</strong></div>
        <div><span>Producción diaria</span><strong>{fmt(rend * Math.max(1, cuad))} {sel?.unidad ?? ''}/día</strong></div>
      </div>
      {filas.length > 0 && (
        <div className="tabla-marco">
          <table className="tabla">
            <thead><tr><th>Código</th><th>Recurso</th><th>Und</th><th className="num">Cuadrilla</th><th className="num">Cantidad por {sel?.unidad}</th><th className="num">Total para el metrado</th></tr></thead>
            <tbody>
              {filas.map((f) => {
                const cant = rend > 0 ? redondear((f.cuadrilla * jornada) / rend, 4) : 0;
                return (
                  <tr key={f.codigo}>
                    <td>{f.codigo}</td><td>{f.descripcion}</td><td>{f.unidad}</td>
                    <td className="num">{fmt(f.cuadrilla, 4)}</td><td className="num">{fmt(cant, 4)}</td><td className="num">{fmt(cant * metrado, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------ nuevo proyecto y atajos

function NuevoProyecto({ alCerrar, alElegir }: { alCerrar: () => void; alElegir: (t: 'blanco' | 'ejemplo' | 'importar') => void }) {
  return (
    <Modal titulo="Nuevo proyecto" alCerrar={alCerrar}>
      <p style={{ marginTop: 0 }}>Se crea un proyecto nuevo e independiente en el panel de proyectos. El proyecto actual queda guardado tal como está.</p>
      <div className="salidas">
        <div className="salida">
          <h3>Proyecto en blanco</h3>
          <p>Catálogo base de insumos, plantillas de EETT y gastos generales típicos, sin partidas.</p>
          <button className="boton primario" onClick={() => alElegir('blanco')}>Empezar en blanco</button>
        </div>
        <div className="salida">
          <h3>Proyecto de ejemplo</h3>
          <p>Cierre de bocaminas y rehabilitación de un depósito de desmonte, completo y consistente.</p>
          <button className="boton" onClick={() => alElegir('ejemplo')}>Crear desde el ejemplo</button>
        </div>
        <div className="salida">
          <h3>Importar un expediente existente</h3>
          <p>Elija juntos los archivos del expediente: presupuesto con APU e insumos de S10 o Excel (.xlsx), planilla de metrados (.xlsx), cronograma de MS Project guardado como XML y especificaciones técnicas (.docx). También abre un proyecto .json o una plantilla de carga.</p>
          <button className="boton" onClick={() => alElegir('importar')}>Elegir archivos</button>
        </div>
      </div>
    </Modal>
  );
}

function Atajos({ alCerrar }: { alCerrar: () => void }) {
  const filas: [string, string][] = [
    ['Ctrl + S', 'Guardar una copia del proyecto (.json)'],
    ['Ctrl + Z / Ctrl + Y', 'Deshacer / rehacer'],
    ['Ctrl + F', 'Buscar partidas e insumos'],
    ['Insert', 'Agregar partida (en el presupuesto)'],
    ['Alt + ↑ / Alt + ↓', 'Subir / bajar la fila seleccionada'],
    ['Alt + → / Alt + ←', 'Aumentar / disminuir nivel'],
    ['Supr', 'Eliminar la fila seleccionada (en el presupuesto)'],
    ['↑ / ↓ en el presupuesto', 'Seleccionar la fila anterior o siguiente'],
    ['Enter / ↓ en una tabla', 'Pasar a la celda de abajo'],
    ['Esc', 'Cancelar la edición de una celda o cerrar una ventana'],
  ];
  if (escritorio) filas.push(
    ['Ctrl + T', 'App de escritorio: pestaña nueva (proyecto en blanco, ejemplo o guardado)'],
    ['Ctrl + W', 'Cerrar la pestaña (el proyecto queda guardado)'],
    ['Ctrl + Tab / Ctrl + Shift + Tab', 'Pestaña siguiente / anterior'],
    ['Ctrl + 1 … Ctrl + 9', 'Ir a un módulo: panel, configuración, TdR, presupuesto, insumos, GG, polinómica, cronograma, valorizado'],
    ['Ctrl + D / F7 / Ctrl + E', 'Documentos / Validación / Exportar'],
    ['Alt + 1 … Alt + 4', 'Control de obra / Last Planner / Ejecución lean / Six Sigma'],
    ['Ctrl + O', 'Importar archivos'],
  );
  return (
    <Modal titulo="Atajos de teclado" alCerrar={alCerrar}>
      <div className="tabla-marco">
        <table className="tabla">
          <tbody>{filas.map(([k, v]) => <tr key={k}><td style={{ width: 200 }}><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody>
        </table>
      </div>
    </Modal>
  );
}
