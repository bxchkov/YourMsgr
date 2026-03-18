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

export const useChatStore = defineStore('chat', () => {
    const groupMessages = ref<Message[]>([])
    const privateMessages = ref<Message[]>([])
    const privateChats = ref<PrivateChat[]>([])
    const publicKeys = ref<Record<number, string>>({})
    const replyTarget = ref<Message | null>(null)

    const currentChat = ref<CurrentChat>({
        id: 'general',
        type: 'group',
        chatId: null,
        recipientId: null,
        name: 'Общий чат',
        otherUserId: null,
    })

    const activeMessages = computed(() => {
        return currentChat.value.type === 'group' ? groupMessages.value : privateMessages.value
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

    function setGroupMessages(messages: Message[]) {
        groupMessages.value = messages
    }

    function setPrivateMessages(messages: Message[]) {
        privateMessages.value = messages
    }

    function appendGroupMessages(messages: Message[]) {
        groupMessages.value = mergeMessages(groupMessages.value, messages)
    }

    function appendPrivateMessages(messages: Message[]) {
        privateMessages.value = mergeMessages(privateMessages.value, messages)
    }

    function addMessage(msg: Message) {
        if (!msg.chatType || msg.chatType === 'group') {
            groupMessages.value.unshift(msg)
        }
        // For private messages, add only if it's for the current chat
        if (msg.chatType === 'private' && msg.chatId === currentChat.value.chatId) {
            privateMessages.value.unshift(msg)
        }
    }

    function deleteMessage(msgId: number) {
        groupMessages.value = groupMessages.value.filter(m => m.id !== msgId)
        privateMessages.value = privateMessages.value.filter(m => m.id !== msgId)
        if (replyTarget.value?.id === msgId) {
            replyTarget.value = null
        }
    }

    function setPrivateChats(chats: PrivateChat[]) {
        privateChats.value = chats
        sortPrivateChats()
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
        }
    }

    function setCurrentChat(chat: CurrentChat) {
        currentChat.value = chat
        replyTarget.value = null
        if (chat.type === 'group') {
            privateMessages.value = []
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
        privateMessages.value = []
        privateChats.value = []
        publicKeys.value = {}
        replyTarget.value = null
        currentChat.value = {
            id: 'general',
            type: 'group',
            chatId: null,
            recipientId: null,
            name: 'Общий чат',
            otherUserId: null,
        }
    }

    return {
        groupMessages,
        privateMessages,
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
        setReplyTarget,
        clearReplyTarget,
        setPublicKeys,
        cleanup,
    }
})
