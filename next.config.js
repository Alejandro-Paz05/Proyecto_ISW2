/** @type {import('next').NextConfig} */

/**
 * Cabeceras de seguridad, aplicadas a todas las respuestas.
 *
 * Son baratas —no cuestan una línea de código de aplicación— y cierran
 * familias enteras de ataque que de otro modo dependerían de que ningún
 * componente cometa un error.
 */
const cabecerasDeSeguridad = [
  {
    // Obliga a HTTPS durante un año, incluidos los subdominios. Evita que un
    // primer pedido en http pueda ser interceptado.
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains'
  },
  {
    // Impide que el navegador adivine el tipo de un archivo. Sin esto, algo
    // servido como texto pero que parece JavaScript puede terminar ejecutándose.
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    // Nadie puede meter el sitio en un iframe: cierra el clickjacking sobre
    // el panel de administración.
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    // Al salir del sitio no se filtra la ruta completa, que en el panel
    // revelaría qué se estaba mirando.
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    // El sitio no usa cámara, micrófono ni ubicación: se apagan de entrada.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  }
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:ruta*',
        headers: cabecerasDeSeguridad
      },
      {
        // El service worker no puede quedar cacheado: si el navegador sirve
        // una copia vieja, el sitio queda congelado en la versión anterior.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' }
        ]
      },
      {
        // Los iconos no cambian: se pueden cachear por mucho tiempo.
        source: '/:icono(icon-.*\\.png|apple-touch-icon\\.png|favicon\\.png|og-image\\.png)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
      }
    ];
  }
};

module.exports = nextConfig;
