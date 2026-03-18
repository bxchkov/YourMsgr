<template>
  <div class="chat-screen">
    <Transition name="modal-fade" appear>
      <SettingsModal v-if="showSettings" @close="showSettings = false" />
    </Transition>

    <div class="app">
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
                <path d="M3 12h18M3 6h18M3 18h18" stroke-width="2" stroke-linecap="round"/>
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
                <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg
                v-else
                class="chat-header__theme-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <circle cx="12" cy="12" r="4" stroke-width="2" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke-width="2" stroke-linecap="round" />
              </svg>
            </IconButton>
          </div>
        </header>

        <ChatArea />
      </div>
    </div>

    <ContextMenu />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useChatStore, type CurrentChat } from '@/stores/chat'
import { useTheme } from '@/composables/useTheme'
import { disconnectSocket } from '@/composables/useWebSocket'
import { useChatSession } from '@/composables/useChatSession'
import Sidebar from '@/components/Sidebar.vue'
import ChatArea from '@/components/ChatArea.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import IconButton from '@/components/IconButton.vue'

const chatStore = useChatStore()
const showSettings = ref(false)
const isSidebarOpen = ref(false)
const { isLightTheme, toggleTheme } = useTheme()
const { bootstrapChatSession, logoutFromChatSession } = useChatSession()

const themeToggleLabel = computed(() => (
  isLightTheme.value ? 'Включить тёмную тему' : 'Включить светлую тему'
))

function toggleMobileSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}

function handleChatSelected(chat: CurrentChat) {
  chatStore.setCurrentChat(chat)
  isSidebarOpen.value = false
}

async function handleLogout() {
  showSettings.value = false
  isSidebarOpen.value = false
  await logoutFromChatSession()
}

onMounted(async () => {
  isSidebarOpen.value = false
  showSettings.value = false
  await bootstrapChatSession()
})

onUnmounted(() => {
  disconnectSocket()
  chatStore.cleanup()
  isSidebarOpen.value = false
})
</script>
