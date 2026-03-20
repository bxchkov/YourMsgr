import { isTerminalSessionMessage } from '@/constants/auth'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { authService } from '@/services/auth'
import { initCrypto } from '@/composables/useCrypto'
import { loadGroupMessagesIntoStore, loadPrivateChatsIntoStore } from '@/composables/useChatSync'
import { disconnectSocket, initSocket, setupSocketHandlers } from '@/composables/useWebSocket'
import { logger } from '@/utils/logger'

export type ChatSessionBootstrapResult =
  | { ok: true }
  | { ok: false; kind: 'terminal' | 'transient'; message: string }

export function useChatSession() {
  const chatStore = useChatStore()
  const auth = useAuthStore()
  const router = useRouter()

  function stopChatSessionSync() {
  }

  function resetChatSessionRuntime() {
    stopChatSessionSync()
    disconnectSocket()
    chatStore.cleanup()
  }

  async function forceClientLogout() {
    resetChatSessionRuntime()
    auth.logout()
    await router.replace('/auth')
  }

  async function logoutFromChatSession() {
    await authService.logout()
    resetChatSessionRuntime()
    auth.logout()
    await router.replace('/auth')
  }

  async function bootstrapChatSession(): Promise<ChatSessionBootstrapResult> {
    try {
      const sessionRes = await authService.checkSession()
      if (!sessionRes.success) {
        if (isTerminalSessionMessage(sessionRes.message)) {
          await forceClientLogout()
          return {
            ok: false,
            kind: 'terminal',
            message: sessionRes.message || 'Session expired',
          }
        }

        logger.error('Chat session bootstrap failed:', sessionRes.message || 'Unknown error')
        resetChatSessionRuntime()
        return {
          ok: false,
          kind: 'transient',
          message: 'Не удалось загрузить сессию. Проверьте подключение и попробуйте снова.',
        }
      }

      if (sessionRes.data?.accessToken) {
        auth.setAuth(sessionRes.data.accessToken, { sync: false })
      }

      await initCrypto()

      setupSocketHandlers()
      initSocket()

      await loadGroupMessagesIntoStore(chatStore)
      await loadPrivateChatsIntoStore(chatStore)

      return { ok: true }
    } catch (error) {
      logger.error('Chat session bootstrap error:', error)
      resetChatSessionRuntime()
      return {
        ok: false,
        kind: 'transient',
        message: 'Не удалось загрузить чат. Проверьте подключение и попробуйте снова.',
      }
    }
  }

  return {
    bootstrapChatSession,
    logoutFromChatSession,
    stopChatSessionSync,
  }
}
