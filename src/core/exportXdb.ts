import { t } from '../i18n'
import type { ExportResult, ParsedDocument, ProgramSection, VariableCategory, VariableDef } from '../types'
import { stripVarBlocks } from './st'
import { dedupe, isWideType, parseAddress, validateForExport } from './validation'
import { createXmlDocument, parseXml, serializeDocument } from './xml'

export class ExportValidationError extends Error {
  readonly errors: string[]

  constructor(errors: string[]) {
    super(t('core.exportXdb.validationFailed', { errors: errors.join('；') }))
    this.name = 'ExportValidationError'
    this.errors = errors
  }
}

const PIN_CATEGORIES: VariableCategory[] = ['IN', 'OUT', 'IN_OUT']

const CATEGORY_CONTAINERS: Partial<Record<VariableCategory, string>> = {
  IN: 'inputParameters',
  OUT: 'outputParameters',
  IN_OUT: 'inOutParameters',
  PUBLIC: 'publicLocalVariables',
  PRIVATE: 'privateLocalVariables'
}

export function timestampParts(date: Date): { dateTime: string; dt: string } {
  const pad = (value: number) => String(value).padStart(2, '0')
  const dateTime = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  return { dateTime, dt: `dt#${dateTime}` }
}

export function sanitizeIdentifier(value: string, fallback = 'Exported_FB'): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00DF\u00E0-\u00F6\u00F8-\u00FF]/g, '_')
  return cleaned.replace(/^_+/, '') || fallback
}

function alignAddress(variable: VariableDef, warnings: string[]): string {
  const address = variable.topologicalAddress.trim()
  if (!address) return ''
  if (!/^%MW/i.test(address)) return address
  if (!isWideType(variable.typeName)) return address
  const info = parseAddress(address)
  if (info.word === null || info.hasBitSuffix || info.hasTableSuffix) return address
  const word = info.word
  if (word % 2 === 0) return address
  const aligned = address.replace(/^(%[A-Z]{1,3}\d+)/, (prefix) => {
    return prefix.slice(0, -String(word).length) + String(word + 1)
  })
  warnings.push(
    t('core.exportXdb.addressAligned', { name: variable.name, address, aligned })
  )
  return aligned
}

function createElement(doc: Document, tag: string, attributes: Record<string, string | undefined> = {}): Element {
  const element = doc.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue
    element.setAttribute(name, value)
  }
  return element
}

export interface ExportOptions {
  now?: Date
  projectName?: string
  fileVersion?: string
}

