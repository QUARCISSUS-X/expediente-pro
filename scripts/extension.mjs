// Arma la extensión de Firefox y de Chrome/Edge a partir de la misma interfaz web.
// Uso: npm run extension  →  release/Expediente-Pro-Extension-{firefox,chrome}-<versión>.zip
// y las carpetas sin comprimir en dist-ext-firefox/ y dist-ext-chrome/ (para cargarlas en modo desarrollador).
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';
import { build } from 'vite';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const base = JSON.parse(readFileSync('extension/manifest.base.json', 'utf8'));

// Lo propio de cada navegador. Firefox: identificador fijo (lo pide la firma) y declaración de que no recoge datos.
const NAVEGADORES = {
  firefox: {
    background: { scripts: ['fondo.js'] },
    browser_specific_settings: {
      gecko: { id: 'expediente-pro@quarcissus-x', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } },
    },
  },
  chrome: {
    background: { service_worker: 'fondo.js' },
    minimum_chrome_version: '111',
  },
};

await build({ mode: 'extension', logLevel: 'warn' });

const archivos = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? archivos(join(dir, f)) : [join(dir, f)]));

mkdirSync('release', { recursive: true });
for (const [nav, propio] of Object.entries(NAVEGADORES)) {
  const dir = `dist-ext-${nav}`;
  rmSync(dir, { recursive: true, force: true });
  cpSync('dist-ext', dir, { recursive: true });
  cpSync('extension/iconos', join(dir, 'iconos'), { recursive: true });
  cpSync('extension/fondo.js', join(dir, 'fondo.js'));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ ...base, version, ...propio }, null, 2));
  const zip = new JSZip();
  for (const f of archivos(dir)) zip.file(relative(dir, f).replaceAll('\\', '/'), readFileSync(f));
  const salida = `release/Expediente-Pro-Extension-${nav}-${version}.zip`;
  writeFileSync(salida, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
  console.log(`${salida}  (${(statSync(salida).size / 1048576).toFixed(1)} MB)`);
}
