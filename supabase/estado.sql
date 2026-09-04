-- ============================================================
-- Estado de la base
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
--
-- Solo lee. No modifica nada, así que se puede correr en producción
-- cuantas veces haga falta.
--
-- Responde las cuatro preguntas que uno se hace antes de tocar una base
-- que no vio en un mes: qué migraciones están aplicadas, qué tablas hay y
-- cuántas filas tienen, qué protege el acceso, y qué automatismos corren
-- solos.
-- ============================================================

-- ----- 1. Migraciones aplicadas -----
SELECT 'migraciones' AS bloque,
       version::TEXT  AS clave,
       nombre         AS detalle,
       aplicada_en::TEXT AS extra
  FROM schema_migraciones

UNION ALL

-- ----- 2. Tablas, con su conteo real de filas -----
-- n_live_tup es una estimación del planificador y puede quedar vieja; se
-- usa igual porque un COUNT(*) por tabla sobre una base grande es caro y
-- acá solo interesa el orden de magnitud.
SELECT 'tablas',
       relname,
       n_live_tup::TEXT || ' filas',
       CASE WHEN relrowsecurity THEN 'RLS activo' ELSE 'RLS APAGADO' END
  FROM pg_stat_user_tables
  JOIN pg_class ON pg_class.oid = pg_stat_user_tables.relid
 WHERE schemaname = 'public'

UNION ALL

-- ----- 3. Políticas de acceso -----
SELECT 'politicas', tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public'

UNION ALL

-- ----- 4. Triggers y funciones -----
SELECT 'triggers',
       c.relname,
       t.tgname,
       p.proname || '()'
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE NOT t.tgisinternal
   AND n.nspname = 'public'

ORDER BY bloque, clave;
