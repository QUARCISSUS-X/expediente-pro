# Expediente Pro 3.0 — plan de desarrollo

Punto de partida: versión 2.6.0 (22 módulos, web + escritorio Windows + extensión Firefox/Chrome + línea de comandos, release automático).
Este plan se ejecuta por etapas: **una etapa = un chat nuevo = un PR = una versión**. Cada etapa deja el programa funcionando y publicable.

## 1. Qué cambia en la 3.0

Hoy cada proyecto es una isla: lleva dentro sus insumos, precios, análisis y plantillas, y los módulos de control se alimentan a mano.
La 3.0 convierte el programa en una plataforma con tres ideas:

1. **Base de datos propia (Banco).** Insumos, precios con fecha y fuente, análisis de precios, cuadrillas, plantillas y proveedores viven fuera del proyecto, se importan y exportan, y cualquier proyecto los toma o los devuelve.
2. **Apartados integrados.** Lo que se registra en un módulo alimenta a los demás: un cambio aprobado mueve el presupuesto vigente, el cronograma genera los pedidos del kanban, una restricción nace de un material atrasado o de un protocolo de calidad pendiente.
3. **Reportes de obra y de portafolio.** Informe semanal y mensual armados solos, comparación entre versiones del presupuesto y vista de todos los proyectos a la vez.

Se mantienen las decisiones tomadas: sin IA dentro del programa, sin conexión, sin flujo de caja, Last Planner sin sectorización ni trenes.

## 2. Hoja de ruta

| Etapa | Versión | Tema | Depende de | Tamaño |
|---|---|---|---|---|
| 1 | 2.7 | Cimientos: esquema versionado, migraciones, bitácora, rendimiento | — | 1 chat |
| 2 | 2.8 | Banco de datos: modelo, pantalla, importar y exportar | 1 | 2 chats |
| 3 | 2.9 | Presupuesto avanzado: subpresupuestos, versiones, vigente | 1 | 1–2 chats |
| 4 | 2.10 | Integración de apartados | 2, 3 | 2 chats |
| 5 | 2.11 | Reportes de obra y portafolio | 4 | 1–2 chats |
| 6 | 2.12 | Plataformas: actualización automática, archivos, PWA, tienda de Chrome | 1 | 1 chat |
| 7 | 3.0 | Experiencia de uso, guía, limpieza final y publicación | todas | 1 chat |
| 8 | 3.1 | VDC/BIM: visor IFC, 5D y 4D | 3 | 2–3 chats |

Las etapas 2, 3 y 6 no dependen entre sí: se pueden hacer en cualquier orden después de la 1.

---

## Etapa 1 · Cimientos (2.7)

Sin esto, las etapas siguientes rompen proyectos guardados.

- **Esquema versionado.** `proyecto.esquema` (número) y migraciones numeradas en `src/io/migraciones/NN-nombre.ts` (hoy todo está en `migrar.ts`). Un proyecto de un esquema más nuevo que el programa se abre en solo lectura con aviso.
- **Validación de estructura al importar.** Antes de migrar se revisa que el archivo tenga la forma mínima; un archivo ajeno o truncado da un mensaje claro en vez de un error.
- **Bitácora de cambios.** Cada `actualizar` puede llevar una etiqueta («Metrado de 02.03», «Precio de cemento»); se guardan las últimas 500 con fecha. Se ve en «Versiones» y alimenta los informes.
- **Papelera de proyectos.** Eliminar manda a papelera 30 días.
- **Rendimiento.** Exportadores y Monte Carlo en un *web worker* (la pantalla no se congela); tablas largas con filas virtuales (presupuestos de más de 1 000 partidas); cronograma incremental como ya lo es el presupuesto.
- **Código.** Dividir `src/export/xlsx.ts` (1 500 líneas) por hoja; registro único de exportadores (como el de módulos) para que agregar un entregable sea un solo lugar; pruebas de extremo a extremo con Playwright en `npm run verificar`.

**Listo cuando:** los proyectos de 2.0 a 2.6 abren igual; `xlsx.ts` ya no es excepción en la prueba de tamaño; exportar el ZIP no bloquea la interfaz.

## Etapa 2 · Banco de datos (2.8)

El apartado de importación y exportación de base de datos.

**Modelo** (`src/engine/banco.ts`, almacén `banco` en IndexedDB, fuera de los proyectos):

| Tabla | Contenido | Clave |
|---|---|---|
| Insumos | código, descripción, unidad, tipo, índice unificado, grupo | código |
| Precios | insumo, precio, moneda, fecha, lugar, fuente (cotización, revista, proveedor), vigencia | insumo + fecha + lugar + fuente |
| Análisis | partida tipo, unidad, rendimiento, jornada, renglones, especialidad | código |
| Cuadrillas | composición reutilizable de mano de obra | nombre |
| Plantillas | especificaciones técnicas, gastos generales, calendarios, documentos | clave |
| Proveedores | razón social, RUC, contacto, rubros, cotizaciones recibidas | RUC |

