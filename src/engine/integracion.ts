// Integración de apartados: un dato se registra una vez y los demás módulos lo leen. Metrado vigente (con los cambios
// aprobados), requerimiento semanal de materiales, restricciones automáticas de Last Planner (kanban, calidad y RFI),
// liberación de partidas para valorizar, contingencia de riesgo y el centro de pendientes.
import { protocoloLiberado } from './calidad';
import type { Control, Restriccion } from './control';
import { lunesDe } from './control/fechas';
import { alertaTarjeta, recibido } from './kanban';
import type { Resultados } from './types';
import { num, redondear, sumarDias } from './util';

// ------------------------------------------------------------ cambios aprobados → metrado vigente

/** Metrado vigente por partida: el del presupuesto más los mayores metrados de adicionales aprobados, menos los de deductivos. */
export function metradosVigentes(r: Resultados, c?: Control | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of r.hojas) out[h.partida.id] = h.metrado;
  for (const x of c?.cambios ?? []) {
    if (x.estado !== 'aprobado' || !x.partidas?.length) continue;
    const signo = x.tipo === 'deductivo' ? -1 : 1;
    for (const p of x.partidas) if (p.partidaId in out) out[p.partidaId] = redondear(out[p.partidaId] + signo * Math.abs(num(p.metrado)), 4);
  }
  return out;
}

/** Monto sin IGV de un cambio a partir de sus partidas: metrado × P.U., más GG y utilidad en la proporción del presupuesto. */
export function montoDeCambio(r: Resultados, partidas: { partidaId: string; metrado: number }[]): number {
  const pu = new Map(r.hojas.map((h) => [h.partida.id, h.pu]));
  const cd = partidas.reduce((s, p) => s + Math.abs(num(p.metrado)) * (pu.get(p.partidaId) ?? 0), 0);
  const f = r.pie.costoDirecto > 0 ? (r.pie.gg + r.pie.utilidad) / r.pie.costoDirecto : 0;
  return redondear(cd * (1 + f), 2);
}

// ------------------------------------------------------------ cronograma + insumos → requerimiento de materiales

export interface RequerimientoMaterial {
  codigo: string;
  descripcion: string;
  unidad: string;
  total: number;
  semanas: { lunes: string; cantidad: number; fechaNecesidad: string }[];
}

/**
 * Requerimiento semanal de materiales: la cantidad del APU × el metrado vigente de cada partida, repartida en sus días
 * laborables del cronograma; la fecha de necesidad es el primer día de la semana en que se usa.
 */
export function requerimientoMateriales(r: Resultados, c?: Control | null): RequerimientoMaterial[] {
  const met = metradosVigentes(r, c);
  const porMat = new Map<string, RequerimientoMaterial & { m: Map<string, { cantidad: number; fecha: string }> }>();
  for (const a of r.programa.actividades) {
    const apu = r.apus[a.partidaId];
    if (!apu || a.duracion <= 0) continue;
    const metrado = met[a.partidaId] ?? a.metrado;
    for (const it of apu.items) {
      if (it.insumo.tipo !== 'MAT' || it.porcentaje !== null) continue;
      let x = porMat.get(it.insumo.codigo);
      if (!x) porMat.set(it.insumo.codigo, (x = { codigo: it.insumo.codigo, descripcion: it.insumo.descripcion, unidad: it.insumo.unidad, total: 0, semanas: [], m: new Map() }));
      const diario = (metrado * it.cantidad) / a.duracion;
      for (let d = a.es; d < a.ef; d++) {
        const f = r.programa.diaFecha[d];
        if (!f) continue;
        const l = lunesDe(f);
        const s = x.m.get(l) ?? { cantidad: 0, fecha: f };
        s.cantidad += diario;
        if (f < s.fecha) s.fecha = f;
        x.m.set(l, s);
      }
    }
  }
  return [...porMat.values()]
    .map(({ m, ...x }) => {
      const semanas = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([lunes, s]) => ({ lunes, cantidad: redondear(s.cantidad, 2), fechaNecesidad: s.fecha }));
      return { ...x, semanas, total: redondear(semanas.reduce((s, w) => s + w.cantidad, 0), 2) };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion));
}

// ------------------------------------------------------------ kanban, calidad y RFI → restricciones de Last Planner

export type RestriccionAuto = Restriccion & { origen: 'kanban' | 'calidad' | 'rfi'; automatica: true };

