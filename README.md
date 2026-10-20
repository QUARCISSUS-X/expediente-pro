# Expediente Pro – código fuente

Programa de costos, presupuestos y programación de obra (tipo S10 / PowerCost) que genera los
entregables de una cotización o de un expediente técnico. Sin IA y sin conexión a internet.

## Estructura
- `src/engine/` motor de cálculo: metrados, APU, presupuesto, gastos generales, fórmula polinómica, CPM, cronogramas, 15 reglas de validación y documentos.
- `src/export/` exportadores: Excel (ExcelJS), Word (docx), PDF (pdfmake), MS Project (XML), ZIP.
- `src/io/` plantilla de carga Excel, importación de expedientes existentes (S10/Excel, planilla de metrados, MS Project XML, EETT .docx) con detección de observaciones, y migración de proyectos v1 → v2.
- `src/data/` catálogo base, índices unificados INEI (base dic-2025), biblioteca de partidas, plantillas de EETT, proyecto de ejemplo.
- `src/ui/` interfaz React (un solo archivo HTML al compilar): panel de proyectos (IndexedDB), configuración general con logos, barra de herramientas tipo S10.
- `cli/` línea de comandos. `tests/` pruebas del motor (Vitest).

## Comandos
    npm install
    npm run dev          # interfaz en modo desarrollo
    npm run build        # genera dist/index.html (archivo único)
    npm test             # pruebas del motor
    npm run cli -- generar proyecto.expediente.json --salida carpeta --zip
    npm run cli:build    # genera dist-cli/expediente.cjs (CLI en un archivo)
    npm run cli -- cargar plantillas/Ejemplo_compacto.exp.txt --generar carpeta --zip
    npm run cli -- importar Ppto.xlsx Metrados.xlsx cronograma.xml EETT.docx --config datos.json --generar carpeta

## Versión 2.2
- Excel: el cronograma también es de fórmulas. Duración, inicio y fin por predecesoras (FC/CC/FF con desfase), holgura y ruta crítica, PLAZO_DIAS, distribución por periodos, valorizado, calendarios de compras/equipos/personal y desembolsos se recalculan al editar metrados, rendimientos, cuadrillas, precios, FECHA_INICIO, DIAS_NO_LAB o FERIADOS.
- Hoja oculta Calendario (CAL_FECHA, CAL_ACUM) en vez de NETWORKDAYS.INTL/WORKDAY.INTL, para que funcione igual en Excel, LibreOffice y Google Sheets.
- Series redondeadas con el resto en el último periodo (igual que el motor) y residuo de la fórmula polinómica al mayor monomio.
- Verificado: libro editado y recalculado = motor con los mismos cambios (0 diferencias).

## Versión 2.1
- Formato compacto `.exp.txt` (src/io/compacto.ts): proyecto completo en texto corto, con APU en línea, biblioteca (`apu=@clave`), copia de APU (`apu=02.01`), metrados con guion, `encadenar`, `# gg` / `# gg+` y textos libres. Comandos `cargar`, `compacto` y `catalogo`; Importar y Exportar en la interfaz. Referencia: plantillas/Formato_compacto.txt.

## Versión 2
- Configuración general (proyectista, cliente, propietario, logos, responsables, control del documento, moneda, IGV) que alimenta carátulas, encabezados, pies y membretes.
- Panel de proyectos: crear, abrir, duplicar, archivar, eliminar, exportar y respaldar.
- Excel con fórmulas vinculadas entre hojas (nombres definidos, SUBTOTAL, SUMIF, PRODUCT) y resultado guardado en cada celda.
- Formatos estándar: APU por bloques, relación y cotización de insumos, planilla de metrados de 8 columnas, GG variables/fijos/financieros, fórmula polinómica tipo S10, resúmenes de costos.
- Jornada por APU, metrado como producto de casillas, presupuesto con o sin IGV.
