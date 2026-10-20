// Configuración general del proyecto: datos que se copian solos a carátulas, encabezados, pies y formatos.
import { useState } from 'react';
import { AREAS_GEOGRAFICAS } from '../../data/iu';
import { datosCabecera } from '../../engine/cabecera';
import type { ConfigDocumento, Entidad, Logo, Meta, Proyecto, Responsable, TextosEett } from '../../engine/types';
import { AreaTexto, Campo, EntradaNumero, EntradaTexto, Pestanas } from '../componentes';
import { elegirArchivo, leerLogo, type Contexto } from '../estado';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
type Pest = 'proyecto' | 'entidades' | 'responsables' | 'documento' | 'parametros' | 'calendario' | 'textos';
type ClaveEntidad = keyof Proyecto['entidades'];
type ClaveResp = keyof Proyecto['responsables'];

export function ModProyecto({ ctx }: { ctx: Contexto }) {
  const { proyecto: p, actualizar } = ctx;
  const m = p.meta;
  const [pest, setPest] = useState<Pest>('proyecto');
  const set = <K extends keyof Meta>(k: K, v: Meta[K]) => actualizar((d) => { d.meta[k] = v; });
  const txt = (k: keyof Meta, etiqueta: string, cls?: string, ayuda?: string) => (
    <Campo etiqueta={etiqueta} className={cls} ayuda={ayuda}>
      <EntradaTexto valor={String(m[k] ?? '')} alCambiar={(v) => set(k, v as never)} />
    </Campo>
  );
  const numero = (k: keyof Meta, etiqueta: string, dec = 2, ayuda?: string) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <EntradaNumero valor={m[k] as number | null} decimales={dec} alCambiar={(v) => set(k, (v ?? (k === 'personalMaximo' ? null : 0)) as never)} />
    </Campo>
  );

  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Configuración general</h1>
          <p className="proposito">Proyectista, cliente, responsables, logos, moneda y parámetros. Estos datos se copian solos a la carátula, el control del documento, los encabezados, los pies de página y los formatos de todos los entregables.</p>
        </div>
      </div>
      <div className="dividido config">
        <div>
          <Pestanas
            valor={pest}
            alCambiar={setPest}
            opciones={[
              { id: 'proyecto', texto: 'Proyecto' },
              { id: 'entidades', texto: 'Proyectista y cliente' },
              { id: 'responsables', texto: 'Responsables' },
              { id: 'documento', texto: 'Documento y carátula' },
              { id: 'parametros', texto: 'Moneda y parámetros' },
              { id: 'calendario', texto: 'Calendario' },
              { id: 'textos', texto: 'Textos' },
            ]}
          />
          {pest === 'proyecto' && (
            <>
              <h2 style={{ marginTop: 4 }}>Identificación</h2>
              <div className="rejilla">
                {txt('nombre', 'Nombre del proyecto', 'ancho-total')}
                {txt('codigo', 'Código del proyecto')}
                <Campo etiqueta="Modalidad">
                  <select value={m.modo} onChange={(e) => set('modo', e.target.value as Meta['modo'])}>
                    <option value="privado">Cotización privada</option>
                    <option value="publico">Expediente de obra pública</option>
                  </select>
                </Campo>
                <Campo etiqueta="Sistema de contratación">
                  <select value={m.sistemaContratacion} onChange={(e) => set('sistemaContratacion', e.target.value)}>
                    {['Precios unitarios', 'Suma alzada', 'Esquema mixto', 'Tarifas', 'Llave en mano'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Campo>
                <Campo etiqueta="Descripción del proyecto" className="ancho-total" ayuda="Aparece en la carátula, en el control del documento y en la memoria descriptiva.">
                  <AreaTexto valor={m.descripcion} filas={3} alCambiar={(v) => set('descripcion', v)} />
                </Campo>
              </div>
              <h2>Ubicación y fecha</h2>
              <div className="rejilla">
                {txt('ubicacion', 'Lugar, unidad o sede', 'ancho-2')}
                {txt('departamento', 'Departamento')}
                {txt('provincia', 'Provincia')}
                {txt('distrito', 'Distrito')}
                <Campo etiqueta="Área geográfica de índices INEI" className="ancho-2">
                  <select value={m.areaGeografica} onChange={(e) => set('areaGeografica', parseInt(e.target.value, 10))}>
                    {Object.entries(AREAS_GEOGRAFICAS).map(([k, v]) => <option key={k} value={k}>{k}. {v}</option>)}
                  </select>
                </Campo>
                <Campo etiqueta="Fecha del proyecto" ayuda="Fecha de emisión del documento">
                  <EntradaTexto type="date" valor={m.fecha} alCambiar={(v) => set('fecha', v)} />
                </Campo>
                <Campo etiqueta="Fecha de determinación del presupuesto" ayuda="Fecha de los precios">
                  <EntradaTexto type="date" valor={m.fechaBase} alCambiar={(v) => set('fechaBase', v)} />
                </Campo>
              </div>
            </>
          )}
          {pest === 'entidades' && (
            <>
              <FichaEntidad ctx={ctx} clave="proyectista" titulo="Proyectista o empresa consultora" ayuda="Quien elabora el expediente. Su logo va a la izquierda del encabezado." />
              <FichaEntidad ctx={ctx} clave="cliente" titulo={m.modo === 'publico' ? 'Entidad contratante (cliente)' : 'Cliente'} ayuda="Para quien se elabora. Su logo va a la derecha del encabezado." />
              <FichaEntidad ctx={ctx} clave="propietario" titulo="Propietario o cliente final (opcional)" ayuda="Cuando el cliente contrata por encargo de otra empresa (p. ej., una contratista para una minera)." />
            </>
          )}
          {pest === 'responsables' && (
            <>
              <p className="pequeno" style={{ marginTop: 4 }}>Firman el control del documento, la memoria descriptiva y la carta. El nombre de quien aprueba (o, si falta, de quien elabora) firma la carta de presentación.</p>
              {(['elaboro', 'reviso', 'aprobo'] as ClaveResp[]).map((k) => (
                <FichaResponsable key={k} ctx={ctx} clave={k} titulo={{ elaboro: 'Elaborado por', reviso: 'Revisado por', aprobo: 'Aprobado por' }[k]} />
              ))}
            </>
          )}
          {pest === 'documento' && <FichaDocumento ctx={ctx} />}
          {pest === 'parametros' && (
            <>
              <h2 style={{ marginTop: 4 }}>Moneda y unidades</h2>
              <div className="rejilla">
                <Campo etiqueta="Símbolo de moneda">
                  <select
                    value={['S/', 'US$', '€'].includes(m.moneda) ? m.moneda : 'otra'}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'otra') return;
                      actualizar((d) => {
                        d.meta.moneda = v;
                        d.meta.monedaNombre = v === 'US$' ? 'DÓLARES AMERICANOS' : v === '€' ? 'EUROS' : 'SOLES';
                      });
                    }}
                  >
                    <option value="S/">S/ (soles)</option>
                    <option value="US$">US$ (dólares americanos)</option>
                    <option value="€">€ (euros)</option>
                    <option value="otra">Otra…</option>
                  </select>
                </Campo>
                {txt('moneda', 'Símbolo (texto libre)')}
                {txt('monedaNombre', 'Nombre de la moneda para montos en letras', undefined, 'En mayúsculas y plural: SOLES, DÓLARES AMERICANOS')}
                {txt('unidadMedida', 'Sistema de unidades', 'ancho-2')}
              </div>
              <h2>Pie de presupuesto</h2>
              <div className="rejilla">
                {numero('utilidadPct', 'Utilidad (% del costo directo)')}
                <Campo etiqueta="IGV en el presupuesto">
                  <select value={m.incluirIgv === false ? 'no' : 'si'} onChange={(e) => set('incluirIgv', e.target.value === 'si')}>
                    <option value="si">Incluir IGV</option>
                    <option value="no">Sin IGV (montos netos)</option>
                  </select>
                </Campo>
                {numero('igvPct', 'IGV (%)')}
              </div>
              <h2>Adelantos, compras y flete</h2>
              <div className="rejilla">
                {numero('adelantoDirectoPct', 'Adelanto directo (%)')}
                {numero('adelantoMaterialesPct', 'Adelanto de materiales (%)')}
                {numero('plazoCompraDefecto', 'Anticipación de compra por defecto (días)', 0)}
                {numero('fleteTarifaTon', `Tarifa de flete (${m.moneda} por tonelada)`, 2, 'Cero para no incluir el cálculo de flete')}
                {numero('fleteDistanciaKm', 'Distancia de flete (km)', 0)}
                {numero('personalMaximo', 'Personal máximo en obra', 0, 'Opcional; se compara con el histograma')}
              </div>
              <h2>Oferta y foliación</h2>
              <div className="rejilla">
                {numero('validezOfertaDias', 'Validez de la oferta (días)', 0)}
                {txt('formaPago', 'Forma de pago', 'ancho-2')}
                <Campo etiqueta="Foliación del PDF">
                  <select value={m.foliacion} onChange={(e) => set('foliacion', e.target.value as Meta['foliacion'])}>
                    <option value="ascendente">Ascendente (1 en la carátula)</option>
                    <option value="descendente">Descendente (1 en la última hoja)</option>
                  </select>
                </Campo>
              </div>
            </>
          )}
          {pest === 'calendario' && (
            <div className="rejilla" style={{ marginTop: 4 }}>
              <Campo etiqueta="Inicio de obra">
                <EntradaTexto type="date" valor={m.fechaInicio} alCambiar={(v) => v && set('fechaInicio', v)} />
              </Campo>
              {numero('jornadaHoras', 'Jornada (horas por día)', 1)}
              <Campo etiqueta="Periodos de los cronogramas">
                <select value={m.periodo} onChange={(e) => set('periodo', e.target.value as Meta['periodo'])}>
                  <option value="30dias">Periodos de 30 días (Mes 1, Mes 2…)</option>
                  <option value="mes">Meses calendario</option>
                </select>
              </Campo>
              <div className="campo ancho-2">
                <span>Días laborables</span>
                <div className="fila-flex" style={{ minHeight: 32 }}>
                  {DIAS.map((dn, i) => (
                    <label key={dn} className="casilla">
                      <input type="checkbox" checked={m.diasLaborables.includes(i)} onChange={(e) => set('diasLaborables', e.target.checked ? [...m.diasLaborables, i].sort() : m.diasLaborables.filter((x) => x !== i))} />
                      {dn}
                    </label>
                  ))}
                </div>
              </div>
              <Campo etiqueta="Feriados no laborables" className="ancho-total" ayuda="Fechas aaaa-mm-dd separadas por coma">
                <EntradaTexto valor={m.feriados.join(', ')} alCambiar={(v) => set('feriados', v.split(/[,;\s]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))} />
              </Campo>
            </div>
          )}
          {pest === 'textos' && <FichaTextos ctx={ctx} />}
        </div>
        <div className="pegajoso">
          <VistaPrevia ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ entidades y responsables

