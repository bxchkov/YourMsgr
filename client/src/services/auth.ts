import { isRetryableAuthMessage } from '@/constants/auth'
import { useAuthStore } from '@/stores/auth'
import { createLocalErrorResponse, parseApiResponse, type ParsedApiResponse } from '@/services/http'
import type {
    AuthLoginData,
    AuthTokenData,
    PublicKeysData,
    UpdateUsernameData,
} from '@/types/api'

const API_BASE = window.location.origin

function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null
    return null
}

async function authenticatedRequest<T>(
    endpoint: string,
    init: RequestInit,
    retry = true,
): Promise<ParsedApiResponse<T>> {
    const auth = useAuthStore()
    const headers: Record<string, string> = {
        ...(init.headers as Record<string, string> || {}),
    }

    if (auth.token && !headers.authorization && !headers.Authorization) {
        headers.Authorization = `Bearer ${auth.token}`
    }

    // Add CSRF token for mutating requests
    const method = (init.method || 'GET').toUpperCase()
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const csrfToken = getCookie('csrf_token')
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken
        }
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...init,
        credentials: 'include',
        headers,
    })

    const data = await parseApiResponse<T>(response)
    const errorMessage = data.message || 'Request failed'

    if (
        retry
        && response.status === 401
        && isRetryableAuthMessage(errorMessage)
    ) {
        const refreshResponse = await authService.refreshTokens()
        if (refreshResponse.success && refreshResponse.data?.accessToken) {
            auth.setAuth(refreshResponse.data.accessToken)
            return authenticatedRequest<T>(endpoint, init, false)
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
        const headers: Record<string, string> = {
            'content-type': 'application/json',
        }
        const csrfToken = getCookie('csrf_token')
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken
        }

        const response = await fetch(`${API_BASE}/auth/registration`, {
            method: 'POST',
            credentials: 'include',
            headers,
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
        return parseApiResponse<AuthTokenData>(response)
    },

    async login(login: string, password: string) {
        const headers: Record<string, string> = {
            'content-type': 'application/json',
        }
        const csrfToken = getCookie('csrf_token')
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken
        }

        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({ login, password }),
        })
        return parseApiResponse<AuthLoginData>(response)
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
        return parseApiResponse<AuthTokenData>(response)
    },

    async refreshTokens() {
        const auth = useAuthStore()
        const headers: Record<string, string> = {}
        if (auth.token) {
            headers.authorization = `Bearer ${auth.token}`
        }
        const csrfToken = getCookie('csrf_token')
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken
        }

        const response = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers,
        })
        return parseApiResponse<AuthTokenData>(response)
    },

    async logout() {
        const auth = useAuthStore()
        const headers: Record<string, string> = {}

        if (auth.token) {
            headers.authorization = `Bearer ${auth.token}`
        }
        const csrfToken = getCookie('csrf_token')
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken
        }

        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers,
        })
    },

    async updateUsername(username: string) {
        const auth = useAuthStore()
        if (!auth.token) return createLocalErrorResponse<UpdateUsernameData>('Session expired', 401)

        return authenticatedRequest<UpdateUsernameData>('/auth/username', {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({ username }),
        })
    },

    async getPublicKeys(userIds?: number[]) {
        const auth = useAuthStore()
        if (!auth.token) return createLocalErrorResponse<PublicKeysData>('Session expired', 401)

        const query = userIds?.length
            ? `?userIds=${encodeURIComponent(userIds.join(','))}`
            : ''

        return authenticatedRequest<PublicKeysData>(`/auth/publicKeys${query}`, {
            method: 'GET',
        })
    },
}
