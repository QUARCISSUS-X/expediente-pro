// Plan de calidad (ISO 9001): plan de puntos de inspección por partida, protocolos con firma de liberación,
// productos no conformes (PNC) con el mismo formato de cierre de DMAIC e índice de liberación por frente.
import type { AccionDmaic, Control, ProyectoDmaic } from './control';
import type { Resultados } from './types';
import { difDias, uid } from './util';

/** H: punto de parada (no se continúa sin liberar) · W: presencia de la supervisión · R: revisión de registros · I: inspección interna. */
export type TipoPunto = 'H' | 'W' | 'R' | 'I';
export const TIPOS_PUNTO: { id: TipoPunto; texto: string }[] = [
  { id: 'H', texto: 'H · Punto de parada' },
  { id: 'W', texto: 'W · Presencia' },
  { id: 'R', texto: 'R · Revisión documental' },
  { id: 'I', texto: 'I · Inspección interna' },
];

export interface PuntoInspeccion {
  id: string;
  partidaId: string;
  control: string; // qué se controla
  norma: string;
  metodo: string;
  frecuencia: string;
  criterio: string; // criterio de aceptación
  responsable: string;
  registro: string; // formato o protocolo que lo evidencia
  tipo: TipoPunto;
  serieId: string; // serie de ensayos de Six Sigma enlazada
}

export type ResultadoProtocolo = 'pendiente' | 'conforme' | 'observado' | 'no_conforme';
export const RESULTADOS_PROTOCOLO: { id: ResultadoProtocolo; texto: string }[] = [
  { id: 'pendiente', texto: 'Pendiente' },
  { id: 'conforme', texto: 'Conforme' },
  { id: 'observado', texto: 'Observado' },
  { id: 'no_conforme', texto: 'No conforme' },
];

export interface FirmaProtocolo {
  rol: string;
  nombre: string;
  fecha: string;
  firmado: boolean;
}

export interface Protocolo {
  id: string;
  numero: string;
  puntoId: string;
  partidaId: string;
  frenteId: string;
  fecha: string;
  ubicacion: string; // tramo, eje, progresiva
  metrado: number | null; // metrado que se libera
  resultado: ResultadoProtocolo;
  firmas: FirmaProtocolo[];
  observaciones: string;
}

export type DisposicionPnc = '' | 'reprocesar' | 'reparar' | 'concesion' | 'rechazar';
export const DISPOSICIONES_PNC: { id: DisposicionPnc; texto: string }[] = [
  { id: '', texto: '— Por definir —' },
  { id: 'reprocesar', texto: 'Reprocesar (rehacer)' },
  { id: 'reparar', texto: 'Reparar' },
  { id: 'concesion', texto: 'Aceptar por concesión' },
  { id: 'rechazar', texto: 'Rechazar / demoler' },
];

export type EstadoPnc = 'abierto' | 'tratamiento' | 'cerrado';

/** Producto no conforme con el formato de cierre de DMAIC: causa raíz, Ishikawa, acciones y verificación de eficacia. */
export interface Pnc {
  id: string;
  numero: string;
  fecha: string;
  partidaId: string;
  frenteId: string;
  protocoloId: string;
  descripcion: string;
  detectadoPor: string;
  disposicion: DisposicionPnc;
  causaRaiz: string;
  ishikawaId: string;
  acciones: AccionDmaic[];
  verificacion: string; // verificación de la eficacia (equivale al plan de control de DMAIC)
  costo: number | null;
  fechaCierre: string;
  estado: EstadoPnc;
  dmaicId: string;
}

export interface Calidad {
  puntos: PuntoInspeccion[];
  protocolos: Protocolo[];
  pnc: Pnc[];
}

export const calidadVacia = (): Calidad => ({ puntos: [], protocolos: [], pnc: [] });

export function normalizarCalidad(x: unknown): Calidad {
  const c = (x && typeof x === 'object' ? x : {}) as Partial<Calidad>;
  const arr = <T,>(a: T[] | undefined) => (Array.isArray(a) ? a : []);
  return {
    puntos: arr(c.puntos).map((p) => ({ ...p, serieId: p.serieId ?? '', tipo: p.tipo ?? 'W' })),
    protocolos: arr(c.protocolos).map((p) => ({ ...p, firmas: arr(p.firmas) })),
    pnc: arr(c.pnc).map((p) => ({ ...p, acciones: arr(p.acciones), dmaicId: p.dmaicId ?? '' })),
  };
}

export const firmasPorDefecto = (): FirmaProtocolo[] => [
  { rol: 'Ejecutó (ingeniero de campo)', nombre: '', fecha: '', firmado: false },
  { rol: 'Control de calidad', nombre: '', fecha: '', firmado: false },
  { rol: 'Supervisión', nombre: '', fecha: '', firmado: false },
];

/** Liberado: resultado conforme y todas las firmas registradas. */
export const protocoloLiberado = (p: Protocolo) => p.resultado === 'conforme' && p.firmas.length > 0 && p.firmas.every((f) => f.firmado);

const primeraOracion = (t: string) => {
  const s = (t || '').trim().split(/(?<=\.)\s+/)[0] ?? '';
  return s.length > 180 ? s.slice(0, 179) + '…' : s;
};

