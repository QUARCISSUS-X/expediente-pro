// Kanban de materiales: tarjetas desde la relación de insumos y el cronograma, stock mínimo, punto de pedido,
// alertas de quiebre y enlace con las restricciones de Last Planner (un material no recibido bloquea la actividad).
import type { Control, Restriccion } from './control';
import type { Resultados } from './types';
import { num, redondear, sumarDias, uid } from './util';

export type EstadoKanban = 'por_pedir' | 'pedido' | 'transito' | 'almacen' | 'frente';

export const ESTADOS_KANBAN: { id: EstadoKanban; texto: string }[] = [
  { id: 'por_pedir', texto: 'Por pedir' },
  { id: 'pedido', texto: 'Pedido' },
  { id: 'transito', texto: 'En tránsito' },
  { id: 'almacen', texto: 'En almacén' },
  { id: 'frente', texto: 'En frente de trabajo' },
];

export const recibido = (e: EstadoKanban) => e === 'almacen' || e === 'frente';

export interface TarjetaKanban {
  id: string;
  insumo: string; // código del insumo
  descripcion: string;
  unidad: string;
  cantidad: number;
  partidaId: string; // actividad que lo necesita
  fechaNecesaria: string; // inicio de la actividad
  fechaPedido: string; // fecha necesaria − anticipación de compra
  estado: EstadoKanban;
  proveedor: string;
  ordenCompra: string;
  nota: string;
  restriccionId: string; // restricción de Last Planner enlazada ('' = ninguna)
  historial: { estado: EstadoKanban; fecha: string }[];
}

export interface ParametroMaterial {
  stockMinimo: number | null; // vacío = consumo diario × días de seguridad
  puntoPedido: number | null; // vacío = consumo diario × anticipación + stock mínimo
}

export interface Kanban {
  tarjetas: TarjetaKanban[];
  materiales: Record<string, ParametroMaterial>;
  diasSeguridad: number;
}

export const kanbanVacio = (): Kanban => ({ tarjetas: [], materiales: {}, diasSeguridad: 3 });

export function normalizarKanban(x: unknown): Kanban {
  const k = (x && typeof x === 'object' ? x : {}) as Partial<Kanban>;
  const estados = new Set(ESTADOS_KANBAN.map((e) => e.id));
  return {
    tarjetas: (Array.isArray(k.tarjetas) ? k.tarjetas : []).map((t) => ({
      ...t,
      estado: estados.has(t.estado) ? t.estado : 'por_pedir',
      cantidad: num(t.cantidad),
      restriccionId: t.restriccionId ?? '',
      historial: Array.isArray(t.historial) ? t.historial : [],
    })),
    materiales: k.materiales && typeof k.materiales === 'object' ? k.materiales : {},
    diasSeguridad: num(k.diasSeguridad, 3),
  };
}

const anticipacion = (r: Resultados, codigo: string) => {
  const ins = r.proyecto.insumos.find((i) => i.codigo === codigo);
  return num(ins?.plazoCompraDias ?? r.proyecto.meta.plazoCompraDefecto, r.proyecto.meta.plazoCompraDefecto);
};

/** Una tarjeta por material y actividad: cantidad del APU × metrado, necesaria al inicio de la actividad. */
export function tarjetasDesdeCronograma(r: Resultados): TarjetaKanban[] {
  const res: TarjetaKanban[] = [];
  for (const a of r.programa.actividades) {
    const apu = r.apus[a.partidaId];
    if (!apu || !a.inicio) continue;
    for (const it of apu.items) {
      if (it.insumo.tipo !== 'MAT' || it.porcentaje !== null) continue;
      const cantidad = redondear(a.metrado * it.cantidad, 2);
      if (cantidad <= 0) continue;
      res.push({
        id: uid('kbn'),
        insumo: it.insumo.codigo,
        descripcion: it.insumo.descripcion,
        unidad: it.insumo.unidad,
        cantidad,
        partidaId: a.partidaId,
        fechaNecesaria: a.inicio,
        fechaPedido: sumarDias(a.inicio, -anticipacion(r, it.insumo.codigo)),
        estado: 'por_pedir',
        proveedor: it.insumo.fuente ?? '',
        ordenCompra: '',
        nota: '',
        restriccionId: '',
        historial: [],
      });
    }
  }
  return res.sort((x, y) => x.fechaPedido.localeCompare(y.fechaPedido) || x.descripcion.localeCompare(y.descripcion));
}

