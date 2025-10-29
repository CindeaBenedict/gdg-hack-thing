import axios from 'axios'
import { auth, authDisabled } from './firebase'

function resolveBaseUrl(): string {
  const envUrl = (import.meta as any).env.VITE_API_URL
  if (envUrl) return envUrl
  // Default: use serverless path in production, localhost in dev
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000'
    return '/api'
  }
  return '/api'
}

const api = axios.create({ baseURL: resolveBaseUrl() })

api.interceptors.request.use(async (config) => {
  if (!authDisabled) {
    const user = auth.currentUser
    if (user) {
      const token = await user.getIdToken()
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`
      }
    }
  }
  return config
})

export default api


