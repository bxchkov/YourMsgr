import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import {
    AUTH_SYNC_CHANNEL_NAME,
    AUTH_SYNC_STORAGE_KEY,
    type AuthSyncEvent,
    useAuthStore,
} from '@/stores/auth'
import { disconnectSocket } from '@/composables/useWebSocket'

let initialized = false
let authSyncChannel: BroadcastChannel | null = null

function parseAuthSyncEvent(rawValue: string | null): AuthSyncEvent | null {
    if (!rawValue) {
        return null
    }

    try {
        return JSON.parse(rawValue) as AuthSyncEvent
    } catch {
        return null
    }
}

async function redirectToAuth(router: Router) {
    if (router.currentRoute.value.name !== 'auth') {
        await router.replace('/auth')
    }
}

async function handleRemoteLogout(pinia: Pinia, router: Router) {
    const auth = useAuthStore(pinia)
    const chatStore = useChatStore(pinia)

    disconnectSocket()
    chatStore.cleanup()
    auth.logout({ sync: false })
    await redirectToAuth(router)
}

async function handleRemoteLogin(pinia: Pinia, router: Router, accessToken: string) {
    const auth = useAuthStore(pinia)
    auth.setAuth(accessToken, { sync: false })

    if (router.currentRoute.value.name === 'auth') {
        await router.replace('/chat/general')
    }
}

async function handleSyncEvent(pinia: Pinia, router: Router, event: AuthSyncEvent | null) {
    if (!event) {
        return
    }

    if (event.type === 'logout') {
        await handleRemoteLogout(pinia, router)
        return
    }

    await handleRemoteLogin(pinia, router, event.accessToken)
}

export function setupAuthSync(pinia: Pinia, router: Router) {
    if (initialized || typeof window === 'undefined') {
        return
    }

    window.addEventListener('storage', (event) => {
        if (event.key === AUTH_SYNC_STORAGE_KEY) {
            void handleSyncEvent(pinia, router, parseAuthSyncEvent(event.newValue))
        }
    })

    if (typeof BroadcastChannel !== 'undefined') {
        authSyncChannel ??= new BroadcastChannel(AUTH_SYNC_CHANNEL_NAME)
        authSyncChannel.onmessage = (messageEvent: MessageEvent<AuthSyncEvent>) => {
            void handleSyncEvent(pinia, router, messageEvent.data)
        }
    }

    initialized = true
}
