-- ============================================================
-- 010 · Colores de producto
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Requiere: 002, 008
--
-- Idempotente.
--
-- Hay productos que se venden en varios colores: el Painting Gel viene en
-- nueve, los balines en dorado y plateado, el efecto espejo en varios. Hasta
-- acá el catálogo no lo sabía, así que la clienta compraba "Painting Gel" y el
-- color se acordaba por WhatsApp, que es exactamente el ida y vuelta que este
-- sitio existe para evitar.
--
-- LA DECISIÓN DE FONDO: cada color tiene su propia existencia.
--
-- La alternativa era guardar los colores como una lista y un stock único para
-- el producto. Es más fácil de cargar, pero rompe lo que sostiene todo lo
-- demás: si quedan tres rojos y ningún azul, un stock compartido de tres deja
-- vender el azul, y la dueña termina llamando a la clienta a proponerle otro.
-- La ADR-001 dice que las reglas que definen qué estados son válidos viven en
-- la base; vender un color agotado es un estado inválido.
--
-- CÓMO CONVIVE CON products.stock: para un producto con colores, su stock pasa
-- a ser la SUMA de los de sus colores, mantenida por un trigger. Así ninguna
-- consulta existente cambia —el catálogo, el carrito y el aviso de "agotado"
-- siguen leyendo products.stock— y no hay dos verdades que sincronizar a mano.
-- Un producto sin colores sigue funcionando exactamente como hasta hoy.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS product_colors (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL CHECK (char_length(TRIM(nombre)) BETWEEN 1 AND 40),
  hex        TEXT CHECK (hex IS NULL OR hex ~ '^#[0-9a-fA-F]{6}$'),
  stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Dos "Rojo" en el mismo producto no son dos cosas distintas, son un error
  -- de carga. Y la clienta no tendría forma de distinguirlos.
  UNIQUE (product_id, nombre)
);

COMMENT ON TABLE product_colors IS
  'Los colores en que se vende un producto, cada uno con su propia existencia.';
COMMENT ON COLUMN product_colors.hex IS
  'Opcional, para pintar la muestra en la tienda. Sin esto se muestra solo el nombre.';
COMMENT ON COLUMN product_colors.position IS
  'El orden en que los quiere mostrar la dueña. No alfabético.';

CREATE INDEX IF NOT EXISTS product_colors_product_id_idx
  ON product_colors (product_id, position);

-- ============================================================
-- El stock del producto es la suma de sus colores
-- ============================================================
-- Va en un trigger y no en la aplicación por lo de siempre: el stock de un
-- color también se edita desde el panel de Supabase, y una suma que dependiera
-- de que la ruta de API se acuerde quedaría desfasada sin que nadie lo note.
--
-- Al borrar el último color, la suma queda en cero: el producto vuelve a ser
-- de stock simple y la dueña escribe el número que corresponda.

CREATE OR REPLACE FUNCTION sumar_stock_de_colores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id INTEGER := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE products p
     SET stock = COALESCE((SELECT SUM(c.stock) FROM product_colors c WHERE c.product_id = p.id), 0)
   WHERE p.id = v_product_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS product_colors_sumar_stock ON product_colors;
CREATE TRIGGER product_colors_sumar_stock
  AFTER INSERT OR UPDATE OF stock, product_id OR DELETE ON product_colors
  FOR EACH ROW
  EXECUTE FUNCTION sumar_stock_de_colores();

-- Y el camino inverso: que nadie pise a mano el stock de un producto que tiene
-- colores. El panel manda el producto entero al guardarlo, incluido su stock,
-- y sin esto un simple cambio de precio dejaría el total desfasado de la suma
-- hasta el siguiente cambio de color. Acá no hay forma de equivocarse: si el
-- producto tiene colores, su stock es la suma y punto.

