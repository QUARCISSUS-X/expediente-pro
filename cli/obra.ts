// Comandos de consola de la versión 2.12: comparar dos presupuestos e informe de obra (semanal o mensual).
//   expediente comparar <a> <b> [--excel salida.xlsx]
//   expediente informe-obra <proyecto> [--semanal|--mensual] [--fecha aaaa-mm-dd] [--word] [--salida carpeta]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compararPresupuestos } from '../src/engine/escenarios';
import { calcularTodo } from '../src/engine/index';
import { datosInforme, periodoDe, periodosConAvance, type TipoInforme } from '../src/engine/informe';
import type { Proyecto } from '../src/engine/types';
import { fmt } from '../src/engine/util';
import { tablasComparacion } from '../src/export/comparacion';
import { generarXlsxTablas } from '../src/export/control';
import { informePdf, informeWord, nombreInforme } from '../src/export/informeObra';
import { renderPdfNode } from '../src/export/render-node';

export const AYUDA_OBRA = `  expediente comparar <a> <b> [--excel salida.xlsx]          (totales y partidas que cambian entre dos presupuestos)
  expediente informe-obra <proyecto> [--semanal|--mensual] [--fecha aaaa-mm-dd] [--word] [--salida carpeta]`;

type Opt = (n: string) => string | undefined;
type Flag = (n: string) => boolean;
const signo = (v: number) => (v >= 0 ? '+' : '') + fmt(v);

export async function comandoComparar(args: string[], opt: Opt, cargar: (r: string) => Promise<Proyecto>) {
  if (!args[1] || !args[2]) throw new Error('Indique los dos archivos: expediente comparar <a> <b>');
  const pa = await cargar(args[1]);
  const pb = await cargar(args[2]);
  const c = compararPresupuestos(calcularTodo(pa), calcularTodo(pb));
  console.log(`A: ${pa.meta.nombre}\nB: ${pb.meta.nombre}\n`);
  for (const t of c.totales) console.log(`  ${t.concepto.padEnd(18)} ${fmt(t.a).padStart(16)} ${fmt(t.b).padStart(16)} ${signo(t.diferencia)}`);
  const cambian = c.partidas.filter((x) => x.estado !== 'igual').sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia));
  console.log(`\n${cambian.length} partida(s) distintas de ${c.partidas.length}:`);
  for (const x of cambian.slice(0, 25)) console.log(`  [${x.estado}] ${x.codigo} ${x.descripcion.slice(0, 50)}  ${signo(x.diferencia)}`);
  if (cambian.length > 25) console.log(`  … y ${cambian.length - 25} más (use --excel para verlas todas)`);
  const xl = opt('--excel');
  if (xl) {
    writeFileSync(resolve(xl), await generarXlsxTablas(null, 'Comparación de presupuestos', tablasComparacion(c, pa.meta.nombre || 'A', pb.meta.nombre || 'B')));
    console.log(`\nExcel: ${resolve(xl)}`);
  }
}

export async function comandoInformeObra(args: string[], opt: Opt, flag: Flag, cargar: (r: string) => Promise<Proyecto>) {
  if (!args[1]) throw new Error('Indique el archivo del proyecto.');
  const r = calcularTodo(await cargar(args[1]));
  const tipo: TipoInforme = flag('--semanal') ? 'semanal' : 'mensual';
  const fecha = opt('--fecha');
  const periodo = fecha ? periodoDe(tipo, fecha, r.proyecto.control?.lineaBase?.inicio ?? fecha) : periodosConAvance(r, tipo)[0];
  if (!periodo) throw new Error('El proyecto no tiene cortes de avance: registre el control de obra o indique --fecha.');
  const d = datosInforme(r, periodo);
  const t = d.tablero;
  const p = (v: number | null) => (v === null ? '—' : `${fmt(v)} %`);
  console.log(`Informe ${tipo} · ${periodo.titulo} (${periodo.inicio} a ${periodo.fin})`);
  console.log(`  Avance del periodo ${p(d.avancePeriodoReal)} · acumulado ${p(t.avanceReal)} (programado ${p(t.avanceProgramado)})`);
  console.log(`  SPI ${t.spi === null ? '—' : fmt(t.spi, 3)} · CPI ${t.cpi === null ? '—' : fmt(t.cpi, 3)} · ${d.partidas.length} partidas ejecutadas · ${d.restriccionesAbiertas.length} restricciones abiertas`);
  const salida = resolve(opt('--salida') ?? '.');
  mkdirSync(salida, { recursive: true });
  const archivos: [string, Uint8Array][] = [[nombreInforme(r, d, 'pdf'), await renderPdfNode(informePdf(r, d))]];
  if (flag('--word')) archivos.push([nombreInforme(r, d, 'docx'), await informeWord(r, d)]);
  for (const [n, datos] of archivos) {
    writeFileSync(join(salida, n), datos);
    console.log(`  ${join(salida, n)}  (${(datos.length / 1024).toFixed(0)} KB)`);
  }
  if (d.fotos.length) console.log(`  Nota: las ${d.fotos.length} fotos del periodo viven en el almacén del programa y no salen en la línea de comandos.`);
}
