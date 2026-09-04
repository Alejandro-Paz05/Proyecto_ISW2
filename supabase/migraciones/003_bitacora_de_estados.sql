-- ============================================================
-- 003 · Bitácora de estados de los pedidos
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Requiere: 000, 002
--
-- Idempotente. El relleno inicial solo alcanza a los pedidos que todavía
-- no tienen ninguna entrada, así que correr el archivo dos veces no
-- duplica la bitácora de nadie.
--
-- `orders` guardaba solo el estado actual. No había forma de saber cuándo
-- se confirmó ni cuándo se entregó, que es justo lo que se pregunta
-- cuando una clienta reclama.
-- ============================================================

BEGIN;

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

-- El panel siempre pregunta lo mismo: la bitácora de UN pedido, del cambio
-- más reciente al más viejo. El índice compuesto cubre la consulta entera.
CREATE INDEX IF NOT EXISTS order_status_history_order_idx
  ON order_status_history (order_id, changed_at DESC);

-- La escribe la base y no la aplicación. Si dependiera de que la ruta de
-- API se acuerde de insertar la fila, bastaría con cambiar el estado desde
-- el panel de Supabase para perder el registro.
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
  -- IS DISTINCT FROM y no <>: un UPDATE que deja el mismo valor no es un
  -- cambio de estado y no tiene por qué ensuciar la bitácora.
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

-- Los pedidos que ya existían nacen con una sola entrada: su estado
-- actual, fechada cuando se creó el pedido. No se inventa una transición
-- que nadie registró; solo se deja constancia del punto de partida.
INSERT INTO order_status_history (order_id, status, note, changed_at)
SELECT o.id, o.status, 'Estado al crearse la bitácora', o.created_at
  FROM orders o
 WHERE NOT EXISTS (
   SELECT 1 FROM order_status_history h WHERE h.order_id = o.id
 );

-- Está atada a pedidos, que tampoco son públicos: RLS activo y sin
-- políticas significa acceso público cero.
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migraciones (version, nombre)
VALUES (3, 'bitacora_de_estados')
ON CONFLICT (version) DO NOTHING;

COMMIT;
