<template>
  <main class="chat">
    <div class="chat__wrapper">
      <div
        ref="messagesContainer"
        class="chat__messages"
        role="log"
        aria-live="polite"
        aria-label="Сообщения чата"
      >
        <div v-if="replyHighlightStyle" class="chat__reply-highlight" :style="replyHighlightStyle" />
        <MessageItem
          v-for="msg in displayMessages"
          :key="msg.id"
          :message="msg"
          :is-own="Number(msg.userId) === auth.userId"
          :public-keys="chatStore.publicKeys"
          :current-chat="chatStore.currentChat"
          @context-menu="handleContextMenu"
          @jump-to-message="jumpToMessage"
        />
      </div>
    </div>
  </main>

  <section class="message-input" aria-label="Отправка сообщения">
    <div class="message-input__stack">
      <div
        class="message-input__notice-shell"
        :class="{ 'message-input__notice-shell--active': !!composerNotice }"
        :aria-hidden="!composerNotice"
      >
        <div
          class="message-input__notice"
          :class="{ 'message-input__notice--active': !!composerNotice }"
          role="alert"
        >
          {{ composerNotice }}
        </div>
      </div>

      <div v-if="chatStore.replyTarget" class="message-input__reply">
        <button
          type="button"
          class="message-input__reply-main"
          @click="jumpToMessage(chatStore.replyTarget.id)"
        >
          <div class="message-input__reply-line" />
          <div class="message-input__reply-content">
            <div class="message-input__reply-title">Ответ на {{ replyTargetAuthor }}</div>
            <div class="message-input__reply-text">{{ replyTargetPreview }}</div>
          </div>
        </button>

        <button
          type="button"
          class="message-input__reply-close"
          aria-label="Отменить ответ"
          @click="chatStore.clearReplyTarget()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <div class="message-input__wrapper">
        <div class="message-input__field-row">
          <textarea
            ref="messageInputRef"
            v-model="messageText"
            class="message-input__field"
            placeholder="Написать сообщение..."
            aria-label="Текст сообщения"
            rows="1"
            maxlength="1000"
            @input="handleMessageInput"
            @keydown="handleComposerKeydown"
          ></textarea>
        </div>

        <div class="message-input__actions">
          <div class="message-input__actions-left">
            <button
              v-if="chatStore.currentChat.type === 'private'"
              class="message-input__e2ee-toggle"
              :class="{ 'message-input__e2ee-toggle--active': e2eeEnabled }"
              aria-label="Включить или выключить шифрование"
              title="Зашифровать сообщение"
              @click="e2eeEnabled = !e2eeEnabled"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke-width="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <div class="message-input__actions-right">
            <button
              class="message-input__button"
              :class="{ 'message-input__button--active': normalizedComposerText.length > 0 }"
              aria-label="Отправить сообщение"
              @click="sendMessage"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10.5004 11.9998H5.00043M4.91577 12.2913L2.58085 19.266C2.39742 19.8139 2.3057 20.0879 2.37152 20.2566C2.42868 20.4031 2.55144 20.5142 2.70292 20.5565C2.87736 20.6052 3.14083 20.4866 3.66776 20.2495L20.3792 12.7293C20.8936 12.4979 21.1507 12.3822 21.2302 12.2214C21.2993 12.0817 21.2993 11.9179 21.2302 11.7782C21.1507 11.6174 20.8936 11.5017 20.3792 11.2703L3.66193 3.74751C3.13659 3.51111 2.87392 3.39291 2.69966 3.4414C2.54832 3.48351 2.42556 3.59429 2.36821 3.74054C2.30216 3.90893 2.3929 4.18231 2.57437 4.72906L4.91642 11.7853C4.94759 11.8792 4.96317 11.9262 4.96933 11.9742C4.97479 12.0168 4.97473 12.0599 4.96916 12.1025C4.96289 12.1506 4.94718 12.1975 4.91577 12.2913Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useChatStore, type Message } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { apiFetch } from '@/services/api'
import { authService } from '@/services/auth'
import { emitSocketEvent } from '@/composables/useWebSocket'
import { encryptMessageE2EE, getPublicKey } from '@/composables/useCrypto'
import { getReplyPreviewText, normalizeMessageText } from '@/utils/messageContent'
import type { PrivateChatMessagesData, PublicKeyEntry } from '@/types/api'
import type { SendMessageSocketPayload } from '@/types/socket'
import MessageItem from './MessageItem.vue'