CREATE OR REPLACE FUNCTION fijar_stock_a_la_suma_de_colores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM product_colors WHERE product_id = NEW.id) THEN
    NEW.stock := COALESCE(
      (SELECT SUM(stock) FROM product_colors WHERE product_id = NEW.id), 0
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_stock_de_colores ON products;
CREATE TRIGGER products_stock_de_colores
  BEFORE UPDATE OF stock ON products
  FOR EACH ROW
  EXECUTE FUNCTION fijar_stock_a_la_suma_de_colores();

-- ============================================================
-- La línea del pedido recuerda qué color se vendió
-- ============================================================
-- Con su propia copia del nombre, por el mismo motivo que product_name: si la
-- dueña renombra "Rojo cereza" a "Rojo vino", el pedido de la semana pasada
-- tiene que seguir diciendo lo que la clienta compró.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS color_id INTEGER REFERENCES product_colors (id) ON DELETE SET NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS color_name TEXT;

COMMENT ON COLUMN order_items.color_name IS
  'Copia histórica: el color con que se vendió, aunque después se renombre o se quite.';

-- ============================================================
-- RLS
-- ============================================================
-- Igual que el catálogo: los colores son información pública, y escribirlos
-- requiere el servidor.

ALTER TABLE product_colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_colors_public_read ON product_colors;
CREATE POLICY product_colors_public_read ON product_colors
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON product_colors FROM anon, authenticated;

-- ============================================================
-- create_order, ahora con color
-- ============================================================
-- Cada elemento del carrito puede traer "color": el id de un product_colors.
-- Si el producto tiene colores, es obligatorio; si no los tiene, se ignora.

CREATE OR REPLACE FUNCTION create_order(
  p_customer_name    TEXT,
  p_customer_email   TEXT,
  p_customer_phone   TEXT,
  p_customer_address TEXT,
  p_payment_method   TEXT,
  p_items            JSONB,
  p_user_id          UUID DEFAULT NULL
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
  v_color        product_colors%ROWTYPE;
  v_tiene_colores BOOLEAN;
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
  -- Se agrupa por producto Y color: dos líneas del mismo esmalte en rojo son
  -- dos unidades del rojo, pero una en rojo y otra en azul son dos cosas
  -- distintas que hay que verificar por separado.
  FOR v_item IN
    SELECT (elem ->> 'id')::INTEGER       AS product_id,
           (elem ->> 'color')::INTEGER    AS color_id,
           SUM((elem ->> 'qty')::INTEGER) AS qty
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY 1, 2
    ORDER BY 1, 2
  LOOP
    IF v_item.product_id IS NULL OR v_item.qty IS NULL OR v_item.qty <= 0 THEN
      RAISE EXCEPTION 'La cantidad solicitada no es válida.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product FROM products WHERE id = v_item.product_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uno de los productos del carrito ya no está disponible.'
        USING ERRCODE = '22023';
    END IF;

    SELECT EXISTS (SELECT 1 FROM product_colors WHERE product_id = v_product.id)
      INTO v_tiene_colores;

    IF v_tiene_colores THEN
      IF v_item.color_id IS NULL THEN
        RAISE EXCEPTION 'Elegí un color de "%".', v_product.name USING ERRCODE = '22023';
      END IF;

      SELECT * INTO v_color
        FROM product_colors
       WHERE id = v_item.color_id AND product_id = v_product.id
         FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Ese color de "%" ya no está disponible.', v_product.name
          USING ERRCODE = '22023';
      END IF;

      IF v_color.stock < v_item.qty THEN
        RAISE EXCEPTION 'De "%" en % solo quedan % unidades.',
          v_product.name, v_color.nombre, v_color.stock USING ERRCODE = '22023';
      END IF;
    ELSE
      IF v_product.stock < v_item.qty THEN
        RAISE EXCEPTION 'No hay suficiente stock de "%". Solo quedan % unidades.',
          v_product.name, v_product.stock USING ERRCODE = '22023';
      END IF;
    END IF;

    v_total := v_total + (v_product.price * v_item.qty);
  END LOOP;

  -- ----- Paso 2: crear el pedido -----
  v_order_number := 'AK-' || LPAD(nextval('order_number_seq')::TEXT, 6, '0');

  INSERT INTO orders (
    order_number, customer_name, customer_email,
    customer_phone, customer_address, payment_method, total, user_id
  )
  VALUES (
    v_order_number, TRIM(p_customer_name), LOWER(TRIM(p_customer_email)),
    TRIM(p_customer_phone), TRIM(p_customer_address), p_payment_method, v_total, p_user_id
  )
  RETURNING id INTO v_order_id;

  -- ----- Paso 3: guardar las líneas y descontar el stock -----
  FOR v_item IN
    SELECT (elem ->> 'id')::INTEGER       AS product_id,
           (elem ->> 'color')::INTEGER    AS color_id,
           SUM((elem ->> 'qty')::INTEGER) AS qty
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY 1, 2
    ORDER BY 1, 2
  LOOP
    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, price, color_id, color_name
    )
    SELECT v_order_id, p.id, p.name, v_item.qty, p.price, c.id, c.nombre
      FROM products p
      LEFT JOIN product_colors c
        ON c.id = v_item.color_id AND c.product_id = p.id
     WHERE p.id = v_item.product_id;

    -- Al color, si lo hay: el trigger de la suma actualiza products.stock
    -- solo. Descontar los dos restaría dos veces.
    IF EXISTS (SELECT 1 FROM product_colors WHERE id = v_item.color_id
                 AND product_id = v_item.product_id) THEN
      UPDATE product_colors SET stock = stock - v_item.qty WHERE id = v_item.color_id;
    ELSE
      UPDATE products SET stock = stock - v_item.qty WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'id',             v_order_id,
    'order_number',   v_order_number,
    'customer_email', LOWER(TRIM(p_customer_email)),
    'total',          v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID)
  TO service_role;

