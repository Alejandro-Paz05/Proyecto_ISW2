// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { crearBase, crearProducto, crearPedido } from '../helpers/base-de-datos';

/**
 * Qué le pasa al inventario cuando un pedido cambia de estado.
 *
 * Hasta la migración 008, products.stock solo sabía restarse: cancelar un
 * pedido dejaba su inventario descontado para siempre y la tienda mostraba
 * "Agotado" con el producto en la mano de la dueña.
 *
 * Se prueba contra Postgres de verdad porque lo que se verifica es un trigger
 * y un bloqueo de filas, que un simulacro del cliente de base de datos no
 * ejecuta.
 */

describe('el inventario cuando un pedido se cancela', () => {
  let db;

  beforeEach(async () => {
    db = await crearBase();
  });

  afterEach(async () => {
    await db.close();
  });

  const stockDe = async (producto) => {
    const { rows } = await db.query('SELECT stock FROM products WHERE id = $1', [producto]);
    return rows[0].stock;
  };

  const cambiarEstado = (pedido, estado) =>
    db.query('UPDATE orders SET status = $1 WHERE id = $2', [estado, pedido]);

  it('cancelar devuelve al catálogo lo que el pedido tenía reservado', async () => {
    const producto = await crearProducto(db, { stock: 10 });
    const pedido = await crearPedido(db, { producto, cantidad: 3 });

    expect(await stockDe(producto)).toBe(7);

    await cambiarEstado(pedido.id, 'cancelado');

    expect(await stockDe(producto)).toBe(10);
  });

  it('pasar por otros estados no toca el inventario', async () => {
    const producto = await crearProducto(db, { stock: 10 });
    const pedido = await crearPedido(db, { producto, cantidad: 3 });

    await cambiarEstado(pedido.id, 'confirmado');
    await cambiarEstado(pedido.id, 'enviado');
    await cambiarEstado(pedido.id, 'entregado');

    expect(await stockDe(producto)).toBe(7);
  });

  it('guardar el pedido sin cambiarle el estado tampoco', async () => {
    const producto = await crearProducto(db, { stock: 10 });
    const pedido = await crearPedido(db, { producto, cantidad: 3 });

    await cambiarEstado(pedido.id, 'cancelado');
    // El mismo UPDATE otra vez: el WHEN del trigger lo deja pasar de largo.
    await cambiarEstado(pedido.id, 'cancelado');

    expect(await stockDe(producto)).toBe(10);
  });

  it('reabrir un pedido cancelado vuelve a descontar', async () => {
    const producto = await crearProducto(db, { stock: 10 });
    const pedido = await crearPedido(db, { producto, cantidad: 3 });

    await cambiarEstado(pedido.id, 'cancelado');
    await cambiarEstado(pedido.id, 'confirmado');

    expect(await stockDe(producto)).toBe(7);
  });

  it('no se puede reabrir si mientras tanto se vendió lo que quedaba', async () => {
    const producto = await crearProducto(db, { stock: 3 });
    const pedido = await crearPedido(db, { producto, cantidad: 3 });

    await cambiarEstado(pedido.id, 'cancelado');
    // Otra clienta se lleva las tres unidades que volvieron al catálogo.
    await crearPedido(db, { producto, cantidad: 3 });
    expect(await stockDe(producto)).toBe(0);

    await expect(cambiarEstado(pedido.id, 'confirmado')).rejects.toThrow(/solo quedan 0 unidades/i);

    // Y el pedido sigue cancelado: la transacción se deshizo entera.
    const { rows } = await db.query('SELECT status FROM orders WHERE id = $1', [pedido.id]);
    expect(rows[0].status).toBe('cancelado');
    expect(await stockDe(producto)).toBe(0);
  });

  it('un producto que ya no está en el catálogo no impide cancelar', async () => {
    const producto = await crearProducto(db, { stock: 10 });
    const pedido = await crearPedido(db, { producto, cantidad: 2 });

    // Al borrarlo, order_items.product_id queda en NULL por el ON DELETE SET
    // NULL, y la línea conserva su copia del nombre y del precio.
    await db.query('DELETE FROM products WHERE id = $1', [producto]);

    await cambiarEstado(pedido.id, 'cancelado');

    const { rows } = await db.query(
      'SELECT status FROM orders WHERE id = $1',
      [pedido.id]
    );
    expect(rows[0].status).toBe('cancelado');
  });

  it('cancelar un pedido de varias líneas devuelve cada una', async () => {
    const uno = await crearProducto(db, { stock: 10 });
    const {
      rows: [{ id: otro }]
    } = await db.query(
      `INSERT INTO products (name, category, price, stock)
       VALUES ('Segundo kit', 'unas', 300, 5) RETURNING id`
    );

    const {
      rows: [{ pedido }]
    } = await db.query(
      `SELECT create_order('María López', 'maria@ejemplo.com', '+504 9999-0000',
         'San Pedro Sula', 'efectivo', $1::jsonb, NULL) AS pedido`,
      [JSON.stringify([{ id: uno, qty: 2 }, { id: otro, qty: 4 }])]
    );

    expect(await stockDe(uno)).toBe(8);
    expect(await stockDe(otro)).toBe(1);

    await cambiarEstado(pedido.id, 'cancelado');

    expect(await stockDe(uno)).toBe(10);
    expect(await stockDe(otro)).toBe(5);
  });
});
