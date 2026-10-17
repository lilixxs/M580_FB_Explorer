import { t } from '../i18n'
import {
  CATEGORY_ORDER,
  type ExchangeKind,
  type ParsedDocument,
  type ProgramSection,
  type VariableCategory,
  type VariableDef
} from '../types'
import { maskCommentsAndStrings } from './st'
import { validateVariable } from './validation'
import {
  attributeOf,
  childText,
  directChildren,
  firstDirectChild,
  innerXml,
  normalizeSourceText,
  parseXml
} from './xml'

const ROOT_KIND: Record<string, ExchangeKind> = {
  FBExchangeFile: 'xdb',
  STExchangeFile: 'xst',
  VariablesExchangeFile: 'xsy'
}

const XDB_CATEGORY_CONTAINERS: Array<[string, VariableCategory]> = [
  ['inputParameters', 'IN'],
  ['outputParameters', 'OUT'],
  ['inOutParameters', 'IN_OUT'],
  ['publicLocalVariables', 'PUBLIC'],
  ['privateLocalVariables', 'PRIVATE']
]

interface VariableCollector {
  variables: VariableDef[]
  warnings: string[]
  counter: number
}

function readVariableElement(element: Element, category: VariableCategory, collector: VariableCollector): void {
  const name = attributeOf(element, 'name')
  const typeName = attributeOf(element, 'typeName')
  const topologicalAddress = attributeOf(element, 'topologicalAddress')
  const defaultValue = attributeOf(element, 'defaultValue')
  const comment = childText(element, 'comment')
  const initElement = firstDirectChild(element, 'variableInit')
  const pinElement = Array.from(element.children).find(
    (item) => item.tagName === 'attribute' && item.getAttribute('name') === 'PositionPin'
  )
  const pinValue = pinElement ? Number.parseInt(pinElement.getAttribute('value') ?? '', 10) : Number.NaN

  collector.counter += 1
  const variable: VariableDef = {
    id: `var-${collector.counter}`,
    name,
    typeName,
    category,
    topologicalAddress,
    defaultValue,
    comment,
    initValue: initElement ? initElement.getAttribute('value') ?? '' : '',
    positionPin: Number.isFinite(pinValue) ? pinValue : null
  }

  const report = validateVariable(variable, [], variable.id)
  const displayName = variable.name || t('core.parse.anonymous')
  for (const message of report.errors) {
    collector.warnings.push(t('core.parse.variableWarning', { category, name: displayName, message }))
  }
  for (const message of report.warnings) {
    collector.warnings.push(t('core.parse.variableWarning', { category, name: displayName, message }))
  }

  collector.variables.push(variable)
}

function readVariableContainer(
  container: Element | null,
  category: VariableCategory,
  collector: VariableCollector
): void {
  if (!container) return
  for (const element of directChildren(container, 'variables')) {
    readVariableElement(element, category, collector)
  }
}

function readDataBlock(root: Element, collector: VariableCollector): void {
  for (const dataBlock of Array.from(root.children).filter((item) => item.tagName === 'dataBlock')) {
    readVariableContainer(dataBlock, 'GLOBAL', collector)
  }
}

function collectVariables(root: Element, kind: ExchangeKind): VariableCollector {
  const collector: VariableCollector = { variables: [], warnings: [], counter: 0 }

  if (kind === 'xdb') {
    for (const fbSource of directChildren(root, 'FBSource')) {
      for (const [tag, category] of XDB_CATEGORY_CONTAINERS) {
        readVariableContainer(firstDirectChild(fbSource, tag), category, collector)
      }
    }
    readDataBlock(root, collector)
    return collector
  }

  if (kind === 'xst') {
    for (const fbSource of directChildren(root, 'FBSource')) {
      for (const [tag, category] of XDB_CATEGORY_CONTAINERS) {
        readVariableContainer(firstDirectChild(fbSource, tag), category, collector)
      }
    }
    readDataBlock(root, collector)
    return collector
  }

  readDataBlock(root, collector)
  return collector
}

function pushSection(
  sections: ProgramSection[],
  index: number,
  name: string,
  programType: string,
  task: string,
  isFBProgram: boolean,
  stSource: string | null,
  xmlSource: string
): void {
  sections.push({
    id: `sec-${index + 1}`,
    index,
    name: name || `section_${index + 1}`,
    programType,
    task,
    language: stSource === null ? 'XML' : 'ST',
    stSource: stSource === null ? '' : normalizeSourceText(stSource),
    xmlSource,
    isFBProgram
  })
}

function collectSections(root: Element, kind: ExchangeKind, warnings: string[]): ProgramSection[] {
  const sections: ProgramSection[] = []
  const fbSources = directChildren(root, 'FBSource')

  if (fbSources.length > 0) {
    let index = 0
    for (const fbSource of fbSources) {
      for (const fbProgram of directChildren(fbSource, 'FBProgram')) {
        const stElement = firstDirectChild(fbProgram, 'STSource')
        pushSection(
          sections,
          index,
          attributeOf(fbProgram, 'name'),
          'FBProgram',
          '',
          true,
          stElement ? stElement.textContent ?? '' : null,
          innerXml(fbProgram)
        )
        index += 1
      }
    }
    return sections
  }

  if (kind === 'xst') {
    directChildren(root, 'program').forEach((program, index) => {
      const identity = firstDirectChild(program, 'identProgram')
      const stElement = firstDirectChild(program, 'STSource')
      pushSection(
        sections,
        index,
        attributeOf(identity, 'name'),
        attributeOf(identity, 'type') || 'section',
        attributeOf(identity, 'task'),
        false,
        stElement ? stElement.textContent ?? '' : null,
        innerXml(program)
      )
    })
  }

  if (sections.length === 0) {
    warnings.push(t('core.parse.noSections'))
  }

  return sections
}

export function parseExchange(rawXml: string, fileName = 'document.xdb'): ParsedDocument {
  const doc = parseXml(rawXml)
  const root = doc.documentElement
  const rootTag = root.tagName
  const kind = ROOT_KIND[rootTag]

  if (!kind) {
    throw new Error(t('core.parse.unsupportedRoot', { root: rootTag }))
  }

  const collector = collectVariables(root, kind)
  const warnings = [...collector.warnings]
  const sections = collectSections(root, kind, warnings)

  for (const section of sections) {
    if (section.language === 'ST') {
      const masked = maskCommentsAndStrings(section.stSource)
      if (/\bVAR(?:_[A-Z_]+)?\b/i.test(masked)) {
        warnings.push(t('core.parse.varDeclaration', { name: section.name }))
      }
    }
  }

  const fbSource = firstDirectChild(root, 'FBSource')
  const contentHeader = firstDirectChild(root, 'contentHeader')

  const document_: ParsedDocument = {
    kind,
    fileName,
    rootTag,
    projectName: attributeOf(contentHeader, 'name'),
    fileVersion: attributeOf(contentHeader, 'version'),
    fbName: attributeOf(fbSource, 'nameOfFBType'),
    fbVersion: attributeOf(fbSource, 'version'),
    comment: childText(fbSource, 'comment'),
    sections,
    variables: CATEGORY_ORDER.flatMap((category) =>
      collector.variables.filter((variable) => variable.category === category)
    ),
    warnings,
    rawXml
  }

  return document_
}

export function detectKindFromFileName(fileName: string): ExchangeKind | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.xdb')) return 'xdb'
  if (lower.endsWith('.xst')) return 'xst'
  if (lower.endsWith('.xsy')) return 'xsy'
  return null
}
