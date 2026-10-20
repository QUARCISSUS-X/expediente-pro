// Documentos de texto (sin IA): memoria descriptiva, carta, EETT, matriz de cumplimiento y reporte de consistencia.
// Se arman en un modelo neutro de bloques que luego se exporta a Word y a PDF.
import { AREAS_GEOGRAFICAS } from '../data/iu';
import { datosCabecera, nombreEntidad, textoProyecto } from './cabecera';
import { SECCIONES_EETT } from './eett';
import type { DocKey, Resultados } from './types';
import { fechaLarga, fmt, montoEnLetras } from './util';

export type Bloque =
  | { t: 'h1' | 'h2' | 'h3' | 'h4'; texto: string }
  | { t: 'p'; texto: string; negrita?: boolean; alinear?: 'izq' | 'der' | 'centro' | 'just'; tam?: number; etiqueta?: string }
  | { t: 'lista'; items: string[] }
  | { t: 'tabla'; cabecera: string[]; filas: string[][]; anchos?: number[]; alinear?: ('l' | 'r' | 'c')[]; negritas?: number[] }
  | { t: 'kv'; pares: [string, string][] }
  | { t: 'salto' }
  | { t: 'firma'; nombre: string; cargo: string; detalle?: string }
  | { t: 'firmas'; firmas: { rol: string; nombre: string; cargo: string; detalle?: string; fecha?: string }[] };

export interface Documento {
  titulo: string;
  sigla: string; // para el código del documento: EETT, MD, CP...
  bloques: Bloque[];
  portada?: boolean; // carátula + control del documento
  indice?: boolean; // tabla de contenido
}

export const NOMBRE_DOC: Record<DocKey, string> = {
  presupuesto_resumen: 'Presupuesto resumen',
  presupuesto_detallado: 'Presupuesto detallado',
  apu: 'Análisis de precios unitarios',
  insumos: 'Relación y cotización de insumos',
  gg: 'Desagregado de gastos generales',
  metrados: 'Planilla de sustento de metrados',
  polinomica: 'Fórmula polinómica',
  flete: 'Cálculo de flete',
  programa: 'Cronograma de ejecución de obra (Gantt)',
  valorizado: 'Cronograma valorizado de avance de obra',
  adquisiciones: 'Calendario de adquisición de materiales',
  equipos: 'Calendario de utilización de equipos',
  personal: 'Histograma de personal',
  desembolsos: 'Cronograma de desembolsos',
  eett: 'Especificaciones técnicas',
  memoria: 'Memoria descriptiva',
  carta: 'Carta de presentación',
  msproject: 'Programa en MS Project (.xml)',
  consistencia: 'Reporte de consistencia',
  cumplimiento: 'Matriz de cumplimiento del TdR',
  externo: 'Documento externo',
};

export const parrafos = (texto: string): Bloque[] =>
  (texto || '')
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean)
    .flatMap((x): Bloque[] => {
      const lineas = x.split('\n');
      const items = lineas.filter((l) => /^\s*[-•]\s+/.test(l)).map((l) => l.replace(/^\s*[-•]\s+/, ''));
      const prosa = lineas.filter((l) => !/^\s*[-•]\s+/.test(l)).join(' ').trim();
      const out: Bloque[] = [];
      if (prosa) out.push({ t: 'p', texto: prosa, alinear: 'just' });
      if (items.length) out.push({ t: 'lista', items });
      return out;
    });

export function firmasProyecto(r: Resultados): Bloque {
  const rs = r.proyecto.responsables;
  const f = (rol: string, x: typeof rs.elaboro) => ({ rol, nombre: x.nombre || '—', cargo: x.cargo, detalle: x.colegiatura, fecha: x.fecha ? fechaLarga(x.fecha) : '' });
  return { t: 'firmas', firmas: [f('Elaborado por', rs.elaboro), f('Revisado por', rs.reviso), f('Aprobado por', rs.aprobo)] };
}

