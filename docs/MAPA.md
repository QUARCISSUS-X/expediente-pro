# Mapa del código

Generado con `npm run mapa` (no editar a mano). Cada símbolo indica su línea: abra solo ese tramo del archivo.

## Motor de cálculo — `src/engine/`

### `src/engine/analisis.ts` · 158 líneas
Análisis gerencial del expediente: costo por título, composición, clasificación ABC, curva S, índices y alertas.
ClaseAbcᵗ:6 · ItemAbcᵗ:8 · Abcᵗ:21 · ParteCostoᵗ:27 · Analisisᵗ:34 · clasificarAbc:66 · analizar:88

### `src/engine/bitacora.ts` · 26 líneas
Bitácora de cambios del proyecto: cada edición con etiqueta queda con su fecha (se guardan las últimas 500).
MAX_BITACORA:4 · anotarBitacora:8 · bitacoraEntre:23

### `src/engine/cabecera.ts` · 119 líneas
Datos generales que se repiten en carátulas, encabezados y pies de todos los entregables.
Cabeceraᵗ:5 · nombreEntidad:31 · ubicacionCorta:35 · ubicacionLarga:40 · datosCabecera:51 · variablesProyecto:89 · textoProyecto:101 · logoBytes:106 · encajar:115

### `src/engine/calidad.ts` · 230 líneas
Plan de calidad (ISO 9001): plan de puntos de inspección por partida, protocolos con firma de liberación,
TipoPuntoᵗ:8 · TIPOS_PUNTO:9 · PuntoInspeccionᵗ:16 · ResultadoProtocoloᵗ:30 · RESULTADOS_PROTOCOLO:31 · FirmaProtocoloᵗ:38 · Protocoloᵗ:45 · DisposicionPncᵗ:59 · DISPOSICIONES_PNC:60 · EstadoPncᵗ:68 · Pncᵗ:71 · Calidadᵗ:91 · calidadVacia:97 · normalizarCalidad:99 · firmasPorDefecto:109 · protocoloLiberado:116 · puntosSugeridos:124 · LiberacionFrenteᵗ:147 · liberacionPorFrente:159 · resumenCalidad:183 · dmaicDesdePnc:203 · siguienteNumero:226

### `src/engine/ccpm.ts` · 226 líneas
Cadena crítica (CCPM, Goldratt): duraciones agresivas, colchón del proyecto, colchones de alimentación y gráfico de fiebre.
MetodoColchonᵗ:8 · ConfigCcpmᵗ:10 · configCcpmVacia:15 · normalizarConfigCcpm:16 · NodoCcpmᵗ:21 · ActividadCcpmᵗ:29 · ColchonAlimentacionᵗ:42 · Ccpmᵗ:51 · tamanoColchon:62 · duracionAgresiva:67 · calcularCcpm:79 · ccpmDePrograma:149 · ZonaFiebreᵗ:159 · limiteAmarillo:161 · limiteRojo:162 · zonaFiebre:163 · PuntoFiebreᵗ:169 · avancePlanCadena:181 · diaPlanParaAvance:190 · puntosFiebre:204

### `src/engine/compute.ts` · 192 líneas
Núcleo de costos: metrados, APU, presupuesto, gastos generales, pie e insumos.
CAMPOS_METRADO:10 · parcialMetrado:14 · metradosPorPartida:20 · mapaInsumos:27 · calcularApu:35 · ordenarPartidas:81 · construirPresupuesto:85 · costoDirecto:116 · calcularGG:120 · calcularPie:135 · relacionInsumos:153

### `src/engine/control.ts` · 17 líneas
Control de proyectos durante la ejecución. Cada fase vive en su archivo de src/engine/control/;

### `src/engine/documentos.ts` · 360 líneas
Documentos de texto (sin IA): memoria descriptiva, carta, EETT, matriz de cumplimiento y reporte de consistencia.
Bloqueᵗ:9 · Documentoᵗ:19 · NOMBRE_DOC:27 · parrafos:51 · firmasProyecto:66 · filasPie:80 · memoriaDescriptiva:93 · cartaPresentacion:163 · especificacionesTecnicas:215 · matrizCumplimiento:253 · reporteConsistencia:269 · informeObservaciones:289

### `src/engine/eett.ts` · 102 líneas
Especificaciones técnicas por plantilla (sin IA): detección por palabras clave y relleno con datos del APU.
MANO_OBRA_DEFECTO:5 · SECCIONES_EETT:8 · normalizar:19 · detectarPlantilla:35 · generarEett:59

### `src/engine/index.ts` · 128 líneas
Punto de entrada del motor: calcula todos los entregables a partir del Proyecto.
calcularFlete:12 · mismoCalculo:53 · recalcular:62 · calcularTodo:67

### `src/engine/integridad.ts` · 188 líneas
Integridad de los datos del proyecto: referencias rotas, identificadores repetidos y números no válidos.
ProblemaIntegridadᵗ:7 · revisarIntegridad:167 · repararIntegridad:175 · resumenIntegridad:183

