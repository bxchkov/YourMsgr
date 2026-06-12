import nacl from 'tweetnacl'

const BASE_URL = process.env.YOURMSGR_BASE_URL || 'https://localhost'
const PASSWORD = 'Audit1234'
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

function generateKeyPair() {
    const keyPair = nacl.box.keyPair()
    return {
        publicKey: bytesToBase64(keyPair.publicKey),
        privateKey: bytesToBase64(keyPair.secretKey),
    }
}

async function api(path, options = {}) {
    const response = await fetch(`${BASE_URL}${path}`, options)
    const data = await response.json().catch(() => null)
    return { response, data }
}

async function registerUser(login, username) {
    const keys = generateKeyPair()
    const encryptedKey = await encryptPrivateKey(keys.privateKey, PASSWORD)
    const { response, data } = await api('/auth/registration', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            login,
            password: PASSWORD,
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

    return { login, username, keys }
}

async function loginUser(login) {
    const { response, data } = await api('/auth/login', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({ login, password: PASSWORD }),
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

function sendGroupMessage(socket, accessToken, message) {
    socket.send(JSON.stringify({
        type: 'send_message',
        accessToken,
        message,
        replyToMessageId: null,
        isEncrypted: 0,
    }))
}

function sendPlainPrivateMessage(socket, accessToken, message, chatId, recipientId) {
    socket.send(JSON.stringify({
        type: 'send_message',
        accessToken,
        message,
        chatId,
        recipientId,
        isEncrypted: 0,
        replyToMessageId: null,
    }))
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
    const suffix = Math.random().toString(36).slice(2, 6)
    const firstLogin = `mih${suffix}`
    const secondLogin = `ann${suffix}`

    const first = await registerUser(firstLogin, firstLogin)
    const second = await registerUser(secondLogin, secondLogin)

    const firstSession = await loginUser(first.login)
    const secondSession = await loginUser(second.login)

    const publicKeysResult = await api('/auth/publicKeys', {
        headers: {
            Authorization: `Bearer ${firstSession.accessToken}`,
            Cookie: firstSession.cookie,
        },
    })

    if (!publicKeysResult.response.ok) {
        throw new Error(`Public keys fetch failed: ${publicKeysResult.response.status} ${JSON.stringify(publicKeysResult.data)}`)
    }

    const firstPublic = publicKeysResult.data?.data?.publicKeys.find((entry) => entry.username === first.username)
    const secondPublic = publicKeysResult.data?.data?.publicKeys.find((entry) => entry.username === second.username)

    if (!firstPublic || !secondPublic) {
        throw new Error('Required public keys were not found')
    }

    const chatResult = await api('/api/private-chats', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${firstSession.accessToken}`,
            Cookie: firstSession.cookie,
        },
        body: JSON.stringify({ otherUserId: secondPublic.userId }),
    })

    if (!chatResult.response.ok) {
        throw new Error(`Private chat creation failed: ${chatResult.response.status} ${JSON.stringify(chatResult.data)}`)
    }

    const chatId = chatResult.data?.data?.chat?.id
    if (!chatId) {
        throw new Error('Private chat id is missing')
    }

    const firstSocket = await connectWs(firstSession.cookie)
    const secondSocket = await connectWs(secondSession.cookie)

    const groupMessages = [
        { socket: firstSocket, token: firstSession.accessToken, text: '\u041a\u043e\u043b\u043b\u0435\u0433\u0438, \u044f \u043e\u0431\u043d\u043e\u0432\u0438\u043b \u043f\u0440\u0435\u0437\u0435\u043d\u0442\u0430\u0446\u0438\u044e \u0438 \u0434\u043e\u0431\u0430\u0432\u0438\u043b \u0440\u0435\u0430\u043b\u044c\u043d\u044b\u0435 \u0442\u0430\u0431\u043b\u0438\u0446\u044b \u043f\u043e \u0431\u0430\u0437\u0435 \u0434\u0430\u043d\u043d\u044b\u0445.' },
        { socket: secondSocket, token: secondSession.accessToken, text: '\u041e\u0442\u043b\u0438\u0447\u043d\u043e. \u0421\u043b\u0430\u0439\u0434 \u0441 \u0438\u0441\u043f\u044b\u0442\u0430\u043d\u0438\u044f\u043c\u0438 \u0442\u043e\u0436\u0435 \u0441\u0442\u0430\u043b \u0433\u043e\u0440\u0430\u0437\u0434\u043e \u043a\u043e\u043d\u043a\u0440\u0435\u0442\u043d\u0435\u0435.' },
        { socket: firstSocket, token: firstSession.accessToken, text: '\u0414\u0430, \u0442\u0435\u043f\u0435\u0440\u044c \u043d\u0430 \u0441\u043b\u0430\u0439\u0434\u0430\u0445 \u0435\u0441\u0442\u044c \u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u043f\u043e\u043b\u044f \u0411\u0414 \u0438 \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u043d\u044b\u0435 \u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0435 \u043a\u0435\u0439\u0441\u044b.' },
        { socket: secondSocket, token: secondSession.accessToken, text: '\u0412 \u0442\u0430\u043a\u043e\u043c \u0432\u0438\u0434\u0435 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b \u0432\u044b\u0433\u043b\u044f\u0434\u0438\u0442 \u0443\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044c\u043d\u043e \u0438 \u0445\u043e\u0440\u043e\u0448\u043e \u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f \u043d\u0430 \u0437\u0430\u0449\u0438\u0442\u0435.' },
    ]

    for (const item of groupMessages) {
        sendGroupMessage(item.socket, item.token, item.text)
        await sleep(250)
    }

    const privateMessages = [
        {
            socket: firstSocket,
            token: firstSession.accessToken,
            text: '\u041f\u043e\u0441\u043c\u043e\u0442\u0440\u0438, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043b\u0438\u0447\u043d\u044b\u0439 \u0447\u0430\u0442. \u0425\u043e\u0447\u0443 \u0443\u0431\u0435\u0434\u0438\u0442\u044c\u0441\u044f, \u0447\u0442\u043e \u0437\u0430\u0449\u0438\u0449\u0435\u043d\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0430\u0435\u0442\u0441\u044f \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u043e.',
            recipientId: secondPublic.userId,
        },
        {
            socket: secondSocket,
            token: secondSession.accessToken,
            text: '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u043b. \u0412\u0441\u0435 \u043d\u043e\u0440\u043c\u0430\u043b\u044c\u043d\u043e: \u043f\u0435\u0440\u0435\u043f\u0438\u0441\u043a\u0430 \u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f, \u0430 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441 \u0432 \u0441\u0432\u0435\u0442\u043b\u043e\u0439 \u0442\u0435\u043c\u0435 \u0432\u044b\u0433\u043b\u044f\u0434\u0438\u0442 \u043b\u0443\u0447\u0448\u0435.',
            recipientId: firstPublic.userId,
        },
        {
            socket: firstSocket,
            token: firstSession.accessToken,
            text: '\u041e\u0442\u043b\u0438\u0447\u043d\u043e, \u0442\u043e\u0433\u0434\u0430 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u044e \u044d\u0442\u0438 \u044d\u043a\u0440\u0430\u043d\u044b \u0432 \u043f\u0440\u0435\u0437\u0435\u043d\u0442\u0430\u0446\u0438\u0438.',
            recipientId: secondPublic.userId,
        },
    ]

    for (const item of privateMessages) {
        sendPlainPrivateMessage(item.socket, item.token, item.text, chatId, item.recipientId)
        await sleep(350)
    }

    await sleep(1200)
    firstSocket.close()
    secondSocket.close()

    console.log(JSON.stringify({
        success: true,
        baseUrl: BASE_URL,
        password: PASSWORD,
        accounts: {
            first: first.login,
            second: second.login,
        },
        chatId,
    }, null, 2))
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
