// Pruebas de extremo a extremo con Playwright sobre dist/index.html (las corre `npm run verificar`).
// Usa el Chromium de Playwright si está instalado; si no, Edge o Chrome del equipo. Sale con código 1 si algo falla.
//   npm run build && npm run e2e
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { proyectoEjemplo } from '../src/data/proyectos';
import type { Proyecto } from '../src/engine/types';

const raiz = resolve(import.meta.dirname, '..');
const html = join(raiz, 'dist', 'index.html');
if (!existsSync(html)) {
  console.error('Falta dist/index.html: ejecute npm run build');
  process.exit(2);
}
const tmp = join(raiz, 'capturas', 'e2e');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

async function abrirNavegador(): Promise<Browser> {
  for (const canal of [undefined, 'msedge', 'chrome'] as const) {
    try {
      return await chromium.launch(canal ? { channel: canal } : {});
    } catch {
      /* se prueba el siguiente */
    }
  }
  throw new Error('No hay navegador para Playwright: ejecute `npx playwright install chromium` o instale Edge o Chrome.');
}

/** Proyecto con `n` partidas (copias del ejemplo con códigos nuevos), para probar tablas largas. */
function proyectoGrande(n: number): Proyecto {
  const p = proyectoEjemplo();
  const hojas = p.partidas.filter((x) => !x.titulo);
  const partidas: Proyecto['partidas'] = [{ id: 't-g', codigo: '01', descripcion: 'PARTIDAS DE PRUEBA', unidad: '', titulo: true }];
  const apus: Proyecto['apus'] = {};
  const metrados: Proyecto['metrados'] = [];
  for (let i = 0; i < n; i++) {
    const h = hojas[i % hojas.length];
    const id = `g-${i}`;
    partidas.push({ ...h, id, codigo: `01.${String(i + 1).padStart(4, '0')}` });
    apus[id] = p.apus[h.id];
    metrados.push({ id: `mg-${i}`, partidaId: id, descripcion: 'Prueba', cantidad: 1 + (i % 7) });
  }
  return { ...p, partidas, apus, metrados, programa: {}, meta: { ...p.meta, nombre: `Proyecto de prueba con ${n} partidas`, codigo: 'E2E-GRANDE' } };
}

const pruebas: [string, (pg: Page) => Promise<void>][] = [];
const prueba = (nombre: string, f: (pg: Page) => Promise<void>) => pruebas.push([nombre, f]);
const exigir = (c: unknown, msj: string) => { if (!c) throw new Error(msj); };

const ir = async (pg: Page, texto: string) => {
  await pg.locator('nav.nav').getByText(texto, { exact: true }).first().click();
  await pg.waitForTimeout(400);
};
const importar = async (pg: Page, ruta: string) => {
  await ir(pg, 'Panel de proyectos');
  const [selector] = await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button', { name: 'Importar expediente' }).click()]);
  await selector.setFiles(ruta);
};

prueba('abre el ejemplo y muestra el presupuesto', async (pg) => {
  await ir(pg, 'Presupuesto, APU y metrados');
  exigir((await pg.locator('table[aria-label="Presupuesto"] tbody tr[data-v]').count()) > 10, 'el presupuesto no tiene filas');
});

prueba('banco: importar una lista con revisión de fusión y actualizar los precios del proyecto', async (pg) => {
  const ruta = join(tmp, 'lista-precios.csv');
  writeFileSync(ruta, ['Código;Descripción;Und;Precio;Fecha', 'MA01;Cemento portland tipo I (42.5 kg);bls;31.40;2026-11-05', 'MA02;Arena gruesa;m3;61.00;2026-11-05', ''].join('\n'));
  await ir(pg, 'Banco de datos');
  await pg.getByRole('tab', { name: /^Insumos \(\d+\)/ }).waitFor();
  await pg.getByRole('button', { name: 'Importar…' }).click();
  const [selector] = await Promise.all([pg.waitForEvent('filechooser'), pg.getByRole('button', { name: 'Elegir archivos' }).click()]);
  await selector.setFiles(ruta);
  await pg.getByText('2 nuevos').waitFor({ timeout: 8000 });
  await pg.getByRole('button', { name: 'Escribir en el banco' }).click();
  await pg.getByText(/Banco actualizado: 2 registro/).waitFor({ timeout: 8000 });
  await ir(pg, 'Relación de insumos');
  await pg.getByRole('button', { name: 'Actualizar precios desde el banco' }).click();
  await pg.locator('.modal input[type="date"]').fill('2026-12-31');
  await pg.locator('.modal select').selectOption('');
  await pg.getByRole('button', { name: 'Aplicar 2 precio(s)' }).click({ timeout: 8000 });
  await pg.getByText(/Se actualizaron 2 precio/).waitFor({ timeout: 5000 });
});

