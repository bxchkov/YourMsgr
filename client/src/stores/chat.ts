import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ReplyPreview {
    id: number
    userId: number
    username: string
    message: string
    recipientId?: number | null
    nonce?: string | null
    senderPublicKey?: string | null
    isEncrypted?: number
    mediaType?: string | null
    mediaName?: string | null
}

export interface Message {
    id: number
    userId: number
    username: string
    message: string
    date: string
    chatId?: number | null
    chatType?: 'group' | 'private'
    recipientId?: number | null
    nonce?: string | null
    senderPublicKey?: string | null
    isEncrypted?: number
    mediaType?: string | null
    mediaName?: string | null
    replyToMessageId?: number | null
    replyTo?: ReplyPreview | null
}

export interface PrivateChat {
    chatId: number
    otherUser: {
        id: number
        username: string
        login: string
        publicKey: string | null
    }
    lastMessage: string | null
    lastMessageDate: string
    lastMessageNonce?: string | null
    lastMessageIsEncrypted?: number
    lastMessageSenderPublicKey?: string | null
    createdAt: string
}

export interface CurrentChat {
    id: string
    type: 'group' | 'private'
    chatId: number | null
    recipientId: number | null
    name: string
    otherUserId: number | null
}

export function createGeneralCurrentChat(): CurrentChat {
    return {
        id: 'general',
        type: 'group',
        chatId: null,
        recipientId: null,
        name: 'Общий чат',
        otherUserId: null,
    }
}

