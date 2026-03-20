import { computed, ref } from 'vue'

export type ThemeMode = 'dark' | 'light'

declare global {
    interface Window {
        YourMsgrTheme?: {
            get: () => ThemeMode
            set: (nextTheme: ThemeMode, durationMs?: number) => ThemeMode
            toggle: (durationMs?: number) => ThemeMode
            debugSet: (nextTheme: ThemeMode, durationMs?: number) => ThemeMode
            debugToggle: (durationMs?: number) => ThemeMode
        }
        toggleYourMsgrTheme?: (durationMs?: number) => ThemeMode
        setYourMsgrTheme?: (nextTheme: ThemeMode, durationMs?: number) => ThemeMode
        toggleYourMsgrThemeDebug?: (durationMs?: number) => ThemeMode
        setYourMsgrThemeDebug?: (nextTheme: ThemeMode, durationMs?: number) => ThemeMode
    }
}

const STORAGE_KEY = 'yourmsgr-theme'
const TRANSITION_CLASS = 'theme-switching'
const DEFAULT_TRANSITION_DURATION_MS = 1440
const DEBUG_TRANSITION_DURATION_MS = 3600
const theme = ref<ThemeMode>('dark')

let initialized = false
let transitionTimeout: number | null = null

function syncDocumentTheme(nextTheme: ThemeMode) {
    document.documentElement.dataset.theme = nextTheme
    document.documentElement.style.colorScheme = nextTheme
}

function clearThemeTransition() {
    const root = document.documentElement
    root.classList.remove(TRANSITION_CLASS)
    root.style.removeProperty('--theme-transition-duration')
}

function startThemeTransition(durationMs: number) {
    const root = document.documentElement
    root.style.setProperty('--theme-transition-duration', `${durationMs}ms`)
    root.classList.add(TRANSITION_CLASS)

    if (transitionTimeout !== null) {
        window.clearTimeout(transitionTimeout)
    }

    transitionTimeout = window.setTimeout(() => {
        clearThemeTransition()
        transitionTimeout = null
    }, durationMs)
}

function normalizeTheme(nextTheme: ThemeMode | string | null): ThemeMode {
    return nextTheme === 'light' ? 'light' : 'dark'
}

function applyTheme(
    nextTheme: ThemeMode | string,
    options: { animate?: boolean; durationMs?: number } = {},
) {
    const normalizedTheme = normalizeTheme(nextTheme)
    theme.value = normalizedTheme

    if (options.animate !== false) {
        startThemeTransition(options.durationMs ?? DEFAULT_TRANSITION_DURATION_MS)
        void document.documentElement.offsetWidth
    } else if (transitionTimeout !== null) {
        window.clearTimeout(transitionTimeout)
        transitionTimeout = null
        clearThemeTransition()
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
        set: (nextTheme: ThemeMode, durationMs?: number) => applyTheme(nextTheme, { durationMs }),
        toggle: (durationMs?: number) => applyTheme(theme.value === 'light' ? 'dark' : 'light', { durationMs }),
        debugSet: (nextTheme: ThemeMode, durationMs = DEBUG_TRANSITION_DURATION_MS) => applyTheme(nextTheme, {
            durationMs,
        }),
        debugToggle: (durationMs = DEBUG_TRANSITION_DURATION_MS) => applyTheme(
            theme.value === 'light' ? 'dark' : 'light',
            { durationMs },
        ),
    }

    window.toggleYourMsgrTheme = (durationMs?: number) => window.YourMsgrTheme!.toggle(durationMs)
    window.setYourMsgrTheme = (nextTheme: ThemeMode, durationMs?: number) => (
        window.YourMsgrTheme!.set(nextTheme, durationMs)
    )
    window.toggleYourMsgrThemeDebug = (durationMs = DEBUG_TRANSITION_DURATION_MS) => (
        window.YourMsgrTheme!.debugToggle(durationMs)
    )
    window.setYourMsgrThemeDebug = (nextTheme: ThemeMode, durationMs = DEBUG_TRANSITION_DURATION_MS) => (
        window.YourMsgrTheme!.debugSet(nextTheme, durationMs)
    )
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
        setTheme: (nextTheme: ThemeMode, durationMs?: number) => applyTheme(nextTheme, { durationMs }),
        toggleTheme: (durationMs?: number) => applyTheme(theme.value === 'light' ? 'dark' : 'light', { durationMs }),
    }
}
