// Prueba en el navegador UN solo módulo (o varios) sin recorrer todo el programa.
// Abre dist/index.html, crea el proyecto de ejemplo, carga los datos de demostración de control,
// entra al módulo, pasa por sus pestañas, guarda capturas en capturas/ e informa los errores de consola.
//
// Uso (después de `npm run build`):
//   node scripts/probar-modulo.cjs "Kanban de materiales"
//   node scripts/probar-modulo.cjs "Plan de calidad ISO 9001" "Last Planner"
//   node scripts/probar-modulo.cjs --todos            # todos los módulos de control
// El nombre es el texto del menú lateral. Sale con código 1 si hubo errores de consola.
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/npm-tools/node_modules/playwright'); }

const CONTROL = ['Control y valor ganado', 'Last Planner', 'Ejecución lean', 'Calidad Six Sigma', 'Riesgo de plazo y costo', 'Cadena crítica', 'Kanban de materiales', 'Plan de calidad ISO 9001', 'Ingeniería de valor y costo meta'];
const args = process.argv.slice(2);
const modulos = args.includes('--todos') ? CONTROL : args;
if (!modulos.length) { console.error('Indique el módulo: node scripts/probar-modulo.cjs "Kanban de materiales"'); process.exit(2); }

const raiz = path.join(__dirname, '..');
const html = path.join(raiz, 'dist', 'index.html');
if (!fs.existsSync(html)) { console.error('Falta dist/index.html: ejecute npm run build'); process.exit(2); }
const salida = path.join(raiz, 'capturas');
fs.mkdirSync(salida, { recursive: true });
const archivo = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase();

(async () => {
  // Chromium de Playwright; si no está instalado, Edge o Chrome del equipo
  const b = await playwright.chromium.launch().catch(() => playwright.chromium.launch({ channel: 'msedge' })).catch(() => playwright.chromium.launch({ channel: 'chrome' }));
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errores = [];
  pg.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  pg.on('pageerror', (e) => errores.push(e.message));
  pg.on('dialog', (d) => d.accept());
  const nav = async (t) => { await pg.locator('nav, aside').getByText(t, { exact: true }).first().click(); await pg.waitForTimeout(700); };
  await pg.goto('file://' + html);
  await pg.waitForTimeout(1200);
  await nav('Panel de proyectos');
  await pg.getByText('Desde el ejemplo').click();
  await pg.waitForTimeout(1000);
  await nav('Control y valor ganado');
  const demo = pg.getByText('Cargar datos de demostración');
  if (await demo.count()) { await demo.first().click(); await pg.waitForTimeout(1200); }
  for (const m of modulos) {
    await nav(m);
    await pg.waitForTimeout(1500); // la simulación Monte Carlo corre al abrir
    const pestanas = await pg.locator('.modulo [role=tab]').allInnerTexts();
    const nombres = pestanas.length ? pestanas : [''];
    for (let i = 0; i < nombres.length; i++) {
      if (pestanas.length) { await pg.locator('.modulo [role=tab]').nth(i).click(); await pg.waitForTimeout(800); }
      const f = path.join(salida, `${archivo(m)}-${i + 1}.png`);
      await pg.screenshot({ path: f, fullPage: true });
      console.log(`✓ ${m}${nombres[i] ? ' › ' + nombres[i].split('\n')[0] : ''}  →  capturas/${path.basename(f)}`);
    }
  }
  await b.close();
  if (errores.length) { console.log('\nErrores de consola:\n' + errores.join('\n')); process.exit(1); }
  console.log('\nSin errores de consola.');
})().catch((e) => { console.error(e); process.exit(1); });
