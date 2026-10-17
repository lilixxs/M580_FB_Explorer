/**
 * MCP style bridge: stable tool schemas plus an injectable executor.
 *
 * This module only describes the tools of the current page and a transport
 * adapter stub. It never starts a local MCP service and never opens a socket.
 */

import { CATEGORY_ORDER } from '../types'

export type McpPropertyType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'

export interface McpPropertySchema {
  type?: McpPropertyType
  description?: string
  enum?: Array<string | number | boolean>
  minimum?: number
  maximum?: number
  items?: McpPropertySchema
}

export interface McpToolSchema {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, McpPropertySchema>
    required?: string[]
    additionalProperties?: boolean
  }
}

export interface McpToolResult {
  ok: boolean
  result?: unknown
  error?: string
}

export interface McpBridge {
  version: string
  tools: McpToolSchema[]
  listTools(): McpToolSchema[]
  callTool(name: string, input?: Record<string, unknown>): Promise<McpToolResult>
  getState(): unknown
}

export type McpHandler = (input: Record<string, unknown>) => unknown | Promise<unknown>

export type McpHandlers = Record<string, McpHandler>

export const MCP_BRIDGE_VERSION = '1.1.0'

const stringProp = (description: string): McpPropertySchema => ({ type: 'string', description })
const numberProp = (description: string): McpPropertySchema => ({ type: 'number', description })
const integerProp = (description: string): McpPropertySchema => ({ type: 'integer', minimum: 1, description })
const booleanProp = (description: string): McpPropertySchema => ({ type: 'boolean', description })

/** Variable categories stay in sync with the data model in `types.ts`. */
const categoryProp = (description: string): McpPropertySchema => ({
  type: 'string',
  description,
  enum: [...CATEGORY_ORDER]
})

