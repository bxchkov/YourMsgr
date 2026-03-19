import nacl from 'tweetnacl'

let initialized = false
let sumoReadyPromise: Promise<PasswordCryptoSodium> | null = null

export const PRIVATE_KEY_STORAGE_KEY = 'e2ee_private_key'
export const PUBLIC_KEY_STORAGE_KEY = 'e2ee_public_key'
const PASSWORD_CIPHER_VERSION = 'v3'
const LEGACY_SODIUM_PASSWORD_CIPHER_VERSION = 'v2'
export const LEGACY_PRIVATE_KEY_HTTPS_ERROR = 'Legacy private key requires HTTPS'
const SECURE_PASSWORD_ENCRYPTION_ERROR = 'Secure password encryption requires HTTPS'
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_SALT_BYTES = 16
const AES_GCM_IV_BYTES = 12

type PasswordCryptoSodium = {
    ready: Promise<unknown>
    crypto_pwhash: (
        outlen: number,
        password: string,
        salt: Uint8Array,
        opslimit: number,
        memlimit: number,
        alg: number,
    ) => Uint8Array
    crypto_pwhash_SALTBYTES: number
    crypto_pwhash_OPSLIMIT_INTERACTIVE: number
    crypto_pwhash_MEMLIMIT_INTERACTIVE: number
    crypto_pwhash_ALG_DEFAULT: number
    crypto_secretbox_KEYBYTES: number
    crypto_secretbox_NONCEBYTES: number
    randombytes_buf: (size: number) => Uint8Array
    crypto_secretbox_easy: (message: Uint8Array, nonce: Uint8Array, key: Uint8Array) => Uint8Array
    crypto_secretbox_open_easy: (ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array) => Uint8Array
    from_string: (value: string) => Uint8Array
    to_string: (value: Uint8Array) => string
    from_base64: (value: string) => Uint8Array
    to_base64: (value: Uint8Array) => string
}

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
    initialized = true
}

function ensureInitialized() {
    if (!initialized) {
        initialized = true
    }
}

function encodeVersionedCiphertext(ciphertextBase64: string, version = PASSWORD_CIPHER_VERSION): string {
    return `${version}:${ciphertextBase64}`
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

function bytesToBase64(bytes: Uint8Array): string {
    let binary = ''
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte)
    })
    return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

function stringToBytes(value: string): Uint8Array {
    return new TextEncoder().encode(value)
}

function bytesToString(value: Uint8Array): string {
    return new TextDecoder().decode(value)
}

async function loadPasswordCryptoSodium(): Promise<PasswordCryptoSodium> {
    if (!sumoReadyPromise) {
        sumoReadyPromise = import('libsodium-wrappers-sumo').then(async (module) => {
            const sodium = module.default as unknown as PasswordCryptoSodium
            await sodium.ready
            return sodium
        })
    }

    const sodium = await sumoReadyPromise

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

async function deriveSodiumPasswordKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
    const sodium = await loadPasswordCryptoSodium()

    return sodium.crypto_pwhash(
        sodium.crypto_secretbox_KEYBYTES,
        password,
        salt,
        sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
        sodium.crypto_pwhash_ALG_DEFAULT,
    )
}

async function decryptPrivateKeyWithSodium(
    data: { encrypted: string; iv: string; salt: string },
    password: string,
): Promise<string> {
    const sodium = await loadPasswordCryptoSodium()
    const nonce = sodium.from_base64(data.iv)
    const salt = sodium.from_base64(data.salt)
    const versionedCiphertext = decodeVersionedCiphertext(data.encrypted)

    if (!versionedCiphertext || versionedCiphertext.version !== LEGACY_SODIUM_PASSWORD_CIPHER_VERSION) {
        throw new Error('Unsupported password cipher version')
    }

    const encrypted = sodium.from_base64(versionedCiphertext.payload)
    const key = await deriveSodiumPasswordKey(password, salt)
    const decrypted = sodium.crypto_secretbox_open_easy(encrypted, nonce, key)

    return sodium.to_string(decrypted)
}

async function deriveWebCryptoKey(
    password: string,
    salt: Uint8Array,
    usage: KeyUsage,
): Promise<CryptoKey> {
    if (!hasWebCryptoSubtleSupport()) {
        throw new Error(SECURE_PASSWORD_ENCRYPTION_ERROR)
    }

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        stringToBytes(password),
        'PBKDF2',
        false,
        ['deriveKey'],
    )

    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        [usage],
    )
}

async function encryptPrivateKeyWithWebCrypto(
    privateKeyBase64: string,
    password: string,
): Promise<{ encrypted: string; iv: string; salt: string }> {
    if (!hasWebCryptoSubtleSupport()) {
        throw new Error(SECURE_PASSWORD_ENCRYPTION_ERROR)
    }

    const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES))
    const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
    const derivedKey = await deriveWebCryptoKey(password, salt, 'encrypt')
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        stringToBytes(privateKeyBase64),
    )

    return {
        encrypted: encodeVersionedCiphertext(bytesToBase64(new Uint8Array(encrypted))),
        iv: bytesToBase64(iv),
        salt: bytesToBase64(salt),
    }
}

