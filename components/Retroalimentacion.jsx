import { useState } from 'react';
import { useCerrarConEscape } from '@/lib/use-escape';

/**
 * Botón y formulario para dejar retroalimentación desde la tienda.
 *
 * Vive en el pie, en todas las páginas públicas: quien encuentra un problema
 * lo reporta donde lo encontró, sin tener que buscar un canal. Si es un
 * problema, la base abre un ticket solo.
 */

const TIPOS = [
  { valor: 'sugerencia', etiqueta: 'Sugerencia', icono: '💡' },
  { valor: 'problema', etiqueta: 'Problema', icono: '⚠️' },
  { valor: 'elogio', etiqueta: 'Elogio', icono: '💛' }
];

export default function Retroalimentacion() {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState('sugerencia');
  const [mensaje, setMensaje] = useState('');
  const [correo, setCorreo] = useState('');
  const [trampa, setTrampa] = useState('');
  const [estado, setEstado] = useState('editando');
  const [error, setError] = useState(null);

  function cerrar() {
    setAbierto(false);

    // Después de enviar, la próxima vez arranca de cero. Si se cerró sin
    // enviar, lo escrito se conserva: cerrar por error no debería borrarlo.
    if (estado === 'enviado') {
      setEstado('editando');
      setTipo('sugerencia');
      setMensaje('');
      setCorreo('');
    }
  }

  useCerrarConEscape(abierto, cerrar);

  async function enviar(evento) {
    evento.preventDefault();
    setEstado('enviando');
    setError(null);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          mensaje,
          correo,
          pagina: window.location.pathname,
          sitio_web: trampa
        })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'No pudimos enviar tu mensaje.');

      setEstado('enviado');
    } catch (err) {
      setError(err.message);
      setEstado('editando');
    }
  }

  return (
    <>
      <button type="button" className="footer-retro" onClick={() => setAbierto(true)}>
        ¿Algo que mejorar? Contanos
      </button>

      {abierto && (
        <div className="modal-overlay active">
          <button
            type="button"
            className="overlay-cerrar"
            aria-label="Cerrar el formulario de comentarios"
            onClick={cerrar}
          />
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="retro-titulo">
            <button className="close-btn modal-close" onClick={cerrar} aria-label="Cerrar">
              &times;
            </button>

            {estado === 'enviado' ? (
              <div className="retro-gracias">
                <h2 className="checkout-title" id="retro-titulo">
                  ¡Gracias por contarnos!
                </h2>
                <p className="checkout-sub">
                  {tipo === 'problema'
                    ? 'Quedó anotado para revisarlo y corregirlo.'
                    : 'Lo leemos todo, y lo usamos para mejorar la tienda.'}
                </p>
                <button type="button" className="btn btn-gold btn-block" onClick={cerrar}>
                  Listo
                </button>
              </div>
            ) : (
              <form onSubmit={enviar}>
                <h2 className="checkout-title" id="retro-titulo">
                  Contanos
                </h2>
                <p className="checkout-sub">
                  Una idea, algo que no funcionó o algo que te gustó. Lo leemos todo.
                </p>

                <fieldset className="form-group payment-fieldset">
                  <legend>¿Qué nos querés contar?</legend>
                  <div className="payment-methods">
                    {TIPOS.map((opcion) => (
                      <label
                        key={opcion.valor}
                        className={`payment-option ${tipo === opcion.valor ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="tipo"
                          value={opcion.valor}
                          checked={tipo === opcion.valor}
                          onChange={() => setTipo(opcion.valor)}
                        />
                        <span className="pay-icon">{opcion.icono}</span>
                        {opcion.etiqueta}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="form-group">
                  <label htmlFor="retro-mensaje">Tu mensaje *</label>
                  <textarea
                    id="retro-mensaje"
                    rows="4"
                    required
                    minLength={5}
                    maxLength={2000}
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="retro-correo">Tu correo, si querés que te respondamos</label>
                  <input
                    id="retro-correo"
                    type="email"
                    autoComplete="email"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                  />
                </div>

                {/* Trampa para bots: fuera de la pantalla y fuera del orden de
                    tabulación. Una persona nunca la ve ni la llena. */}
                <div className="campo-trampa" aria-hidden="true">
                  <label htmlFor="retro-sitio">No completes este campo</label>
                  <input
                    id="retro-sitio"
                    name="sitio_web"
                    tabIndex={-1}
                    autoComplete="off"
                    value={trampa}
                    onChange={(e) => setTrampa(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="error-text" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  className="btn btn-gold btn-block"
                  disabled={estado === 'enviando'}
                >
                  {estado === 'enviando' ? 'Enviando...' : 'Enviar'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