### `src/engine/kanban.ts` · 246 líneas
Kanban de materiales: tarjetas desde la relación de insumos y el cronograma, stock mínimo, punto de pedido,
EstadoKanbanᵗ:7 · ESTADOS_KANBAN:9 · recibido:17 · TarjetaKanbanᵗ:19 · ParametroMaterialᵗ:36 · Kanbanᵗ:41 · kanbanVacio:47 · normalizarKanban:49 · tarjetasDesdeCronograma:71 · generarTarjetas:115 · enlazarRestriccion:127 · moverTarjeta:135 · eliminarTarjeta:147 · AlertaTarjetaᵗ:153 · alertaTarjeta:156 · AnalisisMaterialᵗ:164 · analisisMateriales:181 · resumenKanban:233

### `src/engine/polinomica.ts` · 89 líneas
Fórmula polinómica según D.S. 011-79-VC:
calcularPolinomica:15

### `src/engine/riesgo.ts` · 411 líneas
Riesgo de plazo y costo: simulación Monte Carlo sobre la red CPM del cronograma (PERT-Beta o triangular).
Distribucionᵗ:9 · ModoCostoᵗ:10 · EstimacionActividadᵗ:13 · ResumenRiesgoᵗ:22 · ConfigRiesgoᵗ:39 · configRiesgoVacia:54 · normalizarConfigRiesgo:71 · generador:93 · muestraTriangular:128 · muestraPert:136 · mediaPert:145 · mediaTriangular:146 · Estadisticaᵗ:150 · percentil:165 · estadistica:174 · EntradaActividadᵗ:200 · EntradaSimulacionᵗ:215 · entradaSimulacion:235 · ResultadoRiesgoᵗ:283 · Simulacion:297 · simularRiesgo:387 · resumirRiesgo:393

### `src/engine/schedule.ts` · 405 líneas
Programación: calendario, CPM, periodos y cronogramas derivados.
Calendario:9 · RedCpmᵗ:62 · construirRed:69 · redDePrograma:93 · PasadasCpmᵗ:97 · pasadasCpm:106 · calcularPrograma:155 · periodoDeFecha:278 · calcularValorizado:298 · distribuirInsumos:337 · calcularDesembolsos:386

### `src/engine/types.ts` · 477 líneas
Modelo de datos del expediente. Todo el programa se alimenta de un único objeto Proyecto.
TipoInsumoᵗ:3 · Modoᵗ:4 · TipoPredᵗ:5 · Severidadᵗ:6 · Insumoᵗ:8 · Partidaᵗ:21 · MetradoFilaᵗ:31 · ApuItemᵗ:47 · Apuᵗ:54 · GGItemᵗ:60 · GrupoGGᵗ:73 · Predᵗ:75 · Actividadᵗ:81 · DocKeyᵗ:87 · EntregableTdRᵗ:110 · SeccionesEettᵗ:118 · PlantillaEettᵗ:129 · Logoᵗ:135 · Entidadᵗ:141 · Responsableᵗ:152 · ConfigDocumentoᵗ:159 · TextosEettᵗ:170 · Metaᵗ:178 · TextosMemoriaᵗ:213 · ObservacionOrigenᵗ:222 · OrigenImportacionᵗ:230 · EntradaBitacoraᵗ:239 · Proyectoᵗ:245 · ApuItemCalcᵗ:269 · ApuCalcᵗ:279 · FilaPresupuestoᵗ:289 · Pieᵗ:299 · InsumoTotalᵗ:312 · RelacionInsumosᵗ:319 · GGCalcᵗ:327 · Monomioᵗ:335 · Polinomicaᵗ:342 · ActividadCalcᵗ:350 · Periodoᵗ:371 · Programaᵗ:379 · FilaCronogramaᵗ:391 · Valorizadoᵗ:401 · Desembolsoᵗ:414 · FleteCalcᵗ:424 · Hallazgoᵗ:431 · ReglaResultadoᵗ:439 · EettPartidaᵗ:447 · Resultadosᵗ:454

### `src/engine/util.ts` · 224 líneas
Utilidades: redondeo, formato, fechas, número a letras.
redondear:3 · redondearMilesimo:11 · num:15 · fmt:21 · fmtMoneda:26 · uid:31 · isoAFecha:39 · fechaAIso:44 · sumarDias:48 · difDias:54 · diaSemana:58 · fechaLarga:65 · fechaCorta:71 · mesAnio:77 · mesAnioLargo:82 · montoEnLetras:134 · normalizarUnidad:180 · unidadTexto:189 · unidadConocida:195 · nivelDeCodigo:200 · codigoPadre:204 · compararCodigos:210 · rellenarPlantilla:221

### `src/engine/validate.ts` · 198 líneas
Las 15 reglas de consistencia del expediente.
validar:25

