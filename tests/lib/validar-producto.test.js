import { describe, it, expect } from 'vitest';
import { validarProducto } from '@/lib/validar-producto';

const VALIDO = {
  name: 'Esmalte en Gel',
  category: 'unas',
  price: 180,
  stock: 10,
  description: 'Larga duración.',
  image: 'https://ejemplo.com/foto.jpg'
};

describe('validarProducto', () => {
  describe('producto correcto', () => {
    it('acepta uno completo y devuelve los datos normalizados', () => {
      const { datos, error } = validarProducto(VALIDO);

      expect(error).toBeUndefined();
      expect(datos).toEqual(VALIDO);
    });

    it('recorta los espacios sobrantes', () => {
      const { datos } = validarProducto({ ...VALIDO, name: '  Esmalte  ', description: ' Hola ' });

      expect(datos.name).toBe('Esmalte');
      expect(datos.description).toBe('Hola');
    });

    it('acepta un producto sin descripcion ni imagen', () => {
      const { datos, error } = validarProducto({
        name: 'Lima',
        category: 'accesorios',
        price: 0,
        stock: 0
      });

      expect(error).toBeUndefined();
      expect(datos.price).toBe(0);
      expect(datos.stock).toBe(0);
    });
  });

  describe('nombre', () => {
    it.each([
      ['vacio', ''],
      ['solo espacios', '     '],
      ['ausente', undefined],
      ['nulo', null]
    ])('rechaza un nombre %s', (_d, name) => {
      expect(validarProducto({ ...VALIDO, name }).error).toMatch(/nombre/i);
    });

    it('rechaza un nombre de mas de 120 caracteres', () => {
      expect(validarProducto({ ...VALIDO, name: 'a'.repeat(121) }).error).toMatch(/120/);
    });
  });

  describe('categoria', () => {
    it.each(['unas', 'pestanas', 'cejas', 'maquillaje', 'accesorios'])('acepta %s', (category) => {
      expect(validarProducto({ ...VALIDO, category }).error).toBeUndefined();
    });

    it.each([
      ['una inventada', 'perfumes'],
      ['con mayusculas', 'UNAS'],
      ['vacia', ''],
      ['ausente', undefined]
    ])('rechaza una categoria %s', (_d, category) => {
      expect(validarProducto({ ...VALIDO, category }).error).toMatch(/categor/i);
    });
  });

  describe('precio', () => {
    it('redondea a dos decimales, que es lo que guarda la columna', () => {
      expect(validarProducto({ ...VALIDO, price: 389.999 }).datos.price).toBe(390);
      expect(validarProducto({ ...VALIDO, price: 12.345 }).datos.price).toBe(12.35);
    });

    it('acepta un precio que llega como texto desde el formulario', () => {
      expect(validarProducto({ ...VALIDO, price: '250.50' }).datos.price).toBe(250.5);
    });

    it.each([
      ['negativo', -50],
      ['no numerico', 'gratis'],
      ['infinito', Infinity],
      ['NaN', NaN],
      ['demasiado alto', 1000000]
    ])('rechaza un precio %s', (_d, price) => {
      expect(validarProducto({ ...VALIDO, price }).error).toMatch(/precio/i);
    });
  });

  describe('stock', () => {
    it.each([
      ['decimal', 2.5],
      ['negativo', -3],
      ['no numerico', 'muchos'],
      ['demasiado alto', 100001]
    ])('rechaza un stock %s', (_d, stock) => {
      expect(validarProducto({ ...VALIDO, stock }).error).toMatch(/stock/i);
    });
  });

  describe('imagen', () => {
    it.each([
      'https://ejemplo.com/foto.jpg',
      'http://ejemplo.com/foto.png',
      ''
    ])('acepta %s', (image) => {
      expect(validarProducto({ ...VALIDO, image }).error).toBeUndefined();
    });

    // Una imagen se renderiza en la tienda: un esquema que no sea http(s)
    // convierte el catalogo en una via de inyeccion.
    it.each([
      ['javascript:', 'javascript:alert(1)'],
      ['data:', 'data:text/html;base64,PHNjcmlwdD4='],
      ['file:', 'file:///etc/passwd']
    ])('rechaza el esquema %s', (_d, image) => {
      expect(validarProducto({ ...VALIDO, image }).error).toMatch(/http/i);
    });

    it('rechaza algo que no es una URL', () => {
      expect(validarProducto({ ...VALIDO, image: 'no-una-url' }).error).toMatch(/URL/i);
    });
  });

  describe('edicion parcial', () => {
    it('permite enviar solo el campo que se cambia', () => {
      const { datos, error } = validarProducto({ stock: 3 }, { parcial: true });

      expect(error).toBeUndefined();
      expect(datos).toEqual({ stock: 3 });
    });

    it('sigue validando los campos que si vienen', () => {
      expect(validarProducto({ price: -1 }, { parcial: true }).error).toMatch(/precio/i);
    });

    it('rechaza una edicion sin ningun campo', () => {
      expect(validarProducto({}, { parcial: true }).error).toMatch(/ningún campo/i);
    });
  });

  it('no revienta si no llega cuerpo', () => {
    expect(validarProducto(undefined).error).toBeTruthy();
  });
});
