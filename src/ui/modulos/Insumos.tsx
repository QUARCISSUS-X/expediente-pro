import ExcelJS from 'exceljs';
import { useEffect, useMemo, useState } from 'react';
import { INDICES_UNIFICADOS } from '../../data/iu';
import type { Insumo, TipoInsumo } from '../../engine/types';
import { fmt, num } from '../../engine/util';
import { IconoMas, Insignia, Pestanas, TablaEditable } from '../componentes';
import { descargar, elegirArchivo, type Contexto } from '../estado';
import { ActualizarPrecios, AgregarInsumosBanco } from '../BancoDialogos';

const OPC_TIPO = [
  { valor: 'MO', texto: 'MO' },
  { valor: 'MAT', texto: 'MAT' },
  { valor: 'EQ', texto: 'EQ' },
  { valor: 'SC', texto: 'SC' },
];
const OPC_IU = Object.entries(INDICES_UNIFICADOS).map(([k, v]) => ({ valor: k, texto: `${k} ${v}` }));

function celda(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (o.result !== undefined) return String(o.result);
    if (o.richText) return o.richText.map((x) => x.text).join('');
    if (o.text !== undefined) return o.text;
  }
  return String(v).trim();
}

/** Lee una lista de precios (Excel o CSV) con encabezados reconocibles. */
async function leerListaPrecios(f: File): Promise<string[][]> {
  if (/\.csv$/i.test(f.name) || /\.txt$/i.test(f.name)) {
    const t = await f.text();
    const sep = (t.split('\n')[0].match(/;/g)?.length ?? 0) > (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
    return t.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(sep).map((x) => x.replace(/^"|"$/g, '').trim()));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await f.arrayBuffer());
  const ws = wb.getWorksheet('INSUMOS') ?? wb.worksheets[0];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: string[] = [];
    for (let i = 1; i <= Math.max(row.cellCount, 10); i++) vals.push(celda(row.getCell(i).value));
    out.push(vals);
  });
  return out;
}