### `src/engine/valor.ts` · 276 líneas
Ingeniería de valor y Target Value Design: costo meta por título, alternativas con índice de valor y matriz
MetaTituloᵗ:6 · CriterioDecisionᵗ:11 · AplicacionAlternativaᵗ:18 · RespaldoAlternativaᵗ:26 · EstadoAlternativaᵗ:35 · Alternativaᵗ:37 · SeguimientoBrechaᵗ:53 · Valorᵗ:61 · CRITERIOS_POR_DEFECTO:72 · valorVacio:80 · normalizarValor:82 · esPartida:99 · costoActual:100 · nombreAmbito:103 · costoAlternativa:109 · indiceValor:120 · puntajePonderado:128 · tituloDe:143 · FilaMetaᵗ:150 · ResumenMetasᵗ:163 · calcularMetas:173 · aplicarAlternativa:223 · deshacerAlternativa:262

### `src/engine/valorDemo.ts` · 49 líneas
Datos de demostración de ingeniería de valor (separados para no inflar control.ts).
demostracionValor:6

## Motor: control de obra — `src/engine/control/`

### `src/engine/control/cambios.ts` · 54 líneas
Adicionales, deductivos, ampliaciones y matriz de riesgos.
ResumenCambiosᵗ:9 · resumirCambios:23 · nivelRiesgo:47 · claseRiesgo:48

### `src/engine/control/demo.ts` · 303 líneas
Datos de demostración (controlDemostracion) para todas las funciones de control.
controlDemostracion:18

### `src/engine/control/evm.ts` · 186 líneas
Valor ganado (PMBOK) y Earned Schedule: PV, EV, AC, SPI, CPI, EAC, ES, SPI(t), IEAC(t).
PuntoEvmᵗ:12 · AvancePartidaᵗ:39 · Evmᵗ:49 · pvPartida:60 · pvALaFecha:67 · cronogramaGanado:74 · curvaPvDiaria:85 · cortesOrdenados:93 · calcularEvm:95 · ejecutadoHasta:181

### `src/engine/control/fechas.ts` · 39 líneas
Utilidades de fechas y días laborables del control.
hoyIso:9 · lunesDe:12 · mesDe:17 · calendarioDe:19 · laborables:22 · retrocederLaborables:28

### `src/engine/control/lean.ts` · 94 líneas
Lean Construction en ejecución: rendimientos, frentes, carta balance, pérdidas, 5S.
RendimientoMedicionᵗ:9 · RendimientoPartidaᵗ:18 · rendimientoMedicion:42 · rendimientosPorPartida:50 · resumenCarta:82 · puntajeInspeccion:90

### `src/engine/control/lineaBase.ts` · 49 líneas
Línea base congelada y cortes de avance.
crearLineaBase:10

### `src/engine/control/lps.ts` · 167 líneas
Last Planner System: plan maestro, fases, lookahead, restricciones, plan semanal, PPC.
FilaLookaheadᵗ:10 · lookahead:25 · compromisosSugeridos:60 · PpcSemanaᵗ:77 · calcularPpc:86 · ItemParetoᵗ:100 · pareto:107 · causasNoCumplimiento:119 · resumenRestricciones:125 · programarFase:137 · hitosDesdeCronograma:154

### `src/engine/control/modelo.ts` · 411 líneas
Modelo de datos de Proyecto.control (línea base, cortes, cambios, riesgos, cuaderno, Last Planner, Lean, Six Sigma y v2.5), controlVacio y normalizarControl.
PartidaBaseᵗ:12 · LineaBaseᵗ:27 · Corteᵗ:42 · TipoCambioᵗ:51 · EstadoCambioᵗ:52 · Cambioᵗ:53 · RespuestaRiesgoᵗ:65 · Riesgoᵗ:66 · TipoRegistroᵗ:79 · RegistroObraᵗ:80 · Hitoᵗ:97 · CompromisoFaseᵗ:107 · TIPOS_RESTRICCION:117 · Restriccionᵗ:118 · CAUSAS_NO_CUMPLIMIENTO:129 · Compromisoᵗ:144 · SemanaLpsᵗ:156 · Frenteᵗ:164 · Medicionᵗ:175 · GrupoTrabajoᵗ:186 · CATEGORIAS_CARTA:187 · CartaBalanceᵗ:203 · TIPOS_PERDIDA:214 · Perdidaᵗ:215 · ItemInspeccionᵗ:226 · Inspeccionᵗ:231 · PLANTILLAS_INSPECCION:241 · CATEGORIAS_6M:276 · Ishikawaᵗ:277 · FaseDmaicᵗ:284 · AccionDmaicᵗ:285 · ProyectoDmaicᵗ:292 · SerieCalidadᵗ:314 · Controlᵗ:324 · controlVacio:352 · normalizarControl:381

### `src/engine/control/recursos.ts` · 63 líneas
Histograma semanal de horas-hombre y horas-máquina, plan vs. real.
SemanaRecursosᵗ:10 · recursosSemanales:20

### `src/engine/control/sigma.ts` · 136 líneas
Six Sigma: cartas I-MR, capacidad de proceso, Pareto, Ishikawa, DMAIC.
CartaIMRᵗ:7 · cartaIMR:21 · normalAcumulada:58 · Capacidadᵗ:65 · capacidadProceso:80 · leerValores:122 · mejoraDmaic:131

