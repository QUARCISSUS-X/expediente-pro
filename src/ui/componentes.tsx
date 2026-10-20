import { useEffect, useRef, useState, type ReactNode } from 'react';
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
}

export function EntradaNumero({ valor, alCambiar, decimales = 2, placeholder, className, ariaLabel, permitirVacio = true, onKeyDown, dataF, dataC }: EntradaNumeroProps) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const mostrar = valor === null || valor === undefined || (valor as unknown) === '' ? '' : fmt(Number(valor), decimales);
  const confirmar = () => {
    setEditando(false);
    const n = parsearNumero(texto);
    if (n === null && !permitirVacio) return;
    if (n !== (valor ?? null)) alCambiar(n);
  };
  return (
    <input
      className={className}
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      data-f={dataF}
      data-c={dataC}
      value={editando ? texto : mostrar}
      onFocus={(e) => {
        setEditando(true);
        setTexto(valor === null || valor === undefined ? '' : String(valor));
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

// ------------------------------------------------------------ tabla editable

export interface Columna<T> {
  clave: string;
  titulo: string;
  tipo?: 'texto' | 'numero' | 'select' | 'lectura' | 'casilla';
  ancho?: number | string;
  decimales?: number;
  opciones?: { valor: string; texto: string }[];
  valor: (fila: T, i: number) => unknown;
  cambiar?: (fila: T, v: unknown, i: number) => void;
  num?: boolean;
  placeholder?: string;
  lista?: string;
  formato?: (fila: T, i: number) => ReactNode;
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
    } else if (e.key === 'Enter') {
      (t as HTMLInputElement).blur();
    }
  };
  return (
    <div className="tabla-marco" style={alto ? { maxHeight: alto } : undefined}>
      <table className="tabla" ref={ref} aria-label={etiqueta}>
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
          {filas.map((f, i) => (
            <tr key={clave(f, i)} className={[claseFila?.(f, i), alClicFila ? 'clic' : ''].filter(Boolean).join(' ')} onClick={alClicFila ? () => alClicFila(f, i) : undefined}>
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
                      <EntradaNumero valor={v as number | null} decimales={c.decimales ?? 2} placeholder={c.placeholder} ariaLabel={c.titulo} alCambiar={(x) => c.cambiar!(f, x, i)} onKeyDown={mover} dataF={i} dataC={ci} />
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
                    <EntradaTexto valor={(v as string) ?? ''} placeholder={c.placeholder} ariaLabel={c.titulo} lista={c.lista} alCambiar={(x) => c.cambiar!(f, x, i)} onKeyDown={mover} dataF={i} dataC={ci} />
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
          ))}
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
