// Tema de la interfaz: automático (según el sistema), claro u oscuro. Se guarda en este navegador o en la app y se
// aplica antes de dibujar la interfaz (atributo data-tema de <html>; los colores están en estilos.css).
export type Tema = 'auto' | 'claro' | 'oscuro';
const CLAVE = 'expediente-pro:tema';

export function leerTema(): Tema {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'claro' || t === 'oscuro' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function aplicarTema(t: Tema = leerTema()) {
  if (typeof document === 'undefined') return;
  if (t === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', t);
}

export function cambiarTema(t: Tema) {
  try { localStorage.setItem(CLAVE, t); } catch { /* sin almacenamiento: dura hasta cerrar */ }
  aplicarTema(t);
}

export const siguienteTema = (t: Tema): Tema => (t === 'auto' ? 'oscuro' : t === 'oscuro' ? 'claro' : 'auto');
export const NOMBRE_TEMA: Record<Tema, string> = { auto: 'Tema automático (según el sistema)', claro: 'Tema claro', oscuro: 'Tema oscuro' };
