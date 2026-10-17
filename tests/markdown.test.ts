import { describe, expect, it } from 'vitest'
import { escapeHtml, renderMarkdown } from '../src/core/markdown'

describe('renderMarkdown', () => {
  it('escapes raw HTML before rendering', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(escapeHtml('a & <b> "c"')).toBe('a &amp; &lt;b&gt; &quot;c&quot;')
  })

  it('renders headings, lists, code fences and inline code', () => {
    const markdown = ['# 标题', '', '- 一', '- 二', '', '```js', 'const a = 1 < 2', '```', '', '使用 `Ctrl+S` 保存。'].join(
      '\n'
    )
    const html = renderMarkdown(markdown)
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<li>一</li>')
    expect(html).toContain('<code>Ctrl+S</code>')
    expect(html).toContain('const a = 1 &lt; 2')
    expect(html).toContain('<pre class="md-code">')
  })

  it('renders tables as text and keeps ordered lists', () => {
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |\n\n1. 第一\n2. 第二')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>第一</li>')
  })
})

describe('README help rendering', () => {
  const languages = ['zh-CN', 'en', 'zh-TW', 'ja', 'ko']

  for (const language of languages) {
    it(`loads the published ${language} screenshots relative to the application`, () => {
      const html = renderMarkdown(`![工作区](docs/images/${language}/workspace.png)`)
      expect(html).toContain(`src="`)
      expect(html).toContain(`docs/images/${language}/workspace.png`)
      expect(html).toContain('loading="lazy"')
      expect(html).toContain('alt="工作区"')
    })
  }

  it('rejects remote, traversal and unpublished screenshot addresses', () => {
    for (const source of [
      'https://example.invalid/tracker.png',
      'http://example.invalid/shot.png',
      'javascript:alert(1)',
      '/docs/images/en/workspace.png',
      '../docs/images/en/workspace.png',
      'docs/images/en/../../README.md',
      'docs/images/fr/workspace.png',
      'docs/images/en/workspace.gif',
      'docs/images/en/workspace.png?raw=1'
    ]) {
      expect(renderMarkdown(`![shot](${source})`), source).not.toContain('<img')
    }
  })

  it('turns a README language link into an in-page language switch', () => {
    for (const [file, language] of Object.entries({
      'README.md': 'zh-CN',
      'README.en.md': 'en',
      'README.zh-TW.md': 'zh-TW',
      'README.ja.md': 'ja',
      'README.ko.md': 'ko'
    })) {
      const html = renderMarkdown(`[语言](${file})`)
      expect(html, file).toContain(`data-help-language="${language}"`)
      expect(html, file).toContain('href="#"')
      expect(html, file).not.toContain(`href="${file}"`)
      expect(html, file).not.toContain('target="_blank"')
    }
    expect(renderMarkdown('[English](./README.en.md)')).toContain('data-help-language="en"')
    expect(renderMarkdown('[English](README.en.md#usage)')).toContain('data-help-language="en"')
  })

  it('points repository documents at the readable source instead of a Pages 404', () => {
    for (const [source, expected] of [
      ['CONTRIBUTING.md', 'https://github.com/lilixxs/M580_FB_Explorer/blob/main/CONTRIBUTING.md'],
      ['docs/requirements.md', 'https://github.com/lilixxs/M580_FB_Explorer/blob/main/docs/requirements.md'],
      ['/LICENSE', 'https://github.com/lilixxs/M580_FB_Explorer/blob/main/LICENSE']
    ]) {
      expect(renderMarkdown(`[文档](${source})`), source).toContain(`href="${expected}" target="_blank" rel="noreferrer noopener"`)
    }
  })

  it('keeps external links and in-page anchors explicit', () => {
    const external = renderMarkdown('[手册](https://example.invalid/manual)')
    expect(external).toContain('href="https://example.invalid/manual"')
    expect(external).toContain('target="_blank"')
    expect(external).toContain('rel="noreferrer noopener"')
    const anchor = renderMarkdown('[布局](#layout)')
    expect(anchor).toContain('href="#layout"')
    expect(anchor).not.toContain('target="_blank"')
  })
})
