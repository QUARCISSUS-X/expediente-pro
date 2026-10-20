// Operaciones sobre el árbol de partidas (títulos y partidas) con códigos jerárquicos.
import type { Draft } from 'immer';
import type { PartidaTipo } from '../data/biblioteca';
import type { Partida, Proyecto } from '../engine/types';
import { codigoPadre, compararCodigos, uid } from '../engine/util';

type P = Draft<Proyecto>;

const pad = (n: number) => String(n).padStart(2, '0');

export function hijos(p: Proyecto | P, codigoPadreBuscado: string): Partida[] {
  return p.partidas.filter((x) => codigoPadre(x.codigo) === codigoPadreBuscado).sort((a, b) => compararCodigos(a.codigo, b.codigo));
}

export function descendientes(p: Proyecto | P, codigo: string): Partida[] {
  return p.partidas.filter((x) => x.codigo.startsWith(codigo + '.'));
}

export function siguienteCodigo(p: Proyecto | P, padre: string): string {
  const hs = hijos(p, padre);
  const ultimo = hs.length ? parseInt(hs[hs.length - 1].codigo.split('.').pop()!, 10) : 0;
  return padre ? `${padre}.${pad(ultimo + 1)}` : pad(ultimo + 1);
}

/** Inserta un hueco después de `codigo` entre sus hermanos (corre los siguientes +1). */
function abrirHueco(d: P, codigoDespues: string): string {
  const padre = codigoPadre(codigoDespues);
  const hs = hijos(d, padre);
  const pos = hs.findIndex((x) => x.codigo === codigoDespues);
  const siguientes = hs.slice(pos + 1).reverse();
  for (const h of siguientes) {
    const n = parseInt(h.codigo.split('.').pop()!, 10) + 1;
    const nuevo = padre ? `${padre}.${pad(n)}` : pad(n);
    cambiarPrefijo(d, h.codigo, nuevo);
  }
  const n = parseInt(codigoDespues.split('.').pop()!, 10) + 1;
  return padre ? `${padre}.${pad(n)}` : pad(n);
}

export function cambiarPrefijo(d: P, viejo: string, nuevo: string) {
  for (const x of d.partidas) {
    if (x.codigo === viejo) x.codigo = nuevo;
    else if (x.codigo.startsWith(viejo + '.')) x.codigo = nuevo + x.codigo.slice(viejo.length);
  }
}

export function agregarTitulo(d: P, seleccion: Partida | null, comoSubtitulo = false): string {
  const id = uid('pt');
  let codigo: string;
  if (seleccion && comoSubtitulo && seleccion.titulo) codigo = siguienteCodigo(d, seleccion.codigo);
  else if (seleccion) {
    const base = seleccion.titulo ? seleccion.codigo : codigoPadre(seleccion.codigo);
    codigo = base ? abrirHueco(d, base) : siguienteCodigo(d, '');
  } else codigo = siguienteCodigo(d, '');
  d.partidas.push({ id, codigo, descripcion: 'NUEVO TÍTULO', unidad: '', titulo: true });
  return id;
}

export function ultimaHojaAntes(p: Proyecto | P, codigo: string): Partida | null {
  const hojas = p.partidas.filter((x) => !x.titulo && compararCodigos(x.codigo, codigo) < 0).sort((a, b) => compararCodigos(a.codigo, b.codigo));
  return hojas.length ? hojas[hojas.length - 1] : null;
}

export function agregarPartida(d: P, seleccion: Partida | null, tipo?: PartidaTipo): string | null {
  let codigo: string;
  if (!seleccion) {
    if (!d.partidas.some((x) => x.titulo)) agregarTitulo(d, null);
    const titulos = d.partidas.filter((x) => x.titulo).sort((a, b) => compararCodigos(a.codigo, b.codigo));
    codigo = siguienteCodigo(d, titulos[titulos.length - 1].codigo);
  } else if (seleccion.titulo) codigo = siguienteCodigo(d, seleccion.codigo);
  else codigo = abrirHueco(d, seleccion.codigo);
  const id = uid('pt');
  d.partidas.push({ id, codigo, descripcion: tipo?.descripcion ?? 'Nueva partida', unidad: tipo?.unidad ?? 'und' });
  d.apus[id] = tipo ? JSON.parse(JSON.stringify(tipo.apu)) : { rendimiento: 1, items: [] };
  const previa = ultimaHojaAntes(d, codigo);
  d.programa[id] = {
    cuadrillas: 1,
    duracionManual: tipo?.duracionManual ?? null,
    predecesoras: previa ? [{ id: previa.id, tipo: 'FC', desfase: 0 }] : [],
  };
  d.metrados.push({ id: uid('m'), partidaId: id, descripcion: 'Metrado', veces: null, largo: null, ancho: null, alto: null, cantidad: tipo && tipo.unidad === 'glb' ? 1 : null, referencia: '' });
  return id;
}

