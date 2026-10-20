// Tablas de reportes con el formato estándar de expediente técnico (S10 / PowerCost).
// Las usan el PDF consolidado y las vistas previas de la interfaz.
import { datosCabecera } from '../engine/cabecera';
import { CAMPOS_METRADO, parcialMetrado } from '../engine/compute';
import type { DocKey, Resultados, TipoInsumo } from '../engine/types';
import { fechaCorta, fechaLarga, fmt, montoEnLetras } from '../engine/util';

export type Celda = string | number | null;
export type EstiloFila = 'normal' | 'titulo' | 'subtitulo' | 'total' | 'encabezado' | 'nota' | 'separador' | 'grupo';
export interface Fila {
  celdas: Celda[];
  estilo?: EstiloFila;
  nivel?: number;
  /** Celdas combinadas (índices de columna inclusivos). */
  combinar?: { desde: number; hasta: number }[];
}
export interface Tabla {
  clave: DocKey | string;
  titulo: string;
  subtitulo?: string;
  cabecera: string[];
  filas: Fila[];
  anchos: number[]; // relativos (caracteres aprox.)
  alinear: ('l' | 'r' | 'c')[];
  decimales: (number | null)[];
  horizontal?: boolean;
  columnasFijas?: number; // columnas que se repiten al partir tablas anchas
  ocultarCeros?: boolean; // en cronogramas, los periodos sin valor se dejan en blanco
  sinCabecera?: boolean; // cada bloque trae su propia fila de encabezado (APU)
  bloques?: number[]; // índices de fila donde empieza cada bloque que no debe partirse
}

export const TIPOS_INSUMO: { t: TipoInsumo; n: string }[] = [
  { t: 'MO', n: 'Mano de obra' },
  { t: 'MAT', n: 'Materiales' },
  { t: 'EQ', n: 'Equipos' },
  { t: 'SC', n: 'Subcontratos' },
];

export function subtituloProyecto(r: Resultados): string {
  return `Precios a ${fechaLarga(r.proyecto.meta.fechaBase)} · Moneda: ${datosCabecera(r.proyecto).monedaNombre}`;
}

export function lineaSon(r: Resultados): string {
  return `SON: ${montoEnLetras(r.pie.total, datosCabecera(r.proyecto).monedaNombre)}`;
}

function filasPie(r: Resultados, n: number, col: number, colPct?: number): Fila[] {
  const m = r.proyecto.meta;
  const cd = r.pie.costoDirecto;
  const fila = (texto: string, valor: number, estilo: EstiloFila = 'normal', pct?: number): Fila => {
    const c: Celda[] = new Array(n).fill(null);
    c[1] = texto;
    c[col] = valor;
    if (colPct !== undefined && pct !== undefined) c[colPct] = pct;
    return { celdas: c, estilo };
  };
  const p = (v: number) => (cd ? (v / cd) * 100 : 0);
  const out: Fila[] = [
    fila('COSTO DIRECTO', cd, 'total', 100),
    fila(`GASTOS GENERALES (${fmt(r.pie.ggPct)} %)`, r.pie.gg, 'normal', p(r.pie.gg)),
    fila('    Gastos generales variables', r.pie.ggVariables, 'nota', p(r.pie.ggVariables)),
    fila('    Gastos generales fijos', r.pie.ggFijos, 'nota', p(r.pie.ggFijos)),
  ];
  if (r.pie.ggFinancieros) out.push(fila('    Gastos financieros', r.pie.ggFinancieros, 'nota', p(r.pie.ggFinancieros)));
  out.push(fila(`UTILIDAD (${fmt(m.utilidadPct)} %)`, r.pie.utilidad, 'normal', p(r.pie.utilidad)));
  out.push(fila('SUBTOTAL', r.pie.subtotal, 'total', p(r.pie.subtotal)));
  if (m.incluirIgv !== false) out.push(fila(`IGV (${fmt(m.igvPct)} %)`, r.pie.igv, 'normal', p(r.pie.igv)));
  out.push(fila(m.modo === 'publico' ? 'VALOR REFERENCIAL' : m.incluirIgv === false ? 'PRESUPUESTO TOTAL (SIN IGV)' : 'PRESUPUESTO TOTAL', r.pie.total, 'total', p(r.pie.total)));
  const son: Celda[] = new Array(n).fill(null);
  son[0] = lineaSon(r);
  out.push({ celdas: son, estilo: 'nota', combinar: [{ desde: 0, hasta: n - 1 }] });
  return out;
}

