// Especificaciones técnicas por plantilla (sin IA): detección por palabras clave y relleno con datos del APU.
import type { ApuCalc, EettPartida, FilaPresupuesto, PlantillaEett, SeccionesEett } from './types';
import { rellenarPlantilla, unidadTexto } from './util';

export const MANO_OBRA_DEFECTO = 'Se empleará el siguiente personal:\n{{manoObra}}';

/** Secciones de la especificación de cada partida, en el orden del documento. */
export const SECCIONES_EETT: { k: keyof SeccionesEett; n: string }[] = [
  { k: 'descripcion', n: 'Descripción' },
  { k: 'manoObra', n: 'Mano de obra' },
  { k: 'materiales', n: 'Materiales' },
  { k: 'equipos', n: 'Equipo y herramientas' },
  { k: 'metodo', n: 'Procedimiento constructivo' },
  { k: 'calidad', n: 'Aceptación de los trabajos' },
  { k: 'medicion', n: 'Método de medición' },
  { k: 'pago', n: 'Forma de pago' },
];

export function normalizar(t: string): string {
  return (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function detectarPlantilla(descripcion: string, plantillas: PlantillaEett[]): PlantillaEett | null {
  const d = normalizar(descripcion);
  let mejor: PlantillaEett | null = null;
  let puntaje = 0;
  for (const pl of plantillas) {
    if (pl.clave === 'generica') continue;
    let s = 0;
    for (const w of pl.palabras) {
      const nw = normalizar(w);
      if (nw && d.includes(nw)) s += nw.length > 6 ? 2 : 1;
    }
    if (s > puntaje) {
      puntaje = s;
      mejor = pl;
    }
  }
  return mejor;
}

function listar(items: string[], vacio: string): string {
  return items.length ? items.map((x) => `- ${x}`).join('\n') : vacio;
}

export function generarEett(hojas: FilaPresupuesto[], apus: Record<string, ApuCalc>, plantillas: PlantillaEett[]): EettPartida[] {
  const porClave = new Map(plantillas.map((p) => [p.clave, p]));
  const generica = porClave.get('generica') ?? plantillas[0];
  return hojas.map((f) => {
    const pt = f.partida;
    let pl: PlantillaEett | null | undefined = pt.eett ? porClave.get(pt.eett) : null;
    if (!pl) pl = detectarPlantilla(pt.descripcion, plantillas);
    const esGenerica = !pl;
    const plantilla = pl ?? generica;
    const apu = apus[pt.id];
    const mats = apu ? apu.items.filter((i) => i.insumo.tipo === 'MAT').map((i) => i.insumo.descripcion) : [];
    const eqs = apu ? apu.items.filter((i) => i.insumo.tipo === 'EQ').map((i) => i.insumo.descripcion) : [];
    const mo = apu ? apu.items.filter((i) => i.insumo.tipo === 'MO').map((i) => i.insumo.descripcion) : [];
    const sc = apu ? apu.items.filter((i) => i.insumo.tipo === 'SC').map((i) => i.insumo.descripcion) : [];
    const vars: Record<string, string> = {
      codigo: pt.codigo,
      partida: pt.descripcion,
      partidaMin: pt.descripcion.charAt(0).toLowerCase() + pt.descripcion.slice(1),
      unidad: pt.unidad,
      unidadTexto: unidadTexto(pt.unidad),
      unidadTextoPlural: unidadTexto(pt.unidad, true),
      materiales: listar(mats, ''),
      equipos: listar(eqs, '- Herramientas manuales'),
      manoObra: listar(mo, ''),
      subcontratos: listar(sc, '—'),
    };
    const secciones = {} as SeccionesEett;
    for (const k of SECCIONES_EETT.map((x) => x.k)) {
      const propio = pt.eettTexto?.[k];
      const base = plantilla[k] ?? (k === 'manoObra' ? MANO_OBRA_DEFECTO : '');
      if (propio && propio.trim()) secciones[k] = rellenarPlantilla(propio, vars);
      else if (k === 'materiales' && mats.length === 0 && base.includes('{{materiales}}')) secciones[k] = 'No se requieren materiales para la ejecución de los trabajos de la presente partida.';
      else if (k === 'manoObra' && mo.length === 0 && base.includes('{{manoObra}}')) secciones[k] = sc.length ? 'No aplica mano de obra directa; el trabajo se ejecuta mediante subcontrato.' : 'No aplica mano de obra directa.';
      else secciones[k] = rellenarPlantilla(base, vars);
    }
    return { partida: pt, plantilla: plantilla.clave, generica: esGenerica && !pt.eettTexto?.descripcion, secciones };
  });
}