export const MCP_TOOL_SCHEMAS: McpToolSchema[] = [
  {
    name: 'm580_get_state',
    description: '返回当前已加载交换文件的状态摘要（文件、功能块名、变量与程序段计数）',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'm580_import',
    description: '导入 .xdb/.xst/.xsy 的 XML 文本并替换当前文档',
    inputSchema: {
      type: 'object',
      properties: { xml: stringProp('交换文件 XML 全文'), fileName: stringProp('文件名，用于识别类型') },
      required: ['xml'],
      additionalProperties: false
    }
  },
  {
    name: 'm580_list_variables',
    description: '按分类与关键字列出变量',
    inputSchema: {
      type: 'object',
      properties: {
        category: categoryProp('IN|OUT|IN_OUT|PUBLIC|PRIVATE|GLOBAL'),
        search: stringProp('名称/类型/地址/注释关键字')
      },
      additionalProperties: false
    }
  },
  {
    name: 'm580_upsert_variable',
    description: '新增或按 id 更新变量',
    inputSchema: {
      type: 'object',
      properties: {
        id: stringProp('已有变量 id，缺省表示新增'),
        name: stringProp('变量名'),
        typeName: stringProp('IEC 数据类型'),
        category: categoryProp('IN|OUT|IN_OUT|PUBLIC|PRIVATE|GLOBAL'),
        topologicalAddress: stringProp('拓扑地址，例如 %MW100'),
        defaultValue: stringProp('默认值（全局变量）'),
        comment: stringProp('注释'),
        initValue: stringProp('功能块局部变量初值')
      },
      required: ['name', 'typeName', 'category'],
      additionalProperties: false
    }
  },
  {
    name: 'm580_delete_variable',
    description: '按 id 删除变量',
    inputSchema: {
      type: 'object',
      properties: { id: stringProp('变量 id') },
      required: ['id'],
      additionalProperties: false
    }
  },
  {
    name: 'm580_get_section',
    description: '读取程序段元数据与源码；ST 返回源码，非 ST 返回 XML 原文',
    inputSchema: {
      type: 'object',
      properties: { sectionId: stringProp('程序段 id，缺省为当前程序段') },
      additionalProperties: false
    }
  },
  {
    name: 'm580_set_section_source',
    description: '写入程序段 ST 源码（不立即重新解析）',
    inputSchema: {
      type: 'object',
      properties: { sectionId: stringProp('程序段 id'), source: stringProp('ST 语句体') },
      required: ['source'],
      additionalProperties: false
    }
  },
  {
    name: 'm580_save_section',
    description: '把当前编辑内容写回交换文件并触发重新解析',
    inputSchema: {
      type: 'object',
      properties: { sectionId: stringProp('程序段 id，缺省为当前程序段') },
      additionalProperties: false
    }
  },
  {
    name: 'm580_format_section',
    description: '格式化 ST 源码（关键字大写、四空格缩进）',
    inputSchema: {
      type: 'object',
      properties: { sectionId: stringProp('程序段 id，缺省为当前程序段') },
      additionalProperties: false
    }
  },
  {
    name: 'm580_replace_in_section',
    description: '在指定程序段内执行查找替换',
    inputSchema: {
      type: 'object',
      properties: {
        sectionId: stringProp('程序段 id，缺省为当前程序段'),
        query: stringProp('查找内容'),
        replacement: stringProp('替换内容'),
        caseSensitive: booleanProp('区分大小写'),
        wholeWord: booleanProp('全字匹配'),
        useRegex: booleanProp('按正则表达式处理')
      },
      required: ['query', 'replacement'],
      additionalProperties: false
    }
  },
  {
    name: 'm580_extract_calls',
    description: '解析指定程序段或全部程序段中的功能块与函数调用',
    inputSchema: {
      type: 'object',
      properties: { sectionId: stringProp('程序段 id，缺省为全部程序段') },
      additionalProperties: false
    }
  },
  {
    name: 'm580_export_xdb',
    description: '按仓库 AGENTS.md 约束导出 .xdb 文本',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'm580_get_help',
    description: '返回帮助文档原文（HELP.md）',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'm580_jump',
    description: '在界面中跳转到程序段、行列或变量',
    inputSchema: {
      type: 'object',
      properties: {
        sectionId: stringProp('目标程序段 id'),
        line: numberProp('目标行号，从 1 开始'),
        column: numberProp('目标列号，从 1 开始'),
        variableName: stringProp('目标变量名')
      },
      additionalProperties: false
    }
  },
  {
    name: 'm580_fb_get_metadata',
    description: '读取当前功能块元信息（文件名、功能块名、版本、变量与程序段计数），本页 Bridge 工具',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'm580_fb_list_variables',
    description: '按分类与关键字列出当前功能块变量，本页 Bridge 工具',
    inputSchema: {
      type: 'object',
      properties: {
        category: categoryProp('IN|OUT|IN_OUT|PUBLIC|PRIVATE|GLOBAL'),
        search: stringProp('名称/类型/地址/注释关键字')
      },
      additionalProperties: false
    }
  },
  {
    name: 'm580_fb_upsert_variable',
    description: '新增变量或按 id 更新变量，本页 Bridge 工具',
    inputSchema: {
      type: 'object',
      properties: {
        id: stringProp('已有变量 id，缺省表示新增'),
        name: stringProp('变量名'),
        typeName: stringProp('IEC 数据类型'),
        category: categoryProp('IN|OUT|IN_OUT|PUBLIC|PRIVATE|GLOBAL'),
        topologicalAddress: stringProp('拓扑地址，例如 %MW100'),
        defaultValue: stringProp('默认值（全局变量）'),
        comment: stringProp('注释'),
        initValue: stringProp('功能块局部变量初值')
      },
      required: ['name', 'typeName', 'category'],
      additionalProperties: false
    }
  },
  {
    name: 'm580_fb_delete_variable',
    description: '按 id 删除变量，本页 Bridge 工具',
    inputSchema: {
      type: 'object',
      properties: { id: stringProp('变量 id') },
      required: ['id'],
      additionalProperties: false
    }
  },
  {
    name: 'm580_fb_get_source',
    description: '读取程序段源码；ST 程序段返回 ST 源码，非 ST 程序段返回 XML 原文并标记只读，本页 Bridge 工具',
    inputSchema: {
      type: 'object',
      properties: { sectionId: stringProp('程序段 id，缺省为当前程序段') },
      additionalProperties: false
    }
  },
  {
    name: 'm580_fb_set_source',
    description: '写入 ST 程序段源码，写入后立即刷新调用列表；非 ST 程序段拒绝写入，本页 Bridge 工具',
    inputSchema: {
      type: 'object',
      properties: {
        sectionId: stringProp('程序段 id，缺省为当前程序段'),
        source: stringProp('ST 语句体')
      },
      required: ['source'],
      additionalProperties: false
    }
  },
  {
    name: 'm580_fb_insert_snippet',
    description: '在 ST 程序段指定行列插入源码文本或 IF/FOR/WHILE 模板，插入后刷新调用列表，本页 Bridge 工具',
    inputSchema: {
      type: 'object',
      properties: {
        sectionId: stringProp('程序段 id，缺省为当前程序段'),
        line: integerProp('插入行号，从 1 开始，缺省为 1'),
        column: integerProp('插入列号，从 1 开始，缺省为 1'),
        source: stringProp('要插入的 ST 源码文本，与 kind 二选一'),
        kind: {
          type: 'string',
          description: '模板类型，与 source 二选一',
          enum: ['IF', 'FOR', 'WHILE']
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'm580_fb_analyze_calls',
    description: '重新解析并返回功能块与函数调用，可按程序段过滤，本页 Bridge 工具',
    inputSchema: {
      type: 'object',
      properties: { sectionId: stringProp('程序段 id，缺省为全部程序段') },
      additionalProperties: false
    }
  }
]

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateProperty(key: string, value: unknown, schema: McpPropertySchema): string | null {
  if (schema.enum && !schema.enum.some((item) => item === value)) {
    return `参数 ${key} 的取值必须是 ${schema.enum.join('|')}`
  }
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') return `参数 ${key} 必须是字符串`
      break
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `参数 ${key} 必须是数字`
      break
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) return `参数 ${key} 必须是整数`
      break
    case 'boolean':
      if (typeof value !== 'boolean') return `参数 ${key} 必须是布尔值`
      break
    case 'array':
      if (!Array.isArray(value)) return `参数 ${key} 必须是数组`
      break
    case 'object':
      if (!isPlainObject(value)) return `参数 ${key} 必须是对象`
      break
    default:
      break
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      return `参数 ${key} 不能小于 ${schema.minimum}`
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      return `参数 ${key} 不能大于 ${schema.maximum}`
    }
  }
  return null
}