### `src/engine/control/tablero.ts` · 118 líneas
Tablero de indicadores clave de todas las fases.
Tableroᵗ:19 · calcularTablero:60

### `src/engine/control/valorizaciones.ts` · 111 líneas
Valorizaciones mensuales con reajuste por fórmula polinómica, adelantos e IGV.
Valorizacionᵗ:10 · coeficienteK:31 · calcularValorizaciones:49

## Exportadores — `src/export/`

### `src/export/control.ts` · 307 líneas
Informe de control de obra: las mismas tablas se ven en pantalla y se exportan a Excel (una hoja por tabla).
tablaTablero:32 · tablaEvm:89 · tablaAvancePartidas:105 · tablaValorizaciones:118 · tablaCambios:133 · tablaRiesgos:140 · tablaRegistros:147 · tablaRecursos:153 · tablaRestricciones:158 · tablaPlanSemanal:165 · tablaPpc:174 · tablaRendimientos:183 · tablaCartas:188 · tablaPerdidas:196 · tablaInspecciones:204 · tablaCalidad:209 · tablaDmaic:217 · tablaCartaBalanceDetalle:223 · tablasControl:228 · generarXlsxControl:254 · generarXlsxTablas:259

### `src/export/docx.ts` · 417 líneas
Exportación a Word (.docx) de los documentos de texto: memoria, EETT, carta, matriz y reporte.
OpcionesWordᵗ:365 · documentoWord:369 · generarDocx:412

### `src/export/gerencial.ts` · 175 líneas
Reportes gerenciales: informe ejecutivo en PDF (con gráficos) y reporte gerencial en Excel.
tablaResumenEjecutivo:17 · tablaCostoPorTitulo:49 · tablaComposicion:56 · tablaAbcPartidas:75 · tablaAbcInsumos:76 · tablaCurva:78 · tablaConfiabilidad:88 · tablasGerenciales:99 · generarXlsxGerencial:114 · definicionPdfEjecutivo:162

### `src/export/metodologias.ts` · 195 líneas
Hojas de la versión 2.5 para el informe de control (y su vista en pantalla): riesgo Monte Carlo, cadena crítica,
riesgoActual:26 · tablaRiesgo:33 · tablaCriticidad:74 · tablaCcpm:85 · tablaKanban:103 · tablaPuntosInspeccion:115 · tablaProtocolos:120 · tablaPnc:135 · tablaLiberacion:142 · tablaMetas:147 · tablaAlternativas:158 · tablasMetodologias:168 · fechaAnalisis:186 · tablasDossier:189

### `src/export/msproject.ts` · 92 líneas
Exportación del programa de obra a MS Project (formato XML MSPDI).
generarMsProject:7

### `src/export/paquete.ts` · 88 líneas
Funciones que generan cada archivo del expediente y el ZIP. El render del PDF se inyecta (navegador o Node).
RenderPdfᵗ:13 · Archivoᵗ:15 · MIME:21 · nombreBase:32 · archivoExcel:36 · archivoEett:39 · archivoMemoria:43 · archivoCarta:47 · archivoMatriz:51 · archivoConsistencia:55 · archivoObservaciones:59 · archivoMsProject:65 · archivoPdf:68 · archivoEjecutivo:71 · archivoGerencial:74 · archivoProyecto:77 · empaquetarZip:82

### `src/export/pdfdoc.ts` · 610 líneas
Definición del PDF consolidado (pdfmake): carátula, control del documento, aviso, índice,
SECCIONES_PDF:24 · curvaS:310 · OpcionesPdfᵗ:475 · definicionPdf:479 · definicionPdfTablas:594

### `src/export/registro.ts` · 138 líneas
Registro único de entregables: cada archivo de salida se declara una sola vez aquí y de esta lista salen el ZIP,
OpcionesExportᵗ:12 · Exportadorᵗ:18 · EXPORTADORES:35 · TipoExportᵗ:112 · exportador:114 · NOMBRE_EXPORT:116 · generarExport:119 · generarTodos:128

### `src/export/render-browser.ts` · 16 líneas
Render del PDF en el navegador.
renderPdfBrowser:8

### `src/export/render-node.ts` · 26 líneas
Render del PDF en Node (línea de comandos).
renderPdfNode:21

### `src/export/tablas.ts` · 507 líneas
Tablas de reportes con el formato estándar de expediente técnico (S10 / PowerCost).
Celdaᵗ:8 · EstiloFilaᵗ:9 · Filaᵗ:10 · Tablaᵗ:17 · TIPOS_INSUMO:33 · subtituloProyecto:40 · lineaSon:44 · tablaResumen:78 · tablaDetallado:107 · tablaApu:128 · tablaInsumos:181 · tablaGG:210 · tablaMetrados:273 · tablaPolinomica:319 · tablaFlete:351 · textoPredecesoras:369 · tablaPrograma:374 · tablaValorizado:400 · tablaAdquisiciones:454 · tablaEquipos:460 · tablaPersonal:467 · tablaDesembolsos:475 · todasLasTablas:489