// ------------------------------------------------------------ presupuesto

export function tablaResumen(r: Resultados): Tabla {
  const cd = r.pie.costoDirecto;
  const filas: Fila[] = r.filas
    .filter((f) => f.esTitulo && f.nivel <= 2)
    .map((f) => ({ celdas: [f.partida.codigo, f.partida.descripcion, f.parcial, cd ? (f.parcial / cd) * 100 : 0], estilo: f.nivel === 1 ? 'subtitulo' : 'normal', nivel: f.nivel }));
  filas.push({ celdas: [null, null, null, null], estilo: 'separador' });
  filas.push(...filasPie(r, 4, 2, 3));
  // resumen de costos por tipo de insumo
  filas.push({ celdas: [null, null, null, null], estilo: 'separador' });
  filas.push({ celdas: ['Tipo', 'Resumen de costos por tipo de insumo', `Monto (${r.proyecto.meta.moneda})`, '% CD'], estilo: 'encabezado' });
  for (const { t, n } of TIPOS_INSUMO) {
    const v = r.insumos.porTipo[t] ?? 0;
    if (!v) continue;
    filas.push({ celdas: [t, n, v, cd ? (v / cd) * 100 : 0] });
  }
  if (Math.abs(r.insumos.diferenciaRedondeo) >= 0.005) filas.push({ celdas: [null, 'Diferencia por redondeo de los APU', r.insumos.diferenciaRedondeo, cd ? (r.insumos.diferenciaRedondeo / cd) * 100 : 0], estilo: 'nota' });
  filas.push({ celdas: [null, 'COSTO DIRECTO', cd, 100], estilo: 'total' });
  return {
    clave: 'presupuesto_resumen',
    titulo: 'Presupuesto resumen',
    subtitulo: subtituloProyecto(r),
    cabecera: ['Ítem', 'Descripción', `Parcial (${r.proyecto.meta.moneda})`, '% CD'],
    filas,
    anchos: [11, 63, 17, 9],
    alinear: ['l', 'l', 'r', 'r'],
    decimales: [null, null, 2, 2],
  };
}

export function tablaDetallado(r: Resultados): Tabla {
  const filas: Fila[] = r.filas.map((f) =>
    f.esTitulo
      ? { celdas: [f.partida.codigo, f.partida.descripcion, null, null, null, f.parcial], estilo: f.nivel === 1 ? 'titulo' : 'subtitulo', nivel: f.nivel }
      : { celdas: [f.partida.codigo, f.partida.descripcion, f.partida.unidad, f.metrado, f.pu, f.parcial], estilo: 'normal', nivel: f.nivel },
  );
  filas.push({ celdas: new Array(6).fill(null), estilo: 'separador' });
  return {
    clave: 'presupuesto_detallado',
    titulo: r.proyecto.meta.modo === 'publico' ? 'Presupuesto de obra' : 'Presupuesto detallado',
    subtitulo: subtituloProyecto(r),
    cabecera: ['Ítem', 'Descripción', 'Und.', 'Metrado', `Precio (${r.proyecto.meta.moneda})`, `Parcial (${r.proyecto.meta.moneda})`],
    filas: [...filas, ...filasPie(r, 6, 5)],
    anchos: [11, 50, 6, 11, 11, 13],
    alinear: ['l', 'l', 'c', 'r', 'r', 'r'],
    decimales: [null, null, null, 2, 2, 2],
  };
}

// ------------------------------------------------------------ APU (bloques S10)

