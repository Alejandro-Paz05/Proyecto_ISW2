import TiendaLayout from '@/components/TiendaLayout';
import SolicitarCita from '@/components/SolicitarCita';

export default function Citas() {
  return (
    <TiendaLayout
      titulo="Solicitar una cita"
      descripcion="Pedí tu cita en Akari Studio por WhatsApp: uñas, pestañas, cejas y maquillaje. Armá tu solicitud y enviala con un toque."
    >
      <SolicitarCita />
    </TiendaLayout>
  );
}
