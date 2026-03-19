import nacl from 'tweetnacl'

const BASE_URL = process.env.YOURMSGR_BASE_URL || 'http://localhost'
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_SALT_BYTES = 16
const AES_GCM_IV_BYTES = 12

function bytesToBase64(bytes) {
    return Buffer.from(bytes).toString('base64')
}

function base64ToBytes(value) {
    const normalizedValue = value
        .trim()
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .replace(/\s+/g, '')
    const paddedValue = normalizedValue.padEnd(Math.ceil(normalizedValue.length / 4) * 4, '=')
    return new Uint8Array(Buffer.from(paddedValue, 'base64'))
}

function stringToBytes(value) {
    return new TextEncoder().encode(value)
}

function bytesToString(value) {
    return new TextDecoder().decode(value)
}

async function deriveKey(password, salt, usage) {
    const keyMaterial = await crypto.subtle.importKey('raw', stringToBytes(password), 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        [usage],
    )
}

async function encryptPrivateKey(privateKeyBase64, password) {
    const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES))
    const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
    const derivedKey = await deriveKey(password, salt, 'encrypt')
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        stringToBytes(privateKeyBase64),
    )

    return {
        encrypted: `v3:${bytesToBase64(new Uint8Array(encrypted))}`,
        iv: bytesToBase64(iv),
        salt: bytesToBase64(salt),
    }
}

async function decryptPrivateKey(data, password) {
    const versionedCiphertext = data.encrypted.split(':', 2)
    if (versionedCiphertext[0] !== 'v3' || !versionedCiphertext[1]) {
        throw new Error('Unsupported password cipher version')
    }

    const salt = base64ToBytes(data.salt)
    const iv = base64ToBytes(data.iv)
    const encrypted = base64ToBytes(versionedCiphertext[1])
    const derivedKey = await deriveKey(password, salt, 'decrypt')
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, derivedKey, encrypted)
    return bytesToString(new Uint8Array(decrypted))
}

function generateKeyPair() {
    const keyPair = nacl.box.keyPair()
    return {
        publicKey: bytesToBase64(keyPair.publicKey),
        privateKey: bytesToBase64(keyPair.secretKey),
    }
}

function encryptMessage(message, recipientPublicKeyBase64, senderPrivateKeyBase64) {
    const senderPrivateKey = base64ToBytes(senderPrivateKeyBase64)
    const recipientPublicKey = base64ToBytes(recipientPublicKeyBase64)
    const nonce = nacl.randomBytes(nacl.box.nonceLength)
    const encrypted = nacl.box(stringToBytes(message), nonce, recipientPublicKey, senderPrivateKey)
    return {
        encrypted: bytesToBase64(encrypted),
        nonce: bytesToBase64(nonce),
    }
}

function decryptMessage(encryptedBase64, nonceBase64, senderPublicKeyBase64, recipientPrivateKeyBase64) {
    const senderPublicKey = base64ToBytes(senderPublicKeyBase64)
    const recipientPrivateKey = base64ToBytes(recipientPrivateKeyBase64)
    const nonce = base64ToBytes(nonceBase64)
    const encrypted = base64ToBytes(encryptedBase64)
    const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, recipientPrivateKey)

    if (!decrypted) {
        throw new Error('Failed to decrypt smoke message')
    }

    return bytesToString(decrypted)
}

async function api(path, options = {}) {
    const response = await fetch(`${BASE_URL}${path}`, options)
    const data = await response.json().catch(() => null)
    return { response, data }
}

async function registerUser(prefix) {
    const suffix = Math.random().toString(36).slice(2, 8)
    const login = `${prefix}${suffix}`.slice(0, 12)
    const password = 'Audit1234'
    const username = login
    const keys = generateKeyPair()
    const encryptedKey = await encryptPrivateKey(keys.privateKey, password)

    const { response, data } = await api('/auth/registration', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            login,
            password,
            username,
            publicKey: keys.publicKey,
            encryptedPrivateKey: encryptedKey.encrypted,
            encryptedPrivateKeyIv: encryptedKey.iv,
            encryptedPrivateKeySalt: encryptedKey.salt,
        }),
    })

    if (!response.ok) {
        throw new Error(`Registration failed for ${login}: ${response.status} ${JSON.stringify(data)}`)
    }

    const cookie = (response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '').split(';')[0]

    return {
        login,
        password,
        username,
        keys,
        accessToken: data?.data?.accessToken,
        cookie,
    }
}

