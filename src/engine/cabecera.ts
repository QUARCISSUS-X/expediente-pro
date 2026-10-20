// Datos generales que se repiten en carátulas, encabezados y pies de todos los entregables.
import type { Entidad, Logo, Proyecto } from './types';
import { fechaCorta, fechaLarga, rellenarPlantilla } from './util';

export interface Cabecera {
  proyecto: string;
  codigoProyecto: string;
  descripcion: string;
  cliente: string;
  propietario: string;
  proyectista: string;
  ubicacion: string;
  ubicacionLarga: string;
  fecha: string; // dd/mm/aaaa
  fechaLarga: string;
  fechaBase: string; // fecha de precios dd/mm/aaaa
  moneda: string;
  monedaNombre: string;
  codigoDocumento: string;
  revision: string;
  fechaRevision: string;
  estado: string;
  tipoDocumento: string;
  logoProyectista: Logo | null;
  logoCliente: Logo | null;
  imagenPortada: Logo | null;
  autores: string[];
  aviso: string;
}

export function nombreEntidad(e: Entidad | undefined): string {
  return (e?.nombre || '').trim();
}

export function ubicacionCorta(p: Proyecto): string {
  const m = p.meta;
  return [m.distrito, m.provincia, m.departamento].filter(Boolean).join(' – ');
}

export function ubicacionLarga(p: Proyecto): string {
  const m = p.meta;
  const partes = [
    m.ubicacion,
    m.distrito ? `distrito de ${m.distrito}` : '',
    m.provincia ? `provincia de ${m.provincia}` : '',
    m.departamento ? `departamento de ${m.departamento}` : '',
  ].filter(Boolean);
  return partes.join(', ');
}

export function datosCabecera(p: Proyecto): Cabecera {
  const m = p.meta;
  const d = p.documento;
  return {
    proyecto: m.nombre,
    codigoProyecto: m.codigo,
    descripcion: m.descripcion,
    cliente: nombreEntidad(p.entidades.cliente),
    propietario: nombreEntidad(p.entidades.propietario),
    proyectista: nombreEntidad(p.entidades.proyectista),
    ubicacion: [m.ubicacion, ubicacionCorta(p)].filter(Boolean).join(' · '),
    ubicacionLarga: ubicacionLarga(p),
    fecha: fechaCorta(m.fecha || m.fechaBase),
    fechaLarga: fechaLarga(m.fecha || m.fechaBase),
    fechaBase: fechaCorta(m.fechaBase),
    moneda: m.moneda,
    monedaNombre: m.monedaNombre || (m.moneda === 'US$' ? 'DÓLARES AMERICANOS' : 'SOLES'),
    codigoDocumento: d.codigo || m.codigo,
    revision: d.revision || '0',
    fechaRevision: fechaCorta(d.fechaRevision),
    estado: d.estado,
    tipoDocumento: d.tipo || (m.modo === 'publico' ? 'EXPEDIENTE TÉCNICO' : 'PROPUESTA TÉCNICO-ECONÓMICA'),
    logoProyectista: p.entidades.proyectista.logo ?? null,
    logoCliente: p.entidades.cliente.logo ?? p.entidades.propietario.logo ?? null,
    imagenPortada: d.imagenPortada ?? null,
    autores: (d.autores || '').split(/\n|;/).map((x) => x.trim()).filter(Boolean),
    aviso: rellenarPlantilla(d.aviso || '', {
      proyecto: m.nombre,
      cliente: nombreEntidad(p.entidades.cliente) || 'el cliente',
      propietario: nombreEntidad(p.entidades.propietario) || nombreEntidad(p.entidades.cliente) || 'el propietario',
      proyectista: nombreEntidad(p.entidades.proyectista) || 'el proyectista',
      ubicacion: ubicacionLarga(p),
      codigo: m.codigo,
    }),
  };
}

/** Variables para textos editables: {{proyecto}}, {{cliente}}, {{propietario}}, {{proyectista}}, {{ubicacion}}, {{codigo}}. */
export function variablesProyecto(p: Proyecto): Record<string, string> {
  const c = datosCabecera(p);
  return {
    proyecto: c.proyecto,
    cliente: c.cliente || 'el cliente',
    propietario: c.propietario || c.cliente || 'el propietario',
    proyectista: c.proyectista || 'el proyectista',
    ubicacion: c.ubicacionLarga || 'la zona del proyecto',
    codigo: c.codigoProyecto,
  };
}

export function textoProyecto(p: Proyecto, texto: string): string {
  return rellenarPlantilla(texto || '', variablesProyecto(p));
}

/** Logo como bytes (para Word y Excel). */
export function logoBytes(l: Logo): { datos: Uint8Array; tipo: 'png' | 'jpg' } {
  const [cab, b64] = l.dataUrl.split(',');
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const datos = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) datos[i] = bin.charCodeAt(i);
  return { datos, tipo: /jpe?g/i.test(cab) ? 'jpg' : 'png' };
}

/** Escala un logo para que quepa en un recuadro, manteniendo la proporción. */
export function encajar(l: Logo, anchoMax: number, altoMax: number): { ancho: number; alto: number } {
  const r = Math.min(anchoMax / Math.max(1, l.ancho), altoMax / Math.max(1, l.alto));
  return { ancho: Math.round(l.ancho * r), alto: Math.round(l.alto * r) };
}
