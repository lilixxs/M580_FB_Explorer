import { DEMO_FILES } from './data/demo'
import { ExportValidationError, buildXdb } from './core/exportXdb'
import { parseExchange } from './core/parseExchange'
import { setSectionSource } from './core/serialize'
import { extractRawCalls, isBuiltinFunction, replaceAllSource, formatSt } from './core/st'
import { extractVariableReferences } from './core/variableReferences'
import { validateVariable } from './core/validation'
import { activeSection, state, type StatusType } from './store'
import type { CallRef, CallKind, ReferenceView, VariableCategory, VariableDef, VariableInput } from './types'
import type { StSearchOptions } from './core/st'

let jumpNonce = 0
let variableCounter = 0

export function setStatus(text: string, type: StatusType = 'info'): void {
  state.status = { text, type, at: Date.now() }
}

export function clearStatus(): void {
  state.status = null
}

/**
 * Mark one section as having unsaved source edits.
 *
 * `state.dirty` tracks the whole page: it becomes true on any variable or source change and is
 * cleared only when the document is exported (App.vue `onExport`). Saving a section clears
 * `state.dirtySections[sectionId]` only, so the top bar keeps showing `有修改` after a save.
 */
function markSectionDirty(sectionId: string): void {
  state.dirtySections[sectionId] = true
  state.dirty = true
}

function clearDirtyState(): void {
  state.dirtySections = {}
  state.dirty = false
}

export function loadExchangeXml(xml: string, fileName: string): boolean {
  try {
    const parsed = parseExchange(xml, fileName)
    state.doc = parsed
    state.activeSectionId = parsed.sections[0]?.id ?? ''
    state.selectedVariableId = ''
    state.variableSearch = ''
    state.callSearch = ''
    state.collapsed = {}
    state.callsOnlyActiveSection = false
    state.variableEditor = null
    state.jump = null
    clearDirtyState()
    state.calls = []
    state.variableReferences = []
    state.referenceView = 'calls'
    state.referenceFocusNonce = 0
    refreshCalls()
    setStatus(
      `已载入 ${fileName}：${parsed.sections.length} 个程序段、${parsed.variables.length} 个变量`,
      parsed.warnings.length > 0 ? 'warning' : 'success'
    )
    return true
  } catch (error) {
    setStatus(`导入失败：${(error as Error).message}`, 'error')
    return false
  }
}

export function loadDemoFile(index: number): boolean {
  const file = DEMO_FILES[index] ?? DEMO_FILES[0]
  return loadExchangeXml(file.xml, file.fileName)
}

export function selectSection(sectionId: string): void {
  if (!state.doc) return
  const section = state.doc.sections.find((item) => item.id === sectionId)
  if (!section) return
  if (state.activeSectionId !== sectionId && state.dirty) {
    // Keep the edited text in memory; the user still decides when to re-parse.
  }
  state.activeSectionId = sectionId
}

export function selectVariable(variableId: string, focus = false): void {
  state.selectedVariableId = variableId
  if (focus) {
    const variable = state.doc?.variables.find(item => item.id === variableId)
    if (variable) {
      state.variableSearch = ''
      state.collapsed[variable.category] = false
    }
    state.variableFocusNonce += 1
  }
}

export function openVariableEditor(
  mode: 'add' | 'edit',
  category: VariableCategory = 'IN',
  variableId = ''
): void {
  state.variableEditor = { mode, variableId, category }
}

export function closeVariableEditor(): void {
  state.variableEditor = null
}

export function setActiveSource(source: string): void {
  const section = activeSection.value
  if (!section || section.language !== 'ST') return
  section.stSource = source
  markSectionDirty(section.id)
}

export function toggleCategory(category: VariableCategory): void {
  state.collapsed[category] = !state.collapsed[category]
}

export function setAllCollapsed(collapsed: boolean): void {
  for (const key of ['IN', 'OUT', 'IN_OUT', 'PUBLIC', 'PRIVATE', 'GLOBAL']) {
    state.collapsed[key] = collapsed
  }
}