export function ModInsumos({ ctx }: { ctx: Contexto }) {
  const { proyecto: p, resultados: r, actualizar, avisar } = ctx;
  const [tipo, setTipo] = useState<'todos' | TipoInsumo>('todos');
  const [q, setQ] = useState(ctx.consultaInsumo);
  useEffect(() => {
    if (ctx.consultaInsumo) { setQ(ctx.consultaInsumo); ctx.setConsultaInsumo(''); }
  }, [ctx.consultaInsumo, ctx]);
  const [soloUsados, setSoloUsados] = useState(false);
  const [deBanco, setDeBanco] = useState<'precios' | 'insumos' | null>(null);
  const uso = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of Object.values(p.apus)) for (const it of a.items) m.set(it.insumo, (m.get(it.insumo) ?? 0) + 1);
    return m;
  }, [p.apus]);
  const rel = useMemo(() => new Map(r.insumos.items.map((i) => [i.insumo.codigo, i])), [r.insumos]);
  const filas = p.insumos
    .map((ins, gi) => ({ ins, gi }))
    .filter(({ ins }) => (tipo === 'todos' || ins.tipo === tipo) && (!soloUsados || uso.has(ins.codigo)) && (ins.codigo + ' ' + ins.descripcion).toLowerCase().includes(q.toLowerCase()));
  const set = (gi: number, f: (i: Insumo) => void) => actualizar((d) => f(d.insumos[gi] as Insumo), `Insumo ${p.insumos[gi]?.codigo ?? ''} ${p.insumos[gi]?.descripcion ?? ''}`.trim());

  const importar = async () => {
    const f = await elegirArchivo('.xlsx,.csv,.txt');
    if (!f) return;
    try {
      const filasArch = await leerListaPrecios(f);
      const idxCab = filasArch.findIndex((fl) => fl.some((c) => /c[oó]d/i.test(c)) && fl.some((c) => /precio|costo|p\.?\s*u/i.test(c)));
      if (idxCab < 0) throw new Error('No se encontró una fila de encabezados con "Código" y "Precio".');
      const cab = filasArch[idxCab].map((c) => c.toLowerCase());
      const col = (re: RegExp) => cab.findIndex((c) => re.test(c));
      const cCod = col(/c[oó]d/);
      const cDesc = col(/desc|nombre|insumo|recurso/);
      const cUnd = col(/^und|unid|u\.m|^um$/);
      const cPrecio = col(/precio|costo|p\.?\s*u/);
      const cTipo = col(/^tipo/);
      const cIu = col(/^iu$|[ií]ndice/);
      let actualizados = 0;
      let nuevos = 0;
      const hoy = new Date().toISOString().slice(0, 10);
      actualizar((d) => {
        for (const fl of filasArch.slice(idxCab + 1)) {
          const codigo = fl[cCod]?.trim();
          if (!codigo) continue;
          const precio = num(fl[cPrecio], NaN);
          if (!isFinite(precio)) continue;
          const ex = d.insumos.find((x) => x.codigo === codigo);
          if (ex) {
            ex.precio = precio;
            ex.fuente = `Importado de ${f.name}`;
            ex.fechaPrecio = hoy;
            actualizados++;
          } else {
            const und = cUnd >= 0 ? fl[cUnd] : 'und';
            let t = (cTipo >= 0 ? fl[cTipo] : '').toUpperCase() as TipoInsumo;
            if (!['MO', 'MAT', 'EQ', 'SC'].includes(t)) t = /^hh$/i.test(und) ? 'MO' : /^hm$/i.test(und) ? 'EQ' : 'MAT';
            d.insumos.push({ codigo, descripcion: cDesc >= 0 ? fl[cDesc] : codigo, unidad: und, tipo: t, precio, iu: cIu >= 0 && fl[cIu] ? fl[cIu].padStart(2, '0') : t === 'MO' ? '47' : t === 'EQ' ? '49' : '39', fuente: `Importado de ${f.name}`, fechaPrecio: hoy });
            nuevos++;
          }
        }
      });
      avisar(`Precios importados: ${actualizados} actualizados y ${nuevos} insumos nuevos.`);
    } catch (e) {
      avisar(`No se pudo importar: ${(e as Error).message}`, true);
    }
  };

  const exportar = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('INSUMOS');
    ws.columns = [
      { header: 'Código', width: 10 }, { header: 'Descripción', width: 60 }, { header: 'Unidad', width: 8 }, { header: 'Tipo', width: 7 },
      { header: 'Precio', width: 12 }, { header: 'IU', width: 6 }, { header: 'Peso (kg/und)', width: 12 }, { header: 'Plazo compra (días)', width: 14 }, { header: 'Fuente', width: 34 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const i of p.insumos) ws.addRow([i.codigo, i.descripcion, i.unidad, i.tipo, i.precio, i.iu, i.pesoKg ?? null, i.plazoCompraDias ?? null, i.fuente ?? '']);
    const buf = await wb.xlsx.writeBuffer();
    descargar(`${p.meta.codigo || 'catalogo'}_insumos.xlsx`, new Uint8Array(buf as ArrayBuffer), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  const nuevoCodigo = (t: TipoInsumo) => {
    const pref = { MO: 'MO', MAT: 'MA', EQ: 'EQ', SC: 'SC' }[t];
    let n = 1;
    while (p.insumos.some((i) => i.codigo === `${pref}${String(n).padStart(2, '0')}`)) n++;
    return `${pref}${String(n).padStart(2, '0')}`;
  };

  return (
    <div className="modulo">
      <div className="modulo-cabecera">
        <div>
          <h1>Relación y cotización de insumos</h1>
          <p className="proposito">Catálogo único de precios sin IGV. Cada insumo existe una sola vez; todos los APU toman su precio de aquí. Registre la fuente y la fecha de cada cotización (Revista Costos, proveedores, base histórica).</p>
        </div>
        <div className="herramientas">
          <button className="boton" onClick={exportar}>Exportar catálogo</button>
          <button className="boton" onClick={importar} title="Excel o CSV con columnas Código, Descripción, Unidad, Precio (Tipo e IU opcionales)">Importar precios</button>
          <button className="boton" onClick={() => setDeBanco('precios')} title="Compara los precios del proyecto con el banco a una fecha y lugar, y aplica los elegidos">Actualizar precios desde el banco</button>
          <button className="boton" onClick={() => setDeBanco('insumos')}>Agregar del banco</button>
          <button
            className="boton primario"
            onClick={() => {
              const t = tipo === 'todos' ? 'MAT' : tipo;
              actualizar((d) => { d.insumos.push({ codigo: nuevoCodigo(t), descripcion: 'Nuevo insumo', unidad: t === 'MO' ? 'hh' : t === 'EQ' ? 'hm' : 'und', tipo: t, precio: 0, iu: t === 'MO' ? '47' : t === 'EQ' ? '48' : '39' }); });
            }}
          >
            <IconoMas /> Insumo
          </button>
        </div>
      </div>
      <Pestanas
        valor={tipo}
        alCambiar={setTipo}
        opciones={[
          { id: 'todos', texto: 'Todos' },
          { id: 'MO', texto: 'Mano de obra' },
          { id: 'MAT', texto: 'Materiales' },
          { id: 'EQ', texto: 'Equipos' },
          { id: 'SC', texto: 'Subcontratos' },
        ]}
      />
      <div className="fila-flex" style={{ marginBottom: 10 }}>
        <input className="entrada" style={{ width: 320 }} placeholder="Buscar por código o descripción…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar insumo" />
        <label className="casilla"><input type="checkbox" checked={soloUsados} onChange={(e) => setSoloUsados(e.target.checked)} /> Solo los usados en el presupuesto</label>
        <span className="separador" />
        <span className="pequeno">{filas.length} de {p.insumos.length} insumos</span>
      </div>
      <TablaEditable
        etiqueta="Catálogo de insumos"
        alto="calc(100vh - 330px)"
        filas={filas}
        clave={(x) => `${x.gi}`}
        alEliminar={(x) => {
          if (uso.has(x.ins.codigo)) { avisar(`${x.ins.codigo} se usa en ${uso.get(x.ins.codigo)} APU; quítelo de esos APU antes de eliminarlo.`, true); return; }
          actualizar((d) => { d.insumos.splice(x.gi, 1); }, `Insumo quitado: ${x.ins.codigo} ${x.ins.descripcion}`);
        }}
        columnas={[
          {
            clave: 'c', titulo: 'Código', ancho: 82, valor: (x) => x.ins.codigo,
            cambiar: (x, v) => {
              const nuevo = String(v).trim();
              if (!nuevo || p.insumos.some((i, k) => i.codigo === nuevo && k !== x.gi)) { avisar('El código está vacío o ya existe.', true); return; }
              actualizar((d) => {
                const viejo = d.insumos[x.gi].codigo;
                d.insumos[x.gi].codigo = nuevo;
                for (const a of Object.values(d.apus)) for (const it of a.items) if (it.insumo === viejo) it.insumo = nuevo;
              });
            },
          },
          { clave: 'd', titulo: 'Descripción', valor: (x) => x.ins.descripcion, cambiar: (x, v) => set(x.gi, (i) => (i.descripcion = String(v))) },
          { clave: 'u', titulo: 'Und', ancho: 58, valor: (x) => x.ins.unidad, cambiar: (x, v) => set(x.gi, (i) => (i.unidad = String(v))) },
          { clave: 't', titulo: 'Tipo', tipo: 'select', ancho: 70, opciones: OPC_TIPO, valor: (x) => x.ins.tipo, cambiar: (x, v) => set(x.gi, (i) => (i.tipo = v as TipoInsumo)) },
          { clave: 'p', titulo: 'Precio', tipo: 'numero', ancho: 94, decimales: 2, valor: (x) => (x.ins.unidad.startsWith('%') ? null : x.ins.precio), cambiar: (x, v) => set(x.gi, (i) => (i.precio = (v as number) ?? 0)) },
          { clave: 'iu', titulo: 'Índice unificado', tipo: 'select', ancho: 170, opciones: OPC_IU, valor: (x) => x.ins.iu, cambiar: (x, v) => set(x.gi, (i) => (i.iu = String(v))) },
          { clave: 'pe', titulo: 'Peso kg', tipo: 'numero', ancho: 74, decimales: 2, valor: (x) => x.ins.pesoKg ?? null, cambiar: (x, v) => set(x.gi, (i) => (i.pesoKg = v as number | null)) },
          { clave: 'pc', titulo: 'Compra (d)', tipo: 'numero', ancho: 78, decimales: 0, valor: (x) => x.ins.plazoCompraDias ?? null, cambiar: (x, v) => set(x.gi, (i) => (i.plazoCompraDias = v as number | null)), placeholder: String(p.meta.plazoCompraDefecto) },
          { clave: 'f', titulo: 'Fuente / cotización', ancho: 170, valor: (x) => x.ins.fuente ?? '', cambiar: (x, v) => set(x.gi, (i) => (i.fuente = String(v))) },
          { clave: 'fc', titulo: 'Fecha cot.', ancho: 118, valor: (x) => x.ins.fechaPrecio ?? '', cambiar: (x, v) => set(x.gi, (i) => (i.fechaPrecio = String(v) || undefined)), placeholder: 'aaaa-mm-dd' },
          { clave: 'ct', titulo: 'Cantidad', num: true, ancho: 96, valor: (x) => rel.get(x.ins.codigo)?.cantidad ?? 0, formato: (x) => (rel.get(x.ins.codigo) && !x.ins.unidad.startsWith('%') ? fmt(rel.get(x.ins.codigo)!.cantidad, 2) : '') },
          {
            clave: 'us', titulo: 'En obra', num: true, ancho: 104, valor: (x) => rel.get(x.ins.codigo)?.parcial ?? 0,
            formato: (x) => {
              const ri = rel.get(x.ins.codigo);
              if (!uso.has(x.ins.codigo)) return <span className="apagado">sin uso</span>;
              return ri ? ri.parcial.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <Insignia estado="neutra">en APU</Insignia>;
            },
          },
        ]}
      />
      {deBanco === 'precios' && <ActualizarPrecios ctx={ctx} alCerrar={() => setDeBanco(null)} />}
      {deBanco === 'insumos' && <AgregarInsumosBanco ctx={ctx} alCerrar={() => setDeBanco(null)} />}
    </div>
  );
}
