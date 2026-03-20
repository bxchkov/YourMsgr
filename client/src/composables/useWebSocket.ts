import { ref } from 'vue'
import { isTerminalSessionMessage } from '@/constants/auth'
import { useAuthStore } from '@/stores/auth'
import { useChatStore, type Message } from '@/stores/chat'
import { authService } from '@/services/auth'
import { loadGroupMessagesIntoStore, syncPrivateChatsIntoStore } from '@/composables/useChatSync'
import router from '@/router'
import { logger } from '@/utils/logger'
import type {
    SocketIncomingEvent,
    SocketIncomingEventMap,
    SocketIncomingEventType,
    SocketOutgoingEventMap,
    SocketOutgoingEventType,
} from '@/types/socket'

let socket: WebSocket | null = null
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
let isIntentionalClose = false
const eventHandlers = new Map<SocketIncomingEventType, (data: SocketIncomingEvent) => void | Promise<void>>()
const DEBUG_SOCKET_LOGS = import.meta.env.DEV
export const isConnected = ref(false)

const SOCKET_INCOMING_EVENT_TYPES = [
    'load_messages',
    'send_message',
    'delete_message',
    'error',
    'check_session',
    'refresh_tokens',
    'client_logout',
    'sync_group_messages',
    'sync_private_chats',
] as const satisfies readonly SocketIncomingEventType[]

function isSocketIncomingEventType(value: unknown): value is SocketIncomingEventType {
    return typeof value === 'string'
        && (SOCKET_INCOMING_EVENT_TYPES as readonly string[]).includes(value)
}

export function onSocketEvent<K extends SocketIncomingEventType>(
    eventType: K,
    callback: (data: SocketIncomingEventMap[K]) => void | Promise<void>,
) {
    eventHandlers.set(eventType, callback as (data: SocketIncomingEvent) => void | Promise<void>)
}

export function emitSocketEvent<K extends SocketOutgoingEventType>(
    eventType: K,
    data: SocketOutgoingEventMap[K],
) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: eventType, ...data }))
    }
}

export function initSocket() {
    const auth = useAuthStore()
    if (!auth.token) return null
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return socket
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    isIntentionalClose = false
    socket = new WebSocket(wsUrl)

    socket.onopen = () => {
        if (DEBUG_SOCKET_LOGS) {
            logger.log('WebSocket connected')
        }
        isConnected.value = true
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout)
            reconnectTimeout = null
        }
    }

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data) as Partial<SocketIncomingEvent>
            if (!isSocketIncomingEventType(data.type)) {
                return
            }

            const handler = eventHandlers.get(data.type)
            if (handler) {
                void handler(data as SocketIncomingEvent)
            }
        } catch (error) {
            logger.error('WebSocket message error:', error)
        }
    }

    socket.onerror = (error) => {
        logger.error('WebSocket error:', error)
    }

    socket.onclose = () => {
        if (DEBUG_SOCKET_LOGS) {
            logger.log('WebSocket disconnected')
        }
        isConnected.value = false
        socket = null

        if (isIntentionalClose) {
            isIntentionalClose = false
            return
        }

        // Auto-reconnect after 3 seconds
        const auth = useAuthStore()
        reconnectTimeout = setTimeout(() => {
            if (auth.token) {
                initSocket()
            }
        }, 3000)
    }

    return socket
}

export function disconnectSocket() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
    }
    if (socket) {
        isIntentionalClose = true
        socket.close()
        socket = null
    }
    isConnected.value = false
}

/**
 * Setup standard WebSocket event handlers for chat functionality
 */
export function setupSocketHandlers() {
    const chatStore = useChatStore()
    const auth = useAuthStore()

    onSocketEvent('load_messages', (data: { messages: Message[]; isPagination?: boolean; chatType?: 'group' | 'private' }) => {
        if (data.chatType === 'private') {
            if (data.isPagination) {
                chatStore.appendPrivateMessages(data.messages)
            } else {
                chatStore.setPrivateMessages(data.messages)
            }
            return
        }

        const groupMsgs = data.messages.filter(
            (msg: Message) => !msg.chatType || msg.chatType === 'group'
        )

        if (data.isPagination) {
            chatStore.appendGroupMessages(groupMsgs)
        } else {
            chatStore.setGroupMessages(groupMsgs)
        }
    })

    onSocketEvent('send_message', (msg: Message) => {
        if (msg.senderPublicKey && Number(msg.userId) !== auth.userId) {
            chatStore.setPublicKeys({
                ...chatStore.publicKeys,
                [msg.userId]: msg.senderPublicKey,
            })

            const privateChat = msg.chatId
                ? chatStore.privateChats.find(chat => chat.chatId === msg.chatId)
                : null

            if (privateChat && !privateChat.otherUser.publicKey) {
                privateChat.otherUser.publicKey = msg.senderPublicKey
            }
        }

        chatStore.addMessage(msg)

        // Update sidebar last message for private chats
        if (msg.chatId && msg.chatType === 'private') {
            chatStore.updateChatLastMessage(
                msg.chatId,
                msg.message,
                msg.date,
                msg.isEncrypted,
                msg.nonce || undefined,
                msg.senderPublicKey || undefined
            )

            // If this private chat doesn't exist in our list, add it
            const exists = chatStore.privateChats.find(c => c.chatId === msg.chatId)
            if (!exists && Number(msg.userId) !== auth.userId) {
                chatStore.addPrivateChat({
                    chatId: msg.chatId,
                    otherUser: {
                        id: msg.userId,
                        username: msg.username,
                        login: msg.username,
                        publicKey: chatStore.publicKeys[msg.userId] || msg.senderPublicKey || null,
                    },
                    lastMessage: msg.message,
                    lastMessageDate: msg.date,
                    lastMessageNonce: msg.nonce || null,
                    lastMessageIsEncrypted: msg.isEncrypted || 0,
                    lastMessageSenderPublicKey: msg.senderPublicKey || null,
                    createdAt: msg.date,
                })
            }
        }
    })

    onSocketEvent('delete_message', (data: { id: number }) => {
        chatStore.deleteMessage(data.id)
    })

    onSocketEvent('error', (data: { message?: string }) => {
        logger.error('WebSocket action error:', data.message || 'Unknown error')
    })

    onSocketEvent('check_session', async () => {
        const result = await authService.checkSession()
        if (result.success) {
            // Session restored with new tokens
            if (result.data?.accessToken) {
                auth.setAuth(result.data.accessToken)
            }
            return
        }

        if (isTerminalSessionMessage(result.message)) {
            disconnectSocket()
            chatStore.cleanup()
            auth.logout()
            if (router.currentRoute.value.name !== 'auth') {
                void router.replace('/auth')
            }
            return
        }

        logger.error('WebSocket session check failed:', result.message || 'Unknown error')
    })

    onSocketEvent('refresh_tokens', async () => {
        const result = await authService.refreshTokens()
        if (result.success && result.data?.accessToken) {
            auth.setAuth(result.data.accessToken)
        }
    })

    onSocketEvent('client_logout', async () => {
        await authService.logout()
        disconnectSocket()
        chatStore.cleanup()
        auth.logout()
        if (router.currentRoute.value.name !== 'auth') {
            void router.replace('/auth')
        }
    })

    onSocketEvent('sync_group_messages', async () => {
        await loadGroupMessagesIntoStore(chatStore)
    })

    onSocketEvent('sync_private_chats', async () => {
        await syncPrivateChatsIntoStore(chatStore)
    })
}
