import { useAuthStore } from '@/stores/auth'

const API_BASE = window.location.origin
const RETRYABLE_AUTH_MESSAGES = new Set([
    'Unauthorized',
    'Invalid or expired token',
])

async function authenticatedRequest(endpoint: string, init: RequestInit, retry = true) {
    const auth = useAuthStore()
    const headers: Record<string, string> = {
        ...(init.headers as Record<string, string> || {}),
    }

    if (auth.token && !headers.authorization && !headers.Authorization) {
        headers.Authorization = `Bearer ${auth.token}`
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...init,
        credentials: 'include',
        headers,
    })

    const data = await response.json()
    const errorMessage = data.message || data.error || 'Request failed'

    if (
        retry
        && response.status === 401
        && RETRYABLE_AUTH_MESSAGES.has(errorMessage)
    ) {
        const refreshResponse = await authService.refreshTokens()
        if (refreshResponse.success && refreshResponse.data?.accessToken) {
            auth.setAuth(refreshResponse.data.accessToken)
            return authenticatedRequest(endpoint, init, false)
        }
    }

    return data
}

export const authService = {
    async register(
        login: string,
        password: string,
        username: string,
        publicKey: string,
        encryptedPrivateKey: string,
        encryptedPrivateKeyIv: string,
        encryptedPrivateKeySalt: string,
    ) {
        const response = await fetch(`${API_BASE}/auth/registration`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                login,
                password,
                username,
                publicKey,
                encryptedPrivateKey,
                encryptedPrivateKeyIv,
                encryptedPrivateKeySalt,
            }),
        })
        return await response.json()
    },

    async login(login: string, password: string) {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({ login, password }),
        })
        return await response.json()
    },

    async checkSession() {
        const auth = useAuthStore()
        const headers: Record<string, string> = {}
        if (auth.token) {
            headers.authorization = `Bearer ${auth.token}`
        }

        const response = await fetch(`${API_BASE}/auth/session`, {
            method: 'GET',
            credentials: 'include',
            headers,
        })
        return await response.json()
    },

    async refreshTokens() {
        const auth = useAuthStore()
        const headers: Record<string, string> = {}
        if (auth.token) {
            headers.authorization = `Bearer ${auth.token}`
        }

        const response = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'GET',
            credentials: 'include',
            headers,
        })
        return await response.json()
    },

    async logout() {
        const auth = useAuthStore()
        const headers: Record<string, string> = {}

        if (auth.token) {
            headers.authorization = `Bearer ${auth.token}`
        }

        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers,
        })
    },

    async updateUsername(username: string) {
        const auth = useAuthStore()
        if (!auth.token) return { success: false, message: 'Session expired' }

        return authenticatedRequest('/auth/username', {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({ username }),
        })
    },

    async getPublicKeys() {
        const auth = useAuthStore()
        if (!auth.token) return { success: false, message: 'Session expired' }

        return authenticatedRequest('/auth/publicKeys', {
            method: 'GET',
        })
    },
}
