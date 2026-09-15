import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';
import { crearCadena } from '../helpers/supabase';

const { getUser, exchangeCodeForSession, desde } = vi.hoisted(() => ({
  getUser: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  desde: vi.fn()
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser, exchangeCodeForSession } })
}));

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: desde }) }));

import continuar from '@/pages/api/auth/continuar';

const CUENTA = { id: 'cuenta-1', email: 'maria@ejemplo.com' };

function conRol(rol) {
  desde.mockReturnValue(crearCadena({ data: { role: rol }, error: null }));
}

function volviendoDeGoogle(resultado) {
  exchangeCodeForSession.mockResolvedValue(resultado);
}

describe('GET /api/auth/continuar', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth session missing!' } });
    exchangeCodeForSession.mockReset();
    desde.mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  it('rechaza cualquier método que no sea GET', async () => {
    const res = await llamar(continuar, { method: 'POST' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  describe('volviendo de Google', () => {
    it('canjea el código y manda al portal del rol', async () => {
      volviendoDeGoogle({ data: { user: CUENTA }, error: null });
      conRol('admin');

      const res = await llamar(continuar, { query: { code: 'codigo-de-google' } });

      expect(exchangeCodeForSession).toHaveBeenCalledWith('codigo-de-google');
      expect(res.statusCode).toBe(302);
      expect(res.headers.Location).toBe('/akaristudio/sistema');
    });

    it('vuelve a la página que se quería ver, si es del sitio', async () => {
      volviendoDeGoogle({ data: { user: CUENTA }, error: null });
      conRol('duena');

      const res = await llamar(continuar, {
        query: { code: 'codigo', volver: '/akaristudio/admin/productos' }
      });

      expect(res.headers.Location).toBe('/akaristudio/admin/productos');
    });

    it('ignora un ?volver= que apunta a otro sitio', async () => {
      volviendoDeGoogle({ data: { user: CUENTA }, error: null });
      conRol('clienta');

      const res = await llamar(continuar, {
        query: { code: 'codigo', volver: 'https://sitio-falso.com/akaristudio' }
      });

      expect(res.headers.Location).toBe('/akaristudio/cuenta');
    });

    it('si el canje falla, vuelve al login con el motivo y sin perder ?volver=', async () => {
      volviendoDeGoogle({ data: { user: null }, error: { message: 'invalid flow state' } });

      const res = await llamar(continuar, { query: { code: 'vencido', volver: '/akaristudio/admin' } });

      expect(res.headers.Location).toBe(
        '/akaristudio/admin/login?error=google&volver=%2Fakaristudio%2Fadmin'
      );
      expect(desde).not.toHaveBeenCalled();
    });

    it('sin las variables públicas no intenta canjear nada', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      const res = await llamar(continuar, { query: { code: 'codigo' } });

      expect(exchangeCodeForSession).not.toHaveBeenCalled();
      expect(res.headers.Location).toBe('/akaristudio/admin/login?error=cuentas_no_disponibles');
    });
  });

  describe('después de ingresar con correo', () => {
    it('usa la sesión que ya trae la petición', async () => {
      getUser.mockResolvedValue({ data: { user: CUENTA }, error: null });
      conRol('duena');

      const res = await llamar(continuar, { query: {} });

      expect(exchangeCodeForSession).not.toHaveBeenCalled();
      expect(res.headers.Location).toBe('/akaristudio/admin');
    });

    it('sin sesión, al login', async () => {
      const res = await llamar(continuar, { query: {} });

      expect(res.headers.Location).toBe('/akaristudio/admin/login?error=sin_sesion');
    });
  });

  it('la respuesta no se puede guardar en caché: lleva cookies de sesión', async () => {
    volviendoDeGoogle({ data: { user: CUENTA }, error: null });
    conRol('clienta');

    const res = await llamar(continuar, { query: { code: 'codigo' } });

    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
});
