import { Component } from 'react';
import { reportarErrorDelNavegador } from '@/lib/capturar-errores';

/**
 * Atrapa los errores de render de React.
 *
 * Sin esto, un error en cualquier componente deja la página en blanco: React
 * desmonta todo el árbol y la clienta no sabe si la tienda se cayó o si fue
 * su conexión. Con esto ve un mensaje y un botón para seguir, y el error
 * llega como ticket.
 *
 * Es una clase porque los límites de error todavía no existen como hooks.
 */
export default class LimiteDeErrores extends Component {
  constructor(props) {
    super(props);
    this.state = { fallo: false };
  }

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error, info) {
    // Igual que la captura global: en desarrollo cada error a medio escribir
    // abriría un ticket.
    if (process.env.NODE_ENV !== 'production') return;

    reportarErrorDelNavegador(
      {
        name: error?.name,
        message: error?.message,
        stack: `${error?.stack ?? ''}\n${info?.componentStack ?? ''}`
      },
      'render'
    );
  }

  render() {
    if (!this.state.fallo) return this.props.children;

    return (
      <main className="pantalla-de-error" role="alert">
        <span className="logo-icon">✦</span>
        <h1>Algo salió mal</h1>
        <p>Recargá la página para seguir. Si vuelve a pasar, escribinos por WhatsApp.</p>
        <button type="button" className="btn btn-gold" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </main>
    );
  }
}
