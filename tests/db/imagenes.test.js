// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { crearBase, como } from '../helpers/base-de-datos';

/**
 * El bucket donde viven las fotos de los productos, sobre un Postgres real.
 *
 * Lo que se comprueba no es que Storage funcione —eso es de Supabase— sino
 * que la migración deje declarado quién puede leer y quién no, igual que con
 * las tablas.
 */

describe('bucket de imágenes de productos', () => {
  let db;

  beforeAll(async () => {
    db = await crearBase();
  });

  afterAll(async () => {
    await db.close();
  });

  it('existe, es público y acepta solo imágenes livianas', async () => {
    const { rows } = await db.query(
      'SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = $1',
      ['productos']
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].public).toBe(true);
    expect(Number(rows[0].file_size_limit)).toBe(3 * 1024 * 1024);
    expect(rows[0].allowed_mime_types).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  });

  it('una visitante sin cuenta puede ver las fotos', async () => {
    await db.query(
      `INSERT INTO storage.objects (bucket_id, name) VALUES ('productos', 'esmalte.png')`
    );

    const visibles = await como(db, { rol: 'anon' }, (tx) =>
      tx.query(`SELECT name FROM storage.objects WHERE bucket_id = 'productos'`)
    );

    expect(visibles.rows).toEqual([{ name: 'esmalte.png' }]);
  });

  it('nadie puede subir nada desde el navegador: eso es del servidor', async () => {
    const intentar = (rol) =>
      como(db, { rol }, (tx) =>
        tx.query(
          `INSERT INTO storage.objects (bucket_id, name) VALUES ('productos', 'colado.png')`
        )
      );

    await expect(intentar('anon')).rejects.toThrow(/row-level security/i);
    await expect(intentar('authenticated')).rejects.toThrow(/row-level security/i);
  });

  it('las fotos de otro bucket no se ven, aunque este sea público', async () => {
    await db.query(
      `INSERT INTO storage.buckets (id, name, public) VALUES ('privado', 'privado', FALSE)
       ON CONFLICT (id) DO NOTHING`
    );
    await db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('privado', 'x.png')`);

    const visibles = await como(db, { rol: 'anon' }, (tx) =>
      tx.query('SELECT bucket_id FROM storage.objects')
    );

    expect(visibles.rows.every((fila) => fila.bucket_id === 'productos')).toBe(true);
  });
});
