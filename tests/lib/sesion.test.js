import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crearCadena } from '../helpers/supabase';
import { crearRes, llamar } from '../helpers/http';

const { createServerClient, getUser, desde } = vi.hoisted(() => {
  const getUser = vi.fn();
  return {
    getUser,
    desde: vi.fn(),
    createServerClient: vi.fn(() => ({ auth: { getUser } }))
  };
});

vi.mock('@supabase/ssr', () => ({ createServerClient }));
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: desde }) }));

import { COOKIE_SESION, crearToken } from '@/lib/admin-auth';
import {
  leerSesion,
  conRol,
  protegerPagina,
  destinoSeguro,
  destinoSegunRol,
  serializarCookie,
  puedeEscribir,
  PANEL_TIENDA,
  PORTAL_SISTEMA
} from '@/lib/sesion';

const USUARIO = { id: 'cuenta-1', email: 'maria@ejemplo.com' };
const PASSWORD_DEL_PANEL = 'contrasena-larga-de-prueba';

function conUsuario(usuario = USUARIO) {
  getUser.mockResolvedValue({ data: { user: usuario }, error: null });
}

function conRolEnLaBase(rol) {
  desde.mockReturnValue(crearCadena({ data: rol ? { role: rol } : null, error: null }));
}

/** Una cookie de la contraseña compartida, válida. */
function cookiesDelPanel() {
  process.env.ADMIN_PASSWORD = PASSWORD_DEL_PANEL;
  return { [COOKIE_SESION]: crearToken() };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
  createServerClient.mockClear();
  getUser.mockReset();
  desde.mockReset();
  getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth session missing!' } });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.ADMIN_PASSWORD;
});

describe('leerSesion', () => {
  it('sin sesión de ningún tipo devuelve null', async () => {
    expect(await leerSesion({ cookies: {} }, crearRes())).toBeNull();
  });

  it('con una cuenta de Supabase devuelve quién es y el rol de su perfil', async () => {
    conUsuario();
    conRolEnLaBase('duena');

    const sesion = await leerSesion({ cookies: {} }, crearRes());

    expect(sesion).toEqual({
      id: 'cuenta-1',
      email: 'maria@ejemplo.com',
      rol: 'duena',
      origen: 'supabase'
    });
    expect(desde).toHaveBeenCalledWith('profiles');
  });

  it('una cuenta sin perfil se trata como clienta', async () => {
    conUsuario();
    conRolEnLaBase(null);

    expect((await leerSesion({ cookies: {} }, crearRes())).rol).toBe('clienta');
  });

  it('un rol que el código no conoce se trata como clienta, nunca como uno mayor', async () => {
    conUsuario();
    conRolEnLaBase('dueno_del_universo');

    expect((await leerSesion({ cookies: {} }, crearRes())).rol).toBe('clienta');
  });

  it('si no se puede leer el perfil, el error sube en vez de dejar pasar', async () => {
    conUsuario();
    desde.mockReturnValue(crearCadena({ data: null, error: new Error('la base no responde') }));

    await expect(leerSesion({ cookies: {} }, crearRes())).rejects.toThrow('la base no responde');
  });

  describe('transición desde la contraseña compartida', () => {
    it('la contraseña del panel sigue abriendo una sesión de dueña', async () => {
      const sesion = await leerSesion({ cookies: cookiesDelPanel() }, crearRes());

      expect(sesion).toEqual({ id: null, email: null, rol: 'duena', origen: 'contrasena' });
    });

    it('sin la clave publicable configurada ni siquiera intenta Supabase', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      const sesion = await leerSesion({ cookies: cookiesDelPanel() }, crearRes());

      expect(createServerClient).not.toHaveBeenCalled();
      expect(sesion.rol).toBe('duena');
    });

    it('una cuenta de Supabase tiene prioridad sobre la contraseña', async () => {
      conUsuario();
      conRolEnLaBase('admin');

      const sesion = await leerSesion({ cookies: cookiesDelPanel() }, crearRes());

      expect(sesion.origen).toBe('supabase');
      expect(sesion.rol).toBe('admin');
    });
  });
});

describe('cookies de la sesión', () => {
  async function opcionesDeCookies(req, res) {
    await leerSesion(req, res);
    return createServerClient.mock.calls[0][2].cookies;
  }

  it('entrega a Supabase las cookies de la petición', async () => {
    const cookies = await opcionesDeCookies({ cookies: { 'sb-token': 'abc' } }, crearRes());

    expect(cookies.getAll()).toEqual([{ name: 'sb-token', value: 'abc' }]);
  });

  it('escribe las cookies renovadas sin pisar las que ya tenía la respuesta', async () => {
    const res = crearRes();
    res.getHeader = (clave) => res.headers[clave];
    res.setHeader('Set-Cookie', ['previa=1; Path=/']);
    const cookies = await opcionesDeCookies({ cookies: {} }, res);

    cookies.setAll(
      [{ name: 'sb-token', value: 'nuevo', options: { path: '/', maxAge: 60, sameSite: 'lax' } }],
      { 'Cache-Control': 'private, no-cache, no-store' }
    );

    expect(res.headers['Set-Cookie']).toEqual([
      'previa=1; Path=/',
      'sb-token=nuevo; Max-Age=60; Path=/; SameSite=Lax'
    ]);
    // Sin esto, un CDN podría servirle la sesión de una clienta a otra.
    expect(res.headers['Cache-Control']).toBe('private, no-cache, no-store');
  });

  it.each([
    ['HttpOnly', { httpOnly: true }, 'HttpOnly'],
    ['Secure', { secure: true }, 'Secure'],
    ['SameSite=Strict desde true', { sameSite: true }, 'SameSite=Strict'],
    ['el dominio', { domain: 'alejandropaz.xyz' }, 'Domain=alejandropaz.xyz'],
    ['la expiración', { expires: new Date(0) }, 'Expires=Thu, 01 Jan 1970 00:00:00 GMT']
  ])('serializa %s', (_descripcion, opciones, esperado) => {
    expect(serializarCookie('c', 'v', opciones)).toContain(esperado);
  });

  it('codifica el valor para que no rompa la cabecera', () => {
    expect(serializarCookie('c', 'a b;c')).toMatch(/^c=a%20b%3Bc; /);
  });
});

