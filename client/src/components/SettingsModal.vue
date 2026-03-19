<template>
  <div class="modal modal--settings" role="dialog" aria-labelledby="settings-title">
    <div class="modal__backdrop" @click="emit('close')"></div>

    <div class="modal__content modal__content--settings">
      <h2 class="modal__header" id="settings-title">Настройки</h2>

      <form class="modal__form form form--settings" @submit.prevent="handleSave">
        <label class="form__label" for="settings-username">Отображаемое имя (никнейм)</label>
        <input
          id="settings-username"
          v-model="newUsername"
          class="form__input"
          :class="{ 'form__input--error': messageTone === 'error' && !!message }"
          type="text"
          placeholder="2-16 символов"
          required
          @input="clearMessage"
        >

        <button
          class="form__button form__button--compact"
          :class="{ 'form__button--active': isValid && !saving }"
          type="submit"
          :disabled="saving || !isValid"
        >
          {{ saving ? 'Сохранение...' : 'Сохранить' }}
        </button>

        <div
          class="form__response-shell"
          :class="{ 'form__response-shell--active': !!message }"
          :aria-hidden="!message"
        >
          <div
            class="form__response"
            :class="[
              { 'form__response--active': !!message },
              messageTone === 'success' ? 'form__response--success' : 'form__response--error',
            ]"
            role="status"
          >
            {{ message }}
          </div>
        </div>
      </form>

      <div class="modal__app-info">
        <span class="modal__app-name">YourMsgr</span>
        <span class="modal__app-version">v2.0.6</span>
      </div>

      <IconButton
        ariaLabel="Закрыть"
        class="modal__close"
        @click="emit('close')"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M6.79289 6.79289C7.18342 6.40237 7.81658 6.40237 8.20711 6.79289L12 10.5858L15.7929 6.79289C16.1834 6.40237 16.8166 6.40237 17.2071 6.79289C17.5976 7.18342 17.5976 7.81658 17.2071 8.20711L13.4142 12L17.2071 15.7929C17.5976 16.1834 17.5976 16.8166 17.2071 17.2071C16.8166 17.5976 16.1834 17.5976 15.7929 17.2071L12 13.4142L8.20711 17.2071C7.81658 17.5976 7.18342 17.5976 6.79289 17.2071C6.40237 16.8166 6.40237 16.1834 6.79289 15.7929L10.5858 12L6.79289 8.20711C6.40237 7.81658 6.40237 7.18342 6.79289 6.79289Z" />
        </svg>
      </IconButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { authService } from '@/services/auth'
import { sanitizeUnexpectedMessage } from '@/services/http'
import { useAuthStore } from '@/stores/auth'
import IconButton from '@/components/IconButton.vue'

const emit = defineEmits<{
  close: []
}>()

const auth = useAuthStore()

const newUsername = ref('')
const message = ref('')
const messageTone = ref<'success' | 'error'>('success')
const saving = ref(false)

const normalizedUsername = computed(() => newUsername.value.trim())
const currentUsername = computed(() => (auth.username || '').trim())
const isValid = computed(() => (
  normalizedUsername.value.length >= 2
  && normalizedUsername.value.length <= 16
  && normalizedUsername.value !== currentUsername.value
))

const SETTINGS_MESSAGES: Record<string, string> = {
  'Invalid username': 'Некорректный никнейм',
  'Failed to update username': 'Не удалось обновить никнейм',
  'Username already taken': 'Этот никнейм уже занят',
  'Username unchanged': 'Новый никнейм совпадает с текущим',
  'Invalid or expired token': 'Сессия устарела. Повторите действие',
  'Unauthorized': 'Сессия истекла. Войдите снова',
  'Session expired': 'Сессия истекла. Войдите снова',
  'Reserved username': 'Этот никнейм зарезервирован',
}

function localizeSettingsMessage(messageText?: string, fallback = 'Неизвестная ошибка') {
  if (!messageText) {
    return fallback
  }

  if (SETTINGS_MESSAGES[messageText]) {
    return SETTINGS_MESSAGES[messageText]
  }

  return sanitizeUnexpectedMessage(messageText, fallback)
}

function clearMessage() {
  message.value = ''
}

onMounted(() => {
  newUsername.value = auth.username || ''
})

async function handleSave() {
  if (!isValid.value || saving.value) {
    return
  }

  saving.value = true
  message.value = ''

  try {
    const response = await authService.updateUsername(normalizedUsername.value)

    if (response.success) {
      if (response.data?.accessToken) {
        auth.setAuth(response.data.accessToken)
      } else {
        auth.setUsername(response.data?.username || normalizedUsername.value)
      }

      messageTone.value = 'success'
      message.value = 'Имя обновлено'
      newUsername.value = response.data?.username || normalizedUsername.value
      return
    }

    messageTone.value = 'error'
    message.value = localizeSettingsMessage(response.message, 'Ошибка обновления')
  } catch (requestError: unknown) {
    console.error('[Settings] Update username failed:', requestError)
    messageTone.value = 'error'
    message.value = localizeSettingsMessage(
      requestError instanceof Error ? requestError.message : undefined,
      'Ошибка обновления',
    )
  } finally {
    saving.value = false
  }
}
</script>
