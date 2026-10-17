import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  extractVariableReferences,
  findVariableReferenceAt,
  type ExtractedVariableReference
} from '../src/core/variableReferences'
import { loadExchangeXml } from '../src/actions'
import { state } from '../src/store'

const FIXTURE = readFileSync(resolve(process.cwd(), 'fixtures/ModbusTCP_Client.xdb'), 'utf8')

function summarize(references: ExtractedVariableReference[]): string[] {
  return references.map((reference) => `${reference.name}:${reference.access}@${reference.line}:${reference.column}`)
}

function names(...values: string[]): Set<string> {
  return new Set(values.map((value) => value.toUpperCase()))
}

describe('extractVariableReferences', () => {
  it('records reads, writes and call targets', () => {
    const source = ['xRun := TRUE;', 'iState := xRun;', 'tonRun(IN := xRun, PT := t#2s);'].join('\n')
    const references = extractVariableReferences(source, names('xRun', 'iState', 'tonRun'))
    expect(summarize(references)).toEqual([
      'xRun:write@1:1',
      'iState:write@2:1',
      'xRun:read@2:11',
      'tonRun:call@3:1',
      'xRun:read@3:14'
    ])
  })

  it('ignores comments, strings and typed literals', () => {
    const source = [
      '(* xRun := TRUE; *)',
      "sText := 'xRun := FALSE';",
      'atDate := T#2s;',
      'xRun := TRUE;'
    ].join('\n')
    const references = extractVariableReferences(source, names('xRun', 'sText', 'atDate', 'T'))
    expect(summarize(references)).toEqual(['sText:write@2:1', 'atDate:write@3:1', 'xRun:write@4:1'])
  })

  it('never reports a named binding parameter or a struct/index member as a variable', () => {
    const source = [
      'tonRun(IN := xRun, Q => xDone);',
      'stAddr.Field := 1;',
      'IF tonRun.Q THEN',
      '  xDone := TRUE;',
      'END_IF;'
    ].join('\n')
    const references = extractVariableReferences(
      source,
      names('tonRun', 'xRun', 'xDone', 'stAddr', 'Field', 'IN', 'Q')
    )
    expect(summarize(references)).toEqual([
      'tonRun:call@1:1',
      'xRun:read@1:14',
      'xDone:write@1:25',
      'stAddr:write@2:1',
      'tonRun:read@3:4',
      'xDone:write@4:3'
    ])
    expect(references.some((reference) => reference.name === 'IN')).toBe(false)
    expect(references.some((reference) => reference.name === 'Q')).toBe(false)
    expect(references.some((reference) => reference.name === 'Field')).toBe(false)
  })

  it('keeps writes at statement level while a binding of the same name stays a parameter', () => {
    const source = ['xRun := FALSE;', 'tonRun(IN := xRun);'].join('\n')
    const references = extractVariableReferences(source, names('xRun', 'tonRun', 'IN'))
    expect(summarize(references)).toEqual([
      'xRun:write@1:1',
      'tonRun:call@2:1',
      'xRun:read@2:14'
    ])
  })

  it('includes array subscripts and index variables', () => {
    const source = ['aiGest[0].0 := 1;', 'yRDataBuf[iCopyIdx] := aiBuf[iCopyIdx];'].join('\n')
    const references = extractVariableReferences(
      source,
      names('aiGest', 'yRDataBuf', 'aiBuf', 'iCopyIdx')
    )
    expect(summarize(references)).toEqual([
      'aiGest:write@1:1',
      'yRDataBuf:write@2:1',
      'iCopyIdx:read@2:11',
      'aiBuf:read@2:24',
      'iCopyIdx:read@2:30'
    ])
  })

  it('matches declared names case-insensitively', () => {
    const references = extractVariableReferences('XRUN := xrun + XRun;', names('xRun'))
    expect(references.map((reference) => reference.access)).toEqual(['write', 'read', 'read'])
  })

  it('ignores VAR declaration regions', () => {
    const source = ['VAR_INPUT', '  xRun : BOOL;', 'END_VAR', 'xRun := TRUE;'].join('\n')
    expect(summarize(extractVariableReferences(source, names('xRun')))).toEqual(['xRun:write@4:1'])
  })

  it('returns nothing for an unknown variable and keeps offsets monotonic', () => {
    expect(extractVariableReferences('other := 1;', names('xRun'))).toEqual([])
    const references = extractVariableReferences('xRun := xRun;', names('xRun'))
    expect(references[0].offset).toBeLessThan(references[1].offset)
  })
})

describe('findVariableReferenceAt', () => {
  const source = ['tonRun(IN := xRun);', '(* xRun *)', 'IF tonRun.Q THEN', 'END_IF;'].join('\n')
  const variableNames = names('tonRun', 'xRun', 'Q')

  it('matches the identifier start only', () => {
    expect(findVariableReferenceAt(source, variableNames, 1, 14)?.name).toBe('xRun')
    expect(findVariableReferenceAt(source, variableNames, 1, 1)?.access).toBe('call')
    expect(findVariableReferenceAt(source, variableNames, 1, 16)).toBeNull()
  })

  it('never links a comment word or a struct member', () => {
    expect(findVariableReferenceAt(source, variableNames, 2, 4)).toBeNull()
    expect(findVariableReferenceAt(source, variableNames, 3, 13)).toBeNull()
  })
})

describe('state.variableReferences integration', () => {
  it('is filled by refreshCalls and stays out of state.calls', () => {
    loadExchangeXml(FIXTURE, 'ModbusTCP_Client.xdb')

    expect(state.calls.length).toBeGreaterThan(0)
    expect(state.calls.every((call) => call.reference !== true)).toBe(true)

    const references = state.variableReferences
    expect(references.length).toBeGreaterThan(0)
    expect(references.every((reference) => reference.reference === true)).toBe(true)
    expect(references.every((reference) => reference.kind === 'variable')).toBe(true)
    expect(references.every((reference) => reference.targetId !== '')).toBe(true)

    const rtExecute = references.filter((reference) => reference.targetName === 'rtExecute')
    expect(rtExecute.map((reference) => reference.access)).toContain('call')
    expect(rtExecute.map((reference) => reference.access)).toContain('read')

    // `stAddr` is written by the ADDMX call result...
    expect(
      references.some(
        (reference) => reference.targetName === 'stAddr' && reference.access === 'write'
      )
    ).toBe(true)
    // ...and never the member or the formal parameter names.
    expect(references.some((reference) => reference.name.toUpperCase() === 'Q')).toBe(false)
    expect(references.some((reference) => reference.name.toUpperCase() === 'ADR')).toBe(false)
    expect(references.some((reference) => reference.name.toUpperCase() === 'GEST')).toBe(false)
    expect(references.some((reference) => reference.name.toUpperCase() === 'RECP')).toBe(false)
  })
})
