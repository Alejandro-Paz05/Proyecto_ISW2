/**
 * El lado del navegador de los avisos de pedidos.
 *
 * Suscribirse es pedirle permiso a quien está usando el teléfono y registrar
 * ese dispositivo en el servidor. Nada de esto se puede hacer sin que la
 * persona lo acepte, y por diseño: un sitio que pudiera notificar sin permiso
 * sería un sitio que puede molestar para siempre.
 *
 * En iPhone hace falta que el panel esté instalado en la pantalla de inicio.
 * Safari no deja suscribirse desde una pestaña normal, así que la interfaz lo
 * dice en vez de fallar sin explicación.
 */

const RUTA = '/api/admin/push';

/** La clave pública del servidor, tal como el navegador la necesita. */
function claveEnBytes(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalizada = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binaria = window.atob(normalizada);

  return Uint8Array.from(binaria, (caracter) => caracter.charCodeAt(0));
}

/** Un nombre que la dueña reconozca entre sus dispositivos. */
function nombreDelDispositivo() {
  const ua = navigator.userAgent;
  const sistema =
    (/Android/i.test(ua) && 'Android') ||
    (/iPhone|iPad|iPod/i.test(ua) && 'iPhone') ||
    (/Windows/i.test(ua) && 'Windows') ||
    (/Mac OS X/i.test(ua) && 'Mac') ||
    'este dispositivo';
  const navegador =
    (/Edg\//i.test(ua) && 'Edge') ||
    (/Chrome\//i.test(ua) && 'Chrome') ||
    (/Firefox\//i.test(ua) && 'Firefox') ||
    (/Safari\//i.test(ua) && 'Safari') ||
    'Navegador';

  return `${navegador} en ${sistema}`;
}

export function avisosSoportados() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  );
}

/**
 * 'no-soportado' | 'bloqueado' | 'activos' | 'inactivos'
 *
 * 'bloqueado' es el caso que más confunde: quien dijo que no una vez no vuelve
 * a ver el cartel del navegador, y sin este estado la interfaz parecería rota.
 */
export async function estadoDeAvisos() {
  if (!avisosSoportados()) return 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueado';

  const registro = await navigator.serviceWorker.getRegistration();
  const suscripcion = await registro?.pushManager.getSubscription();

  return suscripcion ? 'activos' : 'inactivos';
}

export async function activarAvisos() {
  if (!avisosSoportados()) {
    throw new Error('Este navegador no puede recibir avisos.');
  }

  const permiso = await Notification.requestPermission();

  if (permiso !== 'granted') {
    throw new Error('Sin permiso no se pueden mandar avisos. Habilitalos en el navegador.');
  }

  const registro = await navigator.serviceWorker.ready;

  const suscripcion =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      // Obligatorio: el navegador exige que cada aviso se le muestre a la
      // persona. No se puede usar push para nada silencioso.
      userVisibleOnly: true,
      applicationServerKey: claveEnBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
    }));

  const res = await fetch(RUTA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...suscripcion.toJSON(), navegador: nombreDelDispositivo() })
  });

  if (!res.ok) {
    const datos = await res.json().catch(() => ({}));
    // Si el servidor no la guardó, dejarla viva en el navegador haría creer
    // que los avisos funcionan.
    await suscripcion.unsubscribe().catch(() => {});
    throw new Error(datos.error || 'No se pudo activar los avisos.');
  }
}

/**
 * Ninguna de las dos devuelve el estado nuevo: si salen sin lanzar, es el que
 * su nombre dice. Devolverlo sería un valor constante que aparenta informar
 * algo, y quien llama terminaría confiando en un dato que nunca cambia.
 */
export async function desactivarAvisos() {
  const registro = await navigator.serviceWorker.getRegistration();
  const suscripcion = await registro?.pushManager.getSubscription();

  if (!suscripcion) return;

  // Primero el servidor: si se diera de baja en el navegador y fallara la
  // llamada, quedaría una fila enviando avisos a un destinatario muerto.
  await fetch(RUTA, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: suscripcion.endpoint })
  });

  await suscripcion.unsubscribe();
}
