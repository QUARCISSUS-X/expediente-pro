// Exportación a Word (.docx) de los documentos de texto: memoria, EETT, carta, matriz y reporte.
// Carátula, control del documento, aviso y tabla de contenido; encabezado con logos y pie con código, revisión y página.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LineRuleType, Packer, PageBreak, PageNumber, Paragraph, ShadingType,
  Table, TableCell, TableOfContents, TableRow, TextRun, VerticalAlign, WidthType, type IBorderOptions, type ISectionOptions,
} from 'docx';
import { estimatePageNumbersWith } from 'docx/layout';
import { datosCabecera, encajar, logoBytes, type Cabecera } from '../engine/cabecera';
import type { Bloque, Documento } from '../engine/documentos';
import type { Entidad, Logo, Resultados } from '../engine/types';
import { fechaLarga } from '../engine/util';

const AZUL = '1F3A5F';
const TENUE = '5B6B7C';
const GRIS = 'EEF2F6';
const GRIS2 = 'F5F7F9';
const ANCHO_UTIL = 9306; // twips: A4 (11906) − márgenes 1400 + 1200
const PX_TWIP = 15; // 1 px ≈ 15 twips (96 ppp)

const NADA: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const SIN_BORDES = { top: NADA, bottom: NADA, left: NADA, right: NADA, insideHorizontal: NADA, insideVertical: NADA };
const FINO: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: 'C9D2DC' };
const BORDES = { top: FINO, bottom: FINO, left: FINO, right: FINO, insideHorizontal: FINO, insideVertical: FINO };

function alinear(a?: string) {
  if (a === 'der') return AlignmentType.RIGHT;
  if (a === 'centro') return AlignmentType.CENTER;
  if (a === 'just') return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function run(texto: string, o: { negrita?: boolean; tam?: number; color?: string; cursiva?: boolean } = {}) {
  return new TextRun({ text: texto, bold: o.negrita, size: o.tam, color: o.color, italics: o.cursiva });
}

function imagenRun(l: Logo | null | undefined, anchoPx: number, altoPx: number): ImageRun | null {
  if (!l?.dataUrl || !/^data:image\/(png|jpe?g)/i.test(l.dataUrl)) return null;
  const b = logoBytes(l);
  const t = encajar(l, anchoPx, altoPx);
  return new ImageRun({ type: b.tipo, data: b.datos, transformation: { width: t.ancho, height: t.alto } });
}

function celda(
  hijos: (Paragraph | Table)[] | string,
  o: { negrita?: boolean; fondo?: string; alinear?: 'l' | 'r' | 'c'; ancho?: number; blanco?: boolean; tam?: number; vAlign?: 'top' | 'center' | 'bottom'; bordes?: typeof BORDES; span?: number } = {},
) {
  const children =
    typeof hijos === 'string'
      ? [new Paragraph({ alignment: o.alinear === 'r' ? AlignmentType.RIGHT : o.alinear === 'c' ? AlignmentType.CENTER : AlignmentType.LEFT, children: [run(hijos, { negrita: o.negrita, tam: o.tam ?? 17, color: o.blanco ? 'FFFFFF' : undefined })] })]
      : hijos;
  return new TableCell({
    width: o.ancho ? { size: o.ancho, type: WidthType.PERCENTAGE } : undefined,
    shading: o.fondo ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fondo } : undefined,
    margins: { top: 45, bottom: 45, left: 90, right: 90 },
    verticalAlign: o.vAlign === 'center' ? VerticalAlign.CENTER : o.vAlign === 'bottom' ? VerticalAlign.BOTTOM : undefined,
    borders: o.bordes ? { top: o.bordes.top, bottom: o.bordes.bottom, left: o.bordes.left, right: o.bordes.right } : undefined,
    columnSpan: o.span,
    children,
  });
}

const vacio = (after = 0) => new Paragraph({ spacing: { after }, children: [] });

// ------------------------------------------------------------ bloques

