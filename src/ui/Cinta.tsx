// Barra de herramientas tipo cinta (como S10, PowerCost o Delphin Express): Archivo, Edición, Partidas, Herramientas y Reportes.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { accionesPartida, type TipoExport } from './acciones';
import type { Contexto } from './estado';
import { Icono } from './iconos';

interface Boton {
  n: string; // icono
  t: string; // texto
  ayuda: string;
  accion: () => void;
  deshabilitado?: boolean;
  grande?: boolean;
  activo?: boolean;
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="cinta-grupo" role="group" aria-label={titulo}>
      <div className="cinta-botones">{children}</div>
      <div className="cinta-titulo">{titulo}</div>
    </div>
  );
}

function B({ b }: { b: Boton }) {
  return (
    <button className={`cinta-boton ${b.grande ? 'grande' : ''} ${b.activo ? 'activo' : ''}`} onClick={b.accion} disabled={b.deshabilitado} title={b.ayuda} aria-label={b.ayuda}>
      <Icono n={b.n} t={b.grande ? 22 : 18} />
      <span>{b.t}</span>
    </button>
  );
}

/** Botón con menú desplegable (el menú se ubica fijo para no quedar recortado por la cinta). */
function Menu({ n, t, ayuda, items, deshabilitado }: { n: string; t: string; ayuda: string; items: { t: string; accion: () => void }[]; deshabilitado?: boolean }) {
  const [abierto, setAbierto] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && ref.current?.parentElement?.contains(e.target as Node)) return;
      setAbierto(null);
    };
    window.addEventListener('mousedown', cerrar);
    window.addEventListener('keydown', cerrar);
    return () => { window.removeEventListener('mousedown', cerrar); window.removeEventListener('keydown', cerrar); };
  }, [abierto]);
  return (
    <span style={{ display: 'contents' }}>
      <button
        ref={ref}
        className={`cinta-boton ${abierto ? 'activo' : ''}`}
        title={ayuda}
        aria-label={ayuda}
        aria-haspopup="menu"
        aria-expanded={!!abierto}
        disabled={deshabilitado}
        onClick={() => {
          if (abierto) return setAbierto(null);
          const r = ref.current!.getBoundingClientRect();
          setAbierto({ x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 2 });
        }}
      >
        <Icono n={n} t={18} />
        <span>{t} ▾</span>
      </button>
      {abierto && (
        <div className="cinta-menu" role="menu" style={{ left: abierto.x, top: abierto.y }}>
          {items.map((i) => (
            <button key={i.t} role="menuitem" onClick={() => { setAbierto(null); i.accion(); }}>{i.t}</button>
          ))}
        </div>
      )}
    </span>
  );
}

