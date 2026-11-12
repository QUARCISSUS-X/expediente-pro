---
description: Desarrolla una etapa del plan de la versión 3.0 (uso: /etapa 1)
---
Desarrolla la **etapa $ARGUMENTS** de `docs/PLAN_V3.md`, con las decisiones de su sección 3 (no volver a preguntarlas).

1. Lee en `docs/PLAN_V3.md` solo la etapa $ARGUMENTS y las secciones 3 y 5. Si la tabla de estado muestra pendiente la etapa anterior, avísame antes de seguir.
2. Crea la rama `etapa-$ARGUMENTS` desde `main` actualizado.
3. Sigue `CLAUDE.md`: ubica el código con `docs/MAPA.md`, abre solo los tramos necesarios y verifica solo lo tocado mientras trabajas.
4. Haz una lista de tareas con los puntos de la etapa y su criterio «Listo cuando», y ve marcándolos.
5. Al terminar: `npm run verificar` completo, sube `version` en `package.json` y `package-lock.json`, agrega la sección en `docs/HISTORIAL.md`, marca la etapa como hecha en la tabla de estado del plan, haz commit, sube la rama y abre el PR hacia `main`.
6. Resúmeme en pocas líneas qué quedó, qué no y qué debo probar.