function firmasWord(firmas: { rol: string; nombre: string; cargo: string; detalle?: string; fecha?: string }[]): Table {
  const w = Math.floor(100 / firmas.length);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDES,
    rows: [
      new TableRow({ children: firmas.map((f) => celda(f.rol.toUpperCase(), { negrita: true, fondo: AZUL, blanco: true, alinear: 'c', ancho: w, tam: 15 })) }),
      new TableRow({ height: { value: 1100, rule: 'atLeast' as never }, children: firmas.map(() => celda('', { ancho: w })) }),
      new TableRow({
        children: firmas.map((f) =>
          celda(
            [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(f.nombre || '—', { negrita: true, tam: 17 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [run(f.cargo || '', { tam: 16 })] }),
              ...(f.detalle ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(f.detalle, { tam: 15, color: TENUE })] })] : []),
              ...(f.fecha ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(f.fecha, { tam: 15, color: TENUE })] })] : []),
            ],
            { ancho: w },
          ),
        ),
      }),
    ],
  });
}

function bloquesAWord(bloques: Bloque[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of bloques) {
    switch (b.t) {
      case 'h1':
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(b.texto)] }));
        break;
      case 'h2':
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(b.texto)] }));
        break;
      case 'h3':
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(b.texto)] }));
        break;
      case 'h4':
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_4, children: [run(b.texto)] }));
        break;
      case 'p':
        out.push(
          new Paragraph({
            alignment: alinear(b.alinear),
            spacing: { after: b.negrita ? 40 : 120 },
            keepNext: b.negrita || undefined,
            children: b.etiqueta ? [run(`${b.etiqueta}: `, { negrita: true }), run(b.texto)] : [run(b.texto, { negrita: b.negrita, color: b.negrita ? '1F2B37' : undefined, tam: b.tam ? b.tam * 2 : undefined })],
          }),
        );
        break;
      case 'lista':
        for (const it of b.items) out.push(new Paragraph({ bullet: { level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 }, children: [run(it)] }));
        break;
      case 'kv':
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDES, rows: b.pares.map(([k, v]) => new TableRow({ children: [celda(k, { negrita: true, fondo: GRIS, ancho: 35 }), celda(v, { ancho: 65 })] })) }));
        out.push(vacio(120));
        break;
      case 'tabla':
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: BORDES,
            rows: [
              new TableRow({ tableHeader: true, children: b.cabecera.map((h, i) => celda(h, { negrita: true, fondo: AZUL, blanco: true, alinear: 'c', ancho: b.anchos?.[i], tam: 16 })) }),
              ...b.filas.map((f, fi) => new TableRow({ cantSplit: true, children: f.map((v, i) => celda(v, { alinear: b.alinear?.[i], ancho: b.anchos?.[i], negrita: b.negritas?.includes(fi), fondo: b.negritas?.includes(fi) ? GRIS2 : undefined, tam: 16 })) })),
            ],
          }),
        );
        out.push(vacio(120));
        break;
      case 'salto':
        out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case 'firma':
        out.push(new Paragraph({ spacing: { before: 720 }, alignment: AlignmentType.CENTER, children: [run('______________________________')] }));
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(b.nombre, { negrita: true })] }));
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(b.cargo)] }));
        if (b.detalle) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(b.detalle, { tam: 18 })] }));
        break;
      case 'firmas':
        out.push(vacio(240));
        out.push(firmasWord(b.firmas));
        out.push(vacio(120));
        break;
    }
  }
  return out;
}

// ------------------------------------------------------------ encabezado y pie

function encabezado(c: Cabecera, doc: Documento): Header {
  const lp = imagenRun(c.logoProyectista, 96, 34);
  const lc = imagenRun(c.logoCliente, 96, 34);
  const linea: IBorderOptions = { style: BorderStyle.SINGLE, size: 8, color: AZUL };
  const b = { top: NADA, left: NADA, right: NADA, bottom: linea };
  return new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { ...SIN_BORDES, bottom: linea },
        rows: [
          new TableRow({
            children: [
              celda([new Paragraph({ children: lp ? [lp] : [run(c.proyectista, { negrita: true, tam: 15, color: AZUL })] })], { ancho: 20, vAlign: 'center', bordes: { ...SIN_BORDES, ...b } }),
              celda(
                [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`${c.proyectista ? c.proyectista.toUpperCase() + ' | ' : ''}${c.tipoDocumento}`, { negrita: true, tam: 14, color: AZUL })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [run(doc.titulo.toUpperCase(), { tam: 14, color: TENUE })] }),
                ],
                { ancho: 60, vAlign: 'center', bordes: { ...SIN_BORDES, ...b } },
              ),
              celda([new Paragraph({ alignment: AlignmentType.RIGHT, children: lc ? [lc] : [run(c.cliente, { tam: 14, color: TENUE })] })], { ancho: 20, vAlign: 'center', bordes: { ...SIN_BORDES, ...b } }),
            ],
          }),
        ],
      }),
      vacio(0),
    ],
  });
}

