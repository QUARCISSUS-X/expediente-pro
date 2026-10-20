// Calculadora del costo de hora-hombre de construcción civil.
// Jornales básicos 2026 (vigencia 01/01/2026 – 31/12/2026, convenio CAPECO–FTCCP),
// publicados por El Peruano. Los porcentajes de BUC, leyes sociales y la movilidad
// son parámetros editables: verifíquelos con la Revista Costos o la tabla CAPECO vigente.

export interface ParametrosMO {
  jornalOperario: number;
  jornalOficial: number;
  jornalPeon: number;
  bucOperario: number; // %
  bucOficial: number; // %
  bucPeon: number; // %
  leyesSociales: number; // % sobre jornal básico
  movilidadDiaria: number; // S/ por día
  horasJornada: number;
}

export const PARAMETROS_MO_2026: ParametrosMO = {
  jornalOperario: 89.3,
  jornalOficial: 69.75,
  jornalPeon: 62.8,
  bucOperario: 32,
  bucOficial: 30,
  bucPeon: 30,
  leyesSociales: 110,
  movilidadDiaria: 8,
  horasJornada: 8,
};

export function costoHH(jornal: number, bucPct: number, p: ParametrosMO): number {
  const dia = jornal + (jornal * bucPct) / 100 + (jornal * p.leyesSociales) / 100 + p.movilidadDiaria;
  return Math.round((dia / p.horasJornada) * 100) / 100;
}

export function tarifasMO(p: ParametrosMO = PARAMETROS_MO_2026) {
  const operario = costoHH(p.jornalOperario, p.bucOperario, p);
  const oficial = costoHH(p.jornalOficial, p.bucOficial, p);
  const peon = costoHH(p.jornalPeon, p.bucPeon, p);
  return {
    operario,
    oficial,
    peon,
    capataz: Math.round(operario * 1.1 * 100) / 100,
  };
}
