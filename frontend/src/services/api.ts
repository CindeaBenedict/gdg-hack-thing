import axios from 'axios'
import { auth, authDisabled } from './firebase'

const api = axios.create({
  baseURL: (import.meta as any).env.VITE_API_URL || 'http://localhost:8000',
})

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


