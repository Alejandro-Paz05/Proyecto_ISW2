-- ============================================================
-- 007 · Imágenes de productos
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Requiere: 000
--
-- Idempotente.
--
-- Hasta acá la foto de un producto era una dirección que había que conseguir
-- en otro lado: subirla a algún sitio y pegar el enlace. Eso deja el catálogo
-- atado a un servidor ajeno —el día que esa página se cae, o cambia la
-- dirección, el producto queda sin foto— y obliga a la dueña a saber qué es
-- una URL para cargar un esmalte.
--
-- Este bucket guarda las fotos con el resto del proyecto. Lo escribe solo el
-- servidor, por /api/admin/products/imagen, con la clave secreta; el bucket es
-- público de lectura porque una foto de catálogo es exactamente eso.
--
-- Los límites de peso y de tipo se declaran acá además de en la ruta de API.
-- Si alguna vez se sube por otro camino, el límite sigue rigiendo: es el mismo
-- criterio que el resto del proyecto, donde las reglas viven en la base.
-- ============================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'productos',
  'productos',
  TRUE,
  3145728,                                            -- 3 MB, igual que lib/imagen.js
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- La lectura pública ya la da el bucket público; esta política es para que el
-- acceso quede declarado en el mismo lugar que el de las tablas, y para que
-- valga también al listar por la API.
--
-- No hay política de INSERT, UPDATE ni DELETE: escribir es de service_role,
-- que salta RLS. Es la misma decisión que en products, donde el catálogo se
-- lee público y se escribe solo desde el servidor.
--
-- Va en un bloque con captura de excepción porque crear políticas sobre
-- storage.objects requiere ser dueño de esa tabla, y según cómo esté el
-- proyecto puede no estarlo. Si no se puede, el bucket público igual funciona
-- y la migración no se cae por eso.
DO $$
BEGIN
  DROP POLICY IF EXISTS imagenes_de_productos_lectura_publica ON storage.objects;

  CREATE POLICY imagenes_de_productos_lectura_publica ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'productos');
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin privilegios para crear la política sobre storage.objects: el bucket público alcanza.';
END;
$$;

INSERT INTO schema_migraciones (version, nombre)
VALUES (7, 'imagenes_de_productos')
ON CONFLICT (version) DO NOTHING;

COMMIT;
