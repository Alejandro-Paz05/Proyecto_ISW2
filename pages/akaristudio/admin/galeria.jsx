import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { protegerPagina, PANEL_TIENDA } from '@/lib/sesion';
import { LIMITE_DE_BYTES, TIPOS_ACEPTADOS, enMegabytes } from '@/lib/imagen';

/**
 * La galería de trabajos, desde el panel.
 *
 * Se edita la lista entera y se guarda una sola vez: subir una foto, correrla
 * de lugar y borrar la del mes pasado son cosas que se hacen en la misma
 * sentada. Mientras no se guarde, lo único que ya ocurrió es la subida del
 * archivo; el orden y las bajas viven en la pantalla.
 */

export default function GaleriaAdmin({ sesion }) {
  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const soloLectura = sesion?.soloLectura;

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/galeria');
      if (!res.ok) throw new Error('No se pudo cargar la galería.');
      setFotos(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function subir(evento) {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;

    if (archivo.size > LIMITE_DE_BYTES) {
      setError(
        `Esa foto pesa ${enMegabytes(archivo.size)} y el máximo es ${enMegabytes(LIMITE_DE_BYTES)}.`
      );
      return;
    }

    setSubiendo(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/galeria/imagen', {
        method: 'POST',
        headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
        body: archivo
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo subir la foto.');

      // Va al final, que es donde uno espera que aparezca lo que acaba de
      // agregar. Para moverla están las flechas.
      setFotos((actuales) => [...actuales, { imagen: data.url, titulo: '' }]);
      setAviso('Foto subida. Guardá para que aparezca en la portada.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  }

  function mover(indice, salto) {
    const destino = indice + salto;
    if (destino < 0 || destino >= fotos.length) return;

    setFotos((actuales) => {
      const copia = [...actuales];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  function quitar(indice) {
    setFotos((actuales) => actuales.filter((_, i) => i !== indice));
  }

  function cambiarTitulo(indice, titulo) {
    setFotos((actuales) => actuales.map((foto, i) => (i === indice ? { ...foto, titulo } : foto)));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/galeria', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fotos })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la galería.');

      setFotos(data);
      setAviso('Galería actualizada. Ya se ve en la portada.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AdminLayout titulo="Galería" portal="tienda" sesion={sesion}>
      <p className="admin-sub admin-galeria-ayuda">
        Las fotos de trabajos que se ven en la portada, en este orden. Subí una, acomodala con las
        flechas y guardá. El título es opcional y es también lo que lee en voz alta un lector de
        pantalla, así que conviene que diga qué se ve: &quot;laminado de cejas&quot;, no &quot;foto
        3&quot;.
      </p>

      {aviso && <p className="admin-aviso">{aviso}</p>}
      {error && <p className="admin-alerta">{error}</p>}

      {!soloLectura && (
        <div className="admin-galeria-acciones">
          <label className={`admin-subir ${subiendo ? 'ocupado' : ''}`}>
            <input type="file" accept={TIPOS_ACEPTADOS} disabled={subiendo} onChange={subir} />
            {subiendo ? 'Subiendo...' : '+ Subir foto'}
          </label>

          <button
            type="button"
            className="btn btn-gold"
            onClick={guardar}
            disabled={guardando || subiendo}
          >
            {guardando ? 'Guardando...' : 'Guardar galería'}
          </button>
        </div>
      )}

      {cargando && <p className="admin-vacio">Cargando galería...</p>}

      {!cargando && fotos.length === 0 && (
        <p className="admin-vacio">
          Todavía no hay fotos. Mientras la galería esté vacía, esa sección no aparece en la
          portada.
        </p>
      )}

      {fotos.length > 0 && (
        <ul className="admin-galeria">
          {fotos.map((foto, i) => (
            <li className="admin-galeria-item" key={foto.id ?? foto.imagen}>
              <img src={foto.imagen} alt={foto.titulo || `Trabajo ${i + 1}`} loading="lazy" />

              <input
                type="text"
                maxLength={80}
                placeholder="Laminado de cejas"
                value={foto.titulo ?? ''}
                disabled={soloLectura}
                onChange={(e) => cambiarTitulo(i, e.target.value)}
                aria-label={`Título de la foto ${i + 1}`}
              />

              {!soloLectura && (
                <div className="admin-galeria-botones">
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    aria-label={`Mover la foto ${i + 1} hacia atrás`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={i === fotos.length - 1}
                    aria-label={`Mover la foto ${i + 1} hacia adelante`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="peligro"
                    onClick={() => quitar(i)}
                    aria-label={`Quitar la foto ${i + 1}`}
                  >
                    Quitar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminLayout>
  );
}

export const getServerSideProps = protegerPagina(PANEL_TIENDA);
