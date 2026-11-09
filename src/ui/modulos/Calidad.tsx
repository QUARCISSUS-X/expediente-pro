// Plan de calidad ISO 9001: puntos de inspección por partida, protocolos con firma de liberación, productos no conformes
// con acciones correctivas (formato de cierre de DMAIC), índice de liberación por frente y dossier de calidad.
import { useMemo, useState } from 'react';
import {
  DISPOSICIONES_PNC, dmaicDesdePnc, firmasPorDefecto, liberacionPorFrente, type Pnc, protocoloLiberado, type Protocolo, type PuntoInspeccion,
  puntosSugeridos, RESULTADOS_PROTOCOLO, resumenCalidad, siguienteNumero, TIPOS_PUNTO,
} from '../../engine/calidad';
import { capacidadProceso, hoyIso } from '../../engine/control';
import { fmt, num, uid } from '../../engine/util';
import { generarXlsxTablas } from '../../export/control';
import { tablasDossier } from '../../export/metodologias';
import { nombreBase } from '../../export/paquete';
import { definicionPdfTablas } from '../../export/pdfdoc';
import { renderPdfBrowser } from '../../export/render-browser';
import { AreaTexto, Campo, EntradaNumero, EntradaTexto, Insignia, Pestanas, TablaEditable } from '../componentes';
import { fc, MIME_XLSX, opcionesFrentes, opcionesPartidas, pct, useControl } from '../control';
import { descargar, type Contexto } from '../estado';
import { COLOR, GraficoBarras, Indicador } from '../graficos';

type Pest = 'plan' | 'protocolos' | 'pnc' | 'liberacion';

