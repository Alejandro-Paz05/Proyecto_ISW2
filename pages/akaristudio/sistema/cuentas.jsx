import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { protegerPagina, PORTAL_SISTEMA } from '@/lib/sesion';
// Desde lib/roles y no desde lib/sesion: este valor se usa al dibujar, y
// lib/sesion es de servidor.
import { ROLES, DESCRIPCION_DE_ROL } from '@/lib/roles';

/**
 * Las cuentas y sus roles.
 *
 * Toda cuenta nueva nace clienta: esta página es la única forma de que
 * alguien pase a ser dueña, admin o revisor. Nadie puede cambiarse el rol a
 * sí mismo, así que el selector de la propia cuenta viene desactivado.
 */

function formatFecha(iso) {
  return iso ? new Date(iso).toLocaleString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

function comoEntra(proveedores) {
  if (!proveedores?.length) return 'Todavía no entró';
  return proveedores.map((p) => (p === 'email' ? 'Contraseña' : 'Google')).join(' y ');
}

export default function CuentasDelSistema({ sesion }) {
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(null);

  const soloLectura = sesion?.soloLectura;

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/sistema/cuentas');
      if (!res.ok) throw new Error('No se pudieron cargar las cuentas.');
      setCuentas(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiarRol(cuenta, role) {
    setGuardando(cuenta.id);
    setError(null);
    setAviso(null);

    const anterior = cuenta.role;
    setCuentas((prev) => prev.map((c) => (c.id === cuenta.id ? { ...c, role } : c)));

    try {
      const res = await fetch(`/api/sistema/cuentas/${cuenta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el rol.');

      setAviso(`${cuenta.full_name ?? cuenta.email} ahora es ${role}.`);
    } catch (err) {
      setCuentas((prev) => prev.map((c) => (c.id === cuenta.id ? { ...c, role: anterior } : c)));
      setError(err.message);
    } finally {
      setGuardando(null);
    }
  }

  const porRol = (rol) => cuentas.filter((c) => c.role === rol).length;

  return (
    <AdminLayout titulo="Cuentas" portal="sistema" sesion={sesion}>
      <div className="admin-tarjetas">
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{cuentas.length}</span>
          <span className="admin-tarjeta-label">Cuentas</span>
        </div>
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{porRol('clienta')}</span>
          <span className="admin-tarjeta-label">Clientas</span>
        </div>
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{cuentas.length - porRol('clienta')}</span>
          <span className="admin-tarjeta-label">Con acceso al panel</span>
        </div>
      </div>

      {aviso && <p className="admin-aviso">{aviso}</p>}
      {error && <p className="admin-alerta">{error}</p>}
      {cargando && <p className="admin-vacio">Cargando cuentas...</p>}

      {!cargando && cuentas.length === 0 && (
        <p className="admin-vacio">Todavía no hay cuentas.</p>
      )}

      {cuentas.length > 0 && (
        <div className="admin-tabla-scroll">
          <table className="admin-tabla">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Entra con</th>
                <th>Último ingreso</th>
                <th>Rol</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((cuenta) => {
                const esMiCuenta = cuenta.id === sesion?.id;

                return (
                  <tr key={cuenta.id}>
                    <td>
                      <strong>{cuenta.full_name ?? 'Sin nombre'}</strong>
                      <span className="admin-sub">{cuenta.email ?? 'Sin correo'}</span>
                    </td>
                    <td>{comoEntra(cuenta.proveedores)}</td>
                    <td>{formatFecha(cuenta.ultimo_ingreso)}</td>
                    <td>
                      <select
                        className="admin-estado"
                        value={cuenta.role}
                        disabled={soloLectura || esMiCuenta || guardando === cuenta.id}
                        title={esMiCuenta ? 'Nadie puede cambiarse el rol a sí mismo' : undefined}
                        onChange={(e) => cambiarRol(cuenta, e.target.value)}
                        aria-label={`Rol de ${cuenta.full_name ?? cuenta.email ?? 'la cuenta'}`}
                      >
                        {ROLES.map((rol) => (
                          <option key={rol} value={rol}>
                            {rol}
                          </option>
                        ))}
                      </select>
                      <span className="admin-sub">{DESCRIPCION_DE_ROL[cuenta.role]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}

export const getServerSideProps = protegerPagina(PORTAL_SISTEMA);
