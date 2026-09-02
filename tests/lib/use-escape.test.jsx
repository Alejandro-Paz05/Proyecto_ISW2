import { describe, it, expect, vi } from 'vitest';
import { renderHook, fireEvent } from '@testing-library/react';
import { useCerrarConEscape } from '@/lib/use-escape';

function presionar(key) {
  fireEvent.keyDown(document, { key });
}

describe('useCerrarConEscape', () => {
  it('cierra al presionar Escape mientras está abierto', () => {
    const cerrar = vi.fn();
    renderHook(() => useCerrarConEscape(true, cerrar));

    presionar('Escape');

    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('no hace nada si el diálogo está cerrado', () => {
    const cerrar = vi.fn();
    renderHook(() => useCerrarConEscape(false, cerrar));

    presionar('Escape');

    expect(cerrar).not.toHaveBeenCalled();
  });

  it.each(['Enter', 'a', 'Tab', 'ArrowDown', ' '])('ignora la tecla %s', (key) => {
    const cerrar = vi.fn();
    renderHook(() => useCerrarConEscape(true, cerrar));

    presionar(key);

    expect(cerrar).not.toHaveBeenCalled();
  });

  // Sin esto, cada Escape del sitio recorrería manejadores de diálogos que
  // ya no se están mostrando.
  it('quita el listener al desmontarse', () => {
    const cerrar = vi.fn();
    const { unmount } = renderHook(() => useCerrarConEscape(true, cerrar));

    unmount();
    presionar('Escape');

    expect(cerrar).not.toHaveBeenCalled();
  });

  it('quita el listener al cerrarse el diálogo', () => {
    const cerrar = vi.fn();
    const { rerender } = renderHook(({ abierto }) => useCerrarConEscape(abierto, cerrar), {
      initialProps: { abierto: true }
    });

    rerender({ abierto: false });
    presionar('Escape');

    expect(cerrar).not.toHaveBeenCalled();
  });
});
