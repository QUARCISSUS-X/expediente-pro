// Control de proyectos durante la ejecución. Cada fase vive en su archivo de src/engine/control/;
// este índice los reexporta para que el resto del programa importe siempre desde './control'.
//   modelo · fechas · lineaBase · evm (PMBOK + Earned Schedule) · valorizaciones · cambios · recursos
//   lps (Last Planner) · lean (rendimientos y frentes) · sigma (Six Sigma) · tablero · demo
export * from './control/modelo';
export * from './control/fechas';
export * from './control/lineaBase';
export * from './control/evm';
export * from './control/valorizaciones';
export * from './control/cambios';
export * from './control/recursos';
export * from './control/lps';
export * from './control/lean';
export * from './control/sigma';
export * from './control/tablero';
export * from './control/demo';
