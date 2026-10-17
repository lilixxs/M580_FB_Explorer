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
