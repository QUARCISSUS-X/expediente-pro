// Formato de carga compacto (.exp.txt): un archivo de texto corto, legible y fácil de escribir a mano
// o por un asistente, que se convierte en un Proyecto completo. Es la alternativa ligera a la plantilla Excel.
//
//   # proyecto            clave: valor   (nombre, codigo, modo, jornada, utilidad, igv, inicio, cliente, entidades.cliente.ruc …)
//   # insumos             CÓDIGO | descripción | unidad | precio | tipo | IU | kg/und | fuente   (vacío = conservar catálogo)
//   # partidas            01 TÍTULO
//                         01.01 Descripción | und | r=12 | MO02 1, MO04 2, MA05 0.25, EQ01 3% | m=25 | pred=01.02 FC+1
//                           - detalle de metrado | n=2 l=3.5 a=0.4 h=0.6 | ref=Plano E-01
//   # metrados            01.01 | descripción | n= c= f= l= a= h= ar= v= | ref=…
//   # gg  (o # gg+)       grupo | rubro | descripción | unidad | cantidad | duración (n o plazo) | precio | participación %
//   # tdr                 titulo: … / resumen: … / - descripción | documento | opcional
//   # memoria.alcance, # textosEett.normativa, # eett 01.01 metodo …   texto libre
import { BIBLIOTECA, partidaTipo } from '../data/biblioteca';
import { CATALOGO_BASE } from '../data/catalogo';
import { sugerirIU } from '../data/iu';
import { documentoPorDefecto, ggPlantilla, metaPorDefecto, proyectoEnBlanco, textosEettPorDefecto } from '../data/proyectos';
import type { Apu, ApuItem, DocKey, GGItem, MetradoFila, Partida, Proyecto, SeccionesEett, TipoInsumo } from '../engine/types';
import { num, uid } from '../engine/util';
import { parsearPreds, textoPreds } from './plantilla';

export interface ResultadoCompacto {
  proyecto: Proyecto;
  avisos: string[];
  /** Rutas de imágenes pedidas (logo, imagenPortada): el llamador las lee y asigna. */
  imagenes: { ruta: string; archivo: string }[];
}

const ALIAS: Record<string, string> = {
  jornada: 'meta.jornadaHoras',
  utilidad: 'meta.utilidadPct',
  igv: 'meta.igvPct',
  incluirigv: 'meta.incluirIgv',
  inicio: 'meta.fechaInicio',
  base: 'meta.fechaBase',
  fechabase: 'meta.fechaBase',
  flete: 'meta.fleteTarifaTon',
  distancia: 'meta.fleteDistanciaKm',
  area: 'meta.areaGeografica',
  dias: 'meta.diasLaborables',
  proyectista: 'entidades.proyectista.nombre',
  cliente: 'entidades.cliente.nombre',
  propietario: 'entidades.propietario.nombre',
  elaboro: 'responsables.elaboro.nombre',
  reviso: 'responsables.reviso.nombre',
  aprobo: 'responsables.aprobo.nombre',
  tdr: 'tdr.titulo',
};
const SECCIONES_EETT: (keyof SeccionesEett)[] = ['descripcion', 'manoObra', 'materiales', 'equipos', 'metodo', 'calidad', 'medicion', 'pago'];
const CAMPOS_METRADO: Record<string, keyof MetradoFila> = { n: 'veces', c: 'cantidad', f: 'factor', l: 'largo', a: 'ancho', h: 'alto', ar: 'area', v: 'volumen' };
const LLAVES_PARTIDA = new Set(['r', 'm', 'j', 'cuad', 'dur', 'pred', 'eett', 'apu']);

const sinTilde = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const si = (v: string) => /^(si|sí|s|true|1|x|yes)$/i.test(v.trim());
const numero = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  if (t.includes('*')) return t.split('*').reduce((a, x) => a * num(x.trim(), NaN), 1);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function tipoDe(codigo: string, unidad: string, descripcion: string): TipoInsumo {
  const u = unidad.toLowerCase();
  if (u === 'hh') return 'MO';
  if (u === 'hm' || u.startsWith('%')) return 'EQ';
  const c = codigo.toUpperCase();
  if (c.startsWith('MO')) return 'MO';
  if (c.startsWith('EQ')) return 'EQ';
  if (c.startsWith('SC') || /subcontrat/i.test(descripcion)) return 'SC';
  return 'MAT';
}

