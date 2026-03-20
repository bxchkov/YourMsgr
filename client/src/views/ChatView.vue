<template>
  <div class="chat-screen">
    <Transition name="modal-fade" appear>
      <SettingsModal v-if="showSettings" @close="showSettings = false" />
    </Transition>

    <div v-if="isBootstrapping || bootstrapError" class="chat-screen__state">
      <div class="chat-screen__state-card">
        <h1 class="chat-screen__state-title">
          {{ isBootstrapping ? 'Загрузка чата' : 'Не удалось загрузить чат' }}
        </h1>
        <p class="chat-screen__state-text">
          {{ isBootstrapping ? 'Подготавливаем сессию и подключение…' : bootstrapError }}
        </p>
        <button
          v-if="bootstrapError"
          type="button"
          class="chat-screen__state-button"
          @click="startChatSessionBootstrap"
        >
          Повторить
        </button>
      </div>
    </div>

    <div v-else class="app">
      <Sidebar
        :is-open="isSidebarOpen"
        @toggle-settings="showSettings = true"
        @chat-selected="handleChatSelected"
        @logout="handleLogout"
      />

      <div class="main-content">
        <header class="chat-header">
          <div class="chat-header__info">
            <IconButton
              ariaLabel="Открыть список чатов"
              class="sidebar__menu-button mobile-menu-btn"
              @click="toggleMobileSidebar"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M3 12h18M3 6h18M3 18h18" stroke-width="2" stroke-linecap="round" />
              </svg>
            </IconButton>
            <h1 class="chat-header__title">{{ chatStore.currentChat.name }}</h1>
          </div>

          <div class="chat-header__actions">
            <IconButton
              :ariaLabel="themeToggleLabel"
              :title="themeToggleLabel"
              class="sidebar__settings-button chat-header__theme-toggle"
              @click="toggleTheme"
            >
              <svg
                v-if="isLightTheme"
                class="chat-header__theme-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <svg
                v-else
                class="chat-header__theme-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <circle cx="12" cy="12" r="4" stroke-width="2" />
                <path
                  d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </IconButton>
          </div>
        </header>

        <ChatArea />
      </div>
    </div>

    <ContextMenu v-if="!isBootstrapping && !bootstrapError" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createGeneralCurrentChat, useChatStore, type CurrentChat } from '@/stores/chat'
import { useTheme } from '@/composables/useTheme'
import { disconnectSocket } from '@/composables/useWebSocket'
import { useChatSession, type ChatSessionBootstrapResult } from '@/composables/useChatSession'
import Sidebar from '@/components/Sidebar.vue'
import ChatArea from '@/components/ChatArea.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import IconButton from '@/components/IconButton.vue'

const chatStore = useChatStore()
const route = useRoute()
const router = useRouter()
const showSettings = ref(false)
const isSidebarOpen = ref(false)
const isBootstrapping = ref(true)
const bootstrapError = ref('')
const { isLightTheme, toggleTheme } = useTheme()
const { bootstrapChatSession, logoutFromChatSession, stopChatSessionSync } = useChatSession()

const themeToggleLabel = computed(() => (
  isLightTheme.value ? 'Включить тёмную тему' : 'Включить светлую тему'
))

function toggleMobileSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}

function findPrivateChatSelection(chatId: number): CurrentChat | null {
  const privateChat = chatStore.privateChats.find((chat) => chat.chatId === chatId)
  if (!privateChat) {
    return null
  }

  return {
    id: `private-${privateChat.chatId}`,
    type: 'private',
    chatId: privateChat.chatId,
    recipientId: privateChat.otherUser?.id || null,
    name: privateChat.otherUser?.username || 'Неизвестно',
    otherUserId: privateChat.otherUser?.id || null,
  }
}

function isRouteForChat(chat: CurrentChat) {
  if (chat.type === 'group') {
    return route.name === 'chat-general'
  }

  return route.name === 'chat-private' && Number(route.params.chatId) === chat.chatId
}

async function navigateToChat(chat: CurrentChat, replace = false) {
  if (isRouteForChat(chat)) {
    return
  }

  if (chat.type === 'group') {
    await (replace ? router.replace('/chat/general') : router.push('/chat/general'))
    return
  }

  if (chat.chatId === null) {
    return
  }

  const target = {
    name: 'chat-private' as const,
    params: {
      chatId: String(chat.chatId),
    },
  }

  await (replace ? router.replace(target) : router.push(target))
}

async function syncChatWithRoute() {
  if (route.name === 'chat-private') {
    const chatId = Number(route.params.chatId)
    if (!Number.isFinite(chatId)) {
      await router.replace('/chat/general')
      return
    }

    const privateChat = findPrivateChatSelection(chatId)
    if (!privateChat) {
      await router.replace('/chat/general')
      return
    }

    if (chatStore.currentChat.id !== privateChat.id) {
      chatStore.setCurrentChat(privateChat)
    }
    return
  }

  if (chatStore.currentChat.id !== 'general') {
    chatStore.setCurrentChat(createGeneralCurrentChat())
  }
}

function handleChatSelected(chat: CurrentChat) {
  chatStore.setCurrentChat(chat)
  isSidebarOpen.value = false
  void navigateToChat(chat)
}

async function handleLogout() {
  showSettings.value = false
  isSidebarOpen.value = false
  await logoutFromChatSession()
}

async function handleBootstrapResult(result: ChatSessionBootstrapResult) {
  if (!result.ok) {
    isBootstrapping.value = false
    bootstrapError.value = result.kind === 'transient' ? result.message : ''
    return
  }

  bootstrapError.value = ''
  await syncChatWithRoute()
  isBootstrapping.value = false
}

async function startChatSessionBootstrap() {
  isSidebarOpen.value = false
  showSettings.value = false
  bootstrapError.value = ''
  isBootstrapping.value = true

  const result = await bootstrapChatSession()
  await handleBootstrapResult(result)
}

onMounted(async () => {
  await startChatSessionBootstrap()
})

onUnmounted(() => {
  stopChatSessionSync()
  disconnectSocket()
  chatStore.cleanup()
  isSidebarOpen.value = false
})

watch(
  () => [
    route.name,
    route.params.chatId,
    chatStore.privateChats.map((chat) => chat.chatId).join(','),
  ],
  () => {
    if (!isBootstrapping.value && !bootstrapError.value) {
      void syncChatWithRoute()
    }
  },
)
</script>
