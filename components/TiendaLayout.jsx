import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import CartDrawer from '@/components/CartDrawer';
import CheckoutModal from '@/components/CheckoutModal';
import ConfirmModal from '@/components/ConfirmModal';
import Toast from '@/components/Toast';
import BotonWhatsApp from '@/components/BotonWhatsApp';
import { CatalogoProvider, useCatalogo } from '@/context/CatalogoContext';
import { CartProvider } from '@/context/CartContext';

/**
 * Puente entre el catálogo y el carrito. CartProvider sigue recibiendo los
 * productos por props, y no leyendo el contexto directamente, para que se
 * pueda montar en las pruebas con un catálogo de mentira.
 */
function ConCarrito({ children }) {
  const { productos, listo } = useCatalogo();
  return (
    <CartProvider products={productos} productsLoaded={listo}>
      {children}
    </CartProvider>
  );
}

/**
 * Envoltorio de las páginas públicas de la tienda: menú, pie, carrito y
 * avisos. El carrito vive aquí y no en cada página, de modo que sobrevive al
 * navegar entre la portada, las citas y los productos.
 */
export default function TiendaLayout({ titulo, descripcion, children }) {
  return (
    <Layout titulo={titulo} descripcion={descripcion}>
      <CatalogoProvider>
        <ConCarrito>
          <Navbar />
          {children}
          <Footer />
          <CartDrawer />
          <CheckoutModal />
          <ConfirmModal />
          <Toast />
          <BotonWhatsApp />
        </ConCarrito>
      </CatalogoProvider>
    </Layout>
  );
}
