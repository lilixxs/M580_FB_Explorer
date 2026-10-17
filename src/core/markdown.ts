import MarkdownIt from 'markdown-it'

/**
 * Render repository-document links on GitHub, where Markdown receives formatting instead of
 * opening the plain static copy that the application publishes.
 */
const REPOSITORY_BLOB_ROOT = 'https://github.com/lilixxs/M580_FB_Explorer/blob/main/'

/** Screenshots published with the application, addressed from the README as `docs/images/...`. */
const SCREENSHOT_SOURCE = /^docs\/images\/(zh-CN|en|zh-TW|ja|ko)\/[a-z0-9-]+\.png$/

/** README file of each language. A help link switches the interface language, it does not open a file. */
const README_LANGUAGES: Readonly<Record<string, string>> = {
  'README.md': 'zh-CN',
  'README.en.md': 'en',
  'README.zh-TW.md': 'zh-TW',
  'README.ja.md': 'ja',
  'README.ko.md': 'ko'
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 禁止执行原始 HTML。链接使用 markdown-it 的协议校验。
const renderer = new MarkdownIt({ html: false, linkify: false, typographer: false })

renderer.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0] || 'text'
  return `<pre class="md-code"><code data-lang="${escapeHtml(language)}">${escapeHtml(token.content)}</code></pre>\n`
}

const renderImage = renderer.renderer.rules.image!
renderer.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index]
  const source = String(token.attrGet('src') ?? '')
  // 只加载随应用发布的截图。拒绝远程资源、路径穿越和任意本地文件。
  if (!SCREENSHOT_SOURCE.test(source)) {
    return escapeHtml(token.content)
  }
  token.attrSet('src', `${import.meta.env.BASE_URL}${source}`)
  token.attrSet('loading', 'lazy')
  return renderImage(tokens, index, options, env, self)
}

renderer.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  const token = tokens[index]
  const href = String(token.attrGet('href') ?? '')
  if (href.startsWith('#')) return self.renderToken(tokens, index, options)

  const target = href.split('#')[0].replace(/^\.\//, '')
  const language = README_LANGUAGES[target]
  if (language !== undefined) {
    // README 语言链接在帮助抽屉内切换界面语言，不打开 Markdown 文件。
    token.attrSet('href', '#')
    token.attrSet('class', 'md-help-language')
    token.attrSet('data-help-language', language)
    return self.renderToken(tokens, index, options)
  }

  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    // GitHub 会渲染 Markdown。仓库文档链接指向该视图，而不是 Pages 中的纯文本副本。
    const relative = href.startsWith('/') ? href.slice(1) : href
    token.attrSet('href', `${REPOSITORY_BLOB_ROOT}${relative}`)
  }
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noreferrer noopener')
  return self.renderToken(tokens, index, options)
}

export function renderMarkdown(markdown: string): string {
  return renderer.render(markdown)
}
