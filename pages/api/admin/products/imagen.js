import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { reportarError } from '@/lib/errores';
import { conRol, PANEL_TIENDA } from '@/lib/sesion';
import { LIMITE_DE_BYTES, enMegabytes, tipoDeImagen } from '@/lib/imagen';

/**
 * Guarda la foto de un producto y devuelve su dirección pública.
 *
 * El navegador manda el archivo tal cual en el cuerpo, con su Content-Type.
 * No es multipart: subimos un solo archivo y no hay otros campos, así que
 * armar y desarmar un multipart sería ceremonia sin nada a cambio.
 *
 * El archivo va a un bucket público de Supabase Storage, en otro dominio que
 * el sitio. Eso no es un detalle: aunque alguien lograra guardar algo que el
 * navegador interprete como documento, se abriría fuera del origen de la
 * tienda, sin acceso a sus cookies.
 */

// Next parsea el cuerpo como JSON si no se le dice lo contrario, y acá el
// cuerpo son bytes.
export const config = { api: { bodyParser: false } };

const BUCKET = 'productos';
const UN_ANO = 60 * 60 * 24 * 365;

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

async function subir(req, res) {
  const declarado = Number(req.headers['content-length']);

  // Lo que dice la cabecera no es de fiar, pero cuando dice que se pasa,
  // ahorra recibir el archivo entero para rechazarlo al final.
  if (Number.isFinite(declarado) && declarado > LIMITE_DE_BYTES) {
    return res.status(413).json({ error: `La imagen no puede pesar más de ${enMegabytes(LIMITE_DE_BYTES)}.` });
  }

  const datos = await leerCuerpo(req);

  if (datos === null) {
    return res.status(413).json({ error: `La imagen no puede pesar más de ${enMegabytes(LIMITE_DE_BYTES)}.` });
  }

  const tipo = tipoDeImagen(datos);

  if (!tipo) {
    return res.status(400).json({ error: 'Solo se aceptan imágenes PNG, JPG o WebP.' });
  }

  // Nombre al azar: el que traía el archivo puede repetirse, traer acentos o
  // barras, y además dice cosas de la computadora de quien lo subió.
  const ruta = `${randomUUID()}.${tipo.extension}`;

  try {
    const almacen = getSupabaseAdmin().storage.from(BUCKET);

    const { error } = await almacen.upload(ruta, datos, {
      contentType: tipo.mime,
      // El nombre es único e irrepetible, así que la imagen nunca cambia de
      // contenido: se puede cachear todo lo que el navegador quiera.
      cacheControl: String(UN_ANO)
    });

    if (error) throw error;

    const { data } = almacen.getPublicUrl(ruta);

    return res.status(201).json({ url: data.publicUrl });
  } catch (error) {
    console.error('Error al subir la imagen:', error);
    await reportarError(error, { ruta: '/api/admin/products/imagen', metodo: req.method });

    return res.status(500).json({ error: 'No se pudo guardar la imagen.' });
  }
}

async function handler(req, res) {
  if (req.method === 'POST') return subir(req, res);

  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'Método no permitido' });
}

export default conRol(PANEL_TIENDA, handler);
