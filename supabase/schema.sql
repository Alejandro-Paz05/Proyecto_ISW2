-- ============================================================
-- AKARI STUDIO — Esquema de base de datos
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
--
-- Este archivo define ÚNICAMENTE la estructura: tablas, índices,
-- políticas de seguridad y la función que crea pedidos. No contiene
-- ningún producto.
--
-- ATENCIÓN: BORRA las tablas existentes y las vuelve a crear vacías.
-- Se corre una sola vez, al montar la base. Para cargar productos NO
-- hace falta volver a ejecutarlo: ver `seed.sql` y la sección
-- "Cargar el catálogo" del README.
--
-- Modelo de seguridad:
--   - RLS activado en las cinco tablas.
--   - El rol `anon` solo puede LEER el catálogo: `products` y
--     `categories`.
--   - `orders`, `order_items` y `order_status_history` no tienen
--     ninguna política, así que son invisibles para cualquier
--     cliente público.
--   - Los pedidos se crean únicamente con la función `create_order`,
--     que se invoca desde el servidor con la clave `service_role`.
-- ============================================================

DROP FUNCTION IF EXISTS create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP TABLE IF EXISTS order_status_history CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP FUNCTION IF EXISTS registrar_estado_pedido();
DROP SEQUENCE IF EXISTS order_number_seq;

-- ============================================================
-- Tablas
-- ============================================================

