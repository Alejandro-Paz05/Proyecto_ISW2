import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AdminLayout from '@/components/admin/AdminLayout';

/**
 * La barra de los dos portales.
 *
 * Nace de un error que sufrió Alejandro: la sección "Retroalimentación" del
 * portal del sistema apuntaba a la página del panel de la tienda, así que
 * tocarla lo mudaba de portal sin avisar y las secciones cambiaban solas de
 * Tickets y Cuentas a Pedidos y Productos. Desde afuera parece un clic mal
 * dado; es un enlace mal puesto.
 */

vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/akaristudio/sistema' })
}));

const SESION = { rol: 'admin', email: 'admin@ejemplo.com', origen: 'contrasena', soloLectura: false };

function montar(props = {}) {
  render(
    <AdminLayout titulo="Tickets" sesion={SESION} {...props}>
      <p>contenido</p>
    </AdminLayout>
  );
  return screen.getByRole('navigation');
}

const enlaces = (nav) =>
  within(nav)
    .getAllByRole('link')
    .map((a) => [a.textContent, a.getAttribute('href')]);

describe('AdminLayout', () => {
  it('el portal del sistema muestra sus tres secciones', () => {
    const nav = montar({ portal: 'sistema' });

    expect(enlaces(nav)).toEqual([
      ['Tickets', '/akaristudio/sistema'],
      ['Cuentas', '/akaristudio/sistema/cuentas'],
      ['Retroalimentación', '/akaristudio/sistema/retroalimentacion']
    ]);
  });

  it('el panel de la tienda muestra las suyas', () => {
    const nav = montar({ portal: 'tienda' });

    expect(enlaces(nav)).toEqual([
      ['Pedidos', '/akaristudio/admin'],
      ['Productos', '/akaristudio/admin/productos'],
      ['Retroalimentación', '/akaristudio/admin/retroalimentacion']
    ]);
  });

  // El error concreto: ninguna sección puede llevar al otro portal, porque
  // entonces la barra cambia sola y quien la usa cree que se equivocó.
  it.each([
    ['sistema', '/akaristudio/admin'],
    ['tienda', '/akaristudio/sistema']
  ])('ninguna sección de %s lleva al otro portal', (portal, ajeno) => {
    const nav = montar({ portal });

    for (const [, href] of enlaces(nav)) {
      expect(href.startsWith(ajeno)).toBe(false);
    }
  });

  it('el salto entre portales existe, pero fuera de las secciones', () => {
    montar({ portal: 'sistema' });

    // Está en las acciones de la derecha, no en la barra de secciones.
    const salto = screen.getByRole('link', { name: 'Tienda →' });
    expect(salto).toHaveAttribute('href', '/akaristudio/admin');
    expect(within(screen.getByRole('navigation')).queryByText('Tienda →')).toBeNull();
  });

  it('una cuenta que no entra al sistema no ve el salto', () => {
    montar({ portal: 'tienda', sesion: { ...SESION, rol: 'duena' } });

    expect(screen.queryByRole('link', { name: 'Sistema →' })).toBeNull();
  });

  it('la cuenta de solo lectura lo dice en pantalla', () => {
    montar({ portal: 'sistema', sesion: { ...SESION, rol: 'super_admin', soloLectura: true } });

    expect(screen.getByText(/modo lectura/i)).toBeVisible();
  });
});
