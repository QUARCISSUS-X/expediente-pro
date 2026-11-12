# Mapa del código

Generado con `npm run mapa` (no editar a mano). Cada símbolo indica su línea: abra solo ese tramo del archivo.

## Motor de cálculo — `src/engine/`

### `src/engine/analisis.ts` · 158 líneas
Análisis gerencial del expediente: costo por título, composición, clasificación ABC, curva S, índices y alertas.
ClaseAbcᵗ:6 · ItemAbcᵗ:8 · Abcᵗ:21 · ParteCostoᵗ:27 · Analisisᵗ:34 · clasificarAbc:66 · analizar:88

### `src/engine/banco.ts` · 410 líneas
Banco de datos propio (fuera de los proyectos): insumos, precios con fecha y fuente, análisis, cuadrillas, plantillas y
FuentePrecioᵗ:12 · FUENTES_PRECIO:13 · InsumoBancoᵗ:21 · PrecioBancoᵗ:33 · AnalisisBancoᵗ:45 · CuadrillaBancoᵗ:57 · TipoPlantillaᵗ:64 · PlantillaBancoᵗ:65 · ProveedorBancoᵗ:73 · Bancoᵗ:84 · Tablaᵗ:93 · TABLAS:94 · bancoVacio:103 · claveFila:106 · normalizarBanco:124 · resumenBanco:148 · canonico:153 · sumaComprobacion:163 · ordenarBanco:173 · bancoInicial:184 · EstadoFilaᵗ:203 · Decisionᵗ:204 · FilaComparadaᵗ:206 · Comparacionᵗ:215 · compararBancos:224 · fusionarBancos:257 · historialPrecio:278 · precioVigente:284 · DiferenciaPrecioᵗ:289 · compararPrecios:302 · aplicarPrecios:317 · clavePartida:335 · OpcionesEnvioᵗ:340 · bancoDesdeProyecto:349 · insumoDesdeBanco:371 · completarInsumos:386 · partidaTipoDe:398 · nuevoCodigoBanco:403

### `src/engine/bitacora.ts` · 26 líneas
Bitácora de cambios del proyecto: cada edición con etiqueta queda con su fecha (se guardan las últimas 500).
MAX_BITACORA:4 · anotarBitacora:8 · bitacoraEntre:23

### `src/engine/cabecera.ts` · 119 líneas
Datos generales que se repiten en carátulas, encabezados y pies de todos los entregables.
Cabeceraᵗ:5 · nombreEntidad:31 · ubicacionCorta:35 · ubicacionLarga:40 · datosCabecera:51 · variablesProyecto:89 · textoProyecto:101 · logoBytes:106 · encajar:115

### `src/engine/calidad.ts` · 230 líneas
Plan de calidad (ISO 9001): plan de puntos de inspección por partida, protocolos con firma de liberación,
TipoPuntoᵗ:8 · TIPOS_PUNTO:9 · PuntoInspeccionᵗ:16 · ResultadoProtocoloᵗ:30 · RESULTADOS_PROTOCOLO:31 · FirmaProtocoloᵗ:38 · Protocoloᵗ:45 · DisposicionPncᵗ:59 · DISPOSICIONES_PNC:60 · EstadoPncᵗ:68 · Pncᵗ:71 · Calidadᵗ:91 · calidadVacia:97 · normalizarCalidad:99 · firmasPorDefecto:109 · protocoloLiberado:116 · puntosSugeridos:124 · LiberacionFrenteᵗ:147 · liberacionPorFrente:159 · resumenCalidad:183 · dmaicDesdePnc:203 · siguienteNumero:226

### `src/engine/ccpm.ts` · 227 líneas
Cadena crítica (CCPM, Goldratt): duraciones agresivas, colchón del proyecto, colchones de alimentación y gráfico de fiebre.
MetodoColchonᵗ:8 · ConfigCcpmᵗ:10 · configCcpmVacia:16 · normalizarConfigCcpm:17 · NodoCcpmᵗ:22 · ActividadCcpmᵗ:30 · ColchonAlimentacionᵗ:43 · Ccpmᵗ:52 · tamanoColchon:63 · duracionAgresiva:68 · calcularCcpm:80 · ccpmDePrograma:150 · ZonaFiebreᵗ:160 · limiteAmarillo:162 · limiteRojo:163 · zonaFiebre:164 · PuntoFiebreᵗ:170 · avancePlanCadena:182 · diaPlanParaAvance:191 · puntosFiebre:205