### `src/export/trabajador.ts` · 47 líneas
Trabajo en segundo plano (web worker): genera entregables y corre la simulación Monte Carlo sin congelar la pantalla.
MensajeTrabajoᵗ:10 · RespuestaTrabajoᵗ:14

### `src/export/xlsx.ts` · 3 líneas
Exportación a Excel (.xlsx) del expediente, con hojas vinculadas por fórmulas. El código está dividido por hoja en src/export/xlsx/.

## Exportador: Excel del expediente (una hoja o grupo de hojas por archivo) — `src/export/xlsx/`

### `src/export/xlsx/comun.ts` · 263 líneas
Excel del expediente: estilos, la clase Hoja, el contexto compartido, fórmulas de días laborables y membretes.
AZUL:9 · AZUL_INPUT:10 · VERDE_LINK:11 · GRIS:12 · GRIS2:13 · BORDE_FINO:14 · BORDE_HAIR:15 · FUENTE:16 · F_MONEDA:18 · F_CANT:19 · F_MET:20 · F_PCT:21 · F_FECHA:22 · Valorᵗ:24 · Estiloᵗ:25 · COL:39 · Hoja:49 · Ctxᵗ:118 · NDL:145 · WDL:147 · DIAS:149 · hojaCalendarioLaboral:151 · CRON:173 · serieCuadrada:176 · cron:183 · diasEnVentana:186 · tituloHoja:196 · finMembrete:218 · membrete:222 · configurarImpresion:244

### `src/export/xlsx/controles.ts` · 99 líneas
Excel del expediente: flete, controles de consistencia y cumplimiento del TdR.
hojaFlete:7 · hojaControles:33 · hojaCumplimiento:82

### `src/export/xlsx/costos.ts` · 401 líneas
Excel del expediente: insumos, metrados, resumen de metrados, APU, presupuesto y resumen de costos.
TIPOS:6 · insumosUsados:13 · planInsumos:21 · hojaInsumos:32 · hojaMetrados:91 · hojaResumenMetrados:139 · hojaApu:160 · filaUltimoDescendiente:254 · hojaPresupuesto:261 · completarGGPresupuesto:337 · hojaResumen:344

### `src/export/xlsx/datos.ts` · 95 líneas
Excel del expediente: hoja Datos (parámetros con nombre que usan las fórmulas de las demás hojas).
hojaDatos:7

### `src/export/xlsx/gg.ts` · 172 líneas
Excel del expediente: gastos generales y fórmula polinómica.
hojaGG:6 · hojaPolinomica:89

### `src/export/xlsx/index.ts` · 152 líneas
Exportación a Excel (.xlsx) totalmente editable: arma el libro con las hojas vinculadas por fórmulas (ver comun.ts).
generarXlsx:13

### `src/export/xlsx/programa.ts` · 384 líneas
Excel del expediente: cronograma, distribución por periodos, valorizado, calendarios y desembolsos.
hojaPrograma:7 · Bloqueᵗ:147 · planPeriodos:156 · apuPeriodos:165 · insumosAnticipacion:193 · hojaDistribucion:204 · filasValorizado:253 · hojaValorizado:259 · hojaCalendario:311 · hojaDesembolsos:348

## Importación y formatos — `src/io/`

### `src/io/compacto.ts` · 455 líneas
Formato de carga compacto (.exp.txt): un archivo de texto corto, legible y fácil de escribir a mano
ResultadoCompactoᵗ:21 · leerCompacto:107 · escribirCompacto:369 · catalogoCompacto:446

### `src/io/estructura.ts` · 59 líneas
Revisión de la forma mínima de un archivo de proyecto antes de migrarlo: un archivo ajeno, truncado o
ErrorEstructura:4 · revisarEstructura:21 · exigirEstructura:43 · leerJson:49

### `src/io/importarEett.ts` · 183 líneas
Lee las especificaciones técnicas de un expediente en Word (.docx) para conservar su redacción:
EspecificacionLeidaᵗ:10 · EettLeidasᵗ:11 · leerEettDocx:61 · aplicarEett:126

### `src/io/importarExpediente.ts` · 907 líneas
Importa un expediente existente hecho en S10, Delphin, PowerCost o Excel:
Observacionᵗ:18 · ControlImportacionᵗ:20 · ResultadoImportacionᵗ:28 · ArchivoEntradaᵗ:36 · codigoItem:100 · leerMsProjectXml:389 · importarExpediente:424

### `src/io/migrar.ts` · 70 líneas
Normaliza un proyecto leído de archivo: revisa su forma, aplica las migraciones numeradas
migrarProyecto:15 · esSoloLectura:62 · conEsquema:67

### `src/io/plantilla.ts` · 327 líneas
Plantilla de carga en Excel: exporta un proyecto a hojas editables y lo vuelve a importar.
textoPreds:106 · parsearPreds:111 · exportarPlantilla:130 · ResultadoImportacionᵗ:216 · importarPlantilla:221

## Migraciones numeradas del archivo de proyecto — `src/io/migraciones/`

