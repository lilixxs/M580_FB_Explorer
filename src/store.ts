import { computed, reactive } from 'vue'
import { HELP_MARKDOWN } from './data/helpContent'
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type CallRef,
  type ParsedDocument,
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
  collapsed: {},
  dirty: false,
  dirtySections: {},
  status: null,
  jump: null,
  variableFocusNonce: 0,
  variableEditor: null,
  helpMarkdown: HELP_MARKDOWN,
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
    return { category, label: CATEGORY_LABELS[category], items }
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

export const visibleCalls = computed(() => {
  const query = state.callSearch.trim().toLowerCase()
  return state.calls.filter((call) => {
    if (state.callsOnlyActiveSection && call.sectionId !== state.activeSectionId) return false
    if (!query) return true
    return `${call.displayName} ${call.kind} ${call.sectionName}`.toLowerCase().includes(query)
  })
})

export const callsBySection = computed(() => {
  const groups: Array<{ sectionId: string; sectionName: string; items: CallRef[] }> = []
  for (const call of visibleCalls.value) {
    let group = groups.find((item) => item.sectionId === call.sectionId)
    if (!group) {
      group = { sectionId: call.sectionId, sectionName: call.sectionName, items: [] }
      groups.push(group)
    }
    group.items.push(call)
  }
  return groups
})

export const callStats = computed(() => {
  const stats = { variable: 0, section: 0, builtin: 0, unknown: 0 }
  for (const call of state.calls) stats[call.kind] += 1
  return stats
})

export function countActiveCalls(): number {
  return state.calls.filter((call) => call.sectionId === state.activeSectionId).length
}