export function tablaApu(r: Resultados): Tabla {
  const filas: Fila[] = [];
  const bloques: number[] = [];
  const mon = r.proyecto.meta.moneda;
  for (const f of r.hojas) {
    const a = r.apus[f.partida.id];
    if (!a) continue;
    bloques.push(filas.length);
    const und = f.partida.unidad;
    filas.push({ celdas: ['Partida', `${f.partida.codigo}   ${f.partida.descripcion}`, null, null, null, null, null], estilo: 'titulo', combinar: [{ desde: 1, hasta: 6 }] });
    filas.push({
      celdas: ['Rendimiento', `${und}/DÍA    MO. ${fmt(a.rendimiento, 4)}    EQ. ${fmt(a.rendimiento, 4)}${a.jornada !== r.proyecto.meta.jornadaHoras ? `    Jornada ${fmt(a.jornada, 1)} h` : ''}`, null, `Costo unitario directo por : ${und}`, null, null, a.pu],
      estilo: 'grupo',
      combinar: [{ desde: 1, hasta: 2 }, { desde: 3, hasta: 5 }],
    });
    filas.push({ celdas: ['Código', 'Descripción recurso', 'Unidad', 'Cuadrilla', 'Cantidad', `Precio ${mon}`, `Parcial ${mon}`], estilo: 'encabezado' });
    for (const { t, n } of TIPOS_INSUMO) {
      const its = a.items.filter((i) => i.insumo.tipo === t);
      if (!its.length) continue;
      filas.push({ celdas: [null, n, null, null, null, null, a.subtotales[t]], estilo: 'subtitulo' });
      for (const it of its) {
        const pct = it.porcentaje !== null;
        filas.push({
          celdas: [
            it.insumo.codigo,
            it.insumo.descripcion,
            it.insumo.unidad,
            pct ? null : it.cuadrilla,
            it.cantidad,
            pct ? (it.parcial && it.cantidad ? (it.parcial * 100) / it.cantidad : a.subtotales.MO) : it.precio,
            it.parcial,
          ],
        });
      }
    }
    filas.push({ celdas: new Array(7).fill(null), estilo: 'separador' });
  }
  return {
    clave: 'apu',
    titulo: 'Análisis de precios unitarios',
    subtitulo: subtituloProyecto(r),
    cabecera: ['Código', 'Descripción recurso', 'Unidad', 'Cuadrilla', 'Cantidad', `Precio ${mon}`, `Parcial ${mon}`],
    filas,
    anchos: [12, 44, 7, 9, 10, 9, 10],
    alinear: ['l', 'l', 'c', 'r', 'r', 'r', 'r'],
    decimales: [null, null, null, 4, 4, 2, 2],
    sinCabecera: true,
    bloques,
  };
}

// ------------------------------------------------------------ insumos

export function tablaInsumos(r: Resultados): Tabla {
  const filas: Fila[] = [];
  for (const { t, n } of TIPOS_INSUMO) {
    const its = r.insumos.items.filter((i) => i.insumo.tipo === t).sort((a, b) => a.insumo.descripcion.localeCompare(b.insumo.descripcion));
    if (!its.length) continue;
    filas.push({ celdas: [null, n.toUpperCase(), null, null, null, r.insumos.porTipo[t], null, null], estilo: 'subtitulo' });
    for (const it of its) {
      const pct = it.insumo.unidad.trim().startsWith('%');
      const fuente = [it.insumo.fuente, it.insumo.fechaPrecio ? fechaCorta(it.insumo.fechaPrecio) : ''].filter(Boolean).join(' · ');
      filas.push({ celdas: [it.insumo.codigo, it.insumo.descripcion, it.insumo.unidad, pct ? null : it.cantidad, pct ? null : it.precio, it.parcial, it.insumo.iu || '39', fuente] });
    }
  }
  filas.push({ celdas: [null, 'TOTAL DE INSUMOS', null, null, null, r.insumos.total, null, null], estilo: 'total' });
  filas.push({ celdas: [null, 'Diferencia por redondeo de los APU', null, null, null, r.insumos.diferenciaRedondeo, null, null], estilo: 'nota' });
  filas.push({ celdas: [null, 'COSTO DIRECTO', null, null, null, r.pie.costoDirecto, null, null], estilo: 'total' });
  return {
    clave: 'insumos',
    titulo: 'Relación y cotización de insumos',
    subtitulo: subtituloProyecto(r),
    cabecera: ['Código', 'Descripción del insumo', 'Und', 'Cantidad', `Precio (${r.proyecto.meta.moneda})`, `Parcial (${r.proyecto.meta.moneda})`, 'IU', 'Fuente / cotización'],
    filas,
    anchos: [10, 36, 5, 11, 9, 12, 5, 22],
    alinear: ['l', 'l', 'c', 'r', 'r', 'r', 'c', 'l'],
    decimales: [null, null, null, 4, 2, 2, null, null],
  };
}

