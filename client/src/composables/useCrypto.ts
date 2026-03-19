import _sodium from 'libsodium-wrappers-sumo'

let sodiumReady = false

export const PRIVATE_KEY_STORAGE_KEY = 'e2ee_private_key'
export const PUBLIC_KEY_STORAGE_KEY = 'e2ee_public_key'
const PASSWORD_CIPHER_VERSION = 'v2'
export const LEGACY_PRIVATE_KEY_HTTPS_ERROR = 'Legacy private key requires HTTPS'

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

function encodeVersionedCiphertext(ciphertextBase64: string): string {
    return `${PASSWORD_CIPHER_VERSION}:${ciphertextBase64}`
}

function decodeVersionedCiphertext(ciphertext: string): { version: string; payload: string } | null {
    const separatorIndex = ciphertext.indexOf(':')
    if (separatorIndex <= 0) {
        return null
    }

    return {
        version: ciphertext.slice(0, separatorIndex),
        payload: ciphertext.slice(separatorIndex + 1),
    }
}

function hasWebCryptoSubtleSupport(): boolean {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'
}

function getPasswordCryptoSodium() {
    const sodium = _sodium

    if (
        typeof sodium.crypto_pwhash !== 'function'
        || typeof sodium.crypto_pwhash_SALTBYTES !== 'number'
        || typeof sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE !== 'number'
        || typeof sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE !== 'number'
        || typeof sodium.crypto_pwhash_ALG_DEFAULT !== 'number'
    ) {
        throw new Error('Crypto password hashing is unavailable')
    }

    return sodium
}

async function derivePasswordKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
    await initCrypto()
    const sodium = getPasswordCryptoSodium()

    return sodium.crypto_pwhash(
        sodium.crypto_secretbox_KEYBYTES,
        password,
        salt,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_DEFAULT,
    )
}

async function encryptPrivateKeyWithSodium(
    privateKeyBase64: string,
    password: string,
): Promise<{ encrypted: string; iv: string; salt: string }> {
    await initCrypto()
    const sodium = getPasswordCryptoSodium()
    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
    const key = await derivePasswordKey(password, salt)
    const encrypted = sodium.crypto_secretbox_easy(
        sodium.from_string(privateKeyBase64),
        nonce,
        key,
    )

    return {
        encrypted: encodeVersionedCiphertext(sodium.to_base64(encrypted)),
        iv: sodium.to_base64(nonce),
        salt: sodium.to_base64(salt),
    }
}

async function decryptPrivateKeyWithSodium(
    data: { encrypted: string; iv: string; salt: string },
    password: string,
): Promise<string> {
    await initCrypto()
    const sodium = getPasswordCryptoSodium()
    const nonce = sodium.from_base64(data.iv)
    const salt = sodium.from_base64(data.salt)
    const versionedCiphertext = decodeVersionedCiphertext(data.encrypted)

    if (!versionedCiphertext || versionedCiphertext.version !== PASSWORD_CIPHER_VERSION) {
        throw new Error('Unsupported password cipher version')
    }

    const encrypted = sodium.from_base64(versionedCiphertext.payload)
    const key = await derivePasswordKey(password, salt)
    const decrypted = sodium.crypto_secretbox_open_easy(encrypted, nonce, key)

    return sodium.to_string(decrypted)
}

async function decryptPrivateKeyWithLegacyWebCrypto(
    data: { encrypted: string; iv: string; salt: string },
    password: string,
): Promise<string> {
    if (!hasWebCryptoSubtleSupport()) {
        throw new Error(LEGACY_PRIVATE_KEY_HTTPS_ERROR)
    }

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
    return encryptPrivateKeyWithSodium(privateKeyBase64, password)
}

export async function decryptPrivateKeyWithPassword(
    data: { encrypted: string; iv: string; salt: string },
    password: string,
): Promise<string> {
    const versionedCiphertext = decodeVersionedCiphertext(data.encrypted)

    if (versionedCiphertext?.version === PASSWORD_CIPHER_VERSION) {
        return decryptPrivateKeyWithSodium(data, password)
    }

    return decryptPrivateKeyWithLegacyWebCrypto(data, password)
}
