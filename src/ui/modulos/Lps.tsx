// Last Planner System: plan maestro e hitos, planificación por fases (pull), lookahead, restricciones, plan semanal y PPC.
import { useMemo, useState } from 'react';
import {
  calcularPpc, CAUSAS_NO_CUMPLIMIENTO, causasNoCumplimiento, type Compromiso, compromisosSugeridos, type CompromisoFase, type Hito,
  hitosDesdeCronograma, hoyIso, lookahead, lunesDe, programarFase, type Restriccion, resumenRestricciones, TIPOS_RESTRICCION,
} from '../../engine/control';
import { fmt, num, sumarDias, uid } from '../../engine/util';
import { tablaPpc } from '../../export/control';
import { Campo, EntradaTexto, IconoMas, Insignia, Pestanas, TablaEditable } from '../componentes';
import { fc, fechaCortaDM, opciones, opcionesFrentes, opcionesPartidas, pct, useControl } from '../control';
import type { Contexto } from '../estado';
import { restriccionesAutomaticas } from '../../engine/integracion';
import { COLOR, GraficoBarras, GraficoPareto, Indicador } from '../graficos';
import { VistaTabla } from '../VistaTabla';

type Pest = 'maestro' | 'fases' | 'lookahead' | 'restricciones' | 'semanal' | 'ppc';

export function ModLps({ ctx }: { ctx: Contexto }) {
  const [pest, setPest] = useState<Pest>('lookahead');
  const { c } = useControl(ctx);
  const rs = resumenRestricciones(c);
  const ppc = calcularPpc(c);
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Last Planner System</h1>
          <p className="proposito">Planificación colaborativa: del plan maestro a los hitos, de los hitos a las fases, de las fases al lookahead sin restricciones y del lookahead a los compromisos de cada semana, medidos con el PPC.</p>
        </div>
      </div>
      <Pestanas
        valor={pest}
        alCambiar={setPest}
        opciones={[
          { id: 'maestro', texto: 'Plan maestro e hitos' },
          { id: 'fases', texto: 'Planificación por fases' },
          { id: 'lookahead', texto: 'Lookahead' },
          { id: 'restricciones', texto: 'Restricciones', extra: rs.abiertas ? <Insignia estado={rs.vencidas ? 'error' : 'advertencia'}>{rs.abiertas}</Insignia> : undefined },
          { id: 'semanal', texto: 'Plan semanal' },
          { id: 'ppc', texto: 'PPC y causas', extra: ppc.ultimo?.ppc !== undefined && ppc.ultimo?.ppc !== null ? <Insignia estado={ppc.ultimo.ppc >= 80 ? 'ok' : ppc.ultimo.ppc >= 60 ? 'advertencia' : 'error'}>{fmt(ppc.ultimo.ppc, 0)} %</Insignia> : undefined },
        ]}
      />
      {pest === 'maestro' && <Maestro ctx={ctx} />}
      {pest === 'fases' && <Fases ctx={ctx} />}
      {pest === 'lookahead' && <Lookahead ctx={ctx} alRestriccion={() => setPest('restricciones')} />}
      {pest === 'restricciones' && <Restricciones ctx={ctx} />}
      {pest === 'semanal' && <PlanSemanal ctx={ctx} />}
      {pest === 'ppc' && <Ppc ctx={ctx} />}
    </div>
  );
}

// ------------------------------------------------------------------ plan maestro e hitos

