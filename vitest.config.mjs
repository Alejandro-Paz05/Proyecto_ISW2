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
    exclude: ['node_modules/**', '.next/**'],

    coverage: {
      provider: 'v8',
      // lcov es el que lee SonarCloud; text deja el resumen en la consola,
      // y json-summary permite consultarlo desde un script.
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',

      // Se mide lo que tiene lógica. Quedan fuera las páginas y los
      // componentes de presentación: cubrirlos exigiría pruebas de
      // navegador que hoy no existen, y contarlos sin probarlos daría un
      // porcentaje que miente hacia abajo.
      include: ['lib/**/*.js', 'pages/api/**/*.js', 'context/**/*.jsx'],
      exclude: [
        'lib/supabase.js',   // cliente externo; se simula en las pruebas
        'lib/servicios.js',  // datos sin lógica: no hay nada que ejercitar
        '**/*.test.{js,jsx}'
      ],

      // El umbral está apenas por debajo de la cobertura actual (~89%). No
      // es una aspiración: sirve para que el CI falle si alguien agrega
      // código sin probarlo, no para adornar el informe.
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85
      }
    }
  }
});
