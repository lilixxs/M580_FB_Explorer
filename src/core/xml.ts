/**
 * Small XML helpers built on the platform DOMParser / XMLSerializer.
 * No external dependency and no network access.
 */

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

export function parseXml(text: string): Document {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'application/xml')
  const errorNode = doc.getElementsByTagName('parsererror')[0]
  if (errorNode) {
    const detail = (errorNode.textContent || '').replace(/\s+/g, ' ').trim()
    throw new Error(`XML 解析失败：${detail || '未知错误'}`)
  }
  if (!doc.documentElement) {
    throw new Error('XML 解析失败：缺少根节点')
  }
  return doc
}

export function createXmlDocument(): Document {
  return document.implementation.createDocument(null, null, null)
}

/** Expand every `<tag ... />` into `<tag ...></tag>`; Unity Pro XL rejects self closing tags. */
export function expandSelfClosingTags(xml: string): string {
  return xml.replace(
    /<([A-Za-z_][A-Za-z0-9_:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\s*\/>/g,
    '<$1$2></$1>'
  )
}

export function serializeDocument(doc: Document, options: { declaration?: boolean } = {}): string {
  const wantDeclaration = options.declaration !== false
  const serializer = new XMLSerializer()
  let xml = serializer.serializeToString(doc)
  xml = xml.replace(/^<\?xml[^?]*\?>\s*/, '')
  xml = expandSelfClosingTags(xml)
  return wantDeclaration ? `${XML_DECLARATION}\n${xml}` : xml
}

export function innerXml(element: Element): string {
  const serializer = new XMLSerializer()
  let xml = ''
  for (const child of Array.from(element.childNodes)) {
    xml += serializer.serializeToString(child)
  }
  return xml
}

export function attributeOf(element: Element | null, name: string): string {
  if (!element) return ''
  return element.getAttribute(name) ?? ''
}

export function childText(element: Element | null, tagName: string): string {
  if (!element) return ''
  const child = Array.from(element.children).find((item) => item.tagName === tagName)
  if (!child) return ''
  return child.textContent ?? ''
}

export function directChildren(element: Element | null, tagName: string): Element[] {
  if (!element) return []
  return Array.from(element.children).filter((item) => item.tagName === tagName)
}

export function firstDirectChild(element: Element | null, tagName: string): Element | null {
  return directChildren(element, tagName)[0] ?? null
}

/** Strip leading and trailing blank lines that Control Expert adds around STSource text. */
export function normalizeSourceText(text: string): string {
  return text.replace(/^\r?\n+/, '').replace(/\r?\n+$/, '')
}