function Maestro({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const hoy = hoyIso();
  const set = (x: Hito, campo: keyof Hito, v: unknown) => mut((d) => { const y = d.hitos.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[campo] = v; });
  const criticas = r.programa.actividades.filter((a) => a.critica).length;
  return (
    <>
      <div className="cifras">
        <div><span>Inicio</span><strong>{fc(r.programa.inicio)}</strong></div>
        <div><span>Fin</span><strong>{fc(r.programa.fin)}</strong></div>
        <div><span>Plazo</span><strong>{r.programa.plazoDias} días</strong></div>
        <div><span>Actividades</span><strong>{r.programa.actividades.length} ({criticas} críticas)</strong></div>
        <div><span>Hitos cumplidos</span><strong>{c.hitos.filter((h) => h.cumplido).length} de {c.hitos.length}</strong></div>
      </div>
      <p className="pequeno" style={{ marginTop: 0 }}>El plan maestro es el cronograma del expediente (módulo Cronograma de ejecución). Aquí se fijan los hitos que guían la planificación por fases.</p>
      <div className="herramientas" style={{ marginBottom: 8 }}>
        <button
          className="boton chico"
          onClick={() => {
            const nuevos = hitosDesdeCronograma(r).filter((h) => !c.hitos.some((x) => x.nombre === h.nombre));
            if (!nuevos.length) return ctx.avisar('Los hitos del cronograma ya están en la lista');
            mut((d) => void d.hitos.push(...nuevos));
          }}
        >
          Generar hitos desde el cronograma
        </button>
        <button className="boton chico" onClick={() => mut((d) => void d.hitos.push({ id: uid('hito'), nombre: 'Nuevo hito', fecha: r.programa.fin || hoy, partidaId: '', cumplido: false, fechaReal: '' }))}><IconoMas /> Hito</button>
      </div>
      <TablaEditable
        filas={[...c.hitos].sort((a, b) => a.fecha.localeCompare(b.fecha))}
        clave={(x) => x.id}
        etiqueta="Hitos"
        alEliminar={(x) => mut((d) => { d.hitos = d.hitos.filter((y) => y.id !== x.id); d.fases = d.fases.filter((f) => f.hitoId !== x.id); })}
        vacio={<div className="vacio"><p>Genere los hitos desde el cronograma (fin de cada título del presupuesto) o agréguelos a mano.</p></div>}
        columnas={[
          { clave: 'n', titulo: 'Hito', tipo: 'texto', valor: (x) => x.nombre, cambiar: (x, v) => set(x, 'nombre', v) },
          { clave: 'f', titulo: 'Fecha programada', ancho: 140, tipo: 'fecha', valor: (x) => x.fecha, cambiar: (x, v) => set(x, 'fecha', v) },
          { clave: 'p', titulo: 'Actividad que lo define', ancho: 300, tipo: 'select', opciones: opcionesPartidas(r), valor: (x) => x.partidaId, cambiar: (x, v) => set(x, 'partidaId', v) },
          { clave: 'c', titulo: 'Cumplido', ancho: 76, tipo: 'casilla', valor: (x) => x.cumplido, cambiar: (x, v) => set(x, 'cumplido', v) },
          { clave: 'fr', titulo: 'Fecha real', ancho: 140, tipo: 'fecha', valor: (x) => x.fechaReal, cambiar: (x, v) => set(x, 'fechaReal', v) },
          {
            clave: 'e', titulo: 'Estado', ancho: 120, valor: () => '',
            formato: (x) => x.cumplido
              ? <Insignia estado={x.fechaReal && x.fechaReal > x.fecha ? 'advertencia' : 'ok'}>{x.fechaReal && x.fechaReal > x.fecha ? 'Cumplido tarde' : 'Cumplido'}</Insignia>
              : x.fecha < hoy ? <Insignia estado="error">Vencido</Insignia> : <Insignia estado="neutra">Por venir</Insignia>,
          },
        ]}
      />
    </>
  );
}

// ------------------------------------------------------------------ planificación por fases (pull)

function Fases({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const hitos = [...c.hitos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const [hitoId, setHito] = useState<string | null>(hitos[0]?.id ?? null);
  const hito = hitos.find((h) => h.id === hitoId) ?? hitos[0];
  const plan = useMemo(() => (hito ? programarFase(r, c, hito.id) : []), [r, c, hito]);
  if (!hitos.length) return <div className="vacio"><p>Primero defina los hitos en «Plan maestro e hitos».</p></div>;
  const set = (x: CompromisoFase, campo: keyof CompromisoFase, v: unknown) => mut((d) => { const y = d.fases.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[campo] = v; });
  const mover = (x: CompromisoFase, delta: number) =>
    mut((d) => {
      const lista = d.fases.filter((f) => f.hitoId === x.hitoId).sort((a, b) => a.orden - b.orden);
      const i = lista.findIndex((f) => f.id === x.id);
      const j = i + delta;
      if (j < 0 || j >= lista.length) return;
      [lista[i], lista[j]] = [lista[j], lista[i]];
      lista.forEach((f, k) => (f.orden = k + 1));
    });
  const primero = plan[plan.length - 1];
  return (
    <>
      <p className="pequeno" style={{ marginTop: 0 }}>Planificación «pull»: se parte del hito y se programan hacia atrás los entregables que cada especialidad necesita del anterior. El orden 1 es lo último antes del hito.</p>
      <div className="lista-cortes">
        {hitos.map((h) => <button key={h.id} className="chip" aria-pressed={h.id === hito?.id} onClick={() => setHito(h.id)}>{h.nombre} · {fechaCortaDM(h.fecha)}</button>)}
      </div>
      {hito && (
        <>
          <div className="cifras">
            <div><span>Hito</span><strong>{hito.nombre}</strong></div>
            <div><span>Fecha del hito</span><strong>{fc(hito.fecha)}</strong></div>
            <div><span>La fase debe empezar</span><strong>{primero ? fc(primero.inicio) : '—'}</strong></div>
            <div><span>Holgura hasta hoy</span><strong>{primero ? `${Math.round((new Date(primero.inicio).getTime() - new Date(hoyIso()).getTime()) / 86400000)} días` : '—'}</strong></div>
          </div>
          <div className="herramientas" style={{ marginBottom: 8 }}>
            <button className="boton chico" onClick={() => mut((d) => void d.fases.push({ id: uid('fase'), hitoId: hito.id, orden: d.fases.filter((f) => f.hitoId === hito.id).length + 1, actividad: '', especialidad: '', responsable: '', duracion: 1 }))}><IconoMas /> Entregable o actividad</button>
          </div>
          <TablaEditable
            filas={plan}
            clave={(x) => x.id}
            etiqueta="Planificación por fases"
            alEliminar={(x) => mut((d) => { d.fases = d.fases.filter((y) => y.id !== x.id); d.fases.filter((f) => f.hitoId === x.hitoId).sort((a, b) => a.orden - b.orden).forEach((f, k) => (f.orden = k + 1)); })}
            vacio={<div className="vacio"><p>Agregue lo que cada especialidad debe entregar para cumplir el hito, empezando por lo último.</p></div>}
            columnas={[
              {
                clave: 'o', titulo: 'Orden', ancho: 84, valor: (x) => x.orden,
                formato: (x) => (
                  <span className="fila-flex" style={{ gap: 2 }}>
                    <strong style={{ width: 18 }}>{x.orden}</strong>
                    <button className="boton-icono" title="Más cerca del hito" onClick={() => mover(x, -1)}>↓</button>
                    <button className="boton-icono" title="Más temprano" onClick={() => mover(x, 1)}>↑</button>
                  </span>
                ),
              },
              { clave: 'a', titulo: 'Entregable / actividad', tipo: 'texto', valor: (x) => x.actividad, cambiar: (x, v) => set(x, 'actividad', v) },
              { clave: 'e', titulo: 'Especialidad', ancho: 130, tipo: 'texto', lista: 'especialidades', valor: (x) => x.especialidad, cambiar: (x, v) => set(x, 'especialidad', v) },
              { clave: 'r', titulo: 'Responsable', ancho: 140, tipo: 'texto', valor: (x) => x.responsable, cambiar: (x, v) => set(x, 'responsable', v) },
              { clave: 'd', titulo: 'Duración (d lab.)', ancho: 100, tipo: 'numero', decimales: 0, valor: (x) => x.duracion, cambiar: (x, v) => set(x, 'duracion', Math.max(1, num(v, 1))) },
              { clave: 'i', titulo: 'Inicio', ancho: 92, valor: (x) => fc(x.inicio) },
              { clave: 'f', titulo: 'Fin', ancho: 92, valor: (x) => fc(x.fin) },
            ]}
          />
          <datalist id="especialidades">{['Producción', 'Oficina técnica', 'Logística', 'Calidad', 'Seguridad', 'Topografía', 'Subcontratista', 'Supervisión', 'Cliente'].map((x) => <option key={x} value={x} />)}</datalist>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ lookahead

function inicioVentana(r: Contexto['resultados']) {
  const hoy = hoyIso();
  const ini = r.programa.inicio || hoy;
  const fin = r.programa.fin || hoy;
  return lunesDe(hoy < ini ? ini : hoy > fin ? ini : hoy);
}

function Lookahead({ ctx, alRestriccion }: { ctx: Contexto; alRestriccion: () => void }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [desde, setDesde] = useState(() => inicioVentana(r));
  const [n, setN] = useState(6);
  const la = useMemo(() => lookahead(r, c, desde, n), [r, c, desde, n]);
  const listas = la.filas.filter((f) => f.lista).length;
  const agregarRestriccion = (partidaId: string, inicio: string) => {
    mut((d) => void d.restricciones.push({ id: uid('res'), partidaId, tipo: 'Materiales', descripcion: '', responsable: '', fechaRequerida: sumarDias(inicio, -3), fechaLiberacion: '', liberada: false }));
    alRestriccion();
  };
  return (
    <>
      <div className="fila-flex" style={{ marginBottom: 10 }}>
        <Campo etiqueta="Semana inicial (lunes)"><EntradaTexto type="date" valor={desde} alCambiar={(v) => v && setDesde(lunesDe(v))} /></Campo>
        <Campo etiqueta="Semanas">
          <select className="entrada" value={n} onChange={(e) => setN(Number(e.target.value))}>{[3, 4, 5, 6, 8].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </Campo>
        <div className="fila-flex" style={{ alignSelf: 'flex-end', gap: 6 }}>
          <button className="boton chico" onClick={() => setDesde(sumarDias(desde, -7))}>← Semana anterior</button>
          <button className="boton chico" onClick={() => setDesde(sumarDias(desde, 7))}>Semana siguiente →</button>
        </div>
        <span className="separador" />
        <div className="cifras" style={{ border: 0, padding: 0, margin: 0 }}>
          <div><span>Actividades en la ventana</span><strong>{la.filas.length}</strong></div>
          <div><span>Listas (sin restricciones)</span><strong>{listas}</strong></div>
          <div><span>Con restricciones</span><strong>{la.filas.length - listas}</strong></div>
        </div>
      </div>
      <TablaEditable
        filas={la.filas}
        clave={(x) => x.partidaId}
        etiqueta="Lookahead"
        alto="calc(100vh - 360px)"
        claseFila={(x) => (x.lista ? 'lista-si' : 'lista-no')}
        vacio={<div className="vacio"><p>No hay actividades del cronograma en estas semanas.</p></div>}
        columnas={[
          { clave: 'c', titulo: 'Ítem', ancho: 70, valor: (x) => x.codigo },
          { clave: 'd', titulo: 'Actividad', valor: (x) => x.descripcion, formato: (x) => <>{x.descripcion} {x.critica && <Insignia estado="error">Crítica</Insignia>}</> },
          { clave: 'u', titulo: 'Und.', ancho: 46, valor: (x) => x.unidad },
          ...la.lunes.map((l, i) => ({
            clave: `s${i}`,
            titulo: fechaCortaDM(l),
            ancho: 72,
            num: true,
            valor: (x: (typeof la.filas)[number]) => x.semanas[i] || null,
            clase: (x: (typeof la.filas)[number]) => (x.semanas[i] ? `celda-sem ${x.lista ? 'activa' : 'bloqueada'}` : 'celda-sem'),
          })),
          {
            clave: 'r', titulo: 'Restricciones', ancho: 150, valor: (x) => x.restriccionesAbiertas,
            formato: (x) => (
              <span className="fila-flex" style={{ gap: 6 }}>
                {x.lista ? <Insignia estado="ok">Lista</Insignia> : <Insignia estado={x.restriccionesVencidas ? 'error' : 'advertencia'}>{x.restriccionesAbiertas} abierta{x.restriccionesAbiertas > 1 ? 's' : ''}</Insignia>}
                <button className="boton-icono" title="Agregar restricción" onClick={() => agregarRestriccion(x.partidaId, x.inicio)}><IconoMas /></button>
              </span>
            ),
          },
        ]}
      />
      <p className="pequeno">Metrado previsto por semana según el cronograma. En verde las actividades listas para comprometerse; en rojo las que tienen restricciones por liberar.</p>
    </>
  );
}

// ------------------------------------------------------------------ restricciones

function Restricciones({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [soloAbiertas, setSolo] = useState(false);
  const hoy = hoyIso();
  const s = resumenRestricciones(c);
  const set = (x: Restriccion, campo: keyof Restriccion, v: unknown) =>
    mut((d) => {
      const y = d.restricciones.find((z) => z.id === x.id);
      if (!y) return;
      (y as unknown as Record<string, unknown>)[campo] = v;
      if (campo === 'liberada' && v && !y.fechaLiberacion) y.fechaLiberacion = hoy;
    });
  const filas = c.restricciones.filter((x) => !soloAbiertas || !x.liberada).sort((a, b) => (a.liberada === b.liberada ? (a.fechaRequerida || '').localeCompare(b.fechaRequerida || '') : a.liberada ? 1 : -1));
  return (
    <>
      <div className="indicadores">
        <Indicador titulo="Restricciones" valor={s.total} />
        <Indicador titulo="Abiertas" valor={s.abiertas} estado={s.abiertas ? 'advertencia' : 'ok'} />
        <Indicador titulo="Vencidas" valor={s.vencidas} estado={s.vencidas ? 'error' : 'ok'} />
        <Indicador titulo="Liberadas a tiempo" valor={pct(s.liberadasATiempoPct, 0)} />
      </div>
      <div className="herramientas" style={{ marginBottom: 8 }}>
        <button className="boton chico" onClick={() => mut((d) => void d.restricciones.push({ id: uid('res'), partidaId: '', tipo: 'Materiales', descripcion: '', responsable: '', fechaRequerida: sumarDias(hoy, 7), fechaLiberacion: '', liberada: false }))}><IconoMas /> Restricción</button>
        <label className="casilla"><input type="checkbox" checked={soloAbiertas} onChange={(e) => setSolo(e.target.checked)} /> Solo abiertas</label>
      </div>
      <TablaEditable
        filas={filas}
        clave={(x) => x.id}
        etiqueta="Análisis de restricciones"
        alEliminar={(x) => mut((d) => { d.restricciones = d.restricciones.filter((y) => y.id !== x.id); })}
        claseFila={(x) => (!x.liberada && x.fechaRequerida && x.fechaRequerida < hoy ? 'lista-no' : undefined)}
        vacio={<div className="vacio"><p>Identifique en el lookahead lo que falta para que cada actividad pueda ejecutarse: materiales, planos, permisos, personal, equipos, actividad previa…</p></div>}
        columnas={[
          { clave: 'p', titulo: 'Actividad', ancho: 280, tipo: 'select', opciones: opcionesPartidas(r), valor: (x) => x.partidaId, cambiar: (x, v) => set(x, 'partidaId', v) },
          { clave: 't', titulo: 'Tipo', ancho: 150, tipo: 'select', opciones: opciones(TIPOS_RESTRICCION), valor: (x) => x.tipo, cambiar: (x, v) => set(x, 'tipo', v) },
          { clave: 'd', titulo: 'Restricción', tipo: 'texto', valor: (x) => x.descripcion, cambiar: (x, v) => set(x, 'descripcion', v) },
          { clave: 'r', titulo: 'Responsable', ancho: 140, tipo: 'texto', valor: (x) => x.responsable, cambiar: (x, v) => set(x, 'responsable', v) },
          { clave: 'fr', titulo: 'Requerida para', ancho: 132, tipo: 'fecha', valor: (x) => x.fechaRequerida, cambiar: (x, v) => set(x, 'fechaRequerida', v) },
          { clave: 'l', titulo: 'Liberada', ancho: 70, tipo: 'casilla', valor: (x) => x.liberada, cambiar: (x, v) => set(x, 'liberada', v) },
          { clave: 'fl', titulo: 'Liberada el', ancho: 132, tipo: 'fecha', valor: (x) => x.fechaLiberacion, cambiar: (x, v) => set(x, 'fechaLiberacion', v) },
        ]}
      />
      <RestriccionesAutomaticas ctx={ctx} />
    </>
  );
}

/** Restricciones que nacen solas del kanban, de la calidad y de las consultas, y se levantan solas al resolverse su origen. */
function RestriccionesAutomaticas({ ctx }: { ctx: Contexto }) {
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const hoy = hoyIso();
  const lista = useMemo(() => restriccionesAutomaticas(r, c, hoy), [r, c, hoy]);
  const codigo = new Map(r.hojas.map((h) => [h.partida.id, `${h.partida.codigo} ${h.partida.descripcion}`]));
  const ir = { kanban: 'logistica', calidad: 'calidad', rfi: 'control' } as const;
  return (
    <>
      <div className="seccion-titulo">Restricciones automáticas ({lista.length})</div>
      <p className="pequeno" style={{ marginTop: 0 }}>Nacen solas de un material no recibido que se necesita en las próximas 3 semanas (kanban), de un protocolo de punto de parada sin liberar en una actividad previa (calidad) y de una consulta (RFI) abierta asignada a la partida. Bloquean la actividad en el lookahead y se levantan solas al resolverse su origen.</p>
      {lista.length === 0 ? <div className="vacio"><p>No hay restricciones automáticas abiertas.</p></div> : (
        <div className="tabla-marco" style={{ maxHeight: 320 }}>
          <table className="tabla" aria-label="Restricciones automáticas">
            <thead><tr><th>Origen</th><th>Actividad</th><th>Restricción</th><th>Responsable</th><th>Requerida para</th></tr></thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.id} className={x.fechaRequerida && x.fechaRequerida < hoy ? 'lista-no' : undefined}>
                  <td><button className="boton chico" onClick={() => ctx.ir(ir[x.origen])}>{{ kanban: 'Kanban', calidad: 'Calidad', rfi: 'Consulta' }[x.origen]}</button></td>
                  <td style={{ whiteSpace: 'normal' }}>{codigo.get(x.partidaId) ?? '—'}</td>
                  <td style={{ whiteSpace: 'normal' }}>{x.descripcion}</td>
                  <td>{x.responsable}</td>
                  <td>{x.fechaRequerida}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ plan semanal

function PlanSemanal({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const semanas = [...c.semanas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const [selId, setSel] = useState<string | null>(semanas[semanas.length - 1]?.id ?? null);
  const sel = semanas.find((s) => s.id === selId) ?? semanas[semanas.length - 1] ?? null;
  const ppc = calcularPpc(c).semanas.find((s) => s.semanaId === sel?.id);
  const nueva = () => {
    const ult = semanas[semanas.length - 1];
    const lunes = ult ? sumarDias(ult.inicio, 7) : inicioVentana(r);
    const id = uid('sem');
    mut((d) => void d.semanas.push({ id, inicio: lunes, compromisos: compromisosSugeridos(r, d as never, lunes) }));
    setSel(id);
  };
  const editar = (fn: (cs: Compromiso[]) => void) => mut((d) => { const s = d.semanas.find((x) => x.id === sel?.id); if (s) fn(s.compromisos); });
  const set = (x: Compromiso, campo: keyof Compromiso, v: unknown) => editar((cs) => { const y = cs.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[campo] = v; });
  return (
    <>
      <div className="lista-cortes">
        {semanas.map((s) => <button key={s.id} className="chip" aria-pressed={s.id === sel?.id} onClick={() => setSel(s.id)}>Semana del {fechaCortaDM(s.inicio)}</button>)}
        <button className="boton chico" onClick={nueva}><IconoMas /> Nueva semana</button>
      </div>
      {!sel ? (
        <div className="vacio"><p>Cree el plan de la semana: se proponen las actividades del lookahead que no tienen restricciones abiertas. Al final de la semana marque qué se cumplió y por qué no.</p></div>
      ) : (
        <>
          <div className="fila-flex" style={{ marginBottom: 10 }}>
            <Campo etiqueta="Lunes de la semana"><EntradaTexto type="date" valor={sel.inicio} alCambiar={(v) => v && mut((d) => { const s = d.semanas.find((x) => x.id === sel.id); if (s) s.inicio = lunesDe(v); })} /></Campo>
            <div className="cifras" style={{ border: 0, padding: 0, margin: '0 0 0 12px', alignSelf: 'flex-end' }}>
              <div><span>Compromisos</span><strong>{sel.compromisos.length}</strong></div>
              <div><span>Evaluados</span><strong>{ppc?.evaluados ?? 0}</strong></div>
              <div><span>PPC de la semana</span><strong>{pct(ppc?.ppc ?? null, 0)}</strong></div>
            </div>
            <span className="separador" />
            <button
              className="boton chico"
              onClick={() => {
                const ya = new Set(sel.compromisos.map((x) => x.partidaId));
                const nuevos = compromisosSugeridos(r, c, sel.inicio).filter((x) => !ya.has(x.partidaId));
                if (!nuevos.length) return ctx.avisar('No hay más actividades listas para esta semana');
                editar((cs) => void cs.push(...nuevos));
              }}
            >
              Traer actividades listas del lookahead
            </button>
            <button className="boton chico" onClick={() => editar((cs) => void cs.push({ id: uid('cmp'), partidaId: '', descripcion: '', responsable: '', frenteId: '', metrado: null, cumplido: null, causa: '', nota: '' }))}><IconoMas /> Compromiso</button>
            <button className="boton chico peligro" onClick={() => { if (confirm('¿Eliminar el plan de esta semana?')) { mut((d) => { d.semanas = d.semanas.filter((x) => x.id !== sel.id); }); setSel(null); } }}>Eliminar semana</button>
          </div>
          <TablaEditable
            filas={sel.compromisos}
            clave={(x) => x.id}
            etiqueta="Compromisos de la semana"
            alEliminar={(x) => editar((cs) => { const i = cs.findIndex((y) => y.id === x.id); if (i >= 0) cs.splice(i, 1); })}
            claseFila={(x) => (x.cumplido === true ? 'lista-si' : x.cumplido === false ? 'lista-no' : undefined)}
            columnas={[
              {
                clave: 'p', titulo: 'Actividad', ancho: 250, tipo: 'select', opciones: opcionesPartidas(r, '— Otra tarea —'), valor: (x) => x.partidaId,
                cambiar: (x, v) => editar((cs) => { const y = cs.find((z) => z.id === x.id); if (!y) return; y.partidaId = v as string; const h = r.hojas.find((q) => q.partida.id === v); if (h && !y.descripcion) y.descripcion = h.partida.descripcion; }),
              },
              { clave: 'd', titulo: 'Compromiso', tipo: 'texto', valor: (x) => x.descripcion, cambiar: (x, v) => set(x, 'descripcion', v) },
              { clave: 'r', titulo: 'Responsable', ancho: 120, tipo: 'texto', valor: (x) => x.responsable, cambiar: (x, v) => set(x, 'responsable', v) },
              { clave: 'f', titulo: 'Frente', ancho: 150, tipo: 'select', opciones: opcionesFrentes(c), valor: (x) => x.frenteId, cambiar: (x, v) => set(x, 'frenteId', v) },
              { clave: 'm', titulo: 'Metrado', ancho: 90, tipo: 'numero', valor: (x) => x.metrado, cambiar: (x, v) => set(x, 'metrado', v) },
              {
                clave: 'c', titulo: '¿Cumplido?', ancho: 112, tipo: 'select', opciones: [{ valor: '', texto: 'Sin evaluar' }, { valor: 'si', texto: 'Sí' }, { valor: 'no', texto: 'No' }],
                valor: (x) => (x.cumplido === null ? '' : x.cumplido ? 'si' : 'no'),
                cambiar: (x, v) => editar((cs) => { const y = cs.find((z) => z.id === x.id); if (!y) return; y.cumplido = v === '' ? null : v === 'si'; if (y.cumplido !== false) y.causa = ''; }),
              },
              { clave: 'cnc', titulo: 'Causa de no cumplimiento', ancho: 170, tipo: 'select', opciones: [{ valor: '', texto: '—' }, ...opciones(CAUSAS_NO_CUMPLIMIENTO)], valor: (x) => x.causa, cambiar: (x, v) => set(x, 'causa', v) },
              { clave: 'n', titulo: 'Nota', ancho: 150, tipo: 'texto', valor: (x) => x.nota, cambiar: (x, v) => set(x, 'nota', v) },
            ]}
          />
          {sel.compromisos.some((x) => x.cumplido === false && !x.causa) && <div className="aviso advertencia" style={{ marginTop: 10 }}>Registre la causa de cada compromiso no cumplido: es lo que permite aprender en el análisis de causas.</div>}
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ PPC y causas

function Ppc({ ctx }: { ctx: Contexto }) {
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const p = calcularPpc(c);
  const cnc = causasNoCumplimiento(c);
  if (!p.semanas.some((s) => s.ppc !== null)) return <div className="vacio"><p>Evalúe los compromisos de al menos una semana en «Plan semanal» para ver el PPC.</p></div>;
  return (
    <>
      <div className="indicadores">
        <Indicador titulo="PPC última semana" valor={pct(p.ultimo?.ppc ?? null, 0)} estado={(p.ultimo?.ppc ?? 0) >= 80 ? 'ok' : (p.ultimo?.ppc ?? 0) >= 60 ? 'advertencia' : 'error'} />
        <Indicador titulo="PPC promedio" valor={pct(p.promedio, 0)} />
        <Indicador titulo="Semanas evaluadas" valor={p.semanas.filter((s) => s.ppc !== null).length} />
        <Indicador titulo="Compromisos no cumplidos" valor={cnc.reduce((s, x) => s + x.valor, 0)} detalle={cnc[0] ? `Principal causa: ${cnc[0].clave}` : ''} />
      </div>
      <div className="seccion-titulo">PPC por semana</div>
      <GraficoBarras
        titulo="Porcentaje de plan cumplido por semana"
        datos={p.semanas.map((s) => ({ etiqueta: fechaCortaDM(s.lunes), valor: s.ppc ?? 0 }))}
        formato={(v) => `${fmt(v, 0)}%`}
        referencia={{ y: 80, texto: 'Meta 80 %' }}
        colorDe={(v) => (v >= 80 ? COLOR.plan : v >= 60 ? COLOR.ocre : COLOR.costo)}
      />
      <div className="seccion-titulo">Causas de no cumplimiento (Pareto)</div>
      <GraficoPareto items={cnc} titulo="Pareto de causas de no cumplimiento" />
      <VistaTabla t={tablaPpc(r, c)} alto="320px" />
    </>
  );
}
