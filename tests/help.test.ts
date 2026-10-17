import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { HELP_MARKDOWN, HELP_README_FILES, README_MARKDOWN, getHelpMarkdown } from '../src/data/helpContent'
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

  it('serves the root README as the only help source of each language', () => {
    for (const [language, fileName] of Object.entries(HELP_README_FILES)) {
      expect(getHelpMarkdown(language), language).toBe(readFileSync(fileName, 'utf8'))
    }
    expect(HELP_MARKDOWN).toBe(readFileSync(HELP_README_FILES['zh-CN'], 'utf8'))
    expect(README_MARKDOWN).toBe(readFileSync(HELP_README_FILES.en, 'utf8'))
  })

  it('falls back to Simplified Chinese for an unsupported language', () => {
    expect(getHelpMarkdown('fr')).toBe(readFileSync(HELP_README_FILES['zh-CN'], 'utf8'))
  })

  it('keeps no Markdown help copy beside the README files', () => {
    // 旧帮助目录可以保留为空目录，但不得再存放帮助正文。
    const legacy = 'requirements/localization/help'
    const copies = existsSync(legacy) ? readdirSync(legacy).filter((name) => name.endsWith('.md')) : []
    expect(copies).toEqual([])
  })
})

/**
 * Button labels the README help text must quote verbatim.
 *
 * `app` reads `src/locales/app.<language>.json` (top bar, tree, new block). `base` reads
 * `src/locales/<language>.json` (component area, calls panel, variable dialog). The guard fails
 * when a locale label and the README of that language drift apart, for example after a rename in
 * the interface or an outdated screenshot description.
 */
const README_BUTTON_LABELS: ReadonlyArray<{ catalog: 'app' | 'base'; key: string }> = [
  { catalog: 'app', key: 'import' },
  { catalog: 'app', key: 'export' },
  { catalog: 'app', key: 'exportTitle' },
  { catalog: 'app', key: 'newBlock.title' },
  { catalog: 'app', key: 'tree.confirm' },
  { catalog: 'app', key: 'tree.cancel' },
  { catalog: 'app', key: 'tree.pending' },
  { catalog: 'base', key: 'callsPanel.refresh' },
  { catalog: 'base', key: 'variableDialog.pickType' }
]

type LocaleCatalog = Record<string, unknown>

function readLocaleCatalog(file: string): LocaleCatalog {
  return JSON.parse(readFileSync(file, 'utf8')) as LocaleCatalog
}

function readNestedLabel(catalog: LocaleCatalog, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as LocaleCatalog)[part], catalog)
}

describe('localized README button labels', () => {
  for (const [language, fileName] of Object.entries(HELP_README_FILES)) {
    it(`quotes the ${language} labels of ${fileName}`, () => {
      const readme = readFileSync(fileName, 'utf8')
      const appCatalog = readLocaleCatalog(`src/locales/app.${language}.json`)
      const baseCatalog = readLocaleCatalog(`src/locales/${language}.json`)
      for (const { catalog, key } of README_BUTTON_LABELS) {
        const label = readNestedLabel(catalog === 'app' ? appCatalog : baseCatalog, key)
        expect(typeof label, `${language} ${catalog}:${key} must be a string`).toBe('string')
        expect(readme, `${language} README is missing the ${catalog}:${key} label`).toContain(label as string)
      }
    })
  }
})