export function Cinta({ ctx }: { ctx: Contexto }) {
  const sel = ctx.proyecto.partidas.find((x) => x.id === ctx.partidaSel) ?? null;
  const ocupado = !!ctx.ocupado;
  const exp = (tipo: TipoExport) => () => ctx.exportar(tipo);
  const privado = ctx.proyecto.meta.modo === 'privado';
  return (
    <div className="cinta" role="toolbar" aria-label="Barra de herramientas">
      <Grupo titulo="Archivo">
        <B b={{ n: 'proyectos', t: 'Proyectos', ayuda: 'Panel de proyectos: crear, abrir, duplicar, archivar y eliminar', accion: () => ctx.ir('proyectos'), grande: true }} />
        <B b={{ n: 'nuevo', t: 'Nuevo', ayuda: 'Nuevo proyecto (en blanco, ejemplo o plantilla)', accion: () => ctx.abrirDialogo('nuevo') }} />
        <B b={{ n: 'abrir', t: 'Importar', ayuda: 'Importar como proyecto nuevo: expediente de S10/Excel (presupuesto, APU, insumos, GG, metrados), cronograma XML de MS Project, EETT en Word, proyecto .json o plantilla de carga', accion: ctx.abrirArchivo }} />
        <B b={{ n: 'guardar', t: 'Guardar', ayuda: 'Guardar una copia del proyecto en un archivo .json (Ctrl+S). Los cambios se guardan solos en este navegador.', accion: ctx.guardarArchivo }} />
        <B b={{ n: 'configuracion', t: 'Datos', ayuda: 'Configuración general del proyecto: proyectista, cliente, logos, responsables y parámetros', accion: () => ctx.ir('proyecto') }} />
      </Grupo>
      <Grupo titulo="Edición">
        <B b={{ n: 'deshacer', t: 'Deshacer', ayuda: 'Deshacer (Ctrl+Z)', accion: ctx.deshacer, deshabilitado: !ctx.puedeDeshacer }} />
        <B b={{ n: 'rehacer', t: 'Rehacer', ayuda: 'Rehacer (Ctrl+Y)', accion: ctx.rehacer, deshabilitado: !ctx.puedeRehacer }} />
        <B b={{ n: 'buscar', t: 'Buscar', ayuda: 'Buscar partidas e insumos (Ctrl+F)', accion: () => ctx.abrirDialogo('buscar') }} />
      </Grupo>
      <Grupo titulo="Partidas">
        <B b={{ n: 'titulo', t: 'Título', ayuda: 'Agregar título', accion: () => accionesPartida.titulo(ctx) }} />
        <B b={{ n: 'subtitulo', t: 'Subtítulo', ayuda: 'Agregar subtítulo dentro del título seleccionado', accion: () => accionesPartida.subtitulo(ctx), deshabilitado: !sel?.titulo }} />
        <B b={{ n: 'partida', t: 'Partida', ayuda: 'Agregar partida (Insert)', accion: () => accionesPartida.partida(ctx) }} />
        <B b={{ n: 'biblioteca', t: 'Biblioteca', ayuda: 'Agregar partida desde la biblioteca con su APU de referencia', accion: () => ctx.abrirDialogo('biblioteca') }} />
        <B b={{ n: 'duplicar', t: 'Duplicar', ayuda: 'Duplicar la partida seleccionada con su APU y metrados', accion: () => accionesPartida.duplicar(ctx), deshabilitado: !sel || !!sel.titulo }} />
        <B b={{ n: 'eliminar', t: 'Eliminar', ayuda: 'Eliminar la fila seleccionada', accion: () => accionesPartida.eliminar(ctx), deshabilitado: !sel }} />
        <span className="cinta-sep" />
        <B b={{ n: 'subir', t: 'Subir', ayuda: 'Subir entre sus hermanos (Alt+↑)', accion: () => accionesPartida.subir(ctx), deshabilitado: !sel }} />
        <B b={{ n: 'bajar', t: 'Bajar', ayuda: 'Bajar entre sus hermanos (Alt+↓)', accion: () => accionesPartida.bajar(ctx), deshabilitado: !sel }} />
        <B b={{ n: 'sangria', t: 'Nivel +', ayuda: 'Aumentar nivel: pasar dentro del título anterior (Alt+→)', accion: () => accionesPartida.aumentarNivel(ctx), deshabilitado: !sel }} />
        <B b={{ n: 'desangria', t: 'Nivel −', ayuda: 'Disminuir nivel: salir del título (Alt+←)', accion: () => accionesPartida.disminuirNivel(ctx), deshabilitado: !sel }} />
        <B b={{ n: 'renumerar', t: 'Renumerar', ayuda: 'Numerar de nuevo 01, 01.01, 01.02…', accion: () => accionesPartida.renumerar(ctx) }} />
      </Grupo>
      <Grupo titulo="Herramientas">
        <B b={{ n: 'validar', t: 'Validar', ayuda: 'Revisar las 15 reglas de consistencia', accion: () => ctx.ir('validacion') }} />
        <B b={{ n: 'calculadora', t: 'Costo HH', ayuda: 'Calculadora de costo de hora-hombre (régimen de construcción civil)', accion: () => ctx.abrirDialogo('calculadoraHH') }} />
        <B b={{ n: 'cuadrilla', t: 'Cuadrilla', ayuda: 'Calculadora de rendimiento, cuadrilla y cantidad de recursos', accion: () => ctx.abrirDialogo('cuadrilla') }} />
      </Grupo>
      <Grupo titulo="Reportes">
        <B b={{ n: 'excel', t: 'Excel', ayuda: 'Excel editable con fórmulas vinculadas (presupuesto, APU, insumos, GG, polinómica, cronogramas)', accion: exp('xlsx'), deshabilitado: ocupado }} />
        <Menu
          n="word"
          t="Word"
          ayuda="Documentos en Word con carátula, encabezado y pie"
          deshabilitado={ocupado}
          items={[
            { t: 'Especificaciones técnicas', accion: exp('eett') },
            { t: 'Memoria descriptiva', accion: exp('memoria') },
            ...(privado ? [{ t: 'Carta de presentación', accion: exp('carta') }] : []),
            { t: 'Matriz de cumplimiento del TdR', accion: exp('matriz') },
            { t: 'Reporte de consistencia', accion: exp('consistencia') },
          ]}
        />
        <B b={{ n: 'pdf', t: 'PDF', ayuda: 'Expediente consolidado en PDF (carátula, índice, foliación)', accion: exp('pdf'), deshabilitado: ocupado }} />
        <B b={{ n: 'msproject', t: 'MS Project', ayuda: 'Programa de obra para MS Project (.xml)', accion: exp('msp'), deshabilitado: ocupado }} />
        <B b={{ n: 'zip', t: 'Todo', ayuda: 'Todos los entregables en un ZIP', accion: exp('zip'), deshabilitado: ocupado, grande: true }} />
      </Grupo>
      {ctx.ocupado && <div className="cinta-ocupado" role="status">Generando {ctx.ocupado}…</div>}
    </div>
  );
}
