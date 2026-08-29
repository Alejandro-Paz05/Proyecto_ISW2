-- ============================================================
-- AKARI STUDIO — Esquema de base de datos
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
--
-- ATENCIÓN: este script BORRA las tablas existentes y las vuelve a
-- crear con datos de ejemplo. Si ya tienes pedidos reales, respalda
-- las tablas `orders` y `order_items` antes de correrlo.
--
-- Modelo de seguridad:
--   - RLS activado en las tres tablas.
--   - El rol `anon` solo puede LEER el catálogo de productos.
--   - `orders` y `order_items` no tienen ninguna política, así que
--     son invisibles para cualquier cliente público.
--   - Los pedidos se crean únicamente con la función `create_order`,
--     que se invoca desde el servidor con la clave `service_role`.
-- ============================================================

DROP FUNCTION IF EXISTS create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP SEQUENCE IF EXISTS order_number_seq;

-- ============================================================
-- Tablas
-- ============================================================

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
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

CREATE INDEX order_items_order_id_idx ON order_items (order_id);
CREATE INDEX orders_created_at_idx    ON orders (created_at DESC);

-- Número de pedido correlativo: AK-001000, AK-001001, ...
-- Una secuencia nunca repite, a diferencia de un timestamp recortado.
CREATE SEQUENCE order_number_seq START 1000;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- El catálogo es público: cualquiera puede verlo, nadie puede modificarlo.
CREATE POLICY products_public_read ON products
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- `orders` y `order_items` quedan sin políticas a propósito: con RLS
-- activado eso significa cero acceso para los roles públicos. Solo
-- `service_role`, que salta RLS, puede tocarlos desde el servidor.

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

-- ============================================================
-- Datos iniciales
-- ============================================================
INSERT INTO products (name, category, price, description, image, stock) VALUES
('Kit de Uñas Acrílicas', 'unas', 450, 'Kit completo con polvo acrílico, líquido y tips para uñas profesionales.', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=600&q=80', 5),
('Esmalte en Gel Premium', 'unas', 180, 'Esmalte en gel de larga duración, tonos elegantes y brillo intenso.', 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?auto=format&fit=crop&w=600&q=80', 10),
('Set de Nail Art', 'unas', 320, 'Set de decoración para uñas: brillantina, stickers y herramientas.', 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=600&q=80', 8),
('Lámpara LED para Uñas', 'unas', 680, 'Lámpara LED UV para secado rápido de esmaltes en gel.', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=600&q=80', 3),
('Extensiones de Pestañas Clásicas', 'pestanas', 520, 'Kit de extensiones de pestañas para una mirada natural y elegante.', 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=600&q=80', 6),
('Pestañas Postizas Volumen', 'pestanas', 260, 'Pestañas postizas de volumen para ocasiones especiales.', 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=80', 12),
('Pegamento para Pestañas', 'pestanas', 150, 'Adhesivo profesional de secado rápido y larga duración.', 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=600&q=80', 15),
('Rizador de Pestañas', 'pestanas', 120, 'Rizador de pestañas ergonómico para una curva perfecta.', 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=80', 20),
('Kit de Cejas Profesional', 'cejas', 380, 'Kit completo con pinzas, cepillo y plantillas para diseño de cejas.', 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=600&q=80', 7),
('Lápiz para Cejas', 'cejas', 95, 'Lápiz de precisión para definir y rellenar cejas.', 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=600&q=80', 25),
('Gel Fijador de Cejas', 'cejas', 130, 'Gel transparente que fija y mantiene las cejas en su lugar.', 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=600&q=80', 18),
('Paleta de Sombras Doradas', 'maquillaje', 420, 'Paleta de sombras con tonos dorados y neutros para todo look.', 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=80', 9),
('Base de Maquillaje HD', 'maquillaje', 350, 'Base de cobertura media a alta con acabado natural.', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80', 11),
('Set de Brochas Profesional', 'maquillaje', 560, 'Set de brochas de alta calidad para maquillaje profesional.', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80', 4),
('Kit de Cuidado de Uñas', 'accesorios', 240, 'Kit con aceite de cutícula, lima y crema hidratante.', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=600&q=80', 14),
('Espejo de Belleza LED', 'accesorios', 480, 'Espejo con luz LED para un maquillaje perfecto.', 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=600&q=80', 0);
