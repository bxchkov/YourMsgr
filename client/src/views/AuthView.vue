<template>
  <div class="auth-screen">
    <div class="modal-backdrop"></div>

    <div class="modal modal--auth" role="dialog" aria-labelledby="auth-title">
      <Transition name="modal-swap" mode="out-in" appear>
        <div :key="mode" class="modal__content">
          <h2 class="modal__header" id="auth-title">{{ headerTitle }}</h2>

          <form class="modal__form form" @submit.prevent="handleSubmit">
            <label class="form__label" :for="`${mode}-login`">Логин</label>
            <input
              :id="`${mode}-login`"
              v-model="loginValue"
              class="form__input"
              :class="{ 'form__input--error': !!error }"
              type="text"
              placeholder="6-16 символов, англ. буквы/цифры"
              autocomplete="username"
              required
              @input="clearError"
            >

            <label class="form__label" :for="`${mode}-password`">Пароль</label>
            <input
              :id="`${mode}-password`"
              v-model="password"
              class="form__input"
              :class="{ 'form__input--error': !!error }"
              type="password"
              placeholder="8-16 символов"
              :autocomplete="isLoginMode ? 'current-password' : 'new-password'"
              required
              @input="clearError"
            >

            <button
              class="form__button"
              :class="{ 'form__button--active': isFormValid && !loading }"
              type="submit"
              :disabled="loading || !isFormValid"
            >
              {{ submitLabel }}
            </button>

            <div
              class="form__response-shell"
              :class="{ 'form__response-shell--active': !!error }"
              :aria-hidden="!error"
            >
              <div
                class="form__response form__response--error"
                :class="{ 'form__response--active': !!error }"
                role="alert"
              >
                {{ error }}
              </div>
            </div>
          </form>

          <div class="modal__footer">
            <span class="form__label form__label--footer">{{ footerLabel }}</span>
            <button class="form__link" type="button" @click="toggleMode">{{ footerAction }}</button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authService } from '@/services/auth'
import { sanitizeUnexpectedMessage } from '@/services/http'
import { AUTH_SESSION_HINT_STORAGE_KEY, useAuthStore } from '@/stores/auth'
import { logger } from '@/utils/logger'

const router = useRouter()
const auth = useAuthStore()

const mode = ref<'login' | 'register'>('login')
const loginValue = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'Invalid credentials': 'Неверный логин или пароль',
  'Invalid credentials format': 'Проверьте корректность заполнения формы',
  'User already exists': 'Пользователь с таким логином уже существует',
  'Username already taken': 'Этот логин уже занят',
  'Invalid input data': 'Проверьте корректность введённых данных',
  'Missing credentials': 'Не переданы данные для авторизации',
  'Login failed': 'Не удалось выполнить вход',
  'Registration failed': 'Не удалось создать аккаунт',
  'Too many requests': 'Слишком много попыток. Попробуйте чуть позже',
  'Request failed': 'Не удалось выполнить запрос',
  'Unauthorized': 'Сессия истекла. Войдите снова',
  'Invalid or expired token': 'Сессия устарела. Повторите действие',
  'Session expired': 'Сессия истекла. Войдите снова',
  'Token mismatch': 'Сессия устарела. Войдите снова',
  'Secure password encryption requires HTTPS': 'Для безопасного шифрования ключа нужен защищённый контекст браузера',
  'Reserved login': 'Этот логин зарезервирован',
  'Reserved username': 'Этот никнейм зарезервирован',
}

async function loadCrypto() {
  return import('@/composables/useCrypto')
}

const isLoginMode = computed(() => mode.value === 'login')

const headerTitle = computed(() => (
  isLoginMode.value ? 'Войти в аккаунт' : 'Создать аккаунт'
))

const submitLabel = computed(() => {
  if (loading.value) {
    return isLoginMode.value ? 'Вход...' : 'Создание...'
  }

  return isLoginMode.value ? 'Войти' : 'Создать'
})

const footerLabel = computed(() => (
  isLoginMode.value ? 'Нет аккаунта?' : 'Уже есть аккаунт?'
))

const footerAction = computed(() => (
  isLoginMode.value ? 'Создать' : 'Войти'
))

