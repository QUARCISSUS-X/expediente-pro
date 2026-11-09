// Control de obra (PMBOK): tablero, línea base y avance, valor ganado, valorizaciones, cambios, riesgos, recursos y cuaderno.
import { useMemo, useState } from 'react';
import {
  calcularEvm, calcularPpc, calcularTablero, calcularValorizaciones, claseRiesgo, controlDemostracion, type Corte, crearLineaBase,
  ejecutadoHasta, hoyIso, nivelRiesgo, recursosSemanales, type RegistroObra, resumirCambios, type Riesgo,
} from '../../engine/control';
import { difDias, fmt, mesAnioLargo, num, sumarDias, uid } from '../../engine/util';
import { nombreBase } from '../../export/paquete';
import { generarXlsxControl, tablaAvancePartidas, tablaEvm, tablaRecursos, tablaValorizaciones } from '../../export/control';
import { Campo, EntradaNumero, EntradaTexto, IconoMas, Pestanas, TablaEditable, type Columna } from '../componentes';
import { estadoIndice, fc, fechaCortaDM, ind, MIME_XLSX, opciones, pct, useControl } from '../control';
import { descargar, type Contexto } from '../estado';
import { COLOR, GraficoBarras, GraficoLineas, Indicador, MatrizRiesgos } from '../graficos';
import { VistaTabla } from '../VistaTabla';
import { entradaSimulacion } from '../../engine/riesgo';

type Pest = 'tablero' | 'avance' | 'evm' | 'valorizaciones' | 'cambios' | 'riesgos' | 'recursos' | 'registros';

export function ModControl({ ctx }: { ctx: Contexto }) {
  const [pest, setPest] = useState<Pest>('tablero');
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const exportar = async () => {
    try {
      const datos = await generarXlsxControl(r, c);
      descargar(`${nombreBase(r)}_Control_de_obra.xlsx`, datos, MIME_XLSX);
      ctx.avisar('Informe de control descargado');
    } catch (e) {
      ctx.avisar(`No se pudo generar el informe: ${(e as Error).message}`, true);
    }
  };
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Control de obra</h1>
          <p className="proposito">Seguimiento de la ejecución contra la línea base: avance físico, valor ganado, valorizaciones, cambios, riesgos, recursos y cuaderno de obra.</p>
        </div>
        <div className="herramientas">
          <button className="boton" onClick={() => void exportar()}>Informe de control (Excel)</button>
        </div>
      </div>
      <Pestanas
        valor={pest}
        alCambiar={setPest}
        opciones={[
          { id: 'tablero', texto: 'Tablero' },
          { id: 'avance', texto: 'Línea base y avance' },
          { id: 'evm', texto: 'Valor ganado y curva S' },
          { id: 'valorizaciones', texto: 'Valorizaciones' },
          { id: 'cambios', texto: 'Cambios' },
          { id: 'riesgos', texto: 'Riesgos' },
          { id: 'recursos', texto: 'Recursos' },
          { id: 'registros', texto: 'Cuaderno, RFI y actas' },
        ]}
      />
      {!c.lineaBase && pest !== 'riesgos' && pest !== 'registros' && pest !== 'recursos' ? (
        <SinLineaBase ctx={ctx} />
      ) : (
        <>
          {pest === 'tablero' && <Tablero ctx={ctx} ir={setPest} />}
          {pest === 'avance' && <Avance ctx={ctx} />}
          {pest === 'evm' && <ValorGanado ctx={ctx} />}
          {pest === 'valorizaciones' && <Valorizaciones ctx={ctx} />}
          {pest === 'cambios' && <Cambios ctx={ctx} />}
          {pest === 'riesgos' && <Riesgos ctx={ctx} />}
          {pest === 'recursos' && <Recursos ctx={ctx} />}
          {pest === 'registros' && <Registros ctx={ctx} />}
        </>
      )}
    </div>
  );
}