/**
 * Restricciones que nacen solas y se levantan solas cuando se resuelve su origen:
 * material no recibido que se necesita en 3 semanas o ya está atrasado; protocolo de un punto de parada (H) sin
 * liberar en una predecesora; consulta (RFI) abierta asignada a una partida.
 */
export function restriccionesAutomaticas(r: Resultados, c: Control, hoy: string): RestriccionAuto[] {
  const out: RestriccionAuto[] = [];
  const limite = sumarDias(hoy, 21);
  // kanban (las tarjetas que ya tienen su restricción enlazada no se repiten)
  for (const t of c.kanban.tarjetas) {
    if (recibido(t.estado) || t.restriccionId) continue;
    const alerta = alertaTarjeta(t, hoy);
    if (alerta === 'ok' && t.fechaNecesaria > limite) continue;
    out.push({ id: `auto:kanban:${t.id}`, partidaId: t.partidaId, tipo: 'Materiales', descripcion: `${t.descripcion}: ${fmtN(t.cantidad)} ${t.unidad} ${t.estado === 'por_pedir' ? 'por pedir' : 'pedido, sin llegar'}${alerta === 'quiebre' ? ' (atrasado)' : ''}`, responsable: 'Logística', fechaRequerida: sumarDias(t.fechaNecesaria, -1), fechaLiberacion: '', liberada: false, origen: 'kanban', automatica: true });
  }
  // calidad: punto de parada sin protocolo liberado en una partida predecesora
  const puntosH = c.calidad.puntos.filter((p) => p.tipo === 'H');
  const liberado = (puntoId: string) => c.calidad.protocolos.some((p) => p.puntoId === puntoId && protocoloLiberado(p));
  const codigo = new Map(r.hojas.map((h) => [h.partida.id, h.partida.codigo]));
  for (const a of r.programa.actividades) {
    if (a.fin < hoy) continue;
    for (const pr of a.predecesoras) {
      for (const pt of puntosH.filter((p) => p.partidaId === pr.id && !liberado(p.id))) {
        out.push({ id: `auto:calidad:${pt.id}:${a.partidaId}`, partidaId: a.partidaId, tipo: 'Prerrequisito', descripcion: `Protocolo pendiente de ${codigo.get(pr.id) ?? ''}: ${pt.control} (punto de parada)`, responsable: pt.responsable || 'Control de calidad', fechaRequerida: sumarDias(a.inicio, -1), fechaLiberacion: '', liberada: false, origen: 'calidad', automatica: true });
      }
    }
  }
  // consultas (RFI) sin responder
  for (const x of c.registros) {
    if (x.tipo !== 'rfi' || x.estado !== 'abierto' || !x.partidaId) continue;
    out.push({ id: `auto:rfi:${x.id}`, partidaId: x.partidaId, tipo: 'Diseño / planos', descripcion: `Consulta ${x.numero || ''} sin respuesta: ${x.asunto}`.trim(), responsable: x.destinatario || 'Proyectista', fechaRequerida: x.fechaLimite || '', fechaLiberacion: '', liberada: false, origen: 'rfi', automatica: true });
  }
  return out;
}
const fmtN = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 });

/** Restricciones registradas más las automáticas (las que usa el lookahead y el plan semanal). */
export function todasLasRestricciones(r: Resultados, c: Control, hoy: string): (Restriccion | RestriccionAuto)[] {
  return [...c.restricciones, ...restriccionesAutomaticas(r, c, hoy)];
}

// ------------------------------------------------------------ calidad → valorización

/**
 * Metrado liberado por calidad hasta una fecha, por partida. Una partida sin puntos de inspección no se controla
 * (Infinity). Un protocolo liberado sin metrado libera toda la partida.
 */
export function metradoLiberado(c: Control, hasta: string, metradoPartida: (id: string) => number): Map<string, number> {
  const out = new Map<string, number>();
  const conPuntos = new Set(c.calidad.puntos.map((p) => p.partidaId));
  for (const id of conPuntos) out.set(id, 0);
  for (const p of c.calidad.protocolos) {
    if (!conPuntos.has(p.partidaId) || !protocoloLiberado(p) || (p.fecha && p.fecha > hasta)) continue;
    const m = p.metrado === null || p.metrado === undefined || (p.metrado as unknown) === '' ? metradoPartida(p.partidaId) : num(p.metrado);
    out.set(p.partidaId, (out.get(p.partidaId) ?? 0) + m);
  }
  return out;
}

// ------------------------------------------------------------ riesgo → gastos generales y cadena crítica

