import Head from 'next/head';

// Las fuentes y el <html lang> viven en pages/_document.js, para que se
// carguen una sola vez y no por página.
export default function Layout({ children }) {
  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Akari Studio | Salón de Belleza</title>
        <meta
          name="description"
          content="Tienda en línea de Akari Studio: productos para uñas, pestañas, cejas y maquillaje. Envíos en Honduras, compra como invitado."
        />
      </Head>
      {children}
    </>
  );
}
