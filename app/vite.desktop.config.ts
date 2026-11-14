import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Builds only the desktop scratchpad page (scratchpad.html) into dist-desktop. */
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist-desktop',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: 'scratchpad.html' },
  },
})