const chatStore = useChatStore()
const auth = useAuthStore()
const uiStore = useUiStore()

const messageText = ref('')
const e2eeEnabled = ref(false)
const composerNotice = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const messageInputRef = ref<HTMLTextAreaElement | null>(null)

let highlightTimeout: number | null = null
let removeHighlightTimeout: number | null = null
let privateMessagesRequestId = 0

const displayMessages = computed(() => chatStore.activeMessages)
const normalizedComposerText = computed(() => normalizeMessageText(messageText.value))
const replyHighlight = ref<{ top: number; height: number; visible: boolean } | null>(null)

const replyTargetAuthor = computed(() => {
  const replyTarget = chatStore.replyTarget
  if (!replyTarget) {
    return ''
  }

  return Number(replyTarget.userId) === auth.userId ? 'ваше сообщение' : replyTarget.username
})

const replyTargetPreview = computed(() => {
  const replyTarget = chatStore.replyTarget
  if (!replyTarget) {
    return ''
  }

  return getReplyPreviewText(replyTarget, {
    currentUserId: auth.userId ?? -1,
    publicKeys: chatStore.publicKeys,
    maxLength: 96,
  })
})

const replyHighlightStyle = computed(() => {
  if (!replyHighlight.value) {
    return null
  }

  return {
    top: `${replyHighlight.value.top}px`,
    height: `${replyHighlight.value.height}px`,
    opacity: replyHighlight.value.visible ? '1' : '0',
  }
})

function setComposerNotice(message: string) {
  composerNotice.value = message
}

function clearComposerNotice() {
  composerNotice.value = ''
}

function syncMessageInputHeight() {
  const textarea = messageInputRef.value
  if (!textarea) {
    return
  }

  const styles = window.getComputedStyle(textarea)
  const lineHeight = Number.parseFloat(styles.lineHeight) || 20
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0
  const maxHeight = lineHeight * 10 + paddingTop + paddingBottom

  textarea.style.height = '0px'

  const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

function handleMessageInput() {
  clearComposerNotice()
  syncMessageInputHeight()
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) {
    return
  }

  event.preventDefault()
  void sendMessage()
}

async function resolveRecipientPublicKey(recipientId: number) {
  const cachedKey = chatStore.publicKeys[recipientId]
  if (cachedKey) {
    return cachedKey
  }

  const currentPrivateChat = chatStore.privateChats.find(
    (chat) => chat.chatId === chatStore.currentChat.chatId || chat.otherUser.id === recipientId,
  )

  if (currentPrivateChat?.otherUser.publicKey) {
    chatStore.setPublicKeys({
      ...chatStore.publicKeys,
      [recipientId]: currentPrivateChat.otherUser.publicKey,
    })
    return currentPrivateChat.otherUser.publicKey
  }

    const response = await authService.getPublicKeys()
    if (response.success && response.data?.publicKeys) {
      const refreshedKeys = Object.fromEntries(
      response.data.publicKeys.map((user: PublicKeyEntry) => [user.userId, user.publicKey]),
    )

    chatStore.setPublicKeys({
      ...chatStore.publicKeys,
      ...refreshedKeys,
    })

    return refreshedKeys[recipientId] ?? null
  }

  return null
}

watch(displayMessages, async () => {
  await nextTick()
  scrollToBottom()
}, { deep: true })

watch(messageText, async () => {
  await nextTick()
  syncMessageInputHeight()
})

watch(
  () => chatStore.currentChat.id,
  async () => {
    const requestId = ++privateMessagesRequestId
    e2eeEnabled.value = false
    clearComposerNotice()

    if (chatStore.currentChat.type === 'private' && chatStore.currentChat.chatId) {
      chatStore.setPrivateMessages([])
      await loadPrivateChatMessages(chatStore.currentChat.chatId, requestId)
    } else {
      chatStore.setPrivateMessages([])
    }

    await nextTick()
    syncMessageInputHeight()
    scrollToBottom()
  },
)

watch(
  () => chatStore.replyTarget?.id,
  async (replyTargetId) => {
    if (!replyTargetId) {
      return
    }

    await nextTick()
    messageInputRef.value?.focus()
    syncMessageInputHeight()
  },
)

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

