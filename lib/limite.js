/**
 * Límite de peticiones por visitante, en memoria.
 *
 * Protege las dos rutas que cualquiera puede llamar sin sesión y que escriben
 * en la base: la retroalimentación y los reportes de errores. Sin límite, un
 * script podría llenar la tabla de tickets en minutos, y la cuota de Supabase
 * con ella.
 *
 * Tiene el mismo alcance que lib/cache.js y los mismos límites: vive en la
 * memoria de cada instancia, así que alguien que reparte sus peticiones entre
 * instancias pasa más de las que dice el máximo. Frena un abuso torpe y, sobre
 * todo, un error de programación que dispara reportes en bucle, que es lo
 * probable acá. Contra un ataque en serio haría falta un almacén compartido.
 */

const ventanas = new Map();

// Por encima de este tamaño se barren las ventanas vencidas, para que un
// desfile de IPs distintas no haga crecer el mapa sin fin.
const BARRER_DESDE = 1000;

function barrerVencidas(ahora) {
  for (const [clave, ventana] of ventanas) {
    if (ahora >= ventana.vence) ventanas.delete(clave);
  }
}

/** true si la petición entra en el límite, false si hay que cortarla. */
export function permitir(clave, { maximo, ventanaMs }) {
  const ahora = Date.now();
  const ventana = ventanas.get(clave);

  if (!ventana || ahora >= ventana.vence) {
    if (ventanas.size >= BARRER_DESDE) barrerVencidas(ahora);
    ventanas.set(clave, { cuenta: 1, vence: ahora + ventanaMs });
    return true;
  }

  if (ventana.cuenta >= maximo) return false;

  ventana.cuenta += 1;
  return true;
}

/**
 * La IP del visitante. En Vercel, x-forwarded-for la escribe la propia
 * plataforma con la dirección real del cliente, y la primera de la lista es
 * la de quien hizo la petición.
 */
export function ipDe(req) {
  const reenviada = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  return reenviada || req.socket?.remoteAddress || 'desconocida';
}

/** Solo para pruebas. */
export function reiniciarLimites() {
  ventanas.clear();
}

/** Solo para pruebas. */
export function cantidadDeVentanas() {
  return ventanas.size;
}
