import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            redirect: '/chat/general',
        },
        {
            path: '/auth',
            name: 'auth',
            component: () => import('@/views/AuthView.vue'),
        },
        {
            path: '/chat',
            redirect: '/chat/general',
        },
        {
            path: '/chat/general',
            name: 'chat-general',
            component: () => import('@/views/ChatView.vue'),
            meta: { requiresAuth: true },
        },
        {
            path: '/chat/private/:chatId(\\d+)',
            name: 'chat-private',
            component: () => import('@/views/ChatView.vue'),
            meta: { requiresAuth: true },
        },
        {
            path: '/chat/:pathMatch(.*)*',
            redirect: '/chat/general',
        },
    ],
})

router.beforeEach((to) => {
    const auth = useAuthStore()
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
        return '/auth'
    }
    if (to.name === 'auth' && auth.isAuthenticated) {
        return '/chat/general'
    }
})

export default router
