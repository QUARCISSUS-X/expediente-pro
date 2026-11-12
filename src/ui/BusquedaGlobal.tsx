// Búsqueda global (Ctrl+K): partidas, insumos, módulos y acciones en una sola caja; Enter abre lo elegido.
import { useMemo, useState } from 'react';
import type { Contexto, ModuloId } from './estado';
import { NAV } from './modulos/registro';

interface Resultado {
  clave: string;
  grupo: 'Acción' | 'Módulo' | 'Partida' | 'Insumo';
  texto: string;
  detalle?: string;
  hacer: () => void;
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function BusquedaGlobal({ ctx, alCerrar, abrirFicha }: { ctx: Contexto; alCerrar: () => void; abrirFicha: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const ir = (m: ModuloId, partida?: string) => () => { alCerrar(); ctx.ir(m, partida); };
  const todos = useMemo<Resultado[]>(() => {
    const acciones: Resultado[] = [
      { clave: 'a-zip', grupo: 'Acción', texto: 'Exportar todos los entregables (ZIP)', hacer: () => { alCerrar(); ctx.exportar('zip'); } },
      { clave: 'a-guardar', grupo: 'Acción', texto: 'Guardar una copia del proyecto (.json)', hacer: () => { alCerrar(); ctx.guardarArchivo(); } },
      { clave: 'a-importar', grupo: 'Acción', texto: 'Importar un expediente o proyecto', hacer: () => { alCerrar(); ctx.abrirArchivo(); } },
      { clave: 'a-nuevo', grupo: 'Acción', texto: 'Nuevo proyecto', hacer: () => { alCerrar(); ctx.abrirDialogo('nuevo'); } },
      { clave: 'a-version', grupo: 'Acción', texto: 'Guardar una versión del presupuesto', hacer: ir('versiones') },
      { clave: 'a-banco', grupo: 'Acción', texto: 'Importar al banco de datos', hacer: ir('banco') },
      { clave: 'a-copias', grupo: 'Acción', texto: 'Versiones guardadas y bitácora de cambios', hacer: () => { alCerrar(); ctx.abrirDialogo('copias'); } },
      { clave: 'a-biblioteca', grupo: 'Acción', texto: 'Agregar partida desde la biblioteca', hacer: () => { alCerrar(); ctx.abrirDialogo('biblioteca'); } },
      { clave: 'a-pendientes', grupo: 'Acción', texto: 'Ver el centro de pendientes', hacer: ir('pendientes') },
    ];
    const modulos: Resultado[] = NAV.flatMap((g) => g.items.map((m) => ({ clave: `m-${m.id}`, grupo: 'Módulo' as const, texto: m.texto, detalle: g.grupo, hacer: ir(m.id) })));
    const partidas: Resultado[] = ctx.resultados.hojas.map((f) => ({ clave: `p-${f.partida.id}`, grupo: 'Partida' as const, texto: `${f.partida.codigo} ${f.partida.descripcion}`, detalle: `${f.partida.unidad} · ${ctx.proyecto.meta.moneda} ${f.parcial.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, hacer: () => { alCerrar(); abrirFicha(f.partida.id); } }));
    const insumos: Resultado[] = ctx.proyecto.insumos.map((x) => ({ clave: `i-${x.codigo}`, grupo: 'Insumo' as const, texto: `${x.codigo} ${x.descripcion}`, detalle: `${x.unidad} · ${x.precio}`, hacer: () => { alCerrar(); ctx.setConsultaInsumo(x.codigo); ctx.ir('insumos'); } }));
    return [...acciones, ...modulos, ...partidas, ...insumos].map((x) => ({ ...x, n: normal(`${x.texto} ${x.detalle ?? ''}`) })) as (Resultado & { n: string })[];
  }, [ctx.resultados, ctx.proyecto.insumos]); // eslint-disable-line react-hooks/exhaustive-deps
  const palabras = normal(q).split(/\s+/).filter(Boolean);
  const lista = (palabras.length ? (todos as (Resultado & { n: string })[]).filter((x) => palabras.every((p) => x.n.includes(p))) : todos.filter((x) => x.grupo !== 'Insumo' && x.grupo !== 'Partida')).slice(0, 40);
  const sel = Math.min(i, Math.max(0, lista.length - 1));
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="modal busqueda-global" role="dialog" aria-modal="true" aria-label="Búsqueda global">
        <input
          className="entrada"
          autoFocus
          placeholder="Buscar partidas, insumos, módulos y acciones…"
          aria-label="Buscar en todo el programa"
          value={q}
          onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') alCerrar();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(lista.length - 1, x + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
            else if (e.key === 'Enter' && lista[sel]) lista[sel].hacer();
          }}
        />
        <ul role="listbox" aria-label="Resultados">
          {lista.map((x, k) => (
            <li key={x.clave} role="option" aria-selected={k === sel} className={k === sel ? 'activo' : undefined} onMouseEnter={() => setI(k)} onMouseDown={(e) => { e.preventDefault(); x.hacer(); }}>
              <span className="grupo">{x.grupo}</span>
              <span className="texto">{x.texto}</span>
              {x.detalle && <span className="detalle">{x.detalle}</span>}
            </li>
          ))}
          {!lista.length && <li className="vacio-lista">Sin resultados para «{q}».</li>}
        </ul>
        <div className="pequeno" style={{ padding: '6px 12px' }}>↑ ↓ para elegir · Enter para abrir · Esc para cerrar. Una partida abre su ficha.</div>
      </div>
    </div>
  );
}
