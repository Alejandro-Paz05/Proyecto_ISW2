-- ============================================================
-- 008 · Reponer el stock al cancelar un pedido
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Requiere: 002
--
-- Idempotente.
--
-- Hasta acá, products.stock solo sabía restarse: lo descuenta create_order y
-- nadie lo devolvía nunca. Cancelar un pedido de tres kits dejaba esos tres
-- kits descontados para siempre, así que la tienda mostraba "Agotado" con el
-- producto en la mano de la dueña, y ella no tenía manera de saber por qué.
--
-- Va en un trigger y no en la ruta de API por el mismo motivo que la bitácora
-- de estados: el estado de un pedido también se cambia desde el panel de
-- Supabase, y una regla que vive en la aplicación se saltea por cualquier otro
-- camino. Acá no hay forma de cancelar sin devolver el inventario.
--
-- El movimiento inverso también existe: si un pedido cancelado se reabre, el
-- inventario se vuelve a descontar. Puede no alcanzar —mientras estuvo
-- cancelado alguien más compró—, y entonces no se puede reabrir. Es correcto:
-- lo contrario sería prometer una unidad que no existe.
-- ============================================================

BEGIN;

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
    UPDATE products p
       SET stock = p.stock + oi.quantity
      FROM order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.product_id = p.id;

    RETURN NEW;
  END IF;

  -- Sale de cancelado: el pedido vuelve a estar vivo y hay que descontar otra
  -- vez. Se bloquean las filas antes de mirar el stock, igual que create_order:
  -- entre el SELECT y el UPDATE, otra compra podría llevarse la última unidad.
  IF OLD.status = 'cancelado' THEN
    -- PERFORM y no SELECT ... INTO: con INTO, PL/pgSQL trae solo la primera
    -- fila y bloquearía un solo producto. Ordenado por id, como create_order,
    -- para que dos operaciones sobre los mismos productos no se abracen.
    PERFORM 1
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id
      ORDER BY p.id
        FOR UPDATE OF p;

    SELECT p.name AS nombre, p.stock AS disponible
      INTO v_faltante
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = NEW.id
       AND p.stock < oi.quantity
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'No se puede reabrir el pedido: de % solo quedan % unidades.',
        v_faltante.nombre, v_faltante.disponible
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE products p
       SET stock = p.stock - oi.quantity
      FROM order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.product_id = p.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION reponer_stock_al_cancelar() IS
  'Devuelve el inventario de un pedido cancelado, y lo vuelve a descontar si se reabre.';

-- WHEN filtra en la base: un UPDATE que deja el mismo estado no dispara nada,
-- así que guardar un pedido sin tocarle el estado no mueve el inventario.
DROP TRIGGER IF EXISTS orders_reponer_stock ON orders;
CREATE TRIGGER orders_reponer_stock
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION reponer_stock_al_cancelar();

INSERT INTO schema_migraciones (version, nombre)
VALUES (8, 'reponer_stock_al_cancelar')
ON CONFLICT (version) DO NOTHING;

COMMIT;
