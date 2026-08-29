import Head from 'next/head';

const TITULO_BASE = 'Akari Studio';
const DESCRIPCION_BASE =
  'Salón de belleza en Honduras: uñas, pestañas, cejas y maquillaje. ' +
  'Reservá tu cita en línea y comprá productos profesionales.';

// Las fuentes y el <html lang> viven en pages/_document.jsx, para que se
// carguen una sola vez y no por página.
export default function Layout({ titulo, descripcion, children }) {
  const tituloCompleto = titulo ? `${titulo} | ${TITULO_BASE}` : `${TITULO_BASE} | Salón de Belleza`;

  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{tituloCompleto}</title>
        <meta name="description" content={descripcion ?? DESCRIPCION_BASE} />
      </Head>
      {children}
    </>
  );
}
