import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message } from '@/stores/chat'

type ContextMenuState = {
    visible: boolean
    x: number
    y: number
    message: Message | null
    isOwn: boolean
}

const DEFAULT_CONTEXT_MENU_STATE: ContextMenuState = {
    visible: false,
    x: 0,
    y: 0,
    message: null,
    isOwn: false,
}

export const useUiStore = defineStore('ui', () => {
    const contextMenu = ref<ContextMenuState>({ ...DEFAULT_CONTEXT_MENU_STATE })

    function showContextMenu(payload: Omit<ContextMenuState, 'visible'>) {
        contextMenu.value = {
            visible: true,
            ...payload,
        }
    }

    function hideContextMenu() {
        contextMenu.value = { ...DEFAULT_CONTEXT_MENU_STATE }
    }

    return {
        contextMenu,
        showContextMenu,
        hideContextMenu,
    }
})