export function saveActiveSection(): boolean {
  const section = activeSection.value
  if (!state.doc || !section) return false
  if (section.language !== 'ST' && !hasDirtyStSections()) {
    setStatus('非 ST 程序段为只读，不支持保存', 'warning')
    return false
  }

  const pendingSections = state.doc.sections.filter(
    (item) => item.language === 'ST' && state.dirtySections[item.id]
  )
  const sectionsToWrite = pendingSections.length > 0 ? pendingSections : section.language === 'ST' ? [section] : []

  try {
    let rawXml = state.doc.rawXml
    for (const target of sectionsToWrite) {
      rawXml = setSectionSource(rawXml, target.index, target.stSource)
    }
    // Validate the updated source, but keep the authoritative in-memory variables.
    // Replacing the model here would restore deleted variables and discard new ones.
    parseExchange(rawXml, state.doc.fileName)
    state.doc.rawXml = rawXml
    state.dirtySections = {}
    refreshCalls()
    setStatus(
      sectionsToWrite.length > 1
        ? `已保存 ${sectionsToWrite.length} 个程序段并重新解析交换文件`
        : '已保存到页面内存并重新解析；请导出文件以保留修改',
      'success'
    )
    return true
  } catch (error) {
    setStatus(`保存失败：${(error as Error).message}`, 'error')
    return false
  }
}

function hasDirtyStSections(): boolean {
  return (state.doc?.sections ?? []).some(
    (item) => item.language === 'ST' && state.dirtySections[item.id]
  )
}

export function formatActiveSection(): boolean {
  const section = activeSection.value
  if (!section || section.language !== 'ST') {
    setStatus('仅 ST 程序段支持格式化', 'warning')
    return false
  }
  const formatted = formatSt(section.stSource)
  section.stSource = formatted
  markSectionDirty(section.id)
  setStatus('已格式化 ST 源码，保存后写回交换文件', 'info')
  return true
}

export function replaceInActiveSection(
  query: string,
  replacement: string,
  options: StSearchOptions = {}
): number {
  const section = activeSection.value
  if (!section || section.language !== 'ST') {
    setStatus('仅 ST 程序段支持替换', 'warning')
    return 0
  }
  const result = replaceAllSource(section.stSource, query, replacement, options)
  if (result.error) {
    setStatus(result.error, 'error')
    return 0
  }
  section.stSource = result.text
  markSectionDirty(section.id)
  setStatus(`已替换 ${result.count} 处，保存后写回交换文件`, 'info')
  return result.count
}

function describeVariableErrors(variable: VariableDef, selfId: string): string | null {
  const report = validateVariable(variable, state.doc?.variables ?? [], selfId)
  if (report.errors.length === 0) return null
  return report.errors.join('；')
}

export function addVariable(input: VariableInput): string | null {
  if (!state.doc) return '请先导入交换文件'
  variableCounter += 1
  const variable: VariableDef = {
    id: `user-var-${variableCounter}`,
    name: input.name.trim(),
    typeName: input.typeName.trim(),
    category: input.category,
    topologicalAddress: input.topologicalAddress.trim(),
    defaultValue: input.defaultValue.trim(),
    comment: input.comment.trim(),
    initValue: input.initValue.trim(),
    positionPin: null
  }
  const error = describeVariableErrors(variable, '')
  if (error) return error
  state.doc.variables.push(variable)
  renumberPins()
  state.dirty = true
  selectVariable(variable.id, true)
  refreshCalls()
  setStatus(`已新增变量 ${variable.name}`, 'success')
  return null
}

export function updateVariable(id: string, input: VariableInput): string | null {
  if (!state.doc) return '请先导入交换文件'
  const variable = state.doc.variables.find((item) => item.id === id)
  if (!variable) return '变量不存在'
  const candidate: VariableDef = {
    ...variable,
    name: input.name.trim(),
    typeName: input.typeName.trim(),
    category: input.category,
    topologicalAddress: input.topologicalAddress.trim(),
    defaultValue: input.defaultValue.trim(),
    comment: input.comment.trim(),
    initValue: input.initValue.trim()
  }
  const error = describeVariableErrors(candidate, id)
  if (error) return error
  variable.name = candidate.name
  variable.typeName = candidate.typeName
  variable.category = candidate.category
  variable.topologicalAddress = candidate.topologicalAddress
  variable.defaultValue = candidate.defaultValue
  variable.comment = candidate.comment
  variable.initValue = candidate.initValue
  if (candidate.category !== 'IN' && candidate.category !== 'OUT' && candidate.category !== 'IN_OUT') {
    variable.positionPin = null
  }
  renumberPins()
  state.dirty = true
  selectVariable(id, true)
  refreshCalls()
  setStatus(`已更新变量 ${variable.name}`, 'success')
  return null
}

