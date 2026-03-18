import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const AUTH_STORAGE_KEY = 'accessToken'
export const AUTH_SYNC_STORAGE_KEY = 'yourmsgr-auth-sync'
export const AUTH_SYNC_CHANNEL_NAME = 'yourmsgr-auth'

export type AuthSyncEvent =
    | { type: 'login'; accessToken: string; timestamp: number }
    | { type: 'logout'; timestamp: number }

let authSyncChannel: BroadcastChannel | null = null

function decodeJwtPayload(token: string) {
    const payload = token.split('.')[1]
    if (!payload) {
        throw new Error('JWT payload is missing')
    }

    const normalizedPayload = payload
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(payload.length / 4) * 4, '=')

    const decoded = atob(normalizedPayload)
    const json = decodeURIComponent(
        Array.from(decoded)
            .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
            .join(''),
    )

    return JSON.parse(json)
}

function getAuthSyncChannel() {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
        return null
    }

    authSyncChannel ??= new BroadcastChannel(AUTH_SYNC_CHANNEL_NAME)
    return authSyncChannel
}

function broadcastAuthSync(event: AuthSyncEvent) {
    if (typeof window === 'undefined') {
        return
    }

    localStorage.setItem(AUTH_SYNC_STORAGE_KEY, JSON.stringify(event))
    getAuthSyncChannel()?.postMessage(event)
}

export const useAuthStore = defineStore('auth', () => {
    const token = ref<string | null>(localStorage.getItem(AUTH_STORAGE_KEY))
    const userId = ref<number | null>(null)
    const username = ref<string | null>(null)
    const login = ref<string | null>(null)
    const userRole = ref<number>(1)
    const publicKey = ref<string | null>(null)

    const isAuthenticated = computed(() => !!token.value)

    function applyTokenState(accessToken: string | null) {
        token.value = accessToken
        userId.value = null
        username.value = null
        login.value = null
        userRole.value = 1

        if (!accessToken) {
            return
        }

        try {
            const payload = decodeJwtPayload(accessToken)
            userId.value = payload.userId
            username.value = payload.userName
            login.value = payload.login
            userRole.value = payload.userRole || 1
        } catch {
            userId.value = null
            username.value = null
            login.value = null
            userRole.value = 1
        }
    }

    if (token.value) {
        applyTokenState(token.value)
    }

    function setAuth(accessToken: string, options: { sync?: boolean } = {}) {
        applyTokenState(accessToken)
        localStorage.setItem(AUTH_STORAGE_KEY, accessToken)

        if (options.sync !== false) {
            broadcastAuthSync({
                type: 'login',
                accessToken,
                timestamp: Date.now(),
            })
        }
    }

    function setUsername(newUsername: string) {
        username.value = newUsername
    }

    function setPublicKey(key: string) {
        publicKey.value = key
    }

    function logout(options: { sync?: boolean } = {}) {
        applyTokenState(null)
        publicKey.value = null
        localStorage.removeItem(AUTH_STORAGE_KEY)
        sessionStorage.removeItem('e2ee_private_key')
        sessionStorage.removeItem('e2ee_public_key')
        localStorage.removeItem('e2ee_private_key')
        localStorage.removeItem('e2ee_public_key')

        if (options.sync !== false) {
            broadcastAuthSync({
                type: 'logout',
                timestamp: Date.now(),
            })
        }
    }

    return {
        token,
        userId,
        username,
        login,
        userRole,
        publicKey,
        isAuthenticated,
        setAuth,
        setUsername,
        setPublicKey,
        logout,
    }
})
