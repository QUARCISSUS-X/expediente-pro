// Evaluador propio de fórmulas aritméticas para metrados («2*(3.5+4.2)», «12,5/2»), sin eval ni new Function
// (la extensión de navegador no los permite). Admite + − × ÷ ^, paréntesis, signo y la coma o el punto decimal.

export class ErrorExpresion extends Error {}

type Token = { t: 'num'; v: number } | { t: 'op'; v: string };

function tokens(s: string): Token[] {
  const out: Token[] = [];
  const texto = s.replace(/^=/, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  // coma decimal solo si no hay punto (12,5) — en «1,234.50» la coma es de miles
  const t = /\./.test(texto) ? texto.replace(/,/g, '') : texto.replace(/,/g, '.');
  for (let i = 0; i < t.length; ) {
    const c = t[i];
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?|^\d+\.?/.exec(t.slice(i))!;
      out.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
    } else if ('+-*/^()'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else throw new ErrorExpresion(`Carácter no permitido: «${c}»`);
  }
  return out;
}

/** Valor de una expresión. Lanza ErrorExpresion si no es válida o divide entre cero. */
export function evaluarExpresion(s: string): number {
  const tk = tokens(s);
  if (!tk.length) throw new ErrorExpresion('La fórmula está vacía.');
  let i = 0;
  const ver = () => tk[i];
  const tomar = (op: string) => { const x = tk[i]; if (x?.t === 'op' && x.v === op) { i++; return true; } return false; };
  // suma := producto (('+'|'-') producto)*
  const suma = (): number => {
    let v = producto();
    for (;;) {
      if (tomar('+')) v += producto();
      else if (tomar('-')) v -= producto();
      else return v;
    }
  };
  const producto = (): number => {
    let v = potencia();
    for (;;) {
      if (tomar('*')) v *= potencia();
      else if (tomar('/')) {
        const d = potencia();
        if (d === 0) throw new ErrorExpresion('División entre cero.');
        v /= d;
      } else return v;
    }
  };
  // potencia := unario ('^' potencia)?   (asociativa a la derecha)
  const potencia = (): number => {
    const b = unario();
    return tomar('^') ? Math.pow(b, potencia()) : b;
  };
  const unario = (): number => {
    if (tomar('-')) return -unario();
    if (tomar('+')) return unario();
    return primario();
  };
  const primario = (): number => {
    const x = ver();
    if (!x) throw new ErrorExpresion('La fórmula está incompleta.');
    if (x.t === 'num') { i++; return x.v; }
    if (tomar('(')) {
      const v = suma();
      if (!tomar(')')) throw new ErrorExpresion('Falta cerrar un paréntesis.');
      return v;
    }
    throw new ErrorExpresion(`Sobra «${x.v}».`);
  };
  const v = suma();
  if (i < tk.length) throw new ErrorExpresion(`Sobra «${(tk[i] as { v: unknown }).v}».`);
  if (!Number.isFinite(v)) throw new ErrorExpresion('El resultado no es un número.');
  return v;
}

/** Verdadero si el texto es una fórmula (tiene operaciones) y no un número simple. */
export function esFormula(s: string): boolean {
  const t = s.trim().replace(/^=/, '');
  return /[+*/^()×÷]/.test(t) || /\d\s*-\s*\d/.test(t);
}

/** Fórmula en sintaxis de Excel (punto decimal, * y /) para escribirla en la planilla. */
export function formulaExcel(s: string): string {
  const texto = s.trim().replace(/^=/, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  return /\./.test(texto) ? texto.replace(/,/g, '') : texto.replace(/,/g, '.');
}
