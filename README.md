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

## Versión 2.5 – metodologías de planificación, riesgo, logística, calidad y valor
Seis funciones nuevas sobre el mismo motor y los mismos datos (sin duplicar el cálculo del cronograma ni del presupuesto). Todo se guarda en el proyecto, los indicadores clave aparecen en el Tablero y el «Informe de control (Excel)» suma 10 hojas (28 en total). Para conocerlas: Control y valor ganado → «Cargar datos de demostración».
- **Earned Schedule** (en Control y valor ganado): ES, AT, SPI(t), SV(t) e IEAC(t) con la curva PV diaria de la línea base, junto al SPI clásico, en el tablero y en la hoja «Valor ganado».
- **Riesgo de plazo y costo** (Alt+5): simulación Monte Carlo de 1 000 a 10 000 iteraciones sobre la red CPM (FC/CC/FF con desfase), PERT-Beta o triangular; tres valores por actividad o ± % general; costo con tres valores por partida o ± % general; histograma y curva S de probabilidad; P50, P80 y P90 de plazo y costo; probabilidad de cumplir el plazo y el presupuesto; índice de criticidad. Semilla fija (resultados repetibles) y cálculo por bloques que no congela la interfaz.
- **Cadena crítica (CCPM)** (Alt+6): duraciones agresivas con % de recorte, colchón del proyecto (50 % de la seguridad o raíz de la suma de cuadrados), colchones de alimentación con aviso si no caben en la holgura, y gráfico de fiebre (verde, amarillo, rojo) con los cortes de avance. Sin nivelación de recursos.
- **Kanban de materiales** (Alt+7): tablero por pedir → pedido → en tránsito → en almacén → en frente, con tarjetas generadas desde la relación de insumos y el cronograma (fecha necesaria y fecha de pedido según la anticipación de compra); stock mínimo y punto de pedido por material; alertas de quiebre; cada tarjeta puede crear una restricción de Last Planner que bloquea la actividad en el lookahead hasta que el material llega. Se mueve con flechas o arrastrando.
- **Plan de calidad ISO 9001** (Alt+8): plan de puntos de inspección por partida (sugerido desde las EETT: norma, frecuencia, criterio, responsable, registro, tipo H/W/R/I), protocolos con firmas de liberación, productos no conformes con disposición, causa raíz, Ishikawa, acciones y verificación de eficacia (formato DMAIC, con paso a proyecto DMAIC), índice de liberación por frente y dossier de calidad en Excel y PDF. Las series de ensayos de Six Sigma se enlazan a un punto de inspección.
- **Ingeniería de valor y costo meta** (grupo Costos, Alt+0): costo meta por título (costo permitido, % general o meta propia), alternativas con función, costo, plazo, ventajas y riesgos, índice de valor, matriz de decisión ponderada, seguimiento de la brecha y aplicación de una alternativa aprobada al presupuesto (precio unitario propio o APU de otra partida, nuevo metrado o descripción) con confirmación y deshacer.
- Motor en `src/engine/{riesgo,ccpm,kanban,calidad,valor}.ts` y Earned Schedule en `control.ts`; la red CPM se comparte desde `schedule.ts` (`construirRed`, `pasadasCpm`). Hojas en `src/export/metodologias.ts`, pantallas en `src/ui/modulos/{Riesgo,Ccpm,Logistica,Calidad,Valor}.tsx`. Pruebas con valores conocidos en `tests/metodologias.test.ts`.
- Próxima etapa: VDC / BIM (visor IFC, 5D y 4D).

## Versión 2.4 – control de obra
Nuevo grupo «Control de obra» (web y escritorio; Alt+1…Alt+4 en la app). Todo se guarda dentro del proyecto y se exporta en un «Informe de control» en Excel de 18 hojas. Para conocerlo: Control y valor ganado → «Cargar datos de demostración».
- **Control y valor ganado (PMBOK):** tablero de indicadores; línea base congelada; cortes de avance con metrado ejecutado y costo real; valor ganado (PV, EV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC, TCPI, fin estimado) con curva S; valorizaciones mensuales con reajuste por fórmula polinómica (K con índices unificados), amortización de adelantos e IGV, limitadas al metrado contractual; adicionales, deductivos y ampliaciones con presupuesto y plazo vigentes; matriz de riesgos 5×5 con contingencia (se puede llevar a gastos generales); histograma semanal de horas-hombre y horas-máquina plan vs. real; cuaderno de obra, consultas (RFI), actas y ocurrencias con plazos.
- **Last Planner System:** plan maestro e hitos (generados desde el cronograma), planificación por fases hacia atrás (pull), lookahead de 3 a 8 semanas con metrado semanal y estado de restricciones, análisis de restricciones, plan semanal con compromisos sugeridos, PPC y Pareto de causas de no cumplimiento.
- **Ejecución lean:** frentes de trabajo, control de rendimientos (HH reales vs. APU, índice de productividad, rendimiento equivalente y desviación de mano de obra), carta balance y nivel general de actividad (TP/TC/TNC), registro de las 8 pérdidas con Pareto, inspecciones 5S y liberación de frentes.
- **Calidad Six Sigma:** cartas de control I-MR (puntos fuera, rachas y tendencias) sobre rendimientos o ensayos, capacidad de proceso (Cp, Cpk, % fuera, DPMO, nivel sigma, histograma), Pareto de 7 fuentes, Ishikawa 6M y proyectos DMAIC con acciones y mejora.
- Motor en `src/engine/control.ts` (probado en `tests/control.test.ts`), informe en `src/export/control.ts`, pantallas en `src/ui/modulos/{Control,Lps,Ejecucion,Sigma}.tsx`.

## Versión 2.3 – app de escritorio
- Programa de Windows (instalador `Expediente-Pro-Setup-2.3.0.exe` o `Expediente-Pro-Portable-2.3.0.exe`, sin instalar) con la misma interfaz de la web.
- Pestañas de proyectos arriba, como un navegador: varios proyectos abiertos a la vez, botón + (proyecto en blanco, desde el ejemplo o guardado), cerrar con ×, clic central o Ctrl+W, reordenar arrastrando, Ctrl+Tab para cambiar y Ctrl+Shift+T para reabrir la última cerrada. Al volver a abrir el programa se restauran las pestañas.
- Un proyecto no se abre en dos pestañas a la vez; en el panel de proyectos aparece «Pestaña nueva» junto a «Abrir».
- Menú de Windows: Archivo, Editar, Módulos (Ctrl+1…9, Ctrl+D Documentos, F7 Validación, Ctrl+E Exportar), Pestañas, Ver (zoom, pantalla completa) y Ayuda (atajos, guía de uso con F1).
- Cada cambio se guarda en la propia app (también al cerrar una pestaña o el programa). Los proyectos de la app son independientes de los del navegador: se pasan con Respaldo / Restaurar respaldo.
- Los archivos generados (Excel, Word, PDF, ZIP, MS Project) se guardan con el diálogo «Guardar como», en Descargas por defecto.

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
