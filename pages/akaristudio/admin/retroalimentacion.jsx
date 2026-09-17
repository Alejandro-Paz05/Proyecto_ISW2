import PanelDeRetroalimentacion from '@/components/admin/PanelDeRetroalimentacion';
import { protegerPagina, PANEL_TIENDA } from '@/lib/sesion';

/**
 * La retroalimentación vista desde el panel de la tienda.
 *
 * Es la misma pantalla que la del portal del sistema, con la barra de este
 * portal: quien entra por Pedidos y toca Retroalimentación se queda en
 * Pedidos, Productos y Retroalimentación.
 */
export default function RetroalimentacionDeLaTienda({ sesion }) {
  return <PanelDeRetroalimentacion sesion={sesion} portal="tienda" />;
}

export const getServerSideProps = protegerPagina(PANEL_TIENDA);
