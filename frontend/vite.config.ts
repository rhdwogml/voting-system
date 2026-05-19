import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  build: {
    // ethers.js + recharts 번들 크기 경고 기준 상향
    chunkSizeWarningLimit: 1000,
  },
});
