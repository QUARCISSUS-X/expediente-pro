// Cadena crítica (CCPM): duraciones agresivas, colchón del proyecto, colchones de alimentación y gráfico de fiebre.
import { useMemo } from 'react';
import { ccpmDePrograma, type ConfigCcpm, limiteAmarillo, limiteRojo, puntosFiebre } from '../../engine/ccpm';
import { cortesOrdenados } from '../../engine/control';
import { fmt, num } from '../../engine/util';
import { Campo, EntradaNumero, Insignia, TablaEditable } from '../componentes';
import { fc, pct, useControl } from '../control';
import type { Contexto } from '../estado';
import { GraficoFiebre, Indicador } from '../graficos';

export function ModCcpm({ ctx }: { ctx: Contexto }) {
  const { c, mut } = useControl(ctx);
  const r = ctx.resultados;
  const x = useMemo(() => ccpmDePrograma(r, c.ccpm), [r, c.ccpm]);
  const fiebre = useMemo(() => puntosFiebre(r, x, c.lineaBase, cortesOrdenados(c)), [r, x, c]);
  const set = <K extends keyof ConfigCcpm>(k: K, v: ConfigCcpm[K]) => mut((d) => { d.ccpm[k] = v; });
  const cod = (id: string) => r.hojas.find((h) => h.partida.id === id)?.partida.codigo ?? '';
  const ult = fiebre[fiebre.length - 1];
  const zona = (z?: string) => (z === 'rojo' ? 'error' : z === 'amarillo' ? 'advertencia' : z === 'verde' ? 'ok' : 'neutra') as 'ok' | 'advertencia' | 'error' | 'neutra';
  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Cadena crítica (CCPM)</h1>
          <p className="proposito">Se quita la seguridad de cada duración, se concentra al final como colchón del proyecto y se protegen las uniones con colchones de alimentación. El avance se sigue con el consumo de colchón en el gráfico de fiebre.</p>
        </div>
      </div>
      {!r.programa.actividades.length ? (
        <div className="vacio"><p>El cronograma no tiene actividades.</p></div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <Campo etiqueta="Recorte de duraciones (%)" ayuda="Seguridad que se retira de cada actividad">
              <EntradaNumero valor={c.ccpm.recortePct} decimales={0} permitirVacio={false} alCambiar={(v) => set('recortePct', Math.min(90, Math.max(0, num(v))))} />
            </Campo>
            <Campo etiqueta="Tamaño de los colchones">
              <select value={c.ccpm.metodo} onChange={(e) => set('metodo', e.target.value as ConfigCcpm['metodo'])}>
                <option value="mitad">50 % de la seguridad retirada</option>
                <option value="rss">Raíz de la suma de cuadrados</option>
              </select>
            </Campo>
          </div>
          <div className="indicadores">
            <Indicador titulo="Cronograma CPM" valor={`${fmt(x.duracionCpm, 0)} d`} detalle="días laborables" />
            <Indicador titulo="Cadena crítica agresiva" valor={`${fmt(x.largoCadena, 0)} d`} detalle={`${x.cadena.length} actividades`} />
            <Indicador titulo="Colchón del proyecto" valor={`${fmt(x.colchonProyecto, 1)} d`} />
            <Indicador titulo="Duración CCPM" valor={`${fmt(x.duracionCcpm, 1)} d`} detalle={`${fmt(x.duracionCpm - x.duracionCcpm, 1)} d menos que el CPM`} estado="ok" />
            <Indicador titulo="Colchón consumido" valor={pct(ult?.consumoPct, 0)} detalle={ult ? `Cadena al ${pct(ult.avancePct, 0)} · ${fc(ult.fecha)}` : c.lineaBase ? 'Registre cortes de avance' : 'Congele la línea base en Control'} estado={zona(ult?.zona)} />
          </div>
          <p className="pequeno">Cadena crítica: {x.cadena.map(cod).join(' → ')}. No incluye nivelación de recursos: la cadena es la ruta más larga de la red con las duraciones agresivas.</p>
          <div className="seccion-titulo">Gráfico de fiebre</div>
          {fiebre.length ? (
            <GraficoFiebre titulo="Fiebre del proyecto" puntos={fiebre.map((p) => ({ avance: p.avancePct, consumo: p.consumoPct, etiqueta: p.nombre }))} limiteAmarillo={limiteAmarillo} limiteRojo={limiteRojo} />
          ) : (
            <div className="vacio"><p>{c.lineaBase ? 'Aún no hay cortes de avance. Regístrelos en Control y valor ganado.' : 'Congele la línea base y registre cortes de avance en Control y valor ganado.'}</p></div>
          )}
          {fiebre.length > 0 && (
            <TablaEditable
              etiqueta="Puntos del gráfico de fiebre"
              filas={fiebre}
              clave={(p) => p.corteId}
              columnas={[
                { clave: 'n', titulo: 'Corte', valor: (p) => p.nombre },
                { clave: 'f', titulo: 'Fecha', ancho: 100, valor: (p) => fc(p.fecha) },
                { clave: 'd', titulo: 'Día laborable', ancho: 100, num: true, valor: (p) => p.dia },
                { clave: 'a', titulo: '% cadena completada', ancho: 140, num: true, valor: (p) => fmt(p.avancePct, 1) },
                { clave: 't', titulo: 'Atraso de la cadena (d)', ancho: 150, num: true, valor: (p) => fmt(p.atraso, 1) },
                { clave: 'c', titulo: '% colchón consumido', ancho: 140, num: true, valor: (p) => fmt(p.consumoPct, 1) },
                { clave: 'z', titulo: 'Zona', ancho: 100, valor: (p) => p.zona, formato: (p) => <Insignia estado={zona(p.zona)}>{p.zona}</Insignia> },
              ]}
            />
          )}
          <div className="seccion-titulo">Actividades con duración agresiva</div>
          <TablaEditable
            etiqueta="Duraciones agresivas"
            filas={x.actividades}
            clave={(a) => a.partidaId}
            alto="360px"
            columnas={[
              { clave: 'c', titulo: 'Ítem', ancho: 64, valor: (a) => a.codigo },
              { clave: 'd', titulo: 'Actividad', valor: (a) => a.descripcion, formato: (a) => <>{a.descripcion} {a.enCadena && <Insignia estado="error">Cadena crítica</Insignia>}</> },
              { clave: 'o', titulo: 'Duración (d)', ancho: 96, num: true, valor: (a) => a.duracion },
              { clave: 'g', titulo: 'Agresiva (d)', ancho: 96, num: true, valor: (a) => a.agresiva },
              { clave: 's', titulo: 'Seguridad (d)', ancho: 96, num: true, valor: (a) => a.seguridad },
              { clave: 'i', titulo: 'Inicio (día)', ancho: 90, num: true, valor: (a) => a.es },
              { clave: 'h', titulo: 'Holgura (d)', ancho: 90, num: true, valor: (a) => fmt(a.holgura, 0) },
            ]}
          />
          <div className="seccion-titulo">Colchones de alimentación</div>
          <TablaEditable
            etiqueta="Colchones de alimentación"
            filas={x.alimentacion}
            clave={(b) => b.entrada}
            vacio="Todas las actividades están en la cadena crítica."
            columnas={[
              { clave: 'c', titulo: 'Cadena de alimentación', valor: (b) => b.cadena.map(cod).join(' → ') },
              { clave: 'a', titulo: 'Se une a', ancho: 260, valor: (b) => (b.alimenta ? `${cod(b.alimenta)} ${r.hojas.find((h) => h.partida.id === b.alimenta)?.partida.descripcion ?? ''}` : 'Fin del proyecto') },
              { clave: 't', titulo: 'Colchón (d)', ancho: 96, num: true, valor: (b) => fmt(b.tamano, 1) },
              { clave: 'h', titulo: 'Holgura (d)', ancho: 96, num: true, valor: (b) => fmt(b.holgura, 0) },
              { clave: 'e', titulo: 'Estado', ancho: 160, valor: (b) => b.excede, formato: (b) => (b.excede ? <Insignia estado="advertencia">Empujaría la cadena</Insignia> : <Insignia estado="ok">Cabe en la holgura</Insignia>) },
            ]}
          />
        </>
      )}
    </div>
  );
}
