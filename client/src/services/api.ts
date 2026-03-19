import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { disconnectSocket } from '@/composables/useWebSocket'
import { isRetryableAuthMessage, isTerminalSessionMessage } from '@/constants/auth'
import { authService } from '@/services/auth'
import { parseApiResponse, type ParsedApiResponse } from '@/services/http'
import router from '@/router'

const API_BASE = window.location.origin

export async function apiFetch<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
    retry = true,
): Promise<ParsedApiResponse<T>> {
    const auth = useAuthStore()
    const chatStore = useChatStore()
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> || {}),
    }

    // Add auth token if available and not already set
    if (auth.token && !headers.authorization && !headers.Authorization) {
        headers.Authorization = `Bearer ${auth.token}`
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
    })

    const data = await parseApiResponse<T>(response)
    const errorMessage = data.message || 'Request failed'

    if (!response.ok) {
        if (retry && response.status === 401 && isRetryableAuthMessage(errorMessage)) {
            const refreshResponse = await authService.refreshTokens()
            if (refreshResponse.success && refreshResponse.data?.accessToken) {
                auth.setAuth(refreshResponse.data.accessToken)
                return apiFetch<T>(endpoint, options, false)
            }
        }

        const shouldLogout = (
            response.status === 401
            || response.status === 403
        ) && isTerminalSessionMessage(errorMessage)

        if (shouldLogout) {
            disconnectSocket()
            chatStore.cleanup()
            auth.logout()
            if (router.currentRoute.value.name !== 'auth') {
                void router.replace('/auth')
            }
        }

        throw new Error(errorMessage)
    }

    return data
}
