import axios from 'axios'
import Cookies from 'js-cookie'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
})

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('fb_token') || (typeof localStorage !== 'undefined' ? localStorage.getItem('fb_token') : null)
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// Redirect to login on 401
api.interceptors.response.use(
  (res) => {
    // Renew hint
    if (res.headers['x-renew-token'] === 'true') {
      api.post('/renew').then((r) => {
        Cookies.set('fb_token', r.data.token, { expires: 1 })
        localStorage.setItem('fb_token', r.data.token)
      }).catch(() => {})
    }
    return res
  },
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      Cookies.remove('fb_token')
      localStorage.removeItem('fb_token')
      localStorage.removeItem('fb_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/login', { username, password }),
  signup: (username: string, password: string) =>
    api.post('/signup', { username, password }),
  renew: () => api.post('/renew'),
}

// ── Resources ─────────────────────────────────────────────────────────────────
export const resourcesApi = {
  get: (path: string, params?: Record<string, string>) =>
    api.get(`/resources${path}`, { params }),

  getRecursive: (path: string) =>
    api.get(`/resources/recursive${path}`),

  createDir: (path: string) =>
    api.post(`/resources${path.endsWith('/') ? path : path + '/'}`),

  uploadFile: (path: string, file: File, onProgress?: (p: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/resources${path}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
  },

  uploadRaw: (path: string, content: string) =>
    api.post(`/resources${path}`, content, {
      headers: { 'Content-Type': 'text/plain' },
    }),

  updateFile: (path: string, content: string) =>
    api.put(`/resources${path}`, content, {
      headers: { 'Content-Type': 'text/plain' },
    }),

  delete: (path: string) => api.delete(`/resources${path}`),

  rename: (src: string, dst: string, override = false) =>
    api.patch(`/resources${src}`, null, {
      params: { action: 'rename', destination: dst, override },
    }),

  copy: (src: string, dst: string, override = false) =>
    api.patch(`/resources${src}`, null, {
      params: { action: 'copy', destination: dst, override },
    }),

  checksum: (path: string, algo = 'sha256') =>
    api.get(`/resources${path}`, { params: { checksum: algo } }),
}

// ── Raw download ──────────────────────────────────────────────────────────────
export const rawUrl = (path: string) =>
  `${API_URL}/api/raw${path}?token=${Cookies.get('fb_token') || localStorage.getItem('fb_token')}`

export const previewUrl = (path: string, size = 'medium') =>
  `${API_URL}/api/preview/${size}${path}?token=${Cookies.get('fb_token') || localStorage.getItem('fb_token')}`

// ── Search ────────────────────────────────────────────────────────────────────
export const searchApi = {
  search: (path: string, query: string) =>
    api.get(`/search${path}`, { params: { query }, responseType: 'text' }),
}

// ── Shares ────────────────────────────────────────────────────────────────────
export const sharesApi = {
  list: () => api.get('/shares'),
  getForPath: (path: string) => api.get(`/share${path}`),
  create: (path: string, body: { expires?: string; unit?: string; password?: string }) =>
    api.post(`/share${path}`, body),
  delete: (hash: string) => api.delete(`/share/${hash}`),
  getPublic: (hash: string, password?: string) =>
    api.get(`/public/share/${hash}`, { params: password ? { password } : {} }),
  downloadUrl: (hash: string, password?: string) =>
    `${API_URL}/api/public/dl/${hash}${password ? `?password=${password}` : ''}`,
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => api.get('/users'),
  get: (id: number) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  delete: (id: number, currentPassword?: string) =>
    api.delete(`/users/${id}`, { data: { currentPassword } }),
}

// ── User Shares ──────────────────────────────────────────────────────────────
export const userSharesApi = {
  getForItem: (item_path: string) => api.get('/user-shares', { params: { item_path } }),
  share: (item_path: string, user_ids: number[], can_write = false) =>
    api.post('/user-shares', { item_path, user_ids, can_write }),
  remove: (item_path: string, shared_with: number) =>
    api.delete('/user-shares', { data: { item_path, shared_with } }),
  sharedWithMe: () => api.get('/user-shares/shared-with-me'),
}

// ── Shared Resources ───────────────────────────────────────────────────────────
export const sharedResourcesApi = {
  get: (path: string) => api.get(`/shared-resources${path}`),
  uploadFile: (path: string, file: File, onProgress?: (p: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/shared-resources${path}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
  },
  createDir: (path: string) =>
    api.post(`/shared-resources${path.endsWith('/') ? path : path + '/'}`),
  delete: (path: string) => api.delete(`/shared-resources${path}`),
  rename: (src: string, dst: string) =>
    api.patch(`/shared-resources${src}`, null, { params: { action: 'rename', destination: dst } }),
}

// ── Settings ──────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: any) => api.put('/settings', data),
}

// ── Usage ─────────────────────────────────────────────────────────────────────
export const usageApi = {
  get: (path: string) => api.get(`/usage${path}`),
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return Cookies.get('fb_token') || localStorage.getItem('fb_token')
}

export function setToken(token: string, user: any) {
  Cookies.set('fb_token', token, { expires: 1 })
  localStorage.setItem('fb_token', token)
  localStorage.setItem('fb_user', JSON.stringify(user))
}

export function clearAuth() {
  Cookies.remove('fb_token')
  localStorage.removeItem('fb_token')
  localStorage.removeItem('fb_user')
}

export function getUser(): any | null {
  if (typeof window === 'undefined') return null
  const u = localStorage.getItem('fb_user')
  return u ? JSON.parse(u) : null
}
