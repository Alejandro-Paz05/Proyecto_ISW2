import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { CatalogoProvider, useCatalogo } from '@/context/CatalogoContext';
import { CATEGORIAS } from '@/lib/categorias';

const PRODUCTOS = [
  { id: 1, name: 'Esmalte en Gel', category: 'unas', price: 180, stock: 10 },
  { id: 2, name: 'Lima', category: 'accesorios', price: 40, stock: 3 }
];

const CATEGORIAS_API = [
  { key: 'unas', label: 'Uñas' },
  { key: 'accesorios', label: 'Accesorios' },
  { key: 'tratamientos', label: 'Tratamientos' }
];

/**
 * Responde a cada URL con lo que se le indique. Un valor puede ser una
 * respuesta ya armada o un error a lanzar, que es como se simula estar sin
 * conexión.
 */
function simularFetch({ productos, categorias }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const respuesta = url.includes('/api/categories') ? categorias : productos;
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    })
  );
}

const ok = (datos) => ({ ok: true, json: async () => datos });
const falla = (status) => ({ ok: false, status, json: async () => ({ error: 'x' }) });

function montar() {
  return renderHook(() => useCatalogo(), { wrapper: CatalogoProvider });
}

describe('CatalogoContext', () => {
  beforeEach(() => {
    simularFetch({ productos: ok(PRODUCTOS), categorias: ok(CATEGORIAS_API) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('carga el catalogo una sola vez', async () => {
    const { result } = montar();

    await waitFor(() => expect(result.current.cargando).toBe(false));

    expect(result.current.productos).toEqual(PRODUCTOS);
    expect(result.current.error).toBeNull();
    expect(result.current.listo).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('usa las categorias que vienen de la base', async () => {
    const { result } = montar();

    await waitFor(() => expect(result.current.categorias).toEqual(CATEGORIAS_API));
    expect(result.current.etiquetas.tratamientos).toBe('Tratamientos');
  });

  it('expone las etiquetas como mapa de clave a nombre visible', async () => {
    const { result } = montar();

    await waitFor(() => expect(result.current.cargando).toBe(false));

    expect(result.current.etiquetas.unas).toBe('Uñas');
  });

  // La tienda es una PWA: sin conexion los filtros tienen que dibujarse
  // igual, no quedar vacios.
  describe('cuando las categorias no se pueden cargar', () => {
    it('usa el espejo de lib/categorias si la API responde con error', async () => {
      simularFetch({ productos: ok(PRODUCTOS), categorias: falla(500) });

      const { result } = montar();

      await waitFor(() => expect(result.current.cargando).toBe(false));

      expect(result.current.categorias).toEqual(CATEGORIAS);
      expect(result.current.productos).toEqual(PRODUCTOS);
    });

    it('usa el espejo si la peticion ni siquiera sale', async () => {
      simularFetch({ productos: ok(PRODUCTOS), categorias: new Error('Failed to fetch') });

      const { result } = montar();

      await waitFor(() => expect(result.current.cargando).toBe(false));

      expect(result.current.categorias).toEqual(CATEGORIAS);
    });

    it('usa el espejo si la tabla viene vacia', async () => {
      simularFetch({ productos: ok(PRODUCTOS), categorias: ok([]) });

      const { result } = montar();

      await waitFor(() => expect(result.current.cargando).toBe(false));

      expect(result.current.categorias).toEqual(CATEGORIAS);
    });

    // Un fallo en las categorias no es un fallo de la tienda.
    it('no marca error en el catalogo', async () => {
      simularFetch({ productos: ok(PRODUCTOS), categorias: falla(500) });

      const { result } = montar();

      await waitFor(() => expect(result.current.cargando).toBe(false));

      expect(result.current.error).toBeNull();
      expect(result.current.listo).toBe(true);
    });
  });

  describe('cuando los productos no se pueden cargar', () => {
    it('expone el error y deja el catalogo vacio', async () => {
      simularFetch({ productos: falla(500), categorias: ok(CATEGORIAS_API) });

      const { result } = montar();

      await waitFor(() => expect(result.current.cargando).toBe(false));

      expect(result.current.error).toBe('Error al cargar productos');
      expect(result.current.productos).toEqual([]);
      expect(result.current.listo).toBe(false);
    });

    it('igual aplica las categorias que si llegaron', async () => {
      simularFetch({ productos: falla(500), categorias: ok(CATEGORIAS_API) });

      const { result } = montar();

      await waitFor(() => expect(result.current.categorias).toEqual(CATEGORIAS_API));
    });
  });

  it('avisa si se usa fuera del proveedor', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useCatalogo())).toThrow(/CatalogoProvider/);
  });
});
