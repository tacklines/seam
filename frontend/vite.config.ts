import { defineConfig, PluginOption } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Lit custom elements can't be re-registered via HMR — force full reload
function litFullReload(): PluginOption {
  return {
    name: 'lit-full-reload',
    handleHotUpdate({ file, server }) {
      if (file.endsWith('.ts') && file.includes('/src/components/')) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), litFullReload()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3002',
      '/mcp': 'http://localhost:3002',
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true,
      },
    },
  },
});
