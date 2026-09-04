-- ============================================================
-- 000 · Registro de migraciones
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Orden: es la PRIMERA. Todas las demás la necesitan.
--
-- Guarda qué migraciones se aplicaron y cuándo. Sin esta tabla, saber en
-- qué estado está una base es abrirla y mirar tabla por tabla, que es
-- exactamente como se llegó a tener archivos que ya no coincidían con la
-- realidad.
--
-- Cada migración se anota a sí misma al final, con ON CONFLICT DO NOTHING.
-- Eso hace que volver a correrla sea un no-op de verdad y no una promesa:
-- todas las sentencias de este proyecto usan IF NOT EXISTS, OR REPLACE o
-- una guarda explícita.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migraciones (
  version     INTEGER PRIMARY KEY,
  nombre      TEXT NOT NULL,
  aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE schema_migraciones IS
  'Qué migraciones de supabase/migraciones/ se aplicaron a esta base.';

-- No es información pública. Sin políticas y con RLS activo el acceso
-- desde `anon` es cero; `service_role` salta RLS y la sigue viendo.
ALTER TABLE schema_migraciones ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migraciones (version, nombre)
VALUES (0, 'registro_de_migraciones')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Qué hay aplicado hasta ahora.
SELECT version, nombre, aplicada_en
  FROM schema_migraciones
 ORDER BY version;
