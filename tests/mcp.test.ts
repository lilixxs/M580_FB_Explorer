import { describe, expect, it, vi } from 'vitest'
import {
  MCP_BRIDGE_VERSION,
  MCP_TOOL_SCHEMAS,
  createMcpBridge,
  createMcpTransportStub,
  installMcpBridge,
  validateToolInput
} from '../src/core/mcp'

const PLANNED_ALIASES = [
  'm580_fb_get_metadata',
  'm580_fb_list_variables',
  'm580_fb_upsert_variable',
  'm580_fb_delete_variable',
  'm580_fb_get_source',
  'm580_fb_set_source',
  'm580_fb_insert_snippet',
  'm580_fb_analyze_calls'
]

const LEGACY_TOOLS = [
  'm580_get_state',
  'm580_import',
  'm580_list_variables',
  'm580_upsert_variable',
  'm580_delete_variable',
  'm580_get_section',
  'm580_set_section_source',
  'm580_save_section',
  'm580_format_section',
  'm580_replace_in_section',
  'm580_extract_calls',
  'm580_export_xdb',
  'm580_get_help',
  'm580_jump'
]

describe('MCP tool schemas', () => {
  it('declares unique, well formed object schemas', () => {
    const names = MCP_TOOL_SCHEMAS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.every((name) => name.startsWith('m580_'))).toBe(true)
    for (const tool of MCP_TOOL_SCHEMAS) {
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.inputSchema.type).toBe('object')
      for (const required of tool.inputSchema.required ?? []) {
        expect(Object.keys(tool.inputSchema.properties)).toContain(required)
      }
    }
  })

  it('keeps every legacy tool and adds the planned m580_fb_* aliases', () => {
    const names = MCP_TOOL_SCHEMAS.map((tool) => tool.name)
    expect(names).toEqual(expect.arrayContaining(LEGACY_TOOLS))
    expect(names).toEqual(expect.arrayContaining(PLANNED_ALIASES))
    for (const alias of PLANNED_ALIASES) {
      expect(alias.startsWith('m580_fb_')).toBe(true)
      expect(names).toContain(alias)
    }
  })

  it('declares a variable category enum on every variable tool', () => {
    const variableTools = ['m580_list_variables', 'm580_upsert_variable', 'm580_fb_list_variables', 'm580_fb_upsert_variable']
    for (const name of variableTools) {
      const tool = MCP_TOOL_SCHEMAS.find((item) => item.name === name)!
      expect(tool.inputSchema.properties.category.enum).toEqual([
        'IN',
        'OUT',
        'IN_OUT',
        'PUBLIC',
        'PRIVATE',
        'GLOBAL'
      ])
    }
  })

  it('declares the insert snippet template enum', () => {
    const tool = MCP_TOOL_SCHEMAS.find((item) => item.name === 'm580_fb_insert_snippet')!
    expect(tool.inputSchema.properties.kind.enum).toEqual(['IF', 'FOR', 'WHILE'])
    expect(tool.inputSchema.properties.line.type).toBe('integer')
    expect(tool.inputSchema.properties.column.type).toBe('integer')
  })
})

describe('validateToolInput', () => {
  const tool = MCP_TOOL_SCHEMAS.find((item) => item.name === 'm580_fb_upsert_variable')!

  it('accepts a complete valid input', () => {
    expect(validateToolInput(tool, { name: 'xRun', typeName: 'BOOL', category: 'IN' })).toBe(null)
  })

  it('rejects missing required, wrong types, bad enums and extra parameters', () => {
    expect(validateToolInput(tool, { name: 'xRun', typeName: 'BOOL' })).toBe(
      '缺少必需参数：category'
    )
    expect(validateToolInput(tool, { name: 'xRun', typeName: 1, category: 'IN' })).toBe(
      '参数 typeName 必须是字符串'
    )
    expect(validateToolInput(tool, { name: 'xRun', typeName: 'BOOL', category: 'INPUT' })).toBe(
      '参数 category 的取值必须是 IN|OUT|IN_OUT|PUBLIC|PRIVATE|GLOBAL'
    )
    expect(validateToolInput(tool, { name: 'xRun', typeName: 'BOOL', category: 'IN', extra: 1 })).toBe(
      '不支持的参数：extra'
    )
    expect(validateToolInput(tool, [])).toBe('参数必须是 JSON 对象')
    expect(validateToolInput(tool, null)).toBe('参数必须是 JSON 对象')
  })
})

