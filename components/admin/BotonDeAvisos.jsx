import { useCallback, useEffect, useState } from 'react';
import { activarAvisos, desactivarAvisos, estadoDeAvisos } from '@/lib/push-navegador';

/**
 * Enciende o apaga los avisos de pedidos en ESTE dispositivo.
 *
 * Es por dispositivo y no por cuenta a propósito: la dueña puede querer los
 * avisos en su teléfono y no en la computadora del salón, donde el panel queda
 * abierto todo el día.
 */

const ETIQUETAS = {
  cargando: 'Avisos...',
  inactivos: 'Activar avisos',
  activos: 'Avisos activados',
  bloqueado: 'Avisos bloqueados'
};

export default function BotonDeAvisos() {
  const [estado, setEstado] = useState('cargando');
  const [mensaje, setMensaje] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    estadoDeAvisos()
      .then(setEstado)
      .catch(() => setEstado('no-soportado'));
  }, []);

  const alternar = useCallback(async () => {
    setTrabajando(true);
    setMensaje(null);

    try {
      if (estado === 'activos') {
        await desactivarAvisos();
        setEstado('inactivos');
      } else {
        await activarAvisos();
        setEstado('activos');
      }
    } catch (error) {
      setMensaje(error.message);
      // Puede haber quedado bloqueado justo ahora, al decir que no.
      setEstado(await estadoDeAvisos().catch(() => estado));
    } finally {
      setTrabajando(false);
    }
  }, [estado]);

  // Nada que ofrecer: ni el navegador puede, ni el proyecto tiene claves.
  if (estado === 'no-soportado') return null;

  const bloqueado = estado === 'bloqueado';

  return (
    <div className="admin-avisos">
      <button
        type="button"
        className={`admin-salir ${estado === 'activos' ? 'activo' : ''}`}
        onClick={alternar}
        disabled={trabajando || bloqueado || estado === 'cargando'}
        title={
          bloqueado
            ? 'Este navegador tiene los avisos bloqueados. Se habilitan desde sus ajustes del sitio.'
            : 'Avisarme en este dispositivo cuando entre un pedido'
        }
      >
        {trabajando ? 'Un momento...' : ETIQUETAS[estado]}
      </button>

      {mensaje && (
        <span className="admin-avisos-nota" role="status">
          {mensaje}
        </span>
      )}
    </div>
  );
}