/** Plan de inspección sugerido: un punto por partida, con el criterio y la norma tomados de su especificación técnica. */
export function puntosSugeridos(r: Resultados): PuntoInspeccion[] {
  const eett = new Map(r.eett.map((e) => [e.partida.id, e]));
  return r.hojas
    .filter((h) => h.metrado > 0)
    .map((h) => {
      const txt = eett.get(h.partida.id)?.secciones.calidad ?? '';
      const norma = txt.match(/\b(NTP|ASTM|ACI|AASHTO|MTC|RNE|ISO|Norma)\b[^,;.]*/)?.[0]?.trim() ?? '';
      return {
        id: uid('ppi'),
        partidaId: h.partida.id,
        control: `Conformidad de ${h.partida.descripcion.toLowerCase()}`,
        norma: norma || 'Especificaciones técnicas del expediente',
        metodo: 'Inspección visual y medición',
        frecuencia: 'Por cada tramo o lote ejecutado',
        criterio: primeraOracion(txt) || 'Según planos y especificaciones técnicas',
        responsable: 'Ing. de control de calidad',
        registro: `Protocolo de ${h.partida.descripcion.toLowerCase()}`,
        tipo: 'W' as TipoPunto,
        serieId: '',
      };
    });
}

export interface LiberacionFrente {
  frenteId: string;
  nombre: string;
  emitidos: number;
  liberados: number;
  indice: number | null; // liberados ÷ emitidos
  puntos: number; // puntos de inspección aplicables (partidas del frente)
  cubiertos: number; // puntos con al menos un protocolo liberado en el frente
  cobertura: number | null;
  pncAbiertos: number;
}

export function liberacionPorFrente(c: Control): LiberacionFrente[] {
  const q = c.calidad;
  const grupos: { id: string; nombre: string; partidas: string[] | null }[] = [...c.frentes.map((f) => ({ id: f.id, nombre: f.nombre, partidas: f.partidas })), { id: '', nombre: 'Sin frente asignado', partidas: null }];
  return grupos
    .map((g) => {
      const prot = q.protocolos.filter((p) => (p.frenteId || '') === g.id);
      const lib = prot.filter(protocoloLiberado);
      const pts = g.partidas ? q.puntos.filter((p) => g.partidas!.includes(p.partidaId)) : [];
      const cubiertos = pts.filter((p) => lib.some((x) => x.puntoId === p.id)).length;
      return {
        frenteId: g.id,
        nombre: g.nombre,
        emitidos: prot.length,
        liberados: lib.length,
        indice: prot.length ? (lib.length / prot.length) * 100 : null,
        puntos: pts.length,
        cubiertos,
        cobertura: pts.length ? (cubiertos / pts.length) * 100 : null,
        pncAbiertos: q.pnc.filter((x) => (x.frenteId || '') === g.id && x.estado !== 'cerrado').length,
      };
    })
    .filter((x) => x.frenteId || x.emitidos || x.pncAbiertos);
}

export function resumenCalidad(c: Control) {
  const q = c.calidad;
  const lib = q.protocolos.filter(protocoloLiberado).length;
  const cerrados = q.pnc.filter((x) => x.estado === 'cerrado');
  const dias = cerrados.filter((x) => x.fecha && x.fechaCierre).map((x) => difDias(x.fecha, x.fechaCierre));
  return {
    puntos: q.puntos.length,
    puntosParada: q.puntos.filter((p) => p.tipo === 'H').length,
    protocolos: q.protocolos.length,
    liberados: lib,
    indiceLiberacion: q.protocolos.length ? (lib / q.protocolos.length) * 100 : null,
    pendientesFirma: q.protocolos.filter((p) => p.resultado === 'conforme' && !protocoloLiberado(p)).length,
    pncAbiertos: q.pnc.length - cerrados.length,
    pncCerrados: cerrados.length,
    diasCierrePromedio: dias.length ? dias.reduce((a, b) => a + b, 0) / dias.length : null,
    costoPnc: q.pnc.reduce((s, x) => s + (x.costo ?? 0), 0),
  };
}

/** Proyecto DMAIC a partir de un producto no conforme (para atacar la causa si se repite). */
export function dmaicDesdePnc(x: Pnc, partida: string): ProyectoDmaic {
  return {
    id: uid('dmc'),
    titulo: `Eliminar la recurrencia del ${x.numero}${partida ? ` – ${partida}` : ''}`,
    responsable: '',
    fase: x.causaRaiz ? 'A' : 'D',
    problema: x.descripcion,
    objetivo: 'Cero productos no conformes por la misma causa',
    alcance: partida,
    ctq: '',
    metrica: 'PNC por mes',
    unidad: 'und',
    mayorEsMejor: false,
    lineaBaseValor: null,
    metaValor: 0,
    valorActual: null,
    causaRaiz: x.causaRaiz,
    ishikawaId: x.ishikawaId,
    acciones: x.acciones.map((a) => ({ ...a, id: uid('acc') })),
    planControl: x.verificacion,
  };
}

export const siguienteNumero = (prefijo: string, existentes: string[]) => {
  const n = existentes.map((s) => parseInt(s.replace(/\D+/g, ''), 10)).filter((v) => isFinite(v));
  return `${prefijo}${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`;
};
