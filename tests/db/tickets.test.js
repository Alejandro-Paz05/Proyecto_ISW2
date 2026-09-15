// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { crearBase, como, crearUsuario } from '../helpers/base-de-datos.js';

/**
 * Retroalimentación y tickets (migración 006).
 *
 * Las pruebas que escriben corren como service_role, que es con lo que
 * escribe el servidor, y dentro de una transacción que se deshace al
 * terminar. Las de lectura usan datos cargados una vez al principio.
 */

let db;
const cuenta = {};
const dato = {};

// Así llama al registro la ruta /api/errores.
async function registrarError(tx, huella, titulo = 'TypeError: producto is undefined') {
  const {
    rows: [{ id }]
  } = await tx.query(
    `SELECT registrar_error($1, $2, 'at Carrito (CartDrawer.jsx:42)', '{"ruta": "/akaristudio"}') AS id`,
    [huella, titulo]
  );
  return id;
}

async function dejarRetroalimentacion(
  tx,
  { usuario = null, tipo = 'sugerencia', mensaje = 'Estaría bueno poder pagar con Tigo Money.' } = {}
) {
  const {
    rows: [fila]
  } = await tx.query(
    `INSERT INTO feedback (user_id, kind, message, page)
     VALUES ($1, $2, $3, '/akaristudio/productos') RETURNING id, ticket_id`,
    [usuario, tipo, mensaje]
  );
  return fila;
}

const comoServidor = (fn) => como(db, { rol: 'service_role' }, fn);