describe('createMcpBridge', () => {
  it('routes calls to handlers and reports unknown tools', async () => {
    const bridge = createMcpBridge(
      {
        m580_get_state: () => ({ loaded: true }),
        m580_export_xdb: () => {
          throw new Error('导出校验未通过：变量名为空')
        }
      },
      () => ({ loaded: false })
    )

    expect(bridge.version).toBe(MCP_BRIDGE_VERSION)
    await expect(bridge.callTool('m580_get_state')).resolves.toEqual({
      ok: true,
      result: { loaded: true }
    })
    await expect(bridge.callTool('m580_missing')).resolves.toEqual({
      ok: false,
      error: '未知工具：m580_missing'
    })
    const failure = await bridge.callTool('m580_export_xdb')
    expect(failure.ok).toBe(false)
    expect(failure.error).toContain('导出校验未通过')
    expect(bridge.getState()).toEqual({ loaded: false })
  })

  it('returns schema stubs for tools without a handler', async () => {
    const bridge = createMcpBridge({}, () => null)
    const result = await bridge.callTool('m580_get_help')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Schema 桩')
    expect(bridge.listTools()).toHaveLength(MCP_TOOL_SCHEMAS.length)
  })

  it('rejects invalid input before the handler runs', async () => {
    const handler = vi.fn(() => 'called')
    const bridge = createMcpBridge(
      {
        m580_fb_get_metadata: handler,
        m580_fb_set_source: handler,
        m580_fb_insert_snippet: handler
      },
      () => null
    )

    const missing = await bridge.callTool('m580_fb_set_source', { sectionId: 'sec-1' })
    expect(missing).toEqual({ ok: false, error: '缺少必需参数：source' })

    const wrongType = await bridge.callTool('m580_fb_insert_snippet', {
      line: '2' as unknown as number
    })
    expect(wrongType).toEqual({ ok: false, error: '参数 line 必须是整数' })

    const belowMinimum = await bridge.callTool('m580_fb_insert_snippet', { line: 0 })
    expect(belowMinimum).toEqual({ ok: false, error: '参数 line 不能小于 1' })

    const extra = await bridge.callTool('m580_fb_get_metadata', { extra: true })
    expect(extra).toEqual({ ok: false, error: '不支持的参数：extra' })

    const nullInput = await bridge.callTool(
      'm580_fb_get_metadata',
      null as unknown as Record<string, unknown>
    )
    expect(nullInput).toEqual({ ok: false, error: '参数必须是 JSON 对象' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('passes valid input through untouched', async () => {
    const handler = vi.fn((input: Record<string, unknown>) => input.source)
    const bridge = createMcpBridge({ m580_fb_set_source: handler }, () => null)
    await expect(
      bridge.callTool('m580_fb_set_source', { sectionId: 'sec-1', source: 'a := 1;' })
    ).resolves.toEqual({ ok: true, result: 'a := 1;' })
    expect(handler).toHaveBeenCalledWith({ sectionId: 'sec-1', source: 'a := 1;' })
  })

  it('exposes itself on window and keeps the schema list immutable from callers', async () => {
    const bridge = installMcpBridge({ m580_get_help: () => 'help' }, () => 'state')
    expect(window.__M580_MCP_BRIDGE__).toBe(bridge)
    const tools = bridge.listTools()
    tools[0].name = 'tampered'
    const listVariables = tools.find((tool) => tool.name === 'm580_fb_list_variables')!
    listVariables.inputSchema.properties.category.enum!.push('BROKEN')
    listVariables.inputSchema.properties.category.type = 'number'
    await expect(bridge.callTool('m580_get_help')).resolves.toEqual({ ok: true, result: 'help' })
    expect(bridge.listTools()[0].name).toBe(MCP_TOOL_SCHEMAS[0].name)
    const internalCategory = bridge
      .listTools()
      .find((tool) => tool.name === 'm580_fb_list_variables')!.inputSchema.properties.category
    expect(internalCategory.type).toBe('string')
    expect(internalCategory.enum).not.toContain('BROKEN')
    expect(bridge.getState()).toBe('state')
  })
})

describe('MCP transport stub', () => {
  it('is configurable, never connected and performs no network I/O', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const stub = createMcpTransportStub()
      expect(stub.kind).toBe('stub')
      expect(stub.connected).toBe(false)
      expect(stub.configured).toBe(false)
      expect(stub.endpoint).toBe('')

      stub.configure({ endpoint: ' ws://127.0.0.1:9/mcp ' })
      expect(stub.endpoint).toBe('ws://127.0.0.1:9/mcp')
      expect(stub.configured).toBe(true)
      expect(stub.connected).toBe(false)

      await expect(stub.connect()).rejects.toThrow(/不建立网络连接/)
      expect(stub.connected).toBe(false)
      stub.disconnect()
      expect(stub.connected).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects invalid transport configuration', () => {
    const stub = createMcpTransportStub()
    expect(() => stub.configure({ endpoint: 1 as unknown as string })).toThrow('endpoint 必须是字符串')
    expect(stub.configured).toBe(false)
  })

  it('is not installed on window by the bridge installer', () => {
    installMcpBridge({}, () => null)
    expect(window.__M580_MCP_BRIDGE__).toBeDefined()
    expect('__M580_MCP_TRANSPORT_STUB__' in window).toBe(false)
  })
})
