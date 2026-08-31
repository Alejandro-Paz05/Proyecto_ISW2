import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="es">
      <Head>
        {/* Prueba de propiedad del proyecto para la evaluación del curso.
            También disponible en /verificacion.txt */}
        <meta name="learn-cap" content="LEARN-CAP-76080609" />

        {/* Aplicación instalable */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0d0d0d" />
        <meta name="application-name" content="Akari Studio" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Akari Studio" />
        <meta name="mobile-web-app-capable" content="yes" />

        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Poppins:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
