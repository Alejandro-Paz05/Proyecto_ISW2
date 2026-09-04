import { useEffect } from 'react';
import '@/styles/globals.css';
import '@/styles/whatsapp.css';
import '@/styles/admin.css';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // En desarrollo estorba: cachearía la build vieja y habría que borrar el
    // almacenamiento del navegador en cada cambio.
    if (process.env.NODE_ENV !== 'production') return;

    // Después de load, para no competir por ancho de banda con lo que la
    // página necesita para pintarse.
    const registrar = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((error) => console.error('No se pudo registrar el service worker:', error));
    };

    if (document.readyState === 'complete') {
      registrar();
    } else {
      window.addEventListener('load', registrar);
      return () => window.removeEventListener('load', registrar);
    }
  }, []);

  return <Component {...pageProps} />;
}
