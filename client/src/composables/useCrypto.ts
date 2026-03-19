import nacl from 'tweetnacl'

let initialized = false

export const PRIVATE_KEY_STORAGE_KEY = 'e2ee_private_key'
export const PUBLIC_KEY_STORAGE_KEY = 'e2ee_public_key'
export const SECURE_PASSWORD_ENCRYPTION_ERROR = 'Secure password encryption requires HTTPS'

const PASSWORD_CIPHER_VERSION = 'v3'
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_SALT_BYTES = 16
const AES_GCM_IV_BYTES = 12

type PasswordEncryptedPrivateKey = {
    encrypted: string
    iv: string
    salt: string
}

function getCryptoStorage() {
    if (typeof window === 'undefined') {
        return null
    }

    return window.sessionStorage
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
): Promise<PasswordEncryptedPrivateKey> {
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

async function decryptPrivateKeyWithWebCrypto(
    data: PasswordEncryptedPrivateKey,
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

    return bytesToString(new Uint8Array(decrypted))
}

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

export function savePrivateKey(key: string): void {
    const storage = getCryptoStorage()
    if (!storage) {
        return
    }

    storage.setItem(PRIVATE_KEY_STORAGE_KEY, key)
}

export function getPrivateKey(): string | null {
    return getCryptoStorage()?.getItem(PRIVATE_KEY_STORAGE_KEY) ?? null
}

export function savePublicKey(key: string): void {
    const storage = getCryptoStorage()
    if (!storage) {
        return
    }

    storage.setItem(PUBLIC_KEY_STORAGE_KEY, key)
}

export function getPublicKey(): string | null {
    return getCryptoStorage()?.getItem(PUBLIC_KEY_STORAGE_KEY) ?? null
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

export function encryptMessageE2EE(
    message: string,
    recipientPublicKeyBase64: string,
): { encrypted: string; nonce: string } {
    ensureInitialized()
    const privateKeyBase64 = getPrivateKey()
    if (!privateKeyBase64) {
        throw new Error('Private key not found')
    }

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
    if (!privateKeyBase64) {
        throw new Error('Private key not found')
    }

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

export async function encryptPrivateKeyWithPassword(
    privateKeyBase64: string,
    password: string,
): Promise<PasswordEncryptedPrivateKey> {
    return encryptPrivateKeyWithWebCrypto(privateKeyBase64, password)
}

export async function decryptPrivateKeyWithPassword(
    data: PasswordEncryptedPrivateKey,
    password: string,
): Promise<string> {
    return decryptPrivateKeyWithWebCrypto(data, password)
}
