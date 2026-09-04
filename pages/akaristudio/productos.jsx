import TiendaLayout from '@/components/TiendaLayout';
import Products from '@/components/Products';
import { useCatalogo } from '@/context/CatalogoContext';

function Catalogo() {
  const { productos, categorias, etiquetas, cargando, error } = useCatalogo();
  return (
    <Products
      products={productos}
      loading={cargando}
      error={error}
      categorias={categorias}
      etiquetas={etiquetas}
    />
  );
}

export default function ProductosPagina() {
  return (
    <TiendaLayout
      titulo="Productos"
      descripcion="Tienda en línea de Akari Studio: productos profesionales para uñas, pestañas, cejas y maquillaje. Envíos en Honduras, compra sin crear cuenta."
    >
      <Catalogo />
    </TiendaLayout>
  );
}
