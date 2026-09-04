import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRevelar } from '@/lib/use-revelar';

/**
 * jsdom no trae IntersectionObserver. Este doble guarda los elementos
 * observados y expone `disparar` para simular que entraron en pantalla.
 */
function instalarObservador() {
  const instancias = [];

  class ObservadorFalso {
    constructor(callback, opciones) {
      this.callback = callback;
      this.opciones = opciones;
      this.observados = [];
      this.desconectado = false;
      instancias.push(this);
    }

    observe(elemento) {
      this.observados.push(elemento);
    }

    unobserve(elemento) {
      this.observados = this.observados.filter((e) => e !== elemento);
    }

    disconnect() {
      this.desconectado = true;
    }

    // Simula que los elementos indicados asomaron en pantalla.
    disparar(elementos, isIntersecting = true) {
      this.callback(
        elementos.map((target) => ({ target, isIntersecting })),
        this
      );
    }
  }

  vi.stubGlobal('IntersectionObserver', ObservadorFalso);
  return instancias;
}

function pintar(cantidad, atributo = '') {
  document.body.innerHTML = Array.from(
    { length: cantidad },
    (_, i) => `<div id="e${i}" data-revelar="${atributo}"></div>`
  ).join('');
  return Array.from(document.querySelectorAll('[data-revelar]'));
}

function conMovimientoReducido(reducido) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((consulta) => ({ matches: reducido, media: consulta }))
  );
}

describe('useRevelar', () => {
  beforeEach(() => {
    conMovimientoReducido(false);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('observa los elementos marcados', () => {
    const instancias = instalarObservador();
    const elementos = pintar(3);

    renderHook(() => useRevelar('x'));

    expect(instancias).toHaveLength(1);
    expect(instancias[0].observados).toEqual(elementos);
  });

  it('los revela cuando asoman en pantalla', () => {
    const instancias = instalarObservador();
    const elementos = pintar(2);

    renderHook(() => useRevelar('x'));
    instancias[0].disparar([elementos[0]]);

    expect(elementos[0].classList.contains('revelado')).toBe(true);
    expect(elementos[1].classList.contains('revelado')).toBe(false);
  });

  // Reanimar un elemento cada vez que se sube y se baja marea.
  it('deja de observar lo que ya revelo', () => {
    const instancias = instalarObservador();
    const elementos = pintar(2);

    renderHook(() => useRevelar('x'));
    instancias[0].disparar([elementos[0]]);

    expect(instancias[0].observados).toEqual([elementos[1]]);
  });

  it('no revela nada mientras el elemento no asome', () => {
    const instancias = instalarObservador();
    const elementos = pintar(1);

    renderHook(() => useRevelar('x'));
    instancias[0].disparar(elementos, false);

    expect(elementos[0].classList.contains('revelado')).toBe(false);
  });

  it('se desconecta al desmontar, para no dejar el observador vivo', () => {
    const instancias = instalarObservador();
    pintar(1);

    const { unmount } = renderHook(() => useRevelar('x'));
    unmount();

    expect(instancias[0].desconectado).toBe(true);
  });

  it('vuelve a escanear cuando cambia la clave', () => {
    const instancias = instalarObservador();
    pintar(1);

    const { rerender } = renderHook(({ clave }) => useRevelar(clave), {
      initialProps: { clave: 'unas:1' }
    });

    pintar(4);
    rerender({ clave: 'todos:4' });

    expect(instancias).toHaveLength(2);
    expect(instancias[1].observados).toHaveLength(4);
  });

  it('no crea un observador si no hay nada marcado', () => {
    const instancias = instalarObservador();
    document.body.innerHTML = '<div>sin marcar</div>';

    renderHook(() => useRevelar('x'));

    expect(instancias).toHaveLength(0);
  });

  it('ignora lo que ya esta revelado', () => {
    const instancias = instalarObservador();
    const elementos = pintar(2);
    elementos[0].classList.add('revelado');

    renderHook(() => useRevelar('x'));

    expect(instancias[0].observados).toEqual([elementos[1]]);
  });

  // La animacion es un adorno; el contenido no. Si algo impide animar, se
  // muestra todo de una vez en vez de arriesgar que quede invisible.
  describe('cuando no se puede animar', () => {
    it('muestra todo si el sistema pide menos movimiento', () => {
      const instancias = instalarObservador();
      conMovimientoReducido(true);
      const elementos = pintar(3);

      renderHook(() => useRevelar('x'));

      expect(elementos.every((e) => e.classList.contains('revelado'))).toBe(true);
      expect(instancias).toHaveLength(0);
    });

    it('muestra todo si el navegador no trae IntersectionObserver', () => {
      vi.stubGlobal('IntersectionObserver', undefined);
      const elementos = pintar(3);

      renderHook(() => useRevelar('x'));

      expect(elementos.every((e) => e.classList.contains('revelado'))).toBe(true);
    });

    it('no falla si el navegador no trae matchMedia', () => {
      instalarObservador();
      vi.stubGlobal('matchMedia', undefined);
      const elementos = pintar(1);

      expect(() => renderHook(() => useRevelar('x'))).not.toThrow();
      expect(elementos[0].classList.contains('revelado')).toBe(false);
    });
  });
});
