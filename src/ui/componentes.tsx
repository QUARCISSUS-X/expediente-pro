import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { esFormula, evaluarExpresion } from '../engine/expresion';
import { fmt } from '../engine/util';

// ------------------------------------------------------------ entradas

function parsearNumero(t: string): number | null {
  const s = t.trim().replace(/\s/g, '');
  if (s === '') return null;
  // admite 1,234.56 y 1234,56
  let n: number;
  if (/^-?[\d.]+,\d+$/.test(s) && !/,.*,/.test(s) && s.includes('.') === false) n = parseFloat(s.replace(',', '.'));
  else n = parseFloat(s.replace(/,/g, ''));
  return isFinite(n) ? n : null;
}

interface EntradaNumeroProps {
  valor: number | null | undefined;
  alCambiar: (v: number | null) => void;
  decimales?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  permitirVacio?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  dataF?: number;
  dataC?: number;
  /** Con esto la casilla acepta fórmulas («2*(3.5+4.2)»): recibe el resultado y el texto de la fórmula (o undefined). */
  alCambiarFormula?: (v: number | null, formula: string | undefined) => void;
  formula?: string;
}

export function EntradaNumero({ valor, alCambiar, decimales = 2, placeholder, className, ariaLabel, permitirVacio = true, onKeyDown, dataF, dataC, alCambiarFormula, formula }: EntradaNumeroProps) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mostrar = valor === null || valor === undefined || (valor as unknown) === '' ? '' : fmt(Number(valor), decimales);
  const confirmar = () => {
    setEditando(false);
    if (alCambiarFormula) {
      const t = texto.trim();
      if (esFormula(t)) {
        try {
          const v = evaluarExpresion(t);
          setError(null);
          if (v !== (valor ?? null) || t !== formula) alCambiarFormula(v, t.replace(/^=/, ''));
        } catch (e) {
          setError((e as Error).message);
        }
        return;
      }
      setError(null);
      const n = parsearNumero(t);
      if (n === null && !permitirVacio) return;
      if (n !== (valor ?? null) || formula) alCambiarFormula(n, undefined);
      return;
    }
    const n = parsearNumero(texto);
    if (n === null && !permitirVacio) return;
    if (n !== (valor ?? null)) alCambiar(n);
  };
  return (
    <input
      className={[className, formula ? 'con-formula' : '', error ? 'con-error' : ''].filter(Boolean).join(' ') || undefined}
      title={error ? `Fórmula no válida: ${error}` : formula ? `= ${formula}` : undefined}
      aria-invalid={error ? true : undefined}
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      data-f={dataF}
      data-c={dataC}
      value={editando ? texto : mostrar}
      onFocus={(e) => {
        setEditando(true);
        setTexto(formula ?? (valor === null || valor === undefined ? '' : String(valor)));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setTexto(valor === null || valor === undefined ? '' : String(valor));
          (e.target as HTMLInputElement).blur();
        }
        onKeyDown?.(e);
      }}
    />
  );
}

interface EntradaTextoProps {
  valor: string | undefined;
  alCambiar: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  lista?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  dataF?: number;
  dataC?: number;
  type?: string;
}

export function EntradaTexto({ valor, alCambiar, placeholder, className, ariaLabel, lista, onKeyDown, dataF, dataC, type }: EntradaTextoProps) {
  const [texto, setTexto] = useState(valor ?? '');
  const enfocado = useRef(false);
  useEffect(() => {
    if (!enfocado.current) setTexto(valor ?? '');
  }, [valor]);
  return (
    <input
      type={type ?? 'text'}
      className={className}
      aria-label={ariaLabel}
      placeholder={placeholder}
      list={lista}
      data-f={dataF}
      data-c={dataC}
      value={texto}
      onFocus={() => (enfocado.current = true)}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        enfocado.current = false;
        if (texto !== (valor ?? '')) alCambiar(texto);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setTexto(valor ?? '');
        }
        onKeyDown?.(e);
      }}
    />
  );
}

