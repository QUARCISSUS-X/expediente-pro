// Migración 2 → 3 (versiones 2.0 a 2.6 → 2.7): número de esquema y bitácora de cambios vacía.
type Datos = Record<string, unknown>;

export const nombre = 'Esquema versionado y bitácora';

export function aplicar(p: Datos): Datos {
  return { ...p, bitacora: Array.isArray(p.bitacora) ? p.bitacora : [] };
}
