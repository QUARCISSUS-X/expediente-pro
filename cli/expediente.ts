// Línea de comandos de Expediente Pro.
//   expediente generar <proyecto.expediente.json | plantilla.xlsx> [--salida carpeta] [--zip]
//   expediente validar <archivo>
//   expediente resumen <archivo>
//   expediente informe <archivo> [--salida carpeta]
//   expediente integridad <archivo> [--reparar] [--salida proyecto.json]
//   expediente plantilla [--salida archivo.xlsx] [--desde proyecto.json]
//   expediente ejemplo [--salida archivo.json]
//   expediente cargar <proyecto.exp.txt> [--salida proyecto.json] [--generar carpeta] [--zip]   (formato compacto)
//   expediente compacto <proyecto.json | .xlsx> [--salida proyecto.exp.txt]
//   expediente catalogo [--desde proyecto]
// expediente importar <ppto.xlsx> [metrados.xlsx] [cronograma.xml] [eett.docx] [--config datos.json] [--salida proyecto.json] [--generar carpeta]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { proyectoEjemplo, proyectoEnBlanco } from '../src/data/proyectos';
import { calcularTodo } from '../src/engine/index';
import type { Proyecto } from '../src/engine/types';
import { fmt } from '../src/engine/util';
import { archivoEjecutivo, archivoGerencial, empaquetarZip, nombreBase } from '../src/export/paquete';
import { generarTodos } from '../src/export/registro';
import { analizar } from '../src/engine/analisis';
import { repararIntegridad, resumenIntegridad, revisarIntegridad } from '../src/engine/integridad';
import { renderPdfNode } from '../src/export/render-node';
import { exportarPlantilla, importarPlantilla } from '../src/io/plantilla';
import { conEsquema, esSoloLectura, migrarProyecto } from '../src/io/migrar';
import { leerJson } from '../src/io/estructura';
import { importarExpediente } from '../src/io/importarExpediente';
import { catalogoCompacto, escribirCompacto, leerCompacto } from '../src/io/compacto';
import type { Logo } from '../src/engine/types';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (n: string) => args.includes(n);

const esCompacto = (ruta: string) => /\.(txt|exp)$/i.test(ruta);

function cargarCompacto(ruta: string): Proyecto {
  const { proyecto, avisos, imagenes } = leerCompacto(readFileSync(resolve(ruta), 'utf8'));
  for (const a of avisos) console.warn('  aviso:', a);
  for (const im of imagenes) {
    const partes = im.ruta.split('.');
    let obj = proyecto as unknown as Record<string, unknown>;
    for (const k of partes.slice(0, -1)) obj = (obj[k] ?? {}) as Record<string, unknown>;
    try { obj[partes[partes.length - 1]] = logoDesdeArchivo(im.archivo, dirname(resolve(ruta))); }
    catch (e) { console.warn(`  aviso: imagen ${im.archivo}: ${(e as Error).message}`); }
  }
  return proyecto;
}

async function cargar(ruta: string): Promise<Proyecto> {
  if (esCompacto(ruta)) return cargarCompacto(ruta);
  const datos = readFileSync(resolve(ruta));
  if (/\.xlsx$/i.test(ruta)) {
    const { proyecto, avisos } = await importarPlantilla(new Uint8Array(datos));
    for (const a of avisos) console.warn('  aviso:', a);
    return proyecto;
  }
  const p = migrarProyecto(leerJson(datos.toString('utf8'), basename(ruta)));
  if (esSoloLectura(p)) console.warn(`  aviso: ${basename(ruta)} lo guardó una versión más nueva del programa (esquema ${p.esquema}); se lee, pero conviene actualizar.`);
  return p;
}

