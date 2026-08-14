import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Services from '@/components/Services';
import Products from '@/components/Products';
import Contact from '@/components/Contact';
import Footer from '@/components/Footer';
import CartDrawer from '@/components/CartDrawer';
import CheckoutModal from '@/components/CheckoutModal';
import ConfirmModal from '@/components/ConfirmModal';
import Toast from '@/components/Toast';
import { CartProvider } from '@/context/CartContext';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch('/api/products');
        if (!res.ok) throw new Error('Error al cargar productos');
        const data = await res.json();
        setProducts(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  return (
    <Layout>
      <CartProvider>
        <Navbar />
        <Hero />
        <Services />
        <Products products={products} loading={loading} error={error} />
        <Contact />
        <Footer />
        <CartDrawer />
        <CheckoutModal />
        <ConfirmModal />
        <Toast />
      </CartProvider>
    </Layout>
  );
}
