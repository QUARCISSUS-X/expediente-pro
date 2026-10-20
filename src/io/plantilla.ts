// Plantilla de carga en Excel: exporta un proyecto a hojas editables y lo vuelve a importar.
// Es el formato de intercambio para cargar un TdR completo (partidas, metrados, APU, insumos, GG).
import ExcelJS from 'exceljs';
import { CATALOGO_BASE } from '../data/catalogo';
import { PLANTILLAS_EETT } from '../data/plantillasEett';
import { ggPlantilla, metaPorDefecto, proyectoEnBlanco } from '../data/proyectos';
import type { Apu, DocKey, Insumo, Meta, Pred, Proyecto, TipoInsumo, TipoPred } from '../engine/types';
import { compararCodigos, num, uid } from '../engine/util';

const CAMPOS_META: { k: keyof Meta; n: string }[] = [
  { k: 'nombre', n: 'Nombre del proyecto' },
  { k: 'codigo', n: 'Código del proyecto' },
  { k: 'descripcion', n: 'Descripción del proyecto' },
  { k: 'fecha', n: 'Fecha del proyecto (aaaa-mm-dd)' },
  { k: 'modo', n: 'Modalidad (privado / publico)' },
  { k: 'ubicacion', n: 'Ubicación (unidad, sector)' },
  { k: 'departamento', n: 'Departamento' },
  { k: 'provincia', n: 'Provincia' },
  { k: 'distrito', n: 'Distrito' },
  { k: 'areaGeografica', n: 'Área geográfica INEI (1-13)' },
  { k: 'sistemaContratacion', n: 'Sistema de contratación' },
  { k: 'fechaBase', n: 'Fecha de determinación del presupuesto (aaaa-mm-dd)' },
  { k: 'fechaInicio', n: 'Fecha de inicio de obra (aaaa-mm-dd)' },
  { k: 'moneda', n: 'Moneda (símbolo: S/ o US$)' },
  { k: 'monedaNombre', n: 'Moneda en letras (SOLES / DÓLARES AMERICANOS)' },
  { k: 'unidadMedida', n: 'Sistema de unidades' },
  { k: 'jornadaHoras', n: 'Jornada (horas/día)' },
  { k: 'diasLaborables', n: 'Días laborables (0=dom … 6=sáb, separados por coma)' },
  { k: 'feriados', n: 'Feriados (aaaa-mm-dd separados por coma)' },
  { k: 'periodo', n: 'Periodo de cronogramas (30dias / mes)' },
  { k: 'utilidadPct', n: 'Utilidad (%)' },
  { k: 'igvPct', n: 'IGV (%)' },
  { k: 'incluirIgv', n: 'Incluir IGV en el total (Sí/No)' },
  { k: 'adelantoDirectoPct', n: 'Adelanto directo (%)' },
  { k: 'adelantoMaterialesPct', n: 'Adelanto de materiales (%)' },
  { k: 'plazoCompraDefecto', n: 'Anticipación de compra por defecto (días)' },
  { k: 'fleteTarifaTon', n: 'Tarifa de flete (por tonelada)' },
  { k: 'fleteDistanciaKm', n: 'Distancia de flete (km)' },
  { k: 'personalMaximo', n: 'Personal máximo en obra (opcional)' },
  { k: 'foliacion', n: 'Foliación (ascendente / descendente)' },
  { k: 'validezOfertaDias', n: 'Validez de la oferta (días)' },
  { k: 'formaPago', n: 'Forma de pago' },
];

const ENT: [string, string][] = [
  ['nombre', 'razón social'],
  ['ruc', 'RUC'],
  ['direccion', 'dirección'],
  ['telefono', 'teléfono'],
  ['email', 'correo'],
  ['web', 'web'],
  ['representante', 'representante'],
];

