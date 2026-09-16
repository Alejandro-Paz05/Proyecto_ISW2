-- ============================================================
-- 006 · Retroalimentación y tickets
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- Requiere: 000, 005
--
-- Idempotente.
--
-- Dos formas de enterarse de que algo anda mal, que terminan en la misma
-- lista:
--
--   - Un error que el sistema captura solo, en el navegador o en la API,
--     abre un ticket automático. Si se repite, el ticket suma ocurrencias en
--     vez de duplicarse: cien visitas a una página rota son un problema, no
--     cien.
--   - Una clienta que reporta un problema desde la tienda deja su mensaje, y
--     eso abre un ticket de origen "cliente" enlazado a lo que escribió.
--
-- Hasta acá los errores quedaban dispersos en los logs de Vercel y los
-- reclamos, en el WhatsApp de la dueña. Ninguno de los dos lugares permite
-- corregir en orden ni saber qué se arregló.
-- ============================================================

BEGIN;

-- ============================================================
-- tickets
-- ============================================================

CREATE TABLE IF NOT EXISTS tickets (
  id            SERIAL PRIMARY KEY,
  source        TEXT NOT NULL CHECK (source IN ('automatico', 'cliente', 'interno')),
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  detail        TEXT,
  severity      TEXT NOT NULL DEFAULT 'media'
                  CHECK (severity IN ('baja', 'media', 'alta', 'critica')),
  status        TEXT NOT NULL DEFAULT 'abierto'
                  CHECK (status IN ('abierto', 'en_progreso', 'resuelto', 'descartado')),
  fingerprint   TEXT,
  occurrences   INTEGER NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context       JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution    TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tickets IS
  'Problemas por corregir: los que el sistema captura solo y los que reportan las clientas.';
COMMENT ON COLUMN tickets.fingerprint IS
  'Huella del error: lo que hace que dos ocurrencias sean el mismo problema. NULL en los tickets que no vienen de un error capturado.';
COMMENT ON COLUMN tickets.context IS
  'Datos de la última ocurrencia: ruta, pila de llamadas, navegador. Nunca datos personales.';

-- Un solo ticket abierto por huella. Es lo que convierte cien ocurrencias en
-- un ticket con cien ocurrencias. Parcial a propósito: sobre los tickets
-- resueltos no rige, así que si el mismo error vuelve después de corregido,
-- abre uno nuevo. Eso es una regresión, y tiene que verse como tal en vez de
-- sumarse en silencio a un ticket ya cerrado.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_una_huella_abierta_idx
  ON tickets (fingerprint)
  WHERE fingerprint IS NOT NULL AND status IN ('abierto', 'en_progreso');

-- El portal lista por estado, con lo más reciente arriba.
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status, last_seen_at DESC);

-- La fecha de resolución la pone la base: si dependiera de que la ruta de API
-- se acuerde, cambiar el estado desde el panel de Supabase dejaría un ticket
-- resuelto sin fecha. Reabrir o descartar la borra.
CREATE OR REPLACE FUNCTION fechar_resolucion_de_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'resuelto' THEN
    -- Editar la nota de un ticket ya resuelto no le cambia la fecha.
    NEW.resolved_at := CASE WHEN OLD.status = 'resuelto' THEN OLD.resolved_at ELSE NOW() END;
  ELSE
    NEW.resolved_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_fechar_resolucion ON tickets;
CREATE TRIGGER tickets_fechar_resolucion
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION fechar_resolucion_de_ticket();

-- ============================================================
-- registrar_error
-- ============================================================
-- La única vía para abrir un ticket automático. Inserta o suma en una sola
-- sentencia: dos ocurrencias simultáneas del mismo error no pueden abrir dos
-- tickets, porque el índice único decide cuál gana y la otra se convierte en
-- la actualización.
--
-- Si el ticket abierto con esa huella se reabre a mano mientras ya existe
-- otro abierto, el índice rechaza el cambio. Es lo correcto: serían dos
-- tickets abiertos del mismo problema.

