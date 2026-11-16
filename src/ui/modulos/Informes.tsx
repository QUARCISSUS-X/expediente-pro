// Informes de obra: informe semanal o mensual del periodo elegido (PDF y Word), constructor de reportes con plantillas
// guardadas, llenado de una plantilla de Word propia con marcadores y fotos y adjuntos por partida, protocolo o asiento.
import { useMemo, useState } from 'react';
import { type Adjunto, hoyIso, type PlantillaInforme, type SeccionInforme } from '../../engine/control';
import { datosInforme, MARCADORES_INFORME, NOMBRE_SECCION, periodoDe, periodosConAvance, plantillaInicial, SECCIONES_INFORME, type TipoInforme, variablesInforme } from '../../engine/informe';
import { fechaCorta, fmt, uid } from '../../engine/util';
import { informePdf, informeWord, llenarPlantillaWord, nombreInforme } from '../../export/informeObra';
import { renderPdfBrowser } from '../../export/render-browser';
import { IconoAbajo, IconoArriba, Pestanas, TablaEditable } from '../componentes';
import { fc, ind, opcionesPartidas, pct, useControl } from '../control';
import { descargar, elegirArchivo, elegirArchivos, type Contexto } from '../estado';
import { COLOR, GraficoLineas, Indicador } from '../graficos';
import { eliminarAdjunto, guardarAdjunto, imagenesDe, leerAdjunto } from '../adjuntos';

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function ModInformes({ ctx }: { ctx: Contexto }) {
  const [pest, setPest] = useState<'informe' | 'adjuntos'>('informe');
  const { c } = useControl(ctx);
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Informes de obra</h1>
          <p className="proposito">Informe semanal o mensual armado del periodo elegido: avance, curva S real contra programada, valor ganado, PPC y causas, restricciones, calidad, cambios, cuaderno y fotos. Elija las secciones y su orden, guarde la combinación como plantilla o llene su propio formato de Word.</p>
        </div>
      </div>
      <Pestanas valor={pest} alCambiar={setPest} opciones={[{ id: 'informe', texto: 'Informe del periodo' }, { id: 'adjuntos', texto: `Fotos y adjuntos (${c.adjuntos.length})` }]} />
      {pest === 'informe' ? <Informe ctx={ctx} /> : <Adjuntos ctx={ctx} />}
    </div>
  );
}