async function loginUser(login, password) {
    const { response, data } = await api('/auth/login', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({ login, password }),
    })

    if (!response.ok) {
        throw new Error(`Login failed for ${login}: ${response.status} ${JSON.stringify(data)}`)
    }

    const cookie = (response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '').split(';')[0]

    return {
        accessToken: data?.data?.accessToken,
        encryptedPrivateKey: data?.data?.encryptedPrivateKey,
        encryptedPrivateKeyIv: data?.data?.encryptedPrivateKeyIv,
        encryptedPrivateKeySalt: data?.data?.encryptedPrivateKeySalt,
        cookie,
    }
}

function connectWs(cookie) {
    const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/ws'

    return new Promise((resolve, reject) => {
        const socket = new WebSocket(wsUrl, {
            headers: {
                Cookie: cookie,
            },
        })
        const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 7000)

        socket.addEventListener('open', () => {
            clearTimeout(timeout)
            resolve(socket)
        })
        socket.addEventListener('error', (event) => {
            clearTimeout(timeout)
            reject(event.error || new Error('WebSocket connection failed'))
        })
    })
}

function waitForMessage(socket, predicate, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            socket.removeEventListener('message', handleMessage)
            reject(new Error('WebSocket message timeout'))
        }, timeoutMs)

        function handleMessage(event) {
            const payload = JSON.parse(event.data.toString())
            if (!predicate(payload)) {
                return
            }

            clearTimeout(timeout)
            socket.removeEventListener('message', handleMessage)
            resolve(payload)
        }

        socket.addEventListener('message', handleMessage)
    })
}

async function main() {
    const alice = await registerUser(process.env.YOURMSGR_SMOKE_PREFIX || 'smokea')
    const bob = await registerUser(process.env.YOURMSGR_SMOKE_PREFIX || 'smokeb')

    const aliceLogin = await loginUser(alice.login, alice.password)
    const bobLogin = await loginUser(bob.login, bob.password)
    const alicePrivateKey = await decryptPrivateKey(
        {
            encrypted: aliceLogin.encryptedPrivateKey,
            iv: aliceLogin.encryptedPrivateKeyIv,
            salt: aliceLogin.encryptedPrivateKeySalt,
        },
        alice.password,
    )
    const bobPrivateKey = await decryptPrivateKey(
        {
            encrypted: bobLogin.encryptedPrivateKey,
            iv: bobLogin.encryptedPrivateKeyIv,
            salt: bobLogin.encryptedPrivateKeySalt,
        },
        bob.password,
    )

    const publicKeysResult = await api('/auth/publicKeys', {
        headers: {
            Authorization: `Bearer ${aliceLogin.accessToken}`,
            Cookie: aliceLogin.cookie,
        },
    })

    if (!publicKeysResult.response.ok) {
        throw new Error(`Public keys fetch failed: ${publicKeysResult.response.status} ${JSON.stringify(publicKeysResult.data)}`)
    }

    const bobPublicKey = publicKeysResult.data.data.publicKeys.find((entry) => entry.username === bob.username)
    if (!bobPublicKey) {
        throw new Error('Recipient public key not found')
    }

    const chatResult = await api('/api/private-chats', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${aliceLogin.accessToken}`,
            Cookie: aliceLogin.cookie,
        },
        body: JSON.stringify({ otherUserId: bobPublicKey.userId }),
    })

    if (!chatResult.response.ok) {
        throw new Error(`Private chat creation failed: ${chatResult.response.status} ${JSON.stringify(chatResult.data)}`)
    }

    const chatId = chatResult.data.data.chat.id
    const aliceSocket = await connectWs(aliceLogin.cookie)
    const bobSocket = await connectWs(bobLogin.cookie)

    const plaintext = `smoke-private-e2ee-${Date.now()}`
    const cipher = encryptMessage(plaintext, bobPublicKey.publicKey, alicePrivateKey)
    const bobReceivePromise = waitForMessage(
        bobSocket,
        (payload) => payload.type === 'send_message' && payload.chatId === chatId && payload.isEncrypted === 1,
    )

    aliceSocket.send(JSON.stringify({
        type: 'send_message',
        accessToken: aliceLogin.accessToken,
        message: cipher.encrypted,
        chatId,
        recipientId: bobPublicKey.userId,
        nonce: cipher.nonce,
        senderPublicKey: alice.keys.publicKey,
        isEncrypted: 1,
        replyToMessageId: null,
    }))

    const receivedMessage = await bobReceivePromise
    const restored = decryptMessage(
        receivedMessage.message,
        receivedMessage.nonce,
        receivedMessage.senderPublicKey,
        bobPrivateKey,
    )

    aliceSocket.close()
    bobSocket.close()

    console.log(JSON.stringify({
        success: true,
        baseUrl: BASE_URL,
        accounts: {
            alice: alice.login,
            bob: bob.login,
        },
        chatId,
        plaintext,
        restored,
        messageId: receivedMessage.id,
    }, null, 2))
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
