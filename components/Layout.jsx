import Head from 'next/head';
import { useRouter } from 'next/router';

const SITIO = 'https://www.alejandropaz.xyz';
const TITULO_BASE = 'Akari Studio';
const DESCRIPCION_BASE =
  'Salón de belleza en Honduras: uñas, pestañas, cejas y maquillaje. ' +
  'Reservá tu cita en línea y comprá productos profesionales.';

// Las fuentes, los iconos y el <html lang> viven en pages/_document.jsx, para
// que no se repitan en cada página.
export default function Layout({ titulo, descripcion, children }) {
  const router = useRouter();

  const tituloCompleto = titulo ? `${titulo} | ${TITULO_BASE}` : `${TITULO_BASE} | Salón de Belleza`;
  const textoDescripcion = descripcion ?? DESCRIPCION_BASE;
  // asPath incluye la query y el ancla; la URL canónica no debe llevarlos.
  const url = `${SITIO}${router.asPath.split(/[?#]/)[0]}`;

  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        <title>{tituloCompleto}</title>
        <meta name="description" content={textoDescripcion} />
        <link rel="canonical" href={url} />

        {/* Open Graph: lo que se ve al pegar el enlace en WhatsApp,
            Instagram o Facebook. */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={TITULO_BASE} />
        <meta property="og:locale" content="es_HN" />
        <meta property="og:title" content={tituloCompleto} />
        <meta property="og:description" content={textoDescripcion} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={`${SITIO}/og-image.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Akari Studio" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={tituloCompleto} />
        <meta name="twitter:description" content={textoDescripcion} />
        <meta name="twitter:image" content={`${SITIO}/og-image.png`} />
      </Head>
      {children}
    </>
  );
}
