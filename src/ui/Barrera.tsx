// Barrera de errores: si un módulo falla, el resto del programa sigue y el trabajo no se pierde.
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; alDeshacer: () => void; alDescargar: () => void; alIrAValidacion: () => void }

export class Barrera extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const reintentar = () => this.setState({ error: null });
    return (
      <div className="modulo">
        <div className="aviso error">
          <strong>Esta pantalla no se pudo mostrar.</strong> Su proyecto está guardado y los demás módulos siguen funcionando.
          <div className="pequeno" style={{ marginTop: 4 }}>Detalle: {error.message}</div>
        </div>
        <div className="fila-flex">
          <button className="boton primario" onClick={reintentar}>Reintentar</button>
          <button className="boton" onClick={() => { this.props.alDeshacer(); reintentar(); }}>Deshacer el último cambio</button>
          <button className="boton" onClick={() => { this.props.alIrAValidacion(); reintentar(); }}>Revisar la integridad de los datos</button>
          <button className="boton" onClick={this.props.alDescargar}>Descargar una copia .json</button>
        </div>
      </div>
    );
  }
}