function pie(c: Cabecera, doc: Documento): Footer {
  const linea: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: 'B8C3CF' };
  const b = { ...SIN_BORDES, top: linea };
  const t = (s: string, negrita = false) => run(s, { tam: 14, color: TENUE, negrita });
  return new Footer({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { ...SIN_BORDES, top: linea },
        rows: [
          new TableRow({
            children: [
              celda([new Paragraph({ children: [t('CÓDIGO ', true), t(`${c.codigoDocumento || '—'}${doc.sigla ? '-' + doc.sigla : ''}`)] })], { ancho: 34, bordes: b }),
              celda([new Paragraph({ alignment: AlignmentType.CENTER, children: [t(`Revisión ${c.revision}`)] })], { ancho: 32, bordes: b }),
              celda(
                [new Paragraph({ alignment: AlignmentType.RIGHT, children: [t('PÁG. ', true), new TextRun({ children: [PageNumber.CURRENT], size: 14, color: TENUE }), t(' de '), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: TENUE })] })],
                { ancho: 34, bordes: b },
              ),
            ],
          }),
        ],
      }),
    ],
  });
}

// ------------------------------------------------------------ carátula, control y aviso

function caratula(r: Resultados, c: Cabecera, doc: Documento): (Paragraph | Table)[] {
  const m = r.proyecto.meta;
  const blanco = (t: string, tam: number, negrita = false, color = 'FFFFFF', after = 80) => new Paragraph({ spacing: { after }, children: [run(t, { tam, negrita, color })] });
  const bloque = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SIN_BORDES,
    rows: [
      new TableRow({
        height: { value: 6600, rule: 'atLeast' as never },
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: AZUL },
            margins: { top: 500, bottom: 400, left: 420, right: 420 },
            children: [
              blanco(`${doc.titulo.toUpperCase()} | ${c.tipoDocumento}`, 15, true, 'C9D6E3', 20),
              blanco(`Revisión ${c.revision}${c.estado ? ' · ' + c.estado : ''}`, 15, false, 'C9D6E3', 360),
              blanco(doc.titulo.toUpperCase(), 44, true, 'FFFFFF', 160),
              blanco(m.nombre.toUpperCase(), 24, true, 'FFFFFF', 240),
              ...(c.descripcion ? [blanco(c.descripcion, 17, false, 'E4EBF2', 200)] : []),
              blanco(c.ubicacionLarga || c.ubicacion, 16, false, 'E4EBF2', 200),
              blanco(c.cliente, 20, true, 'FFFFFF', 20),
              ...(c.propietario ? [blanco(`Propietario: ${c.propietario}`, 16, false, 'E4EBF2', 20)] : []),
            ],
          }),
        ],
      }),
    ],
  });
  const foto = imagenRun(c.imagenPortada, 620, 300);
  const lp = imagenRun(c.logoProyectista, 170, 60);
  const lc = imagenRun(c.logoCliente, 170, 60);
  const logos = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SIN_BORDES,
    rows: [
      new TableRow({
        children: [
          celda([new Paragraph({ children: lp ? [lp] : [run(c.proyectista, { negrita: true, tam: 22, color: AZUL })] })], { ancho: 50, vAlign: 'bottom', bordes: SIN_BORDES }),
          celda([new Paragraph({ alignment: AlignmentType.RIGHT, children: lc ? [lc] : [] })], { ancho: 50, vAlign: 'bottom', bordes: SIN_BORDES }),
        ],
      }),
    ],
  });
  return [
    bloque,
    vacio(200),
    ...(foto ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [foto] })] : [vacio(2400)]),
    logos,
    new Paragraph({ spacing: { before: 120 }, children: [run('Elaborado por: ', { negrita: true, tam: 17 }), run(`${c.proyectista || '—'}   ·   ${c.fechaLarga}`, { tam: 17, color: TENUE })] }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function entidadWord(rol: string, e: Entidad): Table {
  const lineas = [e.ruc ? `RUC ${e.ruc}` : '', e.representante ? `Representante: ${e.representante}` : '', e.direccion, [e.telefono, e.email].filter(Boolean).join(' · '), e.web].filter(Boolean);
  const logo = imagenRun(e.logo, 140, 52);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SIN_BORDES,
    rows: [
      new TableRow({
        children: [
          celda(
            [
              new Paragraph({ children: [run(rol, { negrita: true, tam: 16, color: AZUL })] }),
              new Paragraph({ spacing: { after: 40 }, children: [run(e.nombre || '—', { negrita: true, tam: 19 })] }),
              ...lineas.map((l) => new Paragraph({ children: [run(l, { tam: 16, color: '3B4B5C' })] })),
            ],
            { ancho: 70, bordes: SIN_BORDES },
          ),
          celda([new Paragraph({ alignment: AlignmentType.RIGHT, children: logo ? [logo] : [] })], { ancho: 30, vAlign: 'center', bordes: SIN_BORDES }),
        ],
      }),
    ],
  });
}