function SinLineaBase({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const vacio = !c.cortes.length && !c.semanas.length && !c.mediciones.length && !c.riesgos.length;
  return (
    <div className="vacio">
      <p><strong>Primero congele la línea base.</strong></p>
      <p>La línea base guarda el presupuesto ({r.proyecto.meta.moneda} {fmt(r.pie.costoDirecto)} de costo directo) y el cronograma actuales ({r.programa.plazoDias} días). El avance y el valor ganado se miden contra ella aunque después cambie el expediente.</p>
      <div className="fila-flex" style={{ justifyContent: 'center' }}>
        <button
          className="boton primario"
          disabled={!r.hojas.some((h) => h.metrado > 0)}
          onClick={() => {
            mut((d) => {
              d.lineaBase = crearLineaBase(r, 'Línea base aprobada');
            });
            ctx.avisar('Línea base congelada');
          }}
        >
          Congelar línea base
        </button>
        {vacio && (
          <button
            className="boton"
            title="Llena todos los módulos de control con datos ficticios coherentes con este proyecto"
            onClick={() => {
              const demo = controlDemostracion(r);
              ctx.actualizar((d) => {
                d.control = demo;
              });
              ctx.avisar('Datos de demostración cargados (se pueden borrar desde Línea base y avance)');
            }}
          >
            Cargar datos de demostración
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tablero

function Tablero({ ctx, ir }: { ctx: Contexto; ir: (p: Pest) => void }) {
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const huella = useMemo(() => entradaSimulacion(r, c.riesgo, c.lineaBase).huella, [r, c.riesgo, c.lineaBase]);
  const t = useMemo(() => calcularTablero(r, c, hoyIso(), huella), [r, c, huella]);
  const evm = useMemo(() => calcularEvm(r, c), [r, c]);
  const ppc = useMemo(() => calcularPpc(c), [c]);
  const m = r.proyecto.meta.moneda;
  const lb = c.lineaBase!;
  const atraso = t.finEstimado ? difDias(lb.fin, t.finEstimado) : 0;
  return (
    <>
      {!t.ultimoCorte && <div className="aviso info">Aún no hay cortes de avance. Registre el primero en <button className="boton chico" onClick={() => ir('avance')}>Línea base y avance</button></div>}
      {t.cambios.alerta && <div className="aviso advertencia">{t.cambios.alerta}</div>}
      <div className="seccion-titulo">Plazo y costo {t.ultimoCorte && <span className="pequeno">· corte del {fc(t.ultimoCorte)}</span>}</div>
      <div className="indicadores">
        <Indicador titulo="Avance programado" valor={pct(t.avanceProgramado)} />
        <Indicador titulo="Avance real (valor ganado)" valor={pct(t.avanceReal)} estado={t.avanceReal !== null && t.avanceProgramado !== null ? estadoIndice(t.avanceProgramado ? t.avanceReal / t.avanceProgramado : 1) : 'neutra'} />
        <Indicador titulo="SPI · cronograma" valor={ind(t.spi)} detalle={t.spi === null ? 'Sin cortes' : t.spi >= 1 ? 'Adelantado o a tiempo' : 'Atrasado'} estado={estadoIndice(t.spi)} />
        <Indicador titulo="CPI · costo" valor={ind(t.cpi)} detalle={t.cpi === null ? 'Falta el costo real' : t.cpi >= 1 ? 'Dentro del presupuesto' : 'Sobrecosto'} estado={estadoIndice(t.cpi)} />
        <Indicador titulo={`Costo estimado al terminar (${m})`} valor={t.eac === null ? '—' : fmt(t.eac, 0)} detalle={t.eac === null ? '' : `Presupuesto ${fmt(evm?.bac ?? 0, 0)}`} estado={t.eac === null ? 'neutra' : t.eac <= (evm?.bac ?? 0) * 1.02 ? 'ok' : t.eac <= (evm?.bac ?? 0) * 1.1 ? 'advertencia' : 'error'} />
        <Indicador titulo="Fin estimado" valor={fc(t.finEstimado)} detalle={t.finEstimado ? (atraso > 0 ? `${atraso} días de atraso` : `${-atraso} días antes`) : `Fin base ${fc(lb.fin)}`} estado={!t.finEstimado ? 'neutra' : atraso <= 0 ? 'ok' : atraso <= 7 ? 'advertencia' : 'error'} />
      </div>
      <div className="seccion-titulo">Earned Schedule y riesgo de plazo</div>
      <div className="indicadores">
        <Indicador titulo="SPI(t) · Earned Schedule" valor={ind(t.spiT)} detalle={t.svT === null ? 'Sin cortes' : `SV(t) ${fmt(t.svT, 1)} días laborables`} estado={estadoIndice(t.spiT)} />
        <Indicador titulo="Fin estimado IEAC(t)" valor={fc(t.finEstimadoES)} detalle={t.finEstimadoES ? `Fin base ${fc(lb.fin)}` : ''} estado={!t.finEstimadoES ? 'neutra' : t.finEstimadoES <= lb.fin ? 'ok' : difDias(lb.fin, t.finEstimadoES) <= 7 ? 'advertencia' : 'error'} />
        <Indicador titulo="Plazo P80 (Monte Carlo)" valor={t.riesgo ? fc(t.riesgo.p80Fecha) : '—'} detalle={t.riesgo ? `${pct(t.riesgo.probPlazo, 0)} de cumplir el plazo${t.riesgoDesactualizado ? ' · desactualizado' : ''}` : 'Corra la simulación en Riesgo de plazo y costo'} estado={!t.riesgo ? 'neutra' : t.riesgo.probPlazo >= 80 ? 'ok' : t.riesgo.probPlazo >= 50 ? 'advertencia' : 'error'} />
        <Indicador titulo={`Costo directo P80 (${m})`} valor={t.riesgo?.p80Costo ? fmt(t.riesgo.p80Costo, 0) : '—'} detalle={t.riesgo?.probCosto !== null && t.riesgo?.probCosto !== undefined ? `${pct(t.riesgo.probCosto, 0)} de cumplir el presupuesto` : ''} estado={!t.riesgo || t.riesgo.probCosto === null ? 'neutra' : t.riesgo.probCosto >= 80 ? 'ok' : t.riesgo.probCosto >= 50 ? 'advertencia' : 'error'} />
        <Indicador titulo="Colchón del proyecto (CCPM)" valor={pct(t.colchonConsumo, 0)} detalle={t.avanceCadena === null ? 'Sin cortes' : `consumido · cadena al ${pct(t.avanceCadena, 0)}`} estado={t.colchonZona === 'rojo' ? 'error' : t.colchonZona === 'amarillo' ? 'advertencia' : t.colchonZona === 'verde' ? 'ok' : 'neutra'} />
      </div>
      <div className="seccion-titulo">Calidad, logística y costo meta</div>
      <div className="indicadores">
        <Indicador titulo="Protocolos liberados" valor={pct(t.liberacionCalidad, 0)} detalle={`${t.pncAbiertos} ${t.pncAbiertos === 1 ? 'producto no conforme abierto' : 'productos no conformes abiertos'}`} estado={t.liberacionCalidad === null ? 'neutra' : t.liberacionCalidad >= 90 ? 'ok' : t.liberacionCalidad >= 75 ? 'advertencia' : 'error'} />
        <Indicador titulo="Materiales en quiebre" valor={t.kanbanQuiebres} detalle={`${t.kanbanPorPedir} pedidos vencidos sin emitir`} estado={t.kanbanQuiebres ? 'error' : t.kanbanPorPedir ? 'advertencia' : 'ok'} />
        <Indicador titulo={`Brecha contra el costo meta (${m})`} valor={t.brechaMeta === null ? '—' : fmt(t.brechaMeta, 0)} detalle={t.brechaMetaPct === null ? 'Sin costo meta' : `${fmt(t.brechaMetaPct, 1)} % sobre la meta`} estado={t.brechaMeta === null ? 'neutra' : t.brechaMeta <= 0 ? 'ok' : (t.brechaMetaPct ?? 0) <= 3 ? 'advertencia' : 'error'} />
      </div>
      <div className="seccion-titulo">Last Planner y productividad</div>
      <div className="indicadores">
        <Indicador titulo="PPC última semana" valor={pct(t.ppcUltimo, 0)} detalle={`Promedio ${pct(t.ppcPromedio, 0)}`} estado={estadoIndice(t.ppcUltimo === null ? null : t.ppcUltimo / 100, 0.8, 0.6)} />
        <Indicador titulo="Restricciones abiertas" valor={t.restriccionesAbiertas} detalle={`${t.restriccionesVencidas} vencidas`} estado={t.restriccionesVencidas ? 'error' : t.restriccionesAbiertas ? 'advertencia' : 'ok'} />
        <Indicador titulo="Índice de productividad (MO)" valor={ind(t.ipPromedio)} detalle="HH presupuestadas ÷ HH reales" estado={estadoIndice(t.ipPromedio, 1, 0.9)} />
        <Indicador titulo={`Desviación de mano de obra (${m})`} valor={fmt(t.desviacionMo, 0)} detalle={t.desviacionMo > 0 ? 'Sobrecosto en lo medido' : 'Ahorro en lo medido'} estado={t.desviacionMo > 0 ? 'error' : t.desviacionMo < 0 ? 'ok' : 'neutra'} />
        <Indicador titulo="Trabajo productivo (cartas balance)" valor={pct(t.tpPromedio, 0)} />
        <Indicador titulo="Inspecciones 5S y frentes" valor={pct(t.inspeccionPromedio, 0)} estado={estadoIndice(t.inspeccionPromedio === null ? null : t.inspeccionPromedio / 100, 0.85, 0.7)} />
      </div>
      <div className="seccion-titulo">Cambios, riesgos y registros</div>
      <div className="indicadores">
        <Indicador titulo={`Presupuesto vigente (${m})`} valor={fmt(t.cambios.vigente, 0)} detalle={`Incidencia neta ${fmt(t.cambios.incidenciaPct, 2)} %`} estado={t.cambios.incidenciaPct > 15 ? 'error' : t.cambios.incidenciaPct > 10 ? 'advertencia' : 'neutra'} />
        <Indicador titulo="Plazo vigente" valor={`${t.cambios.plazoVigente} d`} detalle={`${t.cambios.ampliacionDias} d de ampliación`} />
        <Indicador titulo="Riesgos críticos abiertos" valor={t.riesgosCriticos} detalle={`${t.riesgosAbiertos} abiertos · contingencia ${fmt(t.contingencia, 0)}`} estado={t.riesgosCriticos ? 'error' : t.riesgosAbiertos ? 'advertencia' : 'ok'} />
        <Indicador titulo="Consultas y asientos abiertos" valor={t.registrosAbiertos} detalle={`${t.registrosVencidos} con plazo vencido`} estado={t.registrosVencidos ? 'error' : 'neutra'} />
        <Indicador titulo="Proyectos de mejora DMAIC" valor={t.dmaicActivos} detalle="activos" />
      </div>
      {evm && evm.puntos.length > 0 && <CurvaControl ctx={ctx} />}
      {ppc.semanas.some((s) => s.ppc !== null) && (
        <>
          <div className="seccion-titulo">PPC semanal</div>
          <GraficoBarras
            titulo="Porcentaje de plan cumplido por semana"
            datos={ppc.semanas.map((s) => ({ etiqueta: fechaCortaDM(s.lunes), valor: s.ppc ?? 0 }))}
            formato={(v) => `${fmt(v, 0)}%`}
            referencia={{ y: 80, texto: 'Meta 80 %' }}
            colorDe={(v) => (v >= 80 ? COLOR.plan : v >= 60 ? COLOR.ocre : COLOR.costo)}
            alto={180}
          />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ línea base y cortes

function Avance({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const lb = c.lineaBase!;
  const cortes = useMemo(() => [...c.cortes].sort((a, b) => a.fecha.localeCompare(b.fecha)), [c.cortes]);
  const [selId, setSel] = useState<string | null>(cortes[cortes.length - 1]?.id ?? null);
  const [soloProgramadas, setSolo] = useState(true);
  const sel = cortes.find((k) => k.id === selId) ?? null;
  const anterior = sel ? ejecutadoHasta({ ...c, cortes: c.cortes.filter((k) => k.fecha < sel.fecha || (k.fecha === sel.fecha && k.id !== sel.id && cortes.indexOf(k) < cortes.indexOf(sel))) }, sel.fecha) : {};
  const m = r.proyecto.meta.moneda;
  const nuevoCorte = () => {
    const ult = cortes[cortes.length - 1];
    const fecha = ult ? sumarDias(ult.fecha, 7) : hoyIso() < lb.inicio ? sumarDias(lb.inicio, 6) : hoyIso();
    const k: Corte = { id: uid('cte'), fecha, nombre: `Semana ${cortes.length + 1}`, metrados: {}, costoReal: null, nota: '' };
    mut((d) => void d.cortes.push(k));
    setSel(k.id);
  };
  const editar = (fn: (k: Corte) => void) => mut((d) => {
    const k = d.cortes.find((x) => x.id === selId);
    if (k) fn(k);
  });
  const filas = lb.partidas.filter((b) => !soloProgramadas || !sel || b.inicio <= sel.fecha || num(sel.metrados[b.id]) || num(anterior[b.id]));
  const montoCorte = sel ? lb.partidas.reduce((s, b) => s + num(sel.metrados[b.id]) * b.pu, 0) : 0;
  const cols: Columna<(typeof lb.partidas)[number]>[] = [
    { clave: 'cod', titulo: 'Ítem', ancho: 70, valor: (b) => b.codigo },
    { clave: 'desc', titulo: 'Descripción', valor: (b) => b.descripcion },
    { clave: 'und', titulo: 'Und.', ancho: 50, valor: (b) => b.unidad },
    { clave: 'mb', titulo: 'Metrado base', num: true, ancho: 100, valor: (b) => b.metrado },
    { clave: 'ant', titulo: 'Acum. anterior', num: true, ancho: 100, valor: (b) => num(anterior[b.id]) },
    { clave: 'per', titulo: 'Este corte', tipo: 'numero', ancho: 100, valor: (b) => sel?.metrados[b.id] ?? null, cambiar: (b, v) => editar((k) => { if (v === null || v === 0) delete k.metrados[b.id]; else k.metrados[b.id] = v as number; }) },
    { clave: 'acu', titulo: 'Acumulado', num: true, ancho: 100, valor: (b) => num(anterior[b.id]) + num(sel?.metrados[b.id]) },
    {
      clave: 'pct', titulo: '% avance', num: true, ancho: 80,
      valor: (b) => (b.metrado ? ((num(anterior[b.id]) + num(sel?.metrados[b.id])) / b.metrado) * 100 : 0),
      clase: (b) => ((num(anterior[b.id]) + num(sel?.metrados[b.id])) > b.metrado + 1e-6 ? 'mal' : undefined),
    },
    { clave: 'ini', titulo: 'Inicio prog.', ancho: 88, valor: (b) => fc(b.inicio) },
  ];
  return (
    <>
      <div className="cifras">
        <div><span>Línea base</span><strong>{fc(lb.fecha)}</strong></div>
        <div><span>Costo directo base</span><strong>{m} {fmt(lb.costoDirecto)}</strong></div>
        <div><span>Subtotal contractual</span><strong>{m} {fmt(lb.subtotal)}</strong></div>
        <div><span>Plazo base</span><strong>{lb.plazoDias} días · {fc(lb.inicio)} – {fc(lb.fin)}</strong></div>
        <div className="separador" />
        <div className="fila-flex">
          <button
            className="boton chico"
            onClick={() => {
              if (!confirm('¿Volver a congelar la línea base con el presupuesto y cronograma actuales? Los cortes se conservan, pero el valor ganado se recalcula contra la nueva base.')) return;
              mut((d) => { d.lineaBase = crearLineaBase(r, 'Línea base actualizada'); });
              ctx.avisar('Línea base actualizada');
            }}
          >
            Actualizar línea base
          </button>
          <button
            className="boton chico peligro"
            onClick={() => {
              if (!confirm('¿Borrar la línea base y todos los datos de control (cortes, Last Planner, lean, six sigma)? No afecta el expediente.')) return;
              ctx.actualizar((d) => { delete d.control; });
            }}
          >
            Borrar control
          </button>
        </div>
      </div>
      <div className="seccion-titulo">Cortes de avance</div>
      <div className="lista-cortes">
        {cortes.map((k) => (
          <button key={k.id} className="chip" aria-pressed={k.id === selId} onClick={() => setSel(k.id)}>{k.nombre} · {fechaCortaDM(k.fecha)}</button>
        ))}
        <button className="boton chico" onClick={nuevoCorte}><IconoMas /> Nuevo corte</button>
      </div>
      {!sel ? (
        <div className="vacio"><p>Registre un corte (normalmente cada semana) con el metrado ejecutado de cada partida y el costo real del periodo.</p></div>
      ) : (
        <>
          <div className="rejilla" style={{ marginBottom: 12 }}>
            <Campo etiqueta="Nombre"><EntradaTexto valor={sel.nombre} alCambiar={(v) => editar((k) => { k.nombre = v; })} /></Campo>
            <Campo etiqueta="Fecha de corte"><EntradaTexto type="date" valor={sel.fecha} alCambiar={(v) => v && editar((k) => { k.fecha = v; })} /></Campo>
            <Campo etiqueta={`Costo real del periodo (${m}, sin IGV)`} ayuda="Gasto real (AC) para el CPI; déjelo vacío si aún no lo tiene"><EntradaNumero valor={sel.costoReal} alCambiar={(v) => editar((k) => { k.costoReal = v; })} /></Campo>
            <Campo etiqueta="Nota"><EntradaTexto valor={sel.nota} alCambiar={(v) => editar((k) => { k.nota = v; })} /></Campo>
          </div>
          <div className="fila-flex" style={{ marginBottom: 8 }}>
            <label className="casilla"><input type="checkbox" checked={soloProgramadas} onChange={(e) => setSolo(e.target.checked)} /> Solo partidas ya programadas a la fecha de corte</label>
            <span className="separador" />
            <span className="pequeno">Valorizado en este corte: <strong>{m} {fmt(montoCorte)}</strong></span>
            <button className="boton chico peligro" onClick={() => { if (confirm(`¿Eliminar el corte «${sel.nombre}»?`)) { mut((d) => { d.cortes = d.cortes.filter((x) => x.id !== sel.id); }); setSel(null); } }}>Eliminar corte</button>
          </div>
          <TablaEditable filas={filas} columnas={cols} clave={(b) => b.id} alto="calc(100vh - 420px)" etiqueta="Metrado ejecutado por partida" />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ valor ganado

function CurvaControl({ ctx }: { ctx: Contexto }) {
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const evm = useMemo(() => calcularEvm(r, c), [r, c]);
  if (!evm || !c.lineaBase) return null;
  const lb = c.lineaBase;
  const x = (iso: string) => difDias(lb.inicio, iso);
  const bac = evm.bac || 1;
  const series = [
    { nombre: 'Programado (PV)', color: COLOR.plan, puntos: evm.curvaPlan.map((p) => ({ x: x(p.fecha), y: p.pct })) },
    { nombre: 'Ganado (EV)', color: COLOR.real, marcadores: true, etiquetas: evm.puntos.length <= 12, puntos: [{ x: 0, y: 0 }, ...evm.puntos.map((p) => ({ x: x(p.fecha), y: p.evPct }))] },
  ];
  if (evm.puntos.every((p) => p.ac !== null)) series.push({ nombre: 'Costo real (AC)', color: COLOR.costo, marcadores: true, etiquetas: false, puntos: [{ x: 0, y: 0 }, ...evm.puntos.map((p) => ({ x: x(p.fecha), y: ((p.ac ?? 0) / bac) * 100 }))] } as never);
  return <GraficoLineas titulo="Curva S: programado, ganado y costo real" series={series} etiquetaX={(d) => fechaCortaDM(sumarDias(lb.inicio, Math.round(d)))} yMax={100} formatoY={(v) => `${fmt(v, 0)}%`} />;
}

function ValorGanado({ ctx }: { ctx: Contexto }) {
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const evm = useMemo(() => calcularEvm(r, c), [r, c]);
  const u = evm?.ultimo;
  return (
    <>
      {u && (
        <div className="indicadores">
          <Indicador titulo="Valor planificado (PV)" valor={fmt(u.pv, 0)} detalle={pct(u.pvPct)} />
          <Indicador titulo="Valor ganado (EV)" valor={fmt(u.ev, 0)} detalle={pct(u.evPct)} />
          <Indicador titulo="Costo real (AC)" valor={u.ac === null ? '—' : fmt(u.ac, 0)} />
          <Indicador titulo="SV = EV − PV" valor={fmt(u.sv, 0)} estado={u.sv >= 0 ? 'ok' : 'error'} />
          <Indicador titulo="CV = EV − AC" valor={u.cv === null ? '—' : fmt(u.cv, 0)} estado={u.cv === null ? 'neutra' : u.cv >= 0 ? 'ok' : 'error'} />
          <Indicador titulo="TCPI" valor={ind(u.tcpi)} detalle="CPI necesario para terminar en presupuesto" estado={u.tcpi === null ? 'neutra' : u.tcpi <= 1 ? 'ok' : u.tcpi <= 1.1 ? 'advertencia' : 'error'} />
        </div>
      )}
      {u && (
        <>
          <div className="seccion-titulo">Earned Schedule <span className="pequeno">· tiempo medido con la curva PV de la línea base, en días laborables</span></div>
          <div className="indicadores">
            <Indicador titulo="SPI clásico (EV ÷ PV)" valor={ind(u.spi)} detalle="Tiende a 1 al final aunque haya atraso" estado={estadoIndice(u.spi)} />
            <Indicador titulo="ES · cronograma ganado" valor={`${fmt(u.es, 1)} d`} detalle={`AT = ${u.at} d transcurridos · PD = ${evm!.pd} d`} />
            <Indicador titulo="SPI(t) = ES ÷ AT" valor={ind(u.spiT)} estado={estadoIndice(u.spiT)} />
            <Indicador titulo="SV(t) = ES − AT" valor={`${fmt(u.svT, 1)} d`} estado={u.svT >= -0.05 ? 'ok' : u.svT >= -5 ? 'advertencia' : 'error'} />
            <Indicador titulo="IEAC(t) = PD ÷ SPI(t)" valor={u.ieacT === null ? '—' : `${fmt(u.ieacT, 1)} d`} detalle={`Termina el ${fc(u.finEstimadoES)}`} estado={u.ieacT === null ? 'neutra' : u.ieacT <= evm!.pd + 0.05 ? 'ok' : u.ieacT <= evm!.pd * 1.05 ? 'advertencia' : 'error'} />
          </div>
        </>
      )}
      <CurvaControl ctx={ctx} />
      <p className="pequeno">El valor ganado de cada partida es el metrado ejecutado (hasta el metrado base) por su precio unitario base. El valor planificado reparte cada partida en sus días laborables del cronograma base.</p>
      <VistaTabla t={tablaEvm(r, c)} alto="320px" />
      <div className="seccion-titulo">Avance por partida al último corte</div>
      <VistaTabla t={tablaAvancePartidas(r, c)} alto="calc(100vh - 360px)" />
    </>
  );
}

// ------------------------------------------------------------------ valorizaciones

function Valorizaciones({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const vals = useMemo(() => calcularValorizaciones(r, c), [r, c]);
  const meses = vals.map((v) => v.mes);
  const [mesSel, setMes] = useState<string | null>(null);
  const det = vals.find((v) => v.mes === (mesSel ?? meses[meses.length - 1]));
  const indices = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const mo of r.polinomica.monomios) for (const ix of mo.indices) vistos.set(ix.iu, ix.nombre);
    return [...vistos.entries()].map(([iu, nombre]) => ({ iu, nombre }));
  }, [r.polinomica]);
  const ponerIndice = (clave: string, iu: string, v: number | null) =>
    mut((d) => {
      d.indices[clave] = d.indices[clave] ?? {};
      if (v === null) delete d.indices[clave][iu];
      else d.indices[clave][iu] = v;
    });
  const cols: Columna<{ iu: string; nombre: string }>[] = [
    { clave: 'iu', titulo: 'IU', ancho: 50, valor: (x) => x.iu },
    { clave: 'n', titulo: 'Índice unificado', valor: (x) => x.nombre },
    { clave: 'base', titulo: 'Io (base)', tipo: 'numero', ancho: 92, decimales: 2, valor: (x) => c.indices.base?.[x.iu] ?? null, cambiar: (x, v) => ponerIndice('base', x.iu, v as number | null) },
    ...meses.map((mes) => ({ clave: mes, titulo: `Ir ${mes}`, tipo: 'numero' as const, ancho: 92, decimales: 2, valor: (x: { iu: string }) => c.indices[mes]?.[x.iu] ?? null, cambiar: (x: { iu: string }, v: unknown) => ponerIndice(mes, x.iu, v as number | null) })),
  ];
  return (
    <>
      <p className="pequeno" style={{ marginTop: 0 }}>
        Cada mes se valoriza el metrado de los cortes de ese mes, hasta el metrado contractual, a precios base. Se agregan los gastos generales y la utilidad en la misma proporción del presupuesto, el reajuste con la fórmula polinómica (K = Σ coeficiente × Ir/Io) y la amortización proporcional de los adelantos. Revise las deducciones adicionales que exija su contrato.
      </p>
      {!vals.length ? (
        <div className="vacio"><p>Registre cortes de avance para generar las valorizaciones.</p></div>
      ) : (
        <>
          <div className="seccion-titulo">Índices unificados para el reajuste</div>
          <TablaEditable filas={indices} columnas={cols} clave={(x) => x.iu} etiqueta="Índices unificados" />
          {vals.some((v) => v.indicesFaltantes.length) && <div className="aviso advertencia" style={{ marginTop: 10 }}>Faltan índices en {vals.filter((v) => v.indicesFaltantes.length).map((v) => v.mes).join(', ')}: esos meses se muestran sin reajuste (K vacío).</div>}
          <div className="seccion-titulo">Resumen de valorizaciones</div>
          <VistaTabla t={tablaValorizaciones(r, c)} alto="300px" />
          <div className="seccion-titulo">Detalle por partida</div>
          <div className="lista-cortes">
            {vals.map((v) => <button key={v.mes} className="chip" aria-pressed={v.mes === det?.mes} onClick={() => setMes(v.mes)}>N.° {v.numero} · {mesAnioLargo(v.mes + '-01')}</button>)}
          </div>
          {det && (
            <TablaEditable
              filas={det.partidas}
              clave={(x) => x.base.id}
              etiqueta="Valorización por partida"
              columnas={[
                { clave: 'c', titulo: 'Ítem', ancho: 70, valor: (x) => x.base.codigo },
                { clave: 'd', titulo: 'Descripción', valor: (x) => x.base.descripcion },
                { clave: 'u', titulo: 'Und.', ancho: 50, valor: (x) => x.base.unidad },
                { clave: 'pu', titulo: 'P. U.', num: true, ancho: 90, valor: (x) => x.base.pu },
                { clave: 'm', titulo: 'Metrado del mes', num: true, ancho: 100, valor: (x) => x.metrado },
                { clave: 'mo', titulo: 'Monto', num: true, ancho: 110, valor: (x) => x.monto },
                { clave: 'a', titulo: '% acumulado', num: true, ancho: 90, valor: (x) => x.acumuladoPct },
                { clave: 'mm', titulo: 'Mayor metrado', num: true, ancho: 100, valor: (x) => x.mayorMetrado || null, clase: (x) => (x.mayorMetrado > 0 ? 'mal' : undefined) },
              ]}
            />
          )}
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ cambios

function Cambios({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const s = resumirCambios(r, c);
  const m = r.proyecto.meta.moneda;
  type C = (typeof c.cambios)[number];
  const set = (x: C, campo: keyof C, v: unknown) => mut((d) => { const y = d.cambios.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[campo] = v; });
  return (
    <>
      <div className="cifras">
        <div><span>Monto contractual</span><strong>{m} {fmt(s.contractual)}</strong></div>
        <div><span>Adicionales aprobados</span><strong>{m} {fmt(s.adicionales)}</strong></div>
        <div><span>Deductivos aprobados</span><strong>{m} {fmt(s.deductivos)}</strong></div>
        <div><span>Presupuesto vigente</span><strong>{m} {fmt(s.vigente)}</strong></div>
        <div><span>Incidencia neta</span><strong>{fmt(s.incidenciaPct, 2)} %</strong></div>
        <div><span>Plazo vigente</span><strong>{s.plazoVigente} días (+{s.ampliacionDias})</strong></div>
        <div><span>Pendientes de aprobación</span><strong>{s.pendientes}</strong></div>
      </div>
      {s.alerta && <div className="aviso advertencia">{s.alerta}</div>}
      <div className="herramientas" style={{ marginBottom: 8 }}>
        <button className="boton chico" onClick={() => mut((d) => void d.cambios.push({ id: uid('cmb'), numero: `ADC-${String(d.cambios.length + 1).padStart(2, '0')}`, tipo: 'adicional', fecha: hoyIso(), descripcion: '', causa: '', monto: 0, plazoDias: 0, estado: 'propuesto' }))}><IconoMas /> Nuevo cambio</button>
        <span className="pequeno">Montos sin IGV. Los deductivos se ingresan en positivo.</span>
      </div>
      <TablaEditable
        filas={c.cambios}
        clave={(x) => x.id}
        etiqueta="Control de cambios"
        alEliminar={(x) => mut((d) => { d.cambios = d.cambios.filter((y) => y.id !== x.id); })}
        vacio={<div className="vacio"><p>Sin adicionales, deductivos ni ampliaciones de plazo.</p></div>}
        columnas={[
          { clave: 'n', titulo: 'N.°', ancho: 80, tipo: 'texto', valor: (x) => x.numero, cambiar: (x, v) => set(x, 'numero', v) },
          { clave: 't', titulo: 'Tipo', ancho: 120, tipo: 'select', opciones: [{ valor: 'adicional', texto: 'Adicional' }, { valor: 'deductivo', texto: 'Deductivo' }, { valor: 'ampliacion', texto: 'Ampliación de plazo' }, { valor: 'otro', texto: 'Otro cambio' }], valor: (x) => x.tipo, cambiar: (x, v) => set(x, 'tipo', v) },
          { clave: 'f', titulo: 'Fecha', ancho: 130, tipo: 'fecha', valor: (x) => x.fecha, cambiar: (x, v) => set(x, 'fecha', v) },
          { clave: 'd', titulo: 'Descripción', tipo: 'texto', valor: (x) => x.descripcion, cambiar: (x, v) => set(x, 'descripcion', v) },
          { clave: 'c', titulo: 'Causa', ancho: 160, tipo: 'texto', lista: 'causas-cambio', valor: (x) => x.causa, cambiar: (x, v) => set(x, 'causa', v) },
          { clave: 'm', titulo: `Monto (${m})`, ancho: 110, tipo: 'numero', valor: (x) => x.monto, cambiar: (x, v) => set(x, 'monto', num(v)) },
          { clave: 'p', titulo: 'Plazo (d)', ancho: 70, tipo: 'numero', decimales: 0, valor: (x) => x.plazoDias, cambiar: (x, v) => set(x, 'plazoDias', num(v)) },
          { clave: 'e', titulo: 'Estado', ancho: 110, tipo: 'select', opciones: [{ valor: 'propuesto', texto: 'Propuesto' }, { valor: 'aprobado', texto: 'Aprobado' }, { valor: 'rechazado', texto: 'Rechazado' }], valor: (x) => x.estado, cambiar: (x, v) => set(x, 'estado', v) },
        ]}
      />
      <datalist id="causas-cambio">{['Deficiencia del expediente', 'Condición de terreno', 'Cambio de diseño', 'Pedido del cliente', 'Mayor metrado', 'Caso fortuito o fuerza mayor', 'Atraso en aprobaciones'].map((x) => <option key={x} value={x} />)}</datalist>
    </>
  );
}

// ------------------------------------------------------------------ riesgos

function Riesgos({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const m = ctx.resultados.proyecto.meta.moneda;
  const set = (x: Riesgo, campo: keyof Riesgo, v: unknown) => mut((d) => { const y = d.riesgos.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[campo] = v; });
  const escala = [1, 2, 3, 4, 5].map((n) => ({ valor: String(n), texto: String(n) }));
  const abiertos = c.riesgos.filter((x) => x.estado !== 'cerrado');
  const contingencia = abiertos.reduce((s, x) => s + num(x.contingencia), 0);
  return (
    <>
      <div className="dos-columnas">
        <div>
          <MatrizRiesgos riesgos={abiertos} />
        </div>
        <div>
          <div className="cifras" style={{ borderBottom: 0 }}>
            <div><span>Riesgos abiertos</span><strong>{abiertos.length}</strong></div>
            <div><span>Críticos</span><strong>{abiertos.filter((x) => nivelRiesgo(x) >= 15).length}</strong></div>
            <div><span>Contingencia</span><strong>{m} {fmt(contingencia)}</strong></div>
          </div>
          <p className="pequeno">Nivel = probabilidad × impacto (1 a 5 cada uno): bajo hasta 4, moderado de 5 a 9, alto de 10 a 14 y crítico desde 15.</p>
          <button
            className="boton chico"
            disabled={!contingencia}
            title="Agrega la contingencia de los riesgos abiertos como gasto general fijo del expediente"
            onClick={() => {
              if (!confirm(`¿Agregar ${m} ${fmt(contingencia)} de contingencia a los gastos generales fijos del expediente?`)) return;
              ctx.actualizar((d) => void d.gg.push({ id: uid('gg'), grupo: 'fijo', rubro: 'Contingencias', descripcion: 'Reserva de contingencia por riesgos identificados', unidad: 'glb', cantidad: 1, duracion: 1, precio: Math.round(contingencia * 100) / 100, participacion: 100 }));
              ctx.avisar('Contingencia agregada a los gastos generales');
            }}
          >
            Llevar la contingencia a gastos generales
          </button>
        </div>
      </div>
      <div className="herramientas" style={{ margin: '10px 0 8px' }}>
        <button className="boton chico" onClick={() => mut((d) => void d.riesgos.push({ id: uid('rsg'), descripcion: '', categoria: '', probabilidad: 3, impacto: 3, respuesta: 'mitigar', accion: '', responsable: '', contingencia: 0, estado: 'abierto' }))}><IconoMas /> Nuevo riesgo</button>
      </div>
      <TablaEditable
        filas={[...c.riesgos].sort((a, b) => nivelRiesgo(b) - nivelRiesgo(a))}
        clave={(x) => x.id}
        etiqueta="Registro de riesgos"
        alEliminar={(x) => mut((d) => { d.riesgos = d.riesgos.filter((y) => y.id !== x.id); })}
        vacio={<div className="vacio"><p>Registre los riesgos del proyecto: clima, permisos, suministros, diseño, seguridad, costos…</p></div>}
        columnas={[
          { clave: 'cat', titulo: 'Categoría', ancho: 120, tipo: 'texto', lista: 'cat-riesgo', valor: (x) => x.categoria, cambiar: (x, v) => set(x, 'categoria', v) },
          { clave: 'd', titulo: 'Riesgo', tipo: 'texto', valor: (x) => x.descripcion, cambiar: (x, v) => set(x, 'descripcion', v) },
          { clave: 'p', titulo: 'P', ancho: 56, tipo: 'select', opciones: escala, valor: (x) => String(x.probabilidad), cambiar: (x, v) => set(x, 'probabilidad', num(v)) },
          { clave: 'i', titulo: 'I', ancho: 56, tipo: 'select', opciones: escala, valor: (x) => String(x.impacto), cambiar: (x, v) => set(x, 'impacto', num(v)) },
          { clave: 'n', titulo: 'Nivel', ancho: 90, valor: (x) => nivelRiesgo(x), formato: (x) => { const k = claseRiesgo(nivelRiesgo(x)); return <span className={`nivel ${k.clave}`}>{nivelRiesgo(x)} · {k.texto}</span>; } },
          { clave: 'r', titulo: 'Respuesta', ancho: 110, tipo: 'select', opciones: [{ valor: 'evitar', texto: 'Evitar' }, { valor: 'mitigar', texto: 'Mitigar' }, { valor: 'transferir', texto: 'Transferir' }, { valor: 'aceptar', texto: 'Aceptar' }], valor: (x) => x.respuesta, cambiar: (x, v) => set(x, 'respuesta', v) },
          { clave: 'a', titulo: 'Acción', tipo: 'texto', valor: (x) => x.accion, cambiar: (x, v) => set(x, 'accion', v) },
          { clave: 'res', titulo: 'Responsable', ancho: 120, tipo: 'texto', valor: (x) => x.responsable, cambiar: (x, v) => set(x, 'responsable', v) },
          { clave: 'c', titulo: `Contingencia (${m})`, ancho: 110, tipo: 'numero', valor: (x) => x.contingencia, cambiar: (x, v) => set(x, 'contingencia', num(v)) },
          { clave: 'e', titulo: 'Estado', ancho: 96, tipo: 'select', opciones: [{ valor: 'abierto', texto: 'Abierto' }, { valor: 'cerrado', texto: 'Cerrado' }], valor: (x) => x.estado, cambiar: (x, v) => set(x, 'estado', v) },
        ]}
      />
      <datalist id="cat-riesgo">{['Clima', 'Permisos', 'Suministros', 'Diseño', 'Seguridad', 'Costos', 'Subcontratos', 'Social', 'Ambiental', 'Geotecnia'].map((x) => <option key={x} value={x} />)}</datalist>
    </>
  );
}

// ------------------------------------------------------------------ recursos

function Recursos({ ctx }: { ctx: Contexto }) {
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const sem = useMemo(() => recursosSemanales(r, c), [r, c]);
  const max = r.proyecto.meta.personalMaximo;
  if (!sem.length) return <div className="vacio"><p>El cronograma aún no tiene actividades con metrado.</p></div>;
  return (
    <>
      <p className="pequeno" style={{ marginTop: 0 }}>Horas-hombre previstas por semana según los APU y el cronograma actual; las reales vienen de las mediciones de rendimiento del módulo Ejecución lean.</p>
      <div className="seccion-titulo">Trabajadores promedio por semana</div>
      <GraficoBarras
        titulo="Trabajadores promedio por semana: plan y real"
        datos={sem.map((s) => ({ etiqueta: fechaCortaDM(s.lunes), valor: s.trabajadoresPlan }))}
        segunda={sem.some((s) => s.trabajadoresReal) ? { nombre: 'Real (mediciones)', primera: 'Plan', valores: sem.map((s) => s.trabajadoresReal), color: COLOR.real } : undefined}
        formato={(v) => fmt(v, 1)}
        referencia={max ? { y: max, texto: `Máximo indicado: ${max}` } : undefined}
      />
      <div className="seccion-titulo">Horas-máquina de equipos por semana</div>
      <GraficoBarras titulo="Horas-máquina por semana" datos={sem.map((s) => ({ etiqueta: fechaCortaDM(s.lunes), valor: s.hmPlan }))} formato={(v) => fmt(v, 0)} colorDe={() => COLOR.ocre} alto={170} />
      <VistaTabla t={tablaRecursos(r, c)} alto="320px" />
    </>
  );
}

// ------------------------------------------------------------------ cuaderno, RFI y actas

function Registros({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const [filtro, setFiltro] = useState<'todos' | RegistroObra['tipo']>('todos');
  const hoy = hoyIso();
  const set = (x: RegistroObra, campo: keyof RegistroObra, v: unknown) => mut((d) => { const y = d.registros.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[campo] = v; });
  const nuevo = (tipo: RegistroObra['tipo']) =>
    mut((d) => {
      const n = d.registros.filter((x) => x.tipo === tipo).length + 1;
      const pref = { asiento: '', rfi: 'RFI-', acta: 'ACTA-', ocurrencia: 'OC-' }[tipo];
      d.registros.push({ id: uid('reg'), tipo, numero: `${pref}${String(n).padStart(3, '0')}`, fecha: hoy, asunto: '', detalle: '', autor: '', destinatario: '', fechaLimite: tipo === 'rfi' ? sumarDias(hoy, 3) : '', respuesta: '', fechaRespuesta: '', estado: 'abierto' });
    });
  const filas = c.registros.filter((x) => filtro === 'todos' || x.tipo === filtro).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <>
      <div className="herramientas" style={{ marginBottom: 8 }}>
        <button className="boton chico" onClick={() => nuevo('asiento')}><IconoMas /> Asiento de cuaderno</button>
        <button className="boton chico" onClick={() => nuevo('rfi')}><IconoMas /> Consulta (RFI)</button>
        <button className="boton chico" onClick={() => nuevo('acta')}><IconoMas /> Acta</button>
        <button className="boton chico" onClick={() => nuevo('ocurrencia')}><IconoMas /> Ocurrencia</button>
        <span className="separador" />
        <select className="entrada" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtrar por tipo" style={{ width: 170 }}>
          <option value="todos">Todos</option>
          {opciones(['asiento', 'rfi', 'acta', 'ocurrencia']).map((o) => <option key={o.valor} value={o.valor}>{{ asiento: 'Asientos', rfi: 'Consultas (RFI)', acta: 'Actas', ocurrencia: 'Ocurrencias' }[o.valor]}</option>)}
        </select>
      </div>
      <TablaEditable
        filas={filas}
        clave={(x) => x.id}
        etiqueta="Cuaderno de obra, consultas y actas"
        alEliminar={(x) => mut((d) => { d.registros = d.registros.filter((y) => y.id !== x.id); })}
        claseFila={(x) => (x.estado === 'abierto' && x.fechaLimite && x.fechaLimite < hoy ? 'lista-no' : undefined)}
        vacio={<div className="vacio"><p>Registre asientos del cuaderno de obra, consultas (RFI) con su plazo de respuesta, actas y ocurrencias.</p></div>}
        columnas={[
          { clave: 't', titulo: 'Tipo', ancho: 110, valor: (x) => ({ asiento: 'Asiento', rfi: 'RFI', acta: 'Acta', ocurrencia: 'Ocurrencia' })[x.tipo] },
          { clave: 'n', titulo: 'N.°', ancho: 82, tipo: 'texto', valor: (x) => x.numero, cambiar: (x, v) => set(x, 'numero', v) },
          { clave: 'f', titulo: 'Fecha', ancho: 128, tipo: 'fecha', valor: (x) => x.fecha, cambiar: (x, v) => set(x, 'fecha', v) },
          { clave: 'a', titulo: 'Asunto', tipo: 'texto', valor: (x) => x.asunto, cambiar: (x, v) => set(x, 'asunto', v) },
          { clave: 'd', titulo: 'Detalle', tipo: 'texto', valor: (x) => x.detalle, cambiar: (x, v) => set(x, 'detalle', v) },
          { clave: 'de', titulo: 'De', ancho: 110, tipo: 'texto', valor: (x) => x.autor, cambiar: (x, v) => set(x, 'autor', v) },
          { clave: 'pa', titulo: 'Para', ancho: 110, tipo: 'texto', valor: (x) => x.destinatario, cambiar: (x, v) => set(x, 'destinatario', v) },
          { clave: 'pl', titulo: 'Plazo', ancho: 128, tipo: 'fecha', valor: (x) => x.fechaLimite, cambiar: (x, v) => set(x, 'fechaLimite', v) },
          { clave: 'r', titulo: 'Respuesta', tipo: 'texto', valor: (x) => x.respuesta, cambiar: (x, v) => set(x, 'respuesta', v) },
          { clave: 'fr', titulo: 'Respondido', ancho: 128, tipo: 'fecha', valor: (x) => x.fechaRespuesta, cambiar: (x, v) => set(x, 'fechaRespuesta', v) },
          { clave: 'e', titulo: 'Estado', ancho: 110, tipo: 'select', opciones: [{ valor: 'abierto', texto: 'Abierto' }, { valor: 'respondido', texto: 'Respondido' }, { valor: 'cerrado', texto: 'Cerrado' }], valor: (x) => x.estado, cambiar: (x, v) => set(x, 'estado', v) },
        ]}
      />
      <p className="pequeno">Las filas marcadas en rojo tienen el plazo de respuesta vencido. Las consultas pendientes también aparecen en el tablero.</p>
    </>
  );
}