function textoTotal(r: Resultados): string {
  const m = r.proyecto.meta;
  const c = datosCabecera(r.proyecto);
  const conIgv = m.incluirIgv !== false;
  const que = m.modo === 'publico' ? 'El valor referencial' : 'El presupuesto total';
  return `${que} asciende a ${m.moneda} ${fmt(r.pie.total)} (${montoEnLetras(r.pie.total, c.monedaNombre)}), con precios a ${fechaLarga(m.fechaBase)}, ${conIgv ? 'incluido el IGV' : 'sin incluir el IGV'}.`;
}

export function filasPie(r: Resultados): string[][] {
  const m = r.proyecto.meta;
  const filas: string[][] = [
    ['Costo directo', fmt(r.pie.costoDirecto)],
    [`Gastos generales (${fmt(r.pie.ggPct)} %)`, fmt(r.pie.gg)],
    [`Utilidad (${fmt(m.utilidadPct)} %)`, fmt(r.pie.utilidad)],
    ['Subtotal', fmt(r.pie.subtotal)],
  ];
  if (m.incluirIgv !== false) filas.push([`IGV (${fmt(m.igvPct)} %)`, fmt(r.pie.igv)]);
  filas.push([m.modo === 'publico' ? 'Valor referencial' : m.incluirIgv === false ? 'Total (sin IGV)' : 'Presupuesto total', fmt(r.pie.total)]);
  return filas;
}

export function memoriaDescriptiva(r: Resultados): Documento {
  const p = r.proyecto;
  const m = p.meta;
  const c = datosCabecera(p);
  const mon = m.moneda;
  const publico = m.modo === 'publico';
  const b: Bloque[] = [];
  let n = 0;
  const h = (t: string) => b.push({ t: 'h1', texto: `${++n} ${t.toUpperCase()}` });
  h('Generalidades');
  const pares: [string, string][] = [
    ['Proyecto', m.nombre],
    ['Código', m.codigo],
    [publico ? 'Entidad' : 'Cliente', c.cliente || '—'],
  ];
  if (c.propietario) pares.push(['Propietario', c.propietario]);
  if (c.proyectista) pares.push(['Proyectista', c.proyectista]);
  pares.push(
    ['Ubicación', c.ubicacionLarga || '—'],
    ['Sistema de contratación', m.sistemaContratacion],
    ['Moneda', `${c.monedaNombre} (${mon})`],
    ['Fecha de determinación del presupuesto', fechaLarga(m.fechaBase)],
  );
  b.push({ t: 'kv', pares });
  if (m.descripcion) b.push(...parrafos(m.descripcion));
  if (p.memoria.antecedentes) { h('Antecedentes'); b.push(...parrafos(textoProyecto(p, p.memoria.antecedentes))); }
  if (p.memoria.objetivo) { h('Objetivo'); b.push(...parrafos(textoProyecto(p, p.memoria.objetivo))); }
  h('Ubicación');
  b.push({ t: 'p', alinear: 'just', texto: `El proyecto se ubica en ${c.ubicacionLarga || 'la zona indicada en los planos'}. Para efectos de la fórmula polinómica corresponde al área geográfica ${m.areaGeografica} (${AREAS_GEOGRAFICAS[m.areaGeografica] ?? ''}) de los índices unificados del INEI.` });
  h('Alcance y descripción del proyecto');
  b.push(...parrafos(textoProyecto(p, p.memoria.alcance)));
  b.push(...parrafos(textoProyecto(p, p.memoria.descripcionTecnica)));
  b.push({ t: 'p', texto: 'El proyecto comprende los siguientes componentes:' });
  b.push({
    t: 'tabla',
    cabecera: ['Ítem', 'Componente', `Costo directo (${mon})`, '%'],
    filas: r.filas.filter((f) => f.nivel <= 2 && f.esTitulo).map((f) => [f.partida.codigo, f.partida.descripcion, fmt(f.parcial), r.pie.costoDirecto ? fmt((f.parcial / r.pie.costoDirecto) * 100) : '0.00']),
    anchos: [12, 58, 20, 10],
    alinear: ['l', 'l', 'r', 'r'],
  });
  h('Metas físicas');
  const metas = [...r.hojas].sort((a, z) => z.parcial - a.parcial).slice(0, 15);
  b.push({
    t: 'tabla',
    cabecera: ['Ítem', 'Descripción', 'Und', 'Metrado'],
    filas: metas.map((f) => [f.partida.codigo, f.partida.descripcion, f.partida.unidad, fmt(f.metrado)]),
    anchos: [14, 62, 8, 16],
    alinear: ['l', 'l', 'c', 'r'],
  });
  h(publico ? 'Valor referencial' : 'Presupuesto');
  b.push({ t: 'tabla', cabecera: ['Concepto', `Monto (${mon})`], filas: filasPie(r), anchos: [70, 30], alinear: ['l', 'r'], negritas: [filasPie(r).length - 1] });
  b.push({ t: 'p', alinear: 'just', texto: textoTotal(r) });
  h('Plazo de ejecución');
  b.push({ t: 'p', alinear: 'just', texto: `El plazo de ejecución es de ${r.programa.plazoDias} días calendario (${r.programa.diasLaborables} días laborables de ${m.jornadaHoras} horas), desde el ${fechaLarga(r.programa.inicio)} hasta el ${fechaLarga(r.programa.fin)}, según el cronograma de ejecución de obra.` });
  if (publico || r.polinomica.monomios.length) {
    h('Fórmula polinómica');
    b.push({ t: 'p', texto: r.polinomica.formula });
    b.push({
      t: 'tabla',
      cabecera: ['Monomio', 'Coeficiente', 'Índices unificados (peso)'],
      filas: r.polinomica.monomios.map((x) => [x.simbolo, x.coeficiente.toFixed(3), x.indices.map((i) => `${i.iu} ${i.nombre} (${i.peso.toFixed(3)})`).join('; ')]),
      anchos: [14, 16, 70],
      alinear: ['c', 'r', 'l'],
    });
  }
  if (p.memoria.consideraciones) { h('Consideraciones'); b.push(...parrafos(textoProyecto(p, p.memoria.consideraciones))); }
  b.push(firmasProyecto(r));
  return { titulo: 'Memoria descriptiva', sigla: 'MD', bloques: b, portada: true, indice: true };
}