### `src/io/migraciones/01-entidades.ts` · 30 líneas
Migración 1 → 2 (versión 1.x): cliente, empresa y elaborador pasan de meta a entidades y responsables.
nombre:6 · aplicar:8

### `src/io/migraciones/02-bitacora.ts` · 9 líneas
Migración 2 → 3 (versiones 2.0 a 2.6 → 2.7): número de esquema y bitácora de cambios vacía.
nombre:4 · aplicar:6

### `src/io/migraciones/index.ts` · 39 líneas
Migraciones numeradas del archivo de proyecto: cada una lleva el esquema N al N + 1. Para agregar una:
Migracionᵗ:7 · MIGRACIONES:13 · ESQUEMA_ACTUAL:19 · esquemaDe:22 · migrar:28

## Datos base — `src/data/`

### `src/data/biblioteca.ts` · 52 líneas
Biblioteca de partidas con APU de referencia (rendimientos usuales; verificar y ajustar a la obra).

### `src/data/catalogo.ts` · 85 líneas
Catálogo semilla de insumos. PRECIOS REFERENCIALES DE DEMOSTRACIÓN (sin IGV, Lima, oct-2026):

### `src/data/iu.ts` · 171 líneas
Índices Unificados de Precios de la Construcción (INEI), base diciembre 2025 = 100.
INDICES_UNIFICADOS:5 · AREAS_GEOGRAFICAS:86 · SIMBOLO_IU:103 · nombreIU:131 · sugerirIU:136

### `src/data/logosEjemplo.ts` · 6 líneas
Logos genéricos del proyecto de ejemplo (dibujados para la demostración).

### `src/data/manoObra.ts` · 46 líneas
Calculadora del costo de hora-hombre de construcción civil.
ParametrosMOᵗ:6 · PARAMETROS_MO_2026:18 · costoHH:30 · tarifasMO:35

### `src/data/plantillasEett.ts` · 236 líneas
Biblioteca de plantillas de especificaciones técnicas.

### `src/data/proyectos.ts` · 280 líneas
metaPorDefecto:10 · entidadVacia:47 · responsableVacio:51 · AVISO_DEFECTO:55 · documentoPorDefecto:58 · textosEettPorDefecto:70 · ENTREGABLES_BASE:85 · ggPlantilla:99 · proyectoEnBlanco:124 · proyectoEjemplo:152

## Interfaz — `src/ui/`

### `src/ui/App.tsx` · 442 líneas
esPlantillaDeCarga:20 · App:39 · Aplicacion:82

### `src/ui/Barrera.tsx` · 31 líneas
Barrera de errores: si un módulo falla, el resto del programa sigue y el trabajo no se pierde.
Barrera:6

### `src/ui/Cinta.tsx` · 141 líneas
Barra de herramientas tipo cinta (como S10, PowerCost o Delphin Express): Archivo, Edición, Partidas, Herramientas y Reportes.
Grupo:17 · B:26 · Menu:36 · Cinta:80

### `src/ui/Copias.tsx` · 85 líneas
Versiones del proyecto abierto: puntos de restauración automáticos (uno por día de trabajo) y manuales, y bitácora de cambios.
Copias:11

### `src/ui/Dialogos.tsx` · 312 líneas
Ventanas de la barra de herramientas: biblioteca, búsqueda, calculadoras, nuevo proyecto y atajos.
Dialogos:11 · Biblioteca:26 · Buscar:68 · CalculadoraHH:121 · CalculadoraCuadrilla:181 · NuevoProyecto:255 · Atajos:280

### `src/ui/VistaTabla.tsx` · 99 líneas
Muestra en pantalla las mismas tablas que van a Excel y PDF.
VistaTabla:6 · VistaDocumento:43 · BloqueVista:51

### `src/ui/acciones.ts` · 87 líneas
Acciones compartidas por la barra de herramientas, los menús y los módulos.
generarArchivo:16 · accionesPartida:26

### `src/ui/almacen.ts` · 353 líneas
Almacén local de proyectos (IndexedDB del navegador, con respaldo en localStorage).
ResumenProyectoᵗ:6 · RegistroProyectoᵗ:21 · DIAS_PAPELERA:31 · Respaldoᵗ:33 · nuevoId:48 · resumir:50 · modoAlmacen:120 · listarProyectos:130 · leerProyecto:135 · guardarRegistro:141 · guardarProyecto:150 · crearProyecto:182 · duplicarProyecto:186 · archivarProyecto:197 · eliminarProyecto:204 · listarPapelera:211 · diasEnPapelera:221 · restaurarDePapelera:223 · eliminarDefinitivo:231 · ultimoAbierto:239 · recordarUltimo:247 · proyectoV1:257 · olvidarV1:266 · respaldoCompleto:274 · restaurarRespaldo:280 · CopiaProyectoᵗ:295 · listarCopias:310 · crearCopia:317 · eliminarCopia:329 · avisarGuardado:341 · alGuardarEnOtraPestana:346

