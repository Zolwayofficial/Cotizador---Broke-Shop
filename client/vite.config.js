import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeProxyTarget(rawValue, fallbackPort) {
  const candidate = String(rawValue || '').trim()

  if (!candidate) {
    return `http://localhost:${fallbackPort}`
  }

  return candidate.replace(/\/+$/, '')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = String(env.PORT || process.env.PORT || '3000').trim() || '3000'
  const proxyTarget = normalizeProxyTarget(
    env.VITE_API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET,
    backendPort
  )

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': proxyTarget
      }
    }
  }
})
