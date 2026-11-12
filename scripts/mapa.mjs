// Genera docs/MAPA.md: qué hace cada archivo y en qué línea está cada función exportada.
// Sirve para ubicar un cambio sin abrir archivos completos.   Uso: npm run mapa
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CARPETAS = ['src/engine', 'src/engine/control', 'src/export', 'src/export/xlsx', 'src/io', 'src/io/migraciones', 'src/data', 'src/ui', 'src/ui/modulos', 'cli', 'electron', 'scripts', 'tests'];
const TITULOS = { 'src/engine': 'Motor de cálculo', 'src/engine/control': 'Motor: control de obra', 'src/export': 'Exportadores', 'src/export/xlsx': 'Exportador: Excel del expediente (una hoja o grupo de hojas por archivo)', 'src/io': 'Importación y formatos', 'src/io/migraciones': 'Migraciones numeradas del archivo de proyecto', 'src/data': 'Datos base', 'src/ui': 'Interfaz', 'src/ui/modulos': 'Interfaz: módulos (una pantalla por archivo)', cli: 'Línea de comandos', electron: 'App de escritorio', scripts: 'Herramientas', tests: 'Pruebas' };
const SIN_DETALLE = /logosEjemplo|catalogo\.ts|biblioteca\.ts|plantillasEett|\.test\.ts$/;

let out = '# Mapa del código\n\nGenerado con `npm run mapa` (no editar a mano). Cada símbolo indica su línea: abra solo ese tramo del archivo.\n';
for (const dir of CARPETAS) {
  if (!existsSync(dir)) continue;
  const archivos = readdirSync(dir).filter((f) => /\.(ts|tsx|cjs|mjs)$/.test(f) && statSync(join(dir, f)).isFile()).sort();
  if (!archivos.length) continue;
  out += `\n## ${TITULOS[dir]} — \`${dir}/\`\n`;
  for (const f of archivos) {
    const ruta = `${dir}/${f}`; // siempre con / (también en Windows)
    const lineas = readFileSync(ruta, 'utf8').split('\n');
    const primera = lineas.find((l) => l.trim()) ?? '';
    const desc = primera.startsWith('//') ? primera.replace(/^\/\/\s*/, '') : '';
    out += `\n### \`${ruta}\` · ${lineas.length} líneas\n${desc ? desc + '\n' : ''}`;
    if (SIN_DETALLE.test(f)) continue;
    const simbolos = [];
    lineas.forEach((l, i) => {
      const m = l.match(/^export (?:default )?(?:async )?(function|const|class|interface|type) (\w+)/) ?? (/\.(tsx|cjs)$/.test(f) ? l.match(/^(?:async )?(function) (\w+)/) : null);
      if (m) simbolos.push(`${m[2]}${m[1] === 'interface' || m[1] === 'type' ? 'ᵗ' : ''}:${i + 1}`);
    });
    if (simbolos.length) out += simbolos.join(' · ') + '\n';
  }
}
writeFileSync('docs/MAPA.md', out);
console.log(`docs/MAPA.md: ${out.split('\n').length} líneas`);