const CAMPOS_TEXTO: { k: string; n: string }[] = [
  ...(['proyectista', 'cliente', 'propietario'] as const).flatMap((e) =>
    ENT.map(([k, n]) => ({ k: `entidades.${e}.${k}`, n: `${e === 'propietario' ? 'Propietario / cliente final' : e.charAt(0).toUpperCase() + e.slice(1)}: ${n}` })),
  ),
  ...(['elaboro', 'reviso', 'aprobo'] as const).flatMap((r) =>
    (['nombre', 'cargo', 'colegiatura', 'fecha'] as const).map((k) => ({ k: `responsables.${r}.${k}`, n: `${{ elaboro: 'Elaborado por', reviso: 'Revisado por', aprobo: 'Aprobado por' }[r]}: ${k}` })),
  ),
  { k: 'documento.codigo', n: 'Código de documento' },
  { k: 'documento.revision', n: 'Revisión' },
  { k: 'documento.fechaRevision', n: 'Fecha de revisión (aaaa-mm-dd)' },
  { k: 'documento.estado', n: 'Estado del documento' },
  { k: 'documento.tipo', n: 'Tipo de documento' },
  { k: 'documento.autores', n: 'Autores principales' },
  { k: 'tdr.titulo', n: 'Título del TdR' },
  { k: 'tdr.resumen', n: 'Resumen del TdR' },
  { k: 'memoria.antecedentes', n: 'Memoria: antecedentes' },
  { k: 'memoria.objetivo', n: 'Memoria: objetivo' },
  { k: 'memoria.alcance', n: 'Memoria: alcance' },
  { k: 'memoria.descripcionTecnica', n: 'Memoria: descripción técnica' },
  { k: 'memoria.consideraciones', n: 'Memoria: consideraciones' },
];

function leerRuta(o: unknown, ruta: string): string {
  let x: unknown = o;
  for (const k of ruta.split('.')) x = (x as Record<string, unknown>)?.[k];
  return typeof x === 'string' ? x : x === undefined || x === null ? '' : String(x);
}
function escribirRuta(o: unknown, ruta: string, v: string) {
  const ks = ruta.split('.');
  let x = o as Record<string, unknown>;
  for (const k of ks.slice(0, -1)) x = (x[k] ?? (x[k] = {})) as Record<string, unknown>;
  x[ks[ks.length - 1]] = v;
}

const AZUL = 'FF1F3A5F';

function hoja(wb: ExcelJS.Workbook, nombre: string, cab: { h: string; w: number }[], filas: unknown[][], nota?: string) {
  const ws = wb.addWorksheet(nombre);
  ws.columns = cab.map((c) => ({ header: c.h, width: c.w }));
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { wrapText: true, vertical: 'middle' };
  });
  ws.getRow(1).height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const f of filas) ws.addRow(f.map((v) => (v === undefined ? null : v)));
  if (nota) ws.getCell(1, cab.length + 2).value = nota;
  return ws;
}

export function textoPreds(p: Proyecto, preds: Pred[]): string {
  const cod = new Map(p.partidas.map((x) => [x.id, x.codigo]));
  return preds.map((x) => `${cod.get(x.id) ?? ''}${x.tipo}${x.desfase ? (x.desfase > 0 ? '+' : '') + x.desfase : ''}`).join('; ');
}

export function parsearPreds(texto: string, idPorCodigo: Map<string, string>): { preds: Pred[]; errores: string[] } {
  const preds: Pred[] = [];
  const errores: string[] = [];
  for (const parte of String(texto || '').split(/[;,]/)) {
    const s = parte.trim();
    if (!s) continue;
    const m = /^([\d.]+?)\s*(FC|CC|FF|FS|SS|CF)?\s*([+-]\s*\d+(?:\.\d+)?)?\s*(d|días)?$/i.exec(s);
    if (!m) { errores.push(`Predecesora no reconocida: "${s}"`); continue; }
    const id = idPorCodigo.get(m[1].replace(/\.$/, ''));
    if (!id) { errores.push(`La predecesora ${m[1]} no existe`); continue; }
    let tipo = (m[2] || 'FC').toUpperCase();
    if (tipo === 'FS') tipo = 'FC';
    if (tipo === 'SS') tipo = 'CC';
    if (tipo === 'CF') tipo = 'FC';
    preds.push({ id, tipo: tipo as TipoPred, desfase: m[3] ? parseFloat(m[3].replace(/\s/g, '')) : 0 });
  }
  return { preds, errores };
}

