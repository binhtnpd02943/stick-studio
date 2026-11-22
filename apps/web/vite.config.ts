import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    proxy: { '/v1': { target: process.env.STICK_API_URL ?? 'http://127.0.0.1:3000' } },
    fs: { allow: [repoRoot] }, // fonts live in /assets
  },
})
