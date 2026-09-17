import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import BotonDeAvisos from '@/components/admin/BotonDeAvisos';

/**
 * El marco de los dos portales privados.
 *
 * Es el mismo componente porque comparten todo lo que se ve alrededor: la
 * barra, el nombre, salir. Lo único que cambia son las secciones, y quién
 * puede saltar de un portal al otro.
 */

const SECCIONES = {
  tienda: [
    { href: '/akaristudio/admin', label: 'Pedidos' },
    { href: '/akaristudio/admin/productos', label: 'Productos' },
    { href: '/akaristudio/admin/galeria', label: 'Galería' },
    { href: '/akaristudio/admin/retroalimentacion', label: 'Retroalimentación' }
  ],
  // La retroalimentación se ve desde los dos portales, y cada uno tiene su
  // propia página: si esta apuntara a la del panel de la tienda, tocarla
  // mudaría de portal y las secciones de la barra cambiarían solas.
  sistema: [
    { href: '/akaristudio/sistema', label: 'Tickets' },
    { href: '/akaristudio/sistema/cuentas', label: 'Cuentas' },
    { href: '/akaristudio/sistema/retroalimentacion', label: 'Retroalimentación' }
  ]
};

const OTRO_PORTAL = {
  tienda: { href: '/akaristudio/sistema', label: 'Sistema' },
  sistema: { href: '/akaristudio/admin', label: 'Tienda' }
};

export default function AdminLayout({ titulo, portal = 'tienda', sesion, children }) {
  const router = useRouter();
  const secciones = SECCIONES[portal];

  // Solo quien entra a los dos portales necesita el atajo entre ellos.
  const puedeVerElSistema = sesion?.rol === 'admin' || sesion?.rol === 'super_admin';
  const otro = OTRO_PORTAL[portal];

  async function cerrarSesion() {
    await fetch('/api/admin/logout', { method: 'POST' });
    // Navegación completa y no del router: el servidor tiene que ver la
    // petición ya sin las cookies que se acaban de vencer.
    window.location.assign('/akaristudio/admin/login');
  }

  return (
    <>
      <Head>
        <title>{titulo} | Akari Studio</title>
        {/* El panel no debe aparecer en buscadores. */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="admin">
        <header className="admin-header">
          <div className="admin-header-inner">
            <Link href={secciones[0].href} className="admin-marca">
              <span className="logo-icon">✦</span>
              <span>Akari <em>Studio</em></span>
            </Link>

            <nav className="admin-nav">
              {secciones.map((seccion) => (
                <Link
                  key={seccion.href}
                  href={seccion.href}
                  className={router.pathname === seccion.href ? 'activo' : undefined}
                  aria-current={router.pathname === seccion.href ? 'page' : undefined}
                >
                  {seccion.label}
                </Link>
              ))}
            </nav>

            <div className="admin-acciones">
              {/* Solo para quien atiende los pedidos, y solo con cuenta
                  propia: la contraseña compartida no identifica un
                  dispositivo al que mandarle nada. */}
              {!sesion?.soloLectura && sesion?.origen === 'supabase' && <BotonDeAvisos />}

              {puedeVerElSistema && (
                <Link href={otro.href} className="admin-link-tienda">
                  {otro.label} →
                </Link>
              )}
              {/* En el teléfono se esconde: quien atiende el panel ya tiene la
                  tienda a un toque, y en 390px cada enlace de más empuja a los
                  otros a una segunda fila desprolija. */}
              <Link
                href="/akaristudio"
                className="admin-link-tienda solo-escritorio"
                target="_blank"
                rel="noreferrer"
              >
                Ver tienda ↗
              </Link>
              <button type="button" className="admin-salir" onClick={cerrarSesion}>
                Salir
              </button>
            </div>
          </div>
        </header>

        <main className="admin-contenido">
          {sesion?.soloLectura && (
            <p className="admin-banner-lectura">
              Modo lectura{sesion.email ? ` · ${sesion.email}` : ''}. Esta cuenta ve todo el sistema
              y no modifica nada.
            </p>
          )}

          <h1 className="admin-titulo">{titulo}</h1>
          {children}
        </main>
      </div>
    </>
  );
}