export function ModCalidad({ ctx }: { ctx: Contexto }) {
  const { c } = useControl(ctx);
  const r = ctx.resultados;
  const [pest, setPest] = useState<Pest>('plan');
  const s = resumenCalidad(c);
  const [ocupado, setOcupado] = useState(false);
  const dossier = async (tipo: 'xlsx' | 'pdf') => {
    setOcupado(true);
    try {
      const tablas = tablasDossier(r, c);
      if (tipo === 'xlsx') descargar(`${nombreBase(r)}_Dossier_de_calidad.xlsx`, await generarXlsxTablas(r, `Dossier de calidad – ${r.proyecto.meta.nombre}`, tablas), MIME_XLSX);
      else descargar(`${nombreBase(r)}_Dossier_de_calidad.pdf`, await renderPdfBrowser(definicionPdfTablas(r, 'Dossier de calidad', tablas.map((t) => t.tabla))), 'application/pdf');
      ctx.avisar('Dossier de calidad descargado');
    } catch (e) {
      ctx.avisar(`No se pudo generar el dossier: ${(e as Error).message}`, true);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Plan de calidad ISO 9001</h1>
          <p className="proposito">Qué se inspecciona en cada partida, con qué norma, frecuencia y criterio; los protocolos que liberan cada tramo con sus firmas; los productos no conformes con su tratamiento y el dossier de calidad para la entrega.</p>
        </div>
        <div className="herramientas">
          <button className="boton" disabled={ocupado} onClick={() => void dossier('xlsx')}>Dossier (Excel)</button>
          <button className="boton" disabled={ocupado} onClick={() => void dossier('pdf')}>Dossier (PDF)</button>
        </div>
      </div>
      <div className="indicadores">
        <Indicador titulo="Puntos de inspección" valor={s.puntos} detalle={`${s.puntosParada} puntos de parada (H)`} />
        <Indicador titulo="Protocolos liberados" valor={pct(s.indiceLiberacion, 0)} detalle={`${s.liberados} de ${s.protocolos} · ${s.pendientesFirma} esperan firma`} estado={s.indiceLiberacion === null ? 'neutra' : s.indiceLiberacion >= 90 ? 'ok' : s.indiceLiberacion >= 75 ? 'advertencia' : 'error'} />
        <Indicador titulo="Productos no conformes" valor={s.pncAbiertos} detalle={`${s.pncAbiertos === 1 ? 'abierto' : 'abiertos'} · ${s.pncCerrados} ${s.pncCerrados === 1 ? 'cerrado' : 'cerrados'}`} estado={s.pncAbiertos ? 'advertencia' : 'ok'} />
        <Indicador titulo="Tiempo de cierre de PNC" valor={s.diasCierrePromedio === null ? '—' : `${fmt(s.diasCierrePromedio, 1)} d`} detalle={`Costo de la no calidad ${fmt(s.costoPnc, 0)}`} />
      </div>
      <Pestanas
        valor={pest}
        alCambiar={setPest}
        opciones={[
          { id: 'plan', texto: 'Plan de inspección' },
          { id: 'protocolos', texto: 'Protocolos', extra: s.pendientesFirma ? <Insignia estado="advertencia">{s.pendientesFirma}</Insignia> : undefined },
          { id: 'pnc', texto: 'Productos no conformes', extra: s.pncAbiertos ? <Insignia estado="error">{s.pncAbiertos}</Insignia> : undefined },
          { id: 'liberacion', texto: 'Liberación por frente' },
        ]}
      />
      {pest === 'plan' && <Plan ctx={ctx} />}
      {pest === 'protocolos' && <Protocolos ctx={ctx} />}
      {pest === 'pnc' && <Pncs ctx={ctx} />}
      {pest === 'liberacion' && <Liberacion ctx={ctx} />}
    </div>
  );
}

function Plan({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const set = (x: PuntoInspeccion, k: keyof PuntoInspeccion, v: unknown) => mut((d) => { const y = d.calidad.puntos.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[k] = v; });
  const sugerir = () => {
    let n = 0;
    mut((d) => {
      const con = new Set(d.calidad.puntos.map((p) => p.partidaId));
      for (const p of puntosSugeridos(r)) if (!con.has(p.partidaId)) { d.calidad.puntos.push(p); n++; }
    });
    ctx.avisar(n ? `${n} puntos de inspección sugeridos desde las especificaciones técnicas` : 'Todas las partidas ya tienen punto de inspección');
  };
  const series = [{ valor: '', texto: '— Ninguna —' }, ...c.series.map((s) => ({ valor: s.id, texto: s.nombre }))];
  const cpk = (id: string) => {
    const s = c.series.find((x) => x.id === id);
    const k = s ? capacidadProceso(s.valores, s.lei, s.les) : null;
    return k?.cpk ?? null;
  };
  return (
    <>
      <div className="fila-flex" style={{ marginBottom: 8, gap: 10 }}>
        <button className="boton" onClick={sugerir}>Sugerir desde las especificaciones técnicas</button>
        <span className="pequeno">Tipo H: punto de parada (no se continúa sin liberar) · W: presencia de la supervisión · R: revisión de registros · I: inspección interna. Enlace la serie de ensayos de Six Sigma para ver su capacidad (Cpk).</span>
      </div>
      <TablaEditable
        etiqueta="Plan de puntos de inspección"
        filas={c.calidad.puntos}
        clave={(x) => x.id}
        alto="calc(100vh - 380px)"
        alEliminar={(x) => mut((d) => { d.calidad.puntos = d.calidad.puntos.filter((z) => z.id !== x.id); })}
        vacio="Sin puntos de inspección. Use «Sugerir desde las especificaciones técnicas» o agregue uno."
        pie={<button className="boton chico" onClick={() => mut((d) => void d.calidad.puntos.push({ id: uid('ppi'), partidaId: '', control: '', norma: '', metodo: '', frecuencia: '', criterio: '', responsable: '', registro: '', tipo: 'W', serieId: '' }))}>Agregar punto</button>}
        columnas={[
          { clave: 'p', titulo: 'Partida', ancho: 240, tipo: 'select', opciones: opcionesPartidas(r), valor: (x) => x.partidaId, cambiar: (x, v) => set(x, 'partidaId', v) },
          { clave: 'c', titulo: 'Qué se controla', ancho: 220, tipo: 'texto', valor: (x) => x.control, cambiar: (x, v) => set(x, 'control', v) },
          { clave: 't', titulo: 'Tipo', ancho: 150, tipo: 'select', opciones: TIPOS_PUNTO.map((t) => ({ valor: t.id, texto: t.texto })), valor: (x) => x.tipo, cambiar: (x, v) => set(x, 'tipo', v) },
          { clave: 'n', titulo: 'Norma', ancho: 200, tipo: 'texto', valor: (x) => x.norma, cambiar: (x, v) => set(x, 'norma', v) },
          { clave: 'm', titulo: 'Método', ancho: 150, tipo: 'texto', valor: (x) => x.metodo, cambiar: (x, v) => set(x, 'metodo', v) },
          { clave: 'f', titulo: 'Frecuencia', ancho: 170, tipo: 'texto', valor: (x) => x.frecuencia, cambiar: (x, v) => set(x, 'frecuencia', v) },
          { clave: 'a', titulo: 'Criterio de aceptación', ancho: 280, tipo: 'texto', valor: (x) => x.criterio, cambiar: (x, v) => set(x, 'criterio', v) },
          { clave: 'r', titulo: 'Responsable', ancho: 150, tipo: 'texto', valor: (x) => x.responsable, cambiar: (x, v) => set(x, 'responsable', v) },
          { clave: 'g', titulo: 'Registro', ancho: 190, tipo: 'texto', valor: (x) => x.registro, cambiar: (x, v) => set(x, 'registro', v) },
          { clave: 's', titulo: 'Serie Six Sigma', ancho: 170, tipo: 'select', opciones: series, valor: (x) => x.serieId, cambiar: (x, v) => set(x, 'serieId', v) },
          { clave: 'k', titulo: 'Cpk', ancho: 64, num: true, valor: (x) => (x.serieId ? cpk(x.serieId) : null), formato: (x) => { const k = x.serieId ? cpk(x.serieId) : null; return k === null ? '' : <Insignia estado={k >= 1.33 ? 'ok' : k >= 1 ? 'advertencia' : 'error'}>{fmt(k, 2)}</Insignia>; } },
        ]}
      />
    </>
  );
}

function Protocolos({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [sel, setSel] = useState<string | null>(null);
  const p = c.calidad.protocolos.find((x) => x.id === sel) ?? null;
  const set = (x: Protocolo, k: keyof Protocolo, v: unknown) => mut((d) => { const y = d.calidad.protocolos.find((z) => z.id === x.id); if (y) (y as unknown as Record<string, unknown>)[k] = v; });
  const puntos = [{ valor: '', texto: '— Punto de inspección —' }, ...c.calidad.puntos.map((x) => ({ valor: x.id, texto: `${r.hojas.find((h) => h.partida.id === x.partidaId)?.partida.codigo ?? ''} ${x.control}` }))];
  const firmar = (x: Protocolo, i: number, firmado: boolean) =>
    mut((d) => {
      const y = d.calidad.protocolos.find((z) => z.id === x.id);
      if (!y?.firmas[i]) return;
      y.firmas[i].firmado = firmado;
      y.firmas[i].fecha = firmado ? y.firmas[i].fecha || y.fecha || hoyIso() : '';
    });
  return (
    <>
      <TablaEditable
        etiqueta="Protocolos de calidad"
        filas={c.calidad.protocolos}
        clave={(x) => x.id}
        alto={p ? '320px' : 'calc(100vh - 380px)'}
        alClicFila={(x) => setSel(x.id)}
        claseFila={(x) => (x.id === sel ? 'seleccionada' : undefined)}
        alEliminar={(x) => mut((d) => { d.calidad.protocolos = d.calidad.protocolos.filter((z) => z.id !== x.id); })}
        vacio="Sin protocolos. Agregue uno por cada tramo o lote inspeccionado."
        pie={
          <button
            className="boton chico"
            onClick={() => {
              const id = uid('prt');
              mut((d) => void d.calidad.protocolos.push({ id, numero: siguienteNumero('PC-', d.calidad.protocolos.map((z) => z.numero)), puntoId: '', partidaId: '', frenteId: '', fecha: hoyIso(), ubicacion: '', metrado: null, resultado: 'pendiente', firmas: firmasPorDefecto(), observaciones: '' }));
              setSel(id);
            }}
          >
            Agregar protocolo
          </button>
        }
        columnas={[
          { clave: 'n', titulo: 'N.°', ancho: 80, tipo: 'texto', valor: (x) => x.numero, cambiar: (x, v) => set(x, 'numero', v) },
          {
            clave: 'pt', titulo: 'Punto de inspección', ancho: 260, tipo: 'select', opciones: puntos, valor: (x) => x.puntoId,
            cambiar: (x, v) => mut((d) => { const y = d.calidad.protocolos.find((z) => z.id === x.id); const q = d.calidad.puntos.find((z) => z.id === v); if (y) { y.puntoId = String(v); if (q) y.partidaId = q.partidaId; } }),
          },
          { clave: 'p', titulo: 'Partida', ancho: 220, tipo: 'select', opciones: opcionesPartidas(r), valor: (x) => x.partidaId, cambiar: (x, v) => set(x, 'partidaId', v) },
          { clave: 'fr', titulo: 'Frente', ancho: 150, tipo: 'select', opciones: opcionesFrentes(c), valor: (x) => x.frenteId, cambiar: (x, v) => set(x, 'frenteId', v) },
          { clave: 'f', titulo: 'Fecha', ancho: 130, tipo: 'fecha', valor: (x) => x.fecha, cambiar: (x, v) => set(x, 'fecha', v) },
          { clave: 'u', titulo: 'Ubicación', ancho: 120, tipo: 'texto', valor: (x) => x.ubicacion, cambiar: (x, v) => set(x, 'ubicacion', v) },
          { clave: 'm', titulo: 'Metrado', ancho: 90, tipo: 'numero', decimales: 2, valor: (x) => x.metrado, cambiar: (x, v) => set(x, 'metrado', v === null || v === '' ? null : num(v)) },
          { clave: 'r', titulo: 'Resultado', ancho: 130, tipo: 'select', opciones: RESULTADOS_PROTOCOLO.map((x) => ({ valor: x.id, texto: x.texto })), valor: (x) => x.resultado, cambiar: (x, v) => set(x, 'resultado', v) },
          {
            clave: 'fi', titulo: 'Firmas', ancho: 130, valor: (x) => x.firmas.filter((f) => f.firmado).length,
            formato: (x) => (
              <span className="firma-celda">
                {x.firmas.map((f, i) => (
                  <label key={i} title={f.rol}><input type="checkbox" aria-label={`Firma ${f.rol}`} checked={f.firmado} onChange={(e) => firmar(x, i, e.target.checked)} onClick={(e) => e.stopPropagation()} />{i + 1}</label>
                ))}
              </span>
            ),
          },
          { clave: 'l', titulo: 'Liberación', ancho: 100, valor: (x) => protocoloLiberado(x), formato: (x) => (protocoloLiberado(x) ? <Insignia estado="ok">Liberado</Insignia> : x.resultado === 'no_conforme' ? <Insignia estado="error">No conforme</Insignia> : <Insignia estado="advertencia">Pendiente</Insignia>) },
        ]}
      />
      {p && (
        <>
          <div className="seccion-titulo">Protocolo {p.numero} · firmas de liberación</div>
          <TablaEditable
            etiqueta="Firmas del protocolo"
            filas={p.firmas}
            clave={(_, i) => String(i)}
            alEliminar={(_, i) => mut((d) => { const y = d.calidad.protocolos.find((z) => z.id === p.id); if (y) y.firmas.splice(i, 1); })}
            pie={<button className="boton chico" onClick={() => mut((d) => { const y = d.calidad.protocolos.find((z) => z.id === p.id); y?.firmas.push({ rol: 'Firma adicional', nombre: '', fecha: '', firmado: false }); })}>Agregar firma</button>}
            columnas={[
              { clave: 'r', titulo: 'Cargo / rol', tipo: 'texto', valor: (f) => f.rol, cambiar: (_, v, i) => mut((d) => { const y = d.calidad.protocolos.find((z) => z.id === p.id); if (y) y.firmas[i].rol = String(v); }) },
              { clave: 'n', titulo: 'Nombre', ancho: 220, tipo: 'texto', valor: (f) => f.nombre, cambiar: (_, v, i) => mut((d) => { const y = d.calidad.protocolos.find((z) => z.id === p.id); if (y) y.firmas[i].nombre = String(v); }) },
              { clave: 'f', titulo: 'Fecha', ancho: 140, tipo: 'fecha', valor: (f) => f.fecha, cambiar: (_, v, i) => mut((d) => { const y = d.calidad.protocolos.find((z) => z.id === p.id); if (y) y.firmas[i].fecha = String(v); }) },
              { clave: 's', titulo: 'Firmado', ancho: 80, tipo: 'casilla', valor: (f) => f.firmado, cambiar: (_, v, i) => firmar(p, i, !!v) },
            ]}
          />
          <Campo etiqueta="Observaciones">
            <AreaTexto filas={3} valor={p.observaciones} alCambiar={(v) => set(p, 'observaciones', v)} />
          </Campo>
          {p.resultado === 'no_conforme' || p.resultado === 'observado' ? (
            <button
              className="boton"
              onClick={() => {
                mut((d) => void d.calidad.pnc.push({ id: uid('pnc'), numero: siguienteNumero('PNC-', d.calidad.pnc.map((z) => z.numero)), fecha: p.fecha || hoyIso(), partidaId: p.partidaId, frenteId: p.frenteId, protocoloId: p.id, descripcion: p.observaciones, detectadoPor: 'Control de calidad', disposicion: '', causaRaiz: '', ishikawaId: '', acciones: [], verificacion: '', costo: null, fechaCierre: '', estado: 'abierto', dmaicId: '' }));
                ctx.avisar('Producto no conforme registrado');
              }}
            >
              Registrar producto no conforme
            </button>
          ) : null}
        </>
      )}
    </>
  );
}

function Pncs({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const [sel, setSel] = useState<string | null>(c.calidad.pnc[0]?.id ?? null);
  const x = c.calidad.pnc.find((z) => z.id === sel) ?? null;
  const editar = (fn: (y: Pnc) => void) => mut((d) => { const y = d.calidad.pnc.find((z) => z.id === sel); if (y) fn(y); });
  const est = { abierto: ['error', 'Abierto'], tratamiento: ['advertencia', 'En tratamiento'], cerrado: ['ok', 'Cerrado'] } as const;
  return (
    <>
      <TablaEditable
        etiqueta="Productos no conformes"
        filas={c.calidad.pnc}
        clave={(z) => z.id}
        alto="240px"
        alClicFila={(z) => setSel(z.id)}
        claseFila={(z) => (z.id === sel ? 'seleccionada' : undefined)}
        alEliminar={(z) => mut((d) => { d.calidad.pnc = d.calidad.pnc.filter((y) => y.id !== z.id); })}
        vacio="Sin productos no conformes."
        pie={
          <button className="boton chico" onClick={() => { const id = uid('pnc'); mut((d) => void d.calidad.pnc.push({ id, numero: siguienteNumero('PNC-', d.calidad.pnc.map((z) => z.numero)), fecha: hoyIso(), partidaId: '', frenteId: '', protocoloId: '', descripcion: '', detectadoPor: '', disposicion: '', causaRaiz: '', ishikawaId: '', acciones: [], verificacion: '', costo: null, fechaCierre: '', estado: 'abierto', dmaicId: '' })); setSel(id); }}>
            Agregar PNC
          </button>
        }
        columnas={[
          { clave: 'n', titulo: 'N.°', ancho: 90, valor: (z) => z.numero },
          { clave: 'f', titulo: 'Fecha', ancho: 96, valor: (z) => fc(z.fecha) },
          { clave: 'p', titulo: 'Partida', ancho: 240, valor: (z) => { const h = r.hojas.find((y) => y.partida.id === z.partidaId); return h ? `${h.partida.codigo} ${h.partida.descripcion}` : ''; } },
          { clave: 'd', titulo: 'Descripción', valor: (z) => z.descripcion },
          { clave: 'a', titulo: 'Acciones', ancho: 80, valor: (z) => `${z.acciones.filter((a) => a.hecho).length}/${z.acciones.length}` },
          { clave: 'e', titulo: 'Estado', ancho: 120, valor: (z) => z.estado, formato: (z) => <Insignia estado={est[z.estado][0]}>{est[z.estado][1]}</Insignia> },
        ]}
      />
      {x && (
        <div className="panel" style={{ marginTop: 12, padding: 12 }}>
          <div className="seccion-titulo">{x.numero} · tratamiento y cierre</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            <Campo etiqueta="Partida">
              <select value={x.partidaId} onChange={(e) => editar((y) => { y.partidaId = e.target.value; })}>{opcionesPartidas(r).map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}</select>
            </Campo>
            <Campo etiqueta="Frente">
              <select value={x.frenteId} onChange={(e) => editar((y) => { y.frenteId = e.target.value; })}>{opcionesFrentes(c).map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}</select>
            </Campo>
            <Campo etiqueta="Fecha"><input type="date" value={x.fecha} onChange={(e) => editar((y) => { y.fecha = e.target.value; })} /></Campo>
            <Campo etiqueta="Detectado por"><EntradaTexto valor={x.detectadoPor} alCambiar={(v) => editar((y) => { y.detectadoPor = v; })} /></Campo>
            <Campo etiqueta="Disposición (ISO 9001, 8.7)">
              <select value={x.disposicion} onChange={(e) => editar((y) => { y.disposicion = e.target.value as Pnc['disposicion']; })}>{DISPOSICIONES_PNC.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}</select>
            </Campo>
            <Campo etiqueta={`Costo de la no conformidad (${r.proyecto.meta.moneda})`}><EntradaNumero valor={x.costo} decimales={2} alCambiar={(v) => editar((y) => { y.costo = v === null || (v as unknown) === '' ? null : num(v); })} /></Campo>
            <Campo etiqueta="Estado">
              <select value={x.estado} onChange={(e) => editar((y) => { y.estado = e.target.value as Pnc['estado']; if (y.estado === 'cerrado' && !y.fechaCierre) y.fechaCierre = hoyIso(); })}>
                <option value="abierto">Abierto</option><option value="tratamiento">En tratamiento</option><option value="cerrado">Cerrado</option>
              </select>
            </Campo>
            <Campo etiqueta="Fecha de cierre"><input type="date" value={x.fechaCierre} onChange={(e) => editar((y) => { y.fechaCierre = e.target.value; })} /></Campo>
          </div>
          <Campo etiqueta="Descripción de la no conformidad"><AreaTexto filas={2} valor={x.descripcion} alCambiar={(v) => editar((y) => { y.descripcion = v; })} /></Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <Campo etiqueta="Causa raíz"><EntradaTexto valor={x.causaRaiz} alCambiar={(v) => editar((y) => { y.causaRaiz = v; })} /></Campo>
            <Campo etiqueta="Diagrama de Ishikawa">
              <select value={x.ishikawaId} onChange={(e) => editar((y) => { y.ishikawaId = e.target.value; })}>
                <option value="">— Ninguno —</option>
                {c.ishikawas.map((k) => <option key={k.id} value={k.id}>{k.problema}</option>)}
              </select>
            </Campo>
          </div>
          <div className="seccion-titulo">Acciones correctivas</div>
          <TablaEditable
            etiqueta="Acciones correctivas"
            filas={x.acciones}
            clave={(a) => a.id}
            alEliminar={(a) => editar((y) => { y.acciones = y.acciones.filter((z) => z.id !== a.id); })}
            pie={<button className="boton chico" onClick={() => editar((y) => void y.acciones.push({ id: uid('acc'), accion: '', responsable: '', fecha: hoyIso(), hecho: false }))}>Agregar acción</button>}
            columnas={[
              { clave: 'a', titulo: 'Acción', tipo: 'texto', valor: (a) => a.accion, cambiar: (a, v) => editar((y) => { const z = y.acciones.find((w) => w.id === a.id); if (z) z.accion = String(v); }) },
              { clave: 'r', titulo: 'Responsable', ancho: 160, tipo: 'texto', valor: (a) => a.responsable, cambiar: (a, v) => editar((y) => { const z = y.acciones.find((w) => w.id === a.id); if (z) z.responsable = String(v); }) },
              { clave: 'f', titulo: 'Fecha', ancho: 140, tipo: 'fecha', valor: (a) => a.fecha, cambiar: (a, v) => editar((y) => { const z = y.acciones.find((w) => w.id === a.id); if (z) z.fecha = String(v); }) },
              { clave: 'h', titulo: 'Hecho', ancho: 70, tipo: 'casilla', valor: (a) => a.hecho, cambiar: (a, v) => editar((y) => { const z = y.acciones.find((w) => w.id === a.id); if (z) z.hecho = !!v; }) },
            ]}
          />
          <Campo etiqueta="Verificación de la eficacia"><AreaTexto filas={2} valor={x.verificacion} alCambiar={(v) => editar((y) => { y.verificacion = v; })} /></Campo>
          <div className="fila-flex">
            {x.dmaicId && c.dmaic.some((d) => d.id === x.dmaicId) ? (
              <Insignia estado="neutra">Con proyecto DMAIC en Calidad Six Sigma</Insignia>
            ) : (
              <button
                className="boton"
                title="Si la no conformidad se repite, ataque la causa con un proyecto DMAIC"
                onClick={() => {
                  const h = r.hojas.find((y) => y.partida.id === x.partidaId);
                  const d0 = dmaicDesdePnc(x, h ? `${h.partida.codigo} ${h.partida.descripcion}` : '');
                  mut((d) => { d.dmaic.push(d0); const y = d.calidad.pnc.find((z) => z.id === x.id); if (y) y.dmaicId = d0.id; });
                  ctx.avisar('Proyecto DMAIC creado en Calidad Six Sigma');
                }}
              >
                Crear proyecto DMAIC
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Liberacion({ ctx }: { ctx: Contexto }) {
  const { c } = useControl(ctx);
  const filas = useMemo(() => liberacionPorFrente(c), [c]);
  return (
    <>
      {filas.some((f) => f.emitidos) && (
        <GraficoBarras
          titulo="Índice de liberación por frente"
          datos={filas.filter((f) => f.emitidos).map((f) => ({ etiqueta: f.nombre, valor: f.indice ?? 0 }))}
          formato={(v) => `${fmt(v, 0)}%`}
          referencia={{ y: 90, texto: 'Meta 90 %' }}
          colorDe={(v) => (v >= 90 ? COLOR.plan : v >= 75 ? COLOR.ocre : COLOR.costo)}
          alto={200}
        />
      )}
      <TablaEditable
        etiqueta="Liberación por frente"
        filas={filas}
        clave={(f) => f.frenteId || 'sin'}
        vacio="Registre frentes en Ejecución lean y asigne los protocolos a cada frente."
        columnas={[
          { clave: 'n', titulo: 'Frente', valor: (f) => f.nombre },
          { clave: 'e', titulo: 'Protocolos', ancho: 100, num: true, valor: (f) => f.emitidos },
          { clave: 'l', titulo: 'Liberados', ancho: 100, num: true, valor: (f) => f.liberados },
          { clave: 'i', titulo: 'Índice de liberación', ancho: 140, num: true, valor: (f) => pct(f.indice, 1) },
          { clave: 'p', titulo: 'Puntos aplicables', ancho: 130, num: true, valor: (f) => f.puntos },
          { clave: 'c', titulo: 'Cubiertos', ancho: 100, num: true, valor: (f) => f.cubiertos },
          { clave: 'o', titulo: 'Cobertura', ancho: 100, num: true, valor: (f) => pct(f.cobertura, 0) },
          { clave: 'x', titulo: 'PNC abiertos', ancho: 100, num: true, valor: (f) => f.pncAbiertos },
        ]}
      />
    </>
  );
}
