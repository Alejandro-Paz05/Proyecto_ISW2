-- ============================================================
-- AKARI STUDIO — Agenda de citas
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
--
-- Este script es ADITIVO: solo agrega tablas nuevas. No toca
-- products, orders ni order_items, así que se puede ejecutar sobre
-- una base con datos reales sin perder nada.
--
-- Es idempotente: ejecutarlo dos veces no duplica servicios ni
-- horarios. Sirve tanto para montar la agenda por primera vez como
-- para reinstalar la función después de cambiarla.
--
-- Modelo: el salón atiende de a una clienta por vez, así que la
-- agenda es una sola línea de tiempo. Que dos citas no se solapen no
-- lo controla el código sino la base, con una restricción de
-- exclusión: por más peticiones simultáneas que lleguen, Postgres
-- rechaza cualquier cita que pise a otra.
-- ============================================================

-- ============================================================
-- Servicios que se pueden reservar
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT,
  -- La duración decide qué franjas se le ofrecen a la clienta: solo
  -- aquellas donde el servicio entra completo antes de cerrar.
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  price            NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Horario de atención, por día de la semana
-- ============================================================
-- weekday sigue la convención de EXTRACT(DOW): 0 = domingo.
CREATE TABLE IF NOT EXISTS business_hours (
  weekday   SMALLINT PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  opens_at  TIME NOT NULL,
  closes_at TIME NOT NULL,
  closed    BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (closes_at > opens_at)
);

-- ============================================================
-- Días sin atención: feriados, vacaciones, cierres puntuales
-- ============================================================
CREATE TABLE IF NOT EXISTS blocked_dates (
  day    DATE PRIMARY KEY,
  reason TEXT
);

-- ============================================================
-- Citas
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS appointment_reference_seq START 1000;

