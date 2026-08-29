import TiendaLayout from '@/components/TiendaLayout';
import Booking from '@/components/Booking';

export default function Citas() {
  return (
    <TiendaLayout
      titulo="Reservar una cita"
      descripcion="Reservá tu cita en Akari Studio: uñas, pestañas, cejas y maquillaje. Elegí el servicio y mirá los horarios disponibles al instante."
    >
      <Booking />
    </TiendaLayout>
  );
}
