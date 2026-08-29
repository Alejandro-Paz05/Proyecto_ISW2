import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// El carrito persiste en localStorage: sin limpiarlo, un test arrastraría
// el estado al siguiente y los resultados dependerían del orden.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