/** Escribe un valor en una ruta "a.b.c" del proyecto convirtiéndolo al tipo del valor existente. */
function escribir(p: Proyecto, ruta: string, valor: string, avisos: string[], imagenes: ResultadoCompacto['imagenes']): void {
  const partes = ruta.split('.');
  let obj = p as unknown as Record<string, unknown>;
  for (const k of partes.slice(0, -1)) {
    const sig = obj[k];
    if (!sig || typeof sig !== 'object') { avisos.push(`Proyecto: el campo "${ruta}" no existe.`); return; }
    obj = sig as Record<string, unknown>;
  }
  const k = partes[partes.length - 1];
  if (k === 'logo' || k === 'imagenPortada') { imagenes.push({ ruta, archivo: valor }); return; }
  if (!(k in obj)) { avisos.push(`Proyecto: el campo "${ruta}" no existe.`); return; }
  const actual = obj[k];
  if (k === 'diasLaborables') obj[k] = valor.split(/[,;\s]+/).filter(Boolean).map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x <= 6);
  else if (Array.isArray(actual)) obj[k] = valor.split(/[,;\s]+/).filter(Boolean);
  else if (typeof actual === 'boolean') obj[k] = si(valor);
  else if (typeof actual === 'number' || k === 'personalMaximo') {
    const n = numero(valor);
    if (n === null && k !== 'personalMaximo') avisos.push(`Proyecto: "${ruta}" debe ser un número (se leyó "${valor}").`);
    else obj[k] = n;
  } else obj[k] = valor;
}

function rutaDe(clave: string, p: Proyecto): string {
  const c = clave.trim();
  const a = ALIAS[sinTilde(c).replace(/\s+/g, '')];
  if (a) return a;
  if (c.includes('.')) return c;
  if (c in p.meta) return `meta.${c}`;
  if (c in p.documento) return `documento.${c}`;
  return c;
}