function imprimirResumen(p: Proyecto) {
  const r = calcularTodo(p);
  const m = p.meta;
  console.log(`\n${m.nombre}`);
  console.log(`  Modalidad: ${m.modo === 'publico' ? 'expediente de obra pública' : 'cotización privada'}`);
  console.log(`  Partidas: ${r.hojas.length} · Insumos usados: ${r.insumos.items.length}`);
  console.log(`  Costo directo:     ${m.moneda} ${fmt(r.pie.costoDirecto).padStart(16)}`);
  console.log(`  Gastos generales:  ${m.moneda} ${fmt(r.pie.gg).padStart(16)}  (${fmt(r.pie.ggPct)} %)`);
  console.log(`  Utilidad:          ${m.moneda} ${fmt(r.pie.utilidad).padStart(16)}`);
  console.log(`  IGV:               ${m.moneda} ${fmt(r.pie.igv).padStart(16)}`);
  console.log(`  TOTAL:             ${m.moneda} ${fmt(r.pie.total).padStart(16)}`);
  console.log(`  Plazo: ${r.programa.plazoDias} días calendario (${r.programa.inicio} → ${r.programa.fin})`);
  console.log(`  ${r.polinomica.formula}`);
  console.log(`  Validación: ${r.resumenValidacion.ok} conformes · ${r.resumenValidacion.advertencias} advertencias · ${r.resumenValidacion.errores} errores`);
  if (p.bitacora?.length) console.log(`  Bitácora: ${p.bitacora.length} cambio(s); último ${p.bitacora[p.bitacora.length - 1].fecha.slice(0, 10)}: ${p.bitacora[p.bitacora.length - 1].texto}`);
  return r;
}

function imprimirValidacion(p: Proyecto) {
  const r = calcularTodo(p);
  for (const v of r.validacion) {
    const icono = v.estado === 'ok' ? 'OK ' : v.estado === 'error' ? 'ERR' : 'ADV';
    console.log(`[${icono}] ${String(v.regla).padStart(2)} ${v.control}`);
    for (const h of v.hallazgos) console.log(`       - ${h.mensaje}`);
  }
  return r;
}

/** Tamaño de una imagen PNG o JPEG leyendo su cabecera. */
function tamanoImagen(b: Buffer): { ancho: number; alto: number; tipo: 'png' | 'jpeg' } {
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), tipo: 'png' };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    const largo = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7), tipo: 'jpeg' };
    i += 2 + largo;
  }
  throw new Error('Imagen no reconocida (use PNG o JPG).');
}

function logoDesdeArchivo(ruta: string, base: string): Logo {
  const b = readFileSync(resolve(base, ruta));
  const t = tamanoImagen(b);
  return { dataUrl: `data:image/${t.tipo};base64,${b.toString('base64')}`, ancho: t.ancho, alto: t.alto };
}

/** Aplica un archivo de configuración (datos generales, entidades, responsables, documento, textos) sobre el proyecto. */
function aplicarConfig(p: Proyecto, conf: Record<string, unknown>, base: string) {
  const mezclar = (destino: Record<string, unknown>, origen: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(origen)) {
      if (k === 'observacionesAdicionales' && Array.isArray(v)) {
        if (p.origen) p.origen.observaciones.unshift(...(v as NonNullable<Proyecto['origen']>['observaciones']));
        continue;
      }
      if ((k === 'logo' || k === 'imagenPortada') && typeof v === 'string') destino[k] = logoDesdeArchivo(v, base);
      else if (v && typeof v === 'object' && !Array.isArray(v) && destino[k] && typeof destino[k] === 'object') mezclar(destino[k] as Record<string, unknown>, v as Record<string, unknown>);
      else destino[k] = v;
    }
  };
  mezclar(p as unknown as Record<string, unknown>, conf);
}

