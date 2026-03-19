import { isTerminalSessionMessage } from '@/constants/auth'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { authService } from '@/services/auth'
import { initCrypto } from '@/composables/useCrypto'
import { loadGroupMessagesIntoStore, loadPrivateChatsIntoStore, loadPublicKeysIntoStore } from '@/composables/useChatSync'
import { disconnectSocket, initSocket, setupSocketHandlers } from '@/composables/useWebSocket'

export function useChatSession() {
  const chatStore = useChatStore()
  const auth = useAuthStore()
  const router = useRouter()

  function stopChatSessionSync() {
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
    await loadPublicKeysIntoStore(chatStore)

    setupSocketHandlers()
    initSocket()

    await loadGroupMessagesIntoStore(chatStore)
    await loadPrivateChatsIntoStore(chatStore)
    return true
  }

  return {
    bootstrapChatSession,
    logoutFromChatSession,
    stopChatSessionSync,
  }
}
