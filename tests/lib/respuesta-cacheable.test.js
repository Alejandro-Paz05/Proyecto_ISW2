import { describe, it, expect } from 'vitest';
import {
  calcularETag,
  coincideETag,
  responderJSON,
  CACHE_CATALOGO,
  CACHE_CATEGORIAS,
  SIN_CACHE
} from '@/lib/respuesta-cacheable';
import { crearRes } from '../helpers/http';

describe('calcularETag', () => {
  it('da la misma huella para el mismo contenido', () => {
    const datos = [{ id: 1, name: 'Esmalte' }];

    expect(calcularETag(datos)).toBe(calcularETag([{ id: 1, name: 'Esmalte' }]));
  });

  it('cambia si cambia cualquier dato', () => {
    const antes = calcularETag([{ id: 1, stock: 10 }]);
    const despues = calcularETag([{ id: 1, stock: 9 }]);

    expect(antes).not.toBe(despues);
  });

  it('es una etiqueta debil, porque compara el JSON y no los bytes', () => {
    expect(calcularETag([])).toMatch(/^W\/"/);
  });
});

describe('coincideETag', () => {
  const etag = 'W/"abc123"';

  it('reconoce la misma etiqueta', () => {
    expect(coincideETag('W/"abc123"', etag)).toBe(true);
  });

  it('ignora el prefijo de etiqueta debil al comparar', () => {
    expect(coincideETag('"abc123"', etag)).toBe(true);
  });

  it('encuentra la etiqueta dentro de una lista', () => {
    expect(coincideETag('W/"otra", W/"abc123"', etag)).toBe(true);
  });

  it('acepta el comodin', () => {
    expect(coincideETag('*', etag)).toBe(true);
  });

  it('rechaza una etiqueta distinta', () => {
    expect(coincideETag('W/"vieja"', etag)).toBe(false);
  });

  it('rechaza la cabecera ausente', () => {
    expect(coincideETag(undefined, etag)).toBe(false);
    expect(coincideETag('', etag)).toBe(false);
  });
});

describe('responderJSON', () => {
  const DATOS = [{ id: 1, name: 'Esmalte', stock: 10 }];

  it('responde 200 con el cuerpo cuando no hay etiqueta previa', () => {
    const res = crearRes();
    const devolvio304 = responderJSON({ headers: {} }, res, DATOS, CACHE_CATALOGO);

    expect(devolvio304).toBe(false);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(DATOS);
  });

  it('pone el Cache-Control que se le pasa', () => {
    const res = crearRes();
    responderJSON({ headers: {} }, res, DATOS, CACHE_CATEGORIAS);

    expect(res.headers['Cache-Control']).toBe(CACHE_CATEGORIAS);
  });

  it('siempre pone un ETag', () => {
    const res = crearRes();
    responderJSON({ headers: {} }, res, DATOS, CACHE_CATALOGO);

    expect(res.headers.ETag).toBe(calcularETag(DATOS));
  });

  // Lo que se ahorra es el cuerpo: la consulta a la base ya se hizo.
  it('responde 304 sin cuerpo si el cliente ya tiene esa version', () => {
    const req = { headers: { 'if-none-match': calcularETag(DATOS) } };
    const res = crearRes();

    const devolvio304 = responderJSON(req, res, DATOS, CACHE_CATALOGO);

    expect(devolvio304).toBe(true);
    expect(res.statusCode).toBe(304);
    expect(res.body).toBeNull();
    expect(res.terminada).toBe(true);
  });

  it('responde 200 si el cliente tiene una version vieja', () => {
    const req = { headers: { 'if-none-match': calcularETag([{ id: 1, stock: 99 }]) } };
    const res = crearRes();

    responderJSON(req, res, DATOS, CACHE_CATALOGO);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(DATOS);
  });

  it('no falla si la peticion no trae cabeceras', () => {
    const res = crearRes();

    expect(() => responderJSON({}, res, DATOS, CACHE_CATALOGO)).not.toThrow();
    expect(res.statusCode).toBe(200);
  });
});

describe('politicas de cache', () => {
  // El stock cambia con cada pedido: nadie puede servir una copia sin
  // preguntar, y el CDN no debe compartirla entre visitantes.
  it('el catalogo obliga a revalidar y no va al CDN', () => {
    expect(CACHE_CATALOGO).toContain('no-cache');
    expect(CACHE_CATALOGO).toContain('private');
    expect(CACHE_CATALOGO).not.toContain('s-maxage');
  });

  it('las categorias si se cachean en el CDN', () => {
    expect(CACHE_CATEGORIAS).toContain('public');
    expect(CACHE_CATEGORIAS).toMatch(/s-maxage=\d+/);
    expect(CACHE_CATEGORIAS).toMatch(/stale-while-revalidate=\d+/);
  });

  it('el panel no se guarda en ningun lado', () => {
    expect(SIN_CACHE).toContain('no-store');
  });
});
