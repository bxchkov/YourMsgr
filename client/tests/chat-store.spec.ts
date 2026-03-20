import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createGeneralCurrentChat, useChatStore, type CurrentChat, type Message } from '@/stores/chat'

function createPrivateChatSelection(chatId: number, otherUserId: number, username: string): CurrentChat {
    return {
        id: `private-${chatId}`,
        type: 'private',
        chatId,
        recipientId: otherUserId,
        name: username,
        otherUserId,
    }
}

function createPrivateMessage(chatId: number, overrides: Partial<Message> = {}): Message {
    return {
        id: 1,
        userId: 2,
        username: 'beta123',
        message: 'Hello',
        date: '2026-03-20T00:00:00.000Z',
        chatId,
        chatType: 'private',
        recipientId: 1,
        ...overrides,
    }
}

describe('chat store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('updates cached private messages for an inactive dialog', () => {
        const chatStore = useChatStore()

        chatStore.setCurrentChat(createPrivateChatSelection(11, 21, 'gamma'))
        chatStore.setPrivateMessages([
            createPrivateMessage(11, { id: 101, message: 'Cached message' }),
        ])

        chatStore.setCurrentChat(createGeneralCurrentChat())
        chatStore.addMessage(createPrivateMessage(11, { id: 102, message: 'Fresh message' }))

        expect(chatStore.privateMessagesByChatId[11]).toEqual([
            expect.objectContaining({ id: 102, message: 'Fresh message' }),
            expect.objectContaining({ id: 101, message: 'Cached message' }),
        ])
    })

    it('does not create a fake cache for an unopened private dialog', () => {
        const chatStore = useChatStore()

        chatStore.setCurrentChat(createGeneralCurrentChat())
        chatStore.addMessage(createPrivateMessage(77, { id: 777, message: 'Background message' }))

        expect(chatStore.privateMessagesByChatId[77]).toBeUndefined()
        expect(chatStore.privateMessagesLoadedByChatId[77]).toBeUndefined()
    })
})
