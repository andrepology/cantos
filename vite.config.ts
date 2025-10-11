import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: false, // Allow Vite to try next available port if 5173 is busy
    hmr: {
      port: 5173,
      host: 'localhost',
    },
    watch: {
      usePolling: false,
    },
  },
  optimizeDeps: {
    force: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy libraries into separate chunks
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-popover'],
          canvas: ['tldraw'], // tldraw is monolithic, hard to split further
          motion: ['motion'],
          jazz: ['jazz-tools'],
          masonry: ['masonic', 'react-window']
        }
      }
    },
    // Reduce chunk size warnings
    chunkSizeWarningLimit: 1000, // Increase from default 500KB
  },
})
