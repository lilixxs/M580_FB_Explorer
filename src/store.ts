import { computed, reactive } from 'vue'
import { getHelpMarkdown } from './data/helpContent'
import { locale } from './i18n'
import { localize } from './localize'
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type CallRef,
  type ParsedDocument,
  type ReferenceView,
  type VariableAccess,
  type VariableCategory,
  type VariableDef
} from './types'

export type StatusType = 'info' | 'success' | 'warning' | 'error'

export interface StatusMessage {
  text: string
  type: StatusType
  at: number
}

export interface JumpRequest {
  sectionId: string
  line: number
  column: number
  nonce: number
}

export interface VariableEditorState {
  mode: 'add' | 'edit'
  variableId: string
  category: VariableCategory
}

export interface UiState {
  doc: ParsedDocument | null
  activeSectionId: string
  selectedVariableId: string
  variableSearch: string
  callSearch: string
  callsOnlyActiveSection: boolean
  calls: CallRef[]
  /** Plain variable uses; kept apart from `calls` so MCP keeps its call semantics. */
  variableReferences: CallRef[]
  /** Which list the calls panel shows. */
  referenceView: ReferenceView
  /** Bumped when the references view must highlight and scroll to the selected variable. */
  referenceFocusNonce: number
  collapsed: Record<string, boolean>
  dirty: boolean
  dirtySections: Record<string, boolean>
  status: StatusMessage | null
  jump: JumpRequest | null
  variableFocusNonce: number
  variableEditor: VariableEditorState | null
  helpMarkdown: string
  bootError: string
}

export const state = reactive<UiState>({
  doc: null,
  activeSectionId: '',
  selectedVariableId: '',
  variableSearch: '',
  callSearch: '',
  callsOnlyActiveSection: false,
  calls: [],
  variableReferences: [],
  referenceView: 'calls',
  referenceFocusNonce: 0,
  collapsed: {},
  dirty: false,
  dirtySections: {},
  status: null,
  jump: null,
  variableFocusNonce: 0,
  variableEditor: null,
  get helpMarkdown() { return getHelpMarkdown(locale.value) },
  bootError: ''
})

export const activeSection = computed(() => {
  if (!state.doc) return null
  return state.doc.sections.find((section) => section.id === state.activeSectionId) ?? state.doc.sections[0] ?? null
})

export const selectedVariable = computed(() => {
  if (!state.doc) return null
  return state.doc.variables.find((variable) => variable.id === state.selectedVariableId) ?? null
})

export function groupVariables(variables: VariableDef[], search: string): Array<{
  category: VariableCategory
  label: string
  items: VariableDef[]
}> {
  const query = search.trim().toLowerCase()
  return CATEGORY_ORDER.map((category) => {
    const items = variables.filter((variable) => {
      if (variable.category !== category) return false
      if (!query) return true
      return [variable.name, variable.typeName, variable.topologicalAddress, variable.comment, variable.defaultValue, variable.initValue]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
    return { category, label: localize(CATEGORY_LABELS[category]), items }
  }).filter((group) => group.items.length > 0)
}

export const visibleVariableGroups = computed(() => {
  const all = groupVariables(state.doc?.variables ?? [], state.variableSearch)
  const hasQuery = state.variableSearch.trim().length > 0
  return all.map((group) => ({
    ...group,
    collapsed: hasQuery ? false : Boolean(state.collapsed[group.category])
  }))
})

function groupBySection(items: CallRef[]): Array<{ sectionId: string; sectionName: string; items: CallRef[] }> {
  const groups: Array<{ sectionId: string; sectionName: string; items: CallRef[] }> = []
  for (const item of items) {
    let group = groups.find((entry) => entry.sectionId === item.sectionId)
    if (!group) {
      group = { sectionId: item.sectionId, sectionName: item.sectionName, items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}

export const visibleCalls = computed(() => {
  const query = state.callSearch.trim().toLowerCase()
  return state.calls.filter((call) => {
    if (state.callsOnlyActiveSection && call.sectionId !== state.activeSectionId) return false
    if (!query) return true
    return `${call.displayName} ${call.kind} ${call.sectionName}`.toLowerCase().includes(query)
  })
})

export const callsBySection = computed(() => groupBySection(visibleCalls.value))

export const visibleVariableReferences = computed(() => {
  const query = state.callSearch.trim().toLowerCase()
  return state.variableReferences.filter((reference) => {
    if (state.callsOnlyActiveSection && reference.sectionId !== state.activeSectionId) return false
    if (!query) return true
    return `${reference.targetName} ${reference.name} ${reference.sectionName} ${reference.access ?? ''}`
      .toLowerCase()
      .includes(query)
  })
})

export const referencesBySection = computed(() => groupBySection(visibleVariableReferences.value))

export const callStats = computed(() => {
  const stats = { variable: 0, section: 0, builtin: 0, unknown: 0 }
  for (const call of state.calls) stats[call.kind] += 1
  return stats
})

export const referenceStats = computed(() => {
  const stats: Record<VariableAccess, number> = { read: 0, write: 0, call: 0 }
  for (const reference of state.variableReferences) stats[reference.access ?? 'read'] += 1
  return stats
})

/** References of the selected variable; drives the "no reference" empty state. */
export const selectedVariableReferences = computed(() =>
  state.variableReferences.filter((reference) => reference.targetId === state.selectedVariableId)
)

export function countActiveCalls(): number {
  return state.calls.filter((call) => call.sectionId === state.activeSectionId).length
}

export function countActiveReferences(): number {
  return state.variableReferences.filter((reference) => reference.sectionId === state.activeSectionId).length
}
