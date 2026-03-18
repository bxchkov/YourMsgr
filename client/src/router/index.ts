import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            redirect: '/chat',
        },
        {
            path: '/auth',
            name: 'auth',
            component: () => import('@/views/AuthView.vue'),
        },
        {
            path: '/chat',
            name: 'chat',
            component: () => import('@/views/ChatView.vue'),
            meta: { requiresAuth: true },
        },
    ],
})

router.beforeEach((to) => {
    const auth = useAuthStore()
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
        return '/auth'
    }
    if (to.name === 'auth' && auth.isAuthenticated) {
        return '/chat'
    }
})

export default router
