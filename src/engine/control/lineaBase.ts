// Línea base congelada y cortes de avance.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { type Resultados } from '../types';
import { redondear } from '../util';
import { hoyIso } from './fechas';
import { type LineaBase, type PartidaBase } from './modelo';

// ======================================================================= línea base

export function crearLineaBase(r: Resultados, nota = ''): LineaBase {
  const act = new Map(r.programa.actividades.map((a) => [a.partidaId, a]));
  const partidas: PartidaBase[] = r.hojas
    .filter((h) => h.metrado > 0)
    .map((h) => {
      const a = act.get(h.partida.id);
      const apu = r.apus[h.partida.id];
      const mo = apu ? apu.items.filter((it) => it.insumo.tipo === 'MO' && !it.porcentaje) : [];
      const hhUnidad = mo.reduce((s, it) => s + it.cantidad, 0);
      const costoMo = mo.reduce((s, it) => s + it.parcial, 0);
      return {
        id: h.partida.id,
        codigo: h.partida.codigo,
        descripcion: h.partida.descripcion,
        unidad: h.partida.unidad,
        metrado: h.metrado,
        pu: h.pu,
        parcial: h.parcial,
        inicio: a?.inicio ?? r.programa.inicio,
        fin: a?.fin ?? r.programa.fin,
        duracion: a?.duracion ?? 1,
        hhUnidad: redondear(hhUnidad, 4),
        costoHH: hhUnidad > 0 ? redondear(costoMo / hhUnidad, 2) : 0,
      };
    });
  return {
    fecha: hoyIso(),
    nota,
    inicio: r.programa.inicio,
    fin: r.programa.fin,
    plazoDias: r.programa.plazoDias,
    costoDirecto: r.pie.costoDirecto,
    gg: r.pie.gg,
    utilidad: r.pie.utilidad,
    subtotal: r.pie.subtotal,
    total: r.pie.total,
    partidas,
  };
}