beforeAll(async () => {
  db = await crearBase();

  cuenta.clienta = await crearUsuario(db, { email: 'clienta@ejemplo.com' });
  cuenta.otraClienta = await crearUsuario(db, { email: 'otra@ejemplo.com' });
  cuenta.duena = await crearUsuario(db, { email: 'duena@ejemplo.com', rol: 'duena' });
  cuenta.admin = await crearUsuario(db, { email: 'admin@ejemplo.com', rol: 'admin' });
  cuenta.superAdmin = await crearUsuario(db, { email: 'revisor@ejemplo.com', rol: 'super_admin' });

  // Datos permanentes para las pruebas de lectura.
  dato.problemaDeClienta = await dejarRetroalimentacion(db, {
    usuario: cuenta.clienta,
    tipo: 'problema',
    mensaje: 'No me deja pagar con tarjeta\nMe sale un error al confirmar.'
  });
  dato.sugerenciaDeOtra = await dejarRetroalimentacion(db, { usuario: cuenta.otraClienta });
  dato.ticketAutomatico = await registrarError(db, 'cliente:TypeError:CartDrawer');
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const idsDe = (resultado) => resultado.rows.map((fila) => fila.id);

describe('tickets automáticos', () => {
  it('un error nuevo abre un ticket automático y abierto', async () => {
    const ticket = await comoServidor(async (tx) => {
      const id = await registrarError(tx, 'huella-nueva');
      return (await tx.query('SELECT source, status, occurrences FROM tickets WHERE id = $1', [id]))
        .rows[0];
    });

    expect(ticket).toEqual({ source: 'automatico', status: 'abierto', occurrences: 1 });
  });

  it('el mismo error repetido suma ocurrencias en vez de abrir otro ticket', async () => {
    const { ids, ocurrencias, tickets } = await comoServidor(async (tx) => {
      const primero = await registrarError(tx, 'huella-repetida');
      const segundo = await registrarError(tx, 'huella-repetida');
      const tercero = await registrarError(tx, 'huella-repetida');
      const { rows } = await tx.query(
        "SELECT occurrences FROM tickets WHERE fingerprint = 'huella-repetida'"
      );
      return { ids: [primero, segundo, tercero], ocurrencias: rows[0].occurrences, tickets: rows.length };
    });

    expect(new Set(ids).size).toBe(1);
    expect(ocurrencias).toBe(3);
    expect(tickets).toBe(1);
  });

  it('si el error vuelve después de resuelto, abre uno nuevo: es una regresión', async () => {
    const { original, regresion } = await comoServidor(async (tx) => {
      const original = await registrarError(tx, 'huella-regresion');
      await tx.query("UPDATE tickets SET status = 'resuelto' WHERE id = $1", [original]);
      const regresion = await registrarError(tx, 'huella-regresion');
      return { original, regresion };
    });

    expect(regresion).not.toBe(original);
  });

  it('resolver un ticket le pone fecha, y reabrirlo se la quita', async () => {
    const { resuelto, reabierto } = await comoServidor(async (tx) => {
      const id = await registrarError(tx, 'huella-fecha');
      const fecha = async () =>
        (await tx.query('SELECT resolved_at FROM tickets WHERE id = $1', [id])).rows[0].resolved_at;

      await tx.query("UPDATE tickets SET status = 'resuelto' WHERE id = $1", [id]);
      const resuelto = await fecha();
      await tx.query("UPDATE tickets SET status = 'abierto' WHERE id = $1", [id]);
      return { resuelto, reabierto: await fecha() };
    });

    expect(resuelto).toBeInstanceOf(Date);
    expect(reabierto).toBeNull();
  });

  it('exige una huella: sin ella no hay forma de agrupar', async () => {
    await expect(comoServidor((tx) => registrarError(tx, '   '))).rejects.toThrow(/huella/);
  });

  it('no se puede llamar desde el navegador, ni con cuenta', async () => {
    await expect(
      como(db, { rol: 'authenticated', usuario: cuenta.admin }, (tx) =>
        registrarError(tx, 'huella-intrusa')
      )
    ).rejects.toThrow(/permission denied/);
  });

  it('trae cargado el bug del botón de WhatsApp, ya resuelto', async () => {
    const { rows } = await db.query(
      "SELECT status, resolved_at FROM tickets WHERE fingerprint = 'e2e:whatsapp-tapa-realizar-pedido'"
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('resuelto');
    expect(rows[0].resolved_at).toBeInstanceOf(Date);
  });
});

describe('retroalimentación', () => {
  it('un problema reportado abre un ticket de origen cliente, enlazado al mensaje', async () => {
    const { rows } = await db.query('SELECT source, title, status FROM tickets WHERE id = $1', [
      dato.problemaDeClienta.ticket_id
    ]);

    expect(rows[0]).toEqual({
      source: 'cliente',
      title: 'No me deja pagar con tarjeta', // la primera línea, no el mensaje entero
      status: 'abierto'
    });
  });

  it.each(['sugerencia', 'elogio'])('una %s no abre ticket', async (tipo) => {
    const fila = await comoServidor((tx) =>
      dejarRetroalimentacion(tx, { tipo, mensaje: 'Me encantó la atención.' })
    );

    expect(fila.ticket_id).toBeNull();
  });

  it('una invitada puede dejar su mensaje sin cuenta', async () => {
    const fila = await comoServidor((tx) => dejarRetroalimentacion(tx, { usuario: null }));

    expect(fila.id).toEqual(expect.any(Number));
  });

  it('rechaza un mensaje demasiado corto', async () => {
    await expect(
      comoServidor((tx) => dejarRetroalimentacion(tx, { mensaje: 'ok' }))
    ).rejects.toThrow(/check constraint/);
  });
});

describe('RLS de retroalimentación y tickets', () => {
  it('anon no ve ni retroalimentación ni tickets', async () => {
    const { mensajes, tickets } = await como(db, { rol: 'anon' }, async (tx) => ({
      mensajes: (await tx.query('SELECT id FROM feedback')).rows,
      tickets: (await tx.query('SELECT id FROM tickets')).rows
    }));

    expect(mensajes).toEqual([]);
    expect(tickets).toEqual([]);
  });

  it('una clienta ve solo sus propios mensajes', async () => {
    const resultado = await como(db, { rol: 'authenticated', usuario: cuenta.clienta }, (tx) =>
      tx.query('SELECT id FROM feedback')
    );

    expect(idsDe(resultado)).toEqual([dato.problemaDeClienta.id]);
  });

  it('una clienta no ve los tickets, ni el que abrió su propio reporte', async () => {
    const resultado = await como(db, { rol: 'authenticated', usuario: cuenta.clienta }, (tx) =>
      tx.query('SELECT id FROM tickets')
    );

    expect(resultado.rows).toEqual([]);
  });

  it('la dueña ve toda la retroalimentación, pero ningún ticket', async () => {
    const { mensajes, tickets } = await como(
      db,
      { rol: 'authenticated', usuario: cuenta.duena },
      async (tx) => ({
        mensajes: await tx.query('SELECT id FROM feedback ORDER BY id'),
        tickets: (await tx.query('SELECT id FROM tickets')).rows
      })
    );

    expect(idsDe(mensajes)).toEqual([dato.problemaDeClienta.id, dato.sugerenciaDeOtra.id]);
    expect(tickets).toEqual([]);
  });

  it.each(['admin', 'superAdmin'])('%s ve todos los tickets', async (quien) => {
    const resultado = await como(db, { rol: 'authenticated', usuario: cuenta[quien] }, (tx) =>
      tx.query('SELECT id FROM tickets')
    );

    expect(idsDe(resultado)).toEqual(
      expect.arrayContaining([dato.ticketAutomatico, dato.problemaDeClienta.ticket_id])
    );
  });

  it('nadie escribe retroalimentación directo en la tabla, ni con cuenta', async () => {
    await expect(
      como(db, { rol: 'authenticated', usuario: cuenta.clienta }, (tx) =>
        dejarRetroalimentacion(tx, { usuario: cuenta.clienta })
      )
    ).rejects.toThrow(/row-level security/);
  });

  it('nadie abre un ticket directo en la tabla, ni el admin', async () => {
    await expect(
      como(db, { rol: 'authenticated', usuario: cuenta.admin }, (tx) =>
        tx.query("INSERT INTO tickets (source, title) VALUES ('interno', 'Ticket a mano')")
      )
    ).rejects.toThrow(/row-level security/);
  });
});
