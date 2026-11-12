// Excel del expediente: hoja Datos (parámetros con nombre que usan las fórmulas de las demás hojas).
import { datosCabecera } from '../../engine/cabecera';
import { isoAFecha } from '../../engine/util';
import { AREAS_GEOGRAFICAS } from '../../data/iu';
import { AZUL, F_MONEDA, F_PCT, F_FECHA, Valor, Estilo, Hoja, Ctx, tituloHoja, configurarImpresion } from './comun';

export function hojaDatos(ctx: Ctx) {
  const { r, wb } = ctx;
  const p = r.proyecto;
  const m = p.meta;
  const c = datosCabecera(p);
  const h = new Hoja(wb, 'Datos');
  h.anchos([44, 70, 16, 16]);
  tituloHoja(h, ctx, 'Datos generales del proyecto', 3);
  let f = 5;
  const sec = (t: string) => {
    h.v(f, 1, t, { negrita: true, color: 'FFFFFFFF', fondo: AZUL });
    h.v(f, 2, '', { fondo: AZUL });
    f++;
  };
  const fila = (clave: string, etq: string, valor: Valor, e: Estilo = {}, nombre?: string) => {
    h.v(f, 1, etq, { borde: 'hair' });
    h.dato(f, 2, valor, { borde: 'hair', h: 'left', ...e });
    ctx.datos[clave] = h.ref(f, 2);
    if (nombre) wb.definedNames.add(`'Datos'!$B$${f}`, nombre);
    f++;
  };
  sec('Proyecto');
  fila('proyecto', 'Nombre del proyecto', m.nombre, { ajustar: true });
  fila('codigo', 'Código del proyecto', m.codigo);
  fila('descripcion', 'Descripción', m.descripcion, { ajustar: true });
  fila('ubicacion', 'Ubicación', c.ubicacion, { ajustar: true });
  fila('area', 'Área geográfica (índices unificados INEI)', `${m.areaGeografica} – ${AREAS_GEOGRAFICAS[m.areaGeografica] ?? ''}`);
  fila('fecha', 'Fecha del proyecto', isoAFecha(m.fecha || m.fechaBase), { fmt: F_FECHA });
  fila('fechaBase', 'Fecha de determinación del presupuesto (precios)', isoAFecha(m.fechaBase), { fmt: F_FECHA });
  fila('modalidad', 'Modalidad', m.modo === 'publico' ? 'Expediente técnico de obra pública' : 'Cotización privada');
  fila('sistema', 'Sistema de contratación', m.sistemaContratacion);
  fila('moneda', 'Moneda', `${c.monedaNombre} (${m.moneda})`);
  fila('unidades', 'Sistema de unidades', m.unidadMedida);
  sec('Participantes');
  fila('cliente', 'Cliente', c.cliente);
  fila('propietario', 'Propietario / cliente final', c.propietario);
  fila('proyectista', 'Proyectista / consultor', c.proyectista);
  fila('elaboro', 'Elaborado por', [p.responsables.elaboro.nombre, p.responsables.elaboro.cargo, p.responsables.elaboro.colegiatura].filter(Boolean).join(' · '));
  fila('reviso', 'Revisado por', [p.responsables.reviso.nombre, p.responsables.reviso.cargo, p.responsables.reviso.colegiatura].filter(Boolean).join(' · '));
  fila('aprobo', 'Aprobado por', [p.responsables.aprobo.nombre, p.responsables.aprobo.cargo, p.responsables.aprobo.colegiatura].filter(Boolean).join(' · '));
  fila('docCodigo', 'Código de documento / revisión', `${c.codigoDocumento} · Rev. ${c.revision} · ${c.estado}`);
  sec('Parámetros de cálculo (editables)');
  fila('jornada', 'Jornada de trabajo (horas por día)', m.jornadaHoras, { fmt: '0.00' }, 'JORNADA');
  fila('utilidad', 'Utilidad (% del costo directo)', m.utilidadPct / 100, { fmt: F_PCT }, 'UTILIDAD');
  fila('igv', 'IGV', m.igvPct / 100, { fmt: F_PCT }, 'IGV');
  fila('incluirIgv', 'Incluir IGV en el total (1 = sí, 0 = no)', m.incluirIgv === false ? 0 : 1, { fmt: '0' }, 'INCLUIR_IGV');
  fila('fechaInicio', 'Fecha de inicio de obra', isoAFecha(m.fechaInicio), { fmt: F_FECHA }, 'FECHA_INICIO');
  const lab = new Set(m.diasLaborables.length ? m.diasLaborables : [1, 2, 3, 4, 5, 6]);
  fila('diasNoLab', 'Días no laborables (lun → dom; 1 = no laborable)', [1, 2, 3, 4, 5, 6, 0].map((d) => (lab.has(d) ? '0' : '1')).join(''), {}, 'DIAS_NO_LAB');
  // el plazo sale del cronograma: la fórmula se escribe al armar la hoja Cronograma
  ctx.filaPlazo = f;
  fila('plazoDias', 'Plazo de ejecución (días calendario, del cronograma)', r.programa.plazoDias, { fmt: '0' }, 'PLAZO_DIAS');
  h.v(f, 1, 'Plazo de ejecución (meses de 30 días)', { borde: 'hair' });
  h.fx(f, 2, `=ROUND(PLAZO_DIAS/30,2)`, r.programa.plazoMeses, { fmt: '0.00', borde: 'hair', h: 'left' });
  wb.definedNames.add(`'Datos'!$B$${f}`, 'PLAZO_MESES');
  ctx.datos.plazoMeses = h.ref(f, 2);
  f++;
  fila('adelDir', 'Adelanto directo', m.adelantoDirectoPct / 100, { fmt: F_PCT }, 'ADELANTO_DIRECTO');
  fila('adelMat', 'Adelanto de materiales', m.adelantoMaterialesPct / 100, { fmt: F_PCT }, 'ADELANTO_MATERIALES');
  fila('flete', 'Tarifa de flete (por tonelada)', m.fleteTarifaTon, { fmt: F_MONEDA }, 'TARIFA_FLETE');
  sec('Feriados (días no laborables adicionales)');
  const fer = [...m.feriados].sort();
  const nFer = Math.max(8, fer.length + 4);
  const f1 = f;
  for (let i = 0; i < nFer; i++) {
    h.v(f, 1, i === 0 ? 'Fechas (una por celda; se pueden agregar)' : '', { borde: 'hair', tam: 7.5 });
    h.dato(f, 2, fer[i] ? isoAFecha(fer[i]) : null, { fmt: F_FECHA, borde: 'hair', h: 'left' });
    f++;
  }
  wb.definedNames.add(`'Datos'!$B$${f1}:$B$${f - 1}`, 'FERIADOS');
  f++;
  h.v(f++, 1, 'Cómo usar este libro', { negrita: true, color: AZUL });
  for (const t of [
    'Texto azul: datos que puede modificar (metrados, rendimientos, cuadrillas, cantidades, precios, porcentajes y parámetros).',
    'Texto negro: fórmulas. Texto verde: vínculos a otra hoja. No sobrescriba las fórmulas.',
    'Al cambiar un dato se recalculan APU, presupuesto, gastos generales, fórmula polinómica, resúmenes, cronogramas y controles.',
    'El cronograma también es de fórmulas: duración = metrado ÷ (rendimiento × cuadrillas); inicio y fin salen de las predecesoras, la fecha de inicio, los días no laborables y los feriados (ruta crítica incluida). De ahí se calculan el plazo, los gastos generales ligados al plazo, la distribución por periodos, el valorizado, los calendarios y los desembolsos.',
    'Las predecesoras y la cantidad de periodos se fijan al exportar; si el plazo crece, lo que exceda se acumula en el último periodo.',
  ]) {
    h.ws.mergeCells(f, 1, f, 2);
    h.v(f++, 1, t, { ajustar: true, tam: 8 });
  }
  configurarImpresion(h, ctx, 4, false);
  ctx.hDatos = h;
  return h;
}

// ------------------------------------------------------------ Insumos
