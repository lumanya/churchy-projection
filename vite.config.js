import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: './', // Electron loads dist/index.html from disk
  // In the browser preview (npm run dev without Electron) the bundled Bibles are served from /bibles.
  // The packaged app reads them from data/ through the main process instead, so they are not copied twice.
  publicDir: command === 'serve' ? 'data' : false,
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  test: { environment: 'jsdom' }
}));
