import { t } from '../i18n'
import { NAME_RE, WIDE_TYPES, type VariableCategory, type VariableDef } from '../types'

export interface AddressInfo {
  raw: string
  word: number | null
  hasBitSuffix: boolean
  hasTableSuffix: boolean
}

const ADDRESS_RE = /^%[A-Z]{1,3}\d+(?:\.\d+|:\d+)?$/
function validTypeSyntax(typeName: string, depth = 0): boolean {
  if (depth > 32) return false
  const text = typeName.trim()
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return true
  const stringType = /^STRING\s*\[\s*(\d+)\s*\]$/i.exec(text)
  if (stringType) return Number(stringType[1]) >= 1 && Number(stringType[1]) <= 65535
  const array = /^ARRAY\s*\[([^\]]+)\]\s+OF\s+(.+)$/i.exec(text)
  if (!array) return false
  const ranges = array[1].split(',')
  if (ranges.length > 15) return false
  return ranges.every((range) => {
    const bounds = /^\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*$/.exec(range)
    return bounds && Number.isSafeInteger(Number(bounds[1])) && Number.isSafeInteger(Number(bounds[2])) && Number(bounds[1]) <= Number(bounds[2])
  }) && validTypeSyntax(array[2], depth + 1)
}

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
  if (!trimmed) return t('core.validation.nameEmpty')
  if (!NAME_RE.test(trimmed)) {
    return t('core.validation.nameInvalid')
  }
  if (['EN', 'ENO'].includes(trimmed.toUpperCase())) return t('core.validation.nameSystemPin')
  return null
}

export function validateTypeName(typeName: string): string | null {
  const trimmed = typeName.trim()
  if (!trimmed) return t('core.validation.typeEmpty')
  if (!validTypeSyntax(trimmed)) return t('core.validation.typeSyntax')
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
    errors.push(t('core.validation.addressSyntax', { address: raw }))
    return { errors, warnings }
  }
  const info = parseAddress(raw)
  if (isWideType(typeName) && info.word !== null && info.word % 2 !== 0 && !info.hasBitSuffix) {
    warnings.push(
      t('core.validation.oddWideAddress', { address: raw, aligned: `%MW${info.word + 1}` })
    )
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

  // Preserve imported system parameters, but do not create or rename a normal variable to one.
  const existingSystemPin = Boolean(selfId && ['EN', 'ENO'].includes(variable.name.trim().toUpperCase()) &&
    others.some(item => item.id === selfId && item.name.trim().toUpperCase() === variable.name.trim().toUpperCase()))
  const nameError = existingSystemPin ? null : validateVariableName(variable.name)
  if (nameError) errors.push(nameError)

  const typeError = validateTypeName(variable.typeName)
  if (typeError) errors.push(typeError)

  const trimmedName = variable.name.trim()
  if (trimmedName) {
    const duplicate = others.find(
      (item) => item.id !== selfId && item.name.trim().toUpperCase() === trimmedName.toUpperCase()
    )
    if (duplicate) {
      errors.push(t('core.validation.duplicateName', { name: trimmedName }))
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
    warnings.push(t('core.validation.emptyExport'))
  }

  for (const variable of variables) {
    const report = validateVariable(variable, variables, variable.id)
    errors.push(...report.errors)
    warnings.push(...report.warnings)

    const key = variable.name.trim().toUpperCase()
    if (!key) continue
    const previous = seen.get(key)
    if (previous && previous !== variable.category) {
      errors.push(
        t('core.validation.mixedCategories', { name: key, first: previous, second: variable.category })
      )
    }
    seen.set(key, variable.category)
  }

  return { errors: dedupe(errors), warnings: dedupe(warnings) }
}

export function dedupe(items: string[]): string[] {
  return Array.from(new Set(items))
}
