import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // El proyecto escribe JSX dentro de archivos .js, así que hay que
  // ampliar el include del plugin: por defecto solo procesa .jsx.
  plugins: [react({ include: '**/*.{js,jsx}' })],
  resolve: {
    alias: { '@': raiz }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    include: ['**/*.test.{js,jsx}'],
    exclude: ['node_modules/**', '.next/**']
  }
});