const isFormValid = computed(() => {
  const loginOk = /^[a-zA-Z0-9_-]{6,16}$/.test(loginValue.value)
  const passOk = password.value.length >= 8 && password.value.length <= 16
  return loginOk && passOk
})

function localizeAuthError(message?: string, fallback = 'Неизвестная ошибка') {
  if (!message) {
    return fallback
  }

  if (AUTH_ERROR_MESSAGES[message]) {
    return AUTH_ERROR_MESSAGES[message]
  }

  return sanitizeUnexpectedMessage(message, fallback)
}

function clearError() {
  error.value = ''
}

function toggleMode() {
  mode.value = isLoginMode.value ? 'register' : 'login'
}

async function handleSubmit() {
  if (isLoginMode.value) {
    await handleLogin()
    return
  }

  await handleRegister()
}

watch(mode, () => {
  clearError()
})

onMounted(async () => {
  if (localStorage.getItem(AUTH_SESSION_HINT_STORAGE_KEY) !== '1') {
    return
  }

  const sessionRes = await authService.checkSession()
  if (sessionRes.success && sessionRes.data?.accessToken) {
    auth.setAuth(sessionRes.data.accessToken)
    await router.replace('/chat/general')
    return
  }

  localStorage.removeItem(AUTH_SESSION_HINT_STORAGE_KEY)
})

async function handleLogin() {
  if (!isFormValid.value || loading.value) return

  loading.value = true
  error.value = ''

  try {
    const response = await authService.login(loginValue.value, password.value)

    if (!response.success) {
      error.value = localizeAuthError(response.message, 'Неверный логин или пароль')
      return
    }

    if (response.data?.encryptedPrivateKey) {
      try {
        const {
          initCrypto,
          decryptPrivateKeyWithPassword,
          savePrivateKey,
          derivePublicKeyFromPrivateKey,
          savePublicKey,
        } = await loadCrypto()

        await initCrypto()
        const decryptedPrivateKey = await decryptPrivateKeyWithPassword(
          {
            encrypted: response.data.encryptedPrivateKey,
            iv: response.data.encryptedPrivateKeyIv,
            salt: response.data.encryptedPrivateKeySalt,
          },
          password.value,
        )

        savePrivateKey(decryptedPrivateKey)
        savePublicKey(derivePublicKeyFromPrivateKey(decryptedPrivateKey))
      } catch (decryptError) {
        logger.error('[Login] Failed to decrypt private key:', decryptError)
        const decryptMessage = decryptError instanceof Error
          ? decryptError.message
          : undefined
        error.value = localizeAuthError(
          decryptMessage,
          'Не удалось расшифровать приватный ключ',
        )
        return
      }
    }

    if (response.data?.accessToken) {
      auth.setAuth(response.data.accessToken)
      await router.push('/chat/general')
      return
    }

    error.value = 'Не удалось выполнить вход'
  } catch (requestError: unknown) {
    logger.error('[Login] Request failed:', requestError)
    error.value = localizeAuthError(
      requestError instanceof Error ? requestError.message : undefined,
      'Ошибка входа',
    )
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  if (!isFormValid.value || loading.value) return

  loading.value = true
  error.value = ''

  try {
    const {
      initCrypto,
      generateKeyPair,
      savePrivateKey,
      savePublicKey,
      encryptPrivateKeyWithPassword,
    } = await loadCrypto()

    await initCrypto()

    const keys = generateKeyPair()
    const encryptedData = await encryptPrivateKeyWithPassword(keys.privateKey, password.value)

    const response = await authService.register(
      loginValue.value,
      password.value,
      loginValue.value,
      keys.publicKey,
      encryptedData.encrypted,
      encryptedData.iv,
      encryptedData.salt,
    )

    if (!response.success) {
      error.value = localizeAuthError(response.message, 'Ошибка регистрации')
      return
    }

    if (response.data?.accessToken) {
      savePrivateKey(keys.privateKey)
      savePublicKey(keys.publicKey)
      auth.setAuth(response.data.accessToken)
      await router.push('/chat/general')
      return
    }

    error.value = 'Не удалось создать аккаунт'
  } catch (requestError: unknown) {
    logger.error('[Register] Request failed:', requestError)
    error.value = localizeAuthError(
      requestError instanceof Error ? requestError.message : undefined,
      'Ошибка регистрации',
    )
  } finally {
    loading.value = false
  }
}
</script>