-- Las categorías viven en la base y no en el código para que agregar
-- una no exija un despliegue, y sobre todo para que products.category
-- pueda apuntarle con una clave foránea: sin eso, nada impide guardar
-- un producto en una categoría que la tienda no sabe mostrar.
CREATE TABLE categories (
  id         SERIAL PRIMARY KEY,
  key        TEXT UNIQUE NOT NULL CHECK (key ~ '^[a-z]+$'),
  label      TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Las categorías sí van acá, a diferencia de los productos: sin ellas
-- la clave foránea de products no deja insertar nada.
INSERT INTO categories (key, label, position) VALUES
  ('unas',       'Uñas',       1),
  ('pestanas',   'Pestañas',   2),
  ('cejas',      'Cejas',      3),
  ('maquillaje', 'Maquillaje', 4),
  ('accesorios', 'Accesorios', 5);

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL REFERENCES categories(key)
                ON UPDATE CASCADE ON DELETE RESTRICT,
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  description TEXT,
  image       TEXT,
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id               SERIAL PRIMARY KEY,
  order_number     TEXT UNIQUE NOT NULL,
  customer_name    TEXT NOT NULL,
  customer_email   TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  payment_method   TEXT NOT NULL
                     CHECK (payment_method IN ('efectivo', 'tarjeta', 'transferencia')),
  total            NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  status           TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (status IN ('pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  price        NUMERIC(10, 2) NOT NULL CHECK (price >= 0)
);

-- Bitácora de estados. La escribe un trigger y no la aplicación: si
-- dependiera de que la ruta de API se acuerde de insertar la fila,
-- bastaría con cambiar el estado desde el panel de Supabase para
-- perder el registro.
CREATE TABLE order_status_history (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL
               CHECK (status IN ('pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado')),
  note       TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX order_items_order_id_idx ON order_items (order_id);
CREATE INDEX orders_created_at_idx    ON orders (created_at DESC);

-- PostgreSQL no indexa solo las columnas origen de una clave foránea.
-- Sin este índice, borrar o renombrar una categoría recorre products
-- entero para verificar la restricción.
CREATE INDEX products_category_idx ON products (category);

-- El panel siempre pregunta lo mismo: la bitácora de UN pedido, del
-- cambio más reciente al más viejo. El índice compuesto la cubre entera.
CREATE INDEX order_status_history_order_idx
  ON order_status_history (order_id, changed_at DESC);

-- Número de pedido correlativo: AK-001000, AK-001001, ...
-- Una secuencia nunca repite, a diferencia de un timestamp recortado.
CREATE SEQUENCE order_number_seq START 1000;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- El catálogo es público: cualquiera puede verlo, nadie puede modificarlo.
CREATE POLICY products_public_read ON products
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY categories_public_read ON categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- `orders`, `order_items` y `order_status_history` quedan sin políticas
-- a propósito: con RLS activado eso significa cero acceso para los roles
-- públicos. Solo `service_role`, que salta RLS, puede tocarlos desde el
-- servidor.

-- ============================================================
-- Bitácora de estados (trigger)
-- ============================================================

CREATE FUNCTION registrar_estado_pedido()
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

CREATE TRIGGER orders_registrar_estado
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION registrar_estado_pedido();

-- ============================================================
-- Creación de pedidos (atómica)
-- ============================================================
-- Todo corre dentro de una sola transacción:
--   1. Bloquea las filas de producto (FOR UPDATE) en orden de id, lo
--      que evita sobreventa y deadlocks entre pedidos simultáneos.
--   2. Calcula el total con los precios de la base de datos, nunca
--      con los que manda el navegador.
--   3. Inserta el pedido, sus items y descuenta el stock.
-- Si algo falla se revierte todo: no quedan pedidos huérfanos.

CREATE FUNCTION create_order(
  p_customer_name    TEXT,
  p_customer_email   TEXT,
  p_customer_phone   TEXT,
  p_customer_address TEXT,
  p_payment_method   TEXT,
  p_items            JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id     INTEGER;
  v_order_number TEXT;
  v_total        NUMERIC(10, 2) := 0;
  v_item         RECORD;
  v_product      products%ROWTYPE;
BEGIN
  -- ----- Datos del cliente -----
  IF COALESCE(TRIM(p_customer_name), '') = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(TRIM(p_customer_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'El correo electrónico no es válido.' USING ERRCODE = '22023';
  END IF;

  -- Al menos 8 dígitos, ignorando espacios, guiones y paréntesis.
  IF LENGTH(REGEXP_REPLACE(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'El número de teléfono no es válido.' USING ERRCODE = '22023';
  END IF;

  IF LENGTH(COALESCE(TRIM(p_customer_address), '')) < 10 THEN
    RAISE EXCEPTION 'La dirección de entrega es demasiado corta.' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido no tiene productos.' USING ERRCODE = '22023';
  END IF;

  -- ----- Paso 1: bloquear, validar stock y calcular el total -----
  FOR v_item IN
    SELECT (elem ->> 'id')::INTEGER          AS product_id,
           SUM((elem ->> 'qty')::INTEGER)    AS qty
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY 1
    ORDER BY 1
  LOOP
    IF v_item.product_id IS NULL OR v_item.qty IS NULL OR v_item.qty <= 0 THEN
      RAISE EXCEPTION 'La cantidad solicitada no es válida.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product FROM products WHERE id = v_item.product_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uno de los productos del carrito ya no está disponible.'
        USING ERRCODE = '22023';
    END IF;

    IF v_product.stock < v_item.qty THEN
      RAISE EXCEPTION 'No hay suficiente stock de "%". Solo quedan % unidades.',
        v_product.name, v_product.stock USING ERRCODE = '22023';
    END IF;

    v_total := v_total + (v_product.price * v_item.qty);
  END LOOP;

  -- ----- Paso 2: crear el pedido -----
  v_order_number := 'AK-' || LPAD(nextval('order_number_seq')::TEXT, 6, '0');

  INSERT INTO orders (
    order_number, customer_name, customer_email,
    customer_phone, customer_address, payment_method, total
  )
  VALUES (
    v_order_number, TRIM(p_customer_name), LOWER(TRIM(p_customer_email)),
    TRIM(p_customer_phone), TRIM(p_customer_address), p_payment_method, v_total
  )
  RETURNING id INTO v_order_id;

  -- ----- Paso 3: guardar los items y descontar el stock -----
  -- El nombre y el precio salen de `products`, no del navegador.
  FOR v_item IN
    SELECT (elem ->> 'id')::INTEGER          AS product_id,
           SUM((elem ->> 'qty')::INTEGER)    AS qty
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY 1
    ORDER BY 1
  LOOP
    INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
    SELECT v_order_id, p.id, p.name, v_item.qty, p.price
    FROM products p
    WHERE p.id = v_item.product_id;

    UPDATE products
    SET stock = stock - v_item.qty
    WHERE id = v_item.product_id;
  END LOOP;

  RETURN jsonb_build_object(
    'id',             v_order_id,
    'order_number',   v_order_number,
    'customer_email', LOWER(TRIM(p_customer_email)),
    'total',          v_total
  );
END;
$$;

-- Solo el servidor puede crear pedidos.
REVOKE ALL ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;