export async function exportarPlantilla(p: Proyecto): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const leeme = wb.addWorksheet('LEEME');
  leeme.columns = [{ width: 120 }];
  [
    'PLANTILLA DE CARGA – EXPEDIENTE PRO',
    '',
    'Llene las hojas y use "Importar plantilla" en el programa (o en la línea de comandos: expediente generar archivo.xlsx).',
    'PROYECTO: datos generales y textos de la memoria. TDR: entregables exigidos y el documento que los cubre.',
    'INSUMOS: catálogo con precios sin IGV. Tipo: MO, MAT, EQ o SC. IU: índice unificado INEI de 2 dígitos (p. ej. 21, 47, 49).',
    'PARTIDAS: estructura del presupuesto. Los títulos llevan "Sí" en la columna Título. Predecesoras: 01.02FC; 03.01CC+2; 04.03FF-1.',
    'APU: un renglón por insumo. Mano de obra y equipos: llene Cuadrilla (la cantidad se calcula con el rendimiento). Materiales: llene Cantidad. Herramientas %MO: llene Porcentaje.',
    'METRADOS: Parcial = producto de los campos llenos (N° veces × Cantidad × Factor × Largo × Ancho × Alto × Área × Volumen), como =PRODUCTO(). Indique siempre el plano o sustento.',
    'GG: gastos generales (grupo variable, fijo o financiero). Variables ligados al plazo: duración automática = plazo de obra en meses. Unidad %CD: cantidad = porcentaje del costo directo.',
    `Documentos válidos para TDR: presupuesto_resumen, presupuesto_detallado, apu, insumos, gg, metrados, polinomica, flete, programa, valorizado, adquisiciones, equipos, personal, desembolsos, eett, memoria, carta, msproject, consistencia, cumplimiento, externo.`,
  ].forEach((t, i) => {
    leeme.getCell(i + 1, 1).value = t;
    if (i === 0) leeme.getCell(1, 1).font = { bold: true, size: 14, color: { argb: AZUL } };
  });

  const filasProyecto: unknown[][] = CAMPOS_META.map((c) => {
    const v = p.meta[c.k];
    return [c.n, Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : v ?? '', c.k];
  });
  for (const c of CAMPOS_TEXTO) filasProyecto.push([c.n, leerRuta(p, c.k), c.k]);
  const wsP = hoja(wb, 'PROYECTO', [{ h: 'Campo', w: 52 }, { h: 'Valor', w: 90 }, { h: 'clave (no editar)', w: 22 }], filasProyecto);
  wsP.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  hoja(wb, 'TDR', [{ h: 'Entregable exigido', w: 60 }, { h: 'Documento', w: 24 }, { h: 'Obligatorio (Sí/No)', w: 16 }, { h: 'Observación', w: 50 }],
    p.tdr.entregables.map((e) => [e.descripcion, e.documento, e.obligatorio ? 'Sí' : 'No', e.observacion ?? '']));
  hoja(wb, 'INSUMOS', [{ h: 'Código', w: 10 }, { h: 'Descripción', w: 60 }, { h: 'Unidad', w: 8 }, { h: 'Tipo', w: 7 }, { h: 'Precio', w: 12 }, { h: 'IU', w: 6 }, { h: 'Peso (kg/und)', w: 12 }, { h: 'Plazo compra (días)', w: 14 }, { h: 'Fuente', w: 30 }],
    p.insumos.map((i) => [i.codigo, i.descripcion, i.unidad, i.tipo, i.precio, i.iu, i.pesoKg ?? null, i.plazoCompraDias ?? null, i.fuente ?? '']));
  const ordenadas = [...p.partidas].sort((a, b) => compararCodigos(a.codigo, b.codigo));
  hoja(wb, 'PARTIDAS', [{ h: 'Código', w: 11 }, { h: 'Descripción', w: 60 }, { h: 'Unidad', w: 8 }, { h: 'Título (Sí/No)', w: 12 }, { h: 'Plantilla EETT', w: 16 }, { h: 'Rendimiento (und/día)', w: 14 }, { h: 'Cuadrillas', w: 10 }, { h: 'Duración manual (días)', w: 14 }, { h: 'Predecesoras', w: 26 }],
    ordenadas.map((pt) => {
      const a = p.apus[pt.id];
      const pr = p.programa[pt.id];
      return [pt.codigo, pt.descripcion, pt.unidad, pt.titulo ? 'Sí' : 'No', pt.eett ?? '', pt.titulo ? null : a?.rendimiento ?? null, pt.titulo ? null : pr?.cuadrillas ?? null, pt.titulo ? null : pr?.duracionManual ?? null, pt.titulo ? '' : textoPreds(p, pr?.predecesoras ?? [])];
    }));
  const filasApu: unknown[][] = [];
  for (const pt of ordenadas) {
    const a = p.apus[pt.id];
    if (!a || pt.titulo) continue;
    for (const it of a.items) filasApu.push([pt.codigo, it.insumo, it.cuadrilla ?? null, it.cantidad ?? null, it.porcentaje ?? null]);
  }
  hoja(wb, 'APU', [{ h: 'Código partida', w: 14 }, { h: 'Código insumo', w: 14 }, { h: 'Cuadrilla', w: 10 }, { h: 'Cantidad', w: 12 }, { h: 'Porcentaje (%MO)', w: 14 }], filasApu);
  const cod = new Map(p.partidas.map((x) => [x.id, x.codigo]));
  hoja(wb, 'METRADOS', [{ h: 'Código partida', w: 14 }, { h: 'Descripción', w: 46 }, { h: 'Referencia (plano N.º)', w: 20 }, { h: 'N° veces', w: 9 }, { h: 'Cantidad', w: 10 }, { h: 'Factor', w: 9 }, { h: 'Largo (m)', w: 9 }, { h: 'Ancho (m)', w: 9 }, { h: 'Alto (m)', w: 9 }, { h: 'Área CAD (m2)', w: 11 }, { h: 'Volumen CAD (m3)', w: 12 }],
    p.metrados.map((m) => [cod.get(m.partidaId) ?? '', m.descripcion, m.referencia ?? '', m.veces ?? null, m.cantidad ?? null, m.factor ?? null, m.largo ?? null, m.ancho ?? null, m.alto ?? null, m.area ?? null, m.volumen ?? null]));
  hoja(wb, 'GG', [{ h: 'Grupo (variable/fijo/financiero)', w: 14 }, { h: 'Rubro', w: 24 }, { h: 'Descripción', w: 50 }, { h: 'Unidad', w: 8 }, { h: 'Cantidad', w: 10 }, { h: 'Duración', w: 10 }, { h: 'Precio', w: 12 }, { h: '% participación', w: 12 }, { h: 'Ligado al plazo (Sí/No)', w: 14 }],
    p.gg.map((g) => [g.grupo, g.rubro, g.descripcion, g.unidad, g.cantidad, g.duracion, g.precio, g.participacion, g.ligadoAlPlazo ? 'Sí' : 'No']));
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// ------------------------------------------------------------- importación

