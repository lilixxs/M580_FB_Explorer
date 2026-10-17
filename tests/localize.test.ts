import { afterEach, describe, expect, it } from 'vitest'
import { localize } from '../src/localize'
import { setLocale } from '../src/i18n'

afterEach(() => setLocale('zh-CN'))
describe('library description localization', () => {
  it('does not change user source, names, addresses or unknown descriptions', () => {
    for (const language of ['zh-CN', 'en', 'zh-TW', 'ja', 'ko']) {
      setLocale(language)
      for (const text of ['User_FB', '(* 注释 *)', "x := '中文';", '%MW100', '用户自定义说明']) {
        expect(localize(text)).toBe(text)
      }
    }
  })
  it('changes exact bundled labels with the locale', () => {
    setLocale('zh-CN')
    expect(localize('功能块')).toBe('功能块')
    setLocale('en')
    expect(localize('功能块')).not.toBe('功能块')
    setLocale('ko')
    expect(localize('功能块')).toContain('기능')
  })
})
