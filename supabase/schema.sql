-- ============================================
-- AKARI STUDIO - RESTABLECER BASE DE DATOS
-- Borra todo y crea desde cero con políticas correctas
-- Ejecuta este script en: Supabase > SQL Editor > New query
-- ============================================

-- ===== BORRAR TABLAS EXISTENTES (si existen) =====
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- ===== Tabla de productos =====
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  description TEXT,
  image TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== Tabla de pedidos =====
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'pendiente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== Tabla de items del pedido =====
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price NUMERIC(10, 2) NOT NULL
);

-- ===== ACTIVAR RLS (Row Level Security) =====
-- NOTA: Para este proyecto de demostración, RLS está DESACTIVADO
-- para simplificar el acceso de los clientes (checkout como invitado).
-- Para producción, reactiva RLS y crea políticas adecuadas.
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;

-- ============================================
-- Datos iniciales (productos con inventario)
-- ============================================
INSERT INTO products (name, category, price, description, image, stock) VALUES
('Kit de Uñas Acrílicas', 'unas', 450, 'Kit completo con polvo acrílico, líquido y tips para uñas profesionales.', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=600&q=80', 5),
('Esmalte en Gel Premium', 'unas', 180, 'Esmalte en gel de larga duración, tonos elegantes y brillo intenso.', 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?auto=format&fit=crop&w=600&q=80', 10),
('Set de Nail Art', 'unas', 320, 'Set de decoración para uñas: brillantina, stickers y herramientas.', 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=600&q=80', 8),
('Lámpara LED para Uñas', 'unas', 680, 'Lámpara LED UV para secado rápido de esmaltes en gel.', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=600&q=80', 3),
('Extensiones de Pestañas Clásicas', 'pestanas', 520, 'Kit de extensiones de pestañas para una mirada natural y elegante.', 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=600&q=80', 6),
('Pestañas Postizas Volumen', 'pestanas', 260, 'Pestañas postizas de volumen para ocasiones especiales.', 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=80', 12),
('Pegamento para Pestañas', 'pestanas', 150, 'Adhesivo profesional de secado rápido y larga duración.', 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=600&q=80', 15),
('Rizador de Pestañas', 'pestanas', 120, 'Rizador de pestañas ergonómico para una curva perfecta.', 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=80', 20),
('Kit de Cejas Profesional', 'cejas', 380, 'Kit completo con pinzas, cepillo y plantillas para diseño de cejas.', 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=600&q=80', 7),
('Lápiz para Cejas', 'cejas', 95, 'Lápiz de precisión para definir y rellenar cejas.', 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=600&q=80', 25),
('Gel Fijador de Cejas', 'cejas', 130, 'Gel transparente que fija y mantiene las cejas en su lugar.', 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=600&q=80', 18),
('Paleta de Sombras Doradas', 'maquillaje', 420, 'Paleta de sombras con tonos dorados y neutros para todo look.', 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=80', 9),
('Base de Maquillaje HD', 'maquillaje', 350, 'Base de cobertura media a alta con acabado natural.', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80', 11),
('Set de Brochas Profesional', 'maquillaje', 560, 'Set de brochas de alta calidad para maquillaje profesional.', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80', 4),
('Kit de Cuidado de Uñas', 'accesorios', 240, 'Kit con aceite de cutícula, lima y crema hidratante.', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=600&q=80', 14),
('Espejo de Belleza LED', 'accesorios', 480, 'Espejo con luz LED para un maquillaje perfecto.', 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=600&q=80', 0);