async function main() {
  switch (cmd) {
    case 'generar': {
      if (!args[1]) throw new Error('Indique el archivo del proyecto (.json o .xlsx).');
      const p = await cargar(args[1]);
      const r = imprimirResumen(p);
      if (r.resumenValidacion.errores > 0 && !flag('--forzar')) {
        imprimirValidacion(p);
        console.error('\nHay errores de consistencia. Corríjalos o use --forzar para generar igual.');
        process.exit(2);
      }
      const salida = resolve(opt('--salida') ?? `${nombreBase(r)}_entregables`);
      mkdirSync(salida, { recursive: true });
      const archivos = await generarTodos(r, renderPdfNode, (paso) => process.stdout.write(`  · ${paso}\n`));
      for (const a of archivos) writeFileSync(join(salida, a.nombre), a.datos);
      if (flag('--zip')) {
        const zip = await empaquetarZip(archivos, nombreBase(r));
        writeFileSync(`${salida}.zip`, zip);
        console.log(`\nZIP: ${salida}.zip`);
      }
      console.log(`\n${archivos.length} archivos en ${salida}`);
      for (const a of archivos) console.log(`  ${a.nombre}  (${(a.datos.length / 1024).toFixed(0)} KB)`);
      break;
    }
    case 'validar': {
      const r = imprimirValidacion(await cargar(args[1]));
      process.exit(r.resumenValidacion.errores ? 2 : 0);
      break;
    }
    case 'resumen':
      imprimirResumen(await cargar(args[1]));
      break;
    case 'informe': {
      // informe ejecutivo (PDF) y reporte gerencial (Excel), sin generar el resto de entregables
      if (!args[1]) throw new Error('Indique el archivo del proyecto.');
      const r = imprimirResumen(await cargar(args[1]));
      const a = analizar(r);
      console.log(`ABC partidas: A=${a.abcPartidas.clases.A.n} B=${a.abcPartidas.clases.B.n} C=${a.abcPartidas.clases.C.n} · ABC insumos: A=${a.abcInsumos.clases.A.n} B=${a.abcInsumos.clases.B.n} C=${a.abcInsumos.clases.C.n}`);
      for (const x of a.alertas) console.log(`  [${x.nivel}] ${x.texto}`);
      const salida = resolve(opt('--salida') ?? '.');
      mkdirSync(salida, { recursive: true });
      for (const ar of [await archivoEjecutivo(r, renderPdfNode), await archivoGerencial(r)]) {
        writeFileSync(join(salida, ar.nombre), ar.datos);
        console.log(`  ${join(salida, ar.nombre)}  (${(ar.datos.length / 1024).toFixed(0)} KB)`);
      }
      break;
    }
    case 'integridad': {
      // revisa datos sueltos, repetidos o dañados; con --reparar escribe el proyecto corregido
      if (!args[1]) throw new Error('Indique el archivo del proyecto.');
      const p = await cargar(args[1]);
      const lista = revisarIntegridad(p);
      const s = resumenIntegridad(lista);
      console.log(lista.length ? `Integridad: ${s.errores} errores, ${s.avisos} avisos (${s.reparables} reparables)` : 'Integridad: sin problemas.');
      for (const x of lista) console.log(`  [${x.nivel}${x.reparable ? ', reparable' : ''}] ${x.mensaje}: ${x.cantidad} (${x.detalle.slice(0, 3).join('; ')})`);
      if (flag('--reparar') && s.reparables) {
        const rep = repararIntegridad(p);
        const ruta = resolve(opt('--salida') ?? args[1].replace(/(\.expediente)?\.\w+$/, '') + '_reparado.expediente.json');
        writeFileSync(ruta, JSON.stringify(conEsquema(rep.proyecto), null, 2));
        console.log(`Reparado: ${ruta} (quedan ${rep.pendientes.length} problemas por corregir a mano)`);
      }
      process.exit(s.errores ? 2 : 0);
      break;
    }
    case 'plantilla': {
      const base = opt('--desde') ? await cargar(opt('--desde')!) : proyectoEnBlanco();
      const ruta = resolve(opt('--salida') ?? 'Plantilla_de_carga.xlsx');
      writeFileSync(ruta, await exportarPlantilla(base));
      console.log(`Plantilla: ${ruta}`);
      break;
    }
    case 'importar': {
      const rutas = args.slice(1).filter((a, i, l) => !a.startsWith('--') && !(l[i - 1] ?? '').startsWith('--'));
      if (!rutas.length) throw new Error('Indique los archivos del expediente (.xlsx del presupuesto, .xlsx de metrados, .xml de MS Project, .docx de EETT).');
      const res = await importarExpediente(rutas.map((r) => ({ nombre: basename(r), datos: new Uint8Array(readFileSync(resolve(r))) })));
      const p = res.proyecto;
      if (opt('--config')) aplicarConfig(p, JSON.parse(readFileSync(resolve(opt('--config')!), 'utf8')), resolve(opt('--config')!, '..'));
      for (const h of res.hojas) console.log(`  leído: ${h}`);
      for (const a of res.avisos) console.log(`  ${a}`);
      const r = imprimirResumen(p);
      const o = res.original;
      console.log(`\n  Original: CD ${fmt(o.costoDirecto ?? 0)} · GG ${fmt(o.gg ?? 0)} · Utilidad ${fmt(o.utilidad ?? 0)} · Subtotal ${fmt(o.subtotal ?? 0)} · Plazo ${o.plazoDias ?? '—'} días`);
      console.log(`  Observaciones del expediente original: ${res.observaciones.length}`);
      const ruta = resolve(opt('--salida') ?? `${nombreBase(r)}.expediente.json`);
      mkdirSync(dirname(ruta), { recursive: true });
      writeFileSync(ruta, JSON.stringify(conEsquema(p), null, 2));
      console.log(`  Proyecto: ${ruta}`);
      if (opt('--generar')) {
        const salida = resolve(opt('--generar')!);
        mkdirSync(salida, { recursive: true });
        const archivos = await generarTodos(r, renderPdfNode, (paso) => process.stdout.write(`  · ${paso}\n`));
        for (const a of archivos) writeFileSync(join(salida, a.nombre), a.datos);
        if (flag('--zip')) writeFileSync(`${salida}.zip`, await empaquetarZip(archivos, nombreBase(r)));
        console.log(`\n${archivos.length} archivos en ${salida}`);
      }
      break;
    }
    case 'cargar': {
      if (!args[1]) throw new Error('Indique el archivo compacto (.exp.txt).');
      const p = cargarCompacto(args[1]);
      if (opt('--config')) aplicarConfig(p, JSON.parse(readFileSync(resolve(opt('--config')!), 'utf8')), resolve(opt('--config')!, '..'));
      const r = imprimirResumen(p);
      const ruta = resolve(opt('--salida') ?? args[1].replace(/(\.exp)?\.txt$|\.exp$/i, '') + '.expediente.json');
      mkdirSync(dirname(ruta), { recursive: true });
      writeFileSync(ruta, JSON.stringify(conEsquema(p), null, 2));
      console.log(`  Proyecto: ${ruta}`);
      if (r.resumenValidacion.errores > 0) imprimirValidacion(p);
      if (opt('--generar')) {
        if (r.resumenValidacion.errores > 0 && !flag('--forzar')) { console.error('\nHay errores de consistencia: no se generan entregables (use --forzar).'); process.exit(2); }
        const salida = resolve(opt('--generar')!);
        mkdirSync(salida, { recursive: true });
        const archivos = await generarTodos(r, renderPdfNode, () => undefined);
        for (const a of archivos) writeFileSync(join(salida, a.nombre), a.datos);
        if (flag('--zip')) writeFileSync(`${salida}.zip`, await empaquetarZip(archivos, nombreBase(r)));
        console.log(`  ${archivos.length} archivos en ${salida}${flag('--zip') ? ` (+ ${salida}.zip)` : ''}`);
      }
      break;
    }
    case 'compacto': {
      if (!args[1]) throw new Error('Indique el proyecto (.json o .xlsx).');
      const ruta = resolve(opt('--salida') ?? args[1].replace(/(\.expediente)?\.(json|xlsx)$/i, '') + '.exp.txt');
      writeFileSync(ruta, escribirCompacto(await cargar(args[1])));
      console.log(`Formato compacto: ${ruta}`);
      break;
    }
    case 'catalogo':
      process.stdout.write(catalogoCompacto(opt('--desde') ? await cargar(opt('--desde')!) : undefined));
      break;
    case 'ejemplo': {
      const ruta = resolve(opt('--salida') ?? 'Proyecto_ejemplo.expediente.json');
      writeFileSync(ruta, JSON.stringify(conEsquema(proyectoEjemplo()), null, 2));
      console.log(`Proyecto de ejemplo: ${ruta}`);
      break;
    }
    default:
      console.log(`Expediente Pro – línea de comandos

Uso:
  expediente generar <proyecto.expediente.json | plantilla.xlsx | proyecto.exp.txt> [--salida carpeta] [--zip] [--forzar]
  expediente validar <archivo>
  expediente resumen <archivo>
  expediente informe <archivo> [--salida carpeta]            (informe ejecutivo PDF y reporte gerencial Excel)
  expediente integridad <archivo> [--reparar] [--salida proyecto.json]
  expediente plantilla [--salida archivo.xlsx] [--desde proyecto.json]
  expediente ejemplo [--salida archivo.json]
  expediente cargar <proyecto.exp.txt> [--config datos.json] [--salida proyecto.json] [--generar carpeta] [--zip] [--forzar]
  expediente compacto <proyecto.json | plantilla.xlsx> [--salida proyecto.exp.txt]
  expediente catalogo [--desde proyecto]
  expediente cargar <proyecto.exp.txt> [--config datos.json] [--salida proyecto.json] [--generar carpeta] [--zip] [--forzar]
  expediente compacto <proyecto.json | plantilla.xlsx> [--salida proyecto.exp.txt]
  expediente catalogo [--desde proyecto]
  expediente importar <ppto.xlsx> [metrados.xlsx] [cronograma.xml] [eett.docx] [--config datos.json] [--salida proyecto.json] [--generar carpeta] [--zip]`);
      void basename;
  }
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
