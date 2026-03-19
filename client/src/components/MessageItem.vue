<template>
  <div
    class="message"
    :class="{
      'message--own': isOwn,
      'message--admin': isAdminMessage,
    }"
    :id="`message-${message.id}`"
    :data-can-delete="canDelete"
    @contextmenu.prevent="onContextMenu"
  >
    <div
      class="message__username"
      :data-user-id="message.userId"
      :data-username="encodeURIComponent(displayUsername || '')"
    >
      {{ displayUsername }}
    </div>

    <button
      v-if="hasReplyPreview"
      type="button"
      class="message__reply"
      :class="{ 'message__reply--disabled': !message.replyTo }"
      :disabled="!message.replyTo"
      @click="jumpToReplyTarget"
      @keydown.enter.prevent="jumpToReplyTarget"
      @keydown.space.prevent="jumpToReplyTarget"
    >
      <div class="message__reply-line" />
      <div class="message__reply-body">
        <div class="message__reply-author">{{ replyAuthor }}</div>
        <div class="message__reply-preview">{{ replyPreviewText }}</div>
      </div>
    </button>

    <div class="message__text">
      <span class="message__text-content">{{ decryptedText }}</span>
      <div class="message__footer-place">
        <svg v-if="isEncrypted" class="message__encrypted-fake" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" stroke-width="2" stroke-linecap="round" />
        </svg>
        <div class="message__time-fake">{{ formatTime(message.date) }}</div>
      </div>
    </div>

    <div class="message__footer">
      <svg v-if="isEncrypted" class="message__encrypted" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" stroke-width="2" stroke-linecap="round" />
      </svg>
      <div class="message__time">{{ formatTime(message.date) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { type CurrentChat, type Message } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { getReplyPreviewText, isEncryptedMessage, resolveMessageText } from '@/utils/messageContent'

const props = defineProps<{
  message: Message
  isOwn: boolean
  publicKeys: Record<number, string>
  currentChat: CurrentChat
}>()

const emit = defineEmits<{
  'context-menu': [event: { mouseEvent: MouseEvent; message: Message }]
  'jump-to-message': [messageId: number]
}>()

const auth = useAuthStore()

const isAdminMessage = computed(() => (
  props.currentChat.type === 'group'
  && !props.message.chatId
  && props.message.username === 'Admin'
))

const canDelete = computed(() => {
  if (!props.message) return false
  return props.isOwn || auth.userRole >= 3
})

const displayUsername = computed(() => {
  if (isAdminMessage.value) {
    return 'Admin'
  }

  if (props.isOwn) {
    return auth.username || props.message.username
  }

  if (props.currentChat.type === 'private') {
    return props.currentChat.name || props.message.username
  }

  return props.message.username
})

const isEncrypted = computed(() => isEncryptedMessage(props.message))

const decryptedText = computed(() => {
  return resolveMessageText(props.message, {
    currentUserId: auth.userId ?? -1,
    publicKeys: props.publicKeys,
    encryptedFallback: '[Защищённое сообщение]',
    decryptErrorFallback: '[Ошибка расшифровки]',
  })
})

const hasReplyPreview = computed(() => !!props.message.replyTo || !!props.message.replyToMessageId)

const replyAuthor = computed(() => {
  if (!props.message.replyTo) {
    return 'Сообщение недоступно'
  }

  if (props.message.replyTo.username === 'Admin') {
    return 'Admin'
  }

  return Number(props.message.replyTo.userId) === auth.userId ? 'Вы' : props.message.replyTo.username
})

const replyPreviewText = computed(() => {
  if (!props.message.replyTo) {
    return 'Исходное сообщение было удалено или ещё не загружено'
  }

  return getReplyPreviewText(props.message.replyTo, {
    currentUserId: auth.userId ?? -1,
    publicKeys: props.publicKeys,
    maxLength: 88,
  })
})

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function onContextMenu(mouseEvent: MouseEvent) {
  emit('context-menu', { mouseEvent, message: props.message })
}

function jumpToReplyTarget() {
  if (!props.message.replyTo) {
    return
  }

  emit('jump-to-message', props.message.replyTo.id)
}
</script>
