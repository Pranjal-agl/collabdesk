import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: the Vite dev server forwards API + WebSocket traffic to the Spring
// Boot backend on :8080, so the browser talks to a single origin and no CORS
// configuration is ever needed in development. Production is same-origin too
// (the Vite build is embedded in the Spring Boot jar's static resources).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'http://localhost:8080', changeOrigin: true, ws: true },
    },
  },
  build: {
    // Budget: keep the initial JS chunk small. Everything else lazy-loads via
    // dynamic imports where it makes sense; the brotli/gzip sizes are what a
    // reviewer will quote.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom'], motion: ['framer-motion'] },
      },
    },
  },
});
