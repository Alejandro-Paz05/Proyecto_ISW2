-- ============================================================
-- AKARI STUDIO — Eliminar la agenda de citas
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
--
-- Deshace lo que crearon `citas.sql` y `citas-v2.sql`. Desde que las
-- citas se piden por WhatsApp, esas tablas no se leen ni se escriben
-- desde ninguna parte del sitio.
--
-- NO toca products, orders ni order_items: la tienda sigue igual.
--
-- ATENCIÓN: si llegaron a registrarse citas reales, esto las borra.
-- Para conservarlas, ejecutar antes:
--
--   SELECT a.reference, a.customer_name, a.customer_phone,
--          a.starts_at, a.total,
--          STRING_AGG(s.service_name, ', ') AS servicios
--   FROM appointments a
--   LEFT JOIN appointment_services s ON s.appointment_id = a.id
--   GROUP BY a.id
--   ORDER BY a.starts_at;
--
-- y guardar el resultado con el botón de exportar del SQL Editor.
-- ============================================================

-- Las funciones primero: dependen de las tablas.
DROP FUNCTION IF EXISTS create_appointment(INTEGER[], INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS create_appointment(INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);

-- CASCADE se lleva por delante la restricción de exclusión y las claves
-- foráneas de appointment_services.
DROP TABLE IF EXISTS appointment_services CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS blocked_dates CASCADE;
DROP TABLE IF EXISTS business_hours CASCADE;
DROP TABLE IF EXISTS services CASCADE;

DROP SEQUENCE IF EXISTS appointment_reference_seq;

-- ============================================================
-- Comprobación
-- ============================================================
-- Debe devolver: 0 tablas de citas, y los productos y pedidos intactos.
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('services', 'appointments', 'appointment_services',
                          'business_hours', 'blocked_dates'))        AS tablas_de_citas,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'create_appointment') AS funcion_citas,
  (SELECT COUNT(*) FROM products)                                     AS productos,
  (SELECT COUNT(*) FROM orders)                                       AS pedidos,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'create_order')        AS funcion_pedidos;
