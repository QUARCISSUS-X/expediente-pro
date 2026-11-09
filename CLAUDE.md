# Expediente Pro – guía para trabajar en el código

Programa de costos, presupuestos, programación y control de obra (tipo S10). React + TypeScript + Vite, compila a un solo
`dist/index.html`; app de escritorio con Electron. Sin conexión y sin IA. Interfaz y textos en español de Perú; montos sin IGV salvo que se indique.

## Regla principal: tocar solo la parte que corresponde
Cada mejora debe leer y cambiar **solo los archivos de la función afectada** (ver el mapa). No recorrer el repositorio ni leer
archivos grandes completos:
- Buscar con `grep -n` el nombre de la función o el texto de la pantalla y leer solo ese rango de líneas.
- `src/export/xlsx.ts` (≈1 500 líneas, entregables del expediente) y `src/engine/types.ts` se leen por partes.
- El motor de control ya está dividido por fase en `src/engine/control/`; `src/engine/control.ts` solo reexporta. Las importaciones
  del resto del programa siguen siendo `from '../engine/control'`.
- Verificar solo lo tocado (ver «Verificación acotada»). La prueba completa se corre al final, una vez.
- Si un cambio exige tocar un archivo fuera del mapa de su función, decirlo antes: suele significar que cambia el alcance.

## Mapa: función → archivos
| Función | Motor (cálculo) | Pantalla | Hojas del informe de control | Pruebas (`-t`) |
|---|---|---|---|---|
| Presupuesto, APU, metrados, insumos, GG | `engine/compute.ts` (orquesta en `engine/index.ts`: `calcularTodo`) | `ui/modulos/{Presupuesto,Insumos,GastosGenerales}.tsx` | — (entregables en `export/xlsx.ts`) | `motor.test.ts` |
| Fórmula polinómica | `engine/polinomica.ts` | `ui/modulos/Polinomica.tsx` | — | `motor.test.ts` |
| Validación (15 reglas), EETT y documentos | `engine/{validate,eett,documentos}.ts` | `ui/modulos/{Validacion,Documentos}.tsx` | — | `"las reglas detectan errores sembrados"` |
| Cronograma CPM (red compartida) | `engine/schedule.ts` (`construirRed`, `pasadasCpm`, `calcularPrograma`) | `ui/modulos/Programa.tsx` | — | `"programación CPM"` |
| **PMBOK – control y valor ganado** (sin flujo de caja) | `engine/control/{lineaBase,evm,valorizaciones,cambios,recursos}.ts` | `ui/modulos/Control.tsx` | Tablero, Valor ganado, Avance por partida, Valorizaciones, Cambios, Riesgos, Recursos, Cuaderno y RFI | `"línea base y valor ganado"`, `"valorizaciones"`, `"cambios"` |
| Earned Schedule | `engine/control/evm.ts` (`cronogramaGanado`, `curvaPvDiaria`) | `Control.tsx` (pestaña Valor ganado) | Valor ganado (columnas ES…IEAC(t)) | `"Earned Schedule"` |
| **Last Planner** (sin sectorización ni trenes) | `engine/control/lps.ts` | `ui/modulos/Lps.tsx` | Restricciones, Plan semanal, PPC | `"Last Planner"` |
| **Lean Construction en ejecución** (apartado propio: rendimientos y frentes) | `engine/control/lean.ts` | `ui/modulos/Ejecucion.tsx` | Rendimientos, Cartas balance, Conteo cartas, Pérdidas, Inspecciones | `"lean y six sigma"` |
| **Six Sigma / Lean Six Sigma** | `engine/control/sigma.ts` | `ui/modulos/Sigma.tsx` | Calidad Cp-Cpk, DMAIC | `"lean y six sigma"` |
| Riesgo Monte Carlo / PERT | `engine/riesgo.ts` | `ui/modulos/Riesgo.tsx` | Riesgo Monte Carlo, Criticidad | `"Monte Carlo"` |
| Cadena crítica (CCPM) | `engine/ccpm.ts` | `ui/modulos/Ccpm.tsx` | Cadena crítica | `"cadena crítica"` |
| Kanban de materiales | `engine/kanban.ts` | `ui/modulos/Logistica.tsx` | Kanban materiales | `"kanban"` |
| Plan de calidad ISO 9001 | `engine/calidad.ts` | `ui/modulos/Calidad.tsx` | Plan de inspección, Protocolos, PNC, Liberación por frente (+ dossier Excel/PDF) | `"calidad ISO 9001"`, `"dossier"` |
| Ingeniería de valor / Target Value Design | `engine/valor.ts` (+ `valorDemo.ts`) | `ui/modulos/Valor.tsx` | Costo meta, Alternativas VE | `"ingeniería de valor"` |

Piezas comunes (solo si la mejora las necesita):
- Modelo de `Proyecto.control`, `controlVacio`, `normalizarControl` (archivos viejos): `engine/control/modelo.ts`.
- Indicadores del tablero: `engine/control/tablero.ts` (motor) y la pestaña Tablero de `ui/modulos/Control.tsx`.
- Datos de demostración: `engine/control/demo.ts` (`controlDemostracion`).
- Informe de control en Excel: `export/control.ts` (fases 2.4) y `export/metodologias.ts` (fases 2.5). Cada `tablaX()` es una hoja.
- Ayudas de pantalla: `ui/control.ts` (`useControl`, `opcionesPartidas`, `fc`, `pct`); gráficos SVG: `ui/graficos.tsx`;
  tablas: `TablaEditable` en `ui/componentes.tsx` (columnas `texto`, `numero`, `fecha`, `select`, `casilla`).
- Navegación: `NAV` y el mapa de módulos en `ui/App.tsx`, `ModuloId` en `ui/estado.ts`, menú de escritorio `MODULOS` en `electron/main.cjs`.

## Cómo agregar una función nueva (receta)
1. Motor puro en `src/engine/<funcion>.ts` (sin React). Reutilizar `schedule.ts`, `compute.ts` y `Resultados`; no recalcular cronograma ni presupuesto.
2. Si guarda datos: campo nuevo en `Control` (`control/modelo.ts`), valor vacío en `controlVacio` y normalización en `normalizarControl`.
3. Pantalla en `src/ui/modulos/<Funcion>.tsx`; registrarla en `NAV` + mapa (`App.tsx`), `ModuloId` (`estado.ts`) y `MODULOS` (`electron/main.cjs`, con atajo).
4. Hoja(s) en `export/metodologias.ts` (o un archivo nuevo) e incluirlas en `tablasControl`; indicador en `control/tablero.ts` si es clave.
5. Datos coherentes en `control/demo.ts`.
6. Pruebas con valores conocidos en `tests/<funcion>.test.ts`.

## Verificación acotada
    npx tsc --noEmit -p .                              # tipos (rápido)
    npx vitest run tests/metodologias.test.ts -t "kanban"   # solo la función tocada
    npm run build && npm run probar:modulo -- "Kanban de materiales"   # navegador: un módulo, capturas en capturas/
Al terminar, una sola vez: `npm test` y `npm run probar:modulo -- --todos`.
Playwright y Chromium ya están instalados en la sesión (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` si no los encuentra).
Escritorio: `xvfb-run -a` con Electron; instalador: `npm run app:win` (requiere wine).

## Entrega
- Rama nueva por versión, PR hacia `main`; los PR se unen en orden de versión para que el historial quede por versión.
- Subir `version` en `package.json` y `package-lock.json`, y agregar la sección de la versión en `README.md`.

## Próxima etapa (no hacer sin pedido)
VDC / BIM: visor IFC, 5D y 4D.
