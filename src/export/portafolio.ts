// Reporte consolidado del portafolio: Excel (una hoja con todos los proyectos y otra con sus alertas) y PDF horizontal.
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { FilaPortafolio, ResumenPortafolio } from '../engine/portafolio';
import { fechaCorta, fmt } from '../engine/util';
import { generarXlsxTablas } from './control';
import type { Tabla } from './tablas';

const AZUL = '#1F3A5F';

export function tablaPortafolio(filas: FilaPortafolio[]): Tabla {
  return {
    clave: 'portafolio',
    titulo: 'PORTAFOLIO DE PROYECTOS',
    cabecera: ['Código', 'Proyecto', 'Cliente', 'Moneda', 'Monto', 'Vigente (sin IGV)', 'Plazo (d)', '% prog.', '% real', 'SPI', 'CPI', 'EAC', 'Último corte', 'Fin estimado', 'Estado', 'Alertas'],
    filas: filas.map((f) => ({ celdas: [f.codigo, f.nombre, f.cliente, f.moneda, f.monto, f.vigente, f.plazoDias, f.avanceProgramado, f.avanceReal, f.spi, f.cpi, f.eac, f.ultimoCorte ? fechaCorta(f.ultimoCorte) : '', f.finEstimado ? fechaCorta(f.finEstimado) : '', f.semaforo, f.alertas.length] })),
    anchos: [10, 40, 24, 7, 14, 14, 8, 8, 8, 7, 7, 14, 11, 11, 11, 8],
    alinear: ['l', 'l', 'l', 'c', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'c', 'c', 'c', 'r'],
    decimales: [null, null, null, null, 2, 2, 0, 2, 2, 3, 3, 2, null, null, null, 0],
    horizontal: true,
  };
}

export function tablaAlertasPortafolio(filas: FilaPortafolio[]): Tabla {
  return {
    clave: 'portafolio_alertas',
    titulo: 'ALERTAS DEL PORTAFOLIO',
    cabecera: ['Proyecto', 'Alerta'],
    filas: filas.flatMap((f) => f.alertas.map((a) => ({ celdas: [`${f.codigo ? f.codigo + ' ' : ''}${f.nombre}`, a] }))),
    anchos: [50, 60],
    alinear: ['l', 'l'],
    decimales: [null, null],
  };
}

export function xlsxPortafolio(filas: FilaPortafolio[]): Promise<Uint8Array> {
  return generarXlsxTablas(null, 'Portafolio de proyectos', [
    { hoja: 'Portafolio', tabla: tablaPortafolio(filas) },
    { hoja: 'Alertas', tabla: tablaAlertasPortafolio(filas) },
  ]);
}

const v = (x: number | null, d = 2) => (x === null ? '—' : fmt(x, d));

export function pdfPortafolio(filas: FilaPortafolio[], res: ResumenPortafolio, hoy: string): TDocumentDefinitions {
  const color: Record<string, string> = { verde: '#1E6B5E', amarillo: '#B7791F', rojo: '#B42318', 'sin control': '#7A8794' };
  const cuerpo = [
    ['Código', 'Proyecto', 'Monto', '% prog.', '% real', 'SPI', 'CPI', 'EAC', 'Estado', 'Alertas'].map((t) => ({ text: t, bold: true, color: 'white', fillColor: AZUL, fontSize: 7.5, alignment: 'center' })),
    ...filas.map((f) => [
      { text: f.codigo, fontSize: 7.5 },
      { text: `${f.nombre}${f.cliente ? '\n' + f.cliente : ''}`, fontSize: 7.5 },
      { text: `${f.moneda} ${fmt(f.monto)}`, fontSize: 7.5, alignment: 'right' },
      { text: v(f.avanceProgramado), fontSize: 7.5, alignment: 'right' },
      { text: v(f.avanceReal), fontSize: 7.5, alignment: 'right' },
      { text: v(f.spi, 3), fontSize: 7.5, alignment: 'right' },
      { text: v(f.cpi, 3), fontSize: 7.5, alignment: 'right' },
      { text: v(f.eac), fontSize: 7.5, alignment: 'right' },
      { text: f.semaforo, fontSize: 7.5, bold: true, color: color[f.semaforo], alignment: 'center' },
      { text: f.alertas.join('\n') || '—', fontSize: 6.8 },
    ]),
  ];
  const kv = (k: string, x: string): Content => ({ columns: [{ width: 170, text: k, bold: true, fontSize: 8.5 }, { width: '*', text: x, fontSize: 8.5 }], margin: [0, 1, 0, 1] });
  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [36, 40, 36, 40],
    info: { title: 'Portafolio de proyectos', creator: 'Expediente Pro' },
    footer: (p: number, t: number) => ({ text: `Portafolio de proyectos · ${fechaCorta(hoy)} · Página ${p} de ${t}`, fontSize: 7, color: '#5B6B7C', alignment: 'center', margin: [0, 12, 0, 0] }),
    content: [
      { text: 'PORTAFOLIO DE PROYECTOS', fontSize: 14, bold: true, color: AZUL, margin: [0, 0, 0, 8] },
      kv('Proyectos', `${res.proyectos} (${res.conControl} con control de obra)`),
      ...res.porMoneda.map((m) => kv(`Monto total en ${m.moneda}`, `${fmt(m.monto)} (${m.proyectos} proyectos)`)),
      kv('Avance real ponderado por monto', res.avancePonderado === null ? '—' : `${fmt(res.avancePonderado)} %`),
      kv('SPI / CPI ponderados', `${v(res.spiPonderado, 3)} / ${v(res.cpiPonderado, 3)}`),
      kv('Semáforo', `${res.semaforos.verde} en verde · ${res.semaforos.amarillo} en amarillo · ${res.semaforos.rojo} en rojo · ${res.semaforos['sin control']} sin control`),
      { text: '', margin: [0, 6, 0, 0] },
      { table: { headerRows: 1, widths: [50, '*', 80, 40, 40, 36, 36, 70, 52, 150], body: cuerpo }, layout: { hLineWidth: () => 0.4, vLineWidth: () => 0.4, hLineColor: () => '#C9D2DC', vLineColor: () => '#C9D2DC' } },
    ] as Content[],
    defaultStyle: { font: 'Roboto', fontSize: 8 },
  };
}
