/**
 * Build a brand new, empty function block document (.xdb) without a file on disk.
 *
 * The XML is assembled with the same DOM factory the exporter uses (`core/xml.ts`) so the result
 * obeys the repository exchange rules: UTF-8, `company="Schneider Automation"`,
 * `product="Unity Pro XL V13.1 - 180823C"`, `DTDVersion="41"`, an explicit XML declaration and no
 * self closing tags. The single ST program section is empty and holds no `VAR` declaration block.
 *
 * The generated XML is fed straight back through `parseExchange`, so the new document flows through
 * the ordinary variable / ST editor / save / export / re-parse path.
 */

import { NAME_RE, type ParsedDocument } from '../types'
import { t } from '../i18n'
import { timestampParts } from './exportXdb'
import { parseExchange } from './parseExchange'
import { createXmlDocument, serializeDocument } from './xml'

/** Project and version values used by `buildXdb` when the document carries none. */
export const DEFAULT_PROJECT_NAME = 'M580_FB_Explorer'
export const DEFAULT_FILE_VERSION = '0.0.1'
export const DEFAULT_FB_VERSION = '1.30'

/** `content` attribute of a .xdb file header; see `docs/requirements.md` section 4. */
const XDB_FILE_CONTENT = '功能块源文件'

export interface NewBlockOptions {
  /** Function block type name; must satisfy `validateBlockName`. */
  fbName: string
  /** Optional function block comment; an empty comment omits the `<comment>` node. */
  comment?: string
  projectName?: string
  fileVersion?: string
  now?: Date
}

function createElement(
  doc: Document,
  tag: string,
  attributes: Record<string, string | undefined> = {}
): Element {
  const element = doc.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue
    element.setAttribute(name, value)
  }
  return element
}

/**
 * Validate a function block type name.
 *
 * Returns `null` when the name is usable, otherwise a Chinese message for the caller to display.
 * `EN` and `ENO` are rejected because Control Expert reserves them as system pins.
 */
export function validateBlockName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return t('app.newBlock.nameRequired')
  if (!NAME_RE.test(trimmed)) {
    return t('app.newBlock.nameInvalid')
  }
  if (['EN', 'ENO'].includes(trimmed.toUpperCase())) {
    return t('app.newBlock.nameReserved')
  }
  return null
}

/** Serialize an empty .xdb: no variables and one empty ST program section. */
export function buildEmptyXdbXml(options: NewBlockOptions): string {
  const name = options.fbName.trim()
  const now = options.now ?? new Date()
  const { dateTime, dt } = timestampParts(now)
  const doc = createXmlDocument()

  const root = doc.createElement('FBExchangeFile')
  doc.appendChild(root)

  root.appendChild(
    createElement(doc, 'fileHeader', {
      company: 'Schneider Automation',
      product: 'Unity Pro XL V13.1 - 180823C',
      dateTime: `date_and_time#${dateTime}`,
      content: XDB_FILE_CONTENT,
      DTDVersion: '41'
    })
  )
  root.appendChild(
    createElement(doc, 'contentHeader', {
      name: options.projectName ?? DEFAULT_PROJECT_NAME,
      version: options.fileVersion ?? DEFAULT_FILE_VERSION,
      dateTime: `date_and_time#${dateTime}`
    })
  )

  const fbSource = createElement(doc, 'FBSource', {
    nameOfFBType: name,
    version: DEFAULT_FB_VERSION,
    dateTime: dt
  })
  root.appendChild(fbSource)

  const comment = (options.comment ?? '').trim()
  if (comment) {
    const commentElement = doc.createElement('comment')
    commentElement.textContent = comment
    fbSource.appendChild(commentElement)
  }
  fbSource.appendChild(createElement(doc, 'attribute', { name: 'TypePassword', value: '' }))
  fbSource.appendChild(createElement(doc, 'attribute', { name: 'TypeProtectionLevel', value: '2#0000_0000' }))
  fbSource.appendChild(createElement(doc, 'attribute', { name: 'IsTypePasswordCrypted', value: 'FALSE' }))

  // One empty ST program section; the parser normalizes the placeholder newline away.
  const program = createElement(doc, 'FBProgram', { name })
  const stSource = doc.createElement('STSource')
  stSource.textContent = '\n'
  program.appendChild(stSource)
  fbSource.appendChild(program)

  return serializeDocument(doc, { declaration: true })
}

/**
 * Build and parse an empty function block document.
 *
 * Throws when the name is invalid or the generated XML cannot be parsed; callers surface the
 * message instead of installing a broken document.
 */
export function createEmptyDocument(options: NewBlockOptions): ParsedDocument {
  const error = validateBlockName(options.fbName)
  if (error) throw new Error(error)
  const name = options.fbName.trim()
  return parseExchange(buildEmptyXdbXml(options), `${name}.xdb`)
}
