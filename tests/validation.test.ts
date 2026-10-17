import { describe, expect, it } from 'vitest'
import { baseTypeName, isWideType, parseAddress, validateForExport, validateVariableName } from '../src/core/validation'
import type { VariableDef } from '../src/types'

function variable(partial: Partial<VariableDef>): VariableDef {
  return {
    id: 'v',
    name: 'x',
    typeName: 'BOOL',
    category: 'IN',
    topologicalAddress: '',
    defaultValue: '',
    comment: '',
    initValue: '',
    positionPin: null,
    ...partial
  }
}

describe('validation', () => {
  it('accepts IEC 61131-3 names and rejects hyphens, dots and spaces', () => {
    expect(validateVariableName('DB_LJB_B2A_1_DI1')).toBeNull()
    expect(validateVariableName('_tmp')).toBeNull()
    expect(validateVariableName('x-Start')).toContain('只允许')
    expect(validateVariableName('a.b')).toContain('只允许')
    expect(validateVariableName('')).toContain('不能为空')
  })

  it('resolves array element types for alignment checks', () => {
    expect(baseTypeName('ARRAY[0..9] OF DINT')).toBe('DINT')
    expect(isWideType('REAL')).toBe(true)
    expect(isWideType('ARRAY[0..3] OF UDINT')).toBe(true)
    expect(isWideType('INT')).toBe(false)
    expect(parseAddress('%MW100:8')).toMatchObject({ word: 100, hasTableSuffix: true })
  })

  it('warns about odd 32 bit addresses and invalid addresses', () => {
    const report = validateForExport([
      variable({ id: 'a', name: 'd1', typeName: 'DINT', topologicalAddress: '%MW101' }),
      variable({ id: 'b', name: 'd2', typeName: 'INT', topologicalAddress: '%MW3' }),
      variable({ id: 'c', name: 'd3', typeName: 'INT', topologicalAddress: 'MW100' })
    ])
    expect(report.warnings.some((warning) => warning.includes('奇数'))).toBe(true)
    expect(report.errors.some((error) => error.includes('拓扑地址格式非法'))).toBe(true)
  })
})
