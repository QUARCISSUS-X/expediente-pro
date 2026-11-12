// Comandos de consola del banco de datos: expediente banco resumen|inicial|importar|exportar|enviar|actualizar-precios.
// El banco vive en un archivo .epdb (en la consola no hay almacén del navegador).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  aplicarPrecios, type Banco, bancoDesdeProyecto, bancoInicial, compararBancos, compararPrecios, type Decision, type FuentePrecio, fusionarBancos, resumenBanco, TABLAS,
} from '../src/engine/banco';
import { calcularTodo } from '../src/engine/index';
import type { Proyecto } from '../src/engine/types';
import { fmt } from '../src/engine/util';
import { escribirEpdb, exportarBancoCsv, exportarBancoXlsx, leerArchivoBanco, leerEpdb } from '../src/io/banco';
import { conEsquema } from '../src/io/migrar';

type Opt = (n: string) => string | undefined;
type Flag = (n: string) => boolean;

export const AYUDA_BANCO = `  expediente banco resumen <banco.epdb>
  expediente banco inicial [--salida banco.epdb]                (catálogo y biblioteca del programa)
  expediente banco importar <archivo…> --banco banco.epdb [--fecha aaaa-mm-dd] [--lugar Lima] [--fuente revista|cotizacion|proveedor|proyecto|otro]
                            [--referencia texto] [--regla conservar|reemplazar]   (.epdb, .xlsx, .csv, .expediente.json; sin --regla gana lo más reciente)
  expediente banco exportar <banco.epdb> --formato xlsx|csv|epdb --salida ruta
  expediente banco enviar <proyecto> --banco banco.epdb [--lugar] [--fecha]     (insumos, precios y análisis del proyecto al banco)
  expediente banco actualizar-precios <proyecto> --banco banco.epdb [--fecha] [--lugar] [--salida proyecto.json]`;

const hoy = () => new Date().toISOString().slice(0, 10);

async function leerBancoArchivo(ruta: string | undefined, crear = false): Promise<Banco> {
  if (!ruta) throw new Error('Indique el banco con --banco archivo.epdb');
  if (!existsSync(resolve(ruta))) {
    if (crear) return bancoInicial();
    throw new Error(`No existe ${ruta}. Cree uno con: expediente banco inicial --salida ${ruta}`);
  }
  return (await leerEpdb(new Uint8Array(readFileSync(resolve(ruta))))).banco;
}

function imprimir(b: Banco, titulo: string) {
  const c = resumenBanco(b);
  console.log(`\n${titulo}`);
  for (const t of TABLAS) console.log(`  ${t.nombre.padEnd(12)} ${String(c[t.id]).padStart(6)}`);
  const lugares = [...new Set(b.precios.map((p) => p.lugar).filter(Boolean))];
  const fechas = b.precios.map((p) => p.fecha).sort();
  if (fechas.length) console.log(`  Precios del ${fechas[0]} al ${fechas[fechas.length - 1]} · lugares: ${lugares.join(', ') || '—'}`);
}

/** Fusiona en el banco y lo guarda; informa nuevos, iguales y conflictos. */
async function fusionarYGuardar(rutaBanco: string, entrante: Banco, origen: string, regla?: Decision) {
  const actual = await leerBancoArchivo(rutaBanco, true);
  const c = compararBancos(actual, entrante);
  const decisiones = regla ? Object.fromEntries(c.filas.filter((f) => f.estado === 'conflicto').map((f) => [`${f.tabla}:${f.clave}`, regla])) : {};
  const nuevo = fusionarBancos(actual, c, decisiones);
  if (existsSync(resolve(rutaBanco))) writeFileSync(resolve(`${rutaBanco}.anterior`), readFileSync(resolve(rutaBanco))); // punto de restauración
  writeFileSync(resolve(rutaBanco), await escribirEpdb({ banco: nuevo }));
  console.log(`${origen}: ${c.conteo.nuevo} nuevos · ${c.conteo.igual} iguales · ${c.conteo.conflicto} en conflicto (${regla ?? 'gana lo más reciente'})`);
  for (const f of c.filas.filter((x) => x.estado === 'conflicto').slice(0, 10)) console.log(`  conflicto ${f.tabla}: ${f.clave} → ${decisiones[`${f.tabla}:${f.clave}`] ?? f.sugerida}`);
  imprimir(nuevo, `Banco guardado en ${rutaBanco}${existsSync(resolve(`${rutaBanco}.anterior`)) ? ` (el anterior quedó en ${rutaBanco}.anterior)` : ''}`);
}

