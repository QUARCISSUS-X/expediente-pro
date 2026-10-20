// Fórmula polinómica según D.S. 011-79-VC:
// máx. 8 monomios, cada monomio >= 0.050, hasta 3 índices representativos por monomio,
// coeficientes al milésimo que suman 1.000, GG y utilidad en un solo monomio (índice 39).
import { nombreIU, SIMBOLO_IU } from '../data/iu';
import type { Monomio, Pie, Polinomica, RelacionInsumos } from './types';
import { redondear, redondearMilesimo } from './util';

interface Grupo {
  miembros: { iu: string; nombre: string; incidencia: number }[];
  fijo?: 'J' | 'GU';
}

const coef = (g: Grupo) => g.miembros.reduce((a, m) => a + m.incidencia, 0);

export function calcularPolinomica(rel: RelacionInsumos, pie: Pie): Polinomica {
  const base = pie.costoDirecto + pie.gg + pie.utilidad;
  const montos = new Map<string, number>();
  for (const it of rel.items) montos.set(it.insumo.iu || '39', (montos.get(it.insumo.iu || '39') ?? 0) + it.parcial);
  const sumaMontos = [...montos.values()].reduce((a, b) => a + b, 0);
  const factorCD = sumaMontos > 0 && base > 0 ? pie.costoDirecto / sumaMontos : 0;
  const incidencias = [...montos.entries()]
    .map(([iu, monto]) => ({ iu, nombre: nombreIU(iu), monto: redondear(monto * factorCD, 2), incidencia: base > 0 ? (monto * factorCD) / base : 0 }))
    .sort((a, b) => b.incidencia - a.incidencia);
  const gguInc = base > 0 ? (pie.gg + pie.utilidad) / base : 0;

  // grupos iniciales
  const grupos: Grupo[] = [];
  const gu: Grupo = { miembros: [], fijo: 'GU' };
  let inc39 = gguInc;
  for (const inc of incidencias) {
    if (inc.iu === '39') inc39 += inc.incidencia;
    else if (inc.iu === '47') grupos.push({ miembros: [{ ...inc }], fijo: 'J' });
    else if (inc.incidencia > 0) grupos.push({ miembros: [{ iu: inc.iu, nombre: inc.nombre, incidencia: inc.incidencia }] });
  }
  if (inc39 > 0) gu.miembros.push({ iu: '39', nombre: nombreIU('39'), incidencia: inc39 });
  if (gu.miembros.length) grupos.push(gu);

  // agrupar hasta cumplir 8 monomios y mínimo 0.05
  let guard = 0;
  while (grupos.length > 1 && guard++ < 200) {
    const orden = [...grupos].sort((a, b) => coef(a) - coef(b));
    const menor = orden[0];
    if (grupos.length <= 8 && coef(menor) >= 0.05) break;
    const candidatos = orden.filter((g) => g !== menor && !g.fijo);
    let destino = candidatos[0];
    if (!destino) destino = orden.filter((g) => g !== menor).sort((a, b) => coef(b) - coef(a))[0];
    if (menor.fijo && !destino.fijo) {
      // el grupo fijo (J o GU) absorbe al no fijo para conservar su identidad
      menor.miembros.push(...destino.miembros);
      grupos.splice(grupos.indexOf(destino), 1);
    } else {
      destino.miembros.push(...menor.miembros);
      grupos.splice(grupos.indexOf(menor), 1);
    }
  }

  // monomios
  const usados = new Set<string>();
  let monomios: Monomio[] = grupos.map((g) => {
    const miembros = [...g.miembros].sort((a, b) => b.incidencia - a.incidencia);
    const reps = miembros.slice(0, 3);
    const sumaReps = reps.reduce((a, r) => a + r.incidencia, 0) || 1;
    let pesos = reps.map((r) => redondearMilesimo(r.incidencia / sumaReps));
    const dif = redondear(1 - pesos.reduce((a, b) => a + b, 0), 3);
    if (pesos.length) pesos[0] = redondear(pesos[0] + dif, 3);
    let simbolo = g.fijo ?? SIMBOLO_IU[miembros[0].iu] ?? 'M';
    let s = simbolo;
    let n = 2;
    while (usados.has(s)) s = `${simbolo}${n++}`;
    usados.add(s);
    simbolo = s;
    return {
      simbolo,
      coeficiente: coef(g),
      indices: reps.map((r, i) => ({ iu: r.iu, nombre: nombreIU(r.iu), peso: pesos[i] })),
      miembros,
    };
  });
  monomios.sort((a, b) => b.coeficiente - a.coeficiente);
  monomios = monomios.map((m) => ({ ...m, coeficiente: redondearMilesimo(m.coeficiente) }));
  const suma0 = redondear(monomios.reduce((a, m) => a + m.coeficiente, 0), 3);
  if (monomios.length && suma0 !== 1 && base > 0) monomios[0].coeficiente = redondear(monomios[0].coeficiente + (1 - suma0), 3);
  const suma = redondear(monomios.reduce((a, m) => a + m.coeficiente, 0), 3);
  const formula =
    'K = ' +
    monomios.map((m) => `${m.coeficiente.toFixed(3)} (${m.simbolo}r/${m.simbolo}o)`).join(' + ');
  return { base: redondear(base, 2), incidencias, monomios, formula, suma };
}
