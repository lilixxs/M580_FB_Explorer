/// <reference types="vite/client" />

import type { McpBridge } from './core/mcp'

declare global {
  interface Window {
    __M580_MCP_BRIDGE__?: McpBridge
  }
}

export {}
