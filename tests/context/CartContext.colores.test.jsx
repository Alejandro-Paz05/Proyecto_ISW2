import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { CartProvider, useCart, claveDeLinea } from '@/context/CartContext';

/**
 * El carrito cuando un producto se vende en varios colores.
 *
 * Lo que se prueba es que la identidad de una línea dejó de ser el producto:
 * "Balines plateado" y "Balines dorado" son dos filas con existencias
 * distintas, y equivocarse ahí significa venderle a la clienta un color que no
 * hay. Va en su propio archivo para no tocar el conteo de casos de
 * CartContext.test.jsx, que está declarado en el Capstone.
 */

const PLATEADO = { id: 11, nombre: 'Plateado', hex: '#c0c0c0', stock: 2 };
const DORADO = { id: 12, nombre: 'Dorado', hex: '#d4af37', stock: 5 };
const AGOTADO = { id: 13, nombre: 'Tornasol', hex: null, stock: 0 };

const BALINES = {
  id: 30,
  name: 'Balines',
  category: 'unas',
  price: 120,
  description: '',
  image: '',
  // products.stock es la suma de los colores, como la mantiene la base.
  stock: 7,
  colores: [PLATEADO, DORADO, AGOTADO]
};

const ESMALTE = {
  id: 2,
  name: 'Esmalte en Gel',
  category: 'unas',
  price: 180,
  description: '',
  image: '',
  stock: 10
};

const CATALOGO = [BALINES, ESMALTE];

async function montar({ products = CATALOGO, guardado = null } = {}) {
  if (guardado) localStorage.setItem('akari_cart', JSON.stringify(guardado));

  const vista = renderHook(() => useCart(), {
    wrapper: ({ children }) => (
      <CartProvider products={products} productsLoaded>
        {children}
      </CartProvider>
    )
  });

  await waitFor(() => expect(vista.result.current.cartReady).toBe(true));
  return vista;
}

describe('el carrito con colores', () => {
  describe('agregar', () => {
    it('dos colores del mismo producto son dos líneas', async () => {
      const { result } = await montar();

      act(() => result.current.addToCart(BALINES, PLATEADO));
      act(() => result.current.addToCart(BALINES, DORADO));

      expect(result.current.cart).toHaveLength(2);
      expect(result.current.cart.map((l) => l.color.nombre)).toEqual(['Plateado', 'Dorado']);
      expect(result.current.getCartCount()).toBe(2);
    });

    it('el mismo color dos veces suma en una sola línea', async () => {
      const { result } = await montar();

      act(() => result.current.addToCart(BALINES, PLATEADO));
      act(() => result.current.addToCart(BALINES, PLATEADO));

      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0].qty).toBe(2);
    });

    // El producto tiene 7 en total, pero del plateado hay 2.
    it('el límite es el del color, no el del producto', async () => {
      const { result } = await montar();

      act(() => result.current.addToCart(BALINES, PLATEADO));
      act(() => result.current.addToCart(BALINES, PLATEADO));
      act(() => result.current.addToCart(BALINES, PLATEADO));

      expect(result.current.cart[0].qty).toBe(2);
      expect(result.current.toast).toMatch(/ya tienes las 2 unidades/i);
      expect(result.current.toast).toMatch(/plateado/i);
    });

    it('no deja agregar un color agotado', async () => {
      const { result } = await montar();

      act(() => result.current.addToCart(BALINES, AGOTADO));

      expect(result.current.cart).toHaveLength(0);
      expect(result.current.toast).toMatch(/agotado/i);
    });

    it('un producto con colores no se agrega sin elegir uno', async () => {
      const { result } = await montar();

      act(() => result.current.addToCart(BALINES));

      expect(result.current.cart).toHaveLength(0);
      expect(result.current.toast).toMatch(/elegí un color/i);
    });

    it('un producto sin colores se agrega como siempre', async () => {
      const { result } = await montar();

      act(() => result.current.addToCart(ESMALTE));

      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0].color).toBeNull();
    });
  });

  describe('cambiar y quitar', () => {
    it('cambiar la cantidad de un color no toca la del otro', async () => {
      const { result } = await montar();
      act(() => result.current.addToCart(BALINES, PLATEADO));
      act(() => result.current.addToCart(BALINES, DORADO));

      act(() => result.current.changeQty(claveDeLinea(30, 12), 2));

      const porColor = Object.fromEntries(
        result.current.cart.map((l) => [l.color.nombre, l.qty])
      );
      expect(porColor).toEqual({ Plateado: 1, Dorado: 3 });
    });

    it('quitar un color deja el otro en el carrito', async () => {
      const { result } = await montar();
      act(() => result.current.addToCart(BALINES, PLATEADO));
      act(() => result.current.addToCart(BALINES, DORADO));

      act(() => result.current.removeFromCart(claveDeLinea(30, 11)));

      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0].color.nombre).toBe('Dorado');
    });

    it('no deja subir por encima de lo que hay de ese color', async () => {
      const { result } = await montar();
      act(() => result.current.addToCart(BALINES, PLATEADO));

      act(() => result.current.changeQty(claveDeLinea(30, 11), 5));

      expect(result.current.cart[0].qty).toBe(1);
      expect(result.current.toast).toMatch(/solo quedan 2/i);
    });
  });

  describe('lo que se guarda y se recupera', () => {
    it('el color viaja a localStorage con la línea', async () => {
      const { result } = await montar();

      act(() => result.current.addToCart(BALINES, DORADO));

      await waitFor(() => {
        expect(JSON.parse(localStorage.getItem('akari_cart'))).toEqual([
          { id: 30, qty: 1, color: 12 }
        ]);
      });
    });

    it('un carrito guardado con color se recupera con su color', async () => {
      const { result } = await montar({ guardado: [{ id: 30, qty: 2, color: 12 }] });

      expect(result.current.cart[0].color.nombre).toBe('Dorado');
      expect(result.current.cart[0].qty).toBe(2);
    });

    // Un carrito puede quedar guardado días: en ese tiempo la dueña puede
    // haber quitado ese color del catálogo.
    it('descarta una línea cuyo color ya no existe', async () => {
      const { result } = await montar({ guardado: [{ id: 30, qty: 1, color: 999 }] });

      await waitFor(() => expect(result.current.cart).toHaveLength(0));
      expect(result.current.toast).toMatch(/agotado/i);
    });

    // El carrito viejo, de cuando el producto no tenía colores.
    it('descarta una línea sin color de un producto que ahora los tiene', async () => {
      const { result } = await montar({ guardado: [{ id: 30, qty: 1 }] });

      await waitFor(() => expect(result.current.cart).toHaveLength(0));
    });

    it('recorta la cantidad al stock de ese color', async () => {
      const { result } = await montar({ guardado: [{ id: 30, qty: 9, color: 11 }] });

      await waitFor(() => expect(result.current.cart[0].qty).toBe(2));
      expect(result.current.toast).toMatch(/ajustamos/i);
    });
  });
});
