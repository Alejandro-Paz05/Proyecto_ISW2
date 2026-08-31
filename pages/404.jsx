import Link from 'next/link';
import Layout from '@/components/Layout';

export default function NoEncontrada() {
  return (
    <Layout
      titulo="Página no encontrada"
      descripcion="La dirección que buscás no existe en este sitio."
    >
      <main className="error-pagina">
        <span className="logo-icon">✦</span>
        <p className="error-codigo">404</p>
        <h1>Esta página no existe</h1>
        <p className="error-texto">
          La dirección que escribiste no corresponde a ninguna página del sitio. Puede que el
          enlace esté viejo o tenga un error de tipeo.
        </p>

        <div className="error-enlaces">
          <Link href="/akaristudio" className="btn btn-gold">
            Ir al inicio
          </Link>
          <Link href="/akaristudio/citas" className="btn btn-outline">
            Reservar una cita
          </Link>
        </div>
      </main>
    </Layout>
  );
}