function restriccionDe(t: TarjetaKanban, hoy: string): Restriccion {
  return {
    id: uid('res'),
    partidaId: t.partidaId,
    tipo: 'Materiales',
    descripcion: `Material en obra: ${t.descripcion} (${t.cantidad} ${t.unidad}) · kanban`,
    responsable: 'Logística',
    fechaRequerida: sumarDias(t.fechaNecesaria, -1),
    fechaLiberacion: recibido(t.estado) ? hoy : '',
    liberada: recibido(t.estado),
  };
}

/** Agrega al tablero las tarjetas que faltan (mismo material y actividad no se repiten). Devuelve cuántas agregó. */
export function generarTarjetas(r: Resultados, c: Control, crearRestricciones: boolean, hoy: string): number {
  const existe = new Set(c.kanban.tarjetas.map((t) => `${t.insumo}|${t.partidaId}`));
  let n = 0;
  for (const t of tarjetasDesdeCronograma(r)) {
    if (existe.has(`${t.insumo}|${t.partidaId}`)) continue;
    if (crearRestricciones) enlazarRestriccion(c, t, hoy);
    c.kanban.tarjetas.push(t);
    n++;
  }
  return n;
}

export function enlazarRestriccion(c: Control, t: TarjetaKanban, hoy: string): void {
  if (t.restriccionId && c.restricciones.some((x) => x.id === t.restriccionId)) return;
  const x = restriccionDe(t, hoy);
  c.restricciones.push(x);
  t.restriccionId = x.id;
}

/** Cambia el estado de la tarjeta y libera o reabre su restricción de Last Planner. */
export function moverTarjeta(c: Control, id: string, estado: EstadoKanban, hoy: string): void {
  const t = c.kanban.tarjetas.find((x) => x.id === id);
  if (!t || t.estado === estado) return;
  t.estado = estado;
  t.historial.push({ estado, fecha: hoy });
  const x = c.restricciones.find((y) => y.id === t.restriccionId);
  if (x) {
    x.liberada = recibido(estado);
    x.fechaLiberacion = x.liberada ? hoy : '';
  }
}

export function eliminarTarjeta(c: Control, id: string): void {
  const t = c.kanban.tarjetas.find((x) => x.id === id);
  if (t?.restriccionId) c.restricciones = c.restricciones.filter((x) => x.id !== t.restriccionId);
  c.kanban.tarjetas = c.kanban.tarjetas.filter((x) => x.id !== id);
}

export type AlertaTarjeta = 'quiebre' | 'pedir' | 'proxima' | 'ok';

/** quiebre: se necesita y no llegó; pedir: ya pasó la fecha de pedido; proxima: se necesita en los próximos 7 días. */
export function alertaTarjeta(t: TarjetaKanban, hoy: string): AlertaTarjeta {
  if (recibido(t.estado)) return 'ok';
  if (t.fechaNecesaria <= hoy) return 'quiebre';
  if (t.estado === 'por_pedir' && t.fechaPedido <= hoy) return 'pedir';
  if (t.fechaNecesaria <= sumarDias(hoy, 7)) return 'proxima';
  return 'ok';
}

export interface AnalisisMaterial {
  codigo: string;
  descripcion: string;
  unidad: string;
  anticipacion: number; // días
  consumoDiario: number; // promedio en los días laborables en que se usa
  stockMinimo: number;
  puntoPedido: number;
  enAlmacen: number;
  enCamino: number; // pedido + en tránsito
  porPedir: number;
  demandaAnticipacion: number; // lo que se necesita dentro del plazo de compra
  tarjetas: number;
  alerta: 'quiebre' | 'reponer' | 'pedir' | 'ok';
}