export function cartaPresentacion(r: Resultados, lugarFecha?: string): Documento {
  const p = r.proyecto;
  const m = p.meta;
  const c = datosCabecera(p);
  const publico = m.modo === 'publico';
  const cli = p.entidades.cliente;
  const pro = p.entidades.proyectista;
  const b: Bloque[] = [];
  b.push({ t: 'p', alinear: 'der', texto: lugarFecha ?? `${m.departamento || 'Lima'}, ${fechaLarga(m.fecha || new Date().toISOString().slice(0, 10))}` });
  b.push({ t: 'p', texto: 'Señores' });
  b.push({ t: 'p', negrita: true, texto: nombreEntidad(cli) || '[Cliente]' });
  if (cli.representante) b.push({ t: 'p', texto: `Atención: ${cli.representante}` });
  if (cli.direccion) b.push({ t: 'p', texto: cli.direccion });
  b.push({ t: 'p', texto: 'Presente.-' });
  b.push({ t: 'p', negrita: true, texto: `Referencia: ${p.tdr.titulo || m.nombre}` });
  b.push({ t: 'p', texto: 'De nuestra consideración:' });
  b.push({
    t: 'p',
    alinear: 'just',
    texto: publico
      ? `Por medio de la presente remitimos el expediente técnico de la obra "${m.nombre}". ${textoTotal(r)} El plazo de ejecución es de ${r.programa.plazoDias} días calendario.`
      : `${nombreEntidad(pro) || 'Nuestra empresa'} tiene el agrado de presentar su oferta para la ejecución de "${m.nombre}", de acuerdo con los términos de referencia recibidos. ${textoTotal(r)} El plazo de ejecución es de ${r.programa.plazoDias} días calendario.`,
  });
  const pie = filasPie(r);
  b.push({ t: 'tabla', cabecera: ['Concepto', `Monto (${m.moneda})`], filas: pie, anchos: [70, 30], alinear: ['l', 'r'], negritas: [pie.length - 1] });
  if (!publico) {
    b.push({ t: 'p', negrita: true, texto: 'Condiciones de la oferta' });
    b.push({
      t: 'lista',
      items: [
        `Validez de la oferta: ${m.validezOfertaDias} días calendario.`,
        `Forma de pago: ${m.formaPago}.`,
        `Sistema de contratación: ${m.sistemaContratacion}.`,
        `Moneda: ${c.monedaNombre}.`,
        `Fecha de determinación de precios: ${fechaLarga(m.fechaBase)}.`,
        m.adelantoDirectoPct ? `Adelanto directo: ${fmt(m.adelantoDirectoPct)} % del monto total, contra garantía.` : 'Sin adelanto directo.',
      ],
    });
    b.push({ t: 'p', alinear: 'just', texto: 'Se adjuntan el presupuesto detallado, los análisis de precios unitarios, el desagregado de gastos generales, los cronogramas y los demás documentos solicitados en los términos de referencia.' });
  }
  b.push({ t: 'p', texto: 'Atentamente,' });
  const ap = p.responsables.aprobo.nombre ? p.responsables.aprobo : p.responsables.elaboro;
  b.push({
    t: 'firma',
    nombre: ap.nombre || pro.representante || '[Nombre]',
    cargo: [ap.cargo, nombreEntidad(pro)].filter(Boolean).join(' – '),
    detalle: [ap.colegiatura, pro.ruc ? `RUC ${pro.ruc}` : ''].filter(Boolean).join(' · '),
  });
  return { titulo: publico ? 'Carta de remisión del expediente' : 'Carta de presentación de la oferta', sigla: 'CP', bloques: b, portada: false };
}

