// Iconos de la barra de herramientas (trazo propio, 20 × 20).
const T = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const TRAZOS: Record<string, React.ReactNode> = {
  proyectos: (<><rect x="2.5" y="3" width="6.5" height="6" rx="1" {...T} /><rect x="11" y="3" width="6.5" height="6" rx="1" {...T} /><rect x="2.5" y="11" width="6.5" height="6" rx="1" {...T} /><rect x="11" y="11" width="6.5" height="6" rx="1" {...T} /></>),
  nuevo: (<><path d="M5 2.5h6.5l3.5 3.5v11.5H5z" {...T} /><path d="M11.5 2.5V6H15" {...T} /><path d="M10 9v6M7 12h6" {...T} /></>),
  abrir: (<><path d="M2.5 15.5V4.5h5l1.5 2h7.5v2.5" {...T} /><path d="M2.5 15.5l2.5-6.5h12.5l-2.5 6.5z" {...T} /></>),
  guardar: (<><path d="M3 3h11l3 3v11H3z" {...T} /><path d="M6 3v4.5h7V3M6 17v-5.5h8V17" {...T} /></>),
  importar: (<><path d="M10 2.5v9M6.5 8l3.5 3.5L13.5 8" {...T} /><path d="M3 12.5v4h14v-4" {...T} /></>),
  exportar: (<><path d="M10 11.5v-9M6.5 6L10 2.5 13.5 6" {...T} /><path d="M3 12.5v4h14v-4" {...T} /></>),
  deshacer: (<><path d="M7 5L3.5 8.5 7 12" {...T} /><path d="M3.5 8.5h8a4.5 4.5 0 010 9H8" {...T} /></>),
  rehacer: (<><path d="M13 5l3.5 3.5L13 12" {...T} /><path d="M16.5 8.5h-8a4.5 4.5 0 000 9H12" {...T} /></>),
  buscar: (<><circle cx="8.5" cy="8.5" r="5" {...T} /><path d="M12.3 12.3l4.7 4.7" {...T} /></>),
  titulo: (<><path d="M4 4.5h12M10 4.5v11" {...T} /><path d="M3 17.5h14" {...T} strokeWidth={1.1} /></>),
  subtitulo: (<><path d="M6 6h10M11 6v8" {...T} /><path d="M2.5 3v6.5H5" {...T} strokeWidth={1.2} /><path d="M5 17h12" {...T} strokeWidth={1.1} /></>),
  partida: (<><path d="M3 5h3M3 10h3M3 15h3" {...T} /><path d="M8.5 5h8.5M8.5 10h5" {...T} /><path d="M15.5 12.5v5M13 15h5" {...T} /></>),
  biblioteca: (<><path d="M3 3.5h3v13H3zM7 3.5h3v13H7z" {...T} /><path d="M11.3 4.3l2.9-.8 3.3 12.6-2.9.8z" {...T} /></>),
  duplicar: (<><rect x="6.5" y="6.5" width="10" height="10" rx="1" {...T} /><path d="M13.5 3.5h-10v10" {...T} /></>),
  eliminar: (<><path d="M3.5 5.5h13M8 5.5V3.5h4v2M5 5.5l1 11h8l1-11" {...T} /><path d="M8.5 8.5v5M11.5 8.5v5" {...T} /></>),
  subir: (<><path d="M10 16V4M5.5 8.5L10 4l4.5 4.5" {...T} /></>),
  bajar: (<><path d="M10 4v12M5.5 11.5L10 16l4.5-4.5" {...T} /></>),
  sangria: (<><path d="M3 4h14M9 8h8M9 12h8M3 16h14" {...T} /><path d="M3 8l3 2-3 2" {...T} /></>),
  desangria: (<><path d="M3 4h14M9 8h8M9 12h8M3 16h14" {...T} /><path d="M6 8l-3 2 3 2" {...T} /></>),
  renumerar: (<><path d="M3.5 4.5l1.5-1v5M3 8.5h3.5M3.2 12.5c.3-.9 2.8-1.2 2.8.4 0 1.2-2.8 2.4-2.8 3.6h3" {...T} strokeWidth={1.25} /><path d="M10 5h7M10 10h7M10 15h7" {...T} /></>),
  validar: (<><path d="M10 2.5l6 2.5v5c0 3.5-2.6 6-6 7.5-3.4-1.5-6-4-6-7.5V5z" {...T} /><path d="M7 10l2 2 4-4.5" {...T} /></>),
  calculadora: (<><rect x="4" y="2.5" width="12" height="15" rx="1.5" {...T} /><path d="M6.5 5.5h7v3h-7z" {...T} /><path d="M7 11.5h.01M10 11.5h.01M13 11.5h.01M7 14.5h.01M10 14.5h.01M13 14.5h.01" {...T} strokeWidth={2.2} /></>),
  cuadrilla: (<><circle cx="7" cy="6.5" r="2.5" {...T} /><circle cx="14" cy="7.5" r="2" {...T} /><path d="M2.5 16.5c.4-3 2.2-4.5 4.5-4.5s4.1 1.5 4.5 4.5M11.5 12.3c.7-.5 1.5-.8 2.5-.8 1.9 0 3.2 1.2 3.5 4" {...T} /></>),
  precios: (<><path d="M3 10.5V3h7.5l6.5 6.5-7.5 7.5z" {...T} /><circle cx="6.8" cy="6.8" r="1.2" {...T} /></>),
  excel: (<><rect x="3" y="3" width="14" height="14" rx="1.5" {...T} /><path d="M3 7.5h14M3 12h14M8 3v14" {...T} strokeWidth={1.1} /><path d="M10.5 9.3l3.5 4.9M14 9.3l-3.5 4.9" {...T} /></>),
  word: (<><path d="M5 2.5h6.5l3.5 3.5v11.5H5z" {...T} /><path d="M7 9.5l1.2 5 1.8-4 1.8 4 1.2-5" {...T} strokeWidth={1.3} /></>),
  pdf: (<><path d="M5 2.5h6.5l3.5 3.5v11.5H5z" {...T} /><path d="M7 15v-4h1.3a1.2 1.2 0 010 2.4H7M11 11h1.5v4M11 13h1.2" {...T} strokeWidth={1.2} /></>),
  msproject: (<><path d="M3 4h14M3 16h14" {...T} strokeWidth={1.1} /><path d="M4 7.5h6M8 10.5h6M12 13.5h4" {...T} strokeWidth={2.2} /></>),
  zip: (<><path d="M4 2.5h12v15H4z" {...T} /><path d="M10 2.5v2M10 6v1.5M10 9v1.5M8.8 12h2.4v2.5H8.8z" {...T} strokeWidth={1.3} /></>),
  configuracion: (<><path d="M3 5.5h8M14 5.5h3M3 10h3M9 10h8M3 14.5h9M15 14.5h2" {...T} /><circle cx="12.5" cy="5.5" r="1.5" {...T} /><circle cx="7.5" cy="10" r="1.5" {...T} /><circle cx="13.5" cy="14.5" r="1.5" {...T} /></>),
  atajos: (<><rect x="2.5" y="5" width="15" height="10" rx="1.5" {...T} /><path d="M5.5 8h.01M8.5 8h.01M11.5 8h.01M14.5 8h.01M6.5 12h7" {...T} strokeWidth={1.8} /></>),
  insumos: (<><path d="M10 2.5l7 3.5-7 3.5-7-3.5z" {...T} /><path d="M3 10l7 3.5 7-3.5M3 14l7 3.5 7-3.5" {...T} /></>),
  gantt: (<><path d="M3 3v14h14" {...T} strokeWidth={1.1} /><path d="M5 6h5M8 9.5h6M11 13h5" {...T} strokeWidth={2.2} /></>),
  archivar: (<><rect x="2.5" y="3.5" width="15" height="4" rx="1" {...T} /><path d="M4 7.5v9h12v-9M8 11h4" {...T} /></>),
  restaurar: (<><path d="M4 10a6 6 0 101.8-4.3" {...T} /><path d="M4 3.5v3h3" {...T} /></>),
};

export function Icono({ n, t = 20 }: { n: keyof typeof TRAZOS | string; t?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {TRAZOS[n] ?? null}
    </svg>
  );
}
