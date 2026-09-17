import { useCallback, useEffect, useState } from 'react';
import { useCerrarConEscape } from '@/lib/use-escape';

/**
 * Las fotos de trabajos del salón.
 *
 * Si no hay ninguna, la sección no existe: un hueco con "próximamente" es peor
 * que no tener galería, porque anuncia que algo falta.
 *
 * Las fotos se piden en el navegador y no en el servidor a propósito. La
 * portada tiene que pintarse ya; la galería está más abajo y puede llegar un
 * instante después sin que nadie lo note. Así una demora de la base nunca
 * retrasa el título ni los botones.
 */
export default function Galeria() {
  const [fotos, setFotos] = useState([]);
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    let vigente = true;

    fetch('/api/galeria')
      .then((res) => (res.ok ? res.json() : []))
      .then((datos) => {
        if (vigente && Array.isArray(datos)) setFotos(datos);
      })
      // Sin galería la portada se ve igual que siempre: no vale la pena
      // mostrarle un error a la clienta por esto.
      .catch(() => {});

    return () => {
      vigente = false;
    };
  }, []);

  const cerrar = useCallback(() => setAbierta(null), []);
  useCerrarConEscape(Boolean(abierta), cerrar);

  if (fotos.length === 0) return null;

  return (
    <section id="galeria" className="section section-dark">
      <div className="container">
        <p className="section-tag" data-revelar>Nuestro trabajo</p>
        <h2 className="section-title" data-revelar>Galería</h2>

        <div className="galeria-grid">
          {fotos.map((foto, i) => (
            <button
              type="button"
              className="galeria-foto"
              key={foto.id}
              data-revelar
              style={{ '--i': i % 8 }}
              onClick={() => setAbierta(foto)}
              aria-label={`Ver más grande: ${foto.titulo || `trabajo ${i + 1}`}`}
            >
              <img src={foto.imagen} alt={foto.titulo || ''} loading="lazy" />
              {foto.titulo && <span>{foto.titulo}</span>}
            </button>
          ))}
        </div>
      </div>

      {abierta && (
        // Se cierra tocando cualquier lado: en un teléfono, buscar una cruz
        // chica con el pulgar es peor que tocar donde se pueda.
        <div
          className="galeria-visor"
          role="dialog"
          aria-modal="true"
          aria-label={abierta.titulo || 'Foto del trabajo'}
          onClick={cerrar}
        >
          <img src={abierta.imagen} alt={abierta.titulo || ''} />
          {abierta.titulo && <p>{abierta.titulo}</p>}
          <button type="button" className="galeria-cerrar" onClick={cerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
