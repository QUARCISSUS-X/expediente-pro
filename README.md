# Expediente Pro – código fuente

Programa de costos, presupuestos y programación de obra (tipo S10 / PowerCost) que genera los
entregables de una cotización o de un expediente técnico. Sin IA y sin conexión a internet.

## Estructura
- `src/engine/` motor de cálculo: metrados, APU, presupuesto, gastos generales, fórmula polinómica, CPM, cronogramas, 15 reglas de validación y documentos.
- `src/export/` exportadores: Excel (ExcelJS), Word (docx), PDF (pdfmake), MS Project (XML), ZIP.
- `src/io/` plantilla de carga Excel, importación de expedientes existentes (S10/Excel, planilla de metrados, MS Project XML, EETT .docx) con detección de observaciones, y migración de proyectos v1 → v2.
- `src/data/` catálogo base, índices unificados INEI (base dic-2025), biblioteca de partidas, plantillas de EETT, proyecto de ejemplo.
- `src/ui/` interfaz React (un solo archivo HTML al compilar): panel de proyectos (IndexedDB), configuración general con logos, barra de herramientas tipo S10.
- `cli/` línea de comandos. `tests/` pruebas del motor (Vitest). `scripts/` herramientas (mapa del código, prueba de un módulo en el navegador).
- El motor de control está dividido por fase en `src/engine/control/` (PMBOK, Earned Schedule, Last Planner, Lean, Six Sigma, tablero, demostración); `src/engine/control.ts` los reexporta.
- `CLAUDE.md`: mapa de cada función a sus archivos (motor, pantalla, hojas del informe y pruebas) para que cada mejora toque solo su parte. `npm run probar:modulo -- "<módulo>"` prueba un solo módulo en el navegador.
- `electron/` app de escritorio para Windows: ventana con pestañas de proyectos, menú de módulos con atajos, ícono e instalador. La interfaz es la misma de la web (`dist/index.html`); `src/ui/escritorio.ts` la conecta con la ventana y en el navegador no hace nada.

## Comandos
    npm install
    npm run dev          # interfaz en modo desarrollo
    npm run build        # genera dist/index.html (archivo único)
    npm test             # pruebas del motor
    npm run cli -- generar proyecto.expediente.json --salida carpeta --zip
    npm run cli:build    # genera dist-cli/expediente.cjs (CLI en un archivo)
    npm run cli -- cargar plantillas/Ejemplo_compacto.exp.txt --generar carpeta --zip
    npm run cli -- importar Ppto.xlsx Metrados.xlsx cronograma.xml EETT.docx --config datos.json --generar carpeta
    npm run escritorio   # compila la web y abre la app de escritorio
    npm run app:win      # instalador y portable de Windows en release/ (en Linux requiere wine)
    # al unir a main una versión nueva, GitHub compila el instalador y publica el release (Releases)
    npm run extension    # extensión de Firefox y Chrome/Edge en release/ (y carpetas dist-ext-*)
    npm run verificar    # tipos + pruebas + compilación web y CLI (antes de cada entrega)
    npm run mapa         # regenera docs/MAPA.md
    npm run cli -- informe proyecto.json --salida carpeta      # informe ejecutivo (PDF) y reporte gerencial (Excel)
    npm run cli -- integridad proyecto.json --reparar          # revisa y repara datos sueltos o dañados

## Documentación
- `CLAUDE.md`: reglas para modificar el programa con poco contexto (léalo antes de pedir cambios a una IA).
- `docs/MAPA.md`: qué hace cada archivo y en qué línea está cada función.
- `docs/PLAN_V3.md`: plan por etapas hacia la versión 3.0.
- `docs/HISTORIAL.md`: novedades de cada versión (actual: 2.6).
- `docs/guia.html`: guía de uso (F1 en la app de escritorio).
