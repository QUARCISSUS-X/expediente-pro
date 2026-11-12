// Normaliza un proyecto leído de archivo: revisa su forma, aplica las migraciones numeradas
// (src/io/migraciones) y completa campos faltantes y plantillas nuevas.
import { PLANTILLAS_EETT } from '../data/plantillasEett';
import { documentoPorDefecto, entidadVacia, metaPorDefecto, responsableVacio, textosEettPorDefecto } from '../data/proyectos';
import { MANO_OBRA_DEFECTO } from '../engine/eett';
import type { PlantillaEett, Proyecto } from '../engine/types';
import { normalizarControl } from '../engine/control';
import { exigirEstructura } from './estructura';
import { ESQUEMA_ACTUAL, migrar } from './migraciones';

export { ESQUEMA_ACTUAL } from './migraciones';

type Viejo = Partial<Proyecto>;

export function migrarProyecto(x: unknown): Proyecto {
  exigirEstructura(x);
  const p = migrar(x).datos as Viejo;

  // plantillas: completa la sección de mano de obra y agrega las nuevas de la biblioteca
  const plantillas: PlantillaEett[] = (Array.isArray(p.plantillasEett) && p.plantillasEett.length ? p.plantillasEett : JSON.parse(JSON.stringify(PLANTILLAS_EETT))).map(
    (pl: PlantillaEett) => ({ ...pl, manoObra: pl.manoObra ?? MANO_OBRA_DEFECTO }),
  );
  for (const pl of PLANTILLAS_EETT) if (!plantillas.some((q) => q.clave === pl.clave)) plantillas.push(JSON.parse(JSON.stringify(pl)));

  const entidades = p.entidades ?? { proyectista: entidadVacia(), cliente: entidadVacia(), propietario: entidadVacia() };
  const responsables = p.responsables ?? { elaboro: responsableVacio(), reviso: responsableVacio(), aprobo: responsableVacio() };
  const meta = { ...metaPorDefecto(), ...(p.meta ?? {}) } as Proyecto['meta'];
  if (meta.moneda === 'US$' && (!p.meta?.monedaNombre || p.meta.monedaNombre === 'SOLES')) meta.monedaNombre = 'DÓLARES AMERICANOS';

  return {
    version: 2,
    esquema: p.esquema,
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
    partidas: p.partidas ?? [],
    metrados: p.metrados ?? [],
    apus: p.apus ?? {},
    gg: p.gg ?? [],
    programa: p.programa ?? {},
    tdr: { titulo: '', resumen: '', entregables: [], ...(p.tdr ?? {}) },
    plantillasEett: plantillas,
    memoria: { antecedentes: '', objetivo: '', alcance: '', descripcionTecnica: '', consideraciones: '', ...(p.memoria ?? {}) },
    bitacora: (p.bitacora ?? []).filter((e) => e && typeof e.texto === 'string' && typeof e.fecha === 'string').slice(-500),
    subpresupuestos: (p.subpresupuestos ?? []).filter((s) => s && typeof s.id === 'string'),
    subpartidas: (p.subpartidas ?? []).filter((s) => s && typeof s.codigo === 'string'),
    escenarios: (p.escenarios ?? []).filter((e) => e && typeof e.id === 'string' && e.datos && Array.isArray(e.datos.partidas)),
    ...(p.origen ? { origen: p.origen } : {}),
    ...(p.control ? { control: normalizarControl(p.control) } : {}),
  };
}

/** Verdadero si el proyecto lo guardó una versión más nueva del programa: se abre solo para leer. */
export function esSoloLectura(p: Pick<Proyecto, 'esquema'>): boolean {
  return (p.esquema ?? 0) > ESQUEMA_ACTUAL;
}

/** Copia para guardar en archivo o en el almacén: siempre con el número de esquema. */
export function conEsquema(p: Proyecto): Proyecto {
  return p.esquema && p.esquema >= ESQUEMA_ACTUAL ? p : { ...p, esquema: ESQUEMA_ACTUAL };
}
