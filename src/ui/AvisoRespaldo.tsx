// Aviso de respaldo periódico en la extensión del navegador: sus proyectos y el banco se borran al desinstalarla.
import { useState } from 'react';
import { fechaCorta } from '../engine/util';
import type { Contexto } from './estado';
import { descargarRespaldo, DIAS_RECORDATORIO, posponerRespaldo, tocaRecordarRespaldo, ultimoRespaldo } from './respaldo';

export function AvisoRespaldo({ ctx }: { ctx: Contexto }) {
  const [ver, setVer] = useState(() => tocaRecordarRespaldo());
  if (!ver) return null;
  const ultimo = ultimoRespaldo();
  return (
    <div className="aviso advertencia" role="status" style={{ margin: '6px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
      <span style={{ flex: 1 }}>
        Sus proyectos y el banco de datos viven dentro de esta extensión y <strong>se borran si la desinstala</strong>. {ultimo ? `El último respaldo es del ${fechaCorta(ultimo.slice(0, 10))}.` : `No hay respaldos en los últimos ${DIAS_RECORDATORIO} días.`}
      </span>
      <button className="boton chico primario" onClick={async () => { try { const n = await descargarRespaldo(); ctx.avisar(`Respaldo descargado: ${n.proyectos} proyecto(s) y el banco de datos.`); setVer(false); } catch (e) { ctx.avisar(`No se pudo respaldar: ${(e as Error).message}`, true); } }}>Respaldar ahora</button>
      <button className="boton chico" onClick={() => { posponerRespaldo(); setVer(false); }}>En una semana</button>
    </div>
  );
}
