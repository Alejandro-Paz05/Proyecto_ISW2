import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// El carrito persiste en localStorage: sin limpiarlo, un test arrastraría
// el estado al siguiente y los resultados dependerían del orden.
//
// Las pruebas de base de datos (tests/db/) corren en el entorno node, porque
// PGlite no funciona dentro de jsdom, y ahí localStorage no existe.
afterEach(() => {
  cleanup();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
