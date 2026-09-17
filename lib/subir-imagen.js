import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { reportarError } from '@/lib/errores';
import { LIMITE_DE_BYTES, enMegabytes, tipoDeImagen } from '@/lib/imagen';

/**
 * Recibir una imagen y guardarla en un bucket.
 *
 * Nació como la ruta de las fotos de producto y se extrajo al aparecer la
 * galería: dos rutas con el mismo cuidado escrito dos veces terminan siendo dos
 * rutas con distinto cuidado. Lo único que cambia entre una y otra es a qué
 * bucket va el archivo.
 *
 * El navegador manda el archivo tal cual en el cuerpo, con su Content-Type. No
 * es multipart: se sube un solo archivo y no hay otros campos, así que armar y
 * desarmar un multipart sería ceremonia sin nada a cambio.
 */

const UN_ANO = 60 * 60 * 24 * 365;

/** Storage responde así cuando el bucket del destino no está creado. */
function faltaElBucket(error) {
  return (
    error?.statusCode === '404' ||
    error?.status === 404 ||
    /bucket not found/i.test(error?.message ?? '')
  );
}

/**
 * El cuerpo entero en memoria, o null si se pasó del límite.
 *
 * Corta apenas lo supera en vez de leer todo y medir después: si no, mandar un
 * archivo de un giga sería una forma de llenarle la memoria al servidor.
 */
async function leerCuerpo(req) {
  const partes = [];
  let total = 0;

  for await (const trozo of req) {
    total += trozo.length;

    if (total > LIMITE_DE_BYTES) {
      req.destroy();
      return null;
    }

    partes.push(trozo);
  }

  return Buffer.concat(partes);
}

/**
 * Lee la imagen de la petición, la valida y la guarda.
 *
 * Responde ella misma: devuelve la dirección pública con 201, o el error que
 * corresponda. Quien la llama solo decide el bucket.
 */
export async function guardarImagenDe(req, res, { bucket, ruta }) {
  const declarado = Number(req.headers['content-length']);
  const demasiadoGrande = {
    error: `La imagen no puede pesar más de ${enMegabytes(LIMITE_DE_BYTES)}.`
  };

  // Lo que dice la cabecera no es de fiar, pero cuando dice que se pasa,
  // ahorra recibir el archivo entero para rechazarlo al final.
  if (Number.isFinite(declarado) && declarado > LIMITE_DE_BYTES) {
    return res.status(413).json(demasiadoGrande);
  }

  const datos = await leerCuerpo(req);
  if (datos === null) return res.status(413).json(demasiadoGrande);

  // El tipo lo deciden los primeros bytes, no la cabecera ni la extensión: las
  // dos las escribe quien sube.
  const tipo = tipoDeImagen(datos);

  if (!tipo) {
    return res.status(400).json({ error: 'Solo se aceptan imágenes PNG, JPG o WebP.' });
  }

  // Nombre al azar: el que traía el archivo puede repetirse, traer acentos o
  // barras, y además dice cosas de la computadora de quien lo subió.
  const nombre = `${randomUUID()}.${tipo.extension}`;

  try {
    const almacen = getSupabaseAdmin().storage.from(bucket);

    const { error } = await almacen.upload(nombre, datos, {
      contentType: tipo.mime,
      // El nombre es único e irrepetible, así que la imagen nunca cambia de
      // contenido: se puede cachear todo lo que el navegador quiera.
      cacheControl: String(UN_ANO)
    });

    if (error) throw error;

    const { data } = almacen.getPublicUrl(nombre);

    return res.status(201).json({ url: data.publicUrl });
  } catch (error) {
    console.error('Error al subir la imagen:', error);
    await reportarError(error, { ruta, metodo: req.method });

    // El bucket no existe: falta correr la migración que lo crea. Decirlo así
    // ahorra el rato que cuesta descubrirlo mirando la base, que es
    // exactamente lo que pasó la primera vez que alguien subió a la galería.
    if (faltaElBucket(error)) {
      return res.status(500).json({
        error:
          `El lugar donde se guardan estas imágenes todavía no existe en la base ` +
          `(bucket "${bucket}"). Falta correr la migración que lo crea.`
      });
    }

    return res.status(500).json({ error: 'No se pudo guardar la imagen.' });
  }
}
