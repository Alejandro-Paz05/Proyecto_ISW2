import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { supabaseNavegador, getSession, onAuthStateChange, unsubscribe } = vi.hoisted(() => ({
  supabaseNavegador: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn()
}));

vi.mock('@/lib/supabase-navegador', () => ({ supabaseNavegador }));

import { useSesionAbierta } from '@/lib/use-sesion';

/** El cliente del navegador, con o sin sesión guardada. */
function conCliente({ sesion = null } = {}) {
  getSession.mockResolvedValue({ data: { session: sesion } });
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
  supabaseNavegador.mockReturnValue({ auth: { getSession, onAuthStateChange } });
}

beforeEach(() => {
  supabaseNavegador.mockReset();
  getSession.mockReset();
  onAuthStateChange.mockReset();
  unsubscribe.mockReset();
});

describe('useSesionAbierta', () => {
  it('sin cuentas configuradas dice que no hay sesión, sin romper nada', () => {
    supabaseNavegador.mockReturnValue(null);

    const { result } = renderHook(() => useSesionAbierta());

    expect(result.current).toBe(false);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('arranca en false y pasa a true cuando encuentra la sesión', async () => {
    conCliente({ sesion: { access_token: 'un-token' } });

    const { result } = renderHook(() => useSesionAbierta());

    // El primer render ocurre antes de leer la cookie: sin esto, el servidor
    // y el navegador pintarían cosas distintas.
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('se queda en false si no hay sesión guardada', async () => {
    conCliente();

    const { result } = renderHook(() => useSesionAbierta());

    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  // Entrar o salir en otra pestaña tiene que cambiar el enlace de la barra.
  it('reacciona a un cambio de sesión en otra pestaña', async () => {
    conCliente();
    const { result } = renderHook(() => useSesionAbierta());
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());

    const [alCambiar] = onAuthStateChange.mock.calls[0];
    alCambiar('SIGNED_IN', { access_token: 'un-token' });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('deja de escuchar al desmontarse', async () => {
    conCliente();
    const { unmount } = renderHook(() => useSesionAbierta());
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