### `src/ui/arbol.ts` · 165 líneas
Operaciones sobre el árbol de partidas (títulos y partidas) con códigos jerárquicos.
hijos:11 · descendientes:15 · siguienteCodigo:19 · cambiarPrefijo:40 · agregarTitulo:47 · ultimaHojaAntes:59 · agregarPartida:64 · eliminar:85 · mover:98 · renumerar:115 · duplicar:129 · aumentarNivel:142 · disminuirNivel:154

### `src/ui/componentes.tsx` · 417 líneas
parsearNumero:6 · EntradaNumero:29 · EntradaTexto:79 · AreaTexto:111 · Campo:132 · Pestanas:142 · Insignia:154 · Modal:158 · UMBRAL_VIRTUAL:183 · useFilasVirtuales:190 · Espaciador:233 · Columnaᵗ:244 · TablaEditable:273 · IconoCerrar:395 · IconoQuitar:398 · IconoMas:401 · IconoArriba:404 · IconoAbajo:407 · Marca:410

### `src/ui/control.ts` · 37 líneas
Ayudas comunes de los módulos de control de ejecución.
useControl:8 · opcionesPartidas:18 · opcionesFrentes:22 · opciones:26 · pct:28 · ind:29 · fc:30 · fechaCortaDM:31 · estadoIndice:33 · MIME_XLSX:36

### `src/ui/escritorio.ts` · 58 líneas
Puente con la app de escritorio (Electron, carpeta electron/). En el navegador no existe y nada cambia.
ComandoEscritorioᵗ:5 · InfoPestanaᵗ:15 · escritorio:33 · parametrosInicio:37 · ApiPaginaᵗ:48 · publicarApiPagina:55

### `src/ui/estado.ts` · 246 líneas
Estado del proyecto abierto: edición inmutable (immer), deshacer/rehacer y autoguardado en el almacén local.
Actualizarᵗ:18 · useProyecto:20 · Dialogoᵗ:139 · Contextoᵗ:141 · ModuloIdᵗ:160 · descargar:184 · elegirArchivos:196 · elegirArchivo:207 · leerLogo:218

### `src/ui/graficos.tsx` · 467 líneas
Gráficos SVG livianos para los módulos de control (sin librerías externas).
COLOR:5 · Serieᵗ:17 · GraficoLineas:27 · GraficoBarras:82 · GraficoPareto:134 · GraficoControl:167 · GraficoHistograma:221 · BarraApilada:255 · MatrizRiesgos:283 · DiagramaIshikawa:310 · Indicador:362 · GraficoProbabilidad:373 · GraficoFiebre:423

### `src/ui/iconos.tsx` · 49 líneas
Iconos de la barra de herramientas (trazo propio, 20 × 20).
Icono:42

### `src/ui/trabajo.ts` · 56 líneas
Lanza trabajos pesados (exportar, Monte Carlo) en un web worker para que la pantalla no se congele.
Trabajoᵗ:14 · enSegundoPlano:20

## Interfaz: módulos (una pantalla por archivo) — `src/ui/modulos/`

### `src/ui/modulos/Calidad.tsx` · 363 líneas
Plan de calidad ISO 9001: puntos de inspección por partida, protocolos con firma de liberación, productos no conformes
ModCalidad:22 · Plan:77 · Protocolos:127 · Pncs:225 · Liberacion:329

### `src/ui/modulos/Ccpm.tsx` · 108 líneas
Cadena crítica (CCPM): duraciones agresivas, colchón del proyecto, colchones de alimentación y gráfico de fiebre.
ModCcpm:11

### `src/ui/modulos/Control.tsx` · 601 líneas
Control de obra (PMBOK): tablero, línea base y avance, valor ganado, valorizaciones, cambios, riesgos, recursos y cuaderno.
ModControl:19 · SinLineaBase:75 · Tablero:118 · Avance:192 · CurvaControl:292 · ValorGanado:308 · Valorizaciones:348 · Cambios:415 · Riesgos:462 · Recursos:525 · Registros:551

### `src/ui/modulos/Cronogramas.tsx` · 118 líneas
CurvaS:9 · Histograma:48 · ModCronogramas:83

### `src/ui/modulos/Documentos.tsx` · 99 líneas
ModDocumentos:11

### `src/ui/modulos/Ejecucion.tsx` · 408 líneas
Ejecución con Lean Construction: frentes de trabajo, control de rendimientos, cartas balance, pérdidas e inspecciones 5S.
ModEjecucion:17 · Frentes:49 · Rendimientos:128 · Cartas:222 · Perdidas:299 · Inspecciones:352

### `src/ui/modulos/Exportar.tsx` · 81 líneas
ModExportar:9

### `src/ui/modulos/GastosGenerales.tsx` · 103 líneas
ModGG:7

### `src/ui/modulos/Insumos.tsx` · 214 líneas
celda:17 · leerListaPrecios:29 · ModInsumos:47

### `src/ui/modulos/Logistica.tsx` · 246 líneas
Kanban de materiales: tablero por estados, stock mínimo y punto de pedido, alertas y enlace con Last Planner.
ModLogistica:20 · Tablero:83 · Materiales:150 · Lista:192