async function loadPrivateChatMessages(chatId: number, requestId: number) {
  try {
    const response = await apiFetch<PrivateChatMessagesData>(`/api/private-chats/${chatId}/messages`)
    if (requestId !== privateMessagesRequestId) {
      return
    }

    if (response.success && response.data?.messages) {
      if (chatStore.currentChat.type !== 'private' || chatStore.currentChat.chatId !== chatId) {
        return
      }

      chatStore.setPrivateMessages(response.data.messages)
    }
  } catch (requestError) {
    if (requestId !== privateMessagesRequestId) {
      return
    }

    chatStore.setPrivateMessages([])
    console.error('Failed to load private chat messages:', requestError)
  }
}

async function sendMessage() {
  const normalizedMessage = normalizedComposerText.value

  if (!normalizedMessage) {
    return
  }

  if (!auth.token) {
    setComposerNotice('Сессия истекла. Войдите снова')
    return
  }

  const msgData: SendMessageSocketPayload = {
    accessToken: auth.token,
    message: normalizedMessage,
    isEncrypted: 0,
    replyToMessageId: chatStore.replyTarget?.id ?? null,
  }

  if (chatStore.currentChat.type === 'private') {
    msgData.chatId = chatStore.currentChat.chatId
    msgData.recipientId = chatStore.currentChat.recipientId
  }

  if (e2eeEnabled.value && chatStore.currentChat.type === 'private') {
    const recipientId = chatStore.currentChat.recipientId
    if (!recipientId) {
      setComposerNotice('Шифрование доступно только в личных чатах')
      return
    }

    const recipientPublicKey = await resolveRecipientPublicKey(recipientId)
    if (!recipientPublicKey) {
      setComposerNotice('Публичный ключ получателя не найден. Шифрование недоступно.')
      return
    }

    try {
      const { encrypted, nonce } = encryptMessageE2EE(normalizedMessage, recipientPublicKey)
      msgData.message = encrypted
      msgData.nonce = nonce
      msgData.senderPublicKey = getPublicKey()
      msgData.isEncrypted = 1
    } catch (encryptionError) {
      console.error('E2EE encryption failed:', encryptionError)
      setComposerNotice('Не удалось зашифровать сообщение')
      return
    }
  }

  clearComposerNotice()
  emitSocketEvent('send_message', msgData)
  messageText.value = ''
  chatStore.clearReplyTarget()
  await nextTick()
  syncMessageInputHeight()
}

function handleContextMenu(event: { mouseEvent: MouseEvent; message: Message }) {
  uiStore.showContextMenu({
    x: event.mouseEvent.clientX,
    y: event.mouseEvent.clientY,
    message: event.message,
    isOwn: Number(event.message.userId) === auth.userId,
  })
}

function jumpToMessage(messageId: number) {
  const targetElement = document.getElementById(`message-${messageId}`)
  if (!targetElement || !messagesContainer.value) {
    return
  }

  targetElement.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })

  if (highlightTimeout) {
    window.clearTimeout(highlightTimeout)
    highlightTimeout = null
  }

  if (removeHighlightTimeout) {
    window.clearTimeout(removeHighlightTimeout)
    removeHighlightTimeout = null
  }

  replyHighlight.value = {
    top: targetElement.offsetTop,
    height: targetElement.offsetHeight,
    visible: false,
  }

  window.requestAnimationFrame(() => {
    if (replyHighlight.value) {
      replyHighlight.value = {
        ...replyHighlight.value,
        visible: true,
      }
    }
  })

  highlightTimeout = window.setTimeout(() => {
    if (replyHighlight.value) {
      replyHighlight.value = {
        ...replyHighlight.value,
        visible: false,
      }
    }
  }, 1150)

  removeHighlightTimeout = window.setTimeout(() => {
    replyHighlight.value = null
  }, 1500)
}

onMounted(() => {
  nextTick(() => {
    scrollToBottom()
    syncMessageInputHeight()
  })
})

onUnmounted(() => {
  if (highlightTimeout) {
    window.clearTimeout(highlightTimeout)
  }

  if (removeHighlightTimeout) {
    window.clearTimeout(removeHighlightTimeout)
  }

  replyHighlight.value = null
})
</script>
