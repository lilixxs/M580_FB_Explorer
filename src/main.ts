import { createApp } from 'vue'
import 'tdesign-vue-next/es/style/index.css'
import './styles.css'
import App from './App.vue'
import { installMcpBridge } from './core/mcp'
import { createMcpHandlers, getMcpState } from './mcpHandlers'

const app = createApp(App)
app.mount('#app')

installMcpBridge(createMcpHandlers(), getMcpState)
