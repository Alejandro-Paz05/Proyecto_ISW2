import { describe, it, expect } from 'vitest';
import { validarColores } from '@/lib/validar-colores';

const ROJO = { nombre: 'Rojo cereza', hex: '#b3122a', stock: 4 };

describe('validarColores', () => {
  it('acepta una lista y le pone el orden en que vino', () => {
    const { colores, error } = validarColores([ROJO, { nombre: 'Azul', stock: 0 }]);

    expect(error).toBeUndefined();
    expect(colores).toEqual([
      { nombre: 'Rojo cereza', hex: '#b3122a', stock: 4, position: 0 },
      { nombre: 'Azul', hex: null, stock: 0, position: 1 }
    ]);
  });

  // Conservar el id es lo que permite que una venta vieja siga apuntando a su
  // color, y que el stock no se reinicie al tocar cualquier otra cosa.
  it('conserva el id de los colores que ya existían', () => {
    const { colores } = validarColores([{ id: 7, nombre: 'Rojo', stock: 2 }]);

    expect(colores[0].id).toBe(7);
  });

  it('descarta un id que no es un número válido', () => {
    const { colores } = validarColores([{ id: 'nuevo', nombre: 'Rojo', stock: 2 }]);

    expect(colores[0]).not.toHaveProperty('id');
  });

  it('recorta los espacios del nombre', () => {
    const { colores } = validarColores([{ nombre: '  Rojo  ', stock: 1 }]);

    expect(colores[0].nombre).toBe('Rojo');
  });

  it('una lista vacía es válida: es un producto sin colores', () => {
    expect(validarColores([])).toEqual({ colores: [] });
  });

  describe('lo que rechaza', () => {
    it.each([
      ['algo que no es una lista', 'rojo, azul', /en una lista/i],
      ['un color sin nombre', [{ stock: 1 }], /necesita un nombre/i],
      ['un nombre en blanco', [{ nombre: '   ', stock: 1 }], /necesita un nombre/i],
      ['un nombre larguísimo', [{ nombre: 'x'.repeat(41), stock: 1 }], /40 caracteres/i],
      ['un stock negativo', [{ nombre: 'Rojo', stock: -1 }], /de 0 en adelante/i],
      ['un stock decimal', [{ nombre: 'Rojo', stock: 1.5 }], /entero/i],
      ['un stock que no es número', [{ nombre: 'Rojo', stock: 'tres' }], /entero/i],
      ['un hex mal escrito', [{ nombre: 'Rojo', hex: 'rojo', stock: 1 }], /#RRGGBB/],
      ['un hex de tres cifras', [{ nombre: 'Rojo', hex: '#f00', stock: 1 }], /#RRGGBB/]
    ])('rechaza %s', (_descripcion, entrada, mensaje) => {
      const { error, colores } = validarColores(entrada);

      expect(colores).toBeUndefined();
      expect(error).toMatch(mensaje);
    });

    // Dos muestras idénticas en la tienda, y la clienta sin forma de saber
    // cuál elegir.
    it('rechaza dos colores con el mismo nombre, aunque cambien las mayúsculas', () => {
      const { error } = validarColores([
        { nombre: 'Rojo', stock: 1 },
        { nombre: 'rojo', stock: 2 }
      ]);

      expect(error).toMatch(/repetido/i);
    });

    it('rechaza una lista interminable', () => {
      const muchos = Array.from({ length: 41 }, (_, i) => ({ nombre: `Color ${i}`, stock: 1 }));

      expect(validarColores(muchos).error).toMatch(/más de 40/i);
    });
  });
});