prueba('exportar el ZIP no congela la pantalla', async (pg) => {
  await ir(pg, 'Exportar');
  // latido cada 50 ms: mide el mayor tiempo que la página quedó sin responder
  await pg.evaluate(() => {
    const w = window as unknown as { __bloqueo: number };
    w.__bloqueo = 0;
    let t = performance.now();
    window.setInterval(() => { const n = performance.now(); w.__bloqueo = Math.max(w.__bloqueo, n - t - 50); t = n; }, 50);
  });
  const [descarga] = await Promise.all([pg.waitForEvent('download', { timeout: 180_000 }), pg.getByRole('button', { name: 'Descargar todo (ZIP)' }).click()]);
  const ruta = join(tmp, descarga.suggestedFilename());
  await descarga.saveAs(ruta);
  const bloqueo = await pg.evaluate(() => (window as unknown as { __bloqueo: number }).__bloqueo);
  console.log(`    ZIP ${descarga.suggestedFilename()} · mayor bloqueo de la pantalla: ${Math.round(bloqueo)} ms`);
  exigir(/_Entregables\.zip$/.test(descarga.suggestedFilename()), 'no se descargó el ZIP');
  exigir(bloqueo < 1500, `la pantalla quedó bloqueada ${Math.round(bloqueo)} ms`);
});

prueba('eliminar manda a la papelera y se puede restaurar', async (pg) => {
  await ir(pg, 'Panel de proyectos');
  await pg.getByRole('button', { name: 'Desde el ejemplo' }).click();
  await pg.waitForTimeout(800);
  await ir(pg, 'Panel de proyectos');
  const filas = pg.locator('table[aria-label="Proyectos"] tbody tr');
  const antes = await filas.count();
  await pg.locator('table[aria-label="Proyectos"] tbody tr:not(.seleccionada) button[title="Eliminar"]').first().click();
  await pg.getByRole('button', { name: 'Enviar a la papelera' }).click();
  await pg.waitForTimeout(500);
  exigir((await filas.count()) === antes - 1, 'el proyecto sigue en la lista');
  await pg.getByRole('tab', { name: /Papelera/ }).click();
  await pg.getByRole('button', { name: 'Restaurar', exact: true }).first().click();
  await pg.waitForTimeout(500);
  await pg.getByRole('tab', { name: 'Activos' }).click();
  exigir((await filas.count()) === antes, 'el proyecto no volvió de la papelera');
});

prueba('un archivo truncado da un mensaje claro', async (pg) => {
  const ruta = join(tmp, 'truncado.expediente.json');
  writeFileSync(ruta, JSON.stringify(proyectoEjemplo()).slice(0, 5000));
  await importar(pg, ruta);
  await pg.locator('.toast.error').waitFor({ timeout: 5000 });
  const t = await pg.locator('.toast.error').innerText();
  exigir(/incompleto/.test(t), `mensaje inesperado: ${t}`);
});

prueba('un proyecto de un esquema más nuevo se abre solo para leer', async (pg) => {
  const ruta = join(tmp, 'futuro.expediente.json');
  writeFileSync(ruta, JSON.stringify({ ...proyectoEjemplo(), esquema: 99 }));
  await importar(pg, ruta);
  await pg.getByText(/Solo lectura: este proyecto lo guardó una versión más nueva/).waitFor({ timeout: 8000 });
});

prueba('un presupuesto de 1 500 partidas dibuja solo las filas visibles', async (pg) => {
  const ruta = join(tmp, 'grande.expediente.json');
  writeFileSync(ruta, JSON.stringify(proyectoGrande(1500)));
  await importar(pg, ruta);
  await pg.waitForTimeout(1500);
  await ir(pg, 'Presupuesto, APU y metrados');
  const tabla = pg.locator('table[aria-label="Presupuesto"]');
  const dibujadas = await tabla.locator('tbody tr[data-v]').count();
  exigir(dibujadas > 20 && dibujadas < 250, `se dibujaron ${dibujadas} filas`);
  await pg.locator('.tabla-marco').first().evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await pg.waitForTimeout(300);
  await tabla.locator('td.arbol-codigo', { hasText: '01.1500' }).waitFor({ timeout: 5000 }).catch(() => { throw new Error('la última partida no aparece al bajar'); });
});

(async () => {
  const b = await abrirNavegador();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errores: string[] = [];
  pg.on('pageerror', (e) => errores.push(e.message));
  pg.on('dialog', (d) => void d.accept());
  await pg.goto('file:///' + html.replaceAll('\\', '/'));
  await pg.locator('.app').waitFor({ timeout: 30_000 });
  let fallas = 0;
  for (const [nombre, f] of pruebas) {
    try {
      await f(pg);
      console.log(`✓ ${nombre}`);
    } catch (e) {
      fallas++;
      console.log(`✗ ${nombre}\n    ${(e as Error).message}`);
      await pg.screenshot({ path: join(tmp, `falla-${fallas}.png`), fullPage: true }).catch(() => undefined);
    }
  }
  await b.close();
  if (errores.length) console.log(`\nErrores en la página:\n${errores.join('\n')}`);
  if (fallas || errores.length) process.exit(1);
  console.log(`\n${pruebas.length} pruebas de extremo a extremo sin fallas.`);
})().catch((e) => { console.error(e); process.exit(1); });
