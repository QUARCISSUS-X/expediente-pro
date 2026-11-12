// Integridad de los datos del proyecto: referencias rotas, identificadores repetidos y números no válidos.
// Es distinto de las 15 reglas de validación (que revisan la consistencia del expediente): aquí se revisa que
// el archivo del proyecto no tenga datos sueltos o dañados, y se pueden reparar sin tocar el presupuesto válido.
import type { Proyecto } from './types';
import { uid } from './util';

export interface ProblemaIntegridad {
  clave: string;
  nivel: 'error' | 'aviso';
  mensaje: string;
  cantidad: number;
  reparable: boolean;
  detalle: string[]; // hasta 8 ejemplos
}

type Anotar = (clave: string, nivel: ProblemaIntegridad['nivel'], mensaje: string, reparable: boolean, ejemplo: string) => void;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const noFinito = (v: unknown) => typeof v === 'number' && !Number.isFinite(v);
const CAMPOS_NUM_METRADO = ['veces', 'cantidad', 'factor', 'largo', 'ancho', 'alto', 'area', 'volumen'] as const;

/** Recorre el proyecto. Con `reparar`, corrige el propio objeto (debe ser una copia). */
function recorrer(p: Proyecto, reparar: boolean, anotar: Anotar) {
  // --- partidas: identificadores vacíos o repetidos
  const vistos = new Set<string>();
  for (const pt of p.partidas) {
    if (!pt.id || vistos.has(pt.id)) {
      anotar('id-partida', 'error', 'Partidas sin identificador o con identificador repetido', true, `${pt.codigo} ${pt.descripcion}`);
      if (reparar) pt.id = uid('p');
    }
    vistos.add(pt.id);
  }
  const partidas = new Map(p.partidas.map((x) => [x.id, x]));
  const esHoja = (id: string) => !!partidas.get(id) && !partidas.get(id)!.titulo;

  // --- metrados que apuntan a una partida que ya no existe (o a un título)
  const metrados = p.metrados.filter((m) => {
    if (esHoja(m.partidaId)) return true;
    anotar('metrado-huerfano', 'error', 'Filas de metrado de partidas que ya no existen', true, m.descripcion || m.id);
    return false;
  });
  if (reparar) p.metrados = metrados;
  const idsMet = new Set<string>();
  for (const m of p.metrados) {
    if (!m.id || idsMet.has(m.id)) {
      anotar('id-metrado', 'error', 'Filas de metrado con identificador repetido', true, m.descripcion || m.partidaId);
      if (reparar) m.id = uid('m');
    }
    idsMet.add(m.id);
    for (const k of CAMPOS_NUM_METRADO) {
      if (noFinito(m[k])) {
        anotar('numero', 'error', 'Números no válidos (resultado de una operación imposible)', true, `Metrado de ${partidas.get(m.partidaId)?.codigo ?? '?'}: ${k}`);
        if (reparar) m[k] = null;
      }
    }
  }

  // --- análisis de precios
  const insumos = new Set(p.insumos.map((i) => i.codigo));
  // los análisis de subpartidas (apus['sp:' + código]) y sus códigos son válidos dentro de otros análisis
  const subpartidas = new Set((p.subpartidas ?? []).map((s) => s.codigo));
  for (const c of subpartidas) insumos.add(c);
  for (const [id, apu] of Object.entries(p.apus)) {
    const esSub = id.startsWith('sp:') && subpartidas.has(id.slice(3));
    if (!esHoja(id) && !esSub) {
      anotar('apu-huerfano', 'aviso', 'Análisis de precios de partidas que ya no existen', true, id);
      if (reparar) delete p.apus[id];
      continue;
    }
    const cod = esSub ? id.slice(3) : partidas.get(id)!.codigo;
    if (noFinito(apu.rendimiento) || noFinito(apu.jornada)) {
      anotar('numero', 'error', 'Números no válidos (resultado de una operación imposible)', true, `APU de ${cod}: rendimiento o jornada`);
      if (reparar) {
        if (noFinito(apu.rendimiento)) apu.rendimiento = 0;
        if (noFinito(apu.jornada)) apu.jornada = null;
      }
    }
    const items = (apu.items ?? []).filter((it) => {
      if (it && typeof it.insumo === 'string' && it.insumo.trim()) return true;
      anotar('apu-renglon-vacio', 'aviso', 'Renglones de análisis sin insumo', true, `APU de ${cod}`);
      return false;
    });
    if (reparar) apu.items = items;
    for (const it of items) {
      for (const k of ['cuadrilla', 'cantidad', 'porcentaje'] as const) {
        if (noFinito(it[k])) {
          anotar('numero', 'error', 'Números no válidos (resultado de una operación imposible)', true, `APU de ${cod}: ${k} de ${it.insumo}`);
          if (reparar) it[k] = null;
        }
      }
      if (!insumos.has(it.insumo)) anotar('apu-insumo', 'error', 'Análisis que usan insumos que no están en el catálogo', false, `${cod}: ${it.insumo}`);
    }
  }

  // --- catálogo de insumos
  const codigos = new Set<string>();
  for (const i of p.insumos) {
    if (!i.codigo || codigos.has(i.codigo)) anotar('insumo-duplicado', 'error', 'Insumos sin código o con código repetido', false, `${i.codigo || '(sin código)'} ${i.descripcion}`);
    codigos.add(i.codigo);
    if (noFinito(i.precio)) {
      anotar('numero', 'error', 'Números no válidos (resultado de una operación imposible)', true, `Precio de ${i.codigo}`);
      if (reparar) i.precio = 0;
    }
  }

  // --- gastos generales
  for (const g of p.gg) {
    for (const k of ['cantidad', 'duracion', 'precio', 'participacion'] as const) {
      if (noFinito(g[k])) {
        anotar('numero', 'error', 'Números no válidos (resultado de una operación imposible)', true, `Gasto general "${g.descripcion}": ${k}`);
        if (reparar) g[k] = 0;
      }
    }
  }

  // --- cronograma
  for (const [id, act] of Object.entries(p.programa)) {
    if (!esHoja(id)) {
      anotar('programa-huerfano', 'aviso', 'Actividades del cronograma de partidas que ya no existen', true, id);
      if (reparar) delete p.programa[id];
      continue;
    }
    const preds = (act.predecesoras ?? []).filter((q) => {
      if (q.id !== id && esHoja(q.id)) return true;
      anotar('predecesora-rota', 'error', 'Predecesoras que apuntan a una partida inexistente o a sí misma', true, partidas.get(id)!.codigo);
      return false;
    });
    if (reparar) act.predecesoras = preds;
  }

  // --- fechas
  for (const k of ['fechaInicio', 'fechaBase'] as const) {
    if (p.meta[k] && !ISO.test(p.meta[k])) anotar('fecha', 'error', 'Fechas del proyecto con formato no válido', false, `${k}: ${p.meta[k]}`);
  }
  const feriados = (p.meta.feriados ?? []).filter((f) => {
    if (ISO.test(f)) return true;
    anotar('feriado', 'aviso', 'Feriados con formato no válido', true, String(f));
    return false;
  });
  if (reparar) p.meta.feriados = feriados;

  // --- control de obra: avances de partidas que no están ni en el presupuesto ni en la línea base
  const c = p.control;
  if (c && Array.isArray(c.cortes)) {
    const enBase = new Set((c.lineaBase?.partidas ?? []).map((b) => b.id));
    for (const k of c.cortes) {
      for (const id of Object.keys(k.metrados ?? {})) {
        if (partidas.has(id) || enBase.has(id)) continue;
        anotar('corte-huerfano', 'aviso', 'Avances registrados en partidas que ya no existen', true, `${k.nombre || k.fecha}: ${id}`);
        if (reparar) delete k.metrados[id];
      }
    }
    for (const b of c.lineaBase?.partidas ?? []) {
      if (!partidas.has(b.id)) anotar('base-sin-partida', 'aviso', 'Partidas de la línea base que ya no están en el presupuesto', false, `${b.codigo} ${b.descripcion}`);
    }
  }
}

