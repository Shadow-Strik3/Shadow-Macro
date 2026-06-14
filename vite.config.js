import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The renderer is a standard React SPA. It runs both inside Electron and as a
// plain web build (used for the in-workspace preview). Relative base ensures the
// built index.html works when opened from the filesystem.
export default defineConfig({
  base: './',
  plugins: [react()],
  root: 'src/renderer',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
