import _sodium from 'libsodium-wrappers'

let sodiumReady = false

export const PRIVATE_KEY_STORAGE_KEY = 'e2ee_private_key'
export const PUBLIC_KEY_STORAGE_KEY = 'e2ee_public_key'

function getCryptoStorage() {
    if (typeof window === 'undefined') {
        return null
    }

    return window.sessionStorage
}

function migrateLegacyKey(storageKey: string) {
    if (typeof window === 'undefined') {
        return null
    }

    const sessionValue = window.sessionStorage.getItem(storageKey)
    if (sessionValue) {
        return sessionValue
    }

    const legacyValue = window.localStorage.getItem(storageKey)
    if (legacyValue) {
        window.sessionStorage.setItem(storageKey, legacyValue)
        window.localStorage.removeItem(storageKey)
        return legacyValue
    }

    return null
}

export async function initCrypto(): Promise<void> {
    if (sodiumReady) return
    await _sodium.ready
    sodiumReady = true
}

// --- Key generation ---

export function generateKeyPair(): { publicKey: string; privateKey: string } {
    const sodium = _sodium
    const keyPair = sodium.crypto_box_keypair()
    return {
        publicKey: sodium.to_base64(keyPair.publicKey),
        privateKey: sodium.to_base64(keyPair.privateKey),
    }
}

export function derivePublicKeyFromPrivateKey(privateKeyBase64: string): string {
    const sodium = _sodium
    const privateKey = sodium.from_base64(privateKeyBase64)
    const publicKey = sodium.crypto_scalarmult_base(privateKey)
    return sodium.to_base64(publicKey)
}

// --- Key storage ---

export function savePrivateKey(key: string): void {
    const storage = getCryptoStorage()
    if (!storage) {
        return
    }

    storage.setItem(PRIVATE_KEY_STORAGE_KEY, key)
    localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY)
}

export function getPrivateKey(): string | null {
    return migrateLegacyKey(PRIVATE_KEY_STORAGE_KEY)
}

export function savePublicKey(key: string): void {
    const storage = getCryptoStorage()
    if (!storage) {
        return
    }

    storage.setItem(PUBLIC_KEY_STORAGE_KEY, key)
    localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY)
}

export function getPublicKey(): string | null {
    return migrateLegacyKey(PUBLIC_KEY_STORAGE_KEY)
}

export function clearCryptoKeys(): void {
    if (typeof window === 'undefined') {
        return
    }

    window.sessionStorage.removeItem(PRIVATE_KEY_STORAGE_KEY)
    window.sessionStorage.removeItem(PUBLIC_KEY_STORAGE_KEY)
    window.localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY)
    window.localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY)
}

// --- Message encryption (E2EE using NaCl box) ---

export function encryptMessageE2EE(
    message: string,
    recipientPublicKeyBase64: string,
): { encrypted: string; nonce: string } {
    const sodium = _sodium
    const privateKeyBase64 = getPrivateKey()
    if (!privateKeyBase64) throw new Error('Private key not found')

    const privateKey = sodium.from_base64(privateKeyBase64)
    const recipientPublicKey = sodium.from_base64(recipientPublicKeyBase64)
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)
    const messageBytes = sodium.from_string(message)

    const encrypted = sodium.crypto_box_easy(messageBytes, nonce, recipientPublicKey, privateKey)

    return {
        encrypted: sodium.to_base64(encrypted),
        nonce: sodium.to_base64(nonce),
    }
}

export function decryptMessageE2EE(
    encryptedBase64: string,
    nonceBase64: string,
    senderPublicKeyBase64: string,
): string {
    const sodium = _sodium
    const privateKeyBase64 = getPrivateKey()
    if (!privateKeyBase64) throw new Error('Private key not found')

    const privateKey = sodium.from_base64(privateKeyBase64)
    const senderPublicKey = sodium.from_base64(senderPublicKeyBase64)
    const nonce = sodium.from_base64(nonceBase64)
    const encrypted = sodium.from_base64(encryptedBase64)

    const decrypted = sodium.crypto_box_open_easy(encrypted, nonce, senderPublicKey, privateKey)
    return sodium.to_string(decrypted)
}

// --- Password-based private key encryption (PBKDF2 + AES-GCM) ---

export async function encryptPrivateKeyWithPassword(
    privateKeyBase64: string,
    password: string,
): Promise<{ encrypted: string; iv: string; salt: string }> {
    const encoder = new TextEncoder()
    const salt = crypto.getRandomValues(new Uint8Array(16))

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey'],
    )

    const derivedKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
    )

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        encoder.encode(privateKeyBase64),
    )

    return {
        encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv)),
        salt: btoa(String.fromCharCode(...salt)),
    }
}

export async function decryptPrivateKeyWithPassword(
    data: { encrypted: string; iv: string; salt: string },
    password: string,
): Promise<string> {
    const encoder = new TextEncoder()
    const salt = new Uint8Array(atob(data.salt).split('').map(c => c.charCodeAt(0)))
    const iv = new Uint8Array(atob(data.iv).split('').map(c => c.charCodeAt(0)))
    const encrypted = new Uint8Array(atob(data.encrypted).split('').map(c => c.charCodeAt(0)))

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey'],
    )

    const derivedKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
    )

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        encrypted,
    )

    return new TextDecoder().decode(decrypted)
}