**Pantalla nueva «Banco de datos»** (grupo Expediente): pestañas por tabla, búsqueda, filtros por fecha, lugar y fuente, historial de precio de un insumo con su gráfico.

**Exportar**
- `.epdb`: un ZIP con un JSON por tabla y un manifiesto (versión, fecha, conteos, suma de comprobación). Es el formato de respaldo, de traslado entre equipos y de intercambio con colegas.
- Excel: una hoja por tabla, editable y reimportable (misma idea que la plantilla de carga).
- CSV por tabla, para otros programas.
- El respaldo completo actual (`respaldoCompleto`) pasa a ser un `.epdb` con proyectos + banco + versiones.

**Importar**
- `.epdb`, Excel y CSV propios.
- Bases de S10, Delphin y PowerCost exportadas a Excel (reutiliza `importarExpediente.ts`), listas de precios de Revista Costos o presupuestos.pe en Excel, y cualquier proyecto `.expediente.json` («enviar al banco»).
- **Pantalla de fusión:** antes de escribir muestra nuevos, iguales y en conflicto; por cada conflicto se elige conservar, reemplazar o guardar ambos, con una regla por defecto (gana el precio más reciente). Nada se escribe sin esa revisión, y deja un punto de restauración.

**Uso desde el proyecto**
- Agregar partidas e insumos buscando en el banco (reemplaza a `catalogo.ts` y `biblioteca.ts`, que quedan como banco inicial).
- «Actualizar precios»: compara el proyecto con el banco a una fecha y lugar, muestra la diferencia por insumo y el efecto en el total, y aplica lo elegido.
- «Enviar al banco»: los análisis y precios afinados en una obra vuelven al banco.

**Línea de comandos:** `banco importar|exportar|resumen|actualizar-precios`.

**Listo cuando:** exportar el banco, borrarlo e importarlo lo deja idéntico; importar dos veces el mismo archivo no duplica; un proyecto actualizado de precios conserva 0 diferencias entre Excel y motor.

## Etapa 3 · Presupuesto avanzado (2.9)

- **Subpresupuestos** (estructuras, arquitectura, instalaciones…): cada uno con su pie, y un consolidado. Es el cambio de modelo más grande: `Proyecto.partidas` pasa a agruparse por subpresupuesto.
- **Versiones del presupuesto** (escenarios con nombre): «oferta», «negociado», «contractual». Comparación lado a lado por partida, insumo y total, exportable.
- **Presupuesto vigente:** contractual + adicionales − deductivos aprobados. Lo usa el control en lugar de la línea base fija.
- **Varias monedas** con tipo de cambio por fecha, e insumos en moneda distinta a la del proyecto.
- **Fórmulas en metrados** (`2*(3.5+4.2)`), con evaluador propio (sin `eval`, por la extensión).
- **Partidas y análisis compuestos:** subpartidas dentro de un APU.

**Listo cuando:** un presupuesto con tres subpresupuestos genera sus hojas y su consolidado; comparar dos versiones cuadra con la resta de totales.

## Etapa 4 · Integración de apartados (2.10)

Regla: **un dato se registra una vez** y los demás módulos lo leen. Enlaces a construir:

| Origen | Destino | Qué hace |
|---|---|---|
| Cambios aprobados (Control) | Presupuesto vigente, cronograma | El adicional o deductivo aprobado entra al vigente y ajusta el plazo |
| Cronograma + insumos | Kanban de materiales | Genera el requerimiento por semana (cantidad y fecha de necesidad) |
| Kanban, calidad, RFI | Restricciones de Last Planner | Material atrasado, protocolo pendiente o consulta sin responder crean la restricción sola |
| Calidad (liberación por frente) | Valorización | Solo se valoriza lo liberado, o se marca como observado |
| Riesgo (Monte Carlo) | Gastos generales, CCPM | La contingencia calculada se propone como partida de GG y como amortiguador |
| Ingeniería de valor | Versiones del presupuesto | Una alternativa aceptada se aplica como versión nueva y se compara |
| Rendimientos reales (Lean) | Banco de datos | El rendimiento medido en obra se propone como actualización del análisis |
| Proveedores (Banco) | Kanban, precios | Cada pedido y cada precio apunta a su proveedor y cotización |

Además:
- **Ficha de partida:** un panel que reúne, para una partida, metrado, análisis, especificación, actividad, avance, valorizado, cambios, restricciones, protocolos y materiales. Se abre desde cualquier módulo.
- **Búsqueda global (Ctrl+K):** partidas, insumos, módulos y acciones.
- **Centro de pendientes:** una sola lista con lo que requiere atención en todos los apartados.
- **Tablero único:** Resumen (expediente) y Tablero (control) se unen en una vista por etapa del proyecto.

