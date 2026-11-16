// Sincronización del banco entre equipos por archivo, sin servidor: un .epdb en una carpeta compartida (OneDrive, Dropbox,
// red). Al abrir el banco, si el archivo es más nuevo se fusiona con la pantalla de fusión; cada cambio local se publica
// en el archivo, salvo que otro equipo lo haya cambiado antes (entonces se pide fusionar primero).
// También recibe el .epdb abierto con doble clic en la app de escritorio.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FuentePrecio, InsumoBanco } from '../engine/banco';
import { escribirEpdb, leerArchivoBanco, type OpcionesImportacion, type ResultadoBanco } from '../io/banco';
import { Fusion } from './BancoDialogos';
import { alCambiarBanco, leerBanco } from './bancoAlmacen';
import type { Contexto } from './estado';
import {
  cambioAfuera, desvincular, escribirVinculo, leerArchivoVinculado, leerVinculo, marcarLeido, puedeVincular, tomarBancoPendiente, vincularExistente, vincularNuevo,
  type FiltroArchivo, type Vinculo,
} from './vinculo';

const FILTRO_BANCO: FiltroArchivo = { descripcion: 'Banco de datos de Expediente Pro', extensiones: ['epdb'], mime: 'application/zip' };
const ID = 'banco';
const opciones = (b: { insumos: InsumoBanco[] }): OpcionesImportacion => ({ fecha: new Date().toISOString().slice(0, 10), lugar: '', fuente: 'otro' as FuentePrecio, referencia: 'Banco compartido', insumos: b.insumos });

export function SincronizacionBanco({ ctx }: { ctx: Contexto }) {
  const [v, setV] = useState<Vinculo | null>(null);
  const [entrante, setEntrante] = useState<{ r: ResultadoBanco; previo?: Vinculo } | null>(null);
  const [masNuevo, setMasNuevo] = useState(false);
  const vRef = useRef(v);
  vRef.current = v;
  const ocupado = useRef(false);

  const leerRemoto = useCallback(async (x: Vinculo, motivo: string, pedir = false) => {
    const l = await leerArchivoVinculado(x, pedir);
    const r = await leerArchivoBanco({ nombre: x.nombre, datos: l.datos }, opciones(await leerBanco()));
    // se marca como leído para que la fusión pueda publicarse; si se cancela, se vuelve a la marca anterior
    const n = await marcarLeido(x, l.modificado);
    setV(n);
    setMasNuevo(false);
    setEntrante({ r: { ...r, origen: `${motivo}: ${x.nombre}` }, previo: x });
  }, []);

  const publicar = useCallback(async (x: Vinculo, pedir = false, avisar = false) => {
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      if (await cambioAfuera(x)) { setMasNuevo(true); return; } // otro equipo publicó antes: primero fusionar
      setV(await escribirVinculo(x, await escribirEpdb({ banco: await leerBanco() }), pedir));
      if (avisar) ctx.avisar(`Banco publicado en ${x.nombre}`);
    } catch (e) {
      if (avisar) ctx.avisar(`No se pudo publicar: ${(e as Error).message}`, true);
    } finally {
      ocupado.current = false;
    }
  }, [ctx]);

  // al abrir: archivo abierto con doble clic, o copia compartida más nueva
  useEffect(() => {
    void (async () => {
      const pend = tomarBancoPendiente();
      if (pend) {
        try {
          const r = await leerArchivoBanco({ nombre: pend.nombre, datos: pend.datos }, opciones(await leerBanco()));
          setEntrante({ r: { ...r, origen: `Archivo abierto: ${pend.nombre}` } });
        } catch (e) {
          ctx.avisar(`No se pudo leer ${pend.nombre}: ${(e as Error).message}`, true);
        }
      }
      const x = await leerVinculo(ID).catch(() => null);
      setV(x);
      if (x && !pend && (await cambioAfuera(x))) await leerRemoto(x, 'Copia más nueva en la carpeta compartida').catch(() => setMasNuevo(true));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cada cambio local del banco se publica (con una pausa para juntar ediciones seguidas)
  useEffect(() => {
    let t = 0;
    const quitar = alCambiarBanco(() => {
      window.clearTimeout(t);
      t = window.setTimeout(() => { if (vRef.current) void publicar(vRef.current); }, 2000);
    });
    return () => { quitar(); window.clearTimeout(t); };
  }, [publicar]);

  const compartirNuevo = async () => {
    const x = await vincularNuevo(ID, 'Banco_compartido.epdb', FILTRO_BANCO).catch((e) => { ctx.avisar((e as Error).message, true); return null; });
    if (!x) return;
    setV(x);
    await publicar(x, true, true);
  };
  const usarExistente = async () => {
    try {
      const r = await vincularExistente(ID, FILTRO_BANCO);
      if (!r) return;
      setV(r.vinculo);
      await leerRemoto({ ...r.vinculo, escrito: 0 }, 'Banco compartido');
    } catch (e) {
      ctx.avisar(`No se pudo leer: ${(e as Error).message}`, true);
    }
  };

  const fusion = entrante && (
    <Fusion
      ctx={ctx}
      entrante={entrante.r}
      titulo="Banco de datos de otro equipo"
      alCerrar={() => {
        // sin fusionar: el archivo vuelve a contar como pendiente (no se sobrescribe con el banco local)
        if (entrante.previo && v) void marcarLeido(v, entrante.previo.escrito).then(setV);
        setEntrante(null);
      }}
      alTerminar={() => { if (vRef.current) void publicar(vRef.current); }}
    />
  );

  if (!puedeVincular()) return fusion || null;
  return (
    <>
      <div className="fila-flex pequeno" style={{ gap: 8, marginBottom: 8 }}>
        {v ? (
          <>
            <span title={v.ruta ?? v.nombre}>Compartido en <strong>{v.nombre}</strong>{masNuevo ? ' · otro equipo lo cambió' : ''}</span>
            {masNuevo && <button className="boton chico primario" onClick={() => void leerRemoto(v, 'Copia más nueva en la carpeta compartida', true).catch((e) => ctx.avisar((e as Error).message, true))}>Fusionar la copia nueva</button>}
            <button className="boton chico" onClick={() => void publicar(v, true, true)}>Publicar ahora</button>
            <button className="boton chico" onClick={() => void (async () => { if (await cambioAfuera(v)) await leerRemoto(v, 'Copia más nueva en la carpeta compartida', true); else ctx.avisar('El archivo compartido no tiene cambios de otros equipos.'); })().catch((e) => ctx.avisar((e as Error).message, true))}>Buscar cambios</button>
            <button className="boton chico" onClick={() => void desvincular(ID).then(() => setV(null))}>Dejar de compartir</button>
          </>
        ) : (
          <>
            <span>Sincronizar con otros equipos por una carpeta compartida (sin servidor):</span>
            <button className="boton chico" onClick={() => void usarExistente()}>Usar un .epdb compartido…</button>
            <button className="boton chico" onClick={() => void compartirNuevo()}>Crear el .epdb compartido…</button>
          </>
        )}
      </div>
      {fusion}
    </>
  );
}
