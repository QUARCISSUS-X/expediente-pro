// Ayudas comunes de los módulos de control de ejecución.
import { useMemo } from 'react';
import { type Control, controlVacio, normalizarControl } from '../engine/control';
import type { Resultados } from '../engine/types';
import { fechaCorta, fmt } from '../engine/util';
import type { Contexto } from './estado';

export function useControl(ctx: Contexto) {
  const c = useMemo(() => normalizarControl(ctx.proyecto.control), [ctx.proyecto.control]);
  const mut = (fn: (c: Control) => void) =>
    ctx.actualizar((d) => {
      if (!d.control) d.control = controlVacio();
      fn(d.control as unknown as Control);
    });
  return { c, mut };
}

export function opcionesPartidas(r: Resultados, vacio = '— Sin partida —') {
  return [{ valor: '', texto: vacio }, ...r.hojas.filter((h) => h.metrado > 0).map((h) => ({ valor: h.partida.id, texto: `${h.partida.codigo} ${h.partida.descripcion}` }))];
}

export function opcionesFrentes(c: Control, vacio = '— Sin frente —') {
  return [{ valor: '', texto: vacio }, ...c.frentes.map((f) => ({ valor: f.id, texto: f.nombre }))];
}

export const opciones = (lista: readonly string[]) => lista.map((x) => ({ valor: x, texto: x }));

export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : `${fmt(v, d)} %`);
export const ind = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '—' : fmt(v, d));
export const fc = (iso: string | null | undefined) => (iso ? fechaCorta(iso) : '—');
export const fechaCortaDM = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

export const estadoIndice = (v: number | null | undefined, bien = 0.95, regular = 0.85): 'ok' | 'advertencia' | 'error' | 'neutra' =>
  v === null || v === undefined ? 'neutra' : v >= bien ? 'ok' : v >= regular ? 'advertencia' : 'error';

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