**Listo cuando:** en el proyecto de demostración, aprobar un adicional cambia el vigente, el EAC y el requerimiento de materiales sin tocar nada más.

## Etapa 5 · Reportes de obra y portafolio (2.11)

- **Informe semanal e informe mensual de obra** (PDF y Word): avance, curva S real contra programada, valor ganado, PPC y causas, restricciones, calidad, cambios, fotos y bitácora del periodo. Se arman del periodo elegido.
- **Constructor de reportes:** elegir secciones, orden y logos; guardar la combinación como plantilla.
- **Portafolio:** todos los proyectos en una pantalla (monto, avance, CPI, SPI, alertas) y su reporte consolidado.
- **Plantillas de Word propias:** el usuario sube su formato con marcadores y el programa lo llena.
- **Excel de control con fórmulas vinculadas**, como ya lo tiene el presupuesto.
- **Fotos y adjuntos** por partida, protocolo y cuaderno de obra (guardados aparte para no engordar el proyecto).

**Listo cuando:** el informe mensual de la demostración sale completo sin editar nada y sus cifras coinciden con el tablero.

## Etapa 6 · Plataformas (2.12)

- **Escritorio:** actualización automática desde los releases de GitHub; doble clic en un `.expediente.json` o `.epdb` abre el programa; guardar directo en una carpeta (OneDrive, Dropbox) con autoguardado al archivo; instalador firmado si se compra un certificado.
- **Web:** publicación en GitHub Pages como aplicación instalable (PWA) que funciona sin conexión; abrir y guardar archivos en su sitio con la API de archivos del navegador.
- **Extensión:** publicación en Chrome Web Store y en la tienda pública de Firefox; aviso de respaldo periódico (sus datos se pierden al desinstalar).
- **Sincronización entre equipos por archivo:** una carpeta compartida con el `.epdb`; al abrir se detecta si hay una copia más nueva y se fusiona con la pantalla de la etapa 2. Sin servidor.
- **Línea de comandos y skill:** comandos `banco`, `comparar`, `informe-obra`; actualizar la skill expediente-pro con todo lo nuevo.

## Etapa 7 · Cierre de la 3.0

- Recorrido inicial para proyectos nuevos y proyecto de demostración que muestre todos los enlaces.
- Tema oscuro, impresión limpia, revisión de accesibilidad y de teclado.
- Guía de uso reescrita por flujo de trabajo (cotizar, armar expediente, controlar obra, mantener el banco).
- Prueba de migración con proyectos reales de las versiones 2.x; prueba de carga con 2 000 partidas.
- Limpieza: quitar código y formatos que quedaron sustituidos; `CLAUDE.md` y `docs/MAPA.md` al día.

## Etapa 8 · VDC/BIM (3.1)

Va después de la 3.0 porque es la única etapa que necesita una dependencia pesada (lector IFC en WebAssembly) y no bloquea nada.

- Visor IFC dentro del programa (rotar, cortar, aislar por nivel y tipo).
- **5D:** metrados sacados del modelo y enlazados a partidas; el cambio de modelo muestra la diferencia de metrado.
- **4D:** simulación del cronograma sobre el modelo, programado contra real.
- La extensión necesita permiso de WebAssembly en su manifiesto; la versión de un solo archivo HTML crecerá varios megabytes.

---

## 3. Decisiones que necesito de ti antes de empezar

1. **Numeración.** Propongo 2.7 a 2.12 como etapas y 3.0 como cierre. La alternativa es llamarlas 3.0-etapa 1 a 7 y publicar solo al final.
2. **BIM dentro o fuera de la 3.0.** Lo dejé como 3.1. Si lo quieres dentro, la 3.0 se retrasa dos o tres etapas.
3. **Subpresupuestos.** Es el cambio de modelo más grande. Si tus expedientes siempre van en un solo presupuesto, se puede dejar fuera y ahorrar una etapa.
4. **Fuentes del banco.** ¿De qué programas tienes bases reales para importar (S10, Delphin, PowerCost, Excel propios)? Con un archivo de muestra de cada uno el importador se prueba contra datos reales.
5. **Web pública.** Publicar en GitHub Pages hace el programa accesible a cualquiera con el enlace (tus datos siguen solo en tu navegador). ¿Lo quieres público o solo para ti?
6. **Tiendas.** Chrome Web Store cobra un registro único de desarrollador; la tienda pública de Firefox pasa por revisión humana.

## 4. Cómo pedir cada etapa

En un chat nuevo con el repositorio:

> Expediente Pro: desarrolla la **etapa N** de `docs/PLAN_V3.md`. Sigue `CLAUDE.md`, ubica el código con `docs/MAPA.md`, y al terminar sube la versión, anota `docs/HISTORIAL.md` y abre el PR.

Al unir el PR a `main`, el release con el instalador, el portable, el ZIP y las extensiones se publica solo.
