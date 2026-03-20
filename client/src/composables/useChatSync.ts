import router from '@/router'
import { authService } from '@/services/auth'
import { messagesService } from '@/services/messages'
import { privateChatsService } from '@/services/privateChats'
import { createGeneralCurrentChat, type PrivateChat, useChatStore } from '@/stores/chat'
import type { PublicKeyEntry } from '@/types/api'
import { logger } from '@/utils/logger'

export async function loadPublicKeysIntoStore(chatStore = useChatStore()) {
    try {
        const response = await authService.getPublicKeys()
        if (!response.success || !response.data?.publicKeys) {
            return
        }

        const keys: Record<number, string> = {}
        response.data.publicKeys.forEach((user: PublicKeyEntry) => {
            keys[user.userId] = user.publicKey
        })

        chatStore.setPublicKeys({
            ...chatStore.publicKeys,
            ...keys,
        })
    } catch (error) {
        logger.error('Failed to load public keys:', error)
    }
}

export async function loadPrivateChatsIntoStore(chatStore = useChatStore()) {
    try {
        const response = await privateChatsService.list()
        if (!response.success || !response.data?.chats) {
            return []
        }

        chatStore.setPrivateChats(response.data.chats)

        const keysFromPrivateChats = Object.fromEntries(
            response.data.chats
                .filter((chat: PrivateChat) => !!chat.otherUser?.publicKey)
                .map((chat: PrivateChat) => [
                    chat.otherUser.id,
                    chat.otherUser.publicKey!,
                ]),
        )

        if (Object.keys(keysFromPrivateChats).length > 0) {
            chatStore.setPublicKeys({
                ...chatStore.publicKeys,
                ...keysFromPrivateChats,
            })
        }

        return response.data.chats
    } catch (error) {
        logger.error('Failed to load private chats:', error)
        return []
    }
}

export async function loadGroupMessagesIntoStore(chatStore = useChatStore()) {
    try {
        const response = await messagesService.listGroupMessages()
        if (!response.success || !response.data?.messages) {
            return
        }

        chatStore.setGroupMessages(response.data.messages)
    } catch (error) {
        logger.error('Failed to load group messages:', error)
    }
}

export async function loadCurrentPrivateMessagesIntoStore(chatId: number, chatStore = useChatStore()) {
    try {
        const response = await privateChatsService.getMessages(chatId)
        if (!response.success || !response.data?.messages) {
            return
        }

        if (chatStore.currentChat.type !== 'private' || chatStore.currentChat.chatId !== chatId) {
            return
        }

        chatStore.setPrivateMessages(response.data.messages)
    } catch (error) {
        logger.error('Failed to refresh private chat messages:', error)
    }
}

export async function syncPrivateChatsIntoStore(chatStore = useChatStore()) {
    const chats = await loadPrivateChatsIntoStore(chatStore)

    if (chatStore.currentChat.type !== 'private' || !chatStore.currentChat.chatId) {
        return
    }

    const activeChat = chats.find((chat) => chat.chatId === chatStore.currentChat.chatId)
    if (!activeChat) {
        chatStore.setPrivateMessages([])
        chatStore.setCurrentChat(createGeneralCurrentChat())

        if (router.currentRoute.value.path !== '/chat/general') {
            await router.replace('/chat/general')
        }
        return
    }

    await loadCurrentPrivateMessagesIntoStore(chatStore.currentChat.chatId, chatStore)
}