async function decryptPrivateKeyWithVersionedWebCrypto(
    data: { encrypted: string; iv: string; salt: string },
    password: string,
): Promise<string> {
    if (!hasWebCryptoSubtleSupport()) {
        throw new Error(SECURE_PASSWORD_ENCRYPTION_ERROR)
    }

    const versionedCiphertext = decodeVersionedCiphertext(data.encrypted)
    if (!versionedCiphertext || versionedCiphertext.version !== PASSWORD_CIPHER_VERSION) {
        throw new Error('Unsupported password cipher version')
    }

    const salt = base64ToBytes(data.salt)
    const iv = base64ToBytes(data.iv)
    const encrypted = base64ToBytes(versionedCiphertext.payload)
    const derivedKey = await deriveWebCryptoKey(password, salt, 'decrypt')
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        encrypted,
    )

    return new TextDecoder().decode(decrypted)
}

async function decryptPrivateKeyWithLegacyWebCrypto(
    data: { encrypted: string; iv: string; salt: string },
    password: string,
): Promise<string> {
    if (!hasWebCryptoSubtleSupport()) {
        throw new Error(LEGACY_PRIVATE_KEY_HTTPS_ERROR)
    }

    const salt = base64ToBytes(data.salt)
    const iv = base64ToBytes(data.iv)
    const encrypted = base64ToBytes(data.encrypted)
    const derivedKey = await deriveWebCryptoKey(password, salt, 'decrypt')
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        encrypted,
    )

    return new TextDecoder().decode(decrypted)
}

// --- Key generation ---

export function generateKeyPair(): { publicKey: string; privateKey: string } {
    ensureInitialized()
    const keyPair = nacl.box.keyPair()
    return {
        publicKey: bytesToBase64(keyPair.publicKey),
        privateKey: bytesToBase64(keyPair.secretKey),
    }
}

export function derivePublicKeyFromPrivateKey(privateKeyBase64: string): string {
    ensureInitialized()
    const privateKey = base64ToBytes(privateKeyBase64)
    const publicKey = nacl.box.keyPair.fromSecretKey(privateKey).publicKey
    return bytesToBase64(publicKey)
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
    ensureInitialized()
    const privateKeyBase64 = getPrivateKey()
    if (!privateKeyBase64) throw new Error('Private key not found')

    const privateKey = base64ToBytes(privateKeyBase64)
    const recipientPublicKey = base64ToBytes(recipientPublicKeyBase64)
    const nonce = nacl.randomBytes(nacl.box.nonceLength)
    const encrypted = nacl.box(stringToBytes(message), nonce, recipientPublicKey, privateKey)

    return {
        encrypted: bytesToBase64(encrypted),
        nonce: bytesToBase64(nonce),
    }
}

export function decryptMessageE2EE(
    encryptedBase64: string,
    nonceBase64: string,
    senderPublicKeyBase64: string,
): string {
    ensureInitialized()
    const privateKeyBase64 = getPrivateKey()
    if (!privateKeyBase64) throw new Error('Private key not found')

    const privateKey = base64ToBytes(privateKeyBase64)
    const senderPublicKey = base64ToBytes(senderPublicKeyBase64)
    const nonce = base64ToBytes(nonceBase64)
    const encrypted = base64ToBytes(encryptedBase64)
    const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, privateKey)

    if (!decrypted) {
        throw new Error('Failed to decrypt message')
    }

    return bytesToString(decrypted)
}

// --- Password-based private key encryption (PBKDF2 + AES-GCM) ---

export async function encryptPrivateKeyWithPassword(
    privateKeyBase64: string,
    password: string,
): Promise<{ encrypted: string; iv: string; salt: string }> {
    return encryptPrivateKeyWithWebCrypto(privateKeyBase64, password)
}

export async function decryptPrivateKeyWithPassword(
    data: { encrypted: string; iv: string; salt: string },
    password: string,
): Promise<string> {
    const versionedCiphertext = decodeVersionedCiphertext(data.encrypted)

    if (versionedCiphertext?.version === PASSWORD_CIPHER_VERSION) {
        return decryptPrivateKeyWithVersionedWebCrypto(data, password)
    }

    if (versionedCiphertext?.version === LEGACY_SODIUM_PASSWORD_CIPHER_VERSION) {
        return decryptPrivateKeyWithSodium(data, password)
    }

    return decryptPrivateKeyWithLegacyWebCrypto(data, password)
}

export function getPasswordCipherVersion(ciphertext: string): string | null {
    return decodeVersionedCiphertext(ciphertext)?.version ?? null
}
