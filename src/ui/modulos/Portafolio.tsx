// Portafolio: todos los proyectos del almacén en una pantalla (monto, avance, CPI, SPI, alertas) y su reporte consolidado.
import { useEffect, useState } from 'react';
import { hoyIso } from '../../engine/control';
import { calcularTodo } from '../../engine/index';
import { type FilaPortafolio, filaPortafolio, resumenPortafolio } from '../../engine/portafolio';
import { fmt } from '../../engine/util';
import { pdfPortafolio, xlsxPortafolio } from '../../export/portafolio';
import { renderPdfBrowser } from '../../export/render-browser';
import { listarProyectos, leerProyecto } from '../almacen';
import { Insignia } from '../componentes';
import { fc, ind, MIME_XLSX, pct } from '../control';
import { descargar, type Contexto } from '../estado';
import { Indicador } from '../graficos';

const ESTADO: Record<FilaPortafolio['semaforo'], 'ok' | 'advertencia' | 'error' | 'neutra'> = { verde: 'ok', amarillo: 'advertencia', rojo: 'error', 'sin control': 'neutra' };

export function ModPortafolio({ ctx }: { ctx: Contexto }) {
  const hoy = hoyIso();
  const [filas, setFilas] = useState<FilaPortafolio[] | null>(null);
  const [avance, setAvance] = useState('');
  const [archivados, setArchivados] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const lista = (await listarProyectos()).filter((x) => archivados || !x.archivado);
      const out: FilaPortafolio[] = [];
      for (const [i, reg] of lista.entries()) {
        if (!vivo) return;
        setAvance(`Calculando ${i + 1} de ${lista.length}…`);
        // el proyecto abierto se toma de la pantalla (puede tener cambios sin guardar)
        if (reg.id === ctx.id) { out.push(filaPortafolio(reg.id, ctx.resultados, hoy)); continue; }
        const p = await leerProyecto(reg.id);
        if (!p) continue;
        try { out.push(filaPortafolio(reg.id, calcularTodo(p.proyecto), hoy)); } catch { /* proyecto dañado: se omite */ }
        await new Promise((ok) => setTimeout(ok, 0)); // deja respirar a la pantalla
      }
      if (vivo) { setFilas(out); setAvance(''); }
    })();
    return () => { vivo = false; };
    // se recalcula al cambiar el filtro o al guardar (ctx.version); no en cada tecla del proyecto abierto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivados, ctx.version, ctx.id, hoy]);

  const res = filas ? resumenPortafolio(filas) : null;
  const reporte = async (tipo: 'xlsx' | 'pdf') => {
    if (!filas || !res) return;
    setOcupado(true);
    try {
      if (tipo === 'xlsx') descargar(`Portafolio_${hoy}.xlsx`, await xlsxPortafolio(filas), MIME_XLSX);
      else descargar(`Portafolio_${hoy}.pdf`, await renderPdfBrowser(pdfPortafolio(filas, res, hoy)), 'application/pdf');
      ctx.avisar('Reporte del portafolio descargado');
    } catch (e) {
      ctx.avisar(`No se pudo generar el reporte: ${(e as Error).message}`, true);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Portafolio de proyectos</h1>
          <p className="proposito">Todos los proyectos guardados en este equipo en una sola pantalla: monto, avance programado y real, SPI, CPI, EAC y alertas, con un semáforo por proyecto y el reporte consolidado en Excel o PDF.</p>
        </div>
        <div className="herramientas">
          <label className="pequeno"><input type="checkbox" checked={archivados} onChange={(e) => setArchivados(e.target.checked)} /> Incluir archivados</label>
          <button className="boton" disabled={!filas || ocupado} onClick={() => void reporte('xlsx')}>Consolidado (Excel)</button>
          <button className="boton" disabled={!filas || ocupado} onClick={() => void reporte('pdf')}>Consolidado (PDF)</button>
        </div>
      </div>
      {!filas || !res ? <div className="vacio"><p>{avance || 'Leyendo proyectos…'}</p></div> : (
        <>
          <div className="indicadores">
            <Indicador titulo="Proyectos" valor={res.proyectos} detalle={`${res.conControl} con control de obra`} />
            {res.porMoneda.map((m) => <Indicador key={m.moneda} titulo={`Monto total (${m.moneda})`} valor={fmt(m.monto, 0)} detalle={`${m.proyectos} proyectos`} />)}
            <Indicador titulo="Avance real ponderado" valor={pct(res.avancePonderado)} detalle="por monto" />
            <Indicador titulo="SPI / CPI ponderados" valor={`${ind(res.spiPonderado, 3)} / ${ind(res.cpiPonderado, 3)}`} estado={res.spiPonderado === null ? 'neutra' : Math.min(res.spiPonderado, res.cpiPonderado ?? 1) >= 0.95 ? 'ok' : 'advertencia'} />
            <Indicador titulo="Semáforo" valor={`${res.semaforos.rojo} en rojo`} detalle={`${res.semaforos.amarillo} amarillo · ${res.semaforos.verde} verde`} estado={res.semaforos.rojo ? 'error' : res.semaforos.amarillo ? 'advertencia' : 'ok'} />
          </div>
          <div className="tabla-marco" style={{ maxHeight: 'calc(100vh - 330px)' }}>
            <table className="tabla" aria-label="Portafolio de proyectos">
              <thead><tr><th>Estado</th><th>Código</th><th>Proyecto</th><th className="num">Monto</th><th className="num">% prog.</th><th className="num">% real</th><th className="num">SPI</th><th className="num">CPI</th><th className="num">EAC</th><th>Último corte</th><th>Alertas</th><th /></tr></thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td><Insignia estado={ESTADO[f.semaforo]}>{f.semaforo}</Insignia></td>
                    <td>{f.codigo}</td>
                    <td style={{ whiteSpace: 'normal' }}>{f.nombre}{f.cliente ? <div className="pequeno">{f.cliente}</div> : null}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{f.moneda} {fmt(f.monto)}</td>
                    <td className="num">{pct(f.avanceProgramado)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{pct(f.avanceReal)}</td>
                    <td className="num">{ind(f.spi, 3)}</td>
                    <td className="num">{ind(f.cpi, 3)}</td>
                    <td className="num">{f.eac === null ? '—' : fmt(f.eac)}</td>
                    <td>{fc(f.ultimoCorte)}</td>
                    <td className="pequeno" style={{ whiteSpace: 'normal' }}>{f.alertas.join(' · ') || '—'}</td>
                    <td>{f.id !== ctx.id && <button className="boton chico" onClick={() => void ctx.abrirProyectoId(f.id)}>Abrir</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
