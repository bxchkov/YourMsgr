import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clearCryptoKeys,
    decryptMessageE2EE,
    decryptPrivateKeyWithPassword,
    derivePublicKeyFromPrivateKey,
    encryptMessageE2EE,
    encryptPrivateKeyWithPassword,
    generateKeyPair,
    initCrypto,
    savePrivateKey,
} from '@/composables/useCrypto'

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

function toUrlSafeBase64(value: string) {
    return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

describe('useCrypto', () => {
    beforeEach(async () => {
        const sessionStorage = new MemoryStorage()
        const localStorage = new MemoryStorage()

        vi.stubGlobal('window', {
            sessionStorage,
            localStorage,
        })

        await initCrypto()
        clearCryptoKeys()
    })

    afterEach(() => {
        clearCryptoKeys()
        vi.unstubAllGlobals()
    })

    it('round-trips the encrypted private key payload', async () => {
        const keys = generateKeyPair()

        const encrypted = await encryptPrivateKeyWithPassword(keys.privateKey, 'Audit1234')
        const decrypted = await decryptPrivateKeyWithPassword(encrypted, 'Audit1234')

        expect(decrypted).toBe(keys.privateKey)
    })

    it('handles url-safe base64 keys in private E2EE messages', () => {
        const senderKeys = generateKeyPair()
        const recipientKeys = generateKeyPair()

        expect(derivePublicKeyFromPrivateKey(toUrlSafeBase64(senderKeys.privateKey))).toBe(senderKeys.publicKey)

        savePrivateKey(toUrlSafeBase64(senderKeys.privateKey))
        const cipher = encryptMessageE2EE('private-message-smoke', recipientKeys.publicKey)

        savePrivateKey(toUrlSafeBase64(recipientKeys.privateKey))
        const restored = decryptMessageE2EE(
            cipher.encrypted,
            cipher.nonce,
            senderKeys.publicKey,
        )

        expect(restored).toBe('private-message-smoke')
    })
})
