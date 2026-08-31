import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Estado del servicio.
 *
 * Comprueba de verdad la dependencia crítica —la base de datos— en lugar de
 * responder "ok" sin mirar nada: un healthcheck que siempre dice que sí no
 * sirve para detectar una caída.
 *
 * Devuelve 200 si todo responde y 503 si la base no contesta, que es lo que
 * espera un monitor externo para disparar una alerta.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const inicio = Date.now();
  const dependencias = {};
  let estado = 'ok';

  try {
    // Una consulta mínima: cuenta filas sin traer ninguna.
    const { error } = await getSupabaseAdmin()
      .from('products')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;

    dependencias.base_de_datos = { estado: 'ok', latencia_ms: Date.now() - inicio };
  } catch (error) {
    console.error('Healthcheck: la base de datos no responde:', error);
    dependencias.base_de_datos = { estado: 'error', latencia_ms: Date.now() - inicio };
    estado = 'degradado';
  }

  const cuerpo = {
    estado,
    status: estado === 'ok' ? 'healthy' : 'unhealthy',
    servicio: 'akari-studio',
    version: process.env.npm_package_version ?? '1.0.0',
    entorno: process.env.NODE_ENV,
    hora: new Date().toISOString(),
    tiempo_respuesta_ms: Date.now() - inicio,
    dependencias
  };

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(estado === 'ok' ? 200 : 503).json(cuerpo);
}
