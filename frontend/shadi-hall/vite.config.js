import { fileURLToPath, URL } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

const sharedDir = fileURLToPath(new URL('../../shared', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Business rules shared with the API (booking finance, enums, money formatting).
      '@shared': sharedDir,
    },
  },
  server: {
    port: 5173,
    // The API runs separately; proxying keeps cookies same-origin in development.
    proxy: { '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:5000', changeOrigin: false } },
    fs: { allow: ['.', sharedDir] },
  },
})