/** Especificaciones técnicas con el orden y la codificación del presupuesto. */
export function especificacionesTecnicas(r: Resultados): Documento {
  const p = r.proyecto;
  const t = p.textosEett;
  const b: Bloque[] = [];
  b.push({ t: 'h1', texto: 'ESPECIFICACIONES GENERALES' });
  const general: [string, string][] = [
    ['Objetivo', t.objetivo],
    ['Alcance', t.alcance],
    ['Normativa aplicable', t.normativa],
    ['Definiciones', t.definiciones],
    ['Consideraciones generales', t.consideraciones],
  ];
  for (const [titulo, texto] of general) {
    if (!texto?.trim()) continue;
    b.push({ t: 'p', negrita: true, texto: titulo });
    b.push(...parrafos(textoProyecto(p, texto)));
  }
  const e = new Map(r.eett.map((x) => [x.partida.id, x]));
  for (const f of r.filas) {
    if (f.esTitulo) {
      const nivel = Math.min(3, f.nivel);
      b.push({ t: (`h${nivel}` as 'h1' | 'h2' | 'h3'), texto: `${f.partida.codigo} ${f.partida.descripcion.toUpperCase()}` });
      continue;
    }
    const x = e.get(f.partida.id);
    if (!x) continue;
    b.push({ t: 'h4', texto: `${f.partida.codigo} ${f.partida.descripcion}` });
    b.push({ t: 'p', etiqueta: 'Unidad de medida', texto: f.partida.unidad });
    for (const s of SECCIONES_EETT) {
      const texto = x.secciones[s.k];
      if (!texto?.trim()) continue;
      b.push({ t: 'p', negrita: true, texto: s.n });
      b.push(...parrafos(texto));
    }
  }
  return { titulo: 'Especificaciones técnicas', sigla: 'EETT', bloques: b, portada: true, indice: true };
}

