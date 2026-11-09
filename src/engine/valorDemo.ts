// Datos de demostración de ingeniería de valor (separados para no inflar control.ts).
import type { Resultados } from './types';
import { redondear, sumarDias, uid } from './util';
import { calcularMetas, type Valor, valorVacio } from './valor';

export function demostracionValor(r: Resultados, hoy: string): Valor {
  const v = valorVacio();
  v.reduccionPct = 4;
  const titulos = r.filas.filter((f) => f.esTitulo && f.nivel === 1);
  const mayorTitulo = [...titulos].sort((a, b) => b.parcial - a.parcial)[0];
  if (mayorTitulo) v.metas[mayorTitulo.partida.id] = { modo: 'reduccion', valor: 7 };
  const pref = mayorTitulo ? mayorTitulo.partida.codigo + '.' : '';
  const partidas = r.hojas.filter((h) => h.metrado > 0 && h.partida.codigo.startsWith(pref)).sort((a, b) => b.parcial - a.parcial);
  const [p1, p2] = partidas;
  const [c1, c2, c3, c4, c5] = v.criterios.map((k) => k.id);
  if (p1) {
    v.funcionActual[p1.partida.id] = 6;
    v.puntajesActual[p1.partida.id] = { [c1]: 3, [c2]: 3, [c3]: 4, [c4]: 3, [c5]: 3 };
    v.alternativas.push({
      id: uid('alt'), codigo: 'VE-01', ambitoId: p1.partida.id,
      descripcion: 'Proveedor alterno con instalación incluida y garantía de 20 años',
      costo: null, plazoDias: -4, funcion: 6, ventajas: 'Menor precio, instalación con personal certificado', riesgos: 'Proveedor nuevo; exigir certificados de calidad por lote',
      puntajes: { [c1]: 4, [c2]: 4, [c3]: 4, [c4]: 4, [c5]: 3 }, estado: 'aprobada',
      aplicacion: { modo: 'pu', pu: redondear(p1.pu * 0.9, 2), apuDe: '', metrado: null, descripcion: '' }, respaldo: null,
    });
    v.alternativas.push({
      id: uid('alt'), codigo: 'VE-02', ambitoId: p1.partida.id,
      descripcion: 'Material de menor espesor con capa adicional de protección',
      costo: null, plazoDias: 3, funcion: 5, ventajas: 'Ahorro en material', riesgos: 'Menor durabilidad; requiere aprobación del cliente',
      puntajes: { [c1]: 5, [c2]: 2, [c3]: 2, [c4]: 3, [c5]: 2 }, estado: 'propuesta',
      aplicacion: { modo: 'pu', pu: redondear(p1.pu * 0.82, 2), apuDe: '', metrado: null, descripcion: '' }, respaldo: null,
    });
  }
  if (p2) {
    v.alternativas.push({
      id: uid('alt'), codigo: 'VE-03', ambitoId: p2.partida.id,
      descripcion: 'Usar material propio de la excavación zarandeado en lugar de préstamo',
      costo: redondear(p2.parcial * 0.86, 2), plazoDias: 0, funcion: 5, ventajas: 'Reduce acarreo y compra de material', riesgos: 'Ensayos de granulometría por cada 500 m³',
      puntajes: { [c1]: 4, [c2]: 3, [c3]: 3, [c4]: 3, [c5]: 4 }, estado: 'propuesta', aplicacion: null, respaldo: null,
    });
  }
  const m = calcularMetas(r, v);
  v.seguimiento = [
    { id: uid('seg'), fecha: sumarDias(hoy, -21), estimado: m.estimado, meta: m.meta, nota: 'Presupuesto de la oferta' },
    { id: uid('seg'), fecha: hoy, estimado: m.estimadoConAprobadas, meta: m.meta, nota: 'Con VE-01 aprobada' },
  ];
  return v;
}