export const useChatStore = defineStore('chat', () => {
    const groupMessages = ref<Message[]>([])
    const privateMessagesByChatId = ref<Record<number, Message[]>>({})
    const privateMessagesLoadedByChatId = ref<Record<number, boolean>>({})
    const privateChats = ref<PrivateChat[]>([])
    const publicKeys = ref<Record<number, string>>({})
    const replyTarget = ref<Message | null>(null)

    const currentChat = ref<CurrentChat>(createGeneralCurrentChat())

    const activeMessages = computed(() => {
        if (currentChat.value.type === 'group' || currentChat.value.chatId === null) {
            return groupMessages.value
        }

        return privateMessagesByChatId.value[currentChat.value.chatId] ?? []
    })

    function mergeMessages(existing: Message[], incoming: Message[]) {
        const seen = new Set(existing.map(message => message.id))
        return [...existing, ...incoming.filter(message => !seen.has(message.id))]
    }

    function sortPrivateChats() {
        privateChats.value = [...privateChats.value].sort(
            (a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime(),
        )
    }

    function syncPrivateChatPreviewFromCache(chatId: number) {
        const chat = privateChats.value.find((entry) => entry.chatId === chatId)
        if (!chat) {
            return
        }

        const nextMessage = (privateMessagesByChatId.value[chatId] ?? [])[0]
        if (!nextMessage) {
            chat.lastMessage = null
            chat.lastMessageNonce = null
            chat.lastMessageIsEncrypted = 0
            chat.lastMessageSenderPublicKey = null
            chat.lastMessageDate = chat.createdAt
            return
        }

        chat.lastMessage = nextMessage.message
        chat.lastMessageDate = nextMessage.date
        chat.lastMessageNonce = nextMessage.nonce ?? null
        chat.lastMessageIsEncrypted = nextMessage.isEncrypted ?? 0
        chat.lastMessageSenderPublicKey = nextMessage.senderPublicKey ?? null
    }

    function setGroupMessages(messages: Message[]) {
        groupMessages.value = messages
    }

    function setPrivateMessages(messages: Message[]) {
        if (currentChat.value.type !== 'private' || currentChat.value.chatId === null) {
            return
        }

        const chatId = currentChat.value.chatId
        privateMessagesByChatId.value = {
            ...privateMessagesByChatId.value,
            [chatId]: messages,
        }
        privateMessagesLoadedByChatId.value = {
            ...privateMessagesLoadedByChatId.value,
            [chatId]: true,
        }
    }

    function appendGroupMessages(messages: Message[]) {
        groupMessages.value = mergeMessages(groupMessages.value, messages)
    }

    function appendPrivateMessages(messages: Message[]) {
        if (currentChat.value.type !== 'private' || currentChat.value.chatId === null) {
            return
        }

        const chatId = currentChat.value.chatId
        const existingMessages = privateMessagesByChatId.value[chatId] ?? []

        privateMessagesByChatId.value = {
            ...privateMessagesByChatId.value,
            [chatId]: mergeMessages(existingMessages, messages),
        }
        privateMessagesLoadedByChatId.value = {
            ...privateMessagesLoadedByChatId.value,
            [chatId]: true,
        }
    }

    function upsertPrivateMessage(chatId: number, message: Message) {
        const hasLoadedCache = Boolean(privateMessagesLoadedByChatId.value[chatId])
        const isActiveChat = currentChat.value.type === 'private' && currentChat.value.chatId === chatId

        if (!hasLoadedCache && !isActiveChat) {
            return
        }

        const existingMessages = privateMessagesByChatId.value[chatId] ?? []

        privateMessagesByChatId.value = {
            ...privateMessagesByChatId.value,
            [chatId]: [message, ...existingMessages.filter((entry) => entry.id !== message.id)],
        }

        privateMessagesLoadedByChatId.value = {
            ...privateMessagesLoadedByChatId.value,
            [chatId]: true,
        }
    }

    function addMessage(msg: Message) {
        if (!msg.chatType || msg.chatType === 'group') {
            groupMessages.value.unshift(msg)
        }

        if (msg.chatType === 'private' && typeof msg.chatId === 'number') {
            upsertPrivateMessage(msg.chatId, msg)
        }
    }

    function deleteMessage(msgId: number) {
        groupMessages.value = groupMessages.value.filter(m => m.id !== msgId)
        const updatedPrivateMessages: Record<number, Message[]> = {}
        for (const [chatId, messages] of Object.entries(privateMessagesByChatId.value)) {
            const numericChatId = Number(chatId)
            updatedPrivateMessages[numericChatId] = messages.filter(m => m.id !== msgId)
        }
        privateMessagesByChatId.value = updatedPrivateMessages
        Object.keys(updatedPrivateMessages).forEach((chatId) => {
            syncPrivateChatPreviewFromCache(Number(chatId))
        })
        sortPrivateChats()
        syncCurrentPrivateChatSnapshot()
        if (replyTarget.value?.id === msgId) {
            replyTarget.value = null
        }
    }

    function setPrivateChats(chats: PrivateChat[]) {
        privateChats.value = chats
        sortPrivateChats()
        syncCurrentPrivateChatSnapshot()
    }

    function addPrivateChat(chat: PrivateChat) {
        const existingChat = privateChats.value.find(c => c.chatId === chat.chatId)
        if (existingChat) {
            existingChat.otherUser = chat.otherUser
            existingChat.lastMessage = chat.lastMessage
            existingChat.lastMessageDate = chat.lastMessageDate
            existingChat.lastMessageNonce = chat.lastMessageNonce
            existingChat.lastMessageIsEncrypted = chat.lastMessageIsEncrypted
            existingChat.lastMessageSenderPublicKey = chat.lastMessageSenderPublicKey
            existingChat.createdAt = chat.createdAt
        } else {
            privateChats.value.unshift(chat)
        }
        sortPrivateChats()
        syncCurrentPrivateChatSnapshot()
    }

    function updateChatLastMessage(
        chatId: number,
        message: string,
        date: string,
        isEncrypted?: number,
        nonce?: string,
        senderPublicKey?: string
    ) {
        const chat = privateChats.value.find(c => c.chatId === chatId)
        if (chat) {
            chat.lastMessage = message
            chat.lastMessageDate = date
            chat.lastMessageIsEncrypted = isEncrypted
            chat.lastMessageNonce = nonce
            chat.lastMessageSenderPublicKey = senderPublicKey
            sortPrivateChats()
            syncCurrentPrivateChatSnapshot()
        }
    }

    function setCurrentChat(chat: CurrentChat) {
        currentChat.value = chat
        replyTarget.value = null
        if (chat.type === 'private') {
            syncCurrentPrivateChatSnapshot()
        }
    }

    function syncCurrentPrivateChatSnapshot() {
        if (currentChat.value.type !== 'private' || currentChat.value.chatId === null) {
            return
        }

        const privateChat = privateChats.value.find((chat) => chat.chatId === currentChat.value.chatId)
        if (!privateChat) {
            return
        }

        currentChat.value = {
            ...currentChat.value,
            recipientId: privateChat.otherUser?.id || null,
            otherUserId: privateChat.otherUser?.id || null,
            name: privateChat.otherUser?.username || 'РќРµРёР·РІРµСЃС‚РЅРѕ',
        }
    }

    function setReplyTarget(message: Message) {
        replyTarget.value = message
    }

    function clearReplyTarget() {
        replyTarget.value = null
    }

    function setPublicKeys(keys: Record<number, string>) {
        publicKeys.value = keys
    }

    function cleanup() {
        groupMessages.value = []
        privateMessagesByChatId.value = {}
        privateMessagesLoadedByChatId.value = {}
        privateChats.value = []
        publicKeys.value = {}
        replyTarget.value = null
        currentChat.value = createGeneralCurrentChat()
    }

    return {
        groupMessages,
        privateMessagesByChatId,
        privateMessagesLoadedByChatId,
        privateChats,
        publicKeys,
        replyTarget,
        currentChat,
        activeMessages,
        setGroupMessages,
        setPrivateMessages,
        appendGroupMessages,
        appendPrivateMessages,
        addMessage,
        deleteMessage,
        setPrivateChats,
        addPrivateChat,
        updateChatLastMessage,
        setCurrentChat,
        syncCurrentPrivateChatSnapshot,
        setReplyTarget,
        clearReplyTarget,
        setPublicKeys,
        cleanup,
    }
})