// ------------------------------------------------------------ gastos generales

export function tablaGG(r: Resultados): Tabla {
  const filas: Fila[] = [];
  const cd = r.pie.costoDirecto;
  const mon = r.proyecto.meta.moneda;
  const grupos: { g: 'variable' | 'fijo' | 'financiero'; n: string; total: number }[] = [
    { g: 'variable', n: 'A. GASTOS GENERALES VARIABLES', total: r.gg.variables },
    { g: 'fijo', n: 'B. GASTOS GENERALES FIJOS', total: r.gg.fijos },
    { g: 'financiero', n: 'C. GASTOS FINANCIEROS', total: r.gg.financieros },
  ];
  const n = 9;
  const vacio = (): Celda[] => new Array(n).fill(null);
  for (const { g, n: nombre, total } of grupos) {
    const items = r.gg.items.filter((x) => (x.grupo ?? 'variable') === g);
    if (!items.length && g === 'financiero') continue;
    const c = vacio();
    c[0] = nombre;
    c[8] = total;
    filas.push({ celdas: c, estilo: 'titulo', combinar: [{ desde: 0, hasta: 7 }] });
    filas.push({ celdas: ['Ítem', 'Descripción', 'Und.', 'Inc. %', 'Cantidad', g === 'variable' ? 'Meses' : 'Veces', `Precio (${mon})`, `Parcial (${mon})`, `Total (${mon})`], estilo: 'encabezado' });
    const rubros = [...new Set(items.map((x) => x.rubro || 'Varios'))];
    rubros.forEach((rb, ir) => {
      const del = items.filter((x) => (x.rubro || 'Varios') === rb);
      const nr = String(ir + 1).padStart(2, '0');
      const cr = vacio();
      cr[0] = nr;
      cr[1] = rb.toUpperCase();
      cr[8] = del.reduce((a, x) => a + x.total, 0);
      filas.push({ celdas: cr, estilo: 'subtitulo' });
      del.forEach((x, ii) => {
        const pctCD = (x.unidad || '').toLowerCase() === '%cd';
        filas.push({
          celdas: [`${nr}.${String(ii + 1).padStart(2, '0')}`, x.descripcion, pctCD ? '%CD' : x.unidad, x.participacion, pctCD ? `${fmt(x.cantidad, 4)} %` : x.cantidad, pctCD ? null : x.duracionUsada, pctCD ? cd : x.precio, x.total, null],
        });
      });
    });
    const ct = vacio();
    ct[1] = `TOTAL ${nombre.slice(3)}  (${fmt(cd ? (total / cd) * 100 : 0)} % del CD)`;
    ct[8] = total;
    filas.push({ celdas: ct, estilo: 'total' });
    filas.push({ celdas: vacio(), estilo: 'separador' });
  }
  filas.push({ celdas: [null, 'RESUMEN DE GASTOS GENERALES', null, null, null, null, null, `Monto (${mon})`, '% CD'], estilo: 'encabezado' });
  for (const { g, n: nombre, total } of grupos) {
    if (g === 'financiero' && !r.gg.items.some((x) => x.grupo === 'financiero')) continue;
    filas.push({ celdas: [null, nombre.slice(3), null, null, null, null, null, total, cd ? (total / cd) * 100 : 0] });
  }
  filas.push({ celdas: [null, 'TOTAL GASTOS GENERALES', null, null, null, null, null, r.gg.total, cd ? (r.gg.total / cd) * 100 : 0], estilo: 'total' });
  filas.push({ celdas: [`Costo directo: ${mon} ${fmt(cd)} · Plazo de ejecución: ${r.programa.plazoDias} días calendario (${fmt(r.programa.plazoMeses)} meses)`, null, null, null, null, null, null, null, null], estilo: 'nota', combinar: [{ desde: 0, hasta: 8 }] });
  return {
    clave: 'gg',
    titulo: 'Desagregado de gastos generales',
    subtitulo: subtituloProyecto(r),
    cabecera: ['Ítem', 'Descripción', 'Und.', 'Inc. %', 'Cantidad', 'Meses', 'Precio', 'Parcial', 'Total'],
    filas,
    anchos: [7, 37, 6, 6, 8, 7, 11, 11, 12],
    alinear: ['l', 'l', 'c', 'r', 'r', 'r', 'r', 'r', 'r'],
    decimales: [null, null, null, 2, 2, 2, 2, 2, 2],
    sinCabecera: true,
  };
}

