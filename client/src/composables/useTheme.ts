import { computed, ref } from 'vue'

export type ThemeMode = 'dark' | 'light'

declare global {
    interface Window {
        YourMsgrTheme?: {
            get: () => ThemeMode
            set: (nextTheme: ThemeMode) => ThemeMode
            toggle: () => ThemeMode
        }
        toggleYourMsgrTheme?: () => ThemeMode
        setYourMsgrTheme?: (nextTheme: ThemeMode) => ThemeMode
    }
}

const STORAGE_KEY = 'yourmsgr-theme'
const TRANSITION_CLASS = 'theme-switching'
const TRANSITION_DURATION_MS = 760
const theme = ref<ThemeMode>('dark')

let initialized = false
let transitionTimeout: number | null = null

function syncDocumentTheme(nextTheme: ThemeMode) {
    document.documentElement.dataset.theme = nextTheme
    document.documentElement.style.colorScheme = nextTheme
}

function startThemeTransition() {
    const root = document.documentElement
    root.classList.add(TRANSITION_CLASS)

    if (transitionTimeout !== null) {
        window.clearTimeout(transitionTimeout)
    }

    transitionTimeout = window.setTimeout(() => {
        root.classList.remove(TRANSITION_CLASS)
        transitionTimeout = null
    }, TRANSITION_DURATION_MS)
}

function normalizeTheme(nextTheme: ThemeMode | string | null): ThemeMode {
    return nextTheme === 'light' ? 'light' : 'dark'
}

function applyTheme(nextTheme: ThemeMode | string, options: { animate?: boolean } = {}) {
    const normalizedTheme = normalizeTheme(nextTheme)
    theme.value = normalizedTheme

    if (options.animate !== false) {
        startThemeTransition()
        void document.documentElement.offsetWidth
    }

    syncDocumentTheme(normalizedTheme)
    localStorage.setItem(STORAGE_KEY, normalizedTheme)
    return normalizedTheme
}

function registerThemeConsoleApi() {
    if (typeof window === 'undefined') {
        return
    }

    window.YourMsgrTheme = {
        get: () => theme.value,
        set: (nextTheme: ThemeMode) => applyTheme(nextTheme),
        toggle: () => applyTheme(theme.value === 'light' ? 'dark' : 'light'),
    }

    window.toggleYourMsgrTheme = () => window.YourMsgrTheme!.toggle()
    window.setYourMsgrTheme = (nextTheme: ThemeMode) => window.YourMsgrTheme!.set(nextTheme)
}

export function initTheme() {
    if (initialized) {
        registerThemeConsoleApi()
        return
    }

    const savedTheme = localStorage.getItem(STORAGE_KEY)
    const nextTheme = normalizeTheme(savedTheme)

    theme.value = nextTheme
    syncDocumentTheme(nextTheme)
    registerThemeConsoleApi()
    initialized = true
}

export function useTheme() {
    initTheme()

    const isLightTheme = computed(() => theme.value === 'light')

    return {
        theme,
        isLightTheme,
        setTheme: (nextTheme: ThemeMode) => applyTheme(nextTheme),
        toggleTheme: () => applyTheme(theme.value === 'light' ? 'dark' : 'light'),
    }
}
