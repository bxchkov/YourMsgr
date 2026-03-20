import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
    AUTH_SESSION_HINT_STORAGE_KEY,
    AUTH_STORAGE_KEY,
    useAuthStore,
} from '@/stores/auth'

class MemoryStorage implements Storage {
    private storage = new Map<string, string>()

    get length() {
        return this.storage.size
    }

    clear() {
        this.storage.clear()
    }

    getItem(key: string) {
        return this.storage.get(key) ?? null
    }

    key(index: number) {
        return Array.from(this.storage.keys())[index] ?? null
    }

    removeItem(key: string) {
        this.storage.delete(key)
    }

    setItem(key: string, value: string) {
        this.storage.set(key, value)
    }
}

function createJwt(payload: Record<string, unknown>) {
    const encode = (value: Record<string, unknown>) => Buffer
        .from(JSON.stringify(value))
        .toString('base64url')

    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

describe('auth store', () => {
    beforeEach(() => {
        const sessionStorage = new MemoryStorage()
        const localStorage = new MemoryStorage()

        vi.stubGlobal('window', {
            sessionStorage,
            localStorage,
        })
        vi.stubGlobal('sessionStorage', sessionStorage)
        vi.stubGlobal('localStorage', localStorage)
        setActivePinia(createPinia())
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('migrates a legacy localStorage token into sessionStorage', () => {
        const legacyToken = createJwt({
            userId: 11,
            userName: 'audit-user',
            login: 'audituser',
            userRole: 1,
        })

        localStorage.setItem(AUTH_STORAGE_KEY, legacyToken)

        const auth = useAuthStore()

        expect(auth.token).toBe(legacyToken)
        expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBe(legacyToken)
        expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    })

    it('stores access tokens in sessionStorage and clears them on logout', () => {
        const accessToken = createJwt({
            userId: 7,
            userName: 'alpha123',
            login: 'alpha123',
            userRole: 3,
        })

        const auth = useAuthStore()
        auth.setAuth(accessToken)

        expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBe(accessToken)
        expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
        expect(localStorage.getItem(AUTH_SESSION_HINT_STORAGE_KEY)).toBe('1')

        auth.logout()

        expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
        expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
        expect(localStorage.getItem(AUTH_SESSION_HINT_STORAGE_KEY)).toBeNull()
    })
})