// ------------------------------------------------------------ metrados

export function tablaMetrados(r: Resultados): Tabla {
  const filas: Fila[] = [];
  const porPartida = new Map<string, typeof r.proyecto.metrados>();
  for (const m of r.proyecto.metrados) {
    const l = porPartida.get(m.partidaId) ?? [];
    l.push(m);
    porPartida.set(m.partidaId, l);
  }
  const N = 14;
  for (const f of r.filas) {
    if (f.esTitulo) {
      const c: Celda[] = new Array(N).fill(null);
      c[0] = f.partida.codigo;
      c[1] = f.partida.descripcion;
      filas.push({ celdas: c, estilo: f.nivel === 1 ? 'titulo' : 'subtitulo' });
      continue;
    }
    const c: Celda[] = new Array(N).fill(null);
    c[0] = f.partida.codigo;
    c[1] = f.partida.descripcion;
    c[2] = f.partida.unidad;
    c[13] = f.metrado;
    filas.push({ celdas: c, estilo: 'grupo' });
    for (const m of porPartida.get(f.partida.id) ?? []) {
      const vals = CAMPOS_METRADO.map((k) => {
        const v = m[k];
        return v === null || v === undefined || (v as unknown) === '' ? null : Number(v);
      });
      filas.push({ celdas: [null, `    ${m.descripcion}`, null, m.referencia ?? '', ...vals, parcialMetrado(m), null] });
    }
  }
  return {
    clave: 'metrados',
    titulo: 'Planilla de sustento de metrados',
    subtitulo: subtituloProyecto(r),
    cabecera: ['Ítem', 'Descripción', 'Und', 'Referencia', 'N.º veces', 'Cantidad', 'Factor', 'Largo', 'Ancho', 'Alto', 'Área', 'Volumen', 'Parcial', 'Total'],
    filas,
    anchos: [8, 34, 5, 11, 6, 7, 6, 7, 7, 7, 8, 8, 9, 10],
    alinear: ['l', 'l', 'c', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
    decimales: [null, null, null, null, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    horizontal: true,
  };
}

// ------------------------------------------------------------ fórmula polinómica (formato S10)

export function tablaPolinomica(r: Resultados): Tabla {
  const p = r.polinomica;
  const filas: Fila[] = [];
  p.monomios.forEach((m, i) => {
    m.indices.forEach((x, j) => {
      filas.push({
        celdas: [j === 0 ? String(i + 1) : null, j === 0 ? m.coeficiente : null, x.peso * 100, j === 0 ? m.simbolo : null, x.iu, x.nombre],
        estilo: j === 0 ? 'normal' : 'normal',
      });
    });
    const otros = m.miembros.slice(3);
    if (otros.length) filas.push({ celdas: [null, null, null, null, null, `Agrupa además los índices ${otros.map((o) => o.iu).join(', ')}`], estilo: 'nota' });
  });
  filas.push({ celdas: [null, p.suma, null, null, null, 'Suma de coeficientes'], estilo: 'total' });
  filas.push({ celdas: [p.formula, null, null, null, null, null], estilo: 'titulo', combinar: [{ desde: 0, hasta: 5 }] });
  filas.push({ celdas: new Array(6).fill(null), estilo: 'separador' });
  filas.push({ celdas: ['IU', 'Incidencia', 'Monto', null, null, 'Incidencia de cada índice unificado sobre el presupuesto sin IGV'], estilo: 'encabezado' });
  for (const i of p.incidencias) filas.push({ celdas: [i.iu, i.incidencia, fmt(i.monto), null, null, i.nombre] });
  filas.push({ celdas: ['39', p.base ? (r.pie.gg + r.pie.utilidad) / p.base : 0, fmt(r.pie.gg + r.pie.utilidad), null, null, 'Gastos generales y utilidad'] });
  filas.push({ celdas: [null, null, fmt(p.base), null, null, 'Base: costo directo + gastos generales + utilidad'], estilo: 'total' });
  return {
    clave: 'polinomica',
    titulo: 'Fórmula polinómica',
    subtitulo: `${subtituloProyecto(r)} · Área geográfica ${r.proyecto.meta.areaGeografica} · Índices unificados INEI · D.S. N.° 011-79-VC`,
    cabecera: ['Monomio', 'Factor', '(%)', 'Símbolo', 'Índice', 'Descripción'],
    filas,
    anchos: [9, 10, 10, 9, 8, 54],
    alinear: ['c', 'r', 'r', 'c', 'c', 'l'],
    decimales: [null, 3, 3, null, null, null],
  };
}

export function tablaFlete(r: Resultados): Tabla {
  const filas: Fila[] = r.flete.items.map((i) => ({ celdas: [i.insumo.codigo, i.insumo.descripcion, i.insumo.unidad, i.cantidad, i.pesoKg, i.toneladas, i.flete] }));
  filas.push({ celdas: [null, 'TOTAL', null, null, null, r.flete.toneladas, r.flete.total], estilo: 'total' });
  if (r.flete.sinPeso.length) filas.push({ celdas: [null, `Insumos sin peso registrado (no incluidos): ${r.flete.sinPeso.join(', ')}`, null, null, null, null, null], estilo: 'nota' });
  return {
    clave: 'flete',
    titulo: 'Cálculo de flete terrestre',
    subtitulo: `${subtituloProyecto(r)} · Tarifa ${r.proyecto.meta.moneda} ${fmt(r.proyecto.meta.fleteTarifaTon)}/t · Distancia ${fmt(r.proyecto.meta.fleteDistanciaKm, 0)} km`,
    cabecera: ['Código', 'Material', 'Und', 'Cantidad', 'Peso unit. (kg)', 'Toneladas', 'Flete'],
    filas,
    anchos: [10, 44, 7, 11, 11, 10, 12],
    alinear: ['l', 'l', 'c', 'r', 'r', 'r', 'r'],
    decimales: [null, null, null, 2, 2, 3, 2],
  };
}

// ------------------------------------------------------------ cronogramas

export function textoPredecesoras(r: Resultados, preds: { id: string; tipo: string; desfase: number }[]): string {
  const cod = new Map(r.proyecto.partidas.map((p) => [p.id, p.codigo]));
  return preds.map((x) => `${cod.get(x.id) ?? '?'}${x.tipo}${x.desfase ? (x.desfase > 0 ? '+' : '') + x.desfase : ''}`).join('; ');
}

export function tablaPrograma(r: Resultados): Tabla {
  const acts = new Map(r.programa.actividades.map((a) => [a.partidaId, a]));
  const filas: Fila[] = [];
  for (const f of r.filas) {
    if (f.esTitulo) {
      filas.push({ celdas: [f.partida.codigo, f.partida.descripcion, null, null, null, null, null, null, null, null, null, null], estilo: f.nivel === 1 ? 'titulo' : 'subtitulo' });
      continue;
    }
    const a = acts.get(f.partida.id);
    if (!a) continue;
    filas.push({ celdas: [a.codigo, a.descripcion, a.unidad, a.metrado, a.rendimiento, a.cuadrillas, a.duracion, fechaCorta(a.inicio), fechaCorta(a.fin), a.holgura, a.critica ? 'Sí' : '', textoPredecesoras(r, a.predecesoras)] });
  }
  filas.push({ celdas: [`Plazo de ejecución: ${r.programa.plazoDias} días calendario · ${r.programa.diasLaborables} días laborables · Inicio ${fechaCorta(r.programa.inicio)} · Término ${fechaCorta(r.programa.fin)}`, null, null, null, null, null, null, null, null, null, null, null], estilo: 'total', combinar: [{ desde: 0, hasta: 11 }] });
  return {
    clave: 'programa',
    titulo: 'Cronograma de ejecución de obra',
    subtitulo: subtituloProyecto(r),
    cabecera: ['Ítem', 'Actividad', 'Und', 'Metrado', 'Rend./día', 'Cuadr.', 'Duración (d)', 'Inicio', 'Término', 'Holgura', 'Crítica', 'Predecesoras'],
    filas,
    anchos: [8, 36, 5, 10, 8, 6, 8, 10, 10, 7, 6, 16],
    alinear: ['l', 'l', 'c', 'r', 'r', 'r', 'r', 'c', 'c', 'r', 'c', 'l'],
    decimales: [null, null, null, 2, 2, 0, 0, null, null, 0, null, null],
    horizontal: true,
  };
}

export function tablaValorizado(r: Resultados): Tabla {
  const per = r.programa.periodos;
  const v = r.valorizado;
  const filas: Fila[] = v.filas.map((f) => ({ celdas: [f.codigo, f.descripcion, f.total, ...f.valores] }));
  const fila = (n: string, total: number, vals: number[], estilo: EstiloFila = 'normal'): Fila => ({ celdas: [null, n, total, ...vals], estilo });
  const m = r.proyecto.meta;
  filas.push(fila('COSTO DIRECTO', r.pie.costoDirecto, v.cd, 'total'));
  filas.push(fila('Gastos generales', r.pie.gg, v.gg));
  filas.push(fila('Utilidad', r.pie.utilidad, v.utilidad));
  filas.push(fila('SUBTOTAL', r.pie.subtotal, v.subtotal, 'total'));
  if (m.incluirIgv !== false) filas.push(fila(`IGV (${fmt(m.igvPct)} %)`, r.pie.igv, v.igv));
  filas.push(fila(m.incluirIgv === false ? 'TOTAL (SIN IGV)' : 'TOTAL', r.pie.total, v.total, 'total'));
  filas.push(fila('Avance del periodo (%)', 100, v.avancePct, 'nota'));
  filas.push(fila('Avance acumulado (%)', 100, v.acumuladoPct, 'nota'));
  filas.push(fila('Monto acumulado', r.pie.total, v.acumulado, 'nota'));
  return {
    clave: 'valorizado',
    titulo: 'Cronograma valorizado de avance de obra',
    subtitulo: subtituloProyecto(r),
    cabecera: ['Ítem', 'Descripción', 'Total', ...per.map((p) => p.etiqueta)],
    filas,
    anchos: [8, 34, 12, ...per.map(() => 11)],
    alinear: ['l', 'l', 'r', ...per.map(() => 'r' as const)],
    decimales: [null, null, 2, ...per.map(() => 2)],
    horizontal: true,
    columnasFijas: 3,
    ocultarCeros: true,
  };
}

function tablaDistribucion(r: Resultados, clave: DocKey, titulo: string, filasIn: Resultados['adquisiciones'], conPrevio: boolean, extra: Fila[] = [], dec = 2): Tabla {
  const per = r.programa.periodos;
  const etiquetas = [...(conPrevio ? ['Previo'] : []), ...per.map((p) => p.etiqueta)];
  const filas: Fila[] = filasIn.map((f) => ({ celdas: [f.codigo, f.descripcion, f.unidad, f.total, ...f.valores] }));
  if (conPrevio) {
    const montos = etiquetas.map((_, i) => filasIn.reduce((a, f) => a + (f.montos?.[i] ?? 0), 0));
    filas.push({ celdas: [null, `Monto de compras (${r.proyecto.meta.moneda})`, null, montos.reduce((a, b) => a + b, 0), ...montos], estilo: 'total' });
  }
  filas.push(...extra);
  return {
    clave,
    titulo,
    subtitulo: subtituloProyecto(r),
    cabecera: ['Código', 'Descripción', 'Und', 'Total', ...etiquetas],
    filas,
    anchos: [8, 32, 6, 11, ...etiquetas.map(() => 10)],
    alinear: ['l', 'l', 'c', 'r', ...etiquetas.map(() => 'r' as const)],
    decimales: [null, null, null, dec, ...etiquetas.map(() => dec)],
    horizontal: true,
    columnasFijas: 4,
    ocultarCeros: true,
  };
}

export function tablaAdquisiciones(r: Resultados): Tabla {
  const t = tablaDistribucion(r, 'adquisiciones', 'Calendario de adquisición de materiales', r.adquisiciones, true);
  t.subtitulo += ` · Compra anticipada según el plazo de compra de cada material (por defecto ${r.proyecto.meta.plazoCompraDefecto} días)`;
  return t;
}

export function tablaEquipos(r: Resultados): Tabla {
  const eq = r.programa.periodos.map((p, i) => r.equipos.reduce((a, f) => a + (f.valores[i] ?? 0), 0));
  return tablaDistribucion(r, 'equipos', 'Calendario de utilización de equipos (horas-máquina)', r.equipos, false, [
    { celdas: [null, 'Total horas-máquina', 'hm', eq.reduce((a, b) => a + b, 0), ...eq], estilo: 'total' },
  ]);
}

export function tablaPersonal(r: Resultados): Tabla {
  const hh = r.programa.periodos.map((p, i) => r.personal.reduce((a, f) => a + (f.valores[i] ?? 0), 0));
  return tablaDistribucion(r, 'personal', 'Histograma de personal (horas-hombre)', r.personal, false, [
    { celdas: [null, 'Total horas-hombre', 'hh', hh.reduce((a, b) => a + b, 0), ...hh], estilo: 'total' },
    { celdas: [null, 'Trabajadores promedio (equivalente)', 'und', r.personalPico, ...r.personalEquivalente], estilo: 'nota' },
  ]);
}

export function tablaDesembolsos(r: Resultados): Tabla {
  const filas: Fila[] = r.desembolsos.map((d) => ({ celdas: [d.periodo, d.valorizacion, d.adelantoDirecto + d.adelantoMateriales, d.amortizacion, d.neto, d.acumulado] }));
  return {
    clave: 'desembolsos',
    titulo: 'Cronograma de desembolsos',
    subtitulo: `${subtituloProyecto(r)} · Adelanto directo ${fmt(r.proyecto.meta.adelantoDirectoPct)} % · Adelanto de materiales ${fmt(r.proyecto.meta.adelantoMaterialesPct)} %`,
    cabecera: ['Periodo', r.proyecto.meta.incluirIgv === false ? 'Valorización' : 'Valorización (con IGV)', 'Adelantos', 'Amortización', 'Desembolso neto', 'Acumulado'],
    filas,
    anchos: [14, 18, 16, 16, 18, 18],
    alinear: ['l', 'r', 'r', 'r', 'r', 'r'],
    decimales: [null, 2, 2, 2, 2, 2],
  };
}

export function todasLasTablas(r: Resultados): Tabla[] {
  return [
    tablaResumen(r),
    tablaDetallado(r),
    tablaApu(r),
    tablaInsumos(r),
    tablaGG(r),
    tablaPolinomica(r),
    tablaFlete(r),
    tablaMetrados(r),
    tablaPrograma(r),
    tablaValorizado(r),
    tablaAdquisiciones(r),
    tablaEquipos(r),
    tablaPersonal(r),
    tablaDesembolsos(r),
  ];
}