### `src/engine/compute.ts` · 238 líneas
Núcleo de costos: metrados, APU, presupuesto, gastos generales, pie e insumos.
CAMPOS_METRADO:10 · parcialMetrado:14 · metradosPorPartida:20 · tipoCambio:28 · mapaInsumos:36 · insumosSinTipoCambio:46 · ResolverSubpartidaᵗ:51 · calcularApu:55 · ordenarPartidas:127 · construirPresupuesto:131 · costoDirecto:162 · calcularGG:166 · calcularPie:181 · relacionInsumos:199

### `src/engine/control.ts` · 17 líneas
Control de proyectos durante la ejecución. Cada fase vive en su archivo de src/engine/control/;

### `src/engine/documentos.ts` · 360 líneas
Documentos de texto (sin IA): memoria descriptiva, carta, EETT, matriz de cumplimiento y reporte de consistencia.
Bloqueᵗ:9 · Documentoᵗ:19 · NOMBRE_DOC:27 · parrafos:51 · firmasProyecto:66 · filasPie:80 · memoriaDescriptiva:93 · cartaPresentacion:163 · especificacionesTecnicas:215 · matrizCumplimiento:253 · reporteConsistencia:269 · informeObservaciones:289

### `src/engine/eett.ts` · 102 líneas
Especificaciones técnicas por plantilla (sin IA): detección por palabras clave y relleno con datos del APU.
MANO_OBRA_DEFECTO:5 · SECCIONES_EETT:8 · normalizar:19 · detectarPlantilla:35 · generarEett:59

### `src/engine/escenarios.ts` · 140 líneas
Versiones del presupuesto (oferta, negociado, contractual…): copia con nombre de lo que entra al cálculo,
TIPOS_ESCENARIO:7 · crearEscenario:17 · proyectoDeEscenario:30 · restaurarEscenario:35 · resultadosDeEscenario:49 · escenarioContractual:52 · FilaComparacionPartidaᵗ:57 · FilaComparacionInsumoᵗ:72 · ComparacionPresupuestosᵗ:85 · compararPresupuestos:95

### `src/engine/expresion.ts` · 92 líneas
Evaluador propio de fórmulas aritméticas para metrados («2*(3.5+4.2)», «12,5/2»), sin eval ni new Function
ErrorExpresion:4 · evaluarExpresion:28 · esFormula:82 · formulaExcel:88

### `src/engine/index.ts` · 189 líneas
Punto de entrada del motor: calcula todos los entregables a partir del Proyecto.
calcularFlete:12 · piesSubpresupuestos:73 · mismoCalculo:111 · recalcular:120 · calcularTodo:125

