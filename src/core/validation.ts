import { NAME_RE, WIDE_TYPES, type VariableCategory, type VariableDef } from '../types'

export interface AddressInfo {
  raw: string
  word: number | null
  hasBitSuffix: boolean
  hasTableSuffix: boolean
}

const ADDRESS_RE = /^%[A-Z]{1,3}\d+(?:\.\d+|:\d+)?$/
const TYPE_RE = /^[A-Za-z0-9_[\].\- ]+$/

export function baseTypeName(typeName: string): string {
  const trimmed = typeName.trim().toUpperCase()
  const arrayOfIndex = trimmed.lastIndexOf(' OF ')
  if (trimmed.startsWith('ARRAY') && arrayOfIndex >= 0) {
    return trimmed.slice(arrayOfIndex + 4).trim()
  }
  return trimmed
}

export function isWideType(typeName: string): boolean {
  return WIDE_TYPES.has(baseTypeName(typeName))
}

export function parseAddress(address: string): AddressInfo {
  const raw = address.trim()
  const match = /^%([A-Z]{1,3})(\d+)(?:\.(\d+)|:(\d+))?$/.exec(raw)
  if (!match) {
    return { raw, word: null, hasBitSuffix: false, hasTableSuffix: false }
  }
  return {
    raw,
    word: Number.parseInt(match[2], 10),
    hasBitSuffix: match[3] !== undefined,
    hasTableSuffix: match[4] !== undefined
  }
}

export function validateVariableName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '变量名不能为空'
  if (!NAME_RE.test(trimmed)) {
    return '变量名只允许字母、数字与下划线（IEC 61131-3 命名规则）'
  }
  return null
}

export function validateTypeName(typeName: string): string | null {
  const trimmed = typeName.trim()
  if (!trimmed) return '数据类型不能为空'
  if (!TYPE_RE.test(trimmed)) return '数据类型含有非法字符'
  return null
}

export function validateAddress(typeName: string, address: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const raw = address.trim()
  if (!raw) {
    return { errors, warnings }
  }
  if (!ADDRESS_RE.test(raw)) {
    errors.push(`拓扑地址格式非法：${raw}（示例 %MW100、%MW100:8、%MW0.5、%M69）`)
    return { errors, warnings }
  }
  const info = parseAddress(raw)
  if (isWideType(typeName) && info.word !== null && info.word % 2 !== 0 && !info.hasBitSuffix) {
    warnings.push(`32 位变量 ${raw} 的 %MW 地址号为奇数，导出时会自动对齐为 %MW${info.word + 1}`)
  }
  return { errors, warnings }
}

export interface ValidationReport {
  errors: string[]
  warnings: string[]
}

export function validateVariable(
  variable: Pick<VariableDef, 'name' | 'typeName' | 'topologicalAddress' | 'category'>,
  others: Array<Pick<VariableDef, 'name' | 'category' | 'id'>> = [],
  selfId = ''
): ValidationReport {
  const errors: string[] = []
  const warnings: string[] = []

  const nameError = validateVariableName(variable.name)
  if (nameError) errors.push(nameError)

  const typeError = validateTypeName(variable.typeName)
  if (typeError) errors.push(typeError)

  const trimmedName = variable.name.trim()
  if (trimmedName) {
    const duplicate = others.find(
      (item) => item.id !== selfId && item.name.trim() === trimmedName
    )
    if (duplicate) {
      errors.push(`变量名 ${trimmedName} 与已有变量重复（IEC 作用域内名称必须唯一）`)
    }
  }

  const addressReport = validateAddress(variable.typeName, variable.topologicalAddress)
  errors.push(...addressReport.errors)
  warnings.push(...addressReport.warnings)

  return { errors, warnings }
}

/** Validation used by the .xdb export path. */
export function validateForExport(variables: VariableDef[]): ValidationReport {
  const errors: string[] = []
  const warnings: string[] = []
  const seen = new Map<string, VariableCategory>()

  if (variables.length === 0) {
    warnings.push('导出文件中不包含任何变量')
  }

  for (const variable of variables) {
    const report = validateVariable(variable, variables, variable.id)
    errors.push(...report.errors)
    warnings.push(...report.warnings)

    const key = variable.name.trim()
    if (!key) continue
    const previous = seen.get(key)
    if (previous && previous !== variable.category) {
      errors.push(`变量名 ${key} 同时出现在 ${previous} 与 ${variable.category} 分类中`)
    }
    seen.set(key, variable.category)
  }

  return { errors: dedupe(errors), warnings: dedupe(warnings) }
}

export function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}