-- ============================================================
-- Cancelar un pedido devuelve el stock al color que salió
-- ============================================================
-- La 008 devolvía todo a products.stock. Con colores eso romperia la suma:
-- el producto sumaría unidades que ningún color tiene.

CREATE OR REPLACE FUNCTION reponer_stock_al_cancelar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_faltante RECORD;
BEGIN
  -- Entra a cancelado: vuelve al catálogo lo que el pedido tenía reservado.
  -- Las líneas cuyo producto ya no existe traen product_id NULL y el JOIN las
  -- deja afuera solo: no hay a qué devolverle nada.
  IF NEW.status = 'cancelado' THEN
    UPDATE product_colors c
       SET stock = c.stock + oi.quantity
      FROM order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.color_id = c.id;

    UPDATE products p
       SET stock = p.stock + oi.quantity
      FROM order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.product_id = p.id
       AND oi.color_id IS NULL;

    RETURN NEW;
  END IF;

  -- Sale de cancelado: el pedido vuelve a estar vivo y hay que descontar otra
  -- vez. Se bloquean las filas antes de mirar el stock, igual que create_order:
  -- entre el SELECT y el UPDATE, otra compra podría llevarse la última unidad.
  IF OLD.status = 'cancelado' THEN
    PERFORM 1
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id
      ORDER BY p.id
        FOR UPDATE OF p;

    SELECT p.name AS nombre, c.nombre AS color, c.stock AS disponible
      INTO v_faltante
      FROM order_items oi
      JOIN product_colors c ON c.id = oi.color_id
      JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = NEW.id
       AND c.stock < oi.quantity
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'No se puede reabrir el pedido: de % en % solo quedan % unidades.',
        v_faltante.nombre, v_faltante.color, v_faltante.disponible
        USING ERRCODE = 'P0001';
    END IF;

    SELECT p.name AS nombre, p.stock AS disponible
      INTO v_faltante
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = NEW.id
       AND oi.color_id IS NULL
       AND p.stock < oi.quantity
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'No se puede reabrir el pedido: de % solo quedan % unidades.',
        v_faltante.nombre, v_faltante.disponible
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE product_colors c
       SET stock = c.stock - oi.quantity
      FROM order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.color_id = c.id;

    UPDATE products p
       SET stock = p.stock - oi.quantity
      FROM order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.product_id = p.id
       AND oi.color_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO schema_migraciones (version, nombre)
VALUES (10, 'colores_de_producto')
ON CONFLICT (version) DO NOTHING;

COMMIT;