function controlDocumento(r: Resultados, c: Cabecera, doc: Documento, nombreArchivo?: string): (Paragraph | Table)[] {
  const p = r.proyecto;
  const rs = p.responsables;
  const titulo = (t: string) => new Paragraph({ spacing: { after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AZUL, space: 4 } }, children: [run(t, { negrita: true, tam: 26, color: AZUL })] });
  const out: (Paragraph | Table)[] = [
    titulo('CONTROL DEL DOCUMENTO'),
    new Paragraph({ spacing: { after: 160 }, children: [run('REVISIÓN VIGENTE: ', { negrita: true, tam: 16, color: AZUL }), run(`Revisión ${c.revision}${c.estado ? ' · ' + c.estado : ''}${c.fechaRevision ? ' · ' + c.fechaRevision : ''}`, { tam: 16 })] }),
    new Paragraph({ spacing: { after: 40 }, children: [run(`${doc.titulo.toUpperCase()} – ${p.meta.nombre.toUpperCase()}`, { tam: 21, color: '1F2B37' })] }),
    ...(c.descripcion ? [new Paragraph({ spacing: { after: 240 }, children: [run(c.descripcion, { tam: 16, color: TENUE })] })] : [vacio(200)]),
    entidadWord('Preparado para:', p.entidades.cliente),
    vacio(160),
  ];
  if (c.propietario) out.push(entidadWord('Propietario:', p.entidades.propietario), vacio(160));
  out.push(entidadWord('Preparado por:', p.entidades.proyectista), vacio(160));
  if (c.autores.length) {
    out.push(new Paragraph({ children: [run('Autores principales:', { negrita: true, tam: 16, color: AZUL })] }));
    for (const a of c.autores) out.push(new Paragraph({ bullet: { level: 0 }, children: [run(a, { tam: 16 })] }));
    out.push(vacio(120));
  }
  if (nombreArchivo) {
    out.push(new Paragraph({ children: [run('Nombre de archivo:', { negrita: true, tam: 16, color: AZUL })] }));
    out.push(new Paragraph({ spacing: { after: 160 }, children: [run(nombreArchivo, { tam: 16 })] }));
  }
  out.push(new Paragraph({ spacing: { after: 60 }, children: [run('Historial de revisiones', { negrita: true, tam: 16, color: AZUL })] }));
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BORDES,
      rows: [
        new TableRow({ tableHeader: true, children: ['Rev.', 'Fecha', 'Descripción', 'Elaborado', 'Revisado', 'Aprobado'].map((t, i) => celda(t, { negrita: true, fondo: AZUL, blanco: true, alinear: 'c', ancho: [8, 14, 24, 18, 18, 18][i], tam: 15 })) }),
        new TableRow({ children: [c.revision, c.fechaRevision || c.fecha, c.estado || 'Emisión', rs.elaboro.nombre || '—', rs.reviso.nombre || '—', rs.aprobo.nombre || '—'].map((t, i) => celda(t, { alinear: 'c', ancho: [8, 14, 24, 18, 18, 18][i], tam: 15 })) }),
      ],
    }),
  );
  out.push(vacio(240));
  out.push(
    firmasWord([
      { rol: 'Elaborado por', nombre: rs.elaboro.nombre, cargo: rs.elaboro.cargo, detalle: rs.elaboro.colegiatura, fecha: rs.elaboro.fecha ? fechaLarga(rs.elaboro.fecha) : '' },
      { rol: 'Revisado por', nombre: rs.reviso.nombre, cargo: rs.reviso.cargo, detalle: rs.reviso.colegiatura, fecha: rs.reviso.fecha ? fechaLarga(rs.reviso.fecha) : '' },
      { rol: 'Aprobado por', nombre: rs.aprobo.nombre, cargo: rs.aprobo.cargo, detalle: rs.aprobo.colegiatura, fecha: rs.aprobo.fecha ? fechaLarga(rs.aprobo.fecha) : '' },
    ]),
  );
  out.push(new Paragraph({ children: [new PageBreak()] }));
  if (c.aviso.trim()) {
    out.push(titulo('AVISO Y ALCANCE DE USO'));
    const izq: IBorderOptions = { style: BorderStyle.SINGLE, size: 18, color: AZUL };
    out.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { ...SIN_BORDES, left: izq },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: GRIS2 },
                margins: { top: 140, bottom: 100, left: 200, right: 200 },
                borders: { top: NADA, bottom: NADA, right: NADA, left: izq },
                children: c.aviso.split(/\n{2,}/).map((t) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 100 }, children: [run(t.trim(), { tam: 16, color: '3B4B5C' })] })),
              }),
            ],
          }),
        ],
      }),
    );
    out.push(vacio(360));
  }
  return out;
}

