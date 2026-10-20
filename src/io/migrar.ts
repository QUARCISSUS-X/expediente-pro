// Normaliza un proyecto leído de archivo: versiones anteriores, campos faltantes y plantillas nuevas.
import { PLANTILLAS_EETT } from '../data/plantillasEett';
import { documentoPorDefecto, entidadVacia, metaPorDefecto, responsableVacio, textosEettPorDefecto } from '../data/proyectos';
import { MANO_OBRA_DEFECTO } from '../engine/eett';
import type { PlantillaEett, Proyecto } from '../engine/types';

type Viejo = Partial<Proyecto> & { meta?: Record<string, unknown> };

export function migrarProyecto(x: unknown): Proyecto {
  const p = (x ?? {}) as Viejo;
  if (!p || typeof p !== 'object' || !Array.isArray(p.partidas)) throw new Error('El archivo no es un proyecto de Expediente Pro.');
  const viejo = (p.meta ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof viejo[k] === 'string' ? (viejo[k] as string) : '');

  // plantillas: completa la sección de mano de obra y agrega las nuevas de la biblioteca
  const plantillas: PlantillaEett[] = (Array.isArray(p.plantillasEett) && p.plantillasEett.length ? p.plantillasEett : JSON.parse(JSON.stringify(PLANTILLAS_EETT))).map(
    (pl: PlantillaEett) => ({ ...pl, manoObra: pl.manoObra ?? MANO_OBRA_DEFECTO }),
  );
  for (const pl of PLANTILLAS_EETT) if (!plantillas.some((q) => q.clave === pl.clave)) plantillas.push(JSON.parse(JSON.stringify(pl)));

  const meta = { ...metaPorDefecto(), ...(viejo as object) } as Proyecto['meta'];
  for (const k of ['cliente', 'empresa', 'ruc', 'elaborador', 'cargoElaborador', 'colegiatura']) delete (meta as unknown as Record<string, unknown>)[k];
  if (meta.moneda === 'US$' && (!viejo.monedaNombre || viejo.monedaNombre === 'SOLES')) meta.monedaNombre = 'DÓLARES AMERICANOS';

  const entidades = p.entidades ?? {
    proyectista: { ...entidadVacia(), nombre: s('empresa'), ruc: s('ruc') },
    cliente: { ...entidadVacia(), nombre: s('cliente') },
    propietario: entidadVacia(),
  };
  const responsables = p.responsables ?? {
    elaboro: { ...responsableVacio(s('cargoElaborador') || 'Especialista en costos y presupuestos'), nombre: s('elaborador'), colegiatura: s('colegiatura') },
    reviso: responsableVacio('Jefe de proyecto'),
    aprobo: responsableVacio('Gerente de proyecto'),
  };

  return {
    version: 2,
    meta,
    entidades: {
      proyectista: { ...entidadVacia(), ...entidades.proyectista },
      cliente: { ...entidadVacia(), ...entidades.cliente },
      propietario: { ...entidadVacia(), ...(entidades.propietario ?? {}) },
    },
    responsables: {
      elaboro: { ...responsableVacio(), ...responsables.elaboro },
      reviso: { ...responsableVacio(), ...responsables.reviso },
      aprobo: { ...responsableVacio(), ...responsables.aprobo },
    },
    documento: { ...documentoPorDefecto(), ...(p.documento ?? {}) },
    textosEett: { ...textosEettPorDefecto(), ...(p.textosEett ?? {}) },
    insumos: p.insumos ?? [],
    partidas: p.partidas,
    metrados: p.metrados ?? [],
    apus: p.apus ?? {},
    gg: p.gg ?? [],
    programa: p.programa ?? {},
    tdr: { titulo: '', resumen: '', entregables: [], ...(p.tdr ?? {}) },
    plantillasEett: plantillas,
    memoria: { antecedentes: '', objetivo: '', alcance: '', descripcionTecnica: '', consideraciones: '', ...(p.memoria ?? {}) },
    ...(p.origen ? { origen: p.origen } : {}),
  };
}