function Informe({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const hoy = hoyIso();
  const [tipo, setTipo] = useState<TipoInforme>('mensual');
  const periodos = useMemo(() => periodosConAvance(r, tipo), [r, tipo]);
  const [inicioSel, setInicioSel] = useState('');
  const inicioObra = c.lineaBase?.inicio ?? r.proyecto.meta.fechaInicio ?? hoy;
  const periodo = periodos.find((p) => p.inicio === inicioSel) ?? periodos[0] ?? periodoDe(tipo, hoy, inicioObra);
  const [plId, setPlId] = useState('');
  const guardadas = c.plantillasInforme.filter((x) => x.tipo === tipo);
  const base = guardadas.find((x) => x.id === plId) ?? plantillaInicial(tipo);
  const [edicion, setEdicion] = useState<PlantillaInforme | null>(null);
  const pl = edicion && edicion.tipo === tipo && edicion.id === base.id ? edicion : base;
  const d = useMemo(() => datosInforme(r, periodo), [r, periodo]);
  const t = d.tablero;
  const [ocupado, setOcupado] = useState(false);

  const cambiarPl = (f: (x: PlantillaInforme) => PlantillaInforme) => setEdicion(f(pl));
  const mover = (i: number, k: number) => cambiarPl((x) => { const s = [...x.secciones]; const j = i + k; if (j < 0 || j >= s.length) return x; [s[i], s[j]] = [s[j], s[i]]; return { ...x, secciones: s }; });
  const alternar = (id: SeccionInforme) => cambiarPl((x) => ({ ...x, secciones: x.secciones.includes(id) ? x.secciones.filter((s) => s !== id) : [...x.secciones, id] }));
  const guardarComo = () => {
    const nombre = window.prompt('Nombre de la plantilla del informe:', pl.id.startsWith('pli-') ? `Mi informe ${tipo}` : pl.nombre);
    if (!nombre) return;
    const existe = c.plantillasInforme.find((x) => x.nombre === nombre && x.tipo === tipo);
    const nueva: PlantillaInforme = { ...pl, id: existe?.id ?? uid('pli'), nombre };
    mut((dd) => { dd.plantillasInforme = [...dd.plantillasInforme.filter((x) => x.id !== nueva.id), nueva]; });
    setPlId(nueva.id);
    setEdicion(null);
    ctx.avisar(`Plantilla «${nombre}» guardada`);
  };
  const eliminarPl = () => {
    if (!guardadas.some((x) => x.id === pl.id) || !window.confirm(`¿Eliminar la plantilla «${pl.nombre}»?`)) return;
    mut((dd) => { dd.plantillasInforme = dd.plantillasInforme.filter((x) => x.id !== pl.id); });
    setPlId('');
    setEdicion(null);
  };

  const generar = async (formato: 'pdf' | 'docx' | 'propia') => {
    let plantilla: File | null = null;
    if (formato === 'propia') {
      plantilla = await elegirArchivo('.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      if (!plantilla) return;
    }
    setOcupado(true);
    try {
      const imagenes = pl.secciones.includes('fotos') && d.fotos.length ? await imagenesDe(d.fotos).catch(() => ({})) : {};
      if (formato === 'pdf') descargar(nombreInforme(r, d, 'pdf'), await renderPdfBrowser(informePdf(r, d, { plantilla: pl, imagenes })), 'application/pdf');
      else if (formato === 'docx') descargar(nombreInforme(r, d, 'docx'), await informeWord(r, d, { plantilla: pl, imagenes }), MIME_DOCX);
      else {
        const { datos, faltantes } = await llenarPlantillaWord(new Uint8Array(await plantilla!.arrayBuffer()), variablesInforme(r, d, hoy));
        descargar(nombreInforme(r, d, 'docx'), datos, MIME_DOCX);
        if (faltantes.length) ctx.avisar(`Marcadores que el programa no conoce (quedaron sin llenar): ${faltantes.map((x) => `{{${x}}}`).join(', ')}`, true);
      }
      if (formato !== 'propia') ctx.avisar('Informe descargado');
    } catch (e) {
      ctx.avisar(`No se pudo generar el informe: ${(e as Error).message}`, true);
    } finally {
      setOcupado(false);
    }
  };

  const curva = d.curva.map((p, i) => ({ i, ...p }));
  return (
    <>
      <div className="fila-flex" style={{ gap: 10, margin: '8px 0 12px', flexWrap: 'wrap' }}>
        <label className="pequeno">Informe{' '}
          <select className="entrada" style={{ width: 130 }} value={tipo} onChange={(e) => { setTipo(e.target.value as TipoInforme); setInicioSel(''); setPlId(''); setEdicion(null); }} aria-label="Tipo de informe">
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
          </select>
        </label>
        <label className="pequeno">Periodo{' '}
          <select className="entrada" style={{ width: 280 }} value={periodo.inicio} onChange={(e) => setInicioSel(e.target.value)} aria-label="Periodo del informe">
            {!periodos.some((p) => p.inicio === periodo.inicio) && <option value={periodo.inicio}>{periodo.titulo} (sin avance)</option>}
            {periodos.map((p) => <option key={p.inicio} value={p.inicio}>{p.titulo} · {tipo === 'semanal' ? 'semana' : 'mes'} {p.numero}</option>)}
          </select>
        </label>
        <span className="separador" />
        <button className="boton primario" disabled={ocupado} onClick={() => void generar('pdf')}>Informe (PDF)</button>
        <button className="boton" disabled={ocupado} onClick={() => void generar('docx')}>Informe (Word)</button>
        <button className="boton" disabled={ocupado} onClick={() => void generar('propia')} title="Elija un .docx con marcadores como {{avance_real}} y el programa lo llena">Llenar mi plantilla de Word…</button>
      </div>
      {!t.hayLineaBase && <div className="vacio"><p>El proyecto no tiene línea base. Congélela en «Control y valor ganado» para que el informe mida el avance.</p></div>}
      <div className="indicadores">
        <Indicador titulo="Avance del periodo" valor={pct(d.avancePeriodoReal)} detalle={`Programado ${pct(d.avancePeriodoProgramado)}`} />
        <Indicador titulo="Avance acumulado" valor={pct(t.avanceReal)} detalle={`Programado ${pct(t.avanceProgramado)}`} />
        <Indicador titulo="SPI / CPI" valor={`${ind(t.spi, 3)} / ${ind(t.cpi, 3)}`} detalle={`Al ${fc(t.ultimoCorte ?? '')}`} estado={t.spi === null ? 'neutra' : Math.min(t.spi, t.cpi ?? 1) >= 0.95 ? 'ok' : Math.min(t.spi, t.cpi ?? 1) >= 0.85 ? 'advertencia' : 'error'} />
        <Indicador titulo="PPC" valor={pct(d.ppc.length ? d.ppc[d.ppc.length - 1].ppc : null, 0)} detalle={`${d.ppc.length} semanas en el periodo`} />
        <Indicador titulo="Fotos del periodo" valor={d.fotos.length} detalle={`${d.registros.length} asientos · ${d.protocolos.length} protocolos`} />
      </div>
      <div className="fila-flex" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div className="panel" style={{ padding: '10px 14px', minWidth: 330, flex: '0 1 380px' }}>
          <h3 style={{ marginTop: 0 }}>Constructor del informe</h3>
          <div className="fila-flex" style={{ gap: 6, marginBottom: 8 }}>
            <select className="entrada" value={pl.id} onChange={(e) => { setPlId(e.target.value); setEdicion(null); }} aria-label="Plantilla del informe">
              <option value={plantillaInicial(tipo).id}>{plantillaInicial(tipo).nombre}</option>
              {guardadas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
            <button className="boton chico" onClick={guardarComo}>Guardar como…</button>
            {guardadas.some((x) => x.id === pl.id) && <button className="boton chico" onClick={eliminarPl}>Eliminar</button>}
          </div>
          <ol className="lista-secciones" style={{ paddingLeft: 18, margin: '0 0 8px' }}>
            {pl.secciones.map((s, i) => (
              <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ flex: 1 }}>{NOMBRE_SECCION[s]}</span>
                <button className="boton icono chico" aria-label={`Subir ${NOMBRE_SECCION[s]}`} onClick={() => mover(i, -1)} disabled={i === 0}><IconoArriba /></button>
                <button className="boton icono chico" aria-label={`Bajar ${NOMBRE_SECCION[s]}`} onClick={() => mover(i, 1)} disabled={i === pl.secciones.length - 1}><IconoAbajo /></button>
                <button className="boton chico" onClick={() => alternar(s)}>Quitar</button>
              </li>
            ))}
          </ol>
          {SECCIONES_INFORME.some((s) => !pl.secciones.includes(s.id)) && (
            <div className="pequeno" style={{ marginBottom: 8 }}>Agregar:{' '}
              {SECCIONES_INFORME.filter((s) => !pl.secciones.includes(s.id)).map((s) => <button key={s.id} className="boton chico" style={{ margin: 2 }} onClick={() => alternar(s.id)}>{s.nombre}</button>)}
            </div>
          )}
          <label className="pequeno" style={{ display: 'block' }}><input type="checkbox" checked={pl.logoProyectista} onChange={(e) => cambiarPl((x) => ({ ...x, logoProyectista: e.target.checked }))} /> Logo del proyectista o contratista</label>
          <label className="pequeno" style={{ display: 'block' }}><input type="checkbox" checked={pl.logoCliente} onChange={(e) => cambiarPl((x) => ({ ...x, logoCliente: e.target.checked }))} /> Logo del cliente</label>
          <p className="pequeno">Los logos se toman de Configuración general. Los cambios se usan al descargar; «Guardar como…» los conserva en el proyecto.</p>
        </div>
        <div style={{ flex: '1 1 480px', minWidth: 0 }}>
          {curva.length > 0 && (
            <GraficoLineas
              titulo="Curva S programada contra real"
              etiquetaX={(x) => curva[Math.round(x)]?.etiqueta ?? ''}
              yMax={100}
              formatoY={(v) => `${fmt(v, 0)} %`}
              series={[
                { nombre: 'Programado', color: COLOR.plan, discontinua: true, puntos: curva.map((p) => ({ x: p.i, y: p.plan })) },
                { nombre: 'Real', color: COLOR.real, marcadores: true, puntos: curva.filter((p) => p.real !== null).map((p) => ({ x: p.i, y: p.real as number })) },
              ]}
            />
          )}
          <h3>Partidas ejecutadas en el periodo ({d.partidas.length})</h3>
          {d.partidas.length ? (
            <div className="tabla-marco" style={{ maxHeight: 260 }}>
              <table className="tabla" aria-label="Partidas del periodo">
                <thead><tr><th>Ítem</th><th>Descripción</th><th>Und.</th><th className="num">Periodo</th><th className="num">Acumulado</th><th className="num">% avance</th><th className="num">Monto</th></tr></thead>
                <tbody>{d.partidas.map((p) => <tr key={p.partidaId}><td><button className="boton chico" onClick={() => ctx.abrirFicha(p.partidaId)}>{p.codigo}</button></td><td>{p.descripcion}</td><td>{p.unidad}</td><td className="num">{fmt(p.periodo)}</td><td className="num">{fmt(p.acumulado)}</td><td className="num">{pct(p.avancePct)}</td><td className="num">{fmt(p.montoPeriodo)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="pequeno">Sin metrados en el periodo.</p>}
          <details style={{ marginTop: 12 }}>
            <summary>Marcadores para su plantilla de Word</summary>
            <p className="pequeno">Escriba en su documento de Word los marcadores entre llaves dobles, por ejemplo <code>{'{{avance_real}}'}</code>. Al usar «Llenar mi plantilla de Word…» el programa los reemplaza con las cifras del periodo; conserva su formato, logos, encabezados y pies.</p>
            <table className="tabla"><tbody>{MARCADORES_INFORME.map(([k, v]) => <tr key={k}><td><code>{`{{${k}}}`}</code></td><td>{v}</td></tr>)}</tbody></table>
          </details>
        </div>
      </div>
    </>
  );
}

function Adjuntos({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [filtro, setFiltro] = useState('');
  const set = (x: Adjunto, k: keyof Adjunto, v: unknown) => mut((d) => { const y = d.adjuntos.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[k] = v || undefined; });
  const agregar = async () => {
    const archivos = await elegirArchivos('image/*,.pdf,.docx,.xlsx,.dwg');
    if (!archivos.length) return;
    try {
      const nuevos: Adjunto[] = [];
      for (const f of archivos) nuevos.push(await guardarAdjunto(ctx.id, f, { partidaId: ctx.partidaSel ?? undefined }));
      mut((d) => { d.adjuntos.push(...nuevos); });
      ctx.avisar(`${nuevos.length} ${nuevos.length === 1 ? 'archivo agregado' : 'archivos agregados'} (se guardan aparte del proyecto)`);
    } catch (e) {
      ctx.avisar((e as Error).message, true);
    }
  };
  const bajar = async (x: Adjunto) => {
    const b = await leerAdjunto(x.id).catch(() => null);
    if (!b) return ctx.avisar('El archivo no está en este equipo (los adjuntos se guardan en el navegador o la app donde se agregaron).', true);
    descargar(x.nombre, new Uint8Array(await b.arrayBuffer()), x.tipo);
  };
  const protocolos = [{ valor: '', texto: '—' }, ...c.calidad.protocolos.map((p) => ({ valor: p.id, texto: p.numero || p.id }))];
  const registros = [{ valor: '', texto: '—' }, ...c.registros.map((x) => ({ valor: x.id, texto: `${x.tipo.toUpperCase()} ${x.numero}` }))];
  const filas = c.adjuntos.filter((x) => !filtro || x.partidaId === filtro).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <>
      <div className="fila-flex" style={{ gap: 10, margin: '8px 0' }}>
        <button className="boton primario" onClick={() => void agregar()}>Agregar fotos o archivos…</button>
        <select className="entrada" style={{ width: 280 }} value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por partida">
          {opcionesPartidas(r, 'Todas las partidas').map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
        <span className="pequeno">Las fotos se reducen a 1 600 px y se guardan aparte: el proyecto solo guarda la referencia. Las fotos con fecha dentro del periodo salen en el panel fotográfico del informe.</span>
      </div>
      <TablaEditable
        etiqueta="Fotos y adjuntos"
        filas={filas}
        clave={(x) => x.id}
        alto="calc(100vh - 360px)"
        vacio="Sin fotos ni adjuntos. Seleccione una partida en el presupuesto para que los nuevos se enlacen a ella."
        alEliminar={(x) => {
          if (!window.confirm(`¿Eliminar «${x.nombre}»? El archivo se borra de este equipo.`)) return;
          void eliminarAdjunto(x.id).catch(() => undefined);
          mut((d) => { d.adjuntos = d.adjuntos.filter((z) => z.id !== x.id); });
        }}
        columnas={[
          { clave: 'nombre', titulo: 'Archivo', ancho: 200, tipo: 'lectura', valor: (x) => x.nombre, formato: (x) => <button className="boton chico" onClick={() => void bajar(x)} title="Descargar">{x.nombre}</button> },
          { clave: 'fecha', titulo: 'Fecha', ancho: 120, tipo: 'fecha', valor: (x) => x.fecha, cambiar: (x, v) => set(x, 'fecha', v) },
          { clave: 'desc', titulo: 'Descripción', ancho: 260, valor: (x) => x.descripcion, cambiar: (x, v) => set(x, 'descripcion', v) },
          { clave: 'partida', titulo: 'Partida', ancho: 240, tipo: 'select', opciones: opcionesPartidas(r), valor: (x) => x.partidaId ?? '', cambiar: (x, v) => set(x, 'partidaId', v) },
          { clave: 'prot', titulo: 'Protocolo', ancho: 110, tipo: 'select', opciones: protocolos, valor: (x) => x.protocoloId ?? '', cambiar: (x, v) => set(x, 'protocoloId', v) },
          { clave: 'reg', titulo: 'Cuaderno / RFI', ancho: 120, tipo: 'select', opciones: registros, valor: (x) => x.registroId ?? '', cambiar: (x, v) => set(x, 'registroId', v) },
          { clave: 'tam', titulo: 'Tamaño', ancho: 80, tipo: 'lectura', valor: (x) => `${fmt(x.tamano / 1024, 0)} KB` },
        ]}
      />
      <p className="pequeno">Total en este equipo: {fmt(c.adjuntos.reduce((s, x) => s + x.tamano, 0) / 1048576, 1)} MB · última foto {c.adjuntos.length ? fechaCorta([...c.adjuntos].sort((a, b) => b.fecha.localeCompare(a.fecha))[0].fecha) : '—'}.</p>
    </>
  );
}