### `src/ui/modulos/Lps.tsx` · 410 líneas
Last Planner System: plan maestro e hitos, planificación por fases (pull), lookahead, restricciones, plan semanal y PPC.
ModLps:17 · Maestro:54 · Fases:109 · inicioVentana:179 · Lookahead:186 · Restricciones:252 · PlanSemanal:301 · Ppc:382

### `src/ui/modulos/Polinomica.tsx` · 67 líneas
ModPolinomica:5

### `src/ui/modulos/Presupuesto.tsx` · 461 líneas
ModPresupuesto:19 · PieResumen:120 · DetalleTitulo:146 · DetallePartida:170 · EditorApu:217 · EditorMetrados:331 · EditorPrograma:373 · EditorEett:418

### `src/ui/modulos/Programa.tsx` · 164 líneas
Gantt:9 · ModPrograma:70

### `src/ui/modulos/Proyecto.tsx` · 398 líneas
Configuración general del proyecto: datos que se copian solos a carátulas, encabezados, pies y formatos.
ModProyecto:14 · SelectorLogo:209 · FichaEntidad:241 · FichaResponsable:269 · FichaDocumento:285 · FichaTextos:321 · VistaPrevia:349

### `src/ui/modulos/Proyectos.tsx` · 231 líneas
Panel de proyectos: crear, abrir, duplicar, archivar, restaurar, eliminar, exportar y respaldar.
ModProyectos:18 · Papelera:190

### `src/ui/modulos/Resumen.tsx` · 124 líneas
Resumen del proyecto: indicadores, gráficos y puntos de atención calculados con engine/analisis.ts.
ModResumen:13

### `src/ui/modulos/Riesgo.tsx` · 260 líneas
Riesgo de plazo y costo: simulación Monte Carlo / PERT sobre la red CPM del cronograma.
ModRiesgo:18 · Configuracion:44 · SimulacionVista:97 · Resultados:157 · Estimaciones:215

### `src/ui/modulos/Sigma.tsx` · 339 líneas
Six Sigma / Lean Six Sigma: cartas de control, capacidad de proceso, Pareto, Ishikawa y proyectos DMAIC.
ModSigma:17 · Cartas:49 · Capacidad:104 · Pareto:179 · Ishikawas:222 · Dmaic:263

### `src/ui/modulos/Tdr.tsx` · 85 líneas
ModTdr:23

### `src/ui/modulos/Validacion.tsx` · 188 líneas
ModValidacion:30 · ObservacionesOrigen:90 · Integridad:146

### `src/ui/modulos/Valor.tsx` · 351 líneas
Ingeniería de valor y Target Value Design: costo meta por título, alternativas con índice de valor, matriz de
ModValor:25 · Metas:62 · opcionesAmbito:153 · Alternativas:157 · Matriz:285

### `src/ui/modulos/registro.ts` · 61 líneas
Registro único de módulos. Para agregar uno:
ItemNavᵗ:32 · NAV:35 · MODULOS:37

## Línea de comandos — `cli/`

### `cli/expediente.ts` · 291 líneas
Línea de comandos de Expediente Pro.

## App de escritorio — `electron/`

### `electron/main.cjs` · 501 líneas
Expediente Pro – app de escritorio (Electron).
leerSesion:45 · guardarSesion:53 · crearPestana:78 · activarPestana:112 · guardarPestana:123 · cerrarPestana:131 · moverPestana:150 · saltar:159 · abrirProyectoEnPestana:165 · reabrirCerrada:171 · ubicar:178 · enviarEstado:184 · actualizarTitulo:197 · comando:203 · listarProyectos:211 · menuNuevaPestana:224 · construirMenu:285 · abrirGuia:383 · acercaDe:400 · crearVentana:416

### `electron/preload-app.cjs` · 11 líneas
Puente entre cada pestaña (la interfaz web) y la ventana de escritorio. Ver src/ui/escritorio.ts.

### `electron/preload-barra.cjs` · 13 líneas
Puente de la barra de pestañas (pestanas.html) con la ventana.

## Herramientas — `scripts/`

### `scripts/extension.mjs` · 44 líneas
Arma la extensión de Firefox y de Chrome/Edge a partir de la misma interfaz web.

### `scripts/mapa.mjs` · 33 líneas
Genera docs/MAPA.md: qué hace cada archivo y en qué línea está cada función exportada.

### `scripts/probar-modulo.cjs` · 59 líneas
Prueba en el navegador UN solo módulo (o varios) sin recorrer todo el programa.

## Pruebas — `tests/`

### `tests/control.test.ts` · 191 líneas

### `tests/mejoras.test.ts` · 143 líneas
Versión 2.6: cálculo incremental, calendario, análisis gerencial, integridad y organización del código.

### `tests/metodologias.test.ts` · 457 líneas
Pruebas de la versión 2.5: Earned Schedule, Monte Carlo / PERT, cadena crítica, kanban de materiales,

### `tests/motor.test.ts` · 315 líneas
