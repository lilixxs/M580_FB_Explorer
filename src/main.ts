import { createApp } from 'vue'
import 'tdesign-vue-next/es/style/index.css'
import './styles.css'
import App from './App.vue'
import { i18n } from './i18n'
import { installMcpBridge } from './core/mcp'
import { createMcpHandlers, getMcpState } from './mcpHandlers'

const app = createApp(App)
app.use(i18n)
app.mount('#app')

installMcpBridge(createMcpHandlers(), getMcpState)
