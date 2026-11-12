// Revisión de la forma mínima de un archivo de proyecto antes de migrarlo: un archivo ajeno, truncado o
// dañado da un mensaje claro en lugar de un error del programa.

export class ErrorEstructura extends Error {
  constructor(readonly problemas: string[]) {
    super(`El archivo no es un proyecto de Expediente Pro válido: ${problemas.slice(0, 3).join(' ')}${problemas.length > 3 ? ` (y ${problemas.length - 3} problema(s) más)` : ''}`);
    this.name = 'ErrorEstructura';
  }
}

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Reconoce otros archivos del programa que no son un proyecto (para orientar al usuario). */
function otroFormato(x: Record<string, unknown>): string | null {
  if (x.formato === 'expediente-pro-respaldo') return 'Es un respaldo de varios proyectos: use «Restaurar respaldo» en el panel de proyectos.';
  if (typeof x.formato === 'string') return `Es un archivo de tipo «${x.formato}», no un proyecto.`;
  return null;
}

/** Lista de problemas de forma (vacía si el archivo se puede abrir). */
export function revisarEstructura(x: unknown): string[] {
  if (!esObjeto(x)) return [Array.isArray(x) ? 'Contiene una lista en lugar de un proyecto.' : 'No contiene un proyecto.'];
  const otro = otroFormato(x);
  if (otro) return [otro];
  const out: string[] = [];
  if (!Array.isArray(x.partidas)) out.push('Falta la lista de partidas.');
  else {
    const malas = x.partidas.filter((p) => !esObjeto(p) || typeof p.id !== 'string' || typeof p.codigo !== 'string').length;
    if (malas) out.push(`${malas} partida(s) sin identificador o sin código.`);
  }
  if (x.meta !== undefined && !esObjeto(x.meta)) out.push('Los datos generales (meta) están dañados.');
  if (x.meta === undefined) out.push('Faltan los datos generales del proyecto (meta).');
  for (const k of ['insumos', 'metrados', 'gg', 'plantillasEett', 'bitacora'] as const) if (x[k] !== undefined && !Array.isArray(x[k])) out.push(`«${k}» debería ser una lista.`);
  for (const k of ['apus', 'programa', 'entidades', 'responsables', 'documento', 'textosEett', 'tdr', 'memoria', 'control'] as const) if (x[k] !== undefined && x[k] !== null && !esObjeto(x[k])) out.push(`«${k}» está dañado.`);
  if (Array.isArray(x.insumos)) {
    const malos = x.insumos.filter((i) => !esObjeto(i) || typeof i.codigo !== 'string').length;
    if (malos) out.push(`${malos} insumo(s) sin código.`);
  }
  return out;
}

/** Lanza ErrorEstructura si el archivo no tiene la forma mínima de un proyecto. */
export function exigirEstructura(x: unknown): asserts x is Record<string, unknown> {
  const p = revisarEstructura(x);
  if (p.length) throw new ErrorEstructura(p);
}

/** Lee el texto de un archivo .json con un mensaje claro si está truncado o no es JSON. */
export function leerJson(texto: string, nombre = 'El archivo'): unknown {
  const t = texto.replace(/^﻿/, '').trim();
  if (!t) throw new ErrorEstructura([`${nombre} está vacío.`]);
  try {
    return JSON.parse(t);
  } catch {
    const truncado = t.startsWith('{') && !t.endsWith('}');
    throw new ErrorEstructura([truncado ? `${nombre} está incompleto (se cortó al copiarlo o descargarlo).` : `${nombre} no es un archivo JSON.`]);
  }
}