export function AreaTexto({ valor, alCambiar, filas = 4, placeholder }: { valor: string; alCambiar: (v: string) => void; filas?: number; placeholder?: string }) {
  const [texto, setTexto] = useState(valor ?? '');
  const enfocado = useRef(false);
  useEffect(() => {
    if (!enfocado.current) setTexto(valor ?? '');
  }, [valor]);
  return (
    <textarea
      rows={filas}
      value={texto}
      placeholder={placeholder}
      onFocus={() => (enfocado.current = true)}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        enfocado.current = false;
        if (texto !== valor) alCambiar(texto);
      }}
    />
  );
}

export function Campo({ etiqueta, ayuda, children, className }: { etiqueta: string; ayuda?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`campo ${className ?? ''}`}>
      <span>{etiqueta}</span>
      {children}
      {ayuda && <small className="ayuda">{ayuda}</small>}
    </label>
  );
}

export function Pestanas<T extends string>({ valor, opciones, alCambiar }: { valor: T; opciones: { id: T; texto: string; extra?: ReactNode }[]; alCambiar: (v: T) => void }) {
  return (
    <div className="pestanas" role="tablist">
      {opciones.map((o) => (
        <button key={o.id} role="tab" aria-selected={valor === o.id} onClick={() => alCambiar(o.id)}>
          {o.texto} {o.extra}
        </button>
      ))}
    </div>
  );
}

export function Insignia({ estado, children }: { estado: 'ok' | 'advertencia' | 'error' | 'neutra'; children: ReactNode }) {
  return <span className={`insignia ${estado}`}>{children}</span>;
}

