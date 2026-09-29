import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // The client is published to GitHub Pages under the repository name.
  base: process.env.VITE_BASE ?? '/rationauts/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
