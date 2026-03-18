import { decryptMessageE2EE } from '@/composables/useCrypto'

export interface MessageContentLike {
    userId: number
    message: string
    recipientId?: number | null
    nonce?: string | null
    senderPublicKey?: string | null
    isEncrypted?: number
    mediaType?: string | null
    mediaName?: string | null
}

interface ResolveMessageTextOptions {
    currentUserId: number
    publicKeys: Record<number, string>
    encryptedFallback?: string
    decryptErrorFallback?: string
}

interface ReplyPreviewOptions extends ResolveMessageTextOptions {
    maxLength?: number
}

function truncateText(value: string, maxLength: number) {
    if (value.length <= maxLength) {
        return value
    }

    return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

export function normalizeMessageText(value?: string | null) {
    return (value ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/^\n+/, '')
        .replace(/\n+$/, '')
        .replace(/\n{3,}/g, '\n\n')
}

export function isEncryptedMessage(message: MessageContentLike) {
    return message.isEncrypted === 1 || (!!message.nonce && !!message.senderPublicKey)
}

export function getMediaLabel(mediaType?: string | null, mediaName?: string | null) {
    if (mediaName) {
        return mediaName
    }

    switch (mediaType) {
        case 'image':
            return 'Фотография'
        case 'video':
            return 'Видео'
        case 'audio':
            return 'Аудио'
        case 'document':
            return 'Документ'
        case 'sticker':
            return 'Стикер'
        default:
            return 'Файл'
    }
}

export function resolveMessageText(message: MessageContentLike, options: ResolveMessageTextOptions) {
    const plainText = normalizeMessageText(message.message)

    if (message.mediaType) {
        const mediaLabel = getMediaLabel(message.mediaType, message.mediaName)
        return plainText ? `${mediaLabel}: ${plainText}` : mediaLabel
    }

    if (!isEncryptedMessage(message)) {
        return plainText
    }

    try {
        const isOwnMessage = Number(message.userId) === options.currentUserId
        let otherPublicKey: string | null | undefined

        if (isOwnMessage) {
            const recipientId = message.recipientId
            if (recipientId) {
                otherPublicKey = options.publicKeys[recipientId]
            }
        } else {
            otherPublicKey = message.senderPublicKey
        }

        if (otherPublicKey && message.nonce) {
            return normalizeMessageText(
                decryptMessageE2EE(message.message, message.nonce, otherPublicKey),
            )
        }

        return options.encryptedFallback ?? '[Защищенное сообщение]'
    } catch {
        return options.decryptErrorFallback ?? '[Ошибка расшифровки]'
    }
}

export function getReplyPreviewText(message: MessageContentLike, options: ReplyPreviewOptions) {
    const previewText = resolveMessageText(message, {
        ...options,
        encryptedFallback: options.encryptedFallback ?? '[Защищенное сообщение]',
        decryptErrorFallback: options.decryptErrorFallback ?? '[Ошибка расшифровки]',
    })

    return truncateText(previewText, options.maxLength ?? 72)
}
