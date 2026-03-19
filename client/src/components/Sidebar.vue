<template>
  <aside class="sidebar" :class="{ 'sidebar--open': props.isOpen }" :style="sidebarStyle">
    <header class="sidebar__header">
      <div class="sidebar__header-side">
        <IconButton
          ariaLabel="Настройки"
          class="sidebar__settings-button"
          @click="emit('toggle-settings')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </IconButton>
      </div>
      <div class="sidebar__header-main" aria-hidden="true"></div>
    </header>

    <div class="sidebar__content">
      <nav class="sidebar__filters">
        <button
          type="button"
          class="sidebar__filter"
          :class="{ 'sidebar__filter--active': filter === 'all' }"
          aria-label="Все чаты"
          @click="filter = 'all'"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>Все</span>
        </button>

        <button
          type="button"
          class="sidebar__filter"
          :class="{ 'sidebar__filter--active': filter === 'private' }"
          aria-label="Личные чаты"
          @click="filter = 'private'"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="12" cy="7" r="4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>Личные</span>
        </button>

        <button
          type="button"
          class="sidebar__filter"
          :class="{ 'sidebar__filter--active': filter === 'group' }"
          aria-label="Группы"
          @click="filter = 'group'"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="9" cy="7" r="4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>Группы</span>
        </button>
      </nav>

      <div class="sidebar__chats">
        <div class="sidebar__chats-list" role="list">
          <div
            v-if="filter !== 'private'"
            class="chat-item"
            :class="{ 'chat-item--active': chatStore.currentChat.id === 'general' }"
            role="listitem"
            @click="selectGeneralChat"
          >
            <div class="chat-item__avatar">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="9" cy="7" r="4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <div class="chat-item__content">
              <div class="chat-item__header">
                <span class="chat-item__name">Общий чат</span>
                <span v-if="generalChatPreview?.date" class="chat-item__time">
                  {{ formatTime(generalChatPreview.date) }}
                </span>
              </div>
              <div class="chat-item__preview">
                <template v-if="generalChatPreview">
                  <span class="chat-item__author">{{ generalChatPreview.username }}:</span>
                  <span class="chat-item__message">{{ generalChatPreview.message }}</span>
                </template>
                <template v-else>
                  <span class="chat-item__message">Пока пусто</span>
                </template>
              </div>
            </div>
          </div>

          <div
            v-for="chat in filteredPrivateChats"
            :key="chat.chatId"
            class="chat-item"
            :class="{ 'chat-item--active': chatStore.currentChat.id === `private-${chat.chatId}` }"
            role="listitem"
            @click="selectPrivateChat(chat)"
          >
            <div class="chat-item__avatar">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke-width="2" />
                <circle cx="12" cy="7" r="4" stroke-width="2" />
              </svg>
            </div>
            <div class="chat-item__content">
              <div class="chat-item__header">
                <span class="chat-item__name">{{ chat.otherUser?.username || 'Неизвестно' }}</span>
                <span v-if="chat.lastMessageDate" class="chat-item__time">
                  {{ formatTime(chat.lastMessageDate) }}
                </span>
              </div>
              <div class="chat-item__preview">
                <span class="chat-item__message">
                  <template v-if="chat.lastMessage">
                    {{ getPreviewMessage(chat) }}
                  </template>
                  <template v-else>
                    Нет сообщений
                  </template>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="sidebar__footer">
      <div class="sidebar__user-info">
        <div class="sidebar__user-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke-width="2" />
            <circle cx="12" cy="7" r="4" stroke-width="2" />
          </svg>
        </div>

        <div class="sidebar__user-details">
          <div class="sidebar__user-name">{{ auth.username || 'Загрузка...' }}</div>
          <div class="sidebar__user-login">@{{ auth.login }}</div>
        </div>

        <IconButton
          ariaLabel="Выйти из аккаунта"
          title="Выйти из аккаунта"
          class="sidebar__logout-button"
          @click="emit('logout')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M10 17l-5-5 5-5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M15 12H5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </IconButton>
      </div>
    </footer>

    <div
      class="sidebar__resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Изменить ширину сайдбара"
      @mousedown="startSidebarResize"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useChatStore, type CurrentChat, type Message, type PrivateChat } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { decryptMessageE2EE } from '@/composables/useCrypto'
