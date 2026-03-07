import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy QGIS Server requests
      '/qgis': {
        target: process.env.VITE_QGIS_SERVER_URL || 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qgis/, '/cgi-bin/qgis_mapserv.fcgi'),
      },
      // Future API proxy
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
      // Proxy geo.admin.ch to avoid CORS issues
      '/wmts': {
        target: 'https://wmts.geo.admin.ch',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wmts/, ''),
        secure: true,
      },
      '/api3-geo': {
        target: 'https://api3.geo.admin.ch',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api3-geo/, ''),
        secure: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-redux'],
          'vendor-map': ['ol', 'proj4'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'ol'],
  },
});
