/** Minimal markdown renderer for the bundled help document. Escapes HTML first. */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(text: string): string {
  const codeSpans: string[] = []
  let result = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(code)
    return `\u0000CODE${codeSpans.length - 1}\u0000`
  })

  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  result = result.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
    return `<a href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`
  })

  result = result.replace(/\u0000CODE(\d+)\u0000/g, (_match, index: string) => {
    return `<code>${codeSpans[Number.parseInt(index, 10)] ?? ''}</code>`
  })
  return result
}

export function renderMarkdown(markdown: string): string {
  const lines = escapeHtml(markdown.replace(/\r\n?/g, '\n')).split('\n')
  const html: string[] = []
  let inCode = false
  let listType: 'ul' | 'ol' | null = null
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${inline(paragraph.join(' '))}</p>`)
      paragraph = []
    }
  }
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`)
      listType = null
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '')

    if (inCode) {
      if (/^\s*```/.test(line)) {
        html.push('</code></pre>')
        inCode = false
      } else {
        html.push(line)
      }
      continue
    }

    const fence = /^\s*```(\w*)\s*$/.exec(line)
    if (fence) {
      flushParagraph()
      closeList()
      html.push(`<pre class="md-code"><code data-lang="${fence[1] || 'text'}">`)
      inCode = true
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length
      html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`)
      continue
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph()
      closeList()
      html.push('<hr />')
      continue
    }

    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (unordered) {
      flushParagraph()
      if (listType !== 'ul') {
        closeList()
        html.push('<ul>')
        listType = 'ul'
      }
      html.push(`<li>${inline(unordered[1].trim())}</li>`)
      continue
    }

    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      flushParagraph()
      if (listType !== 'ol') {
        closeList()
        html.push('<ol>')
        listType = 'ol'
      }
      html.push(`<li>${inline(ordered[1].trim())}</li>`)
      continue
    }

    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (quote) {
      flushParagraph()
      closeList()
      html.push(`<blockquote>${inline(quote[1].trim())}</blockquote>`)
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      closeList()
      continue
    }

    paragraph.push(line.trim())
  }

  if (inCode) html.push('</code></pre>')
  flushParagraph()
  closeList()
  return html.join('\n')
}