/** Lee el formato compacto y devuelve un proyecto nuevo (partiendo del catálogo base y la plantilla de GG). */
export function leerCompacto(texto: string): ResultadoCompacto {
  const p = proyectoEnBlanco();
  const avisos: string[] = [];
  const imagenes: ResultadoCompacto['imagenes'] = [];
  const insumo = new Map(p.insumos.map((i) => [i.codigo.toUpperCase(), i]));
  const idPorCodigo = new Map<string, string>();
  type Pend = { id: string; linea: number; campos: Record<string, string>; items: string[] };
  const pendientes: Pend[] = [];
  const metradosPend: { codigo: string; linea: number; desc: string; campos: string[] }[] = [];
  let seccion = '';
  let textoDestino: ((t: string) => void) | null = null;
  let bufferTexto: string[] = [];
  let ggNuevo: GGItem[] | null = null;
  let entregablesNuevos: Proyecto['tdr']['entregables'] | null = null;
  let ultimaPartida: string | null = null;
  let encadenar = false;

  const cerrarTexto = () => {
    if (textoDestino) textoDestino(bufferTexto.join('\n').replace(/^\n+|\n+$/g, ''));
    textoDestino = null;
    bufferTexto = [];
  };

  const lineas = texto.replace(/\r/g, '').split('\n');
  lineas.forEach((original, idx) => {
    const n = idx + 1;
    const linea = original.replace(/\s+$/, '');
    const cab = /^#\s*(.+)$/.exec(linea.trim());
    if (cab && !/^#\s*$/.test(linea.trim())) {
      cerrarTexto();
      const nombre = cab[1].trim();
      const s = sinTilde(nombre);
      const eett = /^eett\s+([\d.]+)\s+(\w+)$/i.exec(nombre);
      if (eett) {
        seccion = 'texto';
        const [, cod, sec] = eett;
        const clave = SECCIONES_EETT.find((x) => sinTilde(x) === sinTilde(sec));
        if (!clave) { avisos.push(`Línea ${n}: sección de EETT "${sec}" no válida (use ${SECCIONES_EETT.join(', ')}).`); seccion = 'ignorar'; return; }
        textoDestino = (t) => {
          const id = idPorCodigo.get(cod.replace(/\.$/, ''));
          const pt = p.partidas.find((x) => x.id === id);
          if (!pt) { avisos.push(`Línea ${n}: la partida ${cod} no existe (EETT).`); return; }
          pt.eettTexto = { ...(pt.eettTexto ?? {}), [clave]: t };
        };
        return;
      }
      if (nombre.includes('.')) {
        seccion = 'texto';
        const ruta = nombre;
        textoDestino = (t) => escribir(p, ruta, t, avisos, imagenes);
        return;
      }
      if (/^(proyecto|meta|datos|configuracion)$/.test(s)) seccion = 'proyecto';
      else if (/^insumos?$/.test(s)) seccion = 'insumos';
      else if (/^(partidas|presupuesto|apu)$/.test(s)) seccion = 'partidas';
      else if (/^metrados?$/.test(s)) seccion = 'metrados';
      else if (/^gg\s*\+$/.test(s) || /^gastos generales\s*\+$/.test(s)) { seccion = 'gg'; ggNuevo = ggNuevo ?? ggPlantilla(); }
      else if (/^(gg|gastos generales)$/.test(s)) { seccion = 'gg'; ggNuevo = ggNuevo ?? []; }
      else if (/^(tdr|terminos de referencia)$/.test(s)) seccion = 'tdr';
      else { avisos.push(`Línea ${n}: sección "${nombre}" desconocida; se ignora.`); seccion = 'ignorar'; }
      return;
    }
    if (seccion === 'texto') { bufferTexto.push(linea); return; }
    const t = linea.trim();
    if (!t || t.startsWith(';') || t.startsWith('//')) return;

    switch (seccion) {
      case 'proyecto': {
        const m = /^([^:=]+?)\s*[:=]\s*(.*)$/.exec(t);
        if (!m) { avisos.push(`Línea ${n}: se esperaba "clave: valor".`); return; }
        if (sinTilde(m[1]) === 'encadenar') { encadenar = si(m[2]); return; }
        escribir(p, rutaDe(m[1], p), m[2].trim(), avisos, imagenes);
        return;
      }
      case 'insumos': {
        const f = t.split('|').map((x) => x.trim());
        const codigo = f[0];
        if (!codigo) return;
        let ins = insumo.get(codigo.toUpperCase());
        if (!ins) {
          if (!f[1] || !f[2]) { avisos.push(`Línea ${n}: el insumo ${codigo} no está en el catálogo; indique descripción y unidad.`); return; }
          ins = { codigo, descripcion: f[1], unidad: f[2], tipo: 'MAT', precio: 0, iu: '' };
          p.insumos.push(ins);
          insumo.set(codigo.toUpperCase(), ins);
        }
        if (f[1]) ins.descripcion = f[1];
        if (f[2]) ins.unidad = f[2];
        if (f[3]) ins.precio = num(f[3]);
        const tipo = (f[4] || '').toUpperCase();
        if (tipo) {
          if (['MO', 'MAT', 'EQ', 'SC'].includes(tipo)) ins.tipo = tipo as TipoInsumo;
          else avisos.push(`Línea ${n}: tipo "${f[4]}" no válido (MO, MAT, EQ, SC).`);
        } else if (!CATALOGO_BASE.some((c) => c.codigo === ins!.codigo)) ins.tipo = tipoDe(ins.codigo, ins.unidad, ins.descripcion);
        if (f[5]) ins.iu = f[5].padStart(2, '0');
        else if (!ins.iu) ins.iu = sugerirIU(ins.descripcion, ins.tipo, ins.unidad);
        if (f[6]) ins.pesoKg = numero(f[6]);
        if (f[7]) ins.fuente = f[7];
        return;
      }
      case 'partidas': {
        if (t.startsWith('-')) {
          if (!ultimaPartida) { avisos.push(`Línea ${n}: detalle de metrado sin partida.`); return; }
          const f = t.slice(1).split('|').map((x) => x.trim());
          metradosPend.push({ codigo: ultimaPartida, linea: n, desc: f[0], campos: f.slice(1) });
          return;
        }
        const f = t.split('|').map((x) => x.trim());
        const m = /^(\S*\d\S*?)\.?(?:\s+(.*))?$/.exec(f[0]);
        if (!m) { avisos.push(`Línea ${n}: se esperaba "código descripción | unidad | …".`); return; }
        const codigo = m[1];
        if (idPorCodigo.has(codigo)) { avisos.push(`Línea ${n}: código de partida repetido ${codigo}.`); return; }
        const id = uid('pt');
        idPorCodigo.set(codigo, id);
        const desc = (m[2] ?? '').trim();
        if (f.length === 1) {
          p.partidas.push({ id, codigo, descripcion: desc, unidad: '', titulo: true });
          ultimaPartida = null;
          return;
        }
        const campos: Record<string, string> = {};
        const items: string[] = [];
        for (const seg of f.slice(2)) {
          if (!seg) continue;
          const kv = /^([a-z]+)\s*=\s*(.*)$/.exec(seg);
          if (kv && LLAVES_PARTIDA.has(kv[1])) campos[kv[1]] = kv[2].trim();
          else items.push(...seg.split(',').map((x) => x.trim()).filter(Boolean));
        }
        const pt: Partida = { id, codigo, descripcion: desc, unidad: f[1] };
        if (campos.eett) pt.eett = campos.eett;
        p.partidas.push(pt);
        pendientes.push({ id, linea: n, campos, items });
        ultimaPartida = codigo;
        return;
      }
      case 'metrados': {
        const f = t.split('|').map((x) => x.trim());
        metradosPend.push({ codigo: f[0].replace(/\.$/, ''), linea: n, desc: f[1] ?? '', campos: f.slice(2) });
        return;
      }
      case 'gg': {
        const f = t.split('|').map((x) => x.trim());
        if (f.length < 7) { avisos.push(`Línea ${n}: GG requiere grupo | rubro | descripción | unidad | cantidad | duración | precio.`); return; }
        const g = sinTilde(f[0]);
        const grupo = g.startsWith('fin') ? 'financiero' : g.startsWith('f') ? 'fijo' : 'variable';
        const ligado = /^plazo$/i.test(f[5]);
        ggNuevo!.push({ id: uid('gg'), grupo, rubro: f[1], descripcion: f[2], unidad: f[3], cantidad: num(f[4]), duracion: ligado ? 1 : num(f[5], 1), precio: num(f[6]), participacion: f[7] ? num(f[7], 100) : 100, ligadoAlPlazo: ligado });
        return;
      }
      case 'tdr': {
        if (t.startsWith('-')) {
          const f = t.slice(1).split('|').map((x) => x.trim());
          entregablesNuevos = entregablesNuevos ?? [];
          entregablesNuevos.push({ id: `tdr${entregablesNuevos.length + 1}`, descripcion: f[0], documento: (f[1] || '') as DocKey | '', obligatorio: !/opcional|no/i.test(f[2] ?? ''), observacion: f[3] ?? '' });
          return;
        }
        const m = /^([^:]+?)\s*:\s*(.*)$/.exec(t);
        if (m) escribir(p, `tdr.${sinTilde(m[1]) === 'titulo' ? 'titulo' : sinTilde(m[1]) === 'resumen' ? 'resumen' : m[1]}`, m[2], avisos, imagenes);
        return;
      }
      case 'ignorar':
        return;
      default:
        avisos.push(`Línea ${n}: texto fuera de una sección (# proyecto, # insumos, # partidas …).`);
    }
  });
  cerrarTexto();
  if (ggNuevo) p.gg = ggNuevo;
  if (entregablesNuevos) p.tdr.entregables = entregablesNuevos;

  // APU, programa y metrados en línea (después de leer todas las partidas para resolver apu= y pred=)
  const leerItems = (lista: string[], linea: number): ApuItem[] => {
    const out: ApuItem[] = [];
    for (const it of lista) {
      const m = /^([A-Za-z0-9_.-]+)\s*(=)?\s*([\d.*]+)\s*(%)?$/.exec(it);
      if (!m) { avisos.push(`Línea ${linea}: recurso "${it}" no reconocido (use CÓDIGO valor, CÓDIGO =cantidad o CÓDIGO n%).`); continue; }
      const [, cod, igual, val, pct] = m;
      const ins = insumo.get(cod.toUpperCase());
      if (!ins) avisos.push(`Línea ${linea}: el insumo ${cod} no existe en el catálogo ni en # insumos.`);
      const codigo = ins?.codigo ?? cod;
      const v = numero(val) ?? 0;
      const u = (ins?.unidad ?? '').toLowerCase();
      if (pct || u.startsWith('%')) out.push({ insumo: codigo, porcentaje: v });
      else if (!igual && (u === 'hh' || u === 'hm')) out.push({ insumo: codigo, cuadrilla: v });
      else out.push({ insumo: codigo, cantidad: v });
    }
    return out;
  };
  const porId = new Map(pendientes.map((x) => [x.id, x]));
  const resolverApu = (pd: Pend, visitados = new Set<string>()): Apu => {
    if (p.apus[pd.id]) return p.apus[pd.id];
    let apu: Apu = { rendimiento: 0, items: [] };
    const ref = pd.campos.apu;
    if (ref) {
      if (ref.startsWith('@')) {
        const b = partidaTipo(ref.slice(1));
        if (!b) avisos.push(`Línea ${pd.linea}: la partida tipo "${ref}" no existe en la biblioteca (vea "expediente catalogo").`);
        else {
          apu = JSON.parse(JSON.stringify(b.apu));
          const pt = p.partidas.find((x) => x.id === pd.id)!;
          if (!pt.descripcion) pt.descripcion = b.descripcion;
          if (!pt.unidad) pt.unidad = b.unidad;
          if (b.duracionManual && !pd.campos.dur) pd.campos.dur = String(b.duracionManual);
        }
      } else {
        const otro = porId.get(idPorCodigo.get(ref.replace(/\.$/, '')) ?? '');
        if (!otro || visitados.has(otro.id)) avisos.push(`Línea ${pd.linea}: apu=${ref} no es una partida válida.`);
        else apu = JSON.parse(JSON.stringify(resolverApu(otro, new Set([...visitados, pd.id]))));
      }
    }
    if (pd.items.length) apu.items = ref ? [...apu.items, ...leerItems(pd.items, pd.linea)] : leerItems(pd.items, pd.linea);
    if (pd.campos.r) apu.rendimiento = numero(pd.campos.r) ?? 0;
    if (pd.campos.j) apu.jornada = numero(pd.campos.j);
    p.apus[pd.id] = apu;
    return apu;
  };
  let anterior: string | null = null;
  for (const pd of pendientes) {
    const apu = resolverApu(pd);
    const pt = p.partidas.find((x) => x.id === pd.id)!;
    if (!apu.items.length) avisos.push(`Partida ${pt.codigo}: sin recursos en el APU.`);
    if (!apu.rendimiento) avisos.push(`Partida ${pt.codigo}: sin rendimiento (r=).`);
    const { preds, errores } = parsearPreds(pd.campos.pred ?? '', idPorCodigo);
    errores.forEach((e) => avisos.push(`Línea ${pd.linea}: ${e}`));
    p.programa[pd.id] = {
      cuadrillas: pd.campos.cuad ? numero(pd.campos.cuad) : 1,
      duracionManual: pd.campos.dur ? numero(pd.campos.dur) : null,
      predecesoras: preds.length || pd.campos.pred !== undefined || !encadenar || !anterior ? preds : [{ id: anterior, tipo: 'FC', desfase: 0 }],
    };
    if (pd.campos.m) p.metrados.push({ id: uid('m'), partidaId: pd.id, descripcion: pt.descripcion, cantidad: numero(pd.campos.m) });
    anterior = pd.id;
  }
  for (const m of metradosPend) {
    const id = idPorCodigo.get(m.codigo);
    if (!id || !porId.has(id)) { avisos.push(`Línea ${m.linea}: la partida ${m.codigo} no existe (metrado).`); continue; }
    const fila: MetradoFila = { id: uid('m'), partidaId: id, descripcion: m.desc };
    for (const seg of m.campos) {
      if (/^ref\s*=/i.test(seg)) { fila.referencia = seg.replace(/^ref\s*=\s*/i, ''); continue; }
      for (const tok of seg.split(/\s+/).filter(Boolean)) {
        const kv = /^([a-z]+)=(.+)$/.exec(tok);
        const campo = kv ? CAMPOS_METRADO[kv[1]] : undefined;
        if (!kv || !campo) { avisos.push(`Línea ${m.linea}: dato de metrado "${tok}" no reconocido (n, c, f, l, a, h, ar, v, ref).`); continue; }
        (fila as unknown as Record<string, unknown>)[campo] = numero(kv[2]);
      }
    }
    p.metrados.push(fila);
  }
  for (const pd of pendientes) {
    const pt = p.partidas.find((x) => x.id === pd.id)!;
    if (!p.metrados.some((x) => x.partidaId === pd.id)) {
      if (/^(glb|gbl|est|und global)$/i.test(pt.unidad)) p.metrados.push({ id: uid('m'), partidaId: pd.id, descripcion: pt.descripcion, cantidad: 1 });
      else avisos.push(`Partida ${pt.codigo}: sin metrado.`);
    }
  }
  if (p.meta.modo !== 'publico') p.meta.modo = 'privado';
  return { proyecto: p, avisos, imagenes };
}