CREATE TABLE IF NOT EXISTS appointments (
  id               SERIAL PRIMARY KEY,
  reference        TEXT UNIQUE NOT NULL,
  -- Si se elimina un servicio del catálogo, las citas ya tomadas
  -- conservan su nombre y su duración: son un registro histórico.
  service_id       INTEGER REFERENCES services(id) ON DELETE SET NULL,
  service_name     TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  customer_name    TEXT NOT NULL,
  customer_email   TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  notes            TEXT,
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (status IN ('pendiente', 'confirmada', 'completada', 'cancelada', 'ausente')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS appointments_starts_at_idx ON appointments (starts_at);

-- La regla central del sistema, y vive en la base.
-- Dos citas no pueden compartir ni un minuto, salvo que una esté
-- cancelada: un horario cancelado vuelve a quedar libre.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS citas_sin_solapamiento;
ALTER TABLE appointments
  ADD CONSTRAINT citas_sin_solapamiento
  EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelada');

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE services       ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments   ENABLE ROW LEVEL SECURITY;

-- Los servicios y el horario de atención son información pública,
-- igual que el catálogo de productos.
DROP POLICY IF EXISTS services_public_read ON services;
CREATE POLICY services_public_read ON services
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS business_hours_public_read ON business_hours;
CREATE POLICY business_hours_public_read ON business_hours
  FOR SELECT TO anon, authenticated USING (true);

-- `appointments` y `blocked_dates` quedan sin políticas: con RLS
-- activo eso significa cero acceso público. Las citas guardan datos
-- personales de las clientas y no se consultan desde el navegador.

-- ============================================================
-- Reserva de una cita
-- ============================================================
-- Valida los datos, comprueba que el horario esté dentro de la
-- atención del salón y que el servicio entre completo, y deja que la
-- restricción de exclusión resuelva la carrera entre dos personas que
-- reservan el mismo minuto a la vez.

CREATE OR REPLACE FUNCTION create_appointment(
  p_service_id     INTEGER,
  p_customer_name  TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_notes          TEXT,
  p_starts_at      TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ZONA      CONSTANT TEXT := 'America/Tegucigalpa';
  v_service services%ROWTYPE;
  v_horario business_hours%ROWTYPE;
  v_local   TIMESTAMP;
  v_dia     DATE;
  v_ends_at TIMESTAMPTZ;
  v_ref     TEXT;
  v_id      INTEGER;
BEGIN
  -- ----- Datos de la clienta -----
  IF COALESCE(TRIM(p_customer_name), '') = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(TRIM(p_customer_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'El correo electrónico no es válido.' USING ERRCODE = '22023';
  END IF;

  IF LENGTH(REGEXP_REPLACE(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'El número de teléfono no es válido.' USING ERRCODE = '22023';
  END IF;

  IF LENGTH(COALESCE(p_notes, '')) > 500 THEN
    RAISE EXCEPTION 'El comentario es demasiado largo.' USING ERRCODE = '22023';
  END IF;

  -- ----- Servicio -----
  SELECT * INTO v_service FROM services WHERE id = p_service_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El servicio elegido ya no está disponible.' USING ERRCODE = '22023';
  END IF;

  -- ----- Momento -----
  IF p_starts_at IS NULL THEN
    RAISE EXCEPTION 'Falta la fecha y la hora.' USING ERRCODE = '22023';
  END IF;

  IF p_starts_at < NOW() THEN
    RAISE EXCEPTION 'No se puede reservar un horario que ya pasó.' USING ERRCODE = '22023';
  END IF;

  v_local := p_starts_at AT TIME ZONE ZONA;
  v_dia   := v_local::DATE;

  -- Las franjas que se ofrecen son de media hora en punto; cualquier
  -- otro valor viene de una petición armada a mano.
  IF EXTRACT(MINUTE FROM v_local)::INTEGER % 30 <> 0
     OR EXTRACT(SECOND FROM v_local) <> 0 THEN
    RAISE EXCEPTION 'El horario debe caer en una franja de media hora.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM blocked_dates WHERE day = v_dia) THEN
    RAISE EXCEPTION 'El salón no atiende ese día.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_horario
  FROM business_hours
  WHERE weekday = EXTRACT(DOW FROM v_dia)::SMALLINT;

  IF NOT FOUND OR v_horario.closed THEN
    RAISE EXCEPTION 'El salón no atiende ese día.' USING ERRCODE = '22023';
  END IF;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes);

  -- El servicio tiene que entrar completo antes de cerrar, y no puede
  -- cruzar a la madrugada del día siguiente.
  IF v_local::TIME < v_horario.opens_at
     OR (v_ends_at AT TIME ZONE ZONA)::DATE <> v_dia
     OR (v_ends_at AT TIME ZONE ZONA)::TIME > v_horario.closes_at THEN
    RAISE EXCEPTION 'El servicio no entra completo en el horario de atención de ese día.'
      USING ERRCODE = '22023';
  END IF;

  -- ----- Reserva -----
  v_ref := 'CT-' || LPAD(nextval('appointment_reference_seq')::TEXT, 6, '0');

  BEGIN
    INSERT INTO appointments (
      reference, service_id, service_name, duration_minutes,
      customer_name, customer_email, customer_phone, notes,
      starts_at, ends_at
    )
    VALUES (
      v_ref, v_service.id, v_service.name, v_service.duration_minutes,
      TRIM(p_customer_name), LOWER(TRIM(p_customer_email)), TRIM(p_customer_phone),
      NULLIF(TRIM(COALESCE(p_notes, '')), ''),
      p_starts_at, v_ends_at
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      -- Alguien reservó ese mismo horario mientras esta clienta
      -- completaba el formulario.
      RAISE EXCEPTION 'Ese horario acaba de ser reservado. Por favor elegí otro.'
        USING ERRCODE = '22023';
  END;

  RETURN jsonb_build_object(
    'id',             v_id,
    'reference',      v_ref,
    'service_name',   v_service.name,
    'customer_email', LOWER(TRIM(p_customer_email)),
    'starts_at',      p_starts_at,
    'ends_at',        v_ends_at
  );
END;
$$;

REVOKE ALL ON FUNCTION create_appointment(INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_appointment(INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

-- ============================================================
-- Datos iniciales
-- ============================================================
-- Horario tomado de la sección Contacto del sitio: Lun a Sáb, 9 a 19.
INSERT INTO business_hours (weekday, opens_at, closes_at, closed) VALUES
  (0, '09:00', '19:00', TRUE),   -- domingo, cerrado
  (1, '09:00', '19:00', FALSE),
  (2, '09:00', '19:00', FALSE),
  (3, '09:00', '19:00', FALSE),
  (4, '09:00', '19:00', FALSE),
  (5, '09:00', '19:00', FALSE),
  (6, '09:00', '19:00', FALSE)
ON CONFLICT (weekday) DO NOTHING;

-- Servicios de ejemplo, con las duraciones habituales de un salón.
-- Se cargan solo si la tabla está vacía, para no pisar los reales.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM services) THEN
    RAISE NOTICE 'La tabla services ya tiene datos: no se cargan los servicios de ejemplo.';
    RETURN;
  END IF;

  INSERT INTO services (name, description, duration_minutes, price) VALUES
  ('Manicure y esmaltado', 'Manicure completo con esmaltado tradicional.', 60, 350),
  ('Uñas acrílicas', 'Aplicación de uñas acrílicas con diseño a elección.', 120, 800),
  ('Esmaltado en gel', 'Esmaltado semipermanente de larga duración.', 90, 500),
  ('Extensiones de pestañas', 'Extensiones clásicas, pelo por pelo.', 120, 900),
  ('Lifting de pestañas', 'Curvado y tinte de pestañas naturales.', 60, 600),
  ('Diseño de cejas', 'Depilación y diseño según la forma del rostro.', 30, 250),
  ('Laminado de cejas', 'Laminado con tinte y nutrición.', 60, 550),
  ('Maquillaje social', 'Maquillaje para eventos y ocasiones especiales.', 60, 700),
  ('Maquillaje de novia', 'Prueba previa y maquillaje el día del evento.', 120, 1800);

  RAISE NOTICE 'Servicios de ejemplo cargados: 9.';
END $$;
