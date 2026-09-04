-- ============================================================
-- 001 · Catálogo: categorías y productos
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Requiere: 000
--
-- Idempotente. Sobre una base que ya tiene el catálogo no cambia nada:
-- las tablas usan IF NOT EXISTS, las categorías se insertan con ON
-- CONFLICT, y la clave foránea se agrega solo si todavía no existe.
-- ============================================================

BEGIN;

-- ============================================================
-- categories
-- ============================================================
-- Las categorías viven en la base y no en el código por dos razones:
-- agregar una no debería exigir un despliegue, y products.category
-- necesita algo a lo que apuntar. Mientras la validación existió solo en
-- la aplicación, un INSERT hecho desde el panel de Supabase se la
-- saltaba entera y dejaba el producto invisible en la tienda.

CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  key        TEXT UNIQUE NOT NULL CHECK (key ~ '^[a-z]+$'),
  label      TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE categories IS
  'Categorías del catálogo. Fuente de verdad; lib/categorias.js es su espejo para el modo sin conexión.';
COMMENT ON COLUMN categories.key IS
  'Clave sin acentos ni espacios. Es la que guarda products.category y la que viaja en la URL del filtro.';
COMMENT ON COLUMN categories.position IS
  'Orden en que se muestran los filtros. No alfabético: la dueña decide qué va primero.';

-- El UPDATE del ON CONFLICT hace que corregir una etiqueta acá y volver a
-- correr el archivo alcance para actualizarla.
INSERT INTO categories (key, label, position) VALUES
  ('unas',       'Uñas',       1),
  ('pestanas',   'Pestañas',   2),
  ('cejas',      'Cejas',      3),
  ('maquillaje', 'Maquillaje', 4),
  ('accesorios', 'Accesorios', 5)
ON CONFLICT (key) DO UPDATE
  SET label    = EXCLUDED.label,
      position = EXCLUDED.position;

-- ============================================================
-- products
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  description TEXT,
  image       TEXT,
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE products IS 'Catálogo de productos a la venta, con su inventario.';

-- Antes de crear la clave foránea: si algún producto quedó con una
-- categoría que no está en la tabla, conviene enterarse con un mensaje que
-- diga cuál, y no con el error genérico de la restricción.
DO $$
DECLARE
  v_huerfanas TEXT;
BEGIN
  SELECT string_agg(DISTINCT p.category, ', ')
    INTO v_huerfanas
    FROM products p
   WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.key = p.category);

  IF v_huerfanas IS NOT NULL THEN
    RAISE EXCEPTION
      'Hay productos con categorías que no existen en categories: %. Agregalas a la tabla o corregí esos productos antes de migrar.',
      v_huerfanas;
  END IF;
END $$;

-- PostgreSQL no indexa solo las columnas que son origen de una clave
-- foránea. Sin este índice, cada borrado o renombrado de categoría
-- recorre products entero para verificar la restricción.
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);

-- Se consulta pg_constraint en vez de hacer DROP + ADD a ciegas: así,
-- sobre una base que ya la tiene, la migración no toca nada. Un DROP y un
-- ADD revalidarían la tabla entera cada vez que se corre el archivo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_category_fkey'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_category_fkey
      FOREIGN KEY (category) REFERENCES categories (key)
      ON UPDATE CASCADE   -- renombrar la clave arrastra a los productos
      ON DELETE RESTRICT; -- no se borra una categoría que aún tiene productos
  END IF;
END $$;

-- ============================================================
-- Row Level Security
-- ============================================================
-- El catálogo es información pública: cualquiera puede leerlo, nadie
-- puede escribirlo. Escribir exige `service_role`, que solo vive en el
-- servidor.

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_public_read ON categories;
CREATE POLICY categories_public_read ON categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS products_public_read ON products;
CREATE POLICY products_public_read ON products
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO schema_migraciones (version, nombre)
VALUES (1, 'catalogo')
ON CONFLICT (version) DO NOTHING;

COMMIT;