export function Modal({ titulo, children, alCerrar, pie }: { titulo: string; children: ReactNode; alCerrar: () => void; pie?: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [alCerrar]);
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-cab">
          <h2>{titulo}</h2>
          <button className="boton-icono" onClick={alCerrar} aria-label="Cerrar">
            <IconoCerrar />
          </button>
        </div>
        <div className="modal-cuerpo">{children}</div>
        {pie && <div className="modal-pie">{pie}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ filas virtuales

/** Desde cuántas filas una tabla dibuja solo las visibles (presupuestos de más de 1 000 partidas). */
export const UMBRAL_VIRTUAL = 300;
const MARGEN_FILAS = 25;

/**
 * Filas virtuales para una tabla dentro de un marco con desplazamiento propio: devuelve el tramo [desde, hasta)
 * que hay que dibujar y el alto de los espaciadores de arriba y abajo. Con pocas filas dibuja todas.
 */
export function useFilasVirtuales(n: number, altoInicial = 29) {
  const marco = useRef<HTMLDivElement>(null);
  const alto = useRef(altoInicial);
  const activa = n > UMBRAL_VIRTUAL;
  const [ventana, setVentana] = useState({ desde: 0, hasta: Math.min(n, 80) });
  const calcular = useCallback(() => {
    const el = marco.current;
    if (!el) return;
    const tr = el.querySelector<HTMLElement>('tbody tr[data-v]');
    if (tr?.offsetHeight) alto.current = tr.offsetHeight;
    const h = alto.current;
    const cab = el.querySelector<HTMLElement>('thead')?.offsetHeight ?? 0;
    const desde = Math.max(0, Math.floor((el.scrollTop - cab) / h) - MARGEN_FILAS);
    const hasta = Math.min(n, Math.ceil((el.scrollTop + el.clientHeight) / h) + MARGEN_FILAS);
    setVentana((v) => (v.desde === desde && v.hasta === hasta ? v : { desde, hasta }));
  }, [n]);
  useEffect(() => {
    if (!activa) return;
    calcular();
    const el = marco.current;
    el?.addEventListener('scroll', calcular, { passive: true });
    window.addEventListener('resize', calcular);
    return () => {
      el?.removeEventListener('scroll', calcular);
      window.removeEventListener('resize', calcular);
    };
  }, [activa, calcular]);
  /** Lleva la fila i a la vista (aunque todavía no esté dibujada). */
  const irA = useCallback((i: number) => {
    const el = marco.current;
    if (!el || !activa || i < 0) return;
    const h = alto.current;
    const cab = el.querySelector<HTMLElement>('thead')?.offsetHeight ?? 0;
    const y = cab + i * h;
    if (y < el.scrollTop + cab || y + h > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, y - el.clientHeight / 2);
  }, [activa]);
  if (!activa) return { marco, activa, desde: 0, hasta: n, arriba: 0, abajo: 0, irA };
  const hasta = Math.min(n, ventana.hasta);
  const desde = Math.min(ventana.desde, hasta);
  return { marco, activa, desde, hasta, arriba: desde * alto.current, abajo: (n - hasta) * alto.current, irA };
}

/** Fila vacía que ocupa el lugar de las filas no dibujadas. */
export function Espaciador({ alto, columnas }: { alto: number; columnas: number }) {
  if (alto <= 0) return null;
  return (
    <tr aria-hidden="true" className="espaciador">
      <td colSpan={columnas} style={{ height: alto, padding: 0, border: 0 }} />
    </tr>
  );
}

// ------------------------------------------------------------ tabla editable

export interface Columna<T> {
  clave: string;
  titulo: string;
  tipo?: 'texto' | 'numero' | 'select' | 'lectura' | 'casilla' | 'fecha';
  ancho?: number | string;
  decimales?: number;
  opciones?: { valor: string; texto: string }[];
  valor: (fila: T, i: number) => unknown;
  cambiar?: (fila: T, v: unknown, i: number) => void;
  num?: boolean;
  placeholder?: string;
  lista?: string;
  formato?: (fila: T, i: number) => ReactNode;
  /** Columnas numéricas que aceptan fórmulas: el texto guardado y cómo cambiar valor y fórmula a la vez. */
  formula?: (fila: T) => string | undefined;
  cambiarFormula?: (fila: T, v: number | null, formula: string | undefined, i: number) => void;
  clase?: (fila: T) => string | undefined;
}

interface TablaProps<T> {
  filas: T[];
  columnas: Columna<T>[];
  clave: (f: T, i: number) => string;
  alEliminar?: (f: T, i: number) => void;
  pie?: ReactNode;
  vacio?: ReactNode;
  claseFila?: (f: T, i: number) => string | undefined;
  alClicFila?: (f: T, i: number) => void;
  alto?: number | string;
  etiqueta?: string;
}

export function TablaEditable<T>({ filas, columnas, clave, alEliminar, pie, vacio, claseFila, alClicFila, alto, etiqueta }: TablaProps<T>) {
  const ref = useRef<HTMLTableElement>(null);
  const v = useFilasVirtuales(filas.length);
  const nCol = columnas.length + (alEliminar ? 1 : 0);
  // una tabla larga necesita su propio desplazamiento para dibujar solo lo visible
  const altoMarco = alto ?? (v.activa ? 'calc(100vh - 260px)' : undefined);
  const mover = (e: React.KeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    const f = Number(t.dataset.f);
    const c = Number(t.dataset.c);
    if (Number.isNaN(f)) return;
    let destino: [number, number] | null = null;
    if (e.key === 'Enter' || e.key === 'ArrowDown') destino = [f + 1, c];
    else if (e.key === 'ArrowUp') destino = [f - 1, c];
    if (!destino) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-f="${destino[0]}"][data-c="${destino[1]}"]`);
    if (el) {
      e.preventDefault();
      (t as HTMLInputElement).blur();
      el.focus();
      if (v.activa) el.scrollIntoView({ block: 'nearest' });
    } else if (v.activa && destino[0] >= 0 && destino[0] < filas.length) {
      e.preventDefault();
      v.irA(destino[0]);
      const [ff, cc] = destino;
      window.setTimeout(() => ref.current?.querySelector<HTMLElement>(`[data-f="${ff}"][data-c="${cc}"]`)?.focus(), 30);
    } else if (e.key === 'Enter') {
      (t as HTMLInputElement).blur();
    }
  };
  return (
    <div className="tabla-marco" ref={v.marco} style={altoMarco ? { maxHeight: altoMarco } : undefined}>
      <table className="tabla" ref={ref} aria-label={etiqueta} aria-rowcount={v.activa ? filas.length + 1 : undefined}>
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.clave} className={c.num || c.tipo === 'numero' ? 'num' : undefined} style={c.ancho ? { width: c.ancho } : undefined}>
                {c.titulo}
              </th>
            ))}
            {alEliminar && <th className="acc" aria-label="Acciones" />}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && vacio && (
            <tr>
              <td colSpan={columnas.length + (alEliminar ? 1 : 0)} style={{ height: 'auto', padding: 0 }}>
                {vacio}
              </td>
            </tr>
          )}
          <Espaciador alto={v.arriba} columnas={nCol} />
          {filas.slice(v.desde, v.hasta).map((f, k) => { const i = v.desde + k; return (
            <tr key={clave(f, i)} data-v="" className={[claseFila?.(f, i), alClicFila ? 'clic' : ''].filter(Boolean).join(' ')} onClick={alClicFila ? () => alClicFila(f, i) : undefined}>
              {columnas.map((c, ci) => {
                const v = c.valor(f, i);
                const num = c.num || c.tipo === 'numero';
                const editable = !!c.cambiar && c.tipo !== 'lectura';
                const cls = [editable ? 'editable' : '', num ? 'num' : '', c.clase?.(f) ?? ''].filter(Boolean).join(' ');
                if (!editable)
                  return (
                    <td key={c.clave} className={cls}>
                      {c.formato ? c.formato(f, i) : num && typeof v === 'number' ? fmt(v, c.decimales ?? 2) : (v as ReactNode)}
                    </td>
                  );
                if (c.tipo === 'numero')
                  return (
                    <td key={c.clave} className={cls}>
                      <EntradaNumero valor={v as number | null} decimales={c.decimales ?? 2} placeholder={c.placeholder} ariaLabel={c.titulo} alCambiar={(x) => c.cambiar!(f, x, i)} onKeyDown={mover} dataF={i} dataC={ci} formula={c.formula?.(f)} alCambiarFormula={c.cambiarFormula ? (x, fo) => c.cambiarFormula!(f, x, fo, i) : undefined} />
                    </td>
                  );
                if (c.tipo === 'select')
                  return (
                    <td key={c.clave} className={cls}>
                      <select value={(v as string) ?? ''} aria-label={c.titulo} data-f={i} data-c={ci} onChange={(e) => c.cambiar!(f, e.target.value, i)}>
                        {c.opciones?.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.texto}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                if (c.tipo === 'casilla')
                  return (
                    <td key={c.clave} className={cls} style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!v} aria-label={c.titulo} onChange={(e) => c.cambiar!(f, e.target.checked, i)} style={{ width: 16, height: 16 }} />
                    </td>
                  );
                return (
                  <td key={c.clave} className={cls}>
                    <EntradaTexto valor={(v as string) ?? ''} placeholder={c.placeholder} ariaLabel={c.titulo} lista={c.lista} alCambiar={(x) => c.cambiar!(f, x, i)} onKeyDown={mover} dataF={i} dataC={ci} type={c.tipo === 'fecha' ? 'date' : undefined} />
                  </td>
                );
              })}
              {alEliminar && (
                <td className="acc">
                  <button
                    className="boton-icono"
                    title="Quitar fila"
                    aria-label="Quitar fila"
                    onClick={(e) => {
                      e.stopPropagation();
                      alEliminar(f, i);
                    }}
                  >
                    <IconoQuitar />
                  </button>
                </td>
              )}
            </tr>
          ); })}
          <Espaciador alto={v.abajo} columnas={nCol} />
        </tbody>
        {pie && <tfoot>{pie}</tfoot>}
      </table>
    </div>
  );
}

// ------------------------------------------------------------ iconos (trazo propio)

export const IconoCerrar = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);
export const IconoQuitar = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);
export const IconoMas = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);
export const IconoArriba = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 8.5L7 4.5l4 4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const IconoAbajo = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5.5L7 9.5l4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const Marca = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <rect x="1.5" y="1.5" width="19" height="19" rx="2" fill="none" stroke="#7fb3a8" strokeWidth="1.4" />
    <path d="M1.5 14.5h19M12.5 14.5v6" stroke="#7fb3a8" strokeWidth="1.4" />
    <path d="M5 11l3-4 3 2.5 4-5" stroke="#e9ede8" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
