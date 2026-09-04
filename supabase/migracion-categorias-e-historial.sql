-- ============================================================
-- AKARI STUDIO — Migración: categorías e historial de estados
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
--
-- Es idempotente y transaccional: volver a correrla no duplica nada, y si
-- algo falla no queda a medias.
--
-- Agrega dos tablas que resuelven dos problemas concretos que el sistema
-- tenía abiertos:
--
--   categories            Las categorías del catálogo vivían escritas a mano
--                         en lib/categorias.js. Agregar una exigía un deploy,
--                         y la base no impedía guardar un producto con una
--                         categoría que la tienda no sabe mostrar: el filtro
--                         simplemente lo dejaba invisible.
--
--   order_status_history  El panel cambia el estado de un pedido, pero orders
--                         solo guarda el estado actual. No había forma de
--                         saber cuándo se confirmó ni cuándo se entregó, que
--                         es justo lo que se pregunta cuando una clienta
--                         reclama.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. categories
-- ============================================================

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
  'Orden en que se muestran los filtros de la tienda. No alfabético: la dueña decide qué va primero.';

-- Las mismas cinco que hoy están en lib/categorias.js, en el mismo orden.
-- El UPDATE del ON CONFLICT hace que corregir una etiqueta aquí y volver a
-- correr el archivo sea suficiente.
INSERT INTO categories (key, label, position) VALUES
  ('unas',       'Uñas',       1),
  ('pestanas',   'Pestañas',   2),
  ('cejas',      'Cejas',      3),
  ('maquillaje', 'Maquillaje', 4),
  ('accesorios', 'Accesorios', 5)
ON CONFLICT (key) DO UPDATE
  SET label    = EXCLUDED.label,
      position = EXCLUDED.position;

-- Antes de crear la clave foránea: si algún producto quedó con una categoría
-- que no está en la tabla, conviene enterarse con un mensaje que diga cuál,
-- y no con el error genérico de la restricción.
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

-- PostgreSQL no indexa solo las columnas que son origen de una clave foránea.
-- Sin este índice, cada borrado o renombrado de categoría recorre products
-- entero para verificar la restricción.
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_fkey;
ALTER TABLE products
  ADD CONSTRAINT products_category_fkey
  FOREIGN KEY (category) REFERENCES categories (key)
  ON UPDATE CASCADE   -- renombrar la clave arrastra a los productos
  ON DELETE RESTRICT; -- no se borra una categoría que todavía tiene productos

-- El catálogo y sus categorías son información pública, igual que products.
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_public_read ON categories;
CREATE POLICY categories_public_read ON categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================
-- 2. order_status_history
-- ============================================================

CREATE TABLE IF NOT EXISTS order_status_history (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL
               CHECK (status IN ('pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado')),
  note       TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE order_status_history IS
  'Bitácora de estados de cada pedido. La escribe un trigger, nunca la aplicación.';

-- El panel siempre pregunta lo mismo: el historial de UN pedido, del más
-- reciente al más viejo. El índice compuesto cubre esa consulta entera.
CREATE INDEX IF NOT EXISTS order_status_history_order_idx
  ON order_status_history (order_id, changed_at DESC);

-- La bitácora la escribe la base, no la aplicación. Si dependiera de que la
-- ruta de API se acuerde de insertar la fila, bastaría con que alguien
-- actualizara el estado desde el panel de Supabase para perder el registro.
CREATE OR REPLACE FUNCTION registrar_estado_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO order_status_history (order_id, status, note, changed_at)
    VALUES (NEW.id, NEW.status, 'Pedido recibido en la tienda', NEW.created_at);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_status_history (order_id, status)
    VALUES (NEW.id, NEW.status);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS orders_registrar_estado ON orders;
CREATE TRIGGER orders_registrar_estado
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION registrar_estado_pedido();

-- Los pedidos que ya existían nacen con una sola entrada: su estado actual,
-- fechada cuando se creó el pedido. No se inventa una transición que nadie
-- registró; solo se deja constancia del punto de partida.
INSERT INTO order_status_history (order_id, status, note, changed_at)
SELECT o.id, o.status, 'Estado al crearse la bitácora', o.created_at
  FROM orders o
 WHERE NOT EXISTS (
   SELECT 1 FROM order_status_history h WHERE h.order_id = o.id
 );

-- Sin políticas y con RLS activo: acceso público cero. La bitácora está
-- atada a pedidos, que tampoco son públicos.
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
-- Debe devolver cinco filas: las cinco tablas, con su conteo real.

SELECT 'categories'           AS tabla, COUNT(*) AS filas FROM categories
UNION ALL
SELECT 'products',            COUNT(*) FROM products
UNION ALL
SELECT 'orders',              COUNT(*) FROM orders
UNION ALL
SELECT 'order_items',         COUNT(*) FROM order_items
UNION ALL
SELECT 'order_status_history', COUNT(*) FROM order_status_history
ORDER BY tabla;