/**
 * Validate a tool call against its declared schema.
 * Returns an error message, or null when the input is acceptable.
 * The validator never fills in defaults for declared parameters.
 */
export function validateToolInput(tool: McpToolSchema, input: unknown): string | null {
  if (!isPlainObject(input)) return '参数必须是 JSON 对象'
  const { properties, required = [], additionalProperties = true } = tool.inputSchema

  for (const key of Object.keys(input)) {
    if (!(key in properties) && additionalProperties === false) {
      return `不支持的参数：${key}`
    }
  }
  for (const key of required) {
    if (input[key] === undefined) return `缺少必需参数：${key}`
  }
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    const schema = properties[key]
    if (!schema) continue
    const error = validateProperty(key, value, schema)
    if (error) return error
  }
  return null
}

function cloneSchema(tool: McpToolSchema): McpToolSchema {
  return {
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.properties).map(([key, schema]) => [
          key,
          { ...schema, ...(schema.enum ? { enum: [...schema.enum] } : {}) }
        ])
      )
    }
  }
}

export function createMcpBridge(handlers: McpHandlers, getState: () => unknown): McpBridge {
  const tools = MCP_TOOL_SCHEMAS.map(cloneSchema)

  return {
    version: MCP_BRIDGE_VERSION,
    tools,
    listTools: () => tools.map(cloneSchema),
    getState,
    async callTool(name: string, input: Record<string, unknown> = {}): Promise<McpToolResult> {
      const tool = tools.find((item) => item.name === name)
      if (!tool) {
        return { ok: false, error: `未知工具：${name}` }
      }
      const validationError = validateToolInput(tool, input)
      if (validationError) {
        return { ok: false, error: validationError }
      }
      const handler = handlers[name]
      if (!handler) {
        return { ok: false, error: `工具 ${name} 尚未绑定实现（Schema 桩）` }
      }
      try {
        const result = await handler(input)
        return { ok: true, result }
      } catch (error) {
        return { ok: false, error: (error as Error).message || String(error) }
      }
    }
  }
}

export function installMcpBridge(handlers: McpHandlers, getState: () => unknown): McpBridge {
  const bridge = createMcpBridge(handlers, getState)
  if (typeof window !== 'undefined') {
    window.__M580_MCP_BRIDGE__ = bridge
  }
  return bridge
}

export interface McpTransportConfig {
  /** Informational endpoint only; the stub never dials it. */
  endpoint?: string
}

/**
 * Transport adapter stub for a future MCP transport. It is not an MCP server
 * and performs no network I/O. The page installs no transport by default.
 */
export interface McpTransportStub {
  readonly kind: 'stub'
  readonly connected: false
  readonly configured: boolean
  readonly endpoint: string
  configure(config: McpTransportConfig): void
  connect(): Promise<never>
  disconnect(): void
}

export function createMcpTransportStub(config: McpTransportConfig = {}): McpTransportStub {
  let endpoint = ''
  let configured = false

  const stub: McpTransportStub = {
    kind: 'stub',
    get connected(): false {
      return false
    },
    get configured() {
      return configured
    },
    get endpoint() {
      return endpoint
    },
    configure(next: McpTransportConfig) {
      if (!isPlainObject(next)) throw new Error('transport 配置必须是对象')
      const value = next.endpoint
      if (value !== undefined && typeof value !== 'string') {
        throw new Error('endpoint 必须是字符串')
      }
      endpoint = (value ?? '').trim()
      configured = endpoint.length > 0
    },
    async connect(): Promise<never> {
      throw new Error('MCP transport 适配桩不建立网络连接；本页未启动 MCP 服务')
    },
    disconnect() {
      /* No-op: the stub never opens a connection. */
    }
  }

  if (config.endpoint !== undefined) {
    stub.configure(config)
  }
  return stub
}