/** Contingencia que propone el análisis de riesgo: P80 de costo − costo directo, y P80 − P50 de plazo (días laborables). */
export function contingenciaRiesgo(r: Resultados, c: Control): { monto: number; dias: number; fecha: string } | null {
  const s = c.riesgo.resumen;
  if (!s) return null;
  const monto = s.p80Costo !== null && s.p80Costo !== undefined ? Math.max(0, redondear(s.p80Costo - r.pie.costoDirecto, 2)) : 0;
  return { monto, dias: Math.max(0, Math.round(s.p80Dias - s.p50Dias)), fecha: s.fecha };
}

// ------------------------------------------------------------ centro de pendientes

export interface Pendiente {
  modulo: string; // id del módulo donde se resuelve
  nivel: 'error' | 'advertencia' | 'info';
  grupo: string;
  texto: string;
  partidaId?: string;
  fecha?: string;
}

/** Lo que requiere atención en todos los apartados, del más urgente al menos urgente. */
export function centroPendientes(r: Resultados, hoy: string): Pendiente[] {
  const out: Pendiente[] = [];
  for (const v of r.validacion) if (v.estado !== 'ok') out.push({ modulo: 'validacion', nivel: v.estado === 'error' ? 'error' : 'advertencia', grupo: 'Expediente', texto: `Regla ${v.regla}. ${v.control}: ${v.detalle}` });
  const c = r.proyecto.control;
  if (c) {
    for (const x of todasLasRestricciones(r, c, hoy)) {
      if (x.liberada) continue;
      const vencida = !!x.fechaRequerida && x.fechaRequerida < hoy;
      out.push({ modulo: 'lps', nivel: vencida ? 'error' : 'advertencia', grupo: 'Restricciones', texto: `${x.tipo}: ${x.descripcion}`, partidaId: x.partidaId, fecha: x.fechaRequerida });
    }
    for (const t of c.kanban.tarjetas) {
      const a = alertaTarjeta(t, hoy);
      if (a === 'quiebre' || a === 'pedir') out.push({ modulo: 'logistica', nivel: a === 'quiebre' ? 'error' : 'advertencia', grupo: 'Materiales', texto: `${a === 'quiebre' ? 'Quiebre' : 'Pedir ya'}: ${t.descripcion} (${fmtN(t.cantidad)} ${t.unidad})`, partidaId: t.partidaId, fecha: a === 'quiebre' ? t.fechaNecesaria : t.fechaPedido });
    }
    for (const p of c.calidad.protocolos) if (p.resultado === 'conforme' && !protocoloLiberado(p)) out.push({ modulo: 'calidad', nivel: 'advertencia', grupo: 'Calidad', texto: `Protocolo ${p.numero} conforme pero sin todas las firmas`, partidaId: p.partidaId, fecha: p.fecha });
    for (const x of c.calidad.pnc) if (x.estado !== 'cerrado') out.push({ modulo: 'calidad', nivel: 'advertencia', grupo: 'Calidad', texto: `Producto no conforme ${x.numero}: ${x.descripcion}`, partidaId: x.partidaId, fecha: x.fecha });
    for (const x of c.registros) if (x.estado === 'abierto' && x.fechaLimite) out.push({ modulo: 'control', nivel: x.fechaLimite < hoy ? 'error' : 'info', grupo: 'Cuaderno y consultas', texto: `${x.tipo === 'rfi' ? 'Consulta' : 'Registro'} ${x.numero}: ${x.asunto}${x.fechaLimite < hoy ? ' (vencida)' : ''}`, partidaId: x.partidaId, fecha: x.fechaLimite });
    for (const x of c.cambios) if (x.estado === 'propuesto') out.push({ modulo: 'control', nivel: 'info', grupo: 'Cambios', texto: `${x.tipo === 'deductivo' ? 'Deductivo' : x.tipo === 'adicional' ? 'Adicional' : 'Cambio'} ${x.numero} por aprobar: ${x.descripcion}`, fecha: x.fecha });
    for (const x of c.riesgos) if (x.estado !== 'cerrado' && num(x.probabilidad, 1) * num(x.impacto, 1) >= 15) out.push({ modulo: 'control', nivel: 'advertencia', grupo: 'Riesgos', texto: `Riesgo crítico abierto: ${x.descripcion}` });
  }
  const orden = { error: 0, advertencia: 1, info: 2 };
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel] || (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || a.grupo.localeCompare(b.grupo));
}