function valor(c: ExcelJS.Cell): unknown {
  const v = c.value as unknown;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; hyperlink?: string };
    if (o.result !== undefined) return o.result instanceof Date ? (o.result as Date).toISOString().slice(0, 10) : o.result;
    if (o.richText) return o.richText.map((x) => x.text).join('');
    if (o.text !== undefined) return o.text;
  }
  return v;
}

function filas(ws: ExcelJS.Worksheet | undefined): unknown[][] {
  if (!ws) return [];
  const out: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const vals: unknown[] = [];
    for (let i = 1; i <= Math.max(row.cellCount, 12); i++) vals.push(valor(row.getCell(i)));
    if (vals.some((x) => x !== null && x !== '')) out.push(vals);
  });
  return out;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const si = (v: unknown) => /^(s[ií]|x|1|true|verdadero)$/i.test(str(v));
const nulo = (v: unknown) => (v === null || v === undefined || str(v) === '' ? null : num(v));

export interface ResultadoImportacion {
  proyecto: Proyecto;
  avisos: string[];
}

export async function importarPlantilla(datos: ArrayBuffer | Uint8Array): Promise<ResultadoImportacion> {
  const wb = new ExcelJS.Workbook();
  const ab = datos instanceof Uint8Array ? datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) : datos;
  await wb.xlsx.load(ab as ArrayBuffer);
  const avisos: string[] = [];
  const p = proyectoEnBlanco();
  p.meta = metaPorDefecto();

  // PROYECTO
  for (const f of filas(wb.getWorksheet('PROYECTO'))) {
    const clave = str(f[2]) || CAMPOS_META.find((c) => c.n === str(f[0]))?.k || CAMPOS_TEXTO.find((c) => c.n === str(f[0]))?.k;
    if (!clave) continue;
    const v = f[1];
    if (clave.includes('.')) escribirRuta(p, clave, str(v));
    else {
      const k = clave as keyof Meta;
      const def = (metaPorDefecto() as unknown as Record<string, unknown>)[k];
      let out: unknown;
      if (k === 'diasLaborables') out = str(v).split(/[,;\s]+/).filter(Boolean).map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x <= 6);
      else if (k === 'feriados') out = str(v).split(/[,;\s]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
      else if (k === 'personalMaximo') out = nulo(v);
      else if (k === 'incluirIgv') out = str(v) ? si(v) : true;
      else if (typeof def === 'number') out = num(v, def as number);
      else out = str(v) || def;
      (p.meta as unknown as Record<string, unknown>)[k] = out;
    }
  }
  if (p.meta.modo !== 'publico') p.meta.modo = 'privado';

  // TDR
  const tdr = filas(wb.getWorksheet('TDR'));
  if (tdr.length)
    p.tdr.entregables = tdr.map((f, i) => ({ id: `tdr${i + 1}`, descripcion: str(f[0]), documento: (str(f[1]) as DocKey) || '', obligatorio: str(f[2]) ? si(f[2]) : true, observacion: str(f[3]) }));

  // INSUMOS
  const ins = filas(wb.getWorksheet('INSUMOS'));
  if (ins.length) {
    p.insumos = ins.map((f): Insumo => {
      let tipo = str(f[3]).toUpperCase() as TipoInsumo;
      if (!['MO', 'MAT', 'EQ', 'SC'].includes(tipo)) { avisos.push(`Insumo ${str(f[0])}: tipo "${str(f[3])}" no válido, se asume MAT.`); tipo = 'MAT'; }
      return { codigo: str(f[0]), descripcion: str(f[1]), unidad: str(f[2]), tipo, precio: num(f[4]), iu: str(f[5]).padStart(2, '0').replace(/^0(\d-\d)$/, '$1'), pesoKg: nulo(f[6]), plazoCompraDias: nulo(f[7]), fuente: str(f[8]) };
    }).filter((i) => i.codigo);
  } else {
    p.insumos = JSON.parse(JSON.stringify(CATALOGO_BASE));
    avisos.push('La hoja INSUMOS está vacía: se usó el catálogo base.');
  }

  // PARTIDAS
  const pts = filas(wb.getWorksheet('PARTIDAS'));
  const idPorCodigo = new Map<string, string>();
  const config: { id: string; rend: number | null; cuad: number | null; dur: number | null; preds: string }[] = [];
  for (const f of pts) {
    const codigo = str(f[0]).replace(/\.$/, '');
    if (!codigo) continue;
    if (idPorCodigo.has(codigo)) { avisos.push(`Código de partida repetido: ${codigo}`); continue; }
    const id = uid('pt');
    idPorCodigo.set(codigo, id);
    const titulo = si(f[3]);
    p.partidas.push({ id, codigo, descripcion: str(f[1]), unidad: titulo ? '' : str(f[2]), titulo, eett: str(f[4]) || undefined });
    if (!titulo) config.push({ id, rend: nulo(f[5]), cuad: nulo(f[6]), dur: nulo(f[7]), preds: str(f[8]) });
  }
  for (const c of config) {
    p.apus[c.id] = { rendimiento: c.rend ?? 0, items: [] };
    const { preds, errores } = parsearPreds(c.preds, idPorCodigo);
    avisos.push(...errores);
    p.programa[c.id] = { cuadrillas: c.cuad ?? 1, duracionManual: c.dur, predecesoras: preds };
  }

  // APU
  for (const f of filas(wb.getWorksheet('APU'))) {
    const id = idPorCodigo.get(str(f[0]).replace(/\.$/, ''));
    if (!id) { avisos.push(`APU: la partida ${str(f[0])} no existe.`); continue; }
    const apu: Apu = p.apus[id] ?? (p.apus[id] = { rendimiento: 0, items: [] });
    apu.items.push({ insumo: str(f[1]), cuadrilla: nulo(f[2]), cantidad: nulo(f[3]), porcentaje: nulo(f[4]) });
  }

  // METRADOS
  let n = 0;
  for (const f of filas(wb.getWorksheet('METRADOS'))) {
    const id = idPorCodigo.get(str(f[0]).replace(/\.$/, ''));
    if (!id) { avisos.push(`METRADOS: la partida ${str(f[0])} no existe.`); continue; }
    p.metrados.push({ id: `m${++n}_${uid('m')}`, partidaId: id, descripcion: str(f[1]), referencia: str(f[2]), veces: nulo(f[3]), cantidad: nulo(f[4]), factor: nulo(f[5]), largo: nulo(f[6]), ancho: nulo(f[7]), alto: nulo(f[8]), area: nulo(f[9]), volumen: nulo(f[10]) });
  }

  // GG
  const gg = filas(wb.getWorksheet('GG'));
  if (gg.length)
    p.gg = gg.map((f) => ({
      id: uid('gg'),
      grupo: /fij/i.test(str(f[0])) ? 'fijo' : /financ/i.test(str(f[0])) ? 'financiero' : 'variable',
      rubro: str(f[1]),
      descripcion: str(f[2]),
      unidad: str(f[3]),
      cantidad: num(f[4]),
      duracion: num(f[5], 1),
      precio: num(f[6]),
      participacion: num(f[7], 100),
      ligadoAlPlazo: si(f[8]),
    }));
  else {
    p.gg = ggPlantilla();
    avisos.push('La hoja GG está vacía: se usó la plantilla de gastos generales.');
  }
  p.plantillasEett = JSON.parse(JSON.stringify(PLANTILLAS_EETT));
  return { proyecto: p, avisos };
}
