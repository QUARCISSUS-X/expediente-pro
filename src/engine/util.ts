// Utilidades: redondeo, formato, fechas, número a letras.

export function redondear(v: number, dec = 2): number {
  if (!isFinite(v)) return 0;
  const f = Math.pow(10, dec);
  // corrige errores binarios (1.005 -> 1.01)
  return Math.round((v + Math.sign(v) * Number.EPSILON) * f) / f;
}

/** Redondeo "al milésimo" del D.S. 011-79-VC: fracción >= 0.0005 sube. */
export function redondearMilesimo(v: number): number {
  return Math.floor(v * 1000 + 0.5 + 1e-9) / 1000;
}

export function num(v: unknown, def = 0): number {
  if (v === null || v === undefined || v === '') return def;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : def;
}

export function fmt(v: number, dec = 2): string {
  if (!isFinite(v)) v = 0;
  return v.toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtMoneda(v: number, moneda = 'S/'): string {
  return `${moneda} ${fmt(v, 2)}`;
}

let contador = 0;
export function uid(prefijo = 'id'): string {
  contador = (contador + 1) % 1e6;
  return `${prefijo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${contador.toString(36)}`;
}

// ------------------------------ Fechas ------------------------------------
// Se trabaja con fechas ISO (yyyy-mm-dd) en UTC para evitar desfases por zona horaria.

export function isoAFecha(iso: string): Date {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function fechaAIso(f: Date): string {
  return f.toISOString().slice(0, 10);
}

export function sumarDias(iso: string, dias: number): string {
  const f = isoAFecha(iso);
  f.setUTCDate(f.getUTCDate() + dias);
  return fechaAIso(f);
}

export function difDias(desde: string, hasta: string): number {
  return Math.round((isoAFecha(hasta).getTime() - isoAFecha(desde).getTime()) / 86400000);
}

export function diaSemana(iso: string): number {
  return isoAFecha(iso).getUTCDay();
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

export function fechaLarga(iso: string): string {
  if (!iso) return '';
  const f = isoAFecha(iso);
  return `${f.getUTCDate()} de ${MESES[f.getUTCMonth()]} de ${f.getUTCFullYear()}`;
}

export function fechaCorta(iso: string): string {
  if (!iso) return '';
  const f = isoAFecha(iso);
  return `${String(f.getUTCDate()).padStart(2, '0')}/${String(f.getUTCMonth() + 1).padStart(2, '0')}/${f.getUTCFullYear()}`;
}

export function mesAnio(iso: string): string {
  const f = isoAFecha(iso);
  return `${MESES_CORTOS[f.getUTCMonth()]}-${String(f.getUTCFullYear()).slice(2)}`;
}

export function mesAnioLargo(iso: string): string {
  const f = isoAFecha(iso);
  const m = MESES[f.getUTCMonth()];
  return `${m.charAt(0).toUpperCase() + m.slice(1)} ${f.getUTCFullYear()}`;
}

// --------------------------- Número a letras -------------------------------

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function menorMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  let t = CENTENAS[c];
  if (r > 0) {
    let s: string;
    if (r < 30) s = UNIDADES[r];
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      s = DECENAS[d] + (u ? ' Y ' + UNIDADES[u] : '');
    }
    t = (t ? t + ' ' : '') + s;
  }
  return t;
}

const apocopar = (s: string) => (s.endsWith('VEINTIUNO') ? s.slice(0, -9) + 'VEINTIÚN' : s.endsWith('UNO') ? s.slice(0, -3) + 'UN' : s);

function enteroALetras(n: number): string {
  if (n === 0) return 'CERO';
  const partes: string[] = [];
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;
  if (millones > 0) {
    if (millones === 1) partes.push('UN MILLÓN');
    else partes.push(apocopar(enteroALetras(millones)) + ' MILLONES');
  }
  if (miles > 0) {
    if (miles === 1) partes.push('MIL');
    else partes.push(apocopar(menorMil(miles)) + ' MIL');
  }
  if (resto > 0) partes.push(menorMil(resto));
  return partes.join(' ');
}

/** 1250.5 -> "MIL DOSCIENTOS CINCUENTA CON 50/100 SOLES" */
export function montoEnLetras(v: number, monedaPlural = 'SOLES'): string {
  monedaPlural = (monedaPlural || 'SOLES').toUpperCase();
  const r = redondear(Math.abs(v), 2);
  const entero = Math.floor(r);
  const cent = Math.round((r - entero) * 100);
  return `${enteroALetras(entero)} CON ${String(cent).padStart(2, '0')}/100 ${monedaPlural}`;
}

// ------------------------------- Unidades ---------------------------------

const UNIDADES_TEXTO: Record<string, [string, string]> = {
  m: ['metro lineal', 'metros lineales'],
  ml: ['metro lineal', 'metros lineales'],
  m2: ['metro cuadrado', 'metros cuadrados'],
  m3: ['metro cúbico', 'metros cúbicos'],
  kg: ['kilogramo', 'kilogramos'],
  t: ['tonelada', 'toneladas'],
  und: ['unidad', 'unidades'],
  u: ['unidad', 'unidades'],
  pza: ['pieza', 'piezas'],
  glb: ['global', 'global'],
  est: ['estimado', 'estimado'],
  ha: ['hectárea', 'hectáreas'],
  km: ['kilómetro', 'kilómetros'],
  mes: ['mes', 'meses'],
  sem: ['semana', 'semanas'],
  pl: ['plancha', 'planchas'],
  pln: ['plancha', 'planchas'],
  gln: ['galón', 'galones'],
  pers: ['persona', 'personas'],
  dia: ['día', 'días'],
  día: ['día', 'días'],
  pto: ['punto', 'puntos'],
  p2: ['pie cuadrado', 'pies cuadrados'],
  m3k: ['metro cúbico-kilómetro', 'metros cúbicos-kilómetro'],
  'm3-km': ['metro cúbico-kilómetro', 'metros cúbicos-kilómetro'],
  hm: ['hora-máquina', 'horas-máquina'],
  hh: ['hora-hombre', 'horas-hombre'],
  l: ['litro', 'litros'],
  gal: ['galón', 'galones'],
  bls: ['bolsa', 'bolsas'],
  rll: ['rollo', 'rollos'],
  jgo: ['juego', 'juegos'],
  vje: ['viaje', 'viajes'],
};

export function normalizarUnidad(u: string): string {
  return (u || '')
    .trim()
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\./g, '');
}

export function unidadTexto(u: string, plural = false): string {
  const t = UNIDADES_TEXTO[normalizarUnidad(u)];
  if (!t) return u;
  return plural ? t[1] : t[0];
}

export function unidadConocida(u: string): boolean {
  const k = normalizarUnidad(u);
  return k in UNIDADES_TEXTO || k === '%mo' || k === '%cd' || k === 'p2' || k === 'pln' || k === 'gln' || k === 'pza';
}

export function nivelDeCodigo(codigo: string): number {
  return (codigo || '').split('.').filter((s) => s.length > 0).length;
}

export function codigoPadre(codigo: string): string {
  const p = (codigo || '').split('.');
  p.pop();
  return p.join('.');
}

export function compararCodigos(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10));
  const pb = b.split('.').map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? -1;
    const y = pb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

export function rellenarPlantilla(texto: string, vars: Record<string, string>): string {
  return (texto || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
}
