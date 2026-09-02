/**
 * Simulacro mínimo de req y res para probar API Routes de Next.js.
 *
 * Next no expone un cliente de pruebas, así que se replica lo que las rutas
 * realmente usan: status, json, setHeader, method, body, query y cookies.
 * Alcanza para verificar el código de estado, las cabeceras y el cuerpo, que
 * es lo que le importa a quien consume la API.
 */
export function crearRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
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
      return this;
    }
  };
}

/** Ejecuta un handler y devuelve la respuesta simulada. */
export async function llamar(handler, { method = 'GET', body, query = {}, cookies = {} } = {}) {
  const res = crearRes();
  await handler({ method, body, query, cookies }, res);
  return res;
}
