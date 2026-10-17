import { describe, expect, it } from 'vitest'
import { HELP_MARKDOWN, README_MARKDOWN } from '../src/data/helpContent'
import { MCP_TOOL_SCHEMAS } from '../src/core/mcp'
import { CATEGORY_ORDER } from '../src/types'

describe('help document sync', () => {
  it('documents every MCP tool exposed by the bridge', () => {
    for (const tool of MCP_TOOL_SCHEMAS) {
      expect(HELP_MARKDOWN).toContain(tool.name)
    }
  })

  it('documents every variable category used by the parser', () => {
    for (const category of CATEGORY_ORDER) {
      expect(HELP_MARKDOWN).toContain(category)
    }
  })

  it('documents the repo constraints used by the exporter', () => {
    expect(HELP_MARKDOWN).toContain('PositionPin')
    expect(HELP_MARKDOWN).toContain('variableInit')
    expect(HELP_MARKDOWN).toContain('topologicalAddress')
    expect(HELP_MARKDOWN).toContain('AGENTS.md')
    expect(HELP_MARKDOWN).toContain('偶数地址')
    expect(HELP_MARKDOWN).toContain('未执行')
  })

  it('keeps the README build commands in place', () => {
    for (const script of ['npm run dev', 'npm run typecheck', 'npm test', 'npm run build']) {
      expect(README_MARKDOWN).toContain(script)
    }
  })
})
