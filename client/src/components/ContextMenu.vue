<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="context-menu"
      :style="{ left: `${x}px`, top: `${y}px` }"
    >
      <button v-if="targetMessage" class="context-menu__item" @click="handleReply">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 14l-5-5 5-5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M20 20v-7a4 4 0 00-4-4H4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Ответить
      </button>

      <button
        v-if="!isOwn && targetMessage"
        class="context-menu__item"
        @click="handleSendMessage"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Написать сообщение
      </button>

      <button
        v-if="canDelete"
        class="context-menu__item context-menu__item--danger"
        @click="handleDelete"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Удалить
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { useUiStore } from '@/stores/ui'
import { emitSocketEvent } from '@/composables/useWebSocket'
import { privateChatsService } from '@/services/privateChats'

const auth = useAuthStore()
const chatStore = useChatStore()
const uiStore = useUiStore()

const menuRef = ref<HTMLElement | null>(null)

const visible = computed(() => uiStore.contextMenu.visible)
const x = computed(() => uiStore.contextMenu.x)
const y = computed(() => uiStore.contextMenu.y)
const targetMessage = computed(() => uiStore.contextMenu.message)
const isOwn = computed(() => uiStore.contextMenu.isOwn)

const canDelete = computed(() => {
  if (!targetMessage.value) return false
  return isOwn.value || auth.userRole >= 3
})

watch(visible, async (isVisible) => {
  if (!isVisible) {
    return
  }

  await nextTick()
  positionMenu(uiStore.contextMenu.x, uiStore.contextMenu.y)
})

function positionMenu(rawX: number, rawY: number) {
  const menu = menuRef.value
  if (!menu) {
    return
  }

  const viewportPadding = 8
  const maxX = window.innerWidth - menu.offsetWidth - viewportPadding
  const maxY = window.innerHeight - menu.offsetHeight - viewportPadding

  uiStore.showContextMenu({
    x: Math.min(Math.max(viewportPadding, rawX), Math.max(viewportPadding, maxX)),
    y: Math.min(Math.max(viewportPadding, rawY), Math.max(viewportPadding, maxY)),
    message: targetMessage.value,
    isOwn: isOwn.value,
  })
}

function hide() {
  uiStore.hideContextMenu()
}

function handleReply() {
  if (!targetMessage.value) return
  chatStore.setReplyTarget(targetMessage.value)
  hide()
}

function handleDelete() {
  if (!targetMessage.value) return
  emitSocketEvent('delete_message', {
    accessToken: auth.token,
    id: targetMessage.value.id,
  })
  hide()
}

async function handleSendMessage() {
  if (!targetMessage.value) return

  const userId = targetMessage.value.userId
  const username = targetMessage.value.username

  try {
    const response = await privateChatsService.create(userId)

    if (response.success) {
      const chat = response.data.chat

      chatStore.addPrivateChat({
        chatId: chat.id,
        otherUser: {
          id: userId,
          username,
          login: username,
          publicKey: chatStore.publicKeys[userId] || null,
        },
        lastMessage: null,
        lastMessageDate: chat.createdAt || new Date().toISOString(),
        createdAt: chat.createdAt || new Date().toISOString(),
      })

      chatStore.setCurrentChat({
        id: `private-${chat.id}`,
        type: 'private',
        chatId: chat.id,
        recipientId: userId,
        name: username,
        otherUserId: userId,
      })
    }
  } catch (error) {
    console.error('Failed to create private chat:', error)
  }

  hide()
}

function handleClickOutside(event: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    hide()
  }
}

function handleWindowChange() {
  hide()
}

onMounted(() => {
  window.addEventListener('resize', handleWindowChange)
  window.addEventListener('scroll', handleWindowChange, true)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowChange)
  window.removeEventListener('scroll', handleWindowChange, true)
  document.removeEventListener('click', handleClickOutside)
})
</script>
