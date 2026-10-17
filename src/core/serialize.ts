import { t } from '../i18n'
import { directChildren, parseXml, serializeDocument } from './xml'

function programNodes(root: Element): Element[] {
  const fbSources = directChildren(root, 'FBSource')
  if (fbSources.length > 0) {
    const nodes: Element[] = []
    for (const fbSource of fbSources) {
      nodes.push(...directChildren(fbSource, 'FBProgram'))
    }
    return nodes
  }
  return directChildren(root, 'program')
}

/**
 * Write a new ST body back into the raw exchange XML, keeping every other node untouched.
 * This is what makes "editor save triggers re-parse" a real re-parse of the exchange file.
 */
export function setSectionSource(rawXml: string, index: number, source: string): string {
  const doc = parseXml(rawXml)
  const nodes = programNodes(doc.documentElement)
  const node = nodes[index]
  if (!node) {
    throw new Error(t('core.serialize.sectionNotFound', { index }))
  }
  let stSource = Array.from(node.children).find((child) => child.tagName === 'STSource')
  if (!stSource) {
    stSource = doc.createElement('STSource')
    node.appendChild(stSource)
  }
  stSource.textContent = `\n${source.replace(/\r\n?/g, '\n')}\n`
  return serializeDocument(doc, { declaration: true })
}

export function countProgramNodes(rawXml: string): number {
  const doc = parseXml(rawXml)
  return programNodes(doc.documentElement).length
}
