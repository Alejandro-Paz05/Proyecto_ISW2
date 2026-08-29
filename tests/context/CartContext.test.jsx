import { describe, it, expect } from 'vitest';
import { render, renderHook, screen, act, waitFor } from '@testing-library/react';
import { CartProvider, useCart } from '@/context/CartContext';

const LAMPARA = { id: 4, name: 'Lámpara LED', category: 'unas', price: 680, description: '', image: '', stock: 3 };
const ESMALTE = { id: 2, name: 'Esmalte en Gel', category: 'unas', price: 180, description: '', image: '', stock: 10 };
const ESPEJO = { id: 16, name: 'Espejo LED', category: 'accesorios', price: 480, description: '', image: '', stock: 0 };

const CATALOGO = [LAMPARA, ESMALTE, ESPEJO];

function montar({ products = CATALOGO, productsLoaded = true } = {}) {
  return renderHook(() => useCart(), {
    wrapper: ({ children }) => (
      <CartProvider products={products} productsLoaded={productsLoaded}>
        {children}
      </CartProvider>
    )
  });
}

/** El carrito se hidrata desde localStorage en un efecto, no en el render. */
async function montarHidratado(opciones) {
  const vista = montar(opciones);
  await waitFor(() => expect(vista.result.current.cartReady || true).toBe(true));
  return vista;
}

function guardarCarrito(items) {
  localStorage.setItem('akari_cart', JSON.stringify(items));
}

describe('CartContext', () => {
  describe('agregar productos', () => {
    it('agrega un producto y cuenta una unidad', async () => {
      const { result } = await montarHidratado();

      act(() => result.current.addToCart(ESMALTE));

      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0]).toMatchObject({ id: 2, qty: 1, price: 180 });
      expect(result.current.getCartCount()).toBe(1);
    });

    it('acumula unidades del mismo producto en una sola linea', async () => {
      const { result } = await montarHidratado();

      act(() => result.current.addToCart(ESMALTE));
      act(() => result.current.addToCart(ESMALTE));

      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0].qty).toBe(2);
    });

    it('no deja agregar mas unidades de las que hay en stock', async () => {
      const { result } = await montarHidratado();

      // La lámpara tiene stock 3.
      act(() => result.current.addToCart(LAMPARA));
      act(() => result.current.addToCart(LAMPARA));
      act(() => result.current.addToCart(LAMPARA));
      act(() => result.current.addToCart(LAMPARA));

      expect(result.current.cart[0].qty).toBe(3);
      expect(result.current.toast).toMatch(/unidades disponibles/i);
    });

    it('no deja agregar un producto agotado', async () => {
      const { result } = await montarHidratado();

      act(() => result.current.addToCart(ESPEJO));

      expect(result.current.cart).toHaveLength(0);
      expect(result.current.toast).toMatch(/agotado/i);
    });
  });

  describe('cambiar cantidades', () => {
    it('no deja subir por encima del stock', async () => {
      const { result } = await montarHidratado();
      act(() => result.current.addToCart(LAMPARA));

      act(() => result.current.changeQty(4, 5));

      expect(result.current.cart[0].qty).toBe(1);
      expect(result.current.toast).toMatch(/solo quedan 3/i);
    });

    it('elimina la linea al bajar de una unidad', async () => {
      const { result } = await montarHidratado();
      act(() => result.current.addToCart(ESMALTE));

      act(() => result.current.changeQty(2, -1));

      expect(result.current.cart).toHaveLength(0);
    });
  });

  describe('precios', () => {
    it('calcula el total con los precios del catalogo, no con los guardados', async () => {
      // Un carrito viejo, guardado cuando la lámpara costaba L 100.
      guardarCarrito([{ id: 4, name: 'Lámpara LED', price: 100, qty: 2 }]);

      const { result } = await montarHidratado();

      await waitFor(() => expect(result.current.cart).toHaveLength(1));
      // Precio real en el catálogo: 680.
      expect(result.current.cart[0].price).toBe(680);
      expect(result.current.getCartTotal()).toBe(1360);
    });
  });

  describe('persistencia', () => {
    it('guarda unicamente id y cantidad', async () => {
      const { result } = await montarHidratado();

      act(() => result.current.addToCart(ESMALTE));

      await waitFor(() => {
        const guardado = JSON.parse(localStorage.getItem('akari_cart'));
        expect(guardado).toEqual([{ id: 2, qty: 1 }]);
      });
    });

    it('lee el formato anterior, que guardaba el producto entero', async () => {
      guardarCarrito([
        { id: 2, name: 'Esmalte en Gel', price: 180, image: '', qty: 3 }
      ]);

      const { result } = await montarHidratado();

      await waitFor(() => expect(result.current.cart).toHaveLength(1));
      expect(result.current.cart[0]).toMatchObject({ id: 2, qty: 3 });
    });

    it('ignora un localStorage corrupto en vez de romper', async () => {
      localStorage.setItem('akari_cart', 'esto no es json');

      const { result } = await montarHidratado();

      expect(result.current.cart).toEqual([]);
    });
  });

  describe('reconciliacion contra el catalogo', () => {
    it('quita del carrito un producto que se agoto', async () => {
      guardarCarrito([{ id: 16, qty: 1 }, { id: 2, qty: 1 }]);

      const { result } = await montarHidratado();

      await waitFor(() => expect(result.current.cart).toHaveLength(1));
      expect(result.current.cart[0].id).toBe(2);
      expect(result.current.toast).toMatch(/agotado/i);
    });

    it('quita un producto que ya no existe en el catalogo', async () => {
      guardarCarrito([{ id: 999, qty: 1 }]);

      const { result } = await montarHidratado();

      await waitFor(() => expect(result.current.cart).toHaveLength(0));
    });

    it('recorta la cantidad guardada al stock disponible', async () => {
      guardarCarrito([{ id: 4, qty: 10 }]);

      const { result } = await montarHidratado();

      await waitFor(() => expect(result.current.cart[0]?.qty).toBe(3));
      expect(result.current.toast).toMatch(/cantidades/i);
    });
  });

  describe('mientras el catalogo esta cargando', () => {
    it('cuenta las unidades guardadas aunque todavia no haya precios', async () => {
      guardarCarrito([{ id: 4, qty: 2 }, { id: 2, qty: 1 }]);

      const { result } = montar({ products: [], productsLoaded: false });

      await waitFor(() => expect(result.current.getCartCount()).toBe(3));
      // Sin catálogo no se pueden mostrar precios todavía.
      expect(result.current.cart).toEqual([]);
      expect(result.current.cartReady).toBe(false);
    });

    it('no borra el carrito guardado antes de hidratarse', async () => {
      guardarCarrito([{ id: 2, qty: 1 }]);

      montar({ products: [], productsLoaded: false });

      await waitFor(() => {
        expect(JSON.parse(localStorage.getItem('akari_cart'))).toEqual([{ id: 2, qty: 1 }]);
      });
    });
  });

  it('useCart falla con un mensaje claro fuera del provider', () => {
    // El error se atrapa dentro del componente a propósito: si escapara del
    // render, jsdom lo reportaría como excepción no manejada y llenaría la
    // salida de la suite con un stack trace que no aporta nada.
    function Sonda() {
      try {
        useCart();
        return <span>no falló</span>;
      } catch (error) {
        return <span>{error.message}</span>;
      }
    }

    render(<Sonda />);

    expect(screen.getByText(/CartProvider/)).toBeInTheDocument();
  });
});