export function deleteVariable(id: string): boolean {
  if (!state.doc) return false
  const index = state.doc.variables.findIndex((variable) => variable.id === id)
  if (index < 0) return false
  const [removed] = state.doc.variables.splice(index, 1)
  renumberPins()
  state.dirty = true
  if (state.selectedVariableId === id) state.selectedVariableId = ''
  refreshCalls()
  setStatus(`已删除变量 ${removed.name}`, 'success')
  return true
}

function renumberPins(): void {
  for (const category of ['IN', 'OUT', 'IN_OUT']) {
    state.doc?.variables.filter((variable) => variable.category === category)
      .forEach((variable, index) => { variable.positionPin = index + 1 })
  }
}

export function moveVariable(id: string, delta: number): void {
  const variables = state.doc?.variables
  if (!variables) return
  const index = variables.findIndex((item) => item.id === id)
  if (index < 0) return
  const group = variables.filter((item) => item.category === variables[index].category)
  const groupIndex = group.findIndex((item) => item.id === id)
  const target = group[groupIndex + delta]
  if (!target) return
  const otherIndex = variables.indexOf(target)
  ;[variables[index], variables[otherIndex]] = [variables[otherIndex], variables[index]]
  renumberPins()
  state.dirty = true
}

function resolveCallTarget(name: string): { kind: CallKind; targetId: string; targetName: string } {
  if (!state.doc) return { kind: 'unknown', targetId: '', targetName: name }
  const variable = state.doc.variables.find((item) => item.name.toUpperCase() === name.toUpperCase())
  if (variable) return { kind: 'variable', targetId: variable.id, targetName: variable.name }
  const section = state.doc.sections.find((item) => item.name.toUpperCase() === name.toUpperCase())
  if (section) return { kind: 'section', targetId: section.id, targetName: section.name }
  if (isBuiltinFunction(name)) return { kind: 'builtin', targetId: '', targetName: name.toUpperCase() }
  return { kind: 'unknown', targetId: '', targetName: name }
}

export function refreshCalls(): void {
  if (!state.doc) {
    state.calls = []
    state.variableReferences = []
    return
  }
  const calls: CallRef[] = []
  for (const section of state.doc.sections) {
    if (section.language !== 'ST') continue
    const rawCalls = extractRawCalls(section.stSource)
    rawCalls.forEach((raw, index) => {
      const target = raw.owner ? resolveCallTarget(raw.owner) : resolveCallTarget(raw.name)
      const displayName = raw.owner ? `${raw.owner}.${raw.name}` : raw.name
      let kind: CallKind = target.kind
      if (raw.owner && target.kind !== 'variable') kind = 'unknown'
      calls.push({
        id: `${section.id}-call-${index + 1}`,
        sectionId: section.id,
        sectionName: section.name,
        name: raw.name,
        owner: raw.owner,
        displayName,
        line: raw.line,
        column: raw.column,
        snippet: section.stSource.split(/\r\n|\r|\n/)[raw.line - 1]?.trim() ?? '',
        kind,
        targetName: target.targetName,
        targetId: target.targetId
      })
    })
  }
  state.calls = calls
  state.variableReferences = buildVariableReferences()
}

/**
 * Plain uses of every declared variable across the ST sections.
 *
 * Kept out of `state.calls` on purpose: the MCP `state.calls` payload must stay a call list.
 */
function buildVariableReferences(): CallRef[] {
  const doc = state.doc
  if (!doc) return []
  const byName = new Map<string, VariableDef>()
  for (const variable of doc.variables) {
    const key = variable.name.trim().toUpperCase()
    if (key) byName.set(key, variable)
  }
  const names = new Set(byName.keys())
  const references: CallRef[] = []
  for (const section of doc.sections) {
    if (section.language !== 'ST') continue
    const lines = section.stSource.split(/\r\n|\r|\n/)
    extractVariableReferences(section.stSource, names).forEach((extracted, index) => {
      const variable = byName.get(extracted.name.toUpperCase())
      if (!variable) return
      references.push({
        id: `${section.id}-ref-${index + 1}`,
        sectionId: section.id,
        sectionName: section.name,
        name: extracted.name,
        owner: '',
        displayName: extracted.name,
        line: extracted.line,
        column: extracted.column,
        kind: 'variable',
        targetName: variable.name,
        targetId: variable.id,
        snippet: lines[extracted.line - 1]?.trim() ?? '',
        reference: true,
        access: extracted.access
      })
    })
  }
  return references
}

