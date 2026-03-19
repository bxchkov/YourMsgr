import { isTerminalSessionMessage } from '@/constants/auth'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { authService } from '@/services/auth'
import { messagesService } from '@/services/messages'
import { privateChatsService } from '@/services/privateChats'
import { initCrypto } from '@/composables/useCrypto'
import { disconnectSocket, initSocket, setupSocketHandlers } from '@/composables/useWebSocket'
import type { PrivateChat } from '@/stores/chat'
import type { PublicKeyEntry } from '@/types/api'

const SESSION_SYNC_INTERVAL_MS = 2000
const CHAT_SYNC_INTERVAL_MS = 3000

let sessionSyncTimer: number | null = null
let chatSyncTimer: number | null = null
let sessionSyncInFlight = false
let chatSyncInFlight = false

export function useChatSession() {
  const chatStore = useChatStore()
  const auth = useAuthStore()
  const router = useRouter()

  function stopChatSessionSync() {
    if (sessionSyncTimer) {
      window.clearInterval(sessionSyncTimer)
      sessionSyncTimer = null
    }

    if (chatSyncTimer) {
      window.clearInterval(chatSyncTimer)
      chatSyncTimer = null
    }

    sessionSyncInFlight = false
    chatSyncInFlight = false
  }

  async function forceClientLogout() {
    stopChatSessionSync()
    disconnectSocket()
    chatStore.cleanup()
    auth.logout()
    await router.replace('/auth')
  }

  async function logoutFromChatSession() {
    stopChatSessionSync()
    await authService.logout()
    disconnectSocket()
    chatStore.cleanup()
    auth.logout()
    await router.replace('/auth')
  }

  async function loadPublicKeys() {
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
      console.error('Failed to load public keys:', error)
    }
  }

  async function loadPrivateChats() {
    try {
      const response = await privateChatsService.list()
      if (!response.success || !response.data?.chats) {
        return
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

      if (Object.keys(keysFromPrivateChats).length === 0) {
        return
      }

      chatStore.setPublicKeys({
        ...chatStore.publicKeys,
        ...keysFromPrivateChats,
      })
    } catch (error) {
      console.error('Failed to load private chats:', error)
    }
  }

  async function loadGroupMessages() {
    try {
      const response = await messagesService.listGroupMessages()
      if (!response.success || !response.data?.messages) {
        return
      }

      chatStore.setGroupMessages(response.data.messages)
    } catch (error) {
      console.error('Failed to load group messages:', error)
    }
  }

  async function loadCurrentPrivateMessages(chatId: number) {
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
      console.error('Failed to refresh private chat messages:', error)
    }
  }

  async function refreshActiveChatState() {
    if (chatSyncInFlight || !auth.token) {
      return
    }

    chatSyncInFlight = true

    try {
      await loadPrivateChats()

      if (chatStore.currentChat.type === 'private' && chatStore.currentChat.chatId) {
        await loadCurrentPrivateMessages(chatStore.currentChat.chatId)
        return
      }

      await loadGroupMessages()
    } finally {
      chatSyncInFlight = false
    }
  }

  async function validateSessionState() {
    if (sessionSyncInFlight || !auth.isAuthenticated) {
      return
    }

    sessionSyncInFlight = true

    try {
      const sessionRes = await authService.checkSession()
      if (sessionRes.success) {
        if (sessionRes.data?.accessToken) {
          auth.setAuth(sessionRes.data.accessToken, { sync: false })
        }
        return
      }

      if (isTerminalSessionMessage(sessionRes.message)) {
        await forceClientLogout()
        return
      }

      console.error('Background session validation failed:', sessionRes.message || 'Unknown error')
    } finally {
      sessionSyncInFlight = false
    }
  }

  function startChatSessionSync() {
    stopChatSessionSync()

    sessionSyncTimer = window.setInterval(() => {
      void validateSessionState()
    }, SESSION_SYNC_INTERVAL_MS)

    chatSyncTimer = window.setInterval(() => {
      void refreshActiveChatState()
    }, CHAT_SYNC_INTERVAL_MS)
  }

  async function bootstrapChatSession() {
    const sessionRes = await authService.checkSession()
    if (!sessionRes.success) {
      if (isTerminalSessionMessage(sessionRes.message)) {
        await forceClientLogout()
        return false
      }

      console.error('Chat session bootstrap failed:', sessionRes.message || 'Unknown error')
      return false
    }

    if (sessionRes.data?.accessToken) {
      auth.setAuth(sessionRes.data.accessToken, { sync: false })
    }

    await initCrypto()
    await loadPublicKeys()

    setupSocketHandlers()
    initSocket()

    await loadGroupMessages()
    await loadPrivateChats()
    startChatSessionSync()
    return true
  }

  return {
    bootstrapChatSession,
    logoutFromChatSession,
    stopChatSessionSync,
  }
}
