// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { crearBase, crearProducto } from '../helpers/base-de-datos';

/**
 * Los colores de un producto, sobre Postgres de verdad.
 *
 * Lo que se verifica es la decisión de fondo: cada color tiene su propia
 * existencia, y el stock del producto es la suma de los de sus colores. Si eso
 * se desincroniza, la tienda vuelve a vender lo que no hay, que es justo lo
 * que la ADR-001 fue a resolver.
 */

describe('colores con existencia propia', () => {
  let db;

  beforeEach(async () => {
    db = await crearBase();
  });

  afterEach(async () => {
    await db.close();
  });

  const stockDelProducto = async (producto) => {
    const { rows } = await db.query('SELECT stock FROM products WHERE id = $1', [producto]);
    return rows[0].stock;
  };

  const stockDelColor = async (color) => {
    const { rows } = await db.query('SELECT stock FROM product_colors WHERE id = $1', [color]);
    return rows[0].stock;
  };

  async function crearColor(producto, nombre, stock) {
    const {
      rows: [{ id }]
    } = await db.query(
      'INSERT INTO product_colors (product_id, nombre, stock) VALUES ($1, $2, $3) RETURNING id',
      [producto, nombre, stock]
    );
    return id;
  }

  const pedir = (items) =>
    db.query(
      `SELECT create_order('María López', 'maria@ejemplo.com', '+504 9999-0000',
         'San Pedro Sula, Bosques de Jucutuma 1', 'efectivo', $1::jsonb, NULL) AS pedido`,
      [JSON.stringify(items)]
    );

  describe('la suma', () => {
    it('el stock del producto es la suma de sus colores', async () => {
      const producto = await crearProducto(db, { stock: 99 });

      await crearColor(producto, 'Rojo', 3);
      await crearColor(producto, 'Azul', 5);

      expect(await stockDelProducto(producto)).toBe(8);
    });

    it('cambiar el stock de un color actualiza el del producto', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo', 3);
      await crearColor(producto, 'Azul', 5);

      await db.query('UPDATE product_colors SET stock = 10 WHERE id = $1', [rojo]);

      expect(await stockDelProducto(producto)).toBe(15);
    });

    it('borrar un color descuenta lo suyo del producto', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo', 3);
      await crearColor(producto, 'Azul', 5);

      await db.query('DELETE FROM product_colors WHERE id = $1', [rojo]);

      expect(await stockDelProducto(producto)).toBe(5);
    });

    it('un producto sin colores conserva su stock propio', async () => {
      const producto = await crearProducto(db, { stock: 7 });

      expect(await stockDelProducto(producto)).toBe(7);
    });

    // El panel manda el producto entero al guardarlo, incluido su stock. Sin
    // esta guarda, cambiar el precio dejaba el total desfasado de la suma.
    it('no se puede pisar a mano el stock de un producto con colores', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      await crearColor(producto, 'Rojo', 3);
      await crearColor(producto, 'Azul', 5);

      await db.query('UPDATE products SET stock = 999 WHERE id = $1', [producto]);

      expect(await stockDelProducto(producto)).toBe(8);
    });

    it('dos colores con el mismo nombre en un producto son un error de carga', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      await crearColor(producto, 'Rojo', 3);

      await expect(crearColor(producto, 'Rojo', 2)).rejects.toThrow(/unique|duplicad/i);
    });
  });

  describe('comprar un color', () => {
    it('descuenta del color elegido y no de los demás', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo', 4);
      const azul = await crearColor(producto, 'Azul', 6);

      await pedir([{ id: producto, qty: 2, color: rojo }]);

      expect(await stockDelColor(rojo)).toBe(2);
      expect(await stockDelColor(azul)).toBe(6);
      expect(await stockDelProducto(producto)).toBe(8);
    });

    it('la línea del pedido guarda el color con que se vendió', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo cereza', 4);

      await pedir([{ id: producto, qty: 1, color: rojo }]);

      const { rows } = await db.query('SELECT color_id, color_name FROM order_items');
      expect(rows[0]).toEqual({ color_id: rojo, color_name: 'Rojo cereza' });
    });

    // El mismo motivo que product_name: una venta cerrada conserva lo que la
    // clienta compró, aunque después se renombre.
    it('renombrar el color no cambia lo que dice el pedido viejo', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo cereza', 4);
      await pedir([{ id: producto, qty: 1, color: rojo }]);

      await db.query('UPDATE product_colors SET nombre = $1 WHERE id = $2', ['Rojo vino', rojo]);

      const { rows } = await db.query('SELECT color_name FROM order_items');
      expect(rows[0].color_name).toBe('Rojo cereza');
    });

    it('dos colores del mismo producto son dos líneas distintas', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo', 4);
      const azul = await crearColor(producto, 'Azul', 4);

      await pedir([
        { id: producto, qty: 1, color: rojo },
        { id: producto, qty: 2, color: azul }
      ]);

      const { rows } = await db.query(
        'SELECT color_name, quantity FROM order_items ORDER BY color_name'
      );
      expect(rows).toEqual([
        { color_name: 'Azul', quantity: 2 },
        { color_name: 'Rojo', quantity: 1 }
      ]);
      expect(await stockDelProducto(producto)).toBe(5);
    });
  });

  describe('lo que la base no deja hacer', () => {
    it('no se puede comprar un producto con colores sin elegir uno', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      await crearColor(producto, 'Rojo', 4);

      await expect(pedir([{ id: producto, qty: 1 }])).rejects.toThrow(/Elegí un color/i);
    });

    it('no se puede pedir más unidades de las que hay de ese color', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo', 2);
      await crearColor(producto, 'Azul', 50);

      // El producto tiene 52 en total: sin control por color, esto pasaría.
      await expect(pedir([{ id: producto, qty: 3, color: rojo }])).rejects.toThrow(
        /en Rojo solo quedan 2/i
      );
    });

    it('no se puede elegir un color que es de otro producto', async () => {
      const uno = await crearProducto(db, { stock: 0 });
      await crearColor(uno, 'Rojo', 4);
      const otro = await crearProducto(db, { stock: 0 });
      const ajeno = await crearColor(otro, 'Verde', 4);

      await expect(pedir([{ id: uno, qty: 1, color: ajeno }])).rejects.toThrow(
        /ya no está disponible/i
      );
    });

    it('nada queda escrito cuando el pedido se rechaza', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo', 1);

      await expect(pedir([{ id: producto, qty: 5, color: rojo }])).rejects.toThrow();

      const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM orders');
      expect(rows[0].n).toBe(0);
      expect(await stockDelColor(rojo)).toBe(1);
    });
  });

  describe('cancelar un pedido con color', () => {
    it('devuelve las unidades al color, no al producto suelto', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo', 4);
      const {
        rows: [{ pedido }]
      } = await pedir([{ id: producto, qty: 3, color: rojo }]);

      expect(await stockDelColor(rojo)).toBe(1);

      await db.query(`UPDATE orders SET status = 'cancelado' WHERE id = $1`, [pedido.id]);

      expect(await stockDelColor(rojo)).toBe(4);
      expect(await stockDelProducto(producto)).toBe(4);
    });

    it('reabrirlo vuelve a descontar del color', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo', 4);
      const {
        rows: [{ pedido }]
      } = await pedir([{ id: producto, qty: 3, color: rojo }]);

      await db.query(`UPDATE orders SET status = 'cancelado' WHERE id = $1`, [pedido.id]);
      await db.query(`UPDATE orders SET status = 'confirmado' WHERE id = $1`, [pedido.id]);

      expect(await stockDelColor(rojo)).toBe(1);
    });

    it('no se puede reabrir si ese color se agotó mientras tanto', async () => {
      const producto = await crearProducto(db, { stock: 0 });
      const rojo = await crearColor(producto, 'Rojo', 3);
      const {
        rows: [{ pedido }]
      } = await pedir([{ id: producto, qty: 3, color: rojo }]);

      await db.query(`UPDATE orders SET status = 'cancelado' WHERE id = $1`, [pedido.id]);
      await pedir([{ id: producto, qty: 3, color: rojo }]);

      await expect(
        db.query(`UPDATE orders SET status = 'confirmado' WHERE id = $1`, [pedido.id])
      ).rejects.toThrow(/en Rojo solo quedan 0/i);
    });
  });
});
