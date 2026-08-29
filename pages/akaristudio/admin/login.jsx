import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { estaAutenticado, hayPasswordConfigurada } from '@/lib/admin-auth';

export default function LoginAdmin({ configurado }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');

      router.replace('/akaristudio/admin');
    } catch (err) {
      setError(err.message);
      setPassword('');
      setEnviando(false);
    }
  }

  return (
    <>
      <Head>
        <title>Panel de administración | Akari Studio</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="admin-login">
        <form className="admin-login-card" onSubmit={handleSubmit}>
          <span className="logo-icon">✦</span>
          <h1>Akari Studio</h1>
          <p className="admin-login-sub">Panel de administración</p>

          {!configurado ? (
            <p className="admin-alerta">
              Falta configurar <code>ADMIN_PASSWORD</code> en las variables de entorno.
            </p>
          ) : (
            <>
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {error && <p className="admin-alerta">{error}</p>}

              <button type="submit" className="btn btn-gold btn-block" disabled={enviando}>
                {enviando ? 'Verificando...' : 'Entrar'}
              </button>
            </>
          )}
        </form>
      </main>
    </>
  );
}

export function getServerSideProps({ req }) {
  // Si ya hay sesión, no tiene sentido volver a pedir la contraseña.
  if (estaAutenticado(req)) {
    return { redirect: { destination: '/akaristudio/admin', permanent: false } };
  }
  return { props: { configurado: hayPasswordConfigurada() } };
}