describe('conRol', () => {
  it('responde 401 sin sesión y no ejecuta la ruta', async () => {
    const ruta = vi.fn();

    const res = await llamar(conRol(PANEL_TIENDA, ruta), { method: 'GET' });

    expect(res.statusCode).toBe(401);
    expect(ruta).not.toHaveBeenCalled();
  });

  it('responde 403 a un rol que no tiene acceso', async () => {
    conUsuario();
    conRolEnLaBase('clienta');
    const ruta = vi.fn();

    const res = await llamar(conRol(PANEL_TIENDA, ruta), { method: 'GET' });

    expect(res.statusCode).toBe(403);
    expect(ruta).not.toHaveBeenCalled();
  });

  it('la dueña no entra al portal del sistema', async () => {
    conUsuario();
    conRolEnLaBase('duena');

    const res = await llamar(conRol(PORTAL_SISTEMA, vi.fn()), { method: 'GET' });

    expect(res.statusCode).toBe(403);
  });

  it('el super_admin puede leer', async () => {
    conUsuario();
    conRolEnLaBase('super_admin');
    const ruta = vi.fn((req, res) => res.status(200).json({ ok: true }));

    const res = await llamar(conRol(PORTAL_SISTEMA, ruta), { method: 'GET' });

    expect(res.statusCode).toBe(200);
  });

  it.each(['POST', 'PATCH', 'DELETE'])('el super_admin no puede hacer %s', async (method) => {
    conUsuario();
    conRolEnLaBase('super_admin');
    const ruta = vi.fn();

    const res = await llamar(conRol(PANEL_TIENDA, ruta), { method });

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/solo lectura/);
    expect(ruta).not.toHaveBeenCalled();
  });

  it('deja la sesión en la petición para que la ruta sepa quién es', async () => {
    conUsuario();
    conRolEnLaBase('duena');
    let recibida;
    const ruta = vi.fn((req, res) => {
      recibida = req.sesion;
      return res.status(201).json({});
    });

    await llamar(conRol(PANEL_TIENDA, ruta), { method: 'POST' });

    expect(recibida).toMatchObject({ id: 'cuenta-1', rol: 'duena' });
  });
});

describe('protegerPagina', () => {
  const contexto = (resolvedUrl = '/akaristudio/admin') => ({
    req: { cookies: {} },
    res: crearRes(),
    resolvedUrl
  });

  it('sin sesión manda al login, recordando a dónde se quería ir', async () => {
    const resultado = await protegerPagina(PANEL_TIENDA)(contexto('/akaristudio/admin/productos'));

    expect(resultado).toEqual({
      redirect: {
        destination: '/akaristudio/admin/login?volver=%2Fakaristudio%2Fadmin%2Fproductos',
        permanent: false
      }
    });
  });

  it('con un rol sin acceso manda al portal que sí le corresponde', async () => {
    conUsuario();
    conRolEnLaBase('clienta');

    const resultado = await protegerPagina(PORTAL_SISTEMA)(contexto('/akaristudio/sistema'));

    expect(resultado.redirect.destination).toBe('/akaristudio/cuenta');
  });

  it('con acceso le pasa la sesión a la página, marcando el modo lectura', async () => {
    conUsuario();
    conRolEnLaBase('super_admin');

    const resultado = await protegerPagina(PORTAL_SISTEMA)(contexto('/akaristudio/sistema'));

    expect(resultado.props.sesion).toEqual({
      rol: 'super_admin',
      email: 'maria@ejemplo.com',
      origen: 'supabase',
      soloLectura: true
    });
  });
});

describe('a dónde va cada quien', () => {
  it.each([
    ['clienta', '/akaristudio/cuenta'],
    ['duena', '/akaristudio/admin'],
    ['admin', '/akaristudio/sistema'],
    ['super_admin', '/akaristudio/sistema']
  ])('%s va a %s', (rol, destino) => {
    expect(destinoSegunRol(rol)).toBe(destino);
  });

  it('solo el super_admin es de lectura', () => {
    expect(['clienta', 'duena', 'admin', 'super_admin'].filter((rol) => !puedeEscribir(rol))).toEqual([
      'super_admin'
    ]);
  });

  it('acepta volver a una ruta del propio sitio', () => {
    expect(destinoSeguro('/akaristudio/admin/productos', 'duena')).toBe('/akaristudio/admin/productos');
  });

  it.each([
    ['otro dominio', 'https://sitio-falso.com/akaristudio'],
    ['un dominio sin esquema', '//sitio-falso.com'],
    ['una ruta ajena al sitio', '/otra-cosa'],
    ['un esquema peligroso', 'javascript:alert(1)'],
    ['un prefijo parecido', '/akaristudiofalso'],
    ['nada', undefined],
    ['algo que no es texto', 42]
  ])('rechaza %s y manda al portal del rol', (_descripcion, volver) => {
    expect(destinoSeguro(volver, 'duena')).toBe('/akaristudio/admin');
  });
});