// ------------------------------------------------------------ documento

export interface OpcionesWord {
  nombreArchivo?: string;
}

export function documentoWord(doc: Documento, r: Resultados, op: OpcionesWord = {}): Document {
  const m = r.proyecto.meta;
  const c = datosCabecera(r.proyecto);
  const pagina = { size: { width: 11906, height: 16838 }, margin: { top: 1500, bottom: 1200, left: 1400, right: 1200, header: 500, footer: 450 } };
  const secciones: ISectionOptions[] = [];
  const cuerpo: (Paragraph | Table | TableOfContents)[] = [];
  if (doc.portada) {
    secciones.push({ properties: { page: { ...pagina, margin: { ...pagina.margin, top: 900 } } }, children: caratula(r, c, doc) });
    cuerpo.push(...controlDocumento(r, c, doc, op.nombreArchivo));
  }
  if (doc.indice) {
    cuerpo.push(new Paragraph({ spacing: { after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AZUL, space: 4 } }, children: [run('TABLA DE CONTENIDO', { negrita: true, tam: 26, color: AZUL })] }));
    cuerpo.push(new TableOfContents('Tabla de contenido', { hyperlink: true, headingStyleRange: doc.sigla === 'EETT' ? '1-4' : '1-3' }));
    cuerpo.push(new Paragraph({ children: [new PageBreak()] }));
  }
  if (!doc.portada) {
    cuerpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [run(doc.titulo.toUpperCase(), { negrita: true, tam: 28, color: AZUL })] }));
    cuerpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [run(m.nombre, { negrita: true, tam: 19 })] }));
  }
  cuerpo.push(...bloquesAWord(doc.bloques));
  if (doc.indice) cuerpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 360 }, children: [run(`FIN DEL DOCUMENTO DE ${doc.titulo.toUpperCase()}`, { negrita: true, tam: 16, color: TENUE })] }));
  secciones.push({ properties: { page: pagina }, headers: { default: encabezado(c, doc) }, footers: { default: pie(c, doc) }, children: cuerpo });
  void PX_TWIP;
  void ANCHO_UTIL;
  return new Document({
    creator: c.proyectista || 'Expediente Pro',
    title: `${doc.titulo} – ${m.nombre}`,
    description: c.tipoDocumento,
    features: { updateFields: !!doc.indice },
    pageNumbers: doc.indice ? estimatePageNumbersWith({ guess: true }) : undefined,
    styles: {
      default: { document: { run: { font: 'Arial', size: 19 }, paragraph: { spacing: { line: 264, lineRule: LineRuleType.AUTO } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: AZUL }, paragraph: { spacing: { before: 280, after: 140 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 21, bold: true, color: AZUL }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 20, bold: true, color: AZUL }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true } },
        { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 19, bold: true, color: '1F2B37' }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true } },
      ],
    },
    sections: secciones,
  });
}

export async function generarDocx(doc: Documento, r: Resultados, op: OpcionesWord = {}): Promise<Uint8Array> {
  const d = documentoWord(doc, r, op);
  const ab = await Packer.toArrayBuffer(d);
  return new Uint8Array(ab);
}
