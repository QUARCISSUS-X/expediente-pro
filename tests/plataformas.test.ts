// Versión 2.12 (etapa 6 del plan 3.0): archivos vinculados, doble clic, actualización automática, web instalable (PWA),
// aviso de respaldo de la extensión, sincronización del banco por archivo y comandos comparar e informe-obra.
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proyectoEjemplo } from '../src/data/proyectos';
import { compararPresupuestos } from '../src/engine/escenarios';
import { calcularTodo } from '../src/engine/index';
import { tablasComparacion } from '../src/export/comparacion';
import { ESQUEMA_ACTUAL } from '../src/io/migrar';
import { escribirEpdb, leerArchivoBanco } from '../src/io/banco';
import { bancoInicial } from '../src/engine/banco';
import { proyectoDeArchivo, textoProyecto } from '../src/ui/useVinculo';

const leer = (f: string) => readFileSync(f, 'utf8');

describe('archivo vinculado', () => {
  it('el proyecto escrito al archivo se vuelve a abrir igual (con su esquema)', () => {
    const p = proyectoEjemplo();
    const texto = textoProyecto(p);
    expect(JSON.parse(texto).esquema).toBe(ESQUEMA_ACTUAL);
    const q = proyectoDeArchivo(new TextEncoder().encode(texto), 'obra.expediente');
    expect(calcularTodo(q).pie.total).toBe(calcularTodo(p).pie.total);
  });

  it('el .epdb compartido se lee para la pantalla de fusión', async () => {
    const datos = await escribirEpdb({ banco: bancoInicial() });
    const r = await leerArchivoBanco({ nombre: 'Banco_compartido.epdb', datos }, { fecha: '2026-11-15', lugar: '', fuente: 'otro', referencia: '' });
    expect(r.banco.insumos.length).toBe(bancoInicial().insumos.length);
  });

  it('la app de escritorio solo lee y escribe rutas autorizadas y asocia .expediente y .epdb', () => {
    const main = leer('electron/main.cjs');
    for (const canal of ['ep:archivo-guardar-como', 'ep:archivo-abrir', 'ep:archivo-leer', 'ep:archivo-escribir', 'ep:archivo-info']) expect(main).toContain(`'${canal}'`);
    expect(main).toMatch(/archivo-escribir[\s\S]{0,120}permitida\(ruta\)/);
    expect(main).toContain("app.on('open-file'");
    expect(main).toContain('archivosDeArgumentos(argv)');
    const pre = leer('electron/preload-app.cjs');
    expect(pre).toContain('archivos:');
    const pkg = JSON.parse(leer('package.json'));
    expect(pkg.build.fileAssociations.map((x: { ext: string }) => x.ext).sort()).toEqual(['epdb', 'expediente']);
  });
});

describe('actualización automática', () => {
  it('consulta el último release solo en la app instalada y se puede apagar', () => {
    const main = leer('electron/main.cjs');
    expect(main).toContain('releases/latest');
    expect(main).toMatch(/app\.isPackaged && leerPreferencias\(\)\.actualizarAlIniciar !== false/);
    expect(main).toContain("'Buscar actualizaciones al iniciar'");
    // la comparación de versiones del proceso principal
    const src = main.slice(main.indexOf('function compararVersiones'), main.indexOf('let buscandoActualizacion'));
    const comparar = runInNewContext(`${src}; compararVersiones`) as (a: string, b: string) => number;
    expect(comparar('2.12.0', '2.11.9')).toBeGreaterThan(0);
    expect(comparar('v3.0.0', '2.12.0')).toBeGreaterThan(0);
    expect(comparar('2.10.0', '2.9.0')).toBeGreaterThan(0);
    expect(comparar('2.12.0', '2.12.0')).toBe(0);
  });
});

describe('web instalable (PWA)', () => {
  it('manifiesto, service worker e íconos van en public/ y la página los enlaza', () => {
    const m = JSON.parse(leer('public/manifest.webmanifest'));
    expect(m.display).toBe('standalone');
    for (const i of m.icons) expect(existsSync(`public/${i.src}`)).toBe(true);
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
    expect(m.file_handlers[0].accept['application/zip']).toContain('.epdb');
    const sw = leer('public/sw.js');
    expect(sw).toContain("addEventListener('fetch'");
    expect(leer('index.html')).toContain('rel="manifest"');
    // solo se registra por http(s): ni en la app de escritorio (app://) ni en la extensión
    expect(leer('src/ui/pwa.ts')).toMatch(/https\?/);
  });
});

describe('aviso de respaldo de la extensión', () => {
  afterEach(() => vi.unstubAllGlobals());
  const almacen = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('avisa en la extensión a los 14 días sin respaldo y no en la web', async () => {
    const ls = almacen();
    vi.stubGlobal('localStorage', ls);
    vi.stubGlobal('location', { protocol: 'moz-extension:' });
    const { tocaRecordarRespaldo, posponerRespaldo } = await import('../src/ui/respaldo');
    const hoy = Date.parse('2026-11-15T12:00:00Z');
    expect(tocaRecordarRespaldo(hoy)).toBe(false); // primer uso: empieza a contar
    expect(tocaRecordarRespaldo(hoy + 15 * 86400000)).toBe(true);
    ls.setItem('expediente-pro:ultimo-respaldo', new Date(hoy + 10 * 86400000).toISOString());
    expect(tocaRecordarRespaldo(hoy + 15 * 86400000)).toBe(false);
    expect(tocaRecordarRespaldo(hoy + 30 * 86400000)).toBe(true);
    posponerRespaldo();
    expect(tocaRecordarRespaldo(Date.now() + 2 * 86400000)).toBe(false);
    vi.stubGlobal('location', { protocol: 'https:' });
    expect(tocaRecordarRespaldo(hoy + 90 * 86400000)).toBe(false);
  });
});

describe('línea de comandos', () => {
  it('comparar arma totales, partidas e insumos', () => {
    const a = proyectoEjemplo();
    const b = proyectoEjemplo();
    const m = b.metrados.find((x) => x.largo || x.cantidad || x.veces);
    expect(m).toBeTruthy();
    m!.veces = (m!.veces ?? 1) * 2;
    const c = compararPresupuestos(calcularTodo(a), calcularTodo(b));
    const t = tablasComparacion(c, 'A', 'B');
    expect(t.map((x) => x.hoja)).toEqual(['Totales', 'Partidas', 'Insumos']);
    expect(c.partidas.filter((x) => x.estado === 'cambia').length).toBeGreaterThan(0);
    const dif = c.partidas.reduce((s, x) => s + x.diferencia, 0);
    expect(dif).toBeCloseTo(c.totales[0].diferencia, 1);
  });

  it('la ayuda lista banco, comparar e informe-obra', () => {
    const cli = leer('cli/expediente.ts') + leer('cli/obra.ts');
    for (const k of ["case 'comparar'", "case 'informe-obra'", "case 'banco'", 'expediente informe-obra <proyecto>']) expect(cli).toContain(k);
  });
});
