import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { nextTick } from 'vue'
import { i18n, locale, setLocale, t } from '../src/i18n'
import { getHelpMarkdown } from '../src/data/helpContent'
import { renderMarkdown } from '../src/core/markdown'
import { loadDemoFile, setActiveSource } from '../src/actions'
import { state } from '../src/store'

const languages = ['zh-CN', 'en', 'zh-TW', 'ja', 'ko']
const catalogDirectory = resolve('src/locales')
function leaves(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    Object.entries(leaves(item, prefix ? `${prefix}.${key}` : key))))
}
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(match => match[1]).sort()
}

afterEach(() => { vi.restoreAllMocks(); setLocale('zh-CN'); localStorage.clear() })

describe('external language catalogs', () => {
  for (const file of readdirSync(catalogDirectory).filter(name => name.endsWith('zh-CN.json'))) {
    const original = leaves(JSON.parse(readFileSync(resolve(catalogDirectory, file), 'utf8')))
    for (const language of languages.slice(1)) {
      it(`${file} has complete ${language} keys and named placeholders`, () => {
        const translatedFile = file.replace('zh-CN.json', `${language}.json`)
        const translated = leaves(JSON.parse(readFileSync(resolve(catalogDirectory, translatedFile), 'utf8')))
        expect(Object.keys(translated).sort()).toEqual(Object.keys(original).sort())
        for (const [key, text] of Object.entries(original)) {
          expect(translated[key].trim(), key).not.toBe('')
          expect(placeholders(translated[key]), key).toEqual(placeholders(text))
        }
      })
    }
  }

  it('changes language without replacing a document or losing edited source', async () => {
    setLocale('zh-CN')
    loadDemoFile(0)
    setActiveSource('(* user content: 中文 / 日本語 / 한국어 *)\nxResult := 7;')
    const doc = state.doc
    const source = state.doc!.sections[0].stSource
    const sectionId = state.activeSectionId
    for (const language of languages) {
      setLocale(language)
      await nextTick()
      expect(locale.value).toBe(language)
      expect(document.documentElement.lang).toBe(language)
      expect(localStorage.getItem('m580-locale')).toBe(language)
      expect(state.doc).toBe(doc)
      expect(state.activeSectionId).toBe(sectionId)
      expect(state.doc!.sections[0].stSource).toBe(source)
      expect(state.dirty).toBe(true)
      expect(t('app.newBlock.title')).not.toBe('app.newBlock.title')
    }
  })

  it('still switches when local storage refuses writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied') })
    expect(() => setLocale('ja')).not.toThrow()
    expect(locale.value).toBe('ja')
  })

  it('loads all supported language catalogs into Vue I18n', () => {
    for (const language of languages) expect(i18n.global.availableLocales).toContain(language)
  })

  it('compiles every UI message without missing keys or interpolation errors', () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const language of languages) {
      setLocale(language)
      for (const file of readdirSync(catalogDirectory).filter(name => name.endsWith(`${language}.json`))) {
        const prefix = file === `${language}.json` ? '' : file.slice(0, -`${language}.json`.length)
        const catalog = leaves(JSON.parse(readFileSync(resolve(catalogDirectory, file), 'utf8')))
        for (const [key, text] of Object.entries(catalog)) {
          if (key.startsWith('labels.')) continue
          const messageKey = `${prefix}${key}`
          const params = Object.fromEntries(placeholders(text).map(name => [name, 2]))
          expect(t(messageKey, params), `${language}: ${messageKey}`).not.toBe(messageKey)
        }
      }
    }
    expect(errors.mock.calls).toEqual([])
    expect(warnings.mock.calls).toEqual([])
  })
})

describe('localized help', () => {
  for (const language of languages) {
    it(`preserves technical identifiers and includes five ${language} screenshots`, () => {
      const text = getHelpMarkdown(language)
      for (const term of ['PositionPin', 'variableInit', 'topologicalAddress', '33002519.20', '35006144.27',
        'm580_fb_get_metadata', 'm580_fb_set_source', 'm580_get_help', 'Ctrl+S', 'file://']) expect(text).toContain(term)
      for (const image of ['workspace', 'variable-editor', 'type-picker', 'call-browser', 'new-block']) {
        expect(text).toContain(`images/${language}/${image}.png`)
      }
      const html = renderMarkdown(text)
      expect((html.match(/<img /g) ?? []).length).toBe(5)
      expect(html).not.toContain('src="javascript:')
    })
  }

  it('does not create remote image requests from untrusted markdown', () => {
    expect(renderMarkdown('![x](https://example.invalid/tracker.png)')).not.toContain('<img')
    expect(renderMarkdown('![x](javascript:alert(1))')).not.toContain('<img')
  })
})
