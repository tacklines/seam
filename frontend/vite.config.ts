import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3002',
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true,
      },
    },
  },
});
