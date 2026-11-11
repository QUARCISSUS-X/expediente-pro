# Expediente Pro – guía para trabajar en el código

Programa de costos, presupuestos, programación y control de obra (tipo S10). React + TypeScript + Vite, compila a un solo
`dist/index.html`; app de escritorio con Electron. Sin conexión y sin IA. Interfaz y textos en español de Perú; montos sin IGV salvo que se indique.

## Regla principal: tocar solo la parte que corresponde
Cada mejora debe leer y cambiar **solo los archivos de la función afectada** (ver el mapa). No recorrer el repositorio ni leer
archivos grandes completos:
- `docs/MAPA.md` (generado con `npm run mapa`) da la línea de cada función exportada de cada archivo: abrir solo ese tramo.
- No leer `package-lock.json`, `src/data/logosEjemplo.ts`, `src/data/plantillasEett.ts`, `dist/`, `dist-cli/` ni `release/`.
- No volcar proyectos `.json`, Excel ni PDF al contexto: `npm run cli -- resumen|validar|integridad <archivo>`.
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
| **Resumen del proyecto** (indicadores, ABC, Pareto, curva S, alertas) | `engine/analisis.ts` | `ui/modulos/Resumen.tsx` | Informe ejecutivo PDF y Reporte gerencial Excel: `export/gerencial.ts` | `"análisis gerencial"` |
| **Integridad de datos** (referencias rotas, repetidos, números no válidos) | `engine/integridad.ts` (`recorrer`) | `ui/modulos/Validacion.tsx` (sección Integridad) | Hoja Consistencia del reporte gerencial | `"integridad de datos"` |
| Extensión de navegador (Firefox, Chrome/Edge) | — | misma interfaz; `extension/` (manifiesto base, fondo, íconos) y `scripts/extension.mjs` | — | `web-ext lint --source-dir dist-ext-firefox` |
| Versiones del proyecto y almacenamiento | — | `ui/almacen.ts` (IndexedDB, copias, aviso entre pestañas), `ui/Copias.tsx` | — | — |

Piezas comunes (solo si la mejora las necesita):
- Modelo de `Proyecto.control`, `controlVacio`, `normalizarControl` (archivos viejos): `engine/control/modelo.ts`.
- Indicadores del tablero: `engine/control/tablero.ts` (motor) y la pestaña Tablero de `ui/modulos/Control.tsx`.
- Datos de demostración: `engine/control/demo.ts` (`controlDemostracion`).
- Informe de control en Excel: `export/control.ts` (fases 2.4) y `export/metodologias.ts` (fases 2.5). Cada `tablaX()` es una hoja.
- Ayudas de pantalla: `ui/control.ts` (`useControl`, `opcionesPartidas`, `fc`, `pct`); gráficos SVG: `ui/graficos.tsx`;
  tablas: `TablaEditable` en `ui/componentes.tsx` (columnas `texto`, `numero`, `fecha`, `select`, `casilla`).
- Navegación: lista única en `electron/modulos.json` (grupo, texto, menú de escritorio, atajo, reglas); la leen `ui/modulos/registro.ts`
  (`NAV`, `MODULOS`) y `electron/main.cjs`. `ModuloId` en `ui/estado.ts`. `tests/mejoras.test.ts` avisa si las tres listas no coinciden.
- Archivos de salida: una función `archivoX` en `export/paquete.ts` + `TipoExport` en `ui/acciones.ts` + tarjeta en `ui/modulos/Exportar.tsx`.
- Comandos de consola: `cli/expediente.ts` (switch de `main` y texto de ayuda).
- Si una pantalla falla, `ui/Barrera.tsx` la aísla; el resto del programa sigue.

## Cómo agregar una función nueva (receta)
1. Motor puro en `src/engine/<funcion>.ts` (sin React). Reutilizar `schedule.ts`, `compute.ts` y `Resultados`; no recalcular cronograma ni presupuesto.
2. Si guarda datos: campo nuevo en `Control` (`control/modelo.ts`), valor vacío en `controlVacio` y normalización en `normalizarControl`.
3. Pantalla en `src/ui/modulos/<Funcion>.tsx`; registrarla en `electron/modulos.json` (con atajo único), `ModuloId` (`estado.ts`) y `ui/modulos/registro.ts`.
4. Hoja(s) en `export/metodologias.ts` (o un archivo nuevo) e incluirlas en `tablasControl`; indicador en `control/tablero.ts` si es clave.
5. Datos coherentes en `control/demo.ts`.
6. Pruebas con valores conocidos en `tests/<funcion>.test.ts`.

## Reglas que no se rompen
- Redondeos del motor: cantidades de APU a 4 decimales, parciales y PU a 2, metrado por partida a 2 (el Excel con fórmulas debe dar 0 diferencias).
- Rendimiento: la interfaz usa `recalcular()` (`engine/index.ts`), que reutiliza por referencia lo que no cambió. Editar SOLO con
  `ctx.actualizar` (immer); nunca modificar `proyecto` ni `resultados` en el sitio. Un dato nuevo del proyecto que no entra al
  cálculo del expediente se agrega a `FUERA_DEL_CALCULO`. Copiar antes de ordenar listas de `Resultados` (`[...lista].sort()`).
- Días laborables siempre con `Calendario` (`engine/schedule.ts`), que tiene caché; no contar día por día en bucles.
- Un proyecto guardado con una versión anterior siempre debe abrir: todo campo nuevo pasa por `migrarProyecto` / `normalizarControl`.
- Sin dependencias nuevas ni llamadas a internet. Nada de `eval`, `new Function` ni scripts en línea en código propio: la extensión no los permite.
- Archivo nuevo: primera línea con un comentario `//` que diga qué hace (lo usa `docs/MAPA.md`).

## Verificación acotada
    npx tsc --noEmit -p .                              # tipos (rápido)
    npx vitest run tests/metodologias.test.ts -t "kanban"   # solo la función tocada
    npm run build && npm run probar:modulo -- "Kanban de materiales"   # navegador: un módulo, capturas en capturas/
Al terminar, una sola vez: `npm test` y `npm run probar:modulo -- --todos`.
Playwright y Chromium ya están instalados en la sesión (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` si no los encuentra).
Antes de entregar: `npm run verificar` (tipos + pruebas + web + CLI + mapa).
Escritorio: `xvfb-run -a` con Electron. Instalador de Windows: lo compila GitHub Actions (`.github/workflows/release-windows.yml`)
en una máquina Windows; en cada PR deja el instalador como artefacto y, al unir a `main` una versión nueva, publica el release.

## Entrega
- Rama nueva por versión, PR hacia `main`; los PR se unen en orden de versión para que el historial quede por versión.
- Subir `version` en `package.json` y `package-lock.json`, y agregar la sección de la versión en `docs/HISTORIAL.md` (arriba).
- Al unir el PR a `main`, GitHub crea la etiqueta `vX.Y.Z` y el release con el instalador, el portable y el ZIP (unos 10 minutos).

## Próxima etapa (no hacer sin pedido)
VDC / BIM: visor IFC, 5D y 4D.