function recoger() {
  const mapa = new Map<string, ProblemaIntegridad>();
  const anotar: Anotar = (clave, nivel, mensaje, reparable, ejemplo) => {
    let x = mapa.get(clave);
    if (!x) mapa.set(clave, (x = { clave, nivel, mensaje, cantidad: 0, reparable, detalle: [] }));
    x.cantidad++;
    if (x.detalle.length < 8) x.detalle.push(ejemplo);
  };
  return { anotar, lista: () => [...mapa.values()] };
}

/** Lista los problemas de integridad del proyecto (no lo modifica). */
export function revisarIntegridad(p: Proyecto): ProblemaIntegridad[] {
  const x = recoger();
  // la revisión no modifica: los filtros solo se aplican cuando reparar = true
  recorrer(p, false, x.anotar);
  return x.lista();
}

/** Devuelve una copia reparada del proyecto y lo que se corrigió. Lo no reparable queda en `pendientes`. */
export function repararIntegridad(p: Proyecto): { proyecto: Proyecto; reparados: ProblemaIntegridad[]; pendientes: ProblemaIntegridad[] } {
  const copia: Proyecto = JSON.parse(JSON.stringify(p, (_k, v) => (noFinito(v) ? '__NO_FINITO__' : v)), (_k, v) => (v === '__NO_FINITO__' ? NaN : v));
  const x = recoger();
  recorrer(copia, true, x.anotar);
  const reparados = x.lista().filter((q) => q.reparable);
  return { proyecto: reparados.length ? copia : p, reparados, pendientes: revisarIntegridad(reparados.length ? copia : p) };
}

export const resumenIntegridad = (lista: ProblemaIntegridad[]) => ({
  errores: lista.filter((x) => x.nivel === 'error').reduce((s, x) => s + x.cantidad, 0),
  avisos: lista.filter((x) => x.nivel === 'aviso').reduce((s, x) => s + x.cantidad, 0),
  reparables: lista.filter((x) => x.reparable).reduce((s, x) => s + x.cantidad, 0),
});
