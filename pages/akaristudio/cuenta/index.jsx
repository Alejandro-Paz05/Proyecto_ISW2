import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import TiendaLayout from '@/components/TiendaLayout';
import { getSupabaseAdmin } from '@/lib/supabase';
import { cuentaDeSesion } from '@/lib/sesion';
import { destinoSegunRol } from '@/lib/roles';

/**
 * Mi cuenta: el nombre y los pedidos de quien entró.
 *
 * Solo aparecen los pedidos hechos con la sesión iniciada. Los de invitada no
 * tienen cuenta y no hay forma honesta de adivinar cuáles fueron suyos: el
 * correo del formulario lo escribe cualquiera.
 */

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

function formatFecha(iso) {
  return new Date(iso).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function MiCuenta({ cuenta }) {
  const [nombre, setNombre] = useState(cuenta.nombre ?? '');
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/cuenta/pedidos');
      if (!res.ok) throw new Error('No pudimos cargar tus pedidos.');
      setPedidos(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardarNombre(evento) {
    evento.preventDefault();
    setGuardando(true);
    setAviso(null);
    setError(null);

    try {
      const res = await fetch('/api/cuenta/perfil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: nombre })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No pudimos guardar tu nombre.');

      setAviso('Listo, guardamos tu nombre.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cerrarSesion() {
    await fetch('/api/admin/logout', { method: 'POST' });
    // Navegación completa: el servidor tiene que ver la próxima petición ya
    // sin las cookies de sesión.
    window.location.assign('/akaristudio');
  }

  return (
    <TiendaLayout titulo="Mi cuenta" descripcion="Tus pedidos y tus datos en Akari Studio.">
      <section className="section section-dark">
        <div className="container">
          <p className="section-tag">Tu cuenta</p>
          <h2 className="section-title">Hola{cuenta.nombre ? `, ${cuenta.nombre}` : ''}</h2>
          <p className="section-sub">{cuenta.correo}</p>

          {cuenta.rol !== 'clienta' && (
            <Link href={destinoSegunRol(cuenta.rol)} className="btn btn-outline">
              Ir a mi panel
            </Link>
          )}

          <form className="cuenta-form" onSubmit={guardarNombre}>
            <label htmlFor="nombre">
              Tu nombre
              <input
                id="nombre"
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-gold" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </form>

          {aviso && <p className="cuenta-aviso">{aviso}</p>}
          {error && <p className="error-text">⚠️ {error}</p>}

          <h3 className="cuenta-titulo">Mis pedidos</h3>

          {cargando && <p className="empty-text">Cargando tus pedidos...</p>}

          {!cargando && pedidos.length === 0 && (
            <p className="empty-text">
              Todavía no hiciste ningún pedido con esta cuenta. Las compras como invitada no
              aparecen acá, porque no quedan asociadas a nadie. ✨
            </p>
          )}

          {pedidos.length > 0 && (
            <ul className="cuenta-pedidos">
              {pedidos.map((pedido) => (
                <li key={pedido.id} className="cuenta-pedido">
                  <div className="cuenta-pedido-cabecera">
                    <strong>{pedido.order_number}</strong>
                    <span>{formatFecha(pedido.created_at)}</span>
                  </div>

                  <ul>
                    {pedido.order_items.map((item, i) => (
                      <li key={i}>
                        {item.quantity} × {item.product_name} · {formatPrice(item.price * item.quantity)}
                      </li>
                    ))}
                  </ul>

                  <div className="cuenta-pedido-pie">
                    <span className="cuenta-estado">{pedido.status}</span>
                    <strong>{formatPrice(pedido.total)}</strong>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="cuenta-salir" onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </section>
    </TiendaLayout>
  );
}

export async function getServerSideProps({ req, res, resolvedUrl }) {
  // Se exige una cuenta, no cualquier sesión: la contraseña compartida del
  // panel no identifica a una persona y acá todo es "lo mío".
  const cuenta = await cuentaDeSesion(req, res);

  if (!cuenta) {
    return {
      redirect: {
        destination: `/akaristudio/admin/login?volver=${encodeURIComponent(resolvedUrl)}`,
        permanent: false
      }
    };
  }

  const { data } = await getSupabaseAdmin()
    .from('profiles')
    .select('full_name, role')
    .eq('id', cuenta.id)
    .maybeSingle();

  return {
    props: {
      cuenta: {
        correo: cuenta.email ?? null,
        nombre: data?.full_name ?? null,
        rol: data?.role ?? 'clienta'
      }
    }
  };
}
