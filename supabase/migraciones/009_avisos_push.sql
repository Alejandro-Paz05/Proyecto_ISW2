-- ============================================================
-- 009 · Avisos push del panel
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Requiere: 005
--
-- Idempotente.
--
-- Hasta acá nadie le avisaba a la dueña que había entrado un pedido: se
-- enteraba si abría el panel. Un pedido podía quedar sin ver toda la noche, y
-- en un negocio que compite con responder por WhatsApp eso es la diferencia
-- entre la venta y el "ya no, gracias".
--
-- Cada fila es un navegador concreto que aceptó recibir avisos: el teléfono de
-- la dueña, su computadora, el teléfono del administrador. Una misma cuenta
-- puede tener varias, y por eso la clave no es la cuenta sino el endpoint que
-- devuelve el navegador.
--
-- Lo que se guarda son las tres cosas que pide el estándar de Web Push: a
-- dónde mandar el aviso y las dos claves con las que se cifra el contenido
-- para ese destinatario. Ni el servidor de Google ni el de Apple pueden leer
-- lo que va adentro.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS suscripciones_push (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  navegador   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

COMMENT ON TABLE suscripciones_push IS
  'Un navegador que aceptó recibir avisos de pedidos nuevos. Solo del personal.';
COMMENT ON COLUMN suscripciones_push.endpoint IS
  'La dirección que da el navegador. Es única: reinstalar la app genera una nueva y la vieja se descarta al primer envío fallido.';
COMMENT ON COLUMN suscripciones_push.navegador IS
  'Para que la dueña reconozca cuál de sus dispositivos es cuando quiera darlo de baja.';

-- El envío recorre las suscripciones del personal en cada pedido, así que la
-- consulta es por cuenta.
CREATE INDEX IF NOT EXISTS suscripciones_push_user_id_idx
  ON suscripciones_push (user_id);

-- ============================================================
-- RLS
-- ============================================================
-- Sin ninguna política: acceso público cero. Las suscripciones las escribe y
-- las lee el servidor con la clave secreta, igual que los pedidos. Que el
-- navegador pudiera listarlas no le serviría de nada y expondría a qué
-- dispositivos le llegan los avisos del negocio.

ALTER TABLE suscripciones_push ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON suscripciones_push FROM anon, authenticated;
REVOKE ALL ON SEQUENCE suscripciones_push_id_seq FROM anon, authenticated;

INSERT INTO schema_migraciones (version, nombre)
VALUES (9, 'avisos_push')
ON CONFLICT (version) DO NOTHING;

COMMIT;