export function matrizCumplimiento(r: Resultados): Documento {
  const filas = r.proyecto.tdr.entregables.map((e, i) => {
    const doc = e.documento ? NOMBRE_DOC[e.documento as DocKey] : '— sin asignar —';
    const estado = !e.documento ? 'Pendiente' : e.documento === 'externo' ? 'Externo' : 'Generado';
    return [String(i + 1), e.descripcion, doc, estado, e.observacion || ''];
  });
  return {
    titulo: 'Matriz de cumplimiento del TdR',
    sigla: 'MC',
    bloques: [
      { t: 'p', texto: r.proyecto.tdr.titulo || r.proyecto.meta.nombre, negrita: true },
      { t: 'tabla', cabecera: ['N°', 'Entregable exigido', 'Documento del expediente', 'Estado', 'Observación'], filas, anchos: [6, 34, 28, 12, 20], alinear: ['c', 'l', 'l', 'c', 'l'] },
    ],
  };
}

export function reporteConsistencia(r: Resultados): Documento {
  const b: Bloque[] = [];
  const s = r.resumenValidacion;
  b.push({ t: 'p', texto: `Resultado: ${s.ok} reglas conformes, ${s.advertencias} con advertencias y ${s.errores} con errores.`, negrita: true });
  b.push({
    t: 'tabla',
    cabecera: ['N°', 'Control', 'Estado', 'Detalle'],
    filas: r.validacion.map((v) => [String(v.regla), v.control, v.estado === 'ok' ? 'Conforme' : v.estado === 'error' ? 'Error' : 'Advertencia', v.detalle]),
    anchos: [6, 40, 16, 38],
    alinear: ['c', 'l', 'c', 'l'],
  });
  const obs = r.validacion.flatMap((v) => v.hallazgos);
  if (obs.length) {
    b.push({ t: 'h3', texto: 'Observaciones' });
    b.push({ t: 'tabla', cabecera: ['Regla', 'Severidad', 'Observación'], filas: obs.map((o) => [String(o.regla), o.severidad, o.mensaje]), anchos: [8, 14, 78], alinear: ['c', 'c', 'l'] });
  }
  return { titulo: 'Reporte de consistencia', sigla: 'RC', bloques: b };
}