export async function comandoBanco(args: string[], opt: Opt, flag: Flag, cargar: (ruta: string) => Promise<Proyecto>): Promise<void> {
  const sub = args[1];
  const archivos = args.slice(2).filter((a, i, l) => !a.startsWith('--') && !(i > 0 && l[i - 1].startsWith('--')));
  const regla = opt('--regla') as Decision | undefined;
  if (regla && !['conservar', 'reemplazar'].includes(regla)) throw new Error('--regla debe ser conservar o reemplazar.');
  switch (sub) {
    case 'resumen': {
      if (!archivos[0]) throw new Error('Indique el banco: expediente banco resumen banco.epdb');
      const c = await leerEpdb(new Uint8Array(readFileSync(resolve(archivos[0]))));
      imprimir(c.banco, `${basename(archivos[0])} · exportado el ${c.manifiesto.fecha.slice(0, 10)} · sumas de comprobación correctas${c.proyectos ? ` · respaldo con ${c.proyectos.length} proyecto(s)` : ''}`);
      return;
    }
    case 'inicial': {
      const ruta = opt('--salida') ?? 'banco.epdb';
      writeFileSync(resolve(ruta), await escribirEpdb({ banco: bancoInicial() }));
      imprimir(bancoInicial(), `Banco inicial: ${ruta}`);
      return;
    }
    case 'importar': {
      if (!archivos.length) throw new Error('Indique los archivos a importar.');
      const actual = await leerBancoArchivo(opt('--banco') ?? 'banco.epdb', true);
      const o = { fecha: opt('--fecha') ?? hoy(), lugar: opt('--lugar') ?? 'Lima', fuente: (opt('--fuente') ?? 'revista') as FuentePrecio, referencia: opt('--referencia') ?? '', insumos: actual.insumos };
      for (const a of archivos) {
        const r = await leerArchivoBanco({ nombre: basename(a), datos: new Uint8Array(readFileSync(resolve(a))) }, { ...o, referencia: o.referencia || basename(a).replace(/\.[^.]+$/, '') });
        for (const x of r.avisos) console.warn(`  aviso: ${x}`);
        await fusionarYGuardar(opt('--banco') ?? 'banco.epdb', r.banco, r.origen, regla);
      }
      return;
    }
    case 'exportar': {
      const b = await leerBancoArchivo(archivos[0]);
      const formato = opt('--formato') ?? 'xlsx';
      const salida = opt('--salida') ?? (formato === 'csv' ? 'banco-csv' : `banco.${formato}`);
      if (formato === 'xlsx') writeFileSync(resolve(salida), await exportarBancoXlsx(b));
      else if (formato === 'epdb') writeFileSync(resolve(salida), await escribirEpdb({ banco: b }));
      else if (formato === 'csv') {
        mkdirSync(resolve(salida), { recursive: true });
        for (const c of exportarBancoCsv(b)) writeFileSync(join(resolve(salida), c.nombre), c.texto);
      } else throw new Error('--formato debe ser xlsx, csv o epdb.');
      console.log(`Banco exportado: ${salida}`);
      return;
    }
    case 'enviar': {
      if (!archivos[0]) throw new Error('Indique el proyecto.');
      const p = await cargar(archivos[0]);
      const b = bancoDesdeProyecto(p, { lugar: opt('--lugar') ?? p.meta.departamento ?? '', fecha: opt('--fecha') ?? p.meta.fechaBase ?? hoy(), referencia: p.meta.nombre || basename(archivos[0]) });
      await fusionarYGuardar(opt('--banco') ?? 'banco.epdb', b, `Proyecto ${p.meta.nombre}`, regla);
      return;
    }
    case 'actualizar-precios': {
      if (!archivos[0]) throw new Error('Indique el proyecto.');
      const p = await cargar(archivos[0]);
      const b = await leerBancoArchivo(opt('--banco') ?? 'banco.epdb');
      const r0 = calcularTodo(p);
      const fecha = opt('--fecha') ?? p.meta.fechaBase ?? hoy();
      const lugar = opt('--lugar') ?? p.meta.departamento ?? '';
      const dif = compararPrecios(p, new Map(r0.insumos.items.map((x) => [x.insumo.codigo, x.cantidad])), b, fecha, lugar);
      if (!dif.length) return void console.log(`Los precios ya coinciden con el banco al ${fecha}${lugar ? ` en ${lugar}` : ''}.`);
      console.log(`\n${dif.length} precio(s) distintos al ${fecha}${lugar ? ` en ${lugar}` : ''}:`);
      for (const d of dif.slice(0, 40)) console.log(`  ${d.codigo.padEnd(8)} ${d.descripcion.slice(0, 40).padEnd(40)} ${fmt(d.actual).padStart(10)} → ${fmt(d.banco).padStart(10)}  efecto ${fmt(d.efecto).padStart(12)}`);
      aplicarPrecios(p, dif);
      const r = calcularTodo(p);
      console.log(`\nCosto directo: ${p.meta.moneda} ${fmt(r0.pie.costoDirecto)} → ${fmt(r.pie.costoDirecto)} · Total: ${fmt(r0.pie.total)} → ${fmt(r.pie.total)}`);
      const salida = opt('--salida') ?? archivos[0].replace(/(\.expediente)?\.json$/i, '') + '.precios.expediente.json';
      writeFileSync(resolve(salida), JSON.stringify(conEsquema(p), null, 2));
      console.log(`Proyecto actualizado: ${salida}`);
      return;
    }
    default:
      console.log(`Banco de datos:\n${AYUDA_BANCO}`);
      void flag;
  }
}