export function buildXdb(document_: ParsedDocument, options: ExportOptions = {}): ExportResult {
  const report = validateForExport(document_.variables)
  if (report.errors.length > 0) {
    throw new ExportValidationError(report.errors)
  }

  const warnings = [...report.warnings]
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
      content: '功能块源文件',
      DTDVersion: '41'
    })
  )
  root.appendChild(
    createElement(doc, 'contentHeader', {
      name: options.projectName ?? document_.projectName ?? 'M580_FB_Explorer',
      version: options.fileVersion ?? document_.fileVersion ?? '0.0.1',
      dateTime: `date_and_time#${dateTime}`
    })
  )

  const fbName = sanitizeIdentifier(document_.fbName || document_.sections[0]?.name || 'Exported_FB')
  const fbSource = createElement(doc, 'FBSource', {
    nameOfFBType: fbName,
    version: document_.fbVersion || '1.30',
    dateTime: dt
  })
  root.appendChild(fbSource)

  if (document_.comment.trim()) {
    const comment = doc.createElement('comment')
    comment.textContent = document_.comment.trim()
    fbSource.appendChild(comment)
  }
  fbSource.appendChild(createElement(doc, 'attribute', { name: 'TypePassword', value: '' }))
  fbSource.appendChild(createElement(doc, 'attribute', { name: 'TypeProtectionLevel', value: '2#0000_0000' }))
  fbSource.appendChild(createElement(doc, 'attribute', { name: 'IsTypePasswordCrypted', value: 'FALSE' }))

  const effectiveVariables: VariableDef[] = document_.variables.map((variable) => {
    if (variable.category === 'GLOBAL') {
      warnings.push(t('core.exportXdb.globalMerged', { name: variable.name }))
      return {
        ...variable,
        category: 'PRIVATE' as VariableCategory,
        initValue: variable.initValue.trim() || variable.defaultValue.trim()
      }
    }
    return variable
  })

  for (const category of ['IN', 'OUT', 'IN_OUT', 'PUBLIC', 'PRIVATE'] as VariableCategory[]) {
    const containerTag = CATEGORY_CONTAINERS[category]
    if (!containerTag) continue
    const items = effectiveVariables.filter((variable) => variable.category === category)
    if (items.length === 0) continue
    const container = doc.createElement(containerTag)
    fbSource.appendChild(container)
    items.forEach((variable, position) => {
      container.appendChild(buildVariableElement(doc, variable, PIN_CATEGORIES.includes(category) ? position + 1 : null, warnings))
    })
  }

  for (const section of document_.sections) {
    fbSource.appendChild(buildProgramElement(doc, section, warnings))
  }

  if (document_.sections.length === 0) {
    warnings.push(t('core.exportXdb.emptyBody'))
    const program = createElement(doc, 'FBProgram', { name: fbName })
    const stSource = doc.createElement('STSource')
    stSource.textContent = '\n'
    program.appendChild(stSource)
    fbSource.appendChild(program)
  }

  const xml = serializeDocument(doc, { declaration: true })
  return { xml, fileName: `${fbName}.xdb`, warnings: dedupe(warnings) }
}

function buildVariableElement(
  doc: Document,
  variable: VariableDef,
  positionPin: number | null,
  warnings: string[]
): Element {
  const topologicalAddress = alignAddress(variable, warnings)
  const element = createElement(doc, 'variables', {
    name: variable.name.trim(),
    typeName: variable.typeName.trim(),
    topologicalAddress: topologicalAddress || undefined
  })

  const comment = variable.comment.trim()
  if (comment) {
    const commentElement = doc.createElement('comment')
    commentElement.textContent = comment.slice(0, 1024)
    element.appendChild(commentElement)
  }

  if (positionPin !== null) {
    element.appendChild(createElement(doc, 'attribute', { name: 'PositionPin', value: String(positionPin) }))
  }

  const initValue = variable.initValue.trim() || (variable.category === 'GLOBAL' ? variable.defaultValue.trim() : '')
  const effectiveInit = initValue
  if (effectiveInit) {
    element.appendChild(createElement(doc, 'variableInit', { value: effectiveInit }))
  }

  return element
}

function buildProgramElement(doc: Document, section: ProgramSection, warnings: string[]): Element {
  const program = createElement(doc, 'FBProgram', {
    name: sanitizeIdentifier(section.name, 'FBProgram')
  })

  if (section.language === 'ST') {
    const stripped = stripVarBlocks(section.stSource)
    if (stripped.removed > 0) {
      warnings.push(t('core.exportXdb.varStripped', { name: section.name, count: stripped.removed }))
    }
    const stSource = doc.createElement('STSource')
    stSource.textContent = `\n${stripped.source.replace(/\r\n?/g, '\n')}\n`
    program.appendChild(stSource)
    return program
  }

  if (!section.xmlSource.trim()) {
    warnings.push(t('core.exportXdb.nonStSkipped', { name: section.name }))
    return program
  }

  try {
    const wrapper = parseXml(`<wrapper>${section.xmlSource}</wrapper>`)
    for (const child of Array.from(wrapper.documentElement.children)) {
      if (child.tagName === 'identProgram') continue
      program.appendChild(doc.importNode(child, true))
    }
  } catch (error) {
    warnings.push(
      t('core.exportXdb.nonStParseFailed', { name: section.name, message: (error as Error).message })
    )
  }

  return program
}