export function requestJump(line: number, column = 1, sectionId = ''): void {
  jumpNonce += 1
  state.jump = {
    sectionId: sectionId || state.activeSectionId,
    line: Math.max(1, Math.trunc(line)),
    column: Math.max(1, Math.trunc(column)),
    nonce: jumpNonce
  }
}

/**
 * Jump to the exact call site. A call that resolves to a variable also selects that variable, so
 * the variables panel and the pin diagram follow the editor navigation.
 */
export function jumpToCall(call: CallRef): void {
  if (call.kind === 'variable' && call.targetId) selectVariable(call.targetId, true)
  selectSection(call.sectionId)
  requestJump(call.line, call.column, call.sectionId)
}

/** Switch the calls panel between the call list and the plain variable reference list. */
export function setReferenceView(view: ReferenceView): void {
  state.referenceView = view
}

/** Jump to one variable reference, select its variable, and keep the editor cursor there. */
export function jumpToReference(reference: CallRef): void {
  if (reference.targetId) selectVariable(reference.targetId, true)
  selectSection(reference.sectionId)
  requestJump(reference.line, reference.column, reference.sectionId)
}

/**
 * Select a variable, show its references and scroll the reference list to it.
 *
 * The editor jumps to the first reference of the active section, or to the first reference
 * anywhere. A variable without any reference keeps the editor where it is and shows the empty
 * state: it never jumps to a different variable.
 */
export function revealVariable(variableId: string): void {
  selectVariable(variableId, true)
  state.referenceView = 'references'
  state.referenceFocusNonce += 1
  const related = state.variableReferences.filter((reference) => reference.targetId === variableId)
  if (related.length === 0) return
  const target = related.find((reference) => reference.sectionId === state.activeSectionId) ?? related[0]
  selectSection(target.sectionId)
  requestJump(target.line, target.column, target.sectionId)
}

/**
 * Link the variable under the editor caret without touching the caret or the jump request.
 *
 * Called from a mouse click on a variable token: no `requestJump` and no editor API, so the caret
 * never moves and no watch loop can start. It does refresh the call/reference lists first, because
 * the click may follow an unsaved edit, then selects the variable with focus so the variables
 * panel expands, clears its filter and scrolls the row into view.
 */
export function linkEditorVariable(variableId: string): void {
  if (!variableId) return
  // Unsaved edits must be visible in the reference list before the view is switched.
  refreshCalls()
  const alreadyFocused = state.selectedVariableId === variableId && state.referenceView === 'references'
  selectVariable(variableId, true)
  state.referenceView = 'references'
  if (!alreadyFocused) state.referenceFocusNonce += 1
}

export function jumpToDefinition(call: CallRef): void {
  if (call.kind === 'variable' && call.targetId) {
    selectVariable(call.targetId, true)
    setStatus(`已定位变量 ${call.targetName}`, 'info')
    return
  }
  if (call.kind === 'section' && call.targetId) {
    selectSection(call.targetId)
    requestJump(1, 1, call.targetId)
    setStatus(`已切换到程序段 ${call.targetName}`, 'info')
    return
  }
  setStatus(`${call.displayName} 无本地定义（内置函数或外部符号）`, 'info')
}

export function exportXdbText(): { fileName: string; xml: string; warnings: string[] } | null {
  if (!state.doc) {
    setStatus('请先导入交换文件', 'warning')
    return null
  }
  try {
    const result = buildXdb(state.doc, { now: new Date() })
    setStatus(
      `已生成 ${result.fileName}${result.warnings.length > 0 ? `；${result.warnings.join('；')}` : ''}`,
      result.warnings.length > 0 ? 'warning' : 'success'
    )
    return result
  } catch (error) {
    if (error instanceof ExportValidationError) {
      setStatus(`导出校验未通过：${error.errors.join('；')}`, 'error')
      return null
    }
    setStatus(`导出失败：${(error as Error).message}`, 'error')
    return null
  }
}
