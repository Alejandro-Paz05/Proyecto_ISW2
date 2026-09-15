// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  crearBase,
  como,
  crearUsuario,
  crearProducto,
  crearPedido
} from '../helpers/base-de-datos.js';

/**
 * Las políticas de RLS de la migración 005, probadas con cada rol.
 *
 * Desde que la clave publicable viaja en el navegador para iniciar sesión,
 * estas políticas son lo que decide qué devuelve una consulta directa a la
 * base. Por eso cada regla se prueba en las dos direcciones: que el rol vea
 * lo que le corresponde y que no vea nada más.
 */

let db;
const cuenta = {};
const pedido = {};

beforeAll(async () => {
  db = await crearBase();

  cuenta.clienta = await crearUsuario(db, {
    email: 'clienta@ejemplo.com',
    metadatos: { full_name: 'María López' }
  });
  cuenta.otraClienta = await crearUsuario(db, { email: 'otra@ejemplo.com' });
  cuenta.duena = await crearUsuario(db, { email: 'duena@ejemplo.com', rol: 'duena' });
  cuenta.admin = await crearUsuario(db, { email: 'admin@ejemplo.com', rol: 'admin' });
  cuenta.superAdmin = await crearUsuario(db, { email: 'revisor@ejemplo.com', rol: 'super_admin' });

  const producto = await crearProducto(db);
  pedido.deClienta = await crearPedido(db, { producto, usuario: cuenta.clienta });
  pedido.deInvitada = await crearPedido(db, { producto });
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const idsDe = (resultado) => resultado.rows.map((fila) => fila.id);

describe('perfiles', () => {
  it('cada cuenta nueva nace clienta, con el nombre que dio al registrarse', async () => {
    const { rows } = await db.query('SELECT role, full_name FROM profiles WHERE id = $1', [
      cuenta.clienta
    ]);

    expect(rows[0]).toEqual({ role: 'clienta', full_name: 'María López' });
  });

  it('toma el nombre de Google cuando llega como name y no como full_name', async () => {
    const id = await crearUsuario(db, {
      email: 'google@ejemplo.com',
      metadatos: { name: 'Ana Google' }
    });

    const { rows } = await db.query('SELECT full_name FROM profiles WHERE id = $1', [id]);
    expect(rows[0].full_name).toBe('Ana Google');
  });

  it('anon no ve ningún perfil', async () => {
    const resultado = await como(db, { rol: 'anon' }, (tx) => tx.query('SELECT id FROM profiles'));

    expect(resultado.rows).toEqual([]);
  });

  it('una clienta ve su perfil y ningún otro', async () => {
    const resultado = await como(db, { rol: 'authenticated', usuario: cuenta.clienta }, (tx) =>
      tx.query('SELECT id FROM profiles')
    );

    expect(idsDe(resultado)).toEqual([cuenta.clienta]);
  });

  it('la dueña tampoco ve las cuentas de las clientas', async () => {
    const resultado = await como(db, { rol: 'authenticated', usuario: cuenta.duena }, (tx) =>
      tx.query('SELECT id FROM profiles')
    );

    expect(idsDe(resultado)).toEqual([cuenta.duena]);
  });

  it.each(['admin', 'superAdmin'])('%s ve todas las cuentas', async (quien) => {
    const resultado = await como(db, { rol: 'authenticated', usuario: cuenta[quien] }, (tx) =>
      tx.query('SELECT id FROM profiles')
    );

    expect(idsDe(resultado)).toEqual(expect.arrayContaining(Object.values(cuenta)));
  });

  it('una clienta puede corregir su nombre', async () => {
    const nombre = await como(db, { rol: 'authenticated', usuario: cuenta.clienta }, async (tx) => {
      await tx.query("UPDATE profiles SET full_name = 'María L.' WHERE id = $1", [cuenta.clienta]);
      return (await tx.query('SELECT full_name FROM profiles WHERE id = $1', [cuenta.clienta]))
        .rows[0].full_name;
    });

    expect(nombre).toBe('María L.');
  });

  it('una clienta no puede subirse el rol a sí misma', async () => {
    await expect(
      como(db, { rol: 'authenticated', usuario: cuenta.clienta }, (tx) =>
        tx.query("UPDATE profiles SET role = 'admin' WHERE id = $1", [cuenta.clienta])
      )
    ).rejects.toThrow(/permission denied/);
  });

  it('nadie puede crearse un perfil a mano', async () => {
    await expect(
      como(db, { rol: 'authenticated', usuario: cuenta.clienta }, (tx) =>
        tx.query("INSERT INTO profiles (id, role) VALUES (gen_random_uuid(), 'admin')")
      )
    ).rejects.toThrow(/permission denied/);
  });
});

describe('pedidos', () => {
  it('anon no ve ningún pedido', async () => {
    const resultado = await como(db, { rol: 'anon' }, (tx) => tx.query('SELECT id FROM orders'));

    expect(resultado.rows).toEqual([]);
  });

  it('una clienta ve solo sus pedidos, y no los de invitadas', async () => {
    const resultado = await como(db, { rol: 'authenticated', usuario: cuenta.clienta }, (tx) =>
      tx.query('SELECT id FROM orders')
    );

    expect(idsDe(resultado)).toEqual([pedido.deClienta.id]);
  });

  it('otra clienta no ve los pedidos de la primera', async () => {
    const resultado = await como(db, { rol: 'authenticated', usuario: cuenta.otraClienta }, (tx) =>
      tx.query('SELECT id FROM orders')
    );

    expect(resultado.rows).toEqual([]);
  });

  it('las líneas y la bitácora siguen al pedido: se ven si se ve el pedido', async () => {
    const { lineas, bitacora } = await como(
      db,
      { rol: 'authenticated', usuario: cuenta.clienta },
      async (tx) => ({
        lineas: (await tx.query('SELECT DISTINCT order_id AS id FROM order_items')).rows,
        bitacora: (await tx.query('SELECT DISTINCT order_id AS id FROM order_status_history')).rows
      })
    );

    expect(lineas.map((f) => f.id)).toEqual([pedido.deClienta.id]);
    expect(bitacora.map((f) => f.id)).toEqual([pedido.deClienta.id]);
  });

  it.each(['duena', 'admin', 'superAdmin'])('%s ve todos los pedidos', async (quien) => {
    const resultado = await como(db, { rol: 'authenticated', usuario: cuenta[quien] }, (tx) =>
      tx.query('SELECT id FROM orders ORDER BY id')
    );

    expect(idsDe(resultado)).toEqual([pedido.deClienta.id, pedido.deInvitada.id]);
  });

  it('nadie escribe un pedido directo en la tabla, ni con cuenta', async () => {
    await expect(
      como(db, { rol: 'authenticated', usuario: cuenta.admin }, (tx) =>
        tx.query(
          `INSERT INTO orders (order_number, customer_name, customer_email, customer_phone,
                               customer_address, payment_method, total)
           VALUES ('AK-999999', 'X', 'x@x.com', '99999999', 'Dirección falsa', 'efectivo', 1)`
        )
      )
    ).rejects.toThrow(/row-level security/);
  });

  it('create_order no se puede llamar desde el navegador, ni con cuenta', async () => {
    await expect(
      como(db, { rol: 'authenticated', usuario: cuenta.clienta }, (tx) =>
        tx.query(
          "SELECT create_order('X', 'x@x.com', '99999999', 'Dirección falsa', 'efectivo', '[]'::jsonb, NULL)"
        )
      )
    ).rejects.toThrow(/permission denied/);
  });
});

describe('create_order con cuentas', () => {
  it('guarda la cuenta cuando se compra con sesión iniciada', async () => {
    const { rows } = await db.query('SELECT user_id FROM orders WHERE id = $1', [
      pedido.deClienta.id
    ]);

    expect(rows[0].user_id).toBe(cuenta.clienta);
  });

  it('deja la cuenta vacía en una compra como invitada', async () => {
    const { rows } = await db.query('SELECT user_id FROM orders WHERE id = $1', [
      pedido.deInvitada.id
    ]);

    expect(rows[0].user_id).toBeNull();
  });
});