// ---------------------------------------------------------------- escritura

const f = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(+v.toFixed(6)));

/** Convierte un proyecto al formato compacto (sin imágenes). Solo escribe lo que difiere de los valores por defecto. */
export function escribirCompacto(p: Proyecto): string {
  const out: string[] = ['; Expediente Pro – formato compacto. Decimales con punto; recursos separados por coma.', ''];
  out.push('# proyecto');
  const defMeta = metaPorDefecto() as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(p.meta)) {
    if (k === 'fecha' || k === 'fechaBase' || k === 'fechaInicio' || JSON.stringify(v) !== JSON.stringify(defMeta[k])) {
      if (v === null || v === undefined) continue;
      out.push(`${k}: ${Array.isArray(v) ? v.join(',') : typeof v === 'boolean' ? (v ? 'si' : 'no') : String(v).replace(/\n/g, ' ')}`);
    }
  }
  for (const [grupo, obj] of [['entidades', p.entidades], ['responsables', p.responsables]] as const)
    for (const [quien, datos] of Object.entries(obj))
      for (const [k, v] of Object.entries(datos as unknown as Record<string, unknown>))
        if (typeof v === 'string' && v && !(grupo === 'responsables' && k === 'cargo')) out.push(`${grupo}.${quien}.${k}: ${v.replace(/\n/g, ' ')}`);
  const defDoc = documentoPorDefecto() as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(p.documento))
    if (typeof v === 'string' && v && v !== defDoc[k] && k !== 'aviso') out.push(`documento.${k}: ${v.replace(/\n/g, ' ')}`);

  const usados = new Set(Object.values(p.apus).flatMap((a) => a.items.map((i) => i.insumo)));
  const base = new Map(CATALOGO_BASE.map((i) => [i.codigo, i]));
  const ins = p.insumos.filter((i) => {
    const b = base.get(i.codigo);
    return usados.has(i.codigo) && (!b || b.descripcion !== i.descripcion || b.unidad !== i.unidad || b.precio !== i.precio || b.tipo !== i.tipo || b.iu !== i.iu || (b.pesoKg ?? null) !== (i.pesoKg ?? null) || (b.fuente ?? '') !== (i.fuente ?? ''));
  });
  if (ins.length) {
    out.push('', '# insumos', '; código | descripción | unidad | precio | tipo | IU | kg/und | fuente');
    for (const i of ins) out.push([i.codigo, i.descripcion, i.unidad, f(i.precio), i.tipo, i.iu, f(i.pesoKg), i.fuente ?? ''].join(' | ').replace(/( \| )+$/, ''));
  }

  out.push('', '# partidas', '; código descripción | unidad | r=rend | recursos | pred= | metrados con "-"');
  const unidadIns = new Map(p.insumos.map((i) => [i.codigo, i.unidad.toLowerCase()]));
  for (const pt of p.partidas) {
    if (pt.titulo) { out.push(`${pt.codigo} ${pt.descripcion}`); continue; }
    const a = p.apus[pt.id] ?? { rendimiento: 0, items: [] };
    const recursos = a.items.map((it) => {
      if (it.porcentaje !== null && it.porcentaje !== undefined) return `${it.insumo} ${f(it.porcentaje)}%`;
      if (it.cuadrilla !== null && it.cuadrilla !== undefined) return `${it.insumo} ${f(it.cuadrilla)}`;
      const u = unidadIns.get(it.insumo) ?? '';
      return `${it.insumo} ${u === 'hh' || u === 'hm' ? '=' : ''}${f(it.cantidad ?? 0)}`;
    });
    const seg = [`${pt.codigo} ${pt.descripcion}`, pt.unidad, `r=${f(a.rendimiento)}`];
    if (a.jornada) seg.push(`j=${f(a.jornada)}`);
    if (recursos.length) seg.push(recursos.join(', '));
    const pr = p.programa[pt.id];
    if (pr?.predecesoras?.length) seg.push(`pred=${textoPreds(p, pr.predecesoras)}`);
    if (pr?.cuadrillas && pr.cuadrillas !== 1) seg.push(`cuad=${f(pr.cuadrillas)}`);
    if (pr?.duracionManual) seg.push(`dur=${f(pr.duracionManual)}`);
    if (pt.eett) seg.push(`eett=${pt.eett}`);
    const ms = p.metrados.filter((m) => m.partidaId === pt.id);
    const simple = ms.length === 1 && Object.entries(CAMPOS_METRADO).every(([, c]) => c === 'cantidad' || ms[0][c] === null || ms[0][c] === undefined) && !ms[0].referencia;
    if (simple) seg.push(`m=${f(ms[0].cantidad ?? 0)}`);
    out.push(seg.join(' | '));
    if (!simple)
      for (const m of ms) {
        const datos = Object.entries(CAMPOS_METRADO).filter(([, c]) => m[c] !== null && m[c] !== undefined).map(([k, c]) => `${k}=${f(m[c] as number)}`).join(' ');
        out.push(`  - ${m.descripcion.replace(/\|/g, '/')}${datos ? ` | ${datos}` : ''}${m.referencia ? ` | ref=${m.referencia}` : ''}`);
      }
  }

  out.push('', '# gg', '; grupo | rubro | descripción | unidad | cantidad | duración (n o plazo) | precio | participación %');
  for (const g of p.gg) out.push([g.grupo, g.rubro, g.descripcion, g.unidad, f(g.cantidad), g.ligadoAlPlazo && g.grupo === 'variable' ? 'plazo' : f(g.duracion), f(g.precio), f(g.participacion)].join(' | '));

  if (p.tdr.titulo || p.tdr.resumen || p.tdr.entregables.length) {
    out.push('', '# tdr');
    if (p.tdr.titulo) out.push(`titulo: ${p.tdr.titulo}`);
    if (p.tdr.resumen) out.push(`resumen: ${p.tdr.resumen.replace(/\n/g, ' ')}`);
    for (const e of p.tdr.entregables) out.push(`- ${e.descripcion} | ${e.documento}${e.obligatorio ? '' : ' | opcional'}`);
  }
  const defEett = textosEettPorDefecto() as unknown as Record<string, string>;
  for (const [k, v] of Object.entries(p.memoria)) if (v) out.push('', `# memoria.${k}`, v);
  for (const [k, v] of Object.entries(p.textosEett)) if (v && v !== defEett[k]) out.push('', `# textosEett.${k}`, v);
  for (const pt of p.partidas)
    for (const [k, v] of Object.entries(pt.eettTexto ?? {})) if (v) out.push('', `# eett ${pt.codigo} ${k}`, v);
  return out.join('\n') + '\n';
}

/** Referencia breve de códigos disponibles (catálogo de insumos y biblioteca de partidas tipo). */
export function catalogoCompacto(p?: Proyecto): string {
  const ins = p?.insumos ?? CATALOGO_BASE;
  const out = ['# Insumos (código · descripción · unidad · precio)'];
  for (const i of ins) out.push(`${i.codigo} · ${i.descripcion} · ${i.unidad} · ${i.precio.toFixed(2)}`);
  out.push('', '# Partidas tipo de la biblioteca (apu=@clave)');
  for (const b of BIBLIOTECA) out.push(`@${b.clave} · ${b.descripcion} · ${b.unidad} · r=${b.apu.rendimiento}`);
  return out.join('\n') + '\n';
}

