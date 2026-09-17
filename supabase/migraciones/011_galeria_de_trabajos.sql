-- ============================================================
-- 011 · Galería de trabajos
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Requiere: 000
--
-- Idempotente.
--
-- Lo que de verdad vende un salón son sus trabajos: las pestañas, el laminado
-- de cejas, las uñas. Hasta acá el sitio hablaba de los servicios con texto y
-- un icono, y las fotos vivían solo en Instagram, donde el algoritmo decide
-- quién las ve.
--
-- La galería la carga la dueña desde el panel, igual que las fotos de
-- producto. Es a propósito: publica trabajos cada semana, y una galería que
-- dependa de que alguien toque el código y despliegue es una galería que
-- envejece en un mes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS galeria (
  id         SERIAL PRIMARY KEY,
  imagen     TEXT NOT NULL CHECK (imagen ~ '^https?://'),
  titulo     TEXT CHECK (titulo IS NULL OR char_length(titulo) <= 80),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE galeria IS
  'Fotos de trabajos del salón, en el orden en que la dueña los quiere mostrar.';
COMMENT ON COLUMN galeria.titulo IS
  'Opcional. Es también el texto alternativo de la foto: sin él, la imagen no le dice nada a quien usa un lector de pantalla.';

-- La portada las pide siempre en orden, y son pocas.
CREATE INDEX IF NOT EXISTS galeria_position_idx ON galeria (position);

-- ============================================================
-- RLS
-- ============================================================
-- Igual que el catálogo: mirar es público, escribir es del servidor.

ALTER TABLE galeria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS galeria_public_read ON galeria;
CREATE POLICY galeria_public_read ON galeria
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON galeria FROM anon, authenticated;

-- ============================================================
-- El bucket de las fotos
-- ============================================================
-- Aparte del de productos: son cosas distintas, con límites distintos. Una
-- foto de trabajo puede ser más pesada que la de un frasco, y separarlas deja
-- borrar una sin mirar dos veces qué más hay adentro.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'galeria',
  'galeria',
  TRUE,
  3145728,                                            -- 3 MB, igual que lib/imagen.js
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Como en la 007: crear políticas sobre storage.objects exige ser dueño de esa
-- tabla, y según cómo esté el proyecto puede no estarlo. Si no se puede, el
-- bucket público igual funciona.
DO $$
BEGIN
  DROP POLICY IF EXISTS galeria_lectura_publica ON storage.objects;

  CREATE POLICY galeria_lectura_publica ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'galeria');
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin privilegios para crear la política sobre storage.objects: el bucket público alcanza.';
END;
$$;

INSERT INTO schema_migraciones (version, nombre)
VALUES (11, 'galeria_de_trabajos')
ON CONFLICT (version) DO NOTHING;

COMMIT;
