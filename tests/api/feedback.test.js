import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';

const { insertar, reportarError, getUser } = vi.hoisted(() => ({
  insertar: vi.fn(),
  reportarError: vi.fn(),
  getUser: vi.fn()
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert: insertar }) })
}));
vi.mock('@/lib/errores', () => ({ reportarError }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser } })
}));

import feedback from '@/pages/api/feedback';
import { reiniciarLimites } from '@/lib/limite';

const MENSAJE = {
  tipo: 'sugerencia',
  mensaje: 'Estaría bueno poder pagar con Tigo Money.',
  pagina: '/akaristudio/productos'
};

function enviar(body) {
  return llamar(feedback, { method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.7' } });
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    reiniciarLimites();
    insertar.mockReset();
    insertar.mockResolvedValue({ error: null });
    reportarError.mockReset();
    getUser.mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  it('rechaza cualquier método que no sea POST', async () => {
    const res = await llamar(feedback, { method: 'GET' });

    expect(res.statusCode).toBe(405);
  });

  it('guarda el mensaje de una invitada, limpio', async () => {
    const res = await enviar({
      ...MENSAJE,
      mensaje: '   Estaría bueno poder pagar con Tigo Money.   ',
      pagina: '/akaristudio/productos?categoria=unas#arriba'
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(insertar).toHaveBeenCalledWith({
      user_id: null,
      kind: 'sugerencia',
      message: 'Estaría bueno poder pagar con Tigo Money.',
      contact_email: null,
      page: '/akaristudio/productos'
    });
  });

  it('con sesión iniciada, lo asocia a la cuenta', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
    getUser.mockResolvedValue({ data: { user: { id: 'cuenta-1' } }, error: null });

    await enviar(MENSAJE);

    expect(insertar.mock.calls[0][0].user_id).toBe('cuenta-1');
  });

  it('si la sesión no se puede leer, lo guarda igual como de invitada', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
    getUser.mockRejectedValue(new Error('fetch failed'));

    const res = await enviar(MENSAJE);

    expect(res.statusCode).toBe(201);
    expect(insertar.mock.calls[0][0].user_id).toBeNull();
  });

  it('normaliza el correo de contacto', async () => {
    await enviar({ ...MENSAJE, correo: '  Maria@Ejemplo.COM ' });

    expect(insertar.mock.calls[0][0].contact_email).toBe('maria@ejemplo.com');
  });

  it('no guarda como página una dirección de otro sitio', async () => {
    await enviar({ ...MENSAJE, pagina: 'https://sitio-falso.com/akaristudio' });

    expect(insertar.mock.calls[0][0].page).toBeNull();
  });

  it.each([
    ['un tipo inventado', { ...MENSAJE, tipo: 'queja-formal' }],
    ['un mensaje demasiado corto', { ...MENSAJE, mensaje: 'ok' }],
    ['un mensaje demasiado largo', { ...MENSAJE, mensaje: 'x'.repeat(2001) }],
    ['un correo inválido', { ...MENSAJE, correo: 'no-es-un-correo' }],
    ['un cuerpo vacío', undefined]
  ])('rechaza %s con 400 sin tocar la base', async (_descripcion, body) => {
    const res = await enviar(body);

    expect(res.statusCode).toBe(400);
    expect(insertar).not.toHaveBeenCalled();
  });

  it('si un bot llena la trampa, responde como si nada y no guarda', async () => {
    const res = await enviar({ ...MENSAJE, sitio_web: 'https://spam.example' });

    expect(res.statusCode).toBe(201);
    expect(insertar).not.toHaveBeenCalled();
  });

  it('corta con 429 después de cinco mensajes', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await enviar(MENSAJE)).statusCode).toBe(201);
    }

    expect((await enviar(MENSAJE)).statusCode).toBe(429);
  });

  it('si la base falla, reporta el error y responde 500 sin detalles', async () => {
    const fallo = { message: 'relation "feedback" does not exist' };
    insertar.mockResolvedValue({ error: fallo });

    const res = await enviar(MENSAJE);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/relation/);
    expect(reportarError).toHaveBeenCalledWith(fallo, { ruta: '/api/feedback', metodo: 'POST' });
  });
});
