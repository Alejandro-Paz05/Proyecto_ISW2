/**
 * Simulacro mínimo de req y res para probar API Routes de Next.js.
 *
 * Next no expone un cliente de pruebas, así que se replica lo que las rutas
 * realmente usan: status, json, end, setHeader, method, headers, body, query
 * y cookies. Alcanza para verificar el código de estado, las cabeceras y el
 * cuerpo, que es lo que le importa a quien consume la API.
 */
export function crearRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    terminada: false,
    setHeader(clave, valor) {
      this.headers[clave] = valor;
      return this;
    },
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.terminada = true;
      return this;
    },
    // Un 304 se cierra sin cuerpo: es toda la gracia de una respuesta
    // condicional.
    end() {
      this.terminada = true;
      return this;
    }
  };
}

/** Ejecuta un handler y devuelve la respuesta simulada. */
export async function llamar(
  handler,
  { method = 'GET', body, query = {}, cookies = {}, headers = {} } = {}
) {
  const res = crearRes();
  await handler({ method, body, query, cookies, headers }, res);
  return res;
}
