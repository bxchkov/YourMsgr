import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { authService } from '@/services/auth'
import { privateChatsService } from '@/services/privateChats'
import { initCrypto } from '@/composables/useCrypto'
import { disconnectSocket, initSocket, setupSocketHandlers } from '@/composables/useWebSocket'

export function useChatSession() {
  const chatStore = useChatStore()
  const auth = useAuthStore()
  const router = useRouter()

  async function logoutFromChatSession() {
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
      response.data.publicKeys.forEach((user: { userId: number; publicKey: string }) => {
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
          .filter((chat: { otherUser?: { id: number; publicKey: string | null } }) => chat.otherUser?.publicKey)
          .map((chat: { otherUser: { id: number; publicKey: string } }) => [
            chat.otherUser.id,
            chat.otherUser.publicKey,
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

  async function bootstrapChatSession() {
    const sessionRes = await authService.checkSession()
    if (!sessionRes.success) {
      await logoutFromChatSession()
      return false
    }

    if (sessionRes.data?.accessToken) {
      auth.setAuth(sessionRes.data.accessToken)
    }

    await initCrypto()
    await loadPublicKeys()

    setupSocketHandlers()
    initSocket()

    await loadPrivateChats()
    return true
  }

  return {
    bootstrapChatSession,
    logoutFromChatSession,
  }
}
