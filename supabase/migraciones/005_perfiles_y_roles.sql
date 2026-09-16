-- ============================================================
-- 005 · Perfiles, roles y RLS por usuario
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Requiere: 000, 001, 002, 003
--
-- Idempotente, como todas: sobre una base que ya la tiene no cambia nada.
--
-- Hasta acá el sistema no tenía usuarios. El panel se abría con una sola
-- contraseña compartida y la tienda solo vendía a invitadas. Esta migración
-- agrega un perfil y un rol a cada cuenta de Supabase Auth, y le da a RLS un
-- papel que antes no tenía: desde que la clave publicable viaja en el
-- navegador para iniciar sesión (ADR-004), cualquier consulta directa a la
-- base la filtran estas políticas. Dejan de ser la segunda barrera.
--
-- Los datos se siguen leyendo y escribiendo desde el servidor con la clave
-- secreta, que salta RLS. Por eso ninguna tabla tiene políticas de escritura:
-- sin política, RLS niega, y escribir sigue exigiendo pasar por la API.
-- ============================================================

BEGIN;

-- ============================================================
-- profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name  TEXT,
  role       TEXT NOT NULL DEFAULT 'clienta'
               CHECK (role IN ('clienta', 'duena', 'admin', 'super_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS
  'Un perfil por cuenta de Supabase Auth, con su rol. Lo crea un trigger, nunca la aplicación.';
COMMENT ON COLUMN profiles.role IS
  'clienta: compra y ve sus pedidos. duena: gestiona la tienda. admin: todo, más tickets y usuarios. super_admin: ve todo y no escribe nada.';

-- Cada cuenta nace clienta. El rol lo sube un admin desde el servidor, nunca
-- la propia cuenta: si el registro pudiera elegir su rol, cualquiera se daría
-- de alta como admin.
--
-- El nombre sale de los metadatos del registro. Google lo manda como
-- full_name y a veces solo como name; el registro con correo, como full_name.
CREATE OR REPLACE FUNCTION crear_perfil_de_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_usuario_creado ON auth.users;
CREATE TRIGGER auth_usuario_creado
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION crear_perfil_de_usuario();

-- Las cuentas que existieran antes del trigger reciben su perfil ahora.
INSERT INTO profiles (id, full_name)
SELECT u.id, COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- rol_actual()
-- ============================================================
-- Las políticas necesitan saber el rol de quien consulta. Si lo leyeran de
-- profiles directamente, la política de profiles se consultaría a sí misma y
-- Postgres cortaría con recursión infinita. SECURITY DEFINER lee la tabla sin
-- pasar por RLS.
--
-- STABLE le promete al planificador que el resultado no cambia dentro de una
-- consulta. Las políticas la llaman envuelta en (SELECT ...), que la evalúa
-- una sola vez por consulta en vez de una vez por fila.

CREATE OR REPLACE FUNCTION rol_actual()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION rol_actual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rol_actual() TO anon, authenticated, service_role;

-- ============================================================
-- RLS de profiles
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_leer_el_propio ON profiles;
CREATE POLICY profiles_leer_el_propio ON profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

-- El super_admin también ve las cuentas: está para revisar el sistema entero.
DROP POLICY IF EXISTS profiles_leer_todos_admin ON profiles;
CREATE POLICY profiles_leer_todos_admin ON profiles
  FOR SELECT TO authenticated
  USING ((SELECT rol_actual()) IN ('admin', 'super_admin'));

-- Cada cuenta puede corregir su nombre y nada más. La política deja pasar la
-- fila propia; el privilegio de columna de abajo impide que en esa fila se
-- toque el rol. Hacen falta las dos cosas: la política sola dejaría cambiar
-- cualquier columna.
DROP POLICY IF EXISTS profiles_editar_el_nombre_propio ON profiles;
CREATE POLICY profiles_editar_el_nombre_propio ON profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Supabase le da todos los privilegios sobre las tablas públicas a anon y a
-- authenticated. Acá se recortan: los perfiles los crea el trigger, y de las
-- columnas solo se edita el nombre.
REVOKE INSERT, UPDATE, DELETE ON profiles FROM anon, authenticated;
GRANT UPDATE (full_name) ON profiles TO authenticated;

-- ============================================================
-- Pedidos de cada cuenta
-- ============================================================

-- NULL en los pedidos de invitada, que siguen siendo la forma normal de
-- comprar. Borrar una cuenta no borra lo que compró: la venta existió.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN orders.user_id IS
  'La cuenta que hizo el pedido. NULL si se compró como invitada.';

-- Parcial: la mayoría de los pedidos son de invitadas y no tiene sentido
-- indexar sus NULL. Cubre "mis pedidos", la única consulta que filtra por
-- esta columna.
CREATE INDEX IF NOT EXISTS orders_user_id_idx
  ON orders (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- create_order recibe la cuenta, ya verificada por el servidor.
--
-- Cambia la lista de parámetros, y CREATE OR REPLACE no puede hacer eso: hay
-- que borrar la versión de seis y crear la de siete. p_user_id tiene DEFAULT
-- NULL, así que el código ya desplegado, que llama con seis parámetros con
-- nombre, sigue funcionando durante la transición.
--
-- Si alguien volviera a correr la 002 después de esta, recrearía la versión
-- de seis como una sobrecarga. No rompe nada, porque la aplicación siempre
-- manda p_user_id y eso elige la de siete sin ambigüedad.
DROP FUNCTION IF EXISTS create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

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
    customer_phone, customer_address, payment_method, total, user_id
  )
  VALUES (
    v_order_number, TRIM(p_customer_name), LOWER(TRIM(p_customer_email)),
    TRIM(p_customer_phone), TRIM(p_customer_address), p_payment_method, v_total, p_user_id
  )
  RETURNING id INTO v_order_id;

  -- ----- Paso 3: guardar las líneas y descontar el stock -----
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

REVOKE ALL ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID)
  TO service_role;

-- ============================================================
-- RLS de los pedidos
-- ============================================================
-- Hasta acá, orders no tenía ninguna política: acceso público cero. Sigue
-- siendo cero para anon. Lo que se agrega es lectura para quien tiene cuenta.

DROP POLICY IF EXISTS orders_leer_los_propios ON orders;
CREATE POLICY orders_leer_los_propios ON orders
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS orders_leer_todos_el_equipo ON orders;
CREATE POLICY orders_leer_todos_el_equipo ON orders
  FOR SELECT TO authenticated
  USING ((SELECT rol_actual()) IN ('duena', 'admin', 'super_admin'));

-- Las líneas y la bitácora se ven si se ve su pedido. La subconsulta sobre
-- orders pasa a su vez por las políticas de orders, así que la regla vive en
-- un solo lugar: no hay que repetir acá quién puede ver qué pedido.
DROP POLICY IF EXISTS order_items_leer_si_se_ve_el_pedido ON order_items;
CREATE POLICY order_items_leer_si_se_ve_el_pedido ON order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id));

DROP POLICY IF EXISTS order_status_history_leer_si_se_ve_el_pedido ON order_status_history;
CREATE POLICY order_status_history_leer_si_se_ve_el_pedido ON order_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_status_history.order_id));

INSERT INTO schema_migraciones (version, nombre)
VALUES (5, 'perfiles_y_roles')
ON CONFLICT (version) DO NOTHING;

COMMIT;
