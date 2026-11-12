// Migración 1 → 2 (versión 1.x): cliente, empresa y elaborador pasan de meta a entidades y responsables.
import { entidadVacia, responsableVacio } from '../../data/proyectos';

type Datos = Record<string, unknown>;

export const nombre = 'Entidades y responsables';

export function aplicar(p: Datos): Datos {
  const viejo = (p.meta ?? {}) as Datos;
  const s = (k: string) => (typeof viejo[k] === 'string' ? (viejo[k] as string) : '');
  const meta: Datos = { ...viejo };
  for (const k of ['cliente', 'empresa', 'ruc', 'elaborador', 'cargoElaborador', 'colegiatura']) delete meta[k];
  if (meta.moneda === 'US$' && (!viejo.monedaNombre || viejo.monedaNombre === 'SOLES')) meta.monedaNombre = 'DÓLARES AMERICANOS';
  return {
    ...p,
    version: 2,
    meta,
    entidades: p.entidades ?? {
      proyectista: { ...entidadVacia(), nombre: s('empresa'), ruc: s('ruc') },
      cliente: { ...entidadVacia(), nombre: s('cliente') },
      propietario: entidadVacia(),
    },
    responsables: p.responsables ?? {
      elaboro: { ...responsableVacio(s('cargoElaborador') || 'Especialista en costos y presupuestos'), nombre: s('elaborador'), colegiatura: s('colegiatura') },
      reviso: responsableVacio('Jefe de proyecto'),
      aprobo: responsableVacio('Gerente de proyecto'),
    },
  };
}