function SelectorLogo({ logo, alCambiar, etiqueta, maxAncho }: { logo: Logo | null | undefined; alCambiar: (l: Logo | null) => void; etiqueta: string; maxAncho?: number }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="campo">
      <span>{etiqueta}</span>
      <div className="logo-caja">
        {logo?.dataUrl ? <img src={logo.dataUrl} alt={etiqueta} /> : <span className="pequeno">Sin imagen</span>}
      </div>
      <div className="fila-flex" style={{ gap: 6 }}>
        <button
          className="boton chico"
          type="button"
          onClick={async () => {
            const f = await elegirArchivo('image/png,image/jpeg,image/svg+xml');
            if (!f) return;
            try {
              setError(null);
              alCambiar(await leerLogo(f, maxAncho));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {logo ? 'Cambiar' : 'Cargar imagen'}
        </button>
        {logo && <button className="boton chico peligro" type="button" onClick={() => alCambiar(null)}>Quitar</button>}
      </div>
      <small className="ayuda">{error ?? 'PNG, JPG o SVG. Fondo transparente o blanco.'}</small>
    </div>
  );
}

function FichaEntidad({ ctx, clave, titulo, ayuda }: { ctx: Contexto; clave: ClaveEntidad; titulo: string; ayuda: string }) {
  const e = ctx.proyecto.entidades[clave];
  const set = (k: keyof Entidad, v: string | Logo | null) => ctx.actualizar((d) => { (d.entidades[clave] as Record<string, unknown>)[k] = v; });
  const t = (k: keyof Entidad, etq: string, cls?: string) => (
    <Campo etiqueta={etq} className={cls}>
      <EntradaTexto valor={String(e[k] ?? '')} alCambiar={(v) => set(k, v)} />
    </Campo>
  );
  return (
    <section className="ficha">
      <h2>{titulo}</h2>
      <p className="pequeno" style={{ marginTop: -6 }}>{ayuda}</p>
      <div className="ficha-cuerpo">
        <div className="rejilla">
          {t('nombre', 'Razón social o nombre', 'ancho-2')}
          {t('ruc', 'RUC')}
          {t('representante', 'Representante o contacto')}
          {t('direccion', 'Dirección', 'ancho-2')}
          {t('telefono', 'Teléfono')}
          {t('email', 'Correo electrónico')}
          {t('web', 'Página web')}
        </div>
        <SelectorLogo logo={e.logo} etiqueta="Logo" alCambiar={(l) => set('logo', l)} />
      </div>
    </section>
  );
}

function FichaResponsable({ ctx, clave, titulo }: { ctx: Contexto; clave: ClaveResp; titulo: string }) {
  const r = ctx.proyecto.responsables[clave];
  const set = (k: keyof Responsable, v: string) => ctx.actualizar((d) => { d.responsables[clave][k] = v; });
  return (
    <section className="ficha">
      <h2>{titulo}</h2>
      <div className="rejilla">
        <Campo etiqueta="Nombre" className="ancho-2"><EntradaTexto valor={r.nombre} alCambiar={(v) => set('nombre', v)} /></Campo>
        <Campo etiqueta="Cargo"><EntradaTexto valor={r.cargo} alCambiar={(v) => set('cargo', v)} /></Campo>
        <Campo etiqueta="Colegiatura (CIP)"><EntradaTexto valor={r.colegiatura} alCambiar={(v) => set('colegiatura', v)} /></Campo>
        <Campo etiqueta="Fecha"><EntradaTexto type="date" valor={r.fecha} alCambiar={(v) => set('fecha', v)} /></Campo>
      </div>
    </section>
  );
}

function FichaDocumento({ ctx }: { ctx: Contexto }) {
  const d0 = ctx.proyecto.documento;
  const set = <K extends keyof ConfigDocumento>(k: K, v: ConfigDocumento[K]) => ctx.actualizar((d) => { d.documento[k] = v; });
  return (
    <>
      <h2 style={{ marginTop: 4 }}>Control del documento</h2>
      <div className="rejilla">
        <Campo etiqueta="Código del documento" ayuda="Va en el pie de página de cada hoja"><EntradaTexto valor={d0.codigo} alCambiar={(v) => set('codigo', v)} /></Campo>
        <Campo etiqueta="Revisión"><EntradaTexto valor={d0.revision} alCambiar={(v) => set('revision', v)} /></Campo>
        <Campo etiqueta="Fecha de la revisión"><EntradaTexto type="date" valor={d0.fechaRevision} alCambiar={(v) => set('fechaRevision', v)} /></Campo>
        <Campo etiqueta="Estado">
          <select value={d0.estado} onChange={(e) => set('estado', e.target.value)}>
            {['Para revisión', 'Para aprobación', 'Aprobado', 'Para construcción', 'Emitido para licitación', 'Versión final'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo de documento" className="ancho-2" ayuda="Encabeza la carátula y cada página: EXPEDIENTE TÉCNICO, INFORME TÉCNICO, PROPUESTA TÉCNICO-ECONÓMICA…">
          <EntradaTexto valor={d0.tipo} lista="tipos-doc" alCambiar={(v) => set('tipo', v.toUpperCase())} />
        </Campo>
        <datalist id="tipos-doc">{['EXPEDIENTE TÉCNICO', 'INFORME TÉCNICO', 'PROPUESTA TÉCNICO-ECONÓMICA', 'INGENIERÍA DE DETALLE', 'PERFIL TÉCNICO', 'COTIZACIÓN'].map((x) => <option key={x} value={x} />)}</datalist>
        <Campo etiqueta="Autores principales" className="ancho-2" ayuda="Uno por línea">
          <AreaTexto valor={d0.autores} filas={3} alCambiar={(v) => set('autores', v)} />
        </Campo>
      </div>
      <h2>Aviso y alcance de uso</h2>
      <p className="pequeno" style={{ marginTop: -6 }}>Va después del control del documento. Variables: {'{{proyectista}}'}, {'{{cliente}}'}, {'{{propietario}}'}, {'{{proyecto}}'}, {'{{ubicacion}}'}, {'{{codigo}}'}. Déjelo vacío para no incluirlo.</p>
      <div className="campo">
        <AreaTexto valor={d0.aviso} filas={7} alCambiar={(v) => set('aviso', v)} />
      </div>
      <h2>Imagen de la carátula</h2>
      <div style={{ maxWidth: 360 }}>
        <SelectorLogo logo={d0.imagenPortada} etiqueta="Foto o imagen (opcional)" maxAncho={1400} alCambiar={(l) => set('imagenPortada', l)} />
      </div>
    </>
  );
}

function FichaTextos({ ctx }: { ctx: Contexto }) {
  const { proyecto: p, actualizar } = ctx;
  return (
    <>
      <h2 style={{ marginTop: 4 }}>Memoria descriptiva</h2>
      <p className="pequeno" style={{ marginTop: -6 }}>Montos, plazo, metas y componentes se completan solos desde el presupuesto y el programa. No escriba cifras aquí: si no coinciden, la regla 13 lo marca.</p>
      <div className="rejilla">
        {(['antecedentes', 'objetivo', 'alcance', 'descripcionTecnica', 'consideraciones'] as const).map((k) => (
          <Campo key={k} className="ancho-total" etiqueta={{ antecedentes: 'Antecedentes', objetivo: 'Objetivo', alcance: 'Alcance', descripcionTecnica: 'Descripción técnica', consideraciones: 'Consideraciones' }[k]}>
            <AreaTexto valor={p.memoria[k]} filas={k === 'descripcionTecnica' || k === 'alcance' ? 4 : 3} alCambiar={(v) => actualizar((d) => { d.memoria[k] = v; })} />
          </Campo>
        ))}
      </div>
      <h2>Especificaciones técnicas generales</h2>
      <p className="pequeno" style={{ marginTop: -6 }}>Encabezan el documento de EETT, antes de las especificaciones por partida. Variables: {'{{proyecto}}'}, {'{{ubicacion}}'}, {'{{propietario}}'}, {'{{cliente}}'}.</p>
      <div className="rejilla">
        {(['objetivo', 'alcance', 'normativa', 'definiciones', 'consideraciones'] as (keyof TextosEett)[]).map((k) => (
          <Campo key={k} className="ancho-total" etiqueta={{ objetivo: 'Objetivo', alcance: 'Alcance', normativa: 'Normativa aplicable', definiciones: 'Definiciones', consideraciones: 'Consideraciones generales' }[k]}>
            <AreaTexto valor={p.textosEett[k]} filas={3} alCambiar={(v) => actualizar((d) => { d.textosEett[k] = v; })} />
          </Campo>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------ vista previa del encabezado

function VistaPrevia({ ctx }: { ctx: Contexto }) {
  const c = datosCabecera(ctx.proyecto);
  const r = ctx.resultados;
  const logo = (l: Logo | null, alt: string, der = false) =>
    l?.dataUrl ? <img src={l.dataUrl} alt={alt} style={{ maxHeight: 26, maxWidth: 84, objectFit: 'contain', marginLeft: der ? 'auto' : undefined }} /> : <span className="vp-sin-logo">{alt}</span>;
  return (
    <div className="vista-previa" aria-label="Vista previa de carátula y encabezado">
      <div className="vp-titulo">Vista previa en los entregables</div>
      <div className="vp-hoja vp-caratula">
        <div className="vp-banda">
          <div className="vp-pre">{c.tipoDocumento} · Revisión {c.revision}{c.estado ? ` · ${c.estado}` : ''}</div>
          <div className="vp-nombre">{c.proyecto || 'Nombre del proyecto'}</div>
          <div className="vp-cli">{c.cliente || 'Cliente'}{c.propietario ? ` · ${c.propietario}` : ''}</div>
          <div className="vp-ubi">{c.ubicacionLarga || 'Ubicación'}</div>
        </div>
        {c.imagenPortada?.dataUrl && <img className="vp-foto" src={c.imagenPortada.dataUrl} alt="Imagen de la carátula" />}
        <div className="vp-logos">
          {logo(c.logoProyectista, 'Logo proyectista')}
          {logo(c.logoCliente, 'Logo cliente', true)}
        </div>
        <div className="vp-pie-caratula">Elaborado por: {c.proyectista || '—'} · {c.fechaLarga}</div>
      </div>
      <div className="vp-hoja">
        <div className="vp-enc">
          {logo(c.logoProyectista, 'Proyectista')}
          <div className="vp-enc-centro">
            <strong>{c.proyectista ? `${c.proyectista.toUpperCase()} | ` : ''}{c.tipoDocumento}</strong>
            <span>{c.proyecto}</span>
          </div>
          {logo(c.logoCliente, 'Cliente', true)}
        </div>
        <div className="vp-cajetin">
          <div><b>Proyecto</b> {c.codigoProyecto} {c.proyecto}</div>
          <div><b>Cliente</b> {c.cliente || '—'} <b style={{ marginLeft: 8 }}>Fecha de precios</b> {c.fechaBase}</div>
          <div><b>Ubicación</b> {c.ubicacion || '—'} <b style={{ marginLeft: 8 }}>Moneda</b> {c.monedaNombre} ({c.moneda})</div>
        </div>
        <div className="vp-lineas"><i /><i /><i /><i style={{ width: '60%' }} /></div>
        <div className="vp-pie">
          <span><b>CÓDIGO</b> {c.codigoDocumento || '—'}</span>
          <span>Revisión {c.revision}</span>
          <span><b>PÁG.</b> 1 de N</span>
        </div>
      </div>
      <p className="pequeno" style={{ margin: '8px 2px 0' }}>
        Total: {c.moneda} {r.pie.total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{ctx.proyecto.meta.incluirIgv === false ? ' (sin IGV)' : ''} · Plazo {r.programa.plazoDias} días
      </p>
    </div>
  );
}
