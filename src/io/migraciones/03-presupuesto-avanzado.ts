// Migración 3 → 4 (2.7 → 2.9): subpresupuestos, subpartidas y versiones del presupuesto (vacíos en proyectos anteriores).
type Datos = Record<string, unknown>;

export const nombre = 'Presupuesto avanzado';

export function aplicar(p: Datos): Datos {
  const lista = (k: string) => (Array.isArray(p[k]) ? p[k] : []);
  return { ...p, subpresupuestos: lista('subpresupuestos'), subpartidas: lista('subpartidas'), escenarios: lista('escenarios') };
}
