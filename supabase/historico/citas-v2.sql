-- ============================================================
-- AKARI STUDIO — Citas con varios servicios y varias personas
-- ============================================================
-- Ejecutar en: Supabase > SQL Editor > New query
-- REQUIERE haber ejecutado antes `citas.sql`.
--
-- Qué cambia respecto de la primera versión:
--   - Una cita puede incluir VARIOS servicios. Antes era uno solo.
--   - Una cita puede ser para VARIAS personas. Como el salón atiende
--     de a una por vez, la duración se multiplica: dos personas con
--     el mismo servicio se atienden una después de la otra.
--
-- No toca products, orders ni order_items. Sobre `appointments` sí
-- altera columnas, así que conviene ejecutarlo antes de recibir citas
-- reales. Con la tabla vacía, la conversión no pierde nada.
-- ============================================================

-- ============================================================
-- Servicios incluidos en cada cita
-- ============================================================
-- Guarda su propia copia del nombre, la duración y el precio: si más
-- adelante cambia la tarifa o se elimina un servicio, la cita conserva
-- lo que se acordó el día que se reservó.
CREATE TABLE IF NOT EXISTS appointment_services (
  id               SERIAL PRIMARY KEY,
  appointment_id   INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id       INTEGER REFERENCES services(id) ON DELETE SET NULL,
  service_name     TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price            NUMERIC(10, 2) NOT NULL CHECK (price >= 0)
);

CREATE INDEX IF NOT EXISTS appointment_services_cita_idx
  ON appointment_services (appointment_id);

ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Ajustes sobre `appointments`
-- ============================================================
-- `duration_minutes` pasa a ser la duración TOTAL del bloque reservado:
-- la suma de los servicios, multiplicada por la cantidad de personas.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS people SMALLINT NOT NULL DEFAULT 1
    CHECK (people BETWEEN 1 AND 6);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS total NUMERIC(10, 2) NOT NULL DEFAULT 0
    CHECK (total >= 0);

-- El servicio individual se movió a appointment_services.
ALTER TABLE appointments DROP COLUMN IF EXISTS service_id;
ALTER TABLE appointments DROP COLUMN IF EXISTS service_name;

-- ============================================================
-- Reserva
-- ============================================================
DROP FUNCTION IF EXISTS create_appointment(INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION create_appointment(
  p_service_ids    INTEGER[],
  p_people         INTEGER,
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
  ZONA        CONSTANT TEXT := 'America/Tegucigalpa';
  v_horario   business_hours%ROWTYPE;
  v_local     TIMESTAMP;
  v_dia       DATE;
  v_minutos   INTEGER;
  v_total     NUMERIC(10, 2);
  v_cantidad  INTEGER;
  v_ends_at   TIMESTAMPTZ;
  v_ref       TEXT;
  v_id        INTEGER;
  v_nombres   TEXT;
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

  -- ----- Personas -----
  IF p_people IS NULL OR p_people < 1 OR p_people > 6 THEN
    RAISE EXCEPTION 'La cantidad de personas debe estar entre 1 y 6.' USING ERRCODE = '22023';
  END IF;

  -- ----- Servicios -----
  IF p_service_ids IS NULL OR array_length(p_service_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Hay que elegir al menos un servicio.' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_service_ids, 1) > 10 THEN
    RAISE EXCEPTION 'Son demasiados servicios para una sola cita.' USING ERRCODE = '22023';
  END IF;

  -- La duración y el precio salen de la base, nunca del navegador.
  SELECT SUM(s.duration_minutes), SUM(s.price), COUNT(*), STRING_AGG(s.name, ', ' ORDER BY s.name)
  INTO v_minutos, v_total, v_cantidad, v_nombres
  FROM UNNEST(p_service_ids) AS pedido(service_id)
  JOIN services s ON s.id = pedido.service_id AND s.active;

  IF v_cantidad IS NULL OR v_cantidad <> array_length(p_service_ids, 1) THEN
    RAISE EXCEPTION 'Alguno de los servicios elegidos ya no está disponible.' USING ERRCODE = '22023';
  END IF;

  -- El salón atiende de a una persona por vez: dos clientas ocupan el
  -- doble de tiempo, porque se atienden una después de la otra.
  v_minutos := v_minutos * p_people;
  v_total   := v_total * p_people;

  IF v_minutos > 480 THEN
    RAISE EXCEPTION 'La cita supera las 8 horas. Dividila en varias reservas.' USING ERRCODE = '22023';
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

  v_ends_at := p_starts_at + make_interval(mins => v_minutos);

  IF v_local::TIME < v_horario.opens_at
     OR (v_ends_at AT TIME ZONE ZONA)::DATE <> v_dia
     OR (v_ends_at AT TIME ZONE ZONA)::TIME > v_horario.closes_at THEN
    RAISE EXCEPTION 'La cita no entra completa en el horario de atención de ese día.'
      USING ERRCODE = '22023';
  END IF;

  -- ----- Reserva -----
  v_ref := 'CT-' || LPAD(nextval('appointment_reference_seq')::TEXT, 6, '0');

  BEGIN
    INSERT INTO appointments (
      reference, duration_minutes, people, total,
      customer_name, customer_email, customer_phone, notes,
      starts_at, ends_at
    )
    VALUES (
      v_ref, v_minutos, p_people, v_total,
      TRIM(p_customer_name), LOWER(TRIM(p_customer_email)), TRIM(p_customer_phone),
      NULLIF(TRIM(COALESCE(p_notes, '')), ''),
      p_starts_at, v_ends_at
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'Ese horario acaba de ser reservado. Por favor elegí otro.'
        USING ERRCODE = '22023';
  END;

  INSERT INTO appointment_services (appointment_id, service_id, service_name, duration_minutes, price)
  SELECT v_id, s.id, s.name, s.duration_minutes, s.price
  FROM UNNEST(p_service_ids) AS pedido(service_id)
  JOIN services s ON s.id = pedido.service_id;

  RETURN jsonb_build_object(
    'id',               v_id,
    'reference',        v_ref,
    'services',         v_nombres,
    'people',           p_people,
    'duration_minutes', v_minutos,
    'total',            v_total,
    'customer_email',   LOWER(TRIM(p_customer_email)),
    'starts_at',        p_starts_at,
    'ends_at',          v_ends_at
  );
END;
$$;

REVOKE ALL ON FUNCTION create_appointment(INTEGER[], INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_appointment(INTEGER[], INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

-- ============================================================
-- Categorías de servicio, para los filtros de la tienda
-- ============================================================
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'otros';

UPDATE services SET category = 'unas'       WHERE category = 'otros' AND name ILIKE ANY (ARRAY['%uñas%', '%manicure%', '%esmaltado%']);
UPDATE services SET category = 'pestanas'   WHERE category = 'otros' AND name ILIKE '%pestañas%';
UPDATE services SET category = 'cejas'      WHERE category = 'otros' AND name ILIKE '%cejas%';
UPDATE services SET category = 'maquillaje' WHERE category = 'otros' AND name ILIKE '%maquillaje%';
