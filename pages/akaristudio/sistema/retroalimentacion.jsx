import PanelDeRetroalimentacion from '@/components/admin/PanelDeRetroalimentacion';
import { protegerPagina, PORTAL_SISTEMA } from '@/lib/sesion';

/**
 * La misma retroalimentación, con la barra del portal del sistema.
 *
 * Existe por un error concreto: la sección de la barra del sistema apuntaba a
 * la página del panel de la tienda, así que tocarla mudaba de portal sin
 * avisar —las secciones cambiaban de Tickets y Cuentas a Pedidos y Productos—
 * y quien lo sufría creía que se había equivocado de clic.
 */
export default function RetroalimentacionDelSistema({ sesion }) {
  return <PanelDeRetroalimentacion sesion={sesion} portal="sistema" />;
}

export const getServerSideProps = protegerPagina(PORTAL_SISTEMA);
