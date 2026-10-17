import type { McpHandlers, McpToolSchema } from './core/mcp'
import { MCP_TOOL_SCHEMAS } from './core/mcp'
import { buildSnippet, type SnippetKind } from './core/st'
import { activeSection, state } from './store'
import type { CallRef, VariableCategory } from './types'
import {
  addVariable,
  deleteVariable,
  exportXdbText,
  formatActiveSection,
  loadExchangeXml,
  refreshCalls,
  replaceInActiveSection,
  requestJump,
  saveActiveSection,
  selectSection,
  selectVariable,
  setActiveSource,
  setStatus,
  updateVariable
} from './actions'

const SNIPPET_KINDS: SnippetKind[] = ['IF', 'FOR', 'WHILE']

function asString(input: Record<string, unknown>, key: string, fallback = ''): string {
  const value = input[key]
  return typeof value === 'string' ? value : fallback
}

function asNumber(input: Record<string, unknown>, key: string, fallback = 0): number {
  const value = input[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(input: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = input[key]
  return typeof value === 'boolean' ? value : fallback
}

function requireSection(sectionId: string) {
  if (!state.doc) throw new Error('尚未载入交换文件')
  const section = sectionId
    ? state.doc.sections.find((item) => item.id === sectionId)
    : activeSection.value
  if (!section) throw new Error(sectionId ? `程序段 ${sectionId} 不存在` : '当前没有可用程序段')
  return section
}

function documentSummary() {
  if (!state.doc) {
    return { loaded: false, doc: null }
  }
  return {
    loaded: true,
    doc: {
      kind: state.doc.kind,
      fileName: state.doc.fileName,
      projectName: state.doc.projectName,
      fbName: state.doc.fbName,
      fbVersion: state.doc.fbVersion,
      sectionCount: state.doc.sections.length,
      variableCount: state.doc.variables.length,
      warnings: state.doc.warnings,
      activeSectionId: state.activeSectionId,
      dirty: state.dirty
    }
  }
}

function callToJson(call: CallRef) {
  return {
    id: call.id,
    sectionId: call.sectionId,
    sectionName: call.sectionName,
    displayName: call.displayName,
    kind: call.kind,
    line: call.line,
    column: call.column,
    targetName: call.targetName,
    targetId: call.targetId
  }
}

function readPosition(
  input: Record<string, unknown>,
  key: 'line' | 'column',
  fallback: number
): number {
  const value = input[key]
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${key} 必须是从 1 开始的整数`)
  }
  return value
}

function offsetAt(source: string, line: number, column: number): number {
  const lines = source.split('\n')
  if (line > lines.length) {
    throw new Error(`行号 ${line} 超出范围 1..${lines.length}`)
  }
  const target = lines[line - 1]
  if (column > target.length + 1) {
    throw new Error(`列号 ${column} 超出范围 1..${target.length + 1}`)
  }
  let offset = 0
  for (let index = 0; index < line - 1; index += 1) {
    offset += lines[index].length + 1
  }
  return offset + column - 1
}

function sectionCallCount(sectionId: string): number {
  return state.calls.filter((call) => call.sectionId === sectionId).length
}

export function getMcpToolSchemas(): McpToolSchema[] {
  return MCP_TOOL_SCHEMAS
}

export function getMcpState(): unknown {
  return documentSummary()
}

export function createMcpHandlers(): McpHandlers {
  const getMetadata = () => documentSummary()

  const listVariables = (input: Record<string, unknown>) => {
    const category = asString(input, 'category').toUpperCase()
    const search = asString(input, 'search').toLowerCase()
    const variables = (state.doc?.variables ?? []).filter((variable) => {
      if (category && variable.category !== (category as VariableCategory)) return false
      if (!search) return true
      return [variable.name, variable.typeName, variable.topologicalAddress, variable.comment]
        .join(' ')
        .toLowerCase()
        .includes(search)
    })
    return variables.map((variable) => ({
      id: variable.id,
      name: variable.name,
      typeName: variable.typeName,
      category: variable.category,
      topologicalAddress: variable.topologicalAddress,
      defaultValue: variable.defaultValue,
      comment: variable.comment,
      initValue: variable.initValue,
      positionPin: variable.positionPin
    }))
  }

  const upsertVariable = (input: Record<string, unknown>) => {
    const name = asString(input, 'name')
    const typeName = asString(input, 'typeName')
    const category = (asString(input, 'category', 'IN').toUpperCase() || 'IN') as VariableCategory
    const payload = {
      name,
      typeName,
      category,
      topologicalAddress: asString(input, 'topologicalAddress'),
      defaultValue: asString(input, 'defaultValue'),
      comment: asString(input, 'comment'),
      initValue: asString(input, 'initValue')
    }
    const id = asString(input, 'id')
    const error = id ? updateVariable(id, payload) : addVariable(payload)
    if (error) throw new Error(error)
    const variable = state.doc?.variables.find(
      (item) => (id && item.id === id) || (!id && item.name === payload.name)
    )
    return variable ? { id: variable.id, name: variable.name, category: variable.category } : { ok: true }
  }

  const removeVariable = (input: Record<string, unknown>) => {
    const id = asString(input, 'id')
    if (!id) throw new Error('缺少 id 参数')
    if (!deleteVariable(id)) throw new Error(`变量 ${id} 不存在`)
    return { deleted: id }
  }

  const getSource = (input: Record<string, unknown>) => {
    const section = requireSection(asString(input, 'sectionId'))
    return {
      sectionId: section.id,
      name: section.name,
      language: section.language,
      programType: section.programType,
      task: section.task,
      readOnly: section.language !== 'ST',
      source: section.language === 'ST' ? section.stSource : section.xmlSource,
      stSource: section.stSource,
      xmlSource: section.xmlSource
    }
  }

  const setSource = (input: Record<string, unknown>) => {
    const section = requireSection(asString(input, 'sectionId'))
    if (section.language !== 'ST') {
      throw new Error('非 ST 程序段为只读，不能写入 ST 源码')
    }
    if (typeof input.source !== 'string') {
      throw new Error('source 必须是字符串')
    }
    if (state.activeSectionId !== section.id) selectSection(section.id)
    setActiveSource(input.source)
    refreshCalls()
    return {
      sectionId: section.id,
      length: input.source.length,
      dirty: state.dirty,
      callCount: sectionCallCount(section.id)
    }
  }

  const insertSnippet = (input: Record<string, unknown>) => {
    const section = requireSection(asString(input, 'sectionId'))
    if (section.language !== 'ST') {
      throw new Error('非 ST 程序段为只读，不能插入代码')
    }
    const line = readPosition(input, 'line', 1)
    const column = readPosition(input, 'column', 1)
    const hasSource = input.source !== undefined
    const hasKind = input.kind !== undefined
    if (hasSource && hasKind) throw new Error('source 与 kind 只能提供一个')

    let snippet: string
    if (hasSource) {
      if (typeof input.source !== 'string') throw new Error('source 必须是字符串')
      if (input.source.length === 0) throw new Error('source 不能为空')
      snippet = input.source
    } else if (hasKind) {
      if (typeof input.kind !== 'string') throw new Error('kind 必须是字符串')
      const kind = input.kind as SnippetKind
      if (!SNIPPET_KINDS.includes(kind)) {
        throw new Error(`kind 仅支持 ${SNIPPET_KINDS.join('、')}`)
      }
      const lineText = section.stSource.split('\n')[line - 1] ?? ''
      const indent = /^[ \t]*/.exec(lineText)?.[0] ?? ''
      snippet = buildSnippet(kind, indent).text
    } else {
      throw new Error('需要提供 source 或 kind 参数')
    }

    const offset = offsetAt(section.stSource, line, column)
    let insertText = snippet
    if (hasKind) {
      const lineEnd = section.stSource.indexOf('\n', offset)
      const restOfLine = section.stSource.slice(
        offset,
        lineEnd === -1 ? section.stSource.length : lineEnd
      )
      if (restOfLine.trim().length > 0) insertText = `${insertText}\n`
    }
    const next = `${section.stSource.slice(0, offset)}${insertText}${section.stSource.slice(offset)}`
    if (state.activeSectionId !== section.id) selectSection(section.id)
    setActiveSource(next)
    refreshCalls()
    return {
      sectionId: section.id,
      line,
      column,
      insertedLength: insertText.length,
      callCount: sectionCallCount(section.id)
    }
  }

  const analyzeCalls = (input: Record<string, unknown>) => {
    if (!state.doc) throw new Error('尚未载入交换文件')
    const sectionId = asString(input, 'sectionId')
    if (sectionId && !state.doc.sections.some((item) => item.id === sectionId)) {
      throw new Error(`程序段 ${sectionId} 不存在`)
    }
    refreshCalls()
    return state.calls.filter((call) => !sectionId || call.sectionId === sectionId).map(callToJson)
  }

  return {
    m580_get_state: getMetadata,

    m580_import: (input) => {
      const xml = asString(input, 'xml')
      if (!xml) throw new Error('缺少 xml 参数')
      const fileName = asString(input, 'fileName', 'imported.xdb')
      const ok = loadExchangeXml(xml, fileName)
      if (!ok) throw new Error(state.status?.text ?? '导入失败')
      return documentSummary()
    },

    m580_list_variables: listVariables,

    m580_upsert_variable: upsertVariable,

    m580_delete_variable: removeVariable,

    m580_get_section: (input) => {
      const section = requireSection(asString(input, 'sectionId'))
      return {
        id: section.id,
        index: section.index,
        name: section.name,
        language: section.language,
        programType: section.programType,
        task: section.task,
        stSource: section.stSource,
        xmlSource: section.xmlSource,
        calls: state.calls.filter((call) => call.sectionId === section.id).map(callToJson)
      }
    },

    m580_set_section_source: (input) => {
      const section = requireSection(asString(input, 'sectionId'))
      const source = asString(input, 'source')
      if (section.language !== 'ST') throw new Error('非 ST 程序段为只读')
      if (state.activeSectionId !== section.id) selectSection(section.id)
      setActiveSource(source)
      return { sectionId: section.id, dirty: state.dirty, length: source.length }
    },

    m580_save_section: (input) => {
      const section = requireSection(asString(input, 'sectionId'))
      if (state.activeSectionId !== section.id) selectSection(section.id)
      const ok = saveActiveSection()
      if (!ok) throw new Error(state.status?.text ?? '保存失败')
      return documentSummary()
    },

    m580_format_section: (input) => {
      const section = requireSection(asString(input, 'sectionId'))
      if (state.activeSectionId !== section.id) selectSection(section.id)
      const ok = formatActiveSection()
      if (!ok) throw new Error(state.status?.text ?? '格式化失败')
      return { sectionId: section.id, source: section.stSource }
    },

    m580_replace_in_section: (input) => {
      const section = requireSection(asString(input, 'sectionId'))
      if (state.activeSectionId !== section.id) selectSection(section.id)
      const count = replaceInActiveSection(asString(input, 'query'), asString(input, 'replacement'), {
        caseSensitive: asBoolean(input, 'caseSensitive'),
        wholeWord: asBoolean(input, 'wholeWord'),
        useRegex: asBoolean(input, 'useRegex')
      })
      return { sectionId: section.id, replacements: count }
    },

    m580_extract_calls: (input) => {
      if (!state.doc) throw new Error('尚未载入交换文件')
      const sectionId = asString(input, 'sectionId')
      refreshCalls()
      return state.calls.filter((call) => !sectionId || call.sectionId === sectionId).map(callToJson)
    },

    m580_export_xdb: () => {
      const result = exportXdbText()
      if (!result) throw new Error(state.status?.text ?? '导出失败')
      return result
    },

    m580_get_help: () => state.helpMarkdown,

    m580_jump: (input) => {
      const sectionId = asString(input, 'sectionId')
      const line = asNumber(input, 'line', 1)
      const column = asNumber(input, 'column', 1)
      const variableName = asString(input, 'variableName')
      if (sectionId) selectSection(sectionId)
      if (variableName) {
        const variable = state.doc?.variables.find((item) => item.name === variableName)
        if (!variable) throw new Error(`变量 ${variableName} 不存在`)
        selectVariable(variable.id, true)
      }
      const target = sectionId || state.activeSectionId
      requestJump(line, column, target)
      setStatus(`已跳转到第 ${line} 行`, 'info')
      return { sectionId: target, line, column, variableName }
    },

    m580_fb_get_metadata: getMetadata,

    m580_fb_list_variables: listVariables,

    m580_fb_upsert_variable: upsertVariable,

    m580_fb_delete_variable: removeVariable,

    m580_fb_get_source: getSource,

    m580_fb_set_source: setSource,

    m580_fb_insert_snippet: insertSnippet,

    m580_fb_analyze_calls: analyzeCalls
  }
}