/** Informe de revisión del expediente original importado: cifras comparadas y observaciones por documento. */
export function informeObservaciones(r: Resultados): Documento | null {
  const o = r.proyecto.origen;
  if (!o) return null;
  const m = r.proyecto.meta;
  const b: Bloque[] = [];
  const obs = o.observaciones;
  b.push({ t: 'h1', texto: '1 OBJETO' });
  b.push({
    t: 'p',
    alinear: 'just',
    texto: `Se revisó el expediente "${m.nombre}" entregado en ${o.archivos.length} archivos. Se cargaron el presupuesto, los análisis de precios unitarios, la relación de insumos, los gastos generales, la planilla de metrados, el cronograma y las especificaciones técnicas; se recalculó todo con Expediente Pro y se regeneraron los entregables con un formato único. Este informe compara las cifras y enumera las observaciones de formato y de consistencia encontradas en los documentos originales.`,
  });
  b.push({ t: 'h1', texto: '2 DOCUMENTOS REVISADOS' });
  b.push({ t: 'lista', items: o.hojas });
  b.push({ t: 'h1', texto: '3 COMPARACIÓN DE CIFRAS' });
  const fila = (n: string, a: number | undefined, x: number, dec = 2): string[] => [n, a === undefined ? '—' : fmt(a, dec), fmt(x, dec), a === undefined ? '' : fmt(x - a, dec)];
  b.push({
    t: 'tabla',
    cabecera: ['Concepto', 'Expediente original', 'Recalculado', 'Diferencia'],
    filas: [
      fila(`Costo directo (${m.moneda})`, o.original.costoDirecto, r.pie.costoDirecto),
      fila(`Gastos generales (${m.moneda})`, o.original.gg, r.pie.gg),
      fila(`Utilidad (${m.moneda})`, o.original.utilidad, r.pie.utilidad),
      fila(`Subtotal (${m.moneda})`, o.original.subtotal, r.pie.subtotal),
      fila('Plazo (días calendario)', o.original.plazoDias, r.programa.plazoDias, 0),
    ],
    anchos: [40, 20, 20, 20],
    alinear: ['l', 'r', 'r', 'r'],
  });
  b.push({ t: 'p', alinear: 'just', texto: 'Las diferencias de centavos en gastos generales y subtotal se deben a que el original suma parciales sin redondear; Expediente Pro redondea cada parcial a dos decimales, de modo que el total impreso es la suma de las cifras impresas.' });
  b.push({ t: 'h1', texto: '4 RESUMEN DE OBSERVACIONES' });
  const docs = [...new Set(obs.map((x) => x.documento))];
  const tipos = ['Consistencia', 'Cálculo', 'Formato', 'Información'] as const;
  b.push({
    t: 'tabla',
    cabecera: ['Documento', ...tipos, 'Total'],
    filas: [
      ...docs.map((d) => [d, ...tipos.map((t) => String(obs.filter((x) => x.documento === d && x.tipo === t).length || '')), String(obs.filter((x) => x.documento === d).length)]),
      ['TOTAL', ...tipos.map((t) => String(obs.filter((x) => x.tipo === t).length)), String(obs.length)],
    ],
    anchos: [40, 12, 12, 12, 12, 12],
    alinear: ['l', 'c', 'c', 'c', 'c', 'c'],
    negritas: [docs.length],
  });
  b.push({ t: 'h1', texto: '5 OBSERVACIONES POR DOCUMENTO' });
  docs.forEach((d, i) => {
    b.push({ t: 'h2', texto: `5.${i + 1} ${d}` });
    b.push({
      t: 'tabla',
      cabecera: ['N°', 'Ubicación', 'Tipo', 'Observación', 'Corrección aplicada o recomendada'],
      filas: obs.filter((x) => x.documento === d).map((x, k) => [String(k + 1), x.ubicacion, x.tipo, x.detalle, x.correccion]),
      anchos: [5, 17, 13, 35, 30],
      alinear: ['c', 'l', 'c', 'l', 'l'],
    });
  });
  b.push({ t: 'h1', texto: '6 MEJORAS EN LOS ENTREGABLES REGENERADOS' });
  b.push({
    t: 'lista',
    items: [
      'Una sola codificación (01.01.01) y una sola descripción y unidad por partida en metrados, presupuesto, APU, EETT y cronograma.',
      'Excel con fórmulas vinculadas entre hojas: al cambiar un metrado, rendimiento, cuadrilla, precio o porcentaje se recalculan APU, relación de insumos, presupuesto, gastos generales, fórmula polinómica, cronograma valorizado y calendarios. Sin vínculos a otros libros ni fechas que cambian solas.',
      'Análisis de precios unitarios en formato estándar: rendimiento MO/EQ, costo unitario por unidad, recursos agrupados (mano de obra, materiales, equipos, subcontratos) con unidad, cuadrilla, cantidad, precio y parcial.',
      'Relación de insumos con un precio por código, fuente y fecha de cotización; gastos generales variables, fijos y financieros con parciales redondeados y ligados al plazo.',
      'Carátula, control del documento, aviso de uso, índice con páginas, encabezado con logos del proyectista y del cliente, y pie con código, revisión y página en todos los documentos.',
      'Especificaciones técnicas completas por partida (las que solo remitían a otra se escribieron completas) y monto en letras con la moneda.',
      'Reporte de consistencia con 15 reglas que se revisan en cada cambio.',
    ],
  });
  b.push(firmasProyecto(r));
  return { titulo: 'Informe de revisión del expediente', sigla: 'IR', bloques: b, portada: true, indice: true };
}
