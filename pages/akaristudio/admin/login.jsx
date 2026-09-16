import { useState } from 'react';
import Head from 'next/head';
import { supabaseNavegador } from '@/lib/supabase-navegador';
import { hayPasswordConfigurada } from '@/lib/admin-auth';
import {
  leerSesion,
  destinoSeguro,
  esRutaPropia,
  autenticacionConfigurada
} from '@/lib/sesion';

/**
 * Ingreso y registro.
 *
 * Ofrece lo que esté configurado: correo y contraseña, Google, y durante la
 * transición la contraseña compartida del panel. Después de entrar no decide
 * a dónde ir: pasa por /api/auth/continuar, que manda a cada quien a su
 * portal según el rol.
 */

const MENSAJES_DE_ERROR = {
  google: 'No se pudo iniciar sesión con Google. Probá de nuevo.',
  cuentas_no_disponibles: 'El ingreso con cuenta todavía no está disponible.'
};

const LARGO_MINIMO_CONTRASENA = 8;

function urlDeContinuar(volver) {
  return volver ? `/api/auth/continuar?volver=${encodeURIComponent(volver)}` : '/api/auth/continuar';
}

function LogoDeGoogle() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function Ingreso({ cuentasDisponibles, contrasenaDelPanel, volver, error: motivo }) {
  const [modo, setModo] = useState('ingresar');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [passwordDelPanel, setPasswordDelPanel] = useState('');
  const [error, setError] = useState(MENSAJES_DE_ERROR[motivo] ?? null);
  const [confirmacionEnviada, setConfirmacionEnviada] = useState(false);
  // Qué forma de ingreso está en curso, para no aceptar dos a la vez.
  const [enviando, setEnviando] = useState(null);

  const registrando = modo === 'registro';

  function cambiarDeModo() {
    setModo(registrando ? 'ingresar' : 'registro');
    setError(null);
    setPassword('');
  }

  async function ingresarConCuenta(evento) {
    evento.preventDefault();
    setEnviando('cuenta');
    setError(null);

    const { error: fallo } = await supabaseNavegador().auth.signInWithPassword({
      email: correo.trim(),
      password
    });

    if (fallo) {
      // El mismo mensaje para un correo sin cuenta y una contraseña
      // equivocada: distinguirlos le diría a quien prueba qué correos están
      // registrados. El único caso distinto es el correo sin confirmar, que
      // Supabase solo informa cuando la contraseña ya fue correcta.
      setError(
        fallo.code === 'email_not_confirmed'
          ? 'Confirmá tu correo: te enviamos un enlace cuando creaste la cuenta.'
          : 'Correo o contraseña incorrectos.'
      );
      setPassword('');
      setEnviando(null);
      return;
    }

    // Navegación completa y no del router: la cookie de sesión recién puesta
    // tiene que viajar en la próxima petición al servidor.
    window.location.assign(urlDeContinuar(volver));
  }

  async function crearCuenta(evento) {
    evento.preventDefault();

    if (password.length < LARGO_MINIMO_CONTRASENA) {
      setError(`La contraseña tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`);
      return;
    }

    setEnviando('cuenta');
    setError(null);

    const { data, error: fallo } = await supabaseNavegador().auth.signUp({
      email: correo.trim(),
      password,
      options: {
        // El trigger de la base toma el nombre de acá para armar el perfil.
        data: { full_name: nombre.trim() },
        emailRedirectTo: `${window.location.origin}${urlDeContinuar(volver)}`
      }
    });

    if (fallo) {
      setError(
        fallo.code === 'user_already_exists'
          ? 'Ese correo ya tiene cuenta. Probá iniciando sesión.'
          : 'No pudimos crear la cuenta. Revisá el correo y la contraseña.'
      );
      setEnviando(null);
      return;
    }

    // Con la confirmación de correo activada, el registro no abre sesión: la
    // cuenta queda esperando a que se abra el enlace del correo.
    if (data?.session) {
      window.location.assign(urlDeContinuar(volver));
      return;
    }

    setConfirmacionEnviada(true);
    setEnviando(null);
  }

  async function ingresarConGoogle() {
    setEnviando('google');
    setError(null);

    const { error: fallo } = await supabaseNavegador().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${urlDeContinuar(volver)}` }
    });

    // Si todo va bien el navegador ya se fue a Google y esto no llega a verse.
    if (fallo) {
      setError(MENSAJES_DE_ERROR.google);
      setEnviando(null);
    }
  }

  async function ingresarConPasswordDelPanel(evento) {
    evento.preventDefault();
    setEnviando('panel');
    setError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordDelPanel })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');

      window.location.assign(urlDeContinuar(volver));
    } catch (err) {
      setError(err.message);
      setPasswordDelPanel('');
      setEnviando(null);
    }
  }

  return (
    <>
      <Head>
        <title>Ingresar | Akari Studio</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="admin-login">
        <div className="admin-login-card">
          <span className="logo-icon">✦</span>
          <h1>Akari Studio</h1>
          <p className="admin-login-sub">
            {registrando ? 'Creá tu cuenta' : 'Ingresá a tu cuenta'}
          </p>

          {error && (
            <p className="admin-alerta" role="alert">
              {error}
            </p>
          )}

          {confirmacionEnviada ? (
            <p className="admin-aviso" role="status">
              Te enviamos un correo a <strong>{correo}</strong> para confirmar la cuenta. Abrí ese
              enlace y volvé a entrar acá.
            </p>
          ) : (
            cuentasDisponibles && (
              <>
                <form onSubmit={registrando ? crearCuenta : ingresarConCuenta}>
                  {registrando && (
                    <>
                      <label htmlFor="nombre">Tu nombre</label>
                      <input
                        id="nombre"
                        name="nombre"
                        type="text"
                        autoComplete="name"
                        required
                        minLength={2}
                        maxLength={80}
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                      />
                    </>
                  )}

                  <label htmlFor="correo">Correo</label>
                  <input
                    id="correo"
                    name="correo"
                    type="email"
                    autoComplete="email"
                    required
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                  />

                  <label htmlFor="password">Contraseña</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={registrando ? 'new-password' : 'current-password'}
                    required
                    minLength={registrando ? LARGO_MINIMO_CONTRASENA : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />

                  <button type="submit" className="btn btn-gold btn-block" disabled={enviando !== null}>
                    {enviando === 'cuenta'
                      ? 'Un momento...'
                      : registrando
                        ? 'Crear cuenta'
                        : 'Ingresar'}
                  </button>
                </form>

                <div className="admin-login-divisor">
                  <span>o</span>
                </div>

                <button
                  type="button"
                  className="boton-google"
                  onClick={ingresarConGoogle}
                  disabled={enviando !== null}
                >
                  <LogoDeGoogle />
                  {enviando === 'google' ? 'Abriendo Google...' : 'Continuar con Google'}
                </button>

                <button type="button" className="admin-login-cambiar" onClick={cambiarDeModo}>
                  {registrando ? '¿Ya tenés cuenta? Ingresá' : '¿No tenés cuenta? Creala'}
                </button>
              </>
            )
          )}

          {contrasenaDelPanel && !confirmacionEnviada && (
            <form
              onSubmit={ingresarConPasswordDelPanel}
              className={cuentasDisponibles ? 'admin-login-temporal' : undefined}
            >
              {cuentasDisponibles && (
                <p className="admin-login-nota">
                  Acceso temporal con la contraseña compartida, mientras se crean las cuentas.
                </p>
              )}

              <label htmlFor="password-panel">Contraseña del panel</label>
              <input
                id="password-panel"
                name="password-panel"
                type="password"
                autoComplete="current-password"
                autoFocus={!cuentasDisponibles}
                required
                value={passwordDelPanel}
                onChange={(e) => setPasswordDelPanel(e.target.value)}
              />

              <button
                type="submit"
                className={`btn btn-block ${cuentasDisponibles ? 'btn-outline-oscuro' : 'btn-gold'}`}
                disabled={enviando !== null}
              >
                {enviando === 'panel' ? 'Verificando...' : 'Entrar con la contraseña del panel'}
              </button>
            </form>
          )}

          {!cuentasDisponibles && !contrasenaDelPanel && (
            <p className="admin-alerta">
              El ingreso no está configurado: faltan las variables de Supabase y{' '}
              <code>ADMIN_PASSWORD</code>.
            </p>
          )}
        </div>
      </main>
    </>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const volver = esRutaPropia(query.volver) ? query.volver : null;

  // Con sesión, pedir la contraseña otra vez no tiene sentido.
  const sesion = await leerSesion(req, res);
  if (sesion) {
    return { redirect: { destination: destinoSeguro(volver, sesion.rol), permanent: false } };
  }

  return {
    props: {
      // Se decide en el servidor y no leyendo NEXT_PUBLIC_ en el navegador:
      // esas se incrustan al compilar y podrían no coincidir con lo que el
      // servidor tiene configurado ahora.
      cuentasDisponibles: autenticacionConfigurada(),
      contrasenaDelPanel: hayPasswordConfigurada(),
      volver,
      error: typeof query.error === 'string' ? query.error : null
    }
  };
}
