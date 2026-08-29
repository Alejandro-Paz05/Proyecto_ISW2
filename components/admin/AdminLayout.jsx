import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const SECCIONES = [
  { href: '/akaristudio/admin', label: 'Pedidos' },
  { href: '/akaristudio/admin/productos', label: 'Productos' }
];

export default function AdminLayout({ titulo, children }) {
  const router = useRouter();

  async function cerrarSesion() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/akaristudio/admin/login');
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
            <Link href="/akaristudio/admin" className="admin-marca">
              <span className="logo-icon">✦</span>
              <span>Akari <em>Studio</em></span>
            </Link>

            <nav className="admin-nav">
              {SECCIONES.map((seccion) => (
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
              <Link href="/akaristudio" className="admin-link-tienda" target="_blank" rel="noreferrer">
                Ver tienda ↗
              </Link>
              <button type="button" className="admin-salir" onClick={cerrarSesion}>
                Salir
              </button>
            </div>
          </div>
        </header>

        <main className="admin-contenido">
          <h1 className="admin-titulo">{titulo}</h1>
          {children}
        </main>
      </div>
    </>
  );
}