import { getReplyPreviewText } from '@/utils/messageContent'
import IconButton from '@/components/IconButton.vue'

const props = withDefaults(defineProps<{
  isOpen?: boolean
}>(), {
  isOpen: false,
})

const emit = defineEmits<{
  'toggle-settings': []
  'chat-selected': [chat: CurrentChat]
  logout: []
}>()

const DEFAULT_SIDEBAR_WIDTH = 420
const MIN_SIDEBAR_WIDTH = Math.round(DEFAULT_SIDEBAR_WIDTH * 0.8)
const MAX_SIDEBAR_WIDTH = Math.round(DEFAULT_SIDEBAR_WIDTH * 1.2)

const chatStore = useChatStore()
const auth = useAuthStore()
const filter = ref<'all' | 'private' | 'group'>('all')
const sidebarWidth = ref(DEFAULT_SIDEBAR_WIDTH)

let resizeStartX = 0
let resizeStartWidth = DEFAULT_SIDEBAR_WIDTH

const sidebarStyle = computed(() => ({
  '--sidebar-width': `${sidebarWidth.value}px`,
}))

const filteredPrivateChats = computed(() => {
  if (filter.value === 'group') {
    return []
  }

  return chatStore.privateChats
})

const generalChatPreview = computed(() => {
  const lastGroupMessage = chatStore.groupMessages[0]
  if (!lastGroupMessage) {
    return null
  }

  return {
    username: getGroupPreviewAuthor(lastGroupMessage),
    message: getReplyPreviewText(lastGroupMessage, {
      currentUserId: auth.userId ?? -1,
      publicKeys: chatStore.publicKeys,
      maxLength: 36,
    }),
    date: lastGroupMessage.date,
  }
})

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
}

function getGroupPreviewAuthor(message: Message) {
  return Number(message.userId) === auth.userId ? 'Вы' : message.username
}

function getPreviewMessage(chat: PrivateChat): string {
  if (!chat.lastMessage) {
    return 'Нет сообщений'
  }

  if (chat.lastMessageIsEncrypted === 1 && chat.lastMessageNonce && chat.lastMessageSenderPublicKey) {
    try {
      const decryptionKey = chat.otherUser?.publicKey || chat.lastMessageSenderPublicKey
      const decrypted = decryptMessageE2EE(
        chat.lastMessage,
        chat.lastMessageNonce,
        decryptionKey,
      )

      return decrypted.slice(0, 30) + (decrypted.length > 30 ? '...' : '')
    } catch {
      return 'Защищённое сообщение'
    }
  }

  return getReplyPreviewText(
    {
      userId: chat.otherUser?.id || 0,
      message: chat.lastMessage,
    },
    {
      currentUserId: auth.userId ?? -1,
      publicKeys: {},
      maxLength: 30,
    },
  )
}

function selectGeneralChat() {
  emit('chat-selected', {
    id: 'general',
    type: 'group',
    chatId: null,
    recipientId: null,
    name: 'Общий чат',
    otherUserId: null,
  })
}

function selectPrivateChat(chat: PrivateChat) {
  emit('chat-selected', {
    id: `private-${chat.chatId}`,
    type: 'private',
    chatId: chat.chatId,
    recipientId: chat.otherUser?.id || null,
    name: chat.otherUser?.username || 'Неизвестно',
    otherUserId: chat.otherUser?.id || null,
  })
}

function startSidebarResize(event: MouseEvent) {
  if (event.button !== 0 || window.innerWidth <= 640) {
    return
  }

  resizeStartX = event.clientX
  resizeStartWidth = sidebarWidth.value
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', handleSidebarResize)
  window.addEventListener('mouseup', stopSidebarResize)
}

function handleSidebarResize(event: MouseEvent) {
  const deltaX = event.clientX - resizeStartX
  sidebarWidth.value = clampSidebarWidth(resizeStartWidth + deltaX)
}

function stopSidebarResize() {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  window.removeEventListener('mousemove', handleSidebarResize)
  window.removeEventListener('mouseup', stopSidebarResize)
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

onUnmounted(() => {
  stopSidebarResize()
})
</script>