/** Stock y alertas por material con los parámetros de cada uno (o los valores por defecto). */
export function analisisMateriales(r: Resultados, c: Control, hoy: string): AnalisisMaterial[] {
  const diario = new Map<string, number[]>();
  for (const a of r.programa.actividades) {
    const apu = r.apus[a.partidaId];
    if (!apu || a.duracion <= 0) continue;
    for (const it of apu.items) {
      if (it.insumo.tipo !== 'MAT' || it.porcentaje !== null) continue;
      let s = diario.get(it.insumo.codigo);
      if (!s) diario.set(it.insumo.codigo, (s = new Array(r.programa.diasLaborables).fill(0)));
      for (let d = a.es; d < a.ef; d++) s[d] += (a.metrado * it.cantidad) / a.duracion;
    }
  }
  const codigos = [...new Set(c.kanban.tarjetas.map((t) => t.insumo))];
  return codigos
    .map((codigo) => {
      const ts = c.kanban.tarjetas.filter((t) => t.insumo === codigo);
      const serie = diario.get(codigo) ?? [];
      const usados = serie.filter((v) => v > 0);
      const consumo = usados.length ? usados.reduce((a, b) => a + b, 0) / usados.length : 0;
      const ant = anticipacion(r, codigo);
      const par = c.kanban.materiales[codigo];
      const stockMinimo = par?.stockMinimo !== null && par?.stockMinimo !== undefined ? num(par.stockMinimo) : consumo * num(c.kanban.diasSeguridad, 3);
      const puntoPedido = par?.puntoPedido !== null && par?.puntoPedido !== undefined ? num(par.puntoPedido) : consumo * ant + stockMinimo;
      const suma = (f: (t: TarjetaKanban) => boolean) => ts.filter(f).reduce((s, t) => s + num(t.cantidad), 0);
      const enAlmacen = suma((t) => t.estado === 'almacen');
      const enCamino = suma((t) => t.estado === 'pedido' || t.estado === 'transito');
      const porPedir = suma((t) => t.estado === 'por_pedir');
      const limite = sumarDias(hoy, ant);
      const demanda = suma((t) => t.estado !== 'frente' && t.fechaNecesaria <= limite);
      const quiebre = ts.some((t) => alertaTarjeta(t, hoy) === 'quiebre');
      const pedir = ts.some((t) => alertaTarjeta(t, hoy) === 'pedir');
      const reponer = demanda > 0 && enAlmacen + enCamino < Math.min(puntoPedido, demanda) - 1e-9;
      const ins = ts[0];
      return {
        codigo,
        descripcion: ins.descripcion,
        unidad: ins.unidad,
        anticipacion: ant,
        consumoDiario: redondear(consumo, 3),
        stockMinimo: redondear(stockMinimo, 2),
        puntoPedido: redondear(puntoPedido, 2),
        enAlmacen: redondear(enAlmacen, 2),
        enCamino: redondear(enCamino, 2),
        porPedir: redondear(porPedir, 2),
        demandaAnticipacion: redondear(demanda, 2),
        tarjetas: ts.length,
        alerta: quiebre ? 'quiebre' : reponer ? 'reponer' : pedir ? 'pedir' : 'ok',
      } as AnalisisMaterial;
    })
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion));
}

export function resumenKanban(c: Control, hoy: string) {
  const ts = c.kanban.tarjetas;
  const porEstado = Object.fromEntries(ESTADOS_KANBAN.map((e) => [e.id, ts.filter((t) => t.estado === e.id).length])) as Record<EstadoKanban, number>;
  const alertas = ts.map((t) => alertaTarjeta(t, hoy));
  return {
    total: ts.length,
    porEstado,
    quiebres: alertas.filter((a) => a === 'quiebre').length,
    porPedirVencidas: alertas.filter((a) => a === 'pedir').length,
    proximas: alertas.filter((a) => a === 'proxima').length,
    recibidasPct: ts.length ? (ts.filter((t) => recibido(t.estado)).length / ts.length) * 100 : null,
  };
}
