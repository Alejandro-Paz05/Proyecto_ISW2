-- ============================================================
-- 002 · Pedidos: orders, order_items y create_order
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Requiere: 000, 001
--
-- Idempotente. La función se reemplaza con CREATE OR REPLACE, así que
-- volver a correr el archivo la deja igual sin perder permisos.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS orders (
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

COMMENT ON TABLE orders IS 'Pedidos recibidos. Contiene datos personales del cliente.';

CREATE TABLE IF NOT EXISTS order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  price        NUMERIC(10, 2) NOT NULL CHECK (price >= 0)
);

COMMENT ON TABLE order_items IS
  'Líneas de cada pedido. Guardan su propia copia del nombre y el precio: una venta cerrada debe conservar lo que se cobró.';

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS orders_created_at_idx    ON orders (created_at DESC);

-- Número de pedido correlativo: AK-001000, AK-001001, ...
-- Una secuencia nunca repite, a diferencia de un timestamp recortado: la
-- primera versión usaba los últimos dígitos de la hora, que vuelven a
-- coincidir cada ~16 minutos y chocaban contra la restricción UNIQUE.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000;

-- ============================================================
-- Row Level Security
-- ============================================================
-- Sin políticas y con RLS activo, el acceso público es cero. Guardan datos
-- personales que solo el servidor debe poder leer.

ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- create_order
-- ============================================================
-- Todo corre dentro de una sola transacción:
--   1. Bloquea las filas de producto (FOR UPDATE) en orden de id, lo que
--      evita sobreventa y deadlocks entre pedidos simultáneos.
--   2. Calcula el total con los precios de la base, nunca con los que
--      manda el navegador.
--   3. Inserta el pedido, sus líneas y descuenta el stock.
-- Si algo falla se revierte todo: no quedan pedidos huérfanos.

CREATE OR REPLACE FUNCTION create_order(
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

  -- ----- Paso 3: guardar las líneas y descontar el stock -----
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

-- Solo el servidor puede crear pedidos. REVOKE y GRANT son idempotentes.
REVOKE ALL ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

INSERT INTO schema_migraciones (version, nombre)
VALUES (2, 'pedidos')
ON CONFLICT (version) DO NOTHING;

COMMIT;
