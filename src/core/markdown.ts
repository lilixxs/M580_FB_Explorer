import MarkdownIt from 'markdown-it'

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
  if (!/^images\/(?:zh-CN|en|zh-TW|ja|ko)\/[a-z-]+\.png$/.test(source)) {
    return escapeHtml(token.content)
  }
  token.attrSet('src', `${import.meta.env.BASE_URL}${source}`)
  token.attrSet('loading', 'lazy')
  return renderImage(tokens, index, options, env, self)
}

renderer.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noreferrer noopener')
  return self.renderToken(tokens, index, options)
}

export function renderMarkdown(markdown: string): string {
  return renderer.render(markdown)
}
