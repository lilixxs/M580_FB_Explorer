export type ExchangeKind = 'xdb' | 'xst' | 'xsy'

export type VariableCategory = 'IN' | 'OUT' | 'IN_OUT' | 'PUBLIC' | 'PRIVATE' | 'GLOBAL'

export const CATEGORY_ORDER: VariableCategory[] = [
  'IN',
  'OUT',
  'IN_OUT',
  'PUBLIC',
  'PRIVATE',
  'GLOBAL'
]

export const CATEGORY_LABELS: Record<VariableCategory, string> = {
  IN: '输入 IN',
  OUT: '输出 OUT',
  IN_OUT: '输入输出 IN_OUT',
  PUBLIC: '公共 PUBLIC',
  PRIVATE: '私有 PRIVATE',
  GLOBAL: '全局 GLOBAL'
}

export type SectionLanguage = 'ST' | 'XML'

export interface VariableDef {
  id: string
  name: string
  typeName: string
  category: VariableCategory
  topologicalAddress: string
  defaultValue: string
  comment: string
  initValue: string
  positionPin: number | null
}

export interface ProgramSection {
  id: string
  /** Zero based position among FBProgram / program elements. */
  index: number
  name: string
  programType: string
  task: string
  language: SectionLanguage
  stSource: string
  /** Original inner XML for non-ST sections. */
  xmlSource: string
  isFBProgram: boolean
}

export interface ParsedDocument {
  kind: ExchangeKind
  fileName: string
  rootTag: string
  projectName: string
  fileVersion: string
  fbName: string
  fbVersion: string
  comment: string
  sections: ProgramSection[]
  variables: VariableDef[]
  warnings: string[]
  rawXml: string
}

export interface VariableInput {
  name: string
  typeName: string
  category: VariableCategory
  topologicalAddress: string
  defaultValue: string
  comment: string
  initValue: string
}

export interface ExportResult {
  xml: string
  fileName: string
  warnings: string[]
}

export type CallKind = 'variable' | 'section' | 'builtin' | 'unknown'

export interface CallRef {
  id: string
  sectionId: string
  sectionName: string
  name: string
  owner: string
  displayName: string
  line: number
  column: number
  kind: CallKind
  targetName: string
  targetId: string
  snippet: string
}

export interface ParseErrorInfo {
  message: string
  detail?: string
}

export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export const WIDE_TYPES = new Set(['DINT', 'UDINT', 'DWORD', 'REAL'])

export function isVariableCategory(value: string): value is VariableCategory {
  return (CATEGORY_ORDER as string[]).includes(value)
}

export function emptyVariableInput(category: VariableCategory): VariableInput {
  return {
    name: '',
    typeName: 'BOOL',
    category,
    topologicalAddress: '',
    defaultValue: '',
    comment: '',
    initValue: ''
  }
}