CREATE OR REPLACE FUNCTION registrar_error(
  p_fingerprint TEXT,
  p_title       TEXT,
  p_detail      TEXT,
  p_context     JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id INTEGER;
BEGIN
  IF COALESCE(TRIM(p_fingerprint), '') = '' THEN
    RAISE EXCEPTION 'Falta la huella del error.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO tickets (source, title, detail, fingerprint, context)
  VALUES (
    'automatico',
    LEFT(COALESCE(NULLIF(TRIM(p_title), ''), 'Error sin mensaje'), 200),
    LEFT(p_detail, 10000),
    p_fingerprint,
    COALESCE(p_context, '{}'::jsonb)
  )
  ON CONFLICT (fingerprint)
    WHERE fingerprint IS NOT NULL AND status IN ('abierto', 'en_progreso')
  DO UPDATE SET
    occurrences  = tickets.occurrences + 1,
    last_seen_at = NOW(),
    context      = EXCLUDED.context
  RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$$;

-- Solo el servidor registra errores: la ruta /api/errores filtra, recorta y
-- limita lo que llega del navegador antes de llamar a esta función.
REVOKE ALL ON FUNCTION registrar_error(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_error(TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ============================================================
-- feedback
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id            SERIAL PRIMARY KEY,
  user_id       UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('sugerencia', 'problema', 'elogio')),
  message       TEXT NOT NULL CHECK (char_length(message) BETWEEN 5 AND 2000),
  contact_email TEXT
                  CHECK (contact_email IS NULL
                         OR contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  page          TEXT CHECK (page IS NULL OR char_length(page) <= 300),
  status        TEXT NOT NULL DEFAULT 'nueva'
                  CHECK (status IN ('nueva', 'leida', 'archivada')),
  ticket_id     INTEGER REFERENCES tickets (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE feedback IS
  'Lo que las clientas dejan desde la tienda. Con cuenta o como invitadas.';
COMMENT ON COLUMN feedback.contact_email IS
  'Opcional: para responderle a una invitada que quiere respuesta. Con cuenta no hace falta.';

CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_user_id_idx ON feedback (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS feedback_ticket_id_idx ON feedback (ticket_id) WHERE ticket_id IS NOT NULL;

-- Un problema reportado abre su ticket en la misma transacción que guarda el
-- mensaje. Si viviera en la aplicación, un reporte cargado por otro camino
-- quedaría sin ticket, y el ticket es lo que asegura que alguien lo corrija.
--
-- El ticket no copia el correo ni la cuenta: se llega a ellos por
-- feedback.ticket_id. Duplicar datos personales en otra tabla es duplicar
-- también lo que hay que proteger.
CREATE OR REPLACE FUNCTION abrir_ticket_por_problema()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id INTEGER;
  v_titulo    TEXT;
BEGIN
  IF NEW.kind = 'problema' AND NEW.ticket_id IS NULL THEN
    v_titulo := LEFT(split_part(btrim(NEW.message, E' \n\r\t'), E'\n', 1), 120);

    INSERT INTO tickets (source, title, detail, context)
    VALUES (
      'cliente',
      COALESCE(NULLIF(v_titulo, ''), 'Problema reportado por una clienta'),
      NEW.message,
      jsonb_strip_nulls(jsonb_build_object('pagina', NEW.page))
    )
    RETURNING id INTO v_ticket_id;

    NEW.ticket_id := v_ticket_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_abrir_ticket ON feedback;
CREATE TRIGGER feedback_abrir_ticket
  BEFORE INSERT ON feedback
  FOR EACH ROW
  EXECUTE FUNCTION abrir_ticket_por_problema();

-- ============================================================
-- Row Level Security
-- ============================================================
-- Sin políticas de escritura: la retroalimentación entra por /api/feedback,
-- que limita cuántos mensajes acepta, y los tickets los abre la base o el
-- portal desde el servidor.

ALTER TABLE tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Los tickets son trabajo técnico: los ven quien corrige y quien revisa. La
-- dueña no los necesita; lo que le importa, el reclamo de la clienta, lo ve
-- en la retroalimentación.
DROP POLICY IF EXISTS tickets_leer_admin ON tickets;
CREATE POLICY tickets_leer_admin ON tickets
  FOR SELECT TO authenticated
  USING ((SELECT rol_actual()) IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS feedback_leer_la_propia ON feedback;
CREATE POLICY feedback_leer_la_propia ON feedback
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS feedback_leer_toda_el_equipo ON feedback;
CREATE POLICY feedback_leer_toda_el_equipo ON feedback
  FOR SELECT TO authenticated
  USING ((SELECT rol_actual()) IN ('duena', 'admin', 'super_admin'));

-- ============================================================
-- El primer ticket: un bug real, ya resuelto
-- ============================================================
-- Lo encontró la prueba E2E del checkout el 2026-09-12. Queda registrado con
-- su corrección, como ejemplo de lo que tiene que tener un ticket cerrado.

INSERT INTO tickets (
  source, title, detail, severity, status, fingerprint, context,
  resolution, first_seen_at, last_seen_at, resolved_at, created_at
)
SELECT
  'interno',
  'El botón flotante de WhatsApp tapaba "Realizar Pedido" en el carrito',
  'El botón de WhatsApp estaba en z-index 2500 y el carrito abre en 2000 y 2001. Como comparten '
    || 'la esquina inferior derecha, el botón cubría el centro de "Realizar Pedido", que es donde '
    || 'cae el clic: quien iba a pagar terminaba abriendo WhatsApp.',
  'alta',
  'resuelto',
  'e2e:whatsapp-tapa-realizar-pedido',
  '{"detectado_por": "e2e/checkout.spec.js"}'::jsonb,
  'z-index bajado a 1900 en styles/whatsapp.css (commit 00dd602): por encima de la página y por '
    || 'debajo de cualquier capa que la atenúe. La prueba E2E del checkout impide que vuelva.',
  '2026-09-12T08:00:00Z',
  '2026-09-12T08:00:00Z',
  '2026-09-12T08:10:00Z',
  '2026-09-12T08:00:00Z'
WHERE NOT EXISTS (
  SELECT 1 FROM tickets WHERE fingerprint = 'e2e:whatsapp-tapa-realizar-pedido'
);

INSERT INTO schema_migraciones (version, nombre)
VALUES (6, 'retroalimentacion_y_tickets')
ON CONFLICT (version) DO NOTHING;

COMMIT;
