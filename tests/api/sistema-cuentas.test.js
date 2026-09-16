import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';
import { crearCadena } from '../helpers/supabase';

const { from, listUsers, getUser, reportarError, estado } = vi.hoisted(() => ({
  from: vi.fn(),
  listUsers: vi.fn(),
  getUser: vi.fn(),
  reportarError: vi.fn(),
  estado: { respuesta: null, cadena: null, consultasAPerfiles: 0 }
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from, auth: { admin: { listUsers } } })
}));
vi.mock('@/lib/errores', () => ({ reportarError }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import listar from '@/pages/api/sistema/cuentas/index';
import cambiarRol from '@/pages/api/sistema/cuentas/[id]';

// Quien hace las peticiones en estas pruebas.
const YO = '11111111-1111-4111-8111-111111111111';
const OTRA = '22222222-2222-4222-8222-222222222222';

const PERFIL = {
  id: OTRA,
  full_name: 'Sofía Reyes',
  role: 'clienta',
  created_at: '2026-09-14T18:00:00Z'
};

function responder(respuesta) {
  estado.respuesta = respuesta;
}

/**
 * Una petición con sesión de ese rol.
 *
 * profiles se consulta dos veces: primero para saber el rol de quien pide
 * —eso lo hace conRol— y después para lo que hace la ruta. El contador
 * distingue una de otra.
 */
function conCuenta(rol) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
  getUser.mockResolvedValue({ data: { user: { id: YO, email: 'admin@ejemplo.com' } }, error: null });

  estado.consultasAPerfiles = 0;
  from.mockImplementation((tabla) => {
    if (tabla === 'profiles' && estado.consultasAPerfiles++ === 0) {
      return crearCadena({ data: { role: rol }, error: null });
    }
    estado.cadena = crearCadena(estado.respuesta);
    return estado.cadena;
  });
}

describe('cuentas del portal del sistema', () => {
  beforeEach(() => {
    from.mockReset();
    getUser.mockReset();
    listUsers.mockReset();
    reportarError.mockReset();
    // Se limpia entre pruebas: si quedara la de la anterior, comprobar que
    // una ruta no tocó la tabla daría un falso negativo.
    estado.cadena = null;
    responder({ data: [PERFIL], error: null });
    listUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: OTRA,
            email: 'sofia@ejemplo.com',
            last_sign_in_at: '2026-09-14T19:00:00Z',
            app_metadata: { providers: ['google'] }
          }
        ]
      },
      error: null
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    vi.restoreAllMocks();
  });

  describe('GET /api/sistema/cuentas', () => {
    it('exige sesión', async () => {
      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(401);
    });

    it('la dueña no ve las cuentas', async () => {
      conCuenta('duena');

      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(403);
    });

    it('junta el rol con el correo y con cómo entra cada cuenta', async () => {
      conCuenta('admin');

      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([
        {
          ...PERFIL,
          email: 'sofia@ejemplo.com',
          ultimo_ingreso: '2026-09-14T19:00:00Z',
          proveedores: ['google']
        }
      ]);
    });

    it('un perfil sin cuenta en Auth no rompe la lista', async () => {
      conCuenta('admin');
      listUsers.mockResolvedValue({ data: { users: [] }, error: null });

      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(200);
      expect(res.body[0]).toMatchObject({ email: null, ultimo_ingreso: null, proveedores: [] });
    });

    it('si Auth no responde, devuelve 500 y abre un ticket del fallo', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      conCuenta('admin');
      listUsers.mockResolvedValue({ data: null, error: { message: 'service unavailable' } });

      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(500);
      expect(reportarError).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/sistema/cuentas/[id]', () => {
    const PATCH = { method: 'PATCH', query: { id: OTRA }, cookies: {} };

    beforeEach(() => {
      responder({ data: { id: OTRA, full_name: 'Sofía Reyes', role: 'duena' }, error: null });
    });

    it('le cambia el rol a otra cuenta', async () => {
      conCuenta('admin');

      const res = await llamar(cambiarRol, { ...PATCH, body: { role: 'duena' } });

      expect(res.statusCode).toBe(200);
      expect(estado.cadena.update).toHaveBeenCalledWith({ role: 'duena' });
    });

    // Si el único admin se bajara por error, no quedaría nadie que pueda
    // devolver los roles.
    it('no deja que alguien se cambie el rol a sí mismo', async () => {
      conCuenta('admin');

      const res = await llamar(cambiarRol, {
        ...PATCH,
        query: { id: YO },
        body: { role: 'clienta' }
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/vos mismo/i);
      expect(estado.cadena).toBeNull();
    });

    it('el super_admin mira y no toca', async () => {
      conCuenta('super_admin');

      const res = await llamar(cambiarRol, { ...PATCH, body: { role: 'admin' } });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/solo lectura/);
    });

    it.each([
      ['un rol inventado', { role: 'emperatriz' }],
      ['un cuerpo vacío', {}]
    ])('rechaza %s con 400', async (_descripcion, body) => {
      conCuenta('admin');

      const res = await llamar(cambiarRol, { ...PATCH, body });

      expect(res.statusCode).toBe(400);
    });

    it('rechaza un id que no es una cuenta', async () => {
      conCuenta('admin');

      const res = await llamar(cambiarRol, { ...PATCH, query: { id: '7' }, body: { role: 'duena' } });

      expect(res.statusCode).toBe(400);
    });

    it('responde 404 si la cuenta no existe', async () => {
      conCuenta('admin');
      responder({ data: null, error: null });

      const res = await llamar(cambiarRol, { ...PATCH, body: { role: 'duena' } });

      expect(res.statusCode).toBe(404);
    });
  });
});
