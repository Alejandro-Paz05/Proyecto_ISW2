// ============================================
// AKARI STUDIO - Datos de productos
// ============================================

const PRODUCTS = [
  // ===== UÑAS =====
  {
    id: 1,
    name: 'Kit de Uñas Acrílicas',
    category: 'unas',
    price: 450,
    description: 'Kit completo con polvo acrílico, líquido y tips para uñas profesionales.',
    image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 2,
    name: 'Esmalte en Gel Premium',
    category: 'unas',
    price: 180,
    description: 'Esmalte en gel de larga duración, tonos elegantes y brillo intenso.',
    image: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 3,
    name: 'Set de Nail Art',
    category: 'unas',
    price: 320,
    description: 'Set de decoración para uñas: brillantina, stickers y herramientas.',
    image: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 4,
    name: 'Lámpara LED para Uñas',
    category: 'unas',
    price: 680,
    description: 'Lámpara LED UV para secado rápido de esmaltes en gel.',
    image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=600&q=80'
  },

  // ===== PESTAÑAS =====
  {
    id: 5,
    name: 'Extensiones de Pestañas Clásicas',
    category: 'pestanas',
    price: 520,
    description: 'Kit de extensiones de pestañas para una mirada natural y elegante.',
    image: 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 6,
    name: 'Pestañas Postizas Volumen',
    category: 'pestanas',
    price: 260,
    description: 'Pestañas postizas de volumen para ocasiones especiales.',
    image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 7,
    name: 'Pegamento para Pestañas',
    category: 'pestanas',
    price: 150,
    description: 'Adhesivo profesional de secado rápido y larga duración.',
    image: 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 8,
    name: 'Rizador de Pestañas',
    category: 'pestanas',
    price: 120,
    description: 'Rizador de pestañas ergonómico para una curva perfecta.',
    image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=80'
  },

  // ===== CEJAS =====
  {
    id: 9,
    name: 'Kit de Cejas Profesional',
    category: 'cejas',
    price: 380,
    description: 'Kit completo con pinzas, cepillo y plantillas para diseño de cejas.',
    image: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 10,
    name: 'Lápiz para Cejas',
    category: 'cejas',
    price: 95,
    description: 'Lápiz de precisión para definir y rellenar cejas.',
    image: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 11,
    name: 'Gel Fijador de Cejas',
    category: 'cejas',
    price: 130,
    description: 'Gel transparente que fija y mantiene las cejas en su lugar.',
    image: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=600&q=80'
  },

  // ===== MAQUILLAJE =====
  {
    id: 12,
    name: 'Paleta de Sombras Doradas',
    category: 'maquillaje',
    price: 420,
    description: 'Paleta de sombras con tonos dorados y neutros para todo look.',
    image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 13,
    name: 'Base de Maquillaje HD',
    category: 'maquillaje',
    price: 350,
    description: 'Base de cobertura media a alta con acabado natural.',
    image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 14,
    name: 'Set de Brochas Profesional',
    category: 'maquillaje',
    price: 560,
    description: 'Set de brochas de alta calidad para maquillaje profesional.',
    image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80'
  },

  // ===== ACCESORIOS =====
  {
    id: 15,
    name: 'Kit de Cuidado de Uñas',
    category: 'accesorios',
    price: 240,
    description: 'Kit con aceite de cutícula, lima y crema hidratante.',
    image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 16,
    name: 'Espejo de Belleza LED',
    category: 'accesorios',
    price: 480,
    description: 'Espejo con luz LED para un maquillaje perfecto.',
    image: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=600&q=80'
  }
];

// Formato de moneda (Lempiras hondureños)
function formatPrice(amount) {
  return 'L ' + amount.toFixed(2);
}