### `src/engine/integracion.ts` · 187 líneas
Integración de apartados: un dato se registra una vez y los demás módulos lo leen. Metrado vigente (con los cambios
metradosVigentes:14 · montoDeCambio:26 · RequerimientoMaterialᵗ:35 · requerimientoMateriales:47 · RestriccionAutoᵗ:81 · restriccionesAutomaticas:88 · todasLasRestricciones:120 · metradoLiberado:130 · contingenciaRiesgo:145 · Pendienteᵗ:154 · centroPendientes:164

### `src/engine/integridad.ts` · 192 líneas
Integridad de los datos del proyecto: referencias rotas, identificadores repetidos y números no válidos.
ProblemaIntegridadᵗ:7 · revisarIntegridad:171 · repararIntegridad:179 · resumenIntegridad:187

### `src/engine/kanban.ts` · 249 líneas
Kanban de materiales: tarjetas desde la relación de insumos y el cronograma, stock mínimo, punto de pedido,
EstadoKanbanᵗ:8 · ESTADOS_KANBAN:10 · recibido:18 · TarjetaKanbanᵗ:20 · ParametroMaterialᵗ:38 · Kanbanᵗ:43 · kanbanVacio:49 · normalizarKanban:51 · tarjetasDesdeCronograma:73 · generarTarjetas:118 · enlazarRestriccion:130 · moverTarjeta:138 · eliminarTarjeta:150 · AlertaTarjetaᵗ:156 · alertaTarjeta:159 · AnalisisMaterialᵗ:167 · analisisMateriales:184 · resumenKanban:236

### `src/engine/polinomica.ts` · 89 líneas
Fórmula polinómica según D.S. 011-79-VC:
calcularPolinomica:15

### `src/engine/riesgo.ts` · 411 líneas
Riesgo de plazo y costo: simulación Monte Carlo sobre la red CPM del cronograma (PERT-Beta o triangular).
Distribucionᵗ:9 · ModoCostoᵗ:10 · EstimacionActividadᵗ:13 · ResumenRiesgoᵗ:22 · ConfigRiesgoᵗ:39 · configRiesgoVacia:54 · normalizarConfigRiesgo:71 · generador:93 · muestraTriangular:128 · muestraPert:136 · mediaPert:145 · mediaTriangular:146 · Estadisticaᵗ:150 · percentil:165 · estadistica:174 · EntradaActividadᵗ:200 · EntradaSimulacionᵗ:215 · entradaSimulacion:235 · ResultadoRiesgoᵗ:283 · Simulacion:297 · simularRiesgo:387 · resumirRiesgo:393

### `src/engine/schedule.ts` · 405 líneas
Programación: calendario, CPM, periodos y cronogramas derivados.
Calendario:9 · RedCpmᵗ:62 · construirRed:69 · redDePrograma:93 · PasadasCpmᵗ:97 · pasadasCpm:106 · calcularPrograma:155 · periodoDeFecha:278 · calcularValorizado:298 · distribuirInsumos:337 · calcularDesembolsos:386

### `src/engine/types.ts` · 530 líneas
Modelo de datos del expediente. Todo el programa se alimenta de un único objeto Proyecto.
TipoInsumoᵗ:3 · Modoᵗ:4 · TipoPredᵗ:5 · Severidadᵗ:6 · Insumoᵗ:8 · Partidaᵗ:23 · Subpresupuestoᵗ:35 · Subpartidaᵗ:41 · prefijoSubpartida:46 · TipoCambioMonedaᵗ:49 · TipoEscenarioᵗ:55 · Escenarioᵗ:58 · MetradoFilaᵗ:68 · ApuItemᵗ:85 · Apuᵗ:92 · GGItemᵗ:98 · GrupoGGᵗ:111 · Predᵗ:113 · Actividadᵗ:119 · DocKeyᵗ:125 · EntregableTdRᵗ:148 · SeccionesEettᵗ:156 · PlantillaEettᵗ:167 · Logoᵗ:173 · Entidadᵗ:179 · Responsableᵗ:190 · ConfigDocumentoᵗ:197 · TextosEettᵗ:208 · Metaᵗ:216 · TextosMemoriaᵗ:252 · ObservacionOrigenᵗ:261 · OrigenImportacionᵗ:269 · EntradaBitacoraᵗ:278 · Proyectoᵗ:284 · ApuItemCalcᵗ:311 · ApuCalcᵗ:322 · FilaPresupuestoᵗ:332 · Pieᵗ:342 · InsumoTotalᵗ:355 · RelacionInsumosᵗ:362 · GGCalcᵗ:370 · Monomioᵗ:378 · Polinomicaᵗ:385 · ActividadCalcᵗ:393 · Periodoᵗ:414 · Programaᵗ:422 · FilaCronogramaᵗ:434 · Valorizadoᵗ:444 · Desembolsoᵗ:457 · FleteCalcᵗ:467 · Hallazgoᵗ:474 · ReglaResultadoᵗ:482 · EettPartidaᵗ:490 · Resultadosᵗ:497 · PieSubpresupuestoᵗ:524

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

### `src/engine/control/cambios.ts` · 62 líneas
Adicionales, deductivos, ampliaciones y matriz de riesgos.
ResumenCambiosᵗ:10 · resumirCambios:29 · nivelRiesgo:55 · claseRiesgo:56

### `src/engine/control/demo.ts` · 303 líneas
Datos de demostración (controlDemostracion) para todas las funciones de control.
controlDemostracion:18

### `src/engine/control/evm.ts` · 191 líneas
Valor ganado (PMBOK) y Earned Schedule: PV, EV, AC, SPI, CPI, EAC, ES, SPI(t), IEAC(t).
PuntoEvmᵗ:12 · AvancePartidaᵗ:39 · Evmᵗ:49 · pvPartida:61 · pvALaFecha:68 · cronogramaGanado:75 · curvaPvDiaria:86 · cortesOrdenados:94 · calcularEvm:96 · ejecutadoHasta:186

### `src/engine/control/fechas.ts` · 39 líneas
Utilidades de fechas y días laborables del control.
hoyIso:9 · lunesDe:12 · mesDe:17 · calendarioDe:19 · laborables:22 · retrocederLaborables:28

### `src/engine/control/lean.ts` · 94 líneas
Lean Construction en ejecución: rendimientos, frentes, carta balance, pérdidas, 5S.
RendimientoMedicionᵗ:9 · RendimientoPartidaᵗ:18 · rendimientoMedicion:42 · rendimientosPorPartida:50 · resumenCarta:82 · puntajeInspeccion:90

### `src/engine/control/lineaBase.ts` · 49 líneas
Línea base congelada y cortes de avance.
crearLineaBase:10

### `src/engine/control/lps.ts` · 169 líneas
Last Planner System: plan maestro, fases, lookahead, restricciones, plan semanal, PPC.
FilaLookaheadᵗ:11 · lookahead:26 · compromisosSugeridos:62 · PpcSemanaᵗ:79 · calcularPpc:88 · ItemParetoᵗ:102 · pareto:109 · causasNoCumplimiento:121 · resumenRestricciones:127 · programarFase:139 · hitosDesdeCronograma:156

### `src/engine/control/modelo.ts` · 416 líneas
Modelo de datos de Proyecto.control (línea base, cortes, cambios, riesgos, cuaderno, Last Planner, Lean, Six Sigma y v2.5), controlVacio y normalizarControl.
PartidaBaseᵗ:12 · LineaBaseᵗ:27 · Corteᵗ:42 · TipoCambioᵗ:51 · EstadoCambioᵗ:52 · Cambioᵗ:53 · RespuestaRiesgoᵗ:66 · Riesgoᵗ:67 · TipoRegistroᵗ:80 · RegistroObraᵗ:81 · Hitoᵗ:99 · CompromisoFaseᵗ:109 · TIPOS_RESTRICCION:119 · Restriccionᵗ:120 · CAUSAS_NO_CUMPLIMIENTO:131 · Compromisoᵗ:146 · SemanaLpsᵗ:158 · Frenteᵗ:166 · Medicionᵗ:177 · GrupoTrabajoᵗ:188 · CATEGORIAS_CARTA:189 · CartaBalanceᵗ:205 · TIPOS_PERDIDA:216 · Perdidaᵗ:217 · ItemInspeccionᵗ:228 · Inspeccionᵗ:233 · PLANTILLAS_INSPECCION:243 · CATEGORIAS_6M:278 · Ishikawaᵗ:279 · FaseDmaicᵗ:286 · AccionDmaicᵗ:287 · ProyectoDmaicᵗ:294 · SerieCalidadᵗ:316 · Controlᵗ:326 · controlVacio:356 · normalizarControl:385

### `src/engine/control/recursos.ts` · 63 líneas
Histograma semanal de horas-hombre y horas-máquina, plan vs. real.
SemanaRecursosᵗ:10 · recursosSemanales:20

### `src/engine/control/sigma.ts` · 136 líneas
Six Sigma: cartas I-MR, capacidad de proceso, Pareto, Ishikawa, DMAIC.
CartaIMRᵗ:7 · cartaIMR:21 · normalAcumulada:58 · Capacidadᵗ:65 · capacidadProceso:80 · leerValores:122 · mejoraDmaic:131

### `src/engine/control/tablero.ts` · 118 líneas
Tablero de indicadores clave de todas las fases.
Tableroᵗ:19 · calcularTablero:60

### `src/engine/control/valorizaciones.ts` · 128 líneas
Valorizaciones mensuales con reajuste por fórmula polinómica, adelantos e IGV.
Valorizacionᵗ:11 · coeficienteK:34 · calcularValorizaciones:52

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

### `src/export/xlsx/costos.ts` · 413 líneas
Excel del expediente: insumos, metrados, resumen de metrados, APU, presupuesto y resumen de costos.
TIPOS:7 · insumosUsados:14 · planInsumos:22 · hojaInsumos:33 · hojaMetrados:92 · hojaResumenMetrados:143 · hojaApu:164 · filaUltimoDescendiente:266 · hojaPresupuesto:273 · completarGGPresupuesto:349 · hojaResumen:356

### `src/export/xlsx/datos.ts` · 95 líneas
Excel del expediente: hoja Datos (parámetros con nombre que usan las fórmulas de las demás hojas).
hojaDatos:7

### `src/export/xlsx/gg.ts` · 172 líneas
Excel del expediente: gastos generales y fórmula polinómica.
hojaGG:6 · hojaPolinomica:89

### `src/export/xlsx/index.ts` · 155 líneas
Exportación a Excel (.xlsx) totalmente editable: arma el libro con las hojas vinculadas por fórmulas (ver comun.ts).
generarXlsx:14

### `src/export/xlsx/programa.ts` · 384 líneas
Excel del expediente: cronograma, distribución por periodos, valorizado, calendarios y desembolsos.
hojaPrograma:7 · Bloqueᵗ:147 · planPeriodos:156 · apuPeriodos:165 · insumosAnticipacion:193 · hojaDistribucion:204 · filasValorizado:253 · hojaValorizado:259 · hojaCalendario:311 · hojaDesembolsos:348

### `src/export/xlsx/subpresupuestos.ts` · 108 líneas
Excel del expediente: una hoja por subpresupuesto (sus partidas vinculadas al Presupuesto y su propio pie) y el consolidado.
crearHojasSubpresupuestos:16 · hojasSubpresupuestos:27

## Importación y formatos — `src/io/`

### `src/io/banco.ts` · 389 líneas
Formatos del banco de datos: .epdb (ZIP con un JSON por tabla y un manifiesto con suma de comprobación), Excel editable y
FORMATO_EPDB:16 · Manifiestoᵗ:18 · ContenidoEpdbᵗ:30 · escribirEpdb:38 · leerEpdb:56 · textoRenglones:95 · leerRenglones:98 · COLUMNAS:116 · exportarBancoXlsx:149 · textoCelda:171 · filasHoja:184 · exportarBancoCsv:226 · leerCsv:235 · OpcionesImportacionᵗ:269 · bancoDeListaPrecios:292 · ArchivoBancoᵗ:325 · ResultadoBancoᵗ:330 · leerArchivoBanco:345

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

### `src/io/migrar.ts` · 73 líneas
Normaliza un proyecto leído de archivo: revisa su forma, aplica las migraciones numeradas
migrarProyecto:15 · esSoloLectura:65 · conEsquema:70

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

### `src/io/migraciones/03-presupuesto-avanzado.ts` · 10 líneas
Migración 3 → 4 (2.7 → 2.9): subpresupuestos, subpartidas y versiones del presupuesto (vacíos en proyectos anteriores).
nombre:4 · aplicar:6

### `src/io/migraciones/index.ts` · 41 líneas
Migraciones numeradas del archivo de proyecto: cada una lleva el esquema N al N + 1. Para agregar una:
Migracionᵗ:8 · MIGRACIONES:14 · ESQUEMA_ACTUAL:21 · esquemaDe:24 · migrar:30

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

### `src/ui/App.tsx` · 450 líneas
esPlantillaDeCarga:22 · App:41 · Aplicacion:84

### `src/ui/BancoDialogos.tsx` · 268 líneas
Ventanas del banco de datos: importar con revisión de fusión, actualizar precios del proyecto, agregar insumos y partidas del banco.
resumenFila:20 · Fusion:31 · ImportarAlBanco:111 · ActualizarPrecios:156 · AgregarInsumosBanco:215 · agregarAnalisis:257

### `src/ui/Barrera.tsx` · 31 líneas
Barrera de errores: si un módulo falla, el resto del programa sigue y el trabajo no se pierde.
Barrera:6

### `src/ui/BusquedaGlobal.tsx` · 72 líneas
Búsqueda global (Ctrl+K): partidas, insumos, módulos y acciones en una sola caja; Enter abre lo elegido.
BusquedaGlobal:16

### `src/ui/Cinta.tsx` · 141 líneas
Barra de herramientas tipo cinta (como S10, PowerCost o Delphin Express): Archivo, Edición, Partidas, Herramientas y Reportes.
Grupo:17 · B:26 · Menu:36 · Cinta:80

### `src/ui/Copias.tsx` · 85 líneas
Versiones del proyecto abierto: puntos de restauración automáticos (uno por día de trabajo) y manuales, y bitácora de cambios.
Copias:11

### `src/ui/Dialogos.tsx` · 313 líneas
Ventanas de la barra de herramientas: biblioteca, búsqueda, calculadoras, nuevo proyecto y atajos.
Dialogos:13 · Biblioteca:29 · Buscar:69 · CalculadoraHH:122 · CalculadoraCuadrilla:182 · NuevoProyecto:256 · Atajos:281

### `src/ui/FichaPartida.tsx` · 72 líneas
Ficha de partida: reúne en un panel todo lo de una partida (metrado, análisis, especificación, actividad, avance,
FichaPartida:12

### `src/ui/VistaTabla.tsx` · 99 líneas
Muestra en pantalla las mismas tablas que van a Excel y PDF.
VistaTabla:6 · VistaDocumento:43 · BloqueVista:51

### `src/ui/acciones.ts` · 87 líneas
Acciones compartidas por la barra de herramientas, los menús y los módulos.
generarArchivo:16 · accionesPartida:26

### `src/ui/almacen.ts` · 371 líneas
Almacén local de proyectos (IndexedDB del navegador, con respaldo en localStorage).
ResumenProyectoᵗ:6 · RegistroProyectoᵗ:21 · DIAS_PAPELERA:31 · Respaldoᵗ:33 · nuevoId:48 · resumir:50 · abrirDb:71 · tx:99 · modoAlmacen:127 · listarProyectos:137 · leerProyecto:142 · guardarRegistro:148 · guardarProyecto:157 · crearProyecto:189 · duplicarProyecto:193 · archivarProyecto:204 · eliminarProyecto:211 · listarPapelera:218 · diasEnPapelera:228 · restaurarDePapelera:230 · eliminarDefinitivo:238 · ultimoAbierto:246 · recordarUltimo:254 · proyectoV1:264 · olvidarV1:273 · respaldoCompleto:281 · restaurarRespaldo:287 · todasLasCopias:305 · CopiaProyectoᵗ:313 · listarCopias:328 · crearCopia:335 · eliminarCopia:347 · avisarGuardado:359 · alGuardarEnOtraPestana:364

### `src/ui/arbol.ts` · 165 líneas
Operaciones sobre el árbol de partidas (títulos y partidas) con códigos jerárquicos.
hijos:11 · descendientes:15 · siguienteCodigo:19 · cambiarPrefijo:40 · agregarTitulo:47 · ultimaHojaAntes:59 · agregarPartida:64 · eliminar:85 · mover:98 · renumerar:115 · duplicar:129 · aumentarNivel:142 · disminuirNivel:154

### `src/ui/bancoAlmacen.ts` · 67 líneas
Almacén del banco de datos en el navegador (IndexedDB, almacén `banco`, fuera de los proyectos) con puntos de restauración.
PuntoBancoᵗ:9 · leerBanco:20 · guardarBanco:33 · alCambiarBanco:43 · listarPuntos:56 · restaurarPunto:64

### `src/ui/componentes.tsx` · 445 líneas
parsearNumero:7 · EntradaNumero:33 · EntradaTexto:104 · AreaTexto:136 · Campo:157 · Pestanas:167 · Insignia:179 · Modal:183 · UMBRAL_VIRTUAL:208 · useFilasVirtuales:215 · Espaciador:258 · Columnaᵗ:269 · TablaEditable:301 · IconoCerrar:423 · IconoQuitar:426 · IconoMas:429 · IconoArriba:432 · IconoAbajo:435 · Marca:438

### `src/ui/control.ts` · 37 líneas
Ayudas comunes de los módulos de control de ejecución.
useControl:8 · opcionesPartidas:18 · opcionesFrentes:22 · opciones:26 · pct:28 · ind:29 · fc:30 · fechaCortaDM:31 · estadoIndice:33 · MIME_XLSX:36

### `src/ui/escritorio.ts` · 58 líneas
Puente con la app de escritorio (Electron, carpeta electron/). En el navegador no existe y nada cambia.
ComandoEscritorioᵗ:5 · InfoPestanaᵗ:15 · escritorio:33 · parametrosInicio:37 · ApiPaginaᵗ:48 · publicarApiPagina:55

### `src/ui/estado.ts` · 251 líneas
Estado del proyecto abierto: edición inmutable (immer), deshacer/rehacer y autoguardado en el almacén local.
Actualizarᵗ:18 · useProyecto:20 · Dialogoᵗ:139 · Contextoᵗ:141 · ModuloIdᵗ:162 · descargar:189 · elegirArchivos:201 · elegirArchivo:212 · leerLogo:223

### `src/ui/graficos.tsx` · 467 líneas
Gráficos SVG livianos para los módulos de control (sin librerías externas).
COLOR:5 · Serieᵗ:17 · GraficoLineas:27 · GraficoBarras:82 · GraficoPareto:134 · GraficoControl:167 · GraficoHistograma:221 · BarraApilada:255 · MatrizRiesgos:283 · DiagramaIshikawa:310 · Indicador:362 · GraficoProbabilidad:373 · GraficoFiebre:423

### `src/ui/iconos.tsx` · 49 líneas
Iconos de la barra de herramientas (trazo propio, 20 × 20).
Icono:42

### `src/ui/trabajo.ts` · 57 líneas
Lanza trabajos pesados (exportar, Monte Carlo) en un web worker para que la pantalla no se congele.
Trabajoᵗ:15 · enSegundoPlano:21

## Interfaz: módulos (una pantalla por archivo) — `src/ui/modulos/`

### `src/ui/modulos/Banco.tsx` · 341 líneas
Banco de datos (fuera de los proyectos): insumos, precios con fecha y fuente, análisis, cuadrillas, plantillas y proveedores;
useBanco:24 · ModBanco:39 · Insumos:104 · Historial:132 · Precios:155 · Analisis:196 · Cuadrillas:217 · Plantillas:235 · Proveedores:272 · Puntos:304

### `src/ui/modulos/Calidad.tsx` · 363 líneas
Plan de calidad ISO 9001: puntos de inspección por partida, protocolos con firma de liberación, productos no conformes
ModCalidad:22 · Plan:77 · Protocolos:127 · Pncs:225 · Liberacion:329

### `src/ui/modulos/Ccpm.tsx` · 108 líneas
Cadena crítica (CCPM): duraciones agresivas, colchón del proyecto, colchones de alimentación y gráfico de fiebre.
ModCcpm:11

### `src/ui/modulos/Control.tsx` · 662 líneas
Control de obra (PMBOK): tablero, línea base y avance, valor ganado, valorizaciones, cambios, riesgos, recursos y cuaderno.
ModControl:20 · SinLineaBase:76 · Tablero:119 · Avance:193 · CurvaControl:293 · ValorGanado:309 · Valorizaciones:349 · Cambios:427 · Riesgos:475 · Recursos:538 · Registros:564 · PartidasDeCambios:619 · TableroObra:659

### `src/ui/modulos/Cronogramas.tsx` · 118 líneas
CurvaS:9 · Histograma:48 · ModCronogramas:83

### `src/ui/modulos/Documentos.tsx` · 99 líneas
ModDocumentos:11

### `src/ui/modulos/Ejecucion.tsx` · 427 líneas
Ejecución con Lean Construction: frentes de trabajo, control de rendimientos, cartas balance, pérdidas e inspecciones 5S.
ModEjecucion:20 · Frentes:52 · Rendimientos:131 · Cartas:230 · Perdidas:307 · Inspecciones:360 · proponerRendimientos:418

### `src/ui/modulos/Exportar.tsx` · 81 líneas
ModExportar:9

### `src/ui/modulos/GastosGenerales.tsx` · 103 líneas
ModGG:7

### `src/ui/modulos/Insumos.tsx` · 263 líneas
celda:19 · leerListaPrecios:31 · ModInsumos:49 · TiposCambio:234

### `src/ui/modulos/Logistica.tsx` · 292 líneas
Kanban de materiales: tablero por estados, stock mínimo y punto de pedido, alertas y enlace con Last Planner.
ModLogistica:23 · Tablero:87 · Materiales:154 · Lista:196 · useProveedores:253 · Requerimiento:260

### `src/ui/modulos/Lps.tsx` · 446 líneas
Last Planner System: plan maestro e hitos, planificación por fases (pull), lookahead, restricciones, plan semanal y PPC.
ModLps:18 · Maestro:55 · Fases:110 · inicioVentana:180 · Lookahead:187 · Restricciones:253 · RestriccionesAutomaticas:302 · PlanSemanal:337 · Ppc:418

### `src/ui/modulos/Pendientes.tsx` · 60 líneas
Centro de pendientes: una sola lista con lo que requiere atención en todos los apartados (validación, restricciones,
ModPendientes:10

### `src/ui/modulos/Polinomica.tsx` · 67 líneas
ModPolinomica:5

### `src/ui/modulos/Presupuesto.tsx` · 498 líneas
ModPresupuesto:21 · PieResumen:134 · DetalleTitulo:160 · DetallePartida:185 · EditorApu:235 · EditorMetrados:361 · EditorPrograma:410 · EditorEett:455

### `src/ui/modulos/PresupuestoAvanzado.tsx` · 212 líneas
Presupuesto avanzado (2.9): subpresupuestos con su pie, subpartidas (análisis reutilizables dentro de otros APU) y piezas
filasDeSubpresupuesto:10 · SelectorSubpresupuesto:24 · CampoSubpresupuesto:37 · PiesSubpresupuestos:50 · partidaDeSubpartida:69 · SeccionSubpartidas:72 · guardarComoSubpartida:108 · GestionPresupuesto:124

### `src/ui/modulos/Programa.tsx` · 164 líneas
Gantt:9 · ModPrograma:70

### `src/ui/modulos/Proyecto.tsx` · 398 líneas
Configuración general del proyecto: datos que se copian solos a carátulas, encabezados, pies y formatos.
ModProyecto:14 · SelectorLogo:209 · FichaEntidad:241 · FichaResponsable:269 · FichaDocumento:285 · FichaTextos:321 · VistaPrevia:349

### `src/ui/modulos/Proyectos.tsx` · 245 líneas
Panel de proyectos: crear, abrir, duplicar, archivar, restaurar, eliminar, exportar y respaldar.
ModProyectos:21 · Papelera:204

### `src/ui/modulos/Resumen.tsx` · 148 líneas
Resumen del proyecto: indicadores, gráficos y puntos de atención calculados con engine/analisis.ts.
ModResumen:18 · ResumenExpediente:37

### `src/ui/modulos/Riesgo.tsx` · 300 líneas
Riesgo de plazo y costo: simulación Monte Carlo / PERT sobre la red CPM del cronograma.
ModRiesgo:19 · Configuracion:45 · SimulacionVista:98 · Resultados:159 · Estimaciones:217 · LlevarContingencia:264

### `src/ui/modulos/Sigma.tsx` · 339 líneas
Six Sigma / Lean Six Sigma: cartas de control, capacidad de proceso, Pareto, Ishikawa y proyectos DMAIC.
ModSigma:17 · Cartas:49 · Capacidad:104 · Pareto:179 · Ishikawas:222 · Dmaic:263

### `src/ui/modulos/Tdr.tsx` · 85 líneas
ModTdr:23

### `src/ui/modulos/Validacion.tsx` · 188 líneas
ModValidacion:30 · ObservacionesOrigen:90 · Integridad:146

### `src/ui/modulos/Valor.tsx` · 365 líneas
Ingeniería de valor y Target Value Design: costo meta por título, alternativas con índice de valor, matriz de
ModValor:28 · Metas:65 · opcionesAmbito:156 · Alternativas:160 · Matriz:299

### `src/ui/modulos/Versiones.tsx` · 172 líneas
Versiones del presupuesto (oferta, negociado, contractual…): guardar, restaurar, comparar lado a lado por partida, insumo y
ModVersiones:17

### `src/ui/modulos/registro.ts` · 67 líneas
Registro único de módulos. Para agregar uno:
ItemNavᵗ:35 · NAV:38 · MODULOS:40

## Línea de comandos — `cli/`

### `cli/banco.ts` · 131 líneas
Comandos de consola del banco de datos: expediente banco resumen|inicial|importar|exportar|enviar|actualizar-precios.
AYUDA_BANCO:17 · comandoBanco:58

### `cli/expediente.ts` · 293 líneas
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

### `scripts/e2e.ts` · 214 líneas
Pruebas de extremo a extremo con Playwright sobre dist/index.html (las corre `npm run verificar`).

### `scripts/extension.mjs` · 44 líneas
Arma la extensión de Firefox y de Chrome/Edge a partir de la misma interfaz web.

### `scripts/mapa.mjs` · 33 líneas
Genera docs/MAPA.md: qué hace cada archivo y en qué línea está cada función exportada.

### `scripts/probar-modulo.cjs` · 60 líneas
Prueba en el navegador UN solo módulo (o varios) sin recorrer todo el programa.

## Pruebas — `tests/`

### `tests/banco.test.ts` · 144 líneas
Versión 2.8 (etapa 2 del plan 3.0): banco de datos, sus formatos de intercambio, la fusión y el uso desde el proyecto.

### `tests/cimientos.test.ts` · 147 líneas
Versión 2.7 (etapa 1 del plan 3.0): esquema y migraciones, estructura del archivo, bitácora, cronograma incremental y registro de exportadores.

### `tests/control.test.ts` · 191 líneas

### `tests/integracion.test.ts` · 131 líneas
Versión 2.10 (etapa 4 del plan 3.0): integración de apartados — un dato se registra una vez y los demás módulos lo leen.

### `tests/mejoras.test.ts` · 143 líneas
Versión 2.6: cálculo incremental, calendario, análisis gerencial, integridad y organización del código.

### `tests/metodologias.test.ts` · 457 líneas
Pruebas de la versión 2.5: Earned Schedule, Monte Carlo / PERT, cadena crítica, kanban de materiales,

### `tests/motor.test.ts` · 315 líneas

### `tests/presupuesto.test.ts` · 209 líneas
Versión 2.9 (etapa 3 del plan 3.0): subpresupuestos, versiones del presupuesto, vigente, monedas, fórmulas en metrados y subpartidas.