export function eliminar(d: P, id: string) {
  const pt = d.partidas.find((x) => x.id === id);
  if (!pt) return;
  const ids = new Set([id, ...descendientes(d, pt.codigo).map((x) => x.id)]);
  d.partidas = d.partidas.filter((x) => !ids.has(x.id));
  d.metrados = d.metrados.filter((m) => !ids.has(m.partidaId));
  for (const k of ids) {
    delete d.apus[k];
    delete d.programa[k];
  }
  for (const a of Object.values(d.programa)) a.predecesoras = a.predecesoras.filter((x) => !ids.has(x.id));
}

export function mover(d: P, id: string, dir: -1 | 1) {
  const pt = d.partidas.find((x) => x.id === id);
  if (!pt) return;
  const padre = codigoPadre(pt.codigo);
  const hs = hijos(d, padre);
  const i = hs.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= hs.length) return;
  const a = hs[i].codigo;
  const b = hs[j].codigo;
  const temp = `__tmp__${Date.now()}`;
  cambiarPrefijo(d, a, temp);
  cambiarPrefijo(d, b, a);
  cambiarPrefijo(d, temp, b);
}

/** Vuelve a numerar todo el árbol en el orden actual: 01, 01.01, 01.02, 02 ... */
export function renumerar(d: P) {
  const ordenadas = [...d.partidas].sort((a, b) => compararCodigos(a.codigo, b.codigo));
  const nuevo = new Map<string, string>();
  const contadores = new Map<string, number>();
  for (const x of ordenadas) {
    const padreViejo = codigoPadre(x.codigo);
    const padreNuevo = padreViejo ? nuevo.get(padreViejo) ?? padreViejo : '';
    const n = (contadores.get(padreNuevo) ?? 0) + 1;
    contadores.set(padreNuevo, n);
    nuevo.set(x.codigo, padreNuevo ? `${padreNuevo}.${pad(n)}` : pad(n));
  }
  for (const x of d.partidas) x.codigo = nuevo.get(x.codigo) ?? x.codigo;
}

export function duplicar(d: P, id: string): string | null {
  const pt = d.partidas.find((x) => x.id === id);
  if (!pt || pt.titulo) return null;
  const codigo = abrirHueco(d, pt.codigo);
  const nid = uid('pt');
  d.partidas.push({ ...JSON.parse(JSON.stringify(pt)), id: nid, codigo, descripcion: pt.descripcion + ' (copia)' });
  if (d.apus[id]) d.apus[nid] = JSON.parse(JSON.stringify(d.apus[id]));
  d.programa[nid] = { cuadrillas: d.programa[id]?.cuadrillas ?? 1, duracionManual: d.programa[id]?.duracionManual ?? null, predecesoras: [{ id, tipo: 'FC', desfase: 0 }] };
  for (const m of d.metrados.filter((x) => x.partidaId === id)) d.metrados.push({ ...JSON.parse(JSON.stringify(m)), id: uid('m'), partidaId: nid });
  return nid;
}

/** Aumentar nivel: la fila pasa a ser hija del título hermano que la precede. */
export function aumentarNivel(d: P, id: string): boolean {
  const pt = d.partidas.find((x) => x.id === id);
  if (!pt) return false;
  const hs = hijos(d, codigoPadre(pt.codigo));
  const i = hs.findIndex((x) => x.id === id);
  if (i <= 0 || !hs[i - 1].titulo) return false;
  cambiarPrefijo(d, pt.codigo, siguienteCodigo(d, hs[i - 1].codigo));
  renumerar(d);
  return true;
}

/** Disminuir nivel: la fila sale de su título y queda a continuación de él. Una partida no puede quedar fuera de un título. */
export function disminuirNivel(d: P, id: string): boolean {
  const pt = d.partidas.find((x) => x.id === id);
  if (!pt) return false;
  const padre = codigoPadre(pt.codigo);
  if (!padre || (!pt.titulo && !codigoPadre(padre))) return false;
  const viejo = pt.codigo;
  const nuevo = abrirHueco(d, padre);
  cambiarPrefijo(d, viejo, nuevo);
  renumerar(d);
  return true;
}
