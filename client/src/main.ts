import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { setupAuthSync } from './composables/useAuthSync'
import { initTheme } from './composables/useTheme'
import './styles/main.scss'

initTheme()

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)
setupAuthSync(pinia, router)
app.mount('#app')
